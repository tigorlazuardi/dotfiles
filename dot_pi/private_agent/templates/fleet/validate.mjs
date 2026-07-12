#!/usr/bin/env node
// Zero-dependency structural + graph validator for fleet run directories.
// Usage: node validate.mjs <path-to-run-dir>
//
// Run dir layout expected:
//   <run-dir>/fleet.json
//   <run-dir>/<statePath ...>   (per fleet.json dags[].statePath, e.g. dags/<id>/state.json)
//
// Not a full JSON Schema implementation — schema files (fleet.schema.json /
// state.schema.json) remain the source of truth / feed an external ajv later.
// This script checks required fields, enums, types, and cross-file invariants
// that a pure schema can't express cheaply (graph cycles, file existence,
// routing.worker/reviewer class validity + low-tolerance safety floor,
// branch-naming convention).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const errors = [];

function err(file, path, msg) {
  errors.push(`${file}${path ? ': ' + path : ''}: ${msg}`);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isBool = (v) => typeof v === 'boolean';
const isInt = (v) => Number.isInteger(v);
const isNullOr = (v, fn) => v === null || fn(v);

function req(obj, keys, file, ctx) {
  for (const k of keys) {
    if (!(k in obj)) err(file, ctx, `missing required field "${k}"`);
  }
}

// --- shared audit span (OTel-span-shaped) ---
function validateAuditSpan(span, file, ctx) {
  if (!isObj(span)) { err(file, ctx, 'must be an object'); return; }
  req(span, ['role', 'agentType', 'model', 'agentId', 'startedAt', 'endedAt', 'status', 'error', 'summary', 'attributes'], file, ctx);
  const roleEnum = ['worker', 'reviewer', 'judge', 'orchestrator', 'steering'];
  if ('role' in span && !roleEnum.includes(span.role)) err(file, `${ctx}.role`, `must be one of ${roleEnum.join('|')}, got ${JSON.stringify(span.role)}`);
  if ('status' in span && !['ok', 'error'].includes(span.status)) err(file, `${ctx}.status`, `must be ok|error, got ${JSON.stringify(span.status)}`);
  if ('endedAt' in span && !isNullOr(span.endedAt, isStr)) err(file, `${ctx}.endedAt`, 'must be string or null');
  if ('attributes' in span && !isObj(span.attributes)) err(file, `${ctx}.attributes`, 'must be an object');
  if ('error' in span && !isNullOr(span.error, isStr)) err(file, `${ctx}.error`, 'must be string or null');
  // invariant: error != null <=> status == "error"
  if ('status' in span && 'error' in span) {
    const hasError = span.error !== null && span.error !== undefined;
    if (span.status === 'error' && !hasError) err(file, ctx, 'status:"error" requires non-null error');
    if (span.status !== 'error' && hasError) err(file, ctx, `status:${JSON.stringify(span.status)} requires null error, got non-null`);
  }
}

function validateAuditArray(arr, file, ctx) {
  if (!Array.isArray(arr)) { err(file, ctx, 'must be an array'); return; }
  arr.forEach((span, i) => validateAuditSpan(span, file, `${ctx}[${i}]`));
}

// --- generic cycle detection over an id -> dependsOn[] graph ---
function findCycle(nodeIds, depsOf) {
  const state = new Map(); // 0/undefined unvisited, 1 visiting, 2 done
  let cyclePath = null;

  function visit(id, stack) {
    if (cyclePath) return;
    state.set(id, 1);
    stack.push(id);
    for (const dep of depsOf(id) || []) {
      if (!nodeIds.has(dep)) continue; // unresolved deps reported separately
      const st = state.get(dep);
      if (st === 1) { cyclePath = [...stack, dep]; return; }
      if (st !== 2) visit(dep, stack);
      if (cyclePath) return;
    }
    stack.pop();
    state.set(id, 2);
  }

  for (const id of nodeIds) {
    if (state.get(id) !== 2) visit(id, []);
    if (cyclePath) break;
  }
  return cyclePath;
}

// --- fleet.json ---
function validateFleet(fleet, file) {
  if (!isObj(fleet)) { err(file, null, 'root must be an object'); return; }
  req(fleet, ['meta', 'git', 'dags', 'stopFlag'], file, null);

  if (isObj(fleet.meta)) {
    req(fleet.meta, ['runName', 'schemaVersion', 'createdAt', 'baseBranch', 'integrationBranch', 'maxConcurrent'], file, 'meta');
    if ('runName' in fleet.meta && !isStr(fleet.meta.runName)) err(file, 'meta.runName', 'must be a string');
    if ('schemaVersion' in fleet.meta && !isInt(fleet.meta.schemaVersion)) err(file, 'meta.schemaVersion', 'must be an integer');
    if ('maxConcurrent' in fleet.meta && !isInt(fleet.meta.maxConcurrent)) err(file, 'meta.maxConcurrent', 'must be an integer');
    if (isStr(fleet.meta.runName) && isStr(fleet.meta.integrationBranch)) {
      const expected = `fleet/${fleet.meta.runName}/int`;
      if (fleet.meta.integrationBranch !== expected) {
        err(file, 'meta.integrationBranch', `must match "fleet/<run>/int" — expected "${expected}", got "${fleet.meta.integrationBranch}"`);
      }
    }
  } else err(file, 'meta', 'must be an object');

  if (isObj(fleet.git)) {
    req(fleet.git, ['remote', 'webTemplate'], file, 'git');
  } else err(file, 'git', 'must be an object');

  if (Array.isArray(fleet.dags)) {
    const statusEnum = ['pending', 'running', 'passed', 'failed'];
    const verdictEnum = [null, 'pass', 'fail', 'needs-fix'];
    fleet.dags.forEach((dag, i) => {
      const ctx = `dags[${i}]`;
      if (!isObj(dag)) { err(file, ctx, 'must be an object'); return; }
      req(dag, ['id', 'ref', 'title', 'statePath', 'dependsOn', 'status', 'judge', 'attributes', 'audit'], file, ctx);
      if ('status' in dag && !statusEnum.includes(dag.status)) err(file, `${ctx}.status`, `must be one of ${statusEnum.join('|')}, got ${JSON.stringify(dag.status)}`);
      if ('dependsOn' in dag && !Array.isArray(dag.dependsOn)) err(file, `${ctx}.dependsOn`, 'must be an array');
      if (isObj(dag.judge)) {
        req(dag.judge, ['verdict', 'attempt'], file, `${ctx}.judge`);
        if ('verdict' in dag.judge && !verdictEnum.includes(dag.judge.verdict)) err(file, `${ctx}.judge.verdict`, 'must be one of null|pass|fail|needs-fix');
        if ('attempt' in dag.judge && !isInt(dag.judge.attempt)) err(file, `${ctx}.judge.attempt`, 'must be an integer');
      } else err(file, `${ctx}.judge`, 'must be an object');
      if ('attributes' in dag && !isObj(dag.attributes)) err(file, `${ctx}.attributes`, 'must be an object (map<string,string>)');
      validateAuditArray(dag.audit, file, `${ctx}.audit`);
    });
  } else err(file, 'dags', 'must be an array');

  if (isObj(fleet.stopFlag)) {
    req(fleet.stopFlag, ['stopped', 'reason', 'stoppedAt'], file, 'stopFlag');
    if ('stopped' in fleet.stopFlag && !isBool(fleet.stopFlag.stopped)) err(file, 'stopFlag.stopped', 'must be a boolean');
  } else err(file, 'stopFlag', 'must be an object');
}

// --- state.json (one DAG) ---
function validateState(state, file, dagId, fleetRunName) {
  if (!isObj(state)) { err(file, null, 'root must be an object'); return; }
  req(state, ['meta', 'tracker', 'nodes', 'stopFlag'], file, null);

  if (isObj(state.meta)) {
    req(state.meta, ['runName', 'schemaVersion', 'specRef', 'standardsRef', 'baseBranch', 'integrationBranch'], file, 'meta');
    if (isStr(state.meta.runName) && isStr(fleetRunName) && state.meta.runName !== fleetRunName) {
      err(file, 'meta.runName', `does not match fleet.json meta.runName ("${fleetRunName}")`);
    }
    if (isStr(state.meta.runName) && isStr(state.meta.integrationBranch)) {
      const expected = `fleet/${state.meta.runName}/int`;
      if (state.meta.integrationBranch !== expected) {
        err(file, 'meta.integrationBranch', `must match "fleet/<run>/int" — expected "${expected}", got "${state.meta.integrationBranch}"`);
      }
    }
  } else err(file, 'meta', 'must be an object');

  if (isObj(state.tracker)) {
    req(state.tracker, ['type', 'supportsBlocking'], file, 'tracker');
  } else err(file, 'tracker', 'must be an object');

  const nodeIds = new Set();
  const nodeDeps = new Map();

  if (Array.isArray(state.nodes)) {
    const toleranceEnum = ['low', 'standard', 'trivial'];
    const nodeStatusEnum = ['pending', 'running', 'review', 'fixing', 'passed', 'failed'];
    const acceptanceEnum = [null, 'pass', 'fail'];

    state.nodes.forEach((node, i) => {
      const ctx = `nodes[${i}]`;
      if (!isObj(node)) { err(file, ctx, 'must be an object'); return; }
      req(node, ['id', 'ticket', 'dependsOn', 'routing', 'runtime', 'sync', 'attributes', 'audit'], file, ctx);

      if (isStr(node.id)) {
        nodeIds.add(node.id);
        nodeDeps.set(node.id, Array.isArray(node.dependsOn) ? node.dependsOn : []);
      }

      if (isObj(node.ticket)) req(node.ticket, ['ref', 'title'], file, `${ctx}.ticket`);
      else err(file, `${ctx}.ticket`, 'must be an object');

      if ('dependsOn' in node && !Array.isArray(node.dependsOn)) err(file, `${ctx}.dependsOn`, 'must be an array');

      if (isObj(node.routing)) {
        req(node.routing, ['failureTolerance', 'worker', 'reviewer', 'checkCommand'], file, `${ctx}.routing`);
        if ('failureTolerance' in node.routing && !toleranceEnum.includes(node.routing.failureTolerance)) {
          err(file, `${ctx}.routing.failureTolerance`, `must be one of ${toleranceEnum.join('|')}`);
        }
        if ('checkCommand' in node.routing && (!isStr(node.routing.checkCommand) || node.routing.checkCommand.trim() === '')) {
          err(file, `${ctx}.routing.checkCommand`, 'must be a non-empty string');
        }
        const classEnum = ['worker', 'frontier'];
        if ('worker' in node.routing && !classEnum.includes(node.routing.worker)) {
          err(file, `${ctx}.routing.worker`, `must be a class, one of ${classEnum.join('|')} (resolved to a concrete agent at spawn), got ${JSON.stringify(node.routing.worker)}`);
        }
        if ('reviewer' in node.routing && !classEnum.includes(node.routing.reviewer)) {
          err(file, `${ctx}.routing.reviewer`, `must be a class, one of ${classEnum.join('|')} (resolved to a concrete agent at spawn), got ${JSON.stringify(node.routing.reviewer)}`);
        }
        if (node.routing.failureTolerance === 'low' && (node.routing.worker !== 'frontier' || node.routing.reviewer !== 'frontier')) {
          err(file, `${ctx}.routing`, `failureTolerance:"low" requires worker:"frontier" and reviewer:"frontier" (safety floor), got worker:${JSON.stringify(node.routing.worker)} reviewer:${JSON.stringify(node.routing.reviewer)}`);
        }
      } else err(file, `${ctx}.routing`, 'must be an object');

      if (isObj(node.runtime)) {
        req(node.runtime, ['status', 'fixAttempt', 'handoverAttempt', 'branch', 'commitSha', 'acceptanceResult', 'agentId'], file, `${ctx}.runtime`);
        if ('status' in node.runtime && !nodeStatusEnum.includes(node.runtime.status)) {
          err(file, `${ctx}.runtime.status`, `must be one of ${nodeStatusEnum.join('|')}`);
        }
        if ('acceptanceResult' in node.runtime && !acceptanceEnum.includes(node.runtime.acceptanceResult)) {
          err(file, `${ctx}.runtime.acceptanceResult`, 'must be null|pass|fail');
        }
        if ('commitSha' in node.runtime && !isNullOr(node.runtime.commitSha, isStr)) err(file, `${ctx}.runtime.commitSha`, 'must be string or null');
        if ('agentId' in node.runtime && !isNullOr(node.runtime.agentId, isStr)) err(file, `${ctx}.runtime.agentId`, 'must be string or null');
        if (isStr(node.runtime.branch) && isStr(state.meta?.runName) && isStr(node.id)) {
          const expected = `fleet/${state.meta.runName}/task/${dagId}/${node.id}`;
          if (node.runtime.branch !== expected) {
            err(file, `${ctx}.runtime.branch`, `must match "fleet/<run>/task/<dagId>/<taskId>" — expected "${expected}", got "${node.runtime.branch}"`);
          }
        }
      } else err(file, `${ctx}.runtime`, 'must be an object');

      if (isObj(node.sync)) req(node.sync, ['mirrored', 'pushed'], file, `${ctx}.sync`);
      else err(file, `${ctx}.sync`, 'must be an object');

      if ('attributes' in node && !isObj(node.attributes)) err(file, `${ctx}.attributes`, 'must be an object');

      validateAuditArray(node.audit, file, `${ctx}.audit`);
    });

    state.nodes.forEach((node, i) => {
      if (!isObj(node) || !Array.isArray(node.dependsOn)) return;
      for (const dep of node.dependsOn) {
        if (!nodeIds.has(dep)) err(file, `nodes[${i}].dependsOn`, `unresolved node id "${dep}"`);
      }
    });

    const cycle = findCycle(nodeIds, (id) => nodeDeps.get(id));
    if (cycle) err(file, 'nodes[].dependsOn', `cycle detected: ${cycle.join(' -> ')}`);
  } else err(file, 'nodes', 'must be an array');

  if (isObj(state.stopFlag)) req(state.stopFlag, ['stopped', 'reason', 'stoppedAt'], file, 'stopFlag');
  else err(file, 'stopFlag', 'must be an object');
}

function main() {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node validate.mjs <path-to-run-dir>');
    process.exit(1);
  }

  const fleetPath = join(runDir, 'fleet.json');
  if (!existsSync(fleetPath)) {
    console.error(`fleet.json not found at ${fleetPath}`);
    process.exit(1);
  }

  let fleet;
  try {
    fleet = JSON.parse(readFileSync(fleetPath, 'utf8'));
  } catch (e) {
    console.error(`fleet.json: invalid JSON: ${e.message}`);
    process.exit(1);
  }

  validateFleet(fleet, 'fleet.json');

  const dagIds = new Set();
  const dagDeps = new Map();

  if (isObj(fleet) && Array.isArray(fleet.dags)) {
    for (const dag of fleet.dags) {
      if (!isObj(dag) || !isStr(dag.id)) continue;
      dagIds.add(dag.id);
      dagDeps.set(dag.id, Array.isArray(dag.dependsOn) ? dag.dependsOn : []);

      if (!isStr(dag.statePath)) continue;
      const statePath = join(runDir, dag.statePath);
      if (!existsSync(statePath)) {
        err('fleet.json', `dags[id=${dag.id}].statePath`, `file not found: ${dag.statePath}`);
        continue;
      }

      let state;
      try {
        state = JSON.parse(readFileSync(statePath, 'utf8'));
      } catch (e) {
        err(dag.statePath, null, `invalid JSON: ${e.message}`);
        continue;
      }

      validateState(state, dag.statePath, dag.id, fleet.meta && fleet.meta.runName);
    }

    for (const dag of fleet.dags) {
      if (!isObj(dag) || !Array.isArray(dag.dependsOn)) continue;
      for (const dep of dag.dependsOn) {
        if (!dagIds.has(dep)) err('fleet.json', `dags[id=${dag.id}].dependsOn`, `unresolved dag id "${dep}"`);
      }
    }

    const cycle = findCycle(dagIds, (id) => dagDeps.get(id));
    if (cycle) err('fleet.json', 'dags[].dependsOn', `cycle detected: ${cycle.join(' -> ')}`);
  }

  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} error(s)`);
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }

  console.log('OK: all checks passed');
  process.exit(0);
}

main();
