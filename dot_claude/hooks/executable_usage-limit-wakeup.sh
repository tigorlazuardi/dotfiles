#!/usr/bin/env bash
# Stop hook: fires at the end of every agent turn.
#
# Goal: when usage runs high, arm a one-shot wakeup that re-injects a prompt
# into THIS session shortly after the relevant limit resets, so any unfinished
# work continues automatically once budget is back.
#
# A hook is a subprocess and cannot call model tools (CronCreate/ScheduleWakeup)
# directly. So instead this hook returns {"decision":"block","reason":...},
# which forces the agent to take one more turn; the reason instructs the agent
# to call CronCreate (one-shot) with the exact schedule computed here.
# CronCreate is used (not ScheduleWakeup) because ScheduleWakeup is clamped to a
# 1-hour max delay, while resets can be many hours / days out.
#
# Trigger:  five_hour (session) utilization >= 70%  OR  seven_day (weekly) >= 80%
# Reset choice:
#   - both tripped at once -> use whichever reset is LATER
#   - otherwise            -> use the session (5h) reset
# Wake time = reset + 1 minute.
#
# Single-instance: the enqueued prompt carries the marker [usage-limit-wakeup];
# the instruction tells the agent to CronList + CronDelete any prior job with
# that marker before creating the new one, so at most one wakeup exists per
# session. A per-session state file records the armed wake time so the hook only
# blocks again when that target actually changes (not on every turn).
set -u

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STATE_DIR="$CLAUDE_DIR/usage-wakeup"
MARKER="[usage-limit-wakeup]"

JQ_BIN="$(command -v jq)" || exit 0
BASH_BIN="$(command -v bash)" || exit 0

now_epoch="$(date +%s)"
mkdir -p "$STATE_DIR" 2>/dev/null

input="$(cat)"
session_id="$(printf '%s' "$input" | "$JQ_BIN" -r '.session_id // empty' 2>/dev/null)"
stop_active="$(printf '%s' "$input" | "$JQ_BIN" -r '.stop_hook_active // false' 2>/dev/null)"
# Event: "Stop" (end of turn) or "UserPromptSubmit" (agent begins a task). Arming
# at task start pre-empts a big task that blows the budget and dies mid-run
# before Stop ever fires.
event="$(printf '%s' "$input" | "$JQ_BIN" -r '.hook_event_name // empty' 2>/dev/null)"
[ -n "$session_id" ] || exit 0

# Never re-block on a turn that this hook itself forced (prevents a loop).
[ "$stop_active" = "true" ] && exit 0

# User-facing warning, throttled to WARN_TTL seconds so a prolonged outage does
# not spam every turn. maybe_warn() records a pending message (no exit);
# warn_and_exit() emits it as a non-blocking systemMessage and ends the turn.
# When the hook goes on to arm a wakeup, the pending message is folded into the
# block JSON instead (see below), so the user is warned either way.
warn_msg=""
maybe_warn() {
  local wf="$STATE_DIR/last-warn.epoch" last=0
  [ -f "$wf" ] && last="$(cat "$wf" 2>/dev/null || echo 0)"
  if [ $(( now_epoch - last )) -ge "${WARN_TTL:-300}" ]; then
    printf '%s' "$now_epoch" > "$wf" 2>/dev/null || true
    warn_msg="$1"
  fi
}
warn_and_exit() {
  [ -n "$warn_msg" ] && "$JQ_BIN" -n --arg m "$warn_msg" '{systemMessage:$m}'
  exit 0
}

check_err="$STATE_DIR/last-check.err"
usage_json="$("$BASH_BIN" "$CLAUDE_DIR/skills/check-usage/scripts/check-usage.sh" 2>"$check_err")"

# Total failure: no usable usage data at all -> warn, arm nothing.
if [ -z "$usage_json" ] || ! printf '%s' "$usage_json" | "$JQ_BIN" -e . >/dev/null 2>&1; then
  detail="$(tr '\n' ' ' < "$check_err" 2>/dev/null | sed 's/  */ /g;s/^ *//;s/ *$//' | cut -c1-200)"
  maybe_warn "⚠ usage-limit-wakeup: gagal cek usage limit — auto-resume wakeup TIDAK ter-arm turn ini. ${detail:-(tidak ada detail error)}"
  warn_and_exit
fi

# Partial failure: fetch failed but stale cache was served. Data is usable but
# possibly outdated (its reset time may already have passed), so flag it.
if grep -q 'STALE_SERVED' "$check_err" 2>/dev/null; then
  sdetail="$(grep -m1 'STALE_SERVED' "$check_err" 2>/dev/null | tr -d '\n' | cut -c1-120)"
  maybe_warn "⚠ usage-limit-wakeup: cek usage gagal, pakai data cache lama (${sdetail}). Keputusan wakeup turn ini berdasar angka/jam-reset yang mungkin sudah basi."
fi

session_pct="$(printf '%s' "$usage_json" | "$JQ_BIN" -r '.five_hour.utilization // 0')"
weekly_pct="$(printf '%s' "$usage_json" | "$JQ_BIN" -r '.seven_day.utilization // 0')"
session_reset="$(printf '%s' "$usage_json" | "$JQ_BIN" -r '.five_hour.resets_at // empty')"
weekly_reset="$(printf '%s' "$usage_json" | "$JQ_BIN" -r '.seven_day.resets_at // empty')"

is_ge() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0>=b+0)}'; }

session_triggered=0; weekly_triggered=0
is_ge "$session_pct" 70 && session_triggered=1
is_ge "$weekly_pct" 80 && weekly_triggered=1
[ "$session_triggered" = 1 ] || [ "$weekly_triggered" = 1 ] || warn_and_exit

[ -n "$session_reset" ] || warn_and_exit
session_epoch="$(date -d "$session_reset" +%s 2>/dev/null)" || warn_and_exit

target_epoch="$session_epoch"; which_limit="session (5h)"
if [ "$session_triggered" = 1 ] && [ "$weekly_triggered" = 1 ] && [ -n "$weekly_reset" ]; then
  weekly_epoch="$(date -d "$weekly_reset" +%s 2>/dev/null)" || weekly_epoch="$session_epoch"
  if [ "$weekly_epoch" -gt "$session_epoch" ]; then
    target_epoch="$weekly_epoch"; which_limit="weekly (7d, later of the two)"
  fi
fi

# Return the exact API reset instant. The +1min safety buffer is NOT baked in
# here; the agent is instructed to add it when it calls CronCreate (see message
# below), so the recorded wake time stays true to the API and the actual wakeup
# lands after quota is really back.
wake_epoch=$target_epoch
# Reset already in the past (e.g. stale cache) -> nothing to arm. Warn if pending.
[ "$wake_epoch" -gt "$now_epoch" ] || warn_and_exit

# Stay quiet when the same target is already armed by THIS live process. The
# state file persists on disk, but the cron is in-memory and dies with the
# process; keying on $PPID (the claude process) means a restart/resume gets a
# different PPID and re-arms even when the target matches, while repeat prompts
# in one live session don't nag.
state_file="$STATE_DIR/${session_id}.json"
if [ -f "$state_file" ]; then
  prev="$("$JQ_BIN" -r '.wake_epoch // empty' "$state_file" 2>/dev/null)"
  prev_ppid="$("$JQ_BIN" -r '.armed_ppid // empty' "$state_file" 2>/dev/null)"
  [ "$prev" = "$wake_epoch" ] && [ "$prev_ppid" = "$PPID" ] && warn_and_exit
fi

# One-shot cron fields (LOCAL time) pinned to the wake instant.
cron_min="$(date -d "@$wake_epoch" +%-M)"
cron_hour="$(date -d "@$wake_epoch" +%-H)"
cron_dom="$(date -d "@$wake_epoch" +%-d)"
cron_mon="$(date -d "@$wake_epoch" +%-m)"
cron_expr="$cron_min $cron_hour $cron_dom $cron_mon *"
wake_human="$(date -d "@$wake_epoch" '+%Y-%m-%d %H:%M %Z')"

# Prompt the wakeup will enqueue back into this session.
wake_prompt="$MARKER limit (${which_limit}) maybe reset now. check: task from this session stuck/unfinished from limit? yes -> finish it. all done -> do nothing."

# Stop forces a dedicated scheduling turn via decision:block. UserPromptSubmit
# can't block-and-continue, so it rides additionalContext onto the user's turn:
# arm first, THEN carry on with the user's request (do not stop).
"$JQ_BIN" -n \
  --arg cron "$cron_expr" \
  --arg prompt "$wake_prompt" \
  --arg human "$wake_human" \
  --arg limit "$which_limit" \
  --arg spct "$session_pct" \
  --arg wpct "$weekly_pct" \
  --arg marker "$MARKER" \
  --arg warn "$warn_msg" \
  --arg event "$event" \
  '
  "usage high. session \($spct)% weekly \($wpct)%. cap: \($limit)." as $head |
  "1. CronList. any job w/ \($marker) -> CronDelete. keep ONE wakeup.\n2. reset is at ~\($human) (exact API reset, cron \"\($cron)\"). ADD 1 MINUTE to that time (roll hour/day/month over if the minute wraps) so quota is actually back, then CronCreate: recurring=false, cron=<reset+1min>, prompt=\"\($prompt)\"." as $steps |
  (if $event == "Stop"
     then "[usage-limit-wakeup hook] \($head) DO SCHEDULING ONLY, THEN STOP:\n\($steps)\n3. reply EXACTLY this one line, nothing else (no rearm/skip detail): armed wakeup at \($human)"
     else "[usage-limit-wakeup hook] \($head) ARM WAKEUP FIRST (once), THEN do user task normally:\n\($steps)\nconfirm with EXACTLY this one line, nothing else (no rearm/skip detail): armed wakeup at \($human) — then continue the user task."
   end) as $msg |
  (if $event == "Stop"
     then {decision:"block", reason:$msg}
     else {hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$msg}}
   end)
  + (if $warn == "" then {} else {systemMessage:$warn} end)'

# Record the armed target + the process that armed it (see dedup above).
cat > "$state_file" <<EOF
{"session_id":"$session_id","wake_epoch":$wake_epoch,"armed_ppid":$PPID,"cron":"$cron_expr","which_limit":"$which_limit","session_pct":$session_pct,"weekly_pct":$weekly_pct,"armed_at":$now_epoch}
EOF

exit 0
