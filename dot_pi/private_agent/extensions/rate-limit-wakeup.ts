// rate-limit-wakeup: detects provider rate-limit/quota conditions and
// schedules a follow-up message that resumes the interrupted task once the
// cooldown has passed. Two independent detection paths feed the same
// scheduler:
//
//   - after_provider_response: fires for every provider HTTP response,
//     before the stream body is consumed. On a 429 we parse the wake time
//     directly from known rate-limit response headers (retry-after,
//     x-ratelimit-reset, etc). This is the primary, most reliable path.
//   - agent_end: fallback for providers/transports that don't expose
//     headers (or errors surfaced only as text). Parses "reset after ..."
//     style phrasing out of the error message.
//
// State is persisted to a global JSON file under ~/.pi/agent/.cache so a
// pending wake survives /reload and full process restarts: session_start
// re-reads the file, reschedules the remaining delay, or fires immediately
// if the wake time already passed while pi was not running.
//
// This extension is intentionally not session-scoped (the state file is
// global, not per-project or per-session) because the request asked for a
// single global wakeup timer. If multiple pi processes hit rate limits
// concurrently, the state file simply reflects whichever one wrote last —
// documented caveat, not a bug.
//
// Scope tagging: state is still a single global timer (one wakeAt, one
// in-process setTimeout), but each detection is tagged with a dynamic
// `scopeGlob` derived from the *current session's* model at detection time
// (ctx.model.provider + ctx.model.id, with the final "/"-delimited segment
// replaced by "*" — e.g. `omniroute/cx/gpt-5.4` -> `omniroute/cx/*`,
// `anthropic/claude-sonnet-5` -> `anthropic/*`). There is no hardcoded
// model/provider allow-list anywhere in this file. Because there is still
// only one timer, a rate limit on one scope and a rate limit on an unrelated
// scope cannot both be tracked precisely at once — see upsertState() for the
// documented "earliest wakeAt wins" tie-break this implies.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const STATE_DIR = path.join(os.homedir(), ".pi", "agent", ".cache", "rate-limit-wakeup");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const STATE_VERSION = 1;

// Safety buffer added on top of the parsed reset duration so we don't wake
// up a few seconds before the provider actually lifts the limit.
const SAFETY_BUFFER_MS = 60_000;

// Node's setTimeout silently overflows for delays beyond ~24.8 days
// (2^31-1 ms). For that unlikely case we schedule an intermediate wake and
// recompute the remaining delay when it fires, rather than firing early.
const MAX_TIMEOUT_MS = 2_147_483_000;

type WakeStatus = "pending" | "fired" | "cancelled";

interface WakeState {
  version: number;
  status: WakeStatus;
  wakeAt: string; // ISO timestamp
  delayMs: number; // total delay from detection to wakeAt (including buffer)
  sourceExcerpt: string; // trimmed excerpt of the error text that triggered this
  // Dynamic scope info, computed from ctx.model at detection time (see
  // computeModelRef / computeScopeGlob below). Both are optional and were
  // added after STATE_VERSION 1 shipped: old on-disk state files (and any
  // state written by a not-yet-upgraded pi process) simply won't have them,
  // which is fine since every consumer treats them as optional. No version
  // bump/migration needed for this.
  modelRef?: string; // e.g. "omniroute/cx/gpt-5.4"
  scopeGlob?: string; // e.g. "omniroute/cx/*"
  sessionId?: string;
  sessionFile?: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

// --- rate limit / duration parsing -----------------------------------------

const RATE_LIMIT_INDICATOR = /rate.?limit|quota|429|too many requests/i;

// Looks for "reset after ...", "retry after ...", "resets in ...", "retry in ...",
// "try again in ..." followed by an h/m/s duration, case-insensitive.
const DURATION_KEYWORD = /(?:reset|resets|retry)\s+(?:after|in)\s+|try\s+again\s+in\s+/i;

const HOURS_RE = /(\d+)\s*h(?:ours?|rs?)?\b/i;
const MINUTES_RE = /(\d+)\s*m(?:in(?:ute)?s?)?\b/i;
const SECONDS_RE = /(\d+)\s*s(?:ec(?:ond)?s?)?\b/i;

// Window of text scanned for h/m/s tokens after the duration keyword. Real
// messages are short, so this stays well clear of unrelated numbers further
// along in the string.
const DURATION_WINDOW = 60;

interface ParsedRateLimit {
  delayMs: number;
  excerpt: string;
}

function parseDurationMs(window: string): number | null {
  let totalMs = 0;
  let matched = false;

  const hours = window.match(HOURS_RE);
  if (hours) {
    totalMs += Number.parseInt(hours[1], 10) * 3_600_000;
    matched = true;
  }
  const minutes = window.match(MINUTES_RE);
  if (minutes) {
    totalMs += Number.parseInt(minutes[1], 10) * 60_000;
    matched = true;
  }
  const seconds = window.match(SECONDS_RE);
  if (seconds) {
    totalMs += Number.parseInt(seconds[1], 10) * 1_000;
    matched = true;
  }

  if (!matched || totalMs <= 0) {
    return null;
  }
  return totalMs;
}

/**
 * Detects a rate-limit/quota error and extracts a reset duration.
 * Returns null when the text doesn't look like a rate limit error, or a
 * rate limit is mentioned but no parseable duration is present.
 */
function parseRateLimitError(errorMessage: string): ParsedRateLimit | null {
  if (!errorMessage || !RATE_LIMIT_INDICATOR.test(errorMessage)) {
    return null;
  }

  const keywordMatch = errorMessage.match(DURATION_KEYWORD);
  if (!keywordMatch || keywordMatch.index === undefined) {
    return null;
  }

  const windowStart = keywordMatch.index + keywordMatch[0].length;
  const window = errorMessage.slice(windowStart, windowStart + DURATION_WINDOW);
  const durationMs = parseDurationMs(window);
  if (durationMs === null) {
    return null;
  }

  return {
    delayMs: durationMs + SAFETY_BUFFER_MS,
    excerpt: errorMessage.slice(0, 400),
  };
}

// --- provider response (429) header parsing --------------------------------

// Known rate-limit response headers, in priority order (most precise/direct
// first). Only these are ever read or included in the persisted excerpt —
// we deliberately never dump the full header set, to avoid leaking cookies,
// auth, or other sensitive response headers into on-disk state.
const RATE_LIMIT_HEADER_NAMES = [
  "retry-after-ms",
  "x-retry-after-ms",
  "retry-after",
  "x-ratelimit-reset-after",
  "x-rate-limit-reset-after",
  "reset-after",
  "x-ratelimit-reset",
  "x-rate-limit-reset",
];

const NUMERIC_RE = /^\d+(?:\.\d+)?$/;

function getHeaderCaseInsensitive(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

// Parses a duration out of freeform header text, reusing the same h/m/s
// scanning logic as the agent_end message parser. Tries the "reset after"
// style keyword window first (in case a provider echoes message-like text
// into a header), then falls back to scanning the raw value directly since
// header values are short and rarely contain unrelated numbers.
function parseFreeformDurationMs(text: string): number | null {
  const keywordMatch = text.match(DURATION_KEYWORD);
  if (keywordMatch && keywordMatch.index !== undefined) {
    const windowStart = keywordMatch.index + keywordMatch[0].length;
    const window = text.slice(windowStart, windowStart + DURATION_WINDOW);
    const fromKeyword = parseDurationMs(window);
    if (fromKeyword !== null) {
      return fromKeyword;
    }
  }
  return parseDurationMs(text.slice(0, DURATION_WINDOW));
}

// Parses a single rate-limit header's value into a millisecond delay from
// now. Interpretation depends on both the header name (which unit/format a
// header conventionally uses) and the value's shape (numeric vs date vs
// freeform text), since providers are inconsistent here.
function parseHeaderDelayMs(headerName: string, rawValue: string): number | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }
  const lowerName = headerName.toLowerCase();

  if (NUMERIC_RE.test(value)) {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }

    if (lowerName.includes("-ms")) {
      // retry-after-ms / x-retry-after-ms: already a millisecond delta.
      return n;
    }
    if (lowerName === "retry-after") {
      // RFC 7231: retry-after numeric value is a seconds delta.
      return n * 1_000;
    }
    if (lowerName.includes("reset-after")) {
      // x-ratelimit-reset-after / x-rate-limit-reset-after / reset-after:
      // seconds delta by convention (GitHub, Discord, etc).
      return n * 1_000;
    }
    if (lowerName.includes("reset")) {
      // x-ratelimit-reset / x-rate-limit-reset: absolute reset timestamp,
      // as unix seconds or unix milliseconds depending on magnitude. A
      // small value (below the unix-seconds range) is ambiguous but most
      // commonly means "seconds until reset", so treat it as a delta.
      const nowMs = Date.now();
      if (n >= 1e12) {
        return n - nowMs;
      }
      if (n >= 1e9) {
        return n * 1_000 - nowMs;
      }
      return n * 1_000;
    }
    // Unrecognized numeric convention: default to seconds delta.
    return n * 1_000;
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    return parsedDate - Date.now();
  }

  return parseFreeformDurationMs(value);
}

/**
 * Parses a wake delay directly out of a 429 provider response's headers.
 * Checks known rate-limit headers in priority order and returns the first
 * one that yields a usable positive delay. Returns null when no known
 * rate-limit header is present or none parse to a usable delay.
 */
function parseProviderRateLimit(headers: Record<string, string> | undefined | null): ParsedRateLimit | null {
  if (!headers || typeof headers !== "object") {
    return null;
  }

  const present: Array<[string, string]> = [];
  for (const name of RATE_LIMIT_HEADER_NAMES) {
    const value = getHeaderCaseInsensitive(headers, name);
    if (value !== undefined) {
      present.push([name, value]);
    }
  }
  if (present.length === 0) {
    return null;
  }

  let delayMs: number | null = null;
  for (const [name, value] of present) {
    const parsed = parseHeaderDelayMs(name, value);
    if (parsed !== null && Number.isFinite(parsed) && parsed > 0) {
      delayMs = parsed;
      break;
    }
  }
  if (delayMs === null) {
    return null;
  }

  // Only known rate-limit headers are ever included here, never the full
  // header set (see RATE_LIMIT_HEADER_NAMES comment above).
  const excerpt = `provider response 429; ${present.map(([name, value]) => `${name}=${value}`).join("; ")}`;

  return {
    delayMs: delayMs + SAFETY_BUFFER_MS,
    excerpt: excerpt.slice(0, 400),
  };
}

// --- dynamic rate-limit scope ------------------------------------------------

// Builds a "provider/id" model reference from the session's current model.
// Deliberately reads ctx.model live at detection time rather than caching it
// anywhere — there is no hardcoded model or provider name in this file.
// Returns undefined when no model is selected, or when either half is empty
// (should not normally happen, but we never want to fabricate a ref).
function computeModelRef(ctx: ExtensionContext): string | undefined {
  try {
    const model = ctx.model;
    if (!model || typeof model.provider !== "string" || typeof model.id !== "string") {
      return undefined;
    }
    if (model.provider.length === 0 || model.id.length === 0) {
      return undefined;
    }
    return `${model.provider}/${model.id}`;
  } catch {
    return undefined;
  }
}

// Derives a rate-limit scope glob from a model ref by replacing only the
// final "/"-delimited segment with "*". This generalizes just far enough to
// cover "same model family, different specific model id" rate limits without
// guessing at provider-specific grouping rules:
//   omniroute/cx/gpt-5.4        -> omniroute/cx/*
//   openrouter/openai/gpt-5.4   -> openrouter/openai/*
//   anthropic/claude-sonnet-5   -> anthropic/*
// Safest-behavior choice for the missing-slash case: a modelRef we build
// ourselves is always "provider/id" (see computeModelRef above) so it should
// always contain at least one "/". If it somehow doesn't, we treat the ref
// as opaque and return undefined rather than fabricating a scope like
// "unknown/*" that could accidentally overlap with a real provider named
// "unknown" — callers already handle an undefined scopeGlob (state.scopeGlob
// is optional; the wakeup still works, it's just untagged).
function computeScopeGlob(modelRef: string | undefined): string | undefined {
  if (!modelRef) {
    return undefined;
  }
  const lastSlash = modelRef.lastIndexOf("/");
  if (lastSlash === -1) {
    return undefined;
  }
  return `${modelRef.slice(0, lastSlash)}/*`;
}

// Turns a scopeGlob (as produced by computeScopeGlob) into a RegExp, for
// display/overlap checks only — e.g. telling the user in /rate-limit-wakeup
// whether the model they're currently on falls inside the scope that's
// currently rate-limited. Not used for any dedupe/scheduling decision.
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesScope(scopeGlob: string | undefined, modelRef: string | undefined): boolean {
  if (!scopeGlob || !modelRef) {
    return false;
  }
  try {
    return globToRegExp(scopeGlob).test(modelRef);
  } catch {
    return false;
  }
}

function loadState(): WakeState | null {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as WakeState;
    if (!parsed || typeof parsed !== "object" || parsed.version !== STATE_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: WakeState): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // fail open: an unpersisted timer still fires for this process's lifetime.
  }
}

function safeSessionId(ctx: ExtensionContext): string | undefined {
  try {
    const id = ctx.sessionManager?.getSessionId?.();
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

function safeSessionFile(ctx: ExtensionContext): string | undefined {
  try {
    const file = ctx.sessionManager?.getSessionFile?.();
    return typeof file === "string" && file.length > 0 ? file : undefined;
  } catch {
    return undefined;
  }
}

// --- formatting ---------------------------------------------------------------

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  if (h === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

// --- extension -----------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let statusTicker: ReturnType<typeof setInterval> | undefined;
  let lastCtx: ExtensionContext | undefined;

  function clearTimers(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (statusTicker) {
      clearInterval(statusTicker);
      statusTicker = undefined;
    }
  }

  function setFooterStatus(state: WakeState | undefined): void {
    try {
      if (!lastCtx?.hasUI) {
        return;
      }
      if (!state || state.status !== "pending") {
        lastCtx.ui.setStatus("rate-limit-wakeup", undefined);
        return;
      }
      const remaining = new Date(state.wakeAt).getTime() - Date.now();
      lastCtx.ui.setStatus("rate-limit-wakeup", `⏰ rate limit wake ${formatRemaining(remaining)}`);
    } catch {
      // fail open
    }
  }

  function startStatusTicker(state: WakeState): void {
    if (statusTicker) {
      clearInterval(statusTicker);
    }
    setFooterStatus(state);
    statusTicker = setInterval(() => setFooterStatus(loadState() ?? undefined), 30_000);
    statusTicker.unref?.();
  }

  function buildResumeMessage(state: WakeState): string {
    const lines = [
      "Rate limit reset timer fired. Continue from the interrupted task.",
      "First check current status/output, then resume safely.",
      "",
      `Original rate limit error: ${state.sourceExcerpt}`,
      `Scheduled wake: ${state.wakeAt}`,
      `Working directory: ${state.cwd}`,
    ];
    if (state.scopeGlob) {
      lines.push(`Rate-limited scope: ${state.scopeGlob}${state.modelRef ? ` (detected on ${state.modelRef})` : ""}`);
    } else if (state.modelRef) {
      lines.push(`Detected on model: ${state.modelRef}`);
    }
    if (state.sessionFile) {
      lines.push(`Session file: ${state.sessionFile}`);
    } else if (state.sessionId) {
      lines.push(`Session id: ${state.sessionId}`);
    }
    return lines.join("\n");
  }

  function fireWake(): void {
    try {
      const state = loadState();
      if (!state || state.status !== "pending") {
        clearTimers();
        return;
      }

      state.status = "fired";
      state.updatedAt = new Date().toISOString();
      saveState(state);
      clearTimers();
      setFooterStatus(state);

      pi.sendUserMessage(buildResumeMessage(state), { deliverAs: "followUp" });
    } catch {
      // fail open: best-effort extension must not throw out of a timer callback.
    }
  }

  function scheduleWake(state: WakeState): void {
    clearTimers();

    const delay = new Date(state.wakeAt).getTime() - Date.now();
    if (delay <= 0) {
      fireWake();
      return;
    }

    const clamped = Math.min(delay, MAX_TIMEOUT_MS);
    timer = setTimeout(() => {
      timer = undefined;
      if (clamped < delay) {
        // Long delay beyond Node's max timeout: re-check and reschedule the
        // remaining time instead of firing early.
        const current = loadState();
        if (current && current.status === "pending") {
          scheduleWake(current);
        }
        return;
      }
      fireWake();
    }, clamped);
    timer.unref?.();

    startStatusTicker(state);
  }

  function upsertState(ctx: ExtensionContext, parsed: ParsedRateLimit): void {
    const now = new Date();
    const newWakeAt = new Date(now.getTime() + parsed.delayMs).toISOString();
    const modelRef = computeModelRef(ctx);
    const scopeGlob = computeScopeGlob(modelRef);

    const existing = loadState();
    const existingPending = existing?.status === "pending" ? existing : undefined;

    // Scope-aware dedupe, within the constraint of a single global timer:
    //
    //   - Same scopeGlob as the existing pending wake: this is just a repeat
    //     detection for the same rate limit. Keep the earlier wakeAt (below)
    //     and refresh bookkeeping/reschedule so the in-process timer stays
    //     current after e.g. a second concurrent request also 429s.
    //   - Different scopeGlob than the existing pending wake: we can't run
    //     two independent timers, so we can't track both precisely. The
    //     safest choice is to always keep whichever wakeAt is earlier and
    //     preserve *that* wake's own source/scope — never let a
    //     later-firing, different-scope detection push the earlier one out
    //     further. If the new (different-scope) detection actually resolves
    //     sooner, it replaces the tracked state, including its own scope.
    //     Either way this can undercount how long a still-limited scope
    //     needs — e.g. a different-scope wake firing early does not mean the
    //     original scope's limit has lifted. Documented caveat of the
    //     single-global-timer design; not attempting a multi-timer rewrite.
    let state: WakeState;
    if (existingPending && new Date(existingPending.wakeAt).getTime() <= new Date(newWakeAt).getTime()) {
      // The existing pending wake already fires at or before this new
      // detection would — keep it as-is instead of pushing the timer later.
      state = { ...existingPending, updatedAt: now.toISOString() };
    } else {
      // No pending wake yet, or this detection resets sooner than the
      // current one — replace it. This keeps exactly one active timer
      // instead of stacking duplicates.
      state = {
        version: STATE_VERSION,
        status: "pending",
        wakeAt: newWakeAt,
        delayMs: parsed.delayMs,
        sourceExcerpt: parsed.excerpt,
        modelRef,
        scopeGlob,
        sessionId: safeSessionId(ctx),
        sessionFile: safeSessionFile(ctx),
        cwd: ctx.cwd,
        createdAt: existingPending?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }

    saveState(state);
    scheduleWake(state);
  }

  function lastAssistantMessage(messages: unknown[]): any | undefined {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i] as any;
      if (message?.role === "assistant") {
        return message;
      }
    }
    return undefined;
  }

  pi.on("session_start", (_event, ctx) => {
    try {
      lastCtx = ctx;
      const state = loadState();
      if (!state || state.status !== "pending") {
        return;
      }

      const remaining = new Date(state.wakeAt).getTime() - Date.now();
      if (remaining <= 0) {
        fireWake();
      } else {
        scheduleWake(state);
      }
    } catch {
      // fail open
    }
  });

  // Primary detection path: inspect the raw HTTP response as soon as it
  // arrives, before Pi has even finished consuming/interpreting it. This
  // doesn't depend on how (or whether) a given provider surfaces a 429 as
  // agent_end error text, so it catches cases the text parser below misses.
  pi.on("after_provider_response", (event, ctx) => {
    try {
      lastCtx = ctx;
      if (event.status !== 429) {
        return;
      }

      const parsed = parseProviderRateLimit(event.headers);
      if (!parsed) {
        return;
      }

      upsertState(ctx, parsed);
    } catch {
      // fail open
    }
  });

  // Fallback detection path: providers/transports that don't expose
  // headers to after_provider_response (or that fail before a response
  // object exists at all) still surface an error message on agent_end.
  pi.on("agent_end", (event, ctx) => {
    try {
      lastCtx = ctx;
      const messages = Array.isArray(event.messages) ? event.messages : [];
      const assistant = lastAssistantMessage(messages);
      if (!assistant || assistant.stopReason !== "error") {
        return;
      }

      const errorMessage = String(assistant.errorMessage ?? "");
      const parsed = parseRateLimitError(errorMessage);
      if (!parsed) {
        return;
      }

      upsertState(ctx, parsed);
    } catch {
      // fail open
    }
  });

  pi.on("session_shutdown", () => {
    // Do not clear the persisted state or cancel the logical wake here —
    // only the in-process timer/ticker die with this process. session_start
    // in the next process picks up a still-pending state and reschedules.
    if (statusTicker) {
      clearInterval(statusTicker);
      statusTicker = undefined;
    }
  });

  pi.registerCommand("rate-limit-wakeup", {
    description: "Show the pending rate-limit wakeup timer, if any",
    handler: async (_args, ctx) => {
      const state = loadState();
      if (!state || state.status !== "pending") {
        ctx.ui.notify("No pending rate-limit wakeup.", "info");
        return;
      }
      const remaining = new Date(state.wakeAt).getTime() - Date.now();
      let message =
        `Rate-limit wakeup pending: fires in ${formatRemaining(remaining)} (at ${state.wakeAt}). ` +
        `Source: ${state.sourceExcerpt.slice(0, 120)}`;
      if (state.scopeGlob) {
        message += ` | Scope: ${state.scopeGlob}`;
        if (state.modelRef) {
          message += ` (from ${state.modelRef})`;
        }
        const currentModelRef = computeModelRef(ctx);
        if (currentModelRef) {
          message += matchesScope(state.scopeGlob, currentModelRef)
            ? " — current model is within this scope"
            : " — current model is outside this scope";
        }
      } else if (state.modelRef) {
        message += ` | Model: ${state.modelRef}`;
      }
      ctx.ui.notify(message, "info");
    },
  });

  pi.registerCommand("rate-limit-wakeup-clear", {
    description: "Cancel the pending rate-limit wakeup timer",
    handler: async (_args, ctx) => {
      const state = loadState();
      clearTimers();
      if (!state || state.status !== "pending") {
        ctx.ui.notify("No pending rate-limit wakeup to clear.", "info");
        return;
      }
      state.status = "cancelled";
      state.updatedAt = new Date().toISOString();
      saveState(state);
      setFooterStatus(state);
      ctx.ui.notify("Rate-limit wakeup cancelled.", "info");
    },
  });
}
