import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CACHE_DIR = path.join(os.homedir(), ".pi", "agent", ".cache", "docs-nudge");

const SITE_DIRS = ["docs", "docs-site"];
const ASTRO_CONFIGS = ["astro.config.mjs", "astro.config.ts", "astro.config.js"];

const NUDGE =
  "DESIGN-DOCS CHECK (one-time, automated): this session changed source files but did not " +
  "touch the docs site content (docs/src/content/**). Evaluate the conversation: did a design " +
  "decision, architecture change, or lesson worth publishing happen? If YES: offer one line — " +
  '"Update design docs?" — and on approval follow the astro-docs-authoring skill (or ' +
  "report-authoring for a lesson-learnt/error report). If NO (routine/mechanical work only): " +
  "just finish your turn. Do not re-evaluate later; this fires once per session.";

interface NudgeState {
  baselines: Record<string, string>;
  nudged: boolean;
}

function git(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trimEnd();
  } catch {
    return null;
  }
}

function gitRepoRoot(cwd: string): string | null {
  const out = git(cwd, ["rev-parse", "--show-toplevel"]);
  return out ? out.trim() : null;
}

function gitHead(cwd: string): string | null {
  const out = git(cwd, ["rev-parse", "HEAD"]);
  return out ? out.trim() : null;
}

function findSiteDir(root: string): string | null {
  for (const d of SITE_DIRS) {
    for (const cfg of ASTRO_CONFIGS) {
      try {
        if (fs.statSync(path.join(root, d, cfg)).isFile()) {
          return d;
        }
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

function changedFiles(root: string, baseline: string): string[] {
  const files = new Set<string>();
  const diff = git(root, ["diff", "--name-only", `${baseline}..HEAD`]);
  if (diff) {
    for (const line of diff.split("\n")) {
      if (line.trim()) files.add(line.trim());
    }
  }
  // -uall: without it untracked dirs collapse to "?? docs/src/" and path-prefix
  // matching against docs/src/content/ silently breaks.
  const status = git(root, ["status", "--porcelain", "-uall"]);
  if (status) {
    for (const line of status.split("\n")) {
      if (line.length > 3) {
        // rename entries: "R  old -> new" — take the new path
        const p = line.slice(3).split(" -> ").pop();
        if (p && p.trim()) files.add(p.trim());
      }
    }
  }
  return [...files];
}

function sanitizeSessionId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, "") || "unknown";
}

function getSessionId(ctx: any): string {
  try {
    const id = ctx?.sessionManager?.getSessionId?.();
    return typeof id === "string" && id.length > 0 ? sanitizeSessionId(id) : "unknown";
  } catch {
    return "unknown";
  }
}

function loadState(statePath: string): NudgeState {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    return JSON.parse(raw) as NudgeState;
  } catch {
    return { baselines: {}, nudged: false };
  }
}

function saveState(statePath: string, state: NudgeState): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state), "utf8");
  } catch {
    // fail open
  }
}

export default function (pi: ExtensionAPI) {
  let rootSession = false;

  pi.on("session_start", (_event, ctx) => {
    try {
      if ((ctx as any)?.hasUI !== true) {
        return;
      }
      rootSession = true;

      const cwd: string = (ctx as any).cwd ?? process.cwd();
      const root = gitRepoRoot(cwd);
      if (!root) {
        return;
      }

      const head = gitHead(root);
      if (!head) {
        return;
      }

      const sessionId = getSessionId(ctx);
      const statePath = path.join(CACHE_DIR, `${sessionId}.state`);
      const state = loadState(statePath);
      state.baselines[root] = head;
      saveState(statePath, state);
    } catch {
      // fail open
    }
  });

  pi.on("agent_end", (_event, ctx) => {
    try {
      if (!rootSession) {
        return;
      }

      const cwd: string = (ctx as any).cwd ?? process.cwd();
      const root = gitRepoRoot(cwd);
      if (!root) {
        return;
      }

      const siteDir = findSiteDir(root);
      if (!siteDir) {
        return; // no docs site in this repo — stay silent
      }

      const sessionId = getSessionId(ctx);
      const statePath = path.join(CACHE_DIR, `${sessionId}.state`);
      const state = loadState(statePath);

      if (state.nudged) {
        return;
      }

      const baseline = state.baselines[root];
      if (!baseline) {
        // first sight of this repo — record baseline, don't nudge yet
        const head = gitHead(root);
        if (head) {
          state.baselines[root] = head;
          saveState(statePath, state);
        }
        return;
      }

      const files = changedFiles(root, baseline);
      if (files.length === 0) {
        return;
      }

      const sitePrefix = `${siteDir}/`;
      const contentPrefix = `${siteDir}/src/content/`;
      const sourceChanged = files.some((f) => !f.startsWith(sitePrefix));
      const docsTouched = files.some((f) => f.startsWith(contentPrefix));

      if (!sourceChanged || docsTouched) {
        return;
      }

      state.nudged = true;
      saveState(statePath, state);

      pi.sendMessage(
        {
          customType: "docs-nudge",
          content: NUDGE,
          display: true,
        },
        {
          deliverAs: "followUp",
          triggerTurn: true,
        }
      );
    } catch {
      // fail open
    }
  });
}
