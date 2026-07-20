import { isBashToolResult, type ExtensionAPI, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { homedir } from "node:os";
import { join } from "node:path";
import { details, hasCommitEvidence, initialState, isRecordResult, nudgeState, parseState, projectFrom, recall, record, type JournalState } from "./dev-journal-core.ts";

const ROOT = join(homedir(), "journal");
function isJournalStateEntry(entry: SessionEntry): entry is Extract<SessionEntry, { type: "custom" }> { return entry.type === "custom" && entry.customType === "dev-journal-state"; }
function restore(ctx: ExtensionContext): JournalState { for (const entry of [...ctx.sessionManager.getEntries()].reverse()) if (isJournalStateEntry(entry)) return parseState(entry.data); return initialState(); }
function textContent(content: readonly { type: string; text?: string }[]): string { return content.filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n"); }

export default function (pi: ExtensionAPI) {
  let state: JournalState = initialState(), lock = Promise.resolve();
  const persist = () => { try { pi.appendEntry("dev-journal-state", state); } catch {} };
  const nudge = () => {
    const next = nudgeState(state); if (!next) return;
    state = next; // ponytail: mark before host delivery; failed host calls must not loop this session.
    persist();
    try { pi.sendMessage({ customType: "dev-journal-nudge", content: "DEV-JOURNAL CHECK: commit evidence exists. Decide if work notable; if notable ask exact `Journal ini?`; otherwise stay silent.", display: true }, { deliverAs: "followUp", triggerTurn: true }); } catch {}
  };
  pi.on("session_start", (_event, ctx) => { try { state = restore(ctx); } catch { state = initialState(); } });
  pi.registerTool({
    name: "dev_journal", label: "Dev Journal", description: "Recall journal digest, read one entry, or record approved notable work locally.",
    promptSnippet: "Recall precedent or record user-approved notable work in local dev journal",
    promptGuidelines: ["Use dev_journal recall for relevant precedent. Use dev_journal record only after user explicitly says Journal ini? and approved:true; it records locally without git/network."],
    parameters: Type.Object({ action: StringEnum(["recall", "details", "record"] as const), project: Type.Optional(Type.String()), query: Type.Optional(Type.String()), ref: Type.Optional(Type.String()), approved: Type.Optional(Type.Boolean()), company: Type.Optional(Type.String()), type: Type.Optional(StringEnum(["feature", "design-decision", "fix", "incident", "learning", "milestone"] as const)), title: Type.Optional(Type.String()), skills: Type.Optional(Type.Array(Type.String())), impact: Type.Optional(Type.String()), cv_ready: Type.Optional(Type.Boolean()), body: Type.Optional(Type.String()), date: Type.Optional(Type.String()), related: Type.Optional(Type.String()) }),
    async execute(_id, p, _signal, _update, ctx) {
      try {
        if (p.action === "recall") return { content: [{ type: "text", text: await recall(ROOT, projectFrom(ctx.cwd, p.project) ?? "", p.query) }], details: {} };
        if (p.action === "details") return { content: [{ type: "text", text: await details(ROOT, p.ref ?? "") }], details: {} };
        const input = { approved: p.approved === true, project: projectFrom(ctx.cwd, p.project) ?? "", company: p.company ?? "", type: p.type ?? "", title: p.title ?? "", skills: p.skills ?? [], impact: p.impact ?? "", cv_ready: p.cv_ready === true, body: p.body ?? "", date: p.date, related: p.related };
        const run = lock.then(() => record(ROOT, input)); lock = run.catch(() => undefined); const out = await run; state.decided = true; persist(); return { content: [{ type: "text", text: `Recorded ${out.ref}. Local files only; journal repo remains uncommitted.` }], details: { ref: out.ref } };
      } catch (error) { if (p.action === "record") { state.decided = true; persist(); } throw error; }
    },
  });
  pi.registerCommand("journal", { description: "Ask agent to prepare an approved local dev-journal record", handler: async (_args, _ctx) => { try { pi.sendUserMessage("Use dev_journal record for notable completed work only after asking exact: Journal ini? Then require approved:true. Do not git commit, pull, push, or duplicate writing outside tool."); } catch {} } });
  pi.on("tool_result", (event) => { if (isRecordResult(event)) { state.decided = true; persist(); return; } if (isBashToolResult(event) && hasCommitEvidence(event.input.command, textContent(event.content), event)) { state.commit = true; persist(); } });
  pi.on("agent_settled", nudge);
}
