// rate-limit-wakeup: detects provider rate-limit/quota errors on agent_end,
// parses the reset duration from the error text, and schedules a follow-up
// message that resumes the interrupted task once the cooldown has passed.
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

// --- state persistence -------------------------------------------------------

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
    const wakeAt = new Date(now.getTime() + parsed.delayMs).toISOString();

    const existing = loadState();
    const state: WakeState = {
      version: STATE_VERSION,
      status: "pending",
      wakeAt,
      delayMs: parsed.delayMs,
      sourceExcerpt: parsed.excerpt,
      sessionId: safeSessionId(ctx),
      sessionFile: safeSessionFile(ctx),
      cwd: ctx.cwd,
      createdAt: existing?.status === "pending" ? existing.createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // Always replace an existing pending timer with the freshest detection
    // (whichever way the new wakeAt moves) — this keeps exactly one active
    // timer instead of stacking duplicates.
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
      ctx.ui.notify(
        `Rate-limit wakeup pending: fires in ${formatRemaining(remaining)} (at ${state.wakeAt}). ` +
          `Source: ${state.sourceExcerpt.slice(0, 120)}`,
        "info",
      );
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
