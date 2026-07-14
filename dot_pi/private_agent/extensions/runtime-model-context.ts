import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CANONICAL_TAG = /<runtime-model-context provider="[^"]*" model="[^"]*" capability="[^"]*"\/>/g;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function capability(id: string): "frontier" | "worker" | "scout" | "unknown" {
  const model = id.toLowerCase();
  if (/claude-(?:opus|fable)(?:[-/]|$)|gpt-5\.6-sol(?:[-/]|$)/.test(model)) return "frontier";
  if (/claude-sonnet(?:[-/]|$)|gpt-5\.6-terra(?:[-/]|$)/.test(model)) return "worker";
  if (/claude-haiku(?:[-/]|$)|gpt-5\.6-luna(?:[-/]|$)/.test(model)) return "scout";
  return "unknown";
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    const model = ctx.model;
    const provider = typeof model?.provider === "string" ? model.provider : "unknown";
    const id = typeof model?.id === "string" ? model.id : "unknown";
    const context = `<runtime-model-context provider="${escapeXml(provider)}" model="${escapeXml(id)}" capability="${capability(id)}"/>`;
    return {
      systemPrompt: `${event.systemPrompt.replace(CANONICAL_TAG, "")}\n${context}`,
    };
  });
}
