# Fleet DAG Rework — Implementation Plan

**Tanggal:** 2026-07-03
**Design source-of-truth:** `docs/design/2026-07-03-fleet-dag-rework.md`
**Status:** Plan. Belum dieksekusi.
**Tujuan:** Menurunkan 10 artifact-to-build dari design doc menjadi slice implementasi berurutan, dengan dependency + fault-tolerance tier + acceptance check per slice.

---

## Prinsip eksekusi

- **Orchestrator (main agent) TAK menulis code** — semua artifact dibangun via subagent. Pengecualian: file `.md` (doc/plan/rule markdown) boleh main agent.
- **Fault-tolerance tier per slice** menentukan implementer + reviewer:
  - `low` → `implementer-critical` + `deep-reviewer`
  - `standard` → `implementer` + `reviewer`
  - `trivial` → `implementer-lite` + `reviewer`
- **Acceptance check** = truth-signal objektif tiap slice (bukan "baca kode saja"). Untuk artifact non-executable (agent/skill/rule markdown), acceptance = validasi struktur + dogfood-run.
- Slice diurutkan **DAG order** (dependency murni, no wave).

---

## Artifact-to-build (10) — DAG dependency graph

```
A1 (design doc) ─── DONE (artifact ini turunannya)
   │
A5 (L1 template) ◄── depends A1
A6 (L2 template) ◄── depends A1
   │
A3 (judge agent) ◄──────── depends A6 (baca L2 schema)
A4 (orchestrator agent) ◄─ depends A5,A6
   │
A1skill fleet-plan ◄─────── depends A5,A6 (planner tulis state dari template)
A2 (captain skill) ◄─────── depends A4,A3 (spawn orchestrator+judge)
   │
A8 (flow-offer rule) ◄───── depends A2 (offer fleet flow → captain)
A9 (resume contract) ◄───── depends A5,A6 (dokumentasi interface state)
A10 (ralph judge integ) ◄── depends A3 (reuse judge advisory)
   │
A7 (rework old design doc header) ── independent (supersede pointer) — DONE bareng A1
```

---

## Slices

### S1 — Rework L1 captain state template
- **Artifact:** `templates/fleet-captain.state.template.json`
- **Perubahan:** buang `wave` + `phases.waves`; tambah `dags[]` (dependsOn murni, orchestratorModel, thinking, judge block), `dagStatus`, `failedDags[]`. Keep assignment safety-ratchet, knowledge[], stopFlag. Bump `schemaVersion: 2`.
- **Depends:** design doc (A1, done).
- **Tier:** `low` (state schema = foundation, semua turunan depend, salah = cascade). → `implementer-critical` + `deep-reviewer`.
- **Acceptance:** JSON valid (`jq . <file>`), semua field design-doc §Level-1 hadir, tak ada sisa `wave`. Reviewer verifikasi field-by-field vs design doc.

### S2 — Rework L2 orchestrator state template
- **Artifact:** `templates/fleet-slice.state.template.json`
- **Perubahan:** dari single-slice → `tasks[]` array (taskId, dependsOn, implementer, reviewer, thinking, edgeGateStatus, commitSha, artifactPointer, reviewVerdict, checkCommand, acceptanceResult). Keep assumptions[], escalations[], knowledgeDelta[]. Bump `schemaVersion: 2`.
- **Depends:** design doc (A1, done).
- **Tier:** `low` (schema foundation). → `implementer-critical` + `deep-reviewer`.
- **Acceptance:** JSON valid, task-DAG array lengkap, `checkCommand`+`acceptanceResult` hadir, edge-gate field ada. Reviewer cek vs design doc §Level-2.

### S3 — Judge agent file
- **Artifact:** `agents/judge.md`
- **Isi:** Opus, `tools:` read-only + state (NO code-edit, NO test-run — state-file-only). Role: gate DAG, baca L2 acceptanceResult semua task + nilai integrasi holistik, verdict pass/fail/needs-fix, bounded 2x, promote knowledge kalau durable (Opus tier). Deliverable ralph-mode: prompt-file handoff + report pointer.
- **Depends:** S2 (harus tahu L2 schema untuk baca).
- **Tier:** `low` (judge = gate authority, salah judge = merge kode busuk). → `implementer-critical` + `deep-reviewer`.
- **Acceptance:** frontmatter valid (model Opus, tools state-only tanpa edit/write-code/bash-test), role prompt cover semua tugas judge dari design doc §Topologi + §Validation + §Knowledge. Dogfood: beri judge sample L2 state → verdict masuk akal.

### S4 — Fleet-orchestrator agent file
- **Artifact:** `agents/fleet-orchestrator.md`
- **Isi:** nested (`tools: Agent`), fresh context per-DAG. Role: track task-DAG, jalankan SEKALI (no loop), spawn implementer per-task, edge-gate (review pass butuh acceptanceResult hijau), Sonnet-orch spawn reviewer terpisah / Opus-orch rangkap reviewer, TAK tulis code, safety-ratchet upgrade-only, tulis L2 state tiap step.
- **Depends:** S1 (baca assignment L1), S2 (tulis L2).
- **Tier:** `low` (orchestrator = koordinator eksekusi, salah = task salah dispatch). → `implementer-critical` + `deep-reviewer`.
- **Acceptance:** frontmatter valid (`tools: Agent` untuk nesting), role cover no-loop + edge-gate + executable-check + upgrade-only + no-code-write. Dogfood: nested spawn depth-2 berfungsi (verified pattern sesi ini).

### S5 — fleet-plan skill
- **Artifact:** `skills/fleet-plan/SKILL.md` (+ assets: `FLEET.template.md`, `per-DAG-contract.template.md`)
- **Isi:** share sub-konsep `ralph-plan` (ralph-plan tetap utuh). Planner tulis: (1) FLEET.md captain contract, (2) per-DAG contract orchestrator, (3) captain+per-DAG state.json dari template, (4) checkCommand per-task/per-DAG (validation lapis-1), (5) set failureTolerance→orchestratorModel + thinking per node.
- **Depends:** S1, S2 (instantiate template).
- **Tier:** `standard` (skill = instruksi planner, salah kurang katastrofik dari schema/agent, mudah verify via dogfood-plan). → `implementer` + `reviewer`.
- **Acceptance:** SKILL.md frontmatter valid (name+description), template assets ada, instruksi cover 5 deliverable planner. Dogfood: jalankan fleet-plan pada epic sample → hasilkan valid L1+L2 state + contract.

### S6 — captain skill
- **Artifact:** `skills/captain/SKILL.md`
- **Isi:** L0 main-session captain. Track DAG dep-tree, compute runnable-set, spawn orchestrator per-DAG (nested fork), spawn judge post-DAG, handle judge verdict (pass→next / fail→retry bounded 2x / mark failed), scan runnable saat failedDags, relay steering user→worker (steer_subagent), tetap conversational selama run.
- **Depends:** S4 (spawn orchestrator), S3 (spawn judge).
- **Tier:** `standard` (skill instruksi, verify via dogfood). → `implementer` + `reviewer`.
- **Acceptance:** frontmatter valid, instruksi cover runnable-set compute + spawn + judge-verdict-handling + degradation + steering-relay + conversational. Dogfood: captain jalankan 2-DAG mini fleet end-to-end.

### S7 — Flow-offer always-loaded rule
- **Artifact:** `.pi/rules/flow-offer.md` (atau append AGENTS.md — konfirmasi lokasi saat eksekusi)
- **Isi:** main agent WAJIB offer flow by size tiap selesai bahas task (One-shot S/M, Ralph L, Fleet XL, Debug fase-khusus). Debug rule-of-engagement: main agent boleh sentuh code untuk fix kecil.
- **Depends:** S6 (offer fleet → captain skill harus ada).
- **Tier:** `trivial` (rule markdown, mekanikal, <bahaya). → `implementer-lite` + `reviewer`.
- **Acceptance:** frontmatter path-scope valid (kalau `.pi/rules`), taksonomi 4-flow + debug lengkap sesuai design doc §Flow-offer.

### S8 — Resume contract doc
- **Artifact:** `docs/design/2026-07-03-fleet-resume-contract.md`
- **Isi:** dokumentasi interface yang external-wake (cron/watcher/systemd, dibangun TERPISAH) panggil untuk resume: apa yang di-invoke (`resume=true`), state yang dibaca (L1 dagStatus + L2 tasks), guarantee (safety-ratchet no-downgrade, commit@sha checkout). Bukan implementasi wake, hanya kontrak.
- **Depends:** S1, S2 (referensi state field).
- **Tier:** `trivial` (doc markdown, main agent boleh). → main agent / `implementer-lite`.
- **Acceptance:** kontrak jelas: input, state-read, guarantee, boundary (apa yang BUKAN tanggung jawab fleet).

### S9 — Ralph judge integration
- **Artifact:** edit `skills/ralph-plan/SKILL.md` (+ mungkin ralph template)
- **Isi:** integrasikan judge sebagai ADVISORY/early-exit di ralph (bukan gate authority). Deliverable: prompt-file handoff + report pointer. Ralph loop + acceptance.command TETAP (judge advisory optional, tak menggantikan loop).
- **Depends:** S3 (judge agent harus ada).
- **Tier:** `standard` (sentuh ralph existing, hati-hati tak rusak loop). → `implementer` + `reviewer`.
- **Acceptance:** ralph-plan tetap utuh (loop + acceptance.command tak berubah semantik), judge advisory ditambah opsional. Dogfood: ralph run tanpa judge tetap jalan; dengan judge → early-exit signal muncul.

### S10 — (DONE) Rework old design doc supersede header
- **Artifact:** `docs/design/2026-07-01-fleet-ralph-state-schema.md` header
- **Status:** dikerjakan bareng design doc — tambah `Superseded-by` pointer.
- **Tier:** `trivial` (main agent, 1 baris).

---

## Sequencing (execution order)

**Wave-free — jalankan sesuai runnable-set:**

1. **Foundation (paralel):** S1, S2 — state templates. Keduanya `low`, no inter-dependency. Blocker semua.
2. **Agents (paralel setelah S1,S2):** S3 (judge, depends S2), S4 (orchestrator, depends S1+S2). Keduanya `low`.
3. **Skills (paralel setelah agents):** S5 (fleet-plan, depends S1+S2), S6 (captain, depends S3+S4).
4. **Wiring (setelah skills):** S7 (flow-offer, depends S6), S8 (resume contract, depends S1+S2), S9 (ralph judge, depends S3).
5. **Supersede header:** S10 — done.

**Tier summary:** S1,S2,S3,S4 = `low` (foundation+authority, Opus critical). S5,S6,S9 = `standard`. S7,S8,S10 = `trivial`.

---

## Validation gate (keseluruhan)

Sebelum tandai rework "done":
1. **Struktur:** semua 10 artifact ada, JSON valid (`jq`), frontmatter valid.
2. **Konsistensi:** field state L1/L2 cocok dengan yang dibaca judge/orchestrator/captain (cross-check).
3. **Dogfood end-to-end:** jalankan fleet-plan → captain → 2-DAG mini epic (1 low + 1 standard) → verifikasi: DAG dependency dihormati, judge-gate jalan, edge-gate executable-check jalan, resume (kill + re-invoke resume=true) melanjutkan tanpa silent-downgrade.
4. **Knowledge-promotion smoke:** Opus judge promote 1 durable delta → muncul di `.pi/rules`; Sonnet reviewer proposed → hanya lapor (tak promote).

---

## Referensi
- Design: `docs/design/2026-07-03-fleet-dag-rework.md`
- Superseded: `docs/design/2026-07-01-fleet-ralph-state-schema.md`
- Existing reuse: `skills/ralph-plan`, `skills/promote-rules`, `skills/promote-skills`, `agents/{implementer*,reviewer,deep-reviewer,scout,planner,support}`
- Toolkit: `@kmmuntasir/pi-nested-subagents` (fork, verified live)
