# Fleet Rework — DAG Execution Architecture

**Tanggal:** 2026-07-03
**Status:** Desain arsitektur. Belum implementasi. Hasil sesi grill `fleet-rework` (10 decision branch resolved).
**Supersedes:** `2026-07-01-fleet-ralph-state-schema.md` (skema wave-based) — konsep wave dibuang, diganti DAG murni. State schema di-carry-over + di-rework (lihat §State Schema).
**Tujuan:** Menetapkan arsitektur eksekusi fleet berbasis DAG (bukan wave), toolkit fork-nesting (bukan workflow in-memory), judge-gated (bukan iteration loop), dengan validation 2-lapis, knowledge-promotion by tier, dan resume-ready untuk rate-limit survival.

---

## Mantra (prinsip biaya)

**Maximum benefit at certain cost** — BUKAN minimize cost. Ada plafon biaya; di dalam plafon, **maksimalkan hasil**. Jaga biaya di titik yang TAK membeli correctness (mis. scout/inventory pakai Haiku), tumpahkan di titik yang membeli correctness (mis. judge & low-tolerance implement pakai Opus). Setiap keputusan routing model dijustifikasi oleh mantra ini.

---

## Context & motivation

Fleet lama (`2026-07-01`) dirancang **wave-based**: slice dikelompokkan ke wave `{0,1,2}`, wave dijalankan berurutan, semua slice dalam satu wave paralel. Tiga masalah:

1. **Wave = sinkronisasi kasar.** Slice di wave-1 yang dependency-nya sudah selesai di wave-0 tetap harus tunggu SELURUH wave-0 kelar. Buang paralelisme.
2. **Toolkit workflow in-memory** hilang saat proses die (rate-limit) → captain state tak ter-flush → resume gap (pertanyaan terbuka #3 doc lama).
3. **Gate tak jelas.** Fleet lama pinjam `acceptance.command` loop dari ralph, tapi fleet konsep-nya beda (major/greenfield, ada judge semantic). Ketegangan objektif vs semantic tak terselesaikan.

Rework menjawab ketiganya: **DAG** (dependency murni, runnable-set dihitung dinamis), **fork-nesting toolkit** (state persist ke disk tiap step), **judge-gate + validation 2-lapis** (objektif executable + semantic).

---

## 3 Pivot besar

### Pivot 1 — Toolkit: workflow → fork-nesting
Ganti `workflow` (in-memory, hilang saat die) dengan `@kmmuntasir/pi-nested-subagents` fork.
- **Verified live sesi ini:** nesting depth-2 (captain → orchestrator → implementer) + two-hop steering (captain → orchestrator → worker) berfungsi.
- Konsekuensi: setiap scope (captain L0, orchestrator L1, judge L1, worker L2) adalah **subagent nyata** dengan state file di disk → resume-ready by construction.

### Pivot 2 — Konsep: wave → DAG
Buang wave. Slice/task punya `dependsOn[]` murni. Runnable-set = node yang semua dependency-nya sudah `passed`/`merged`, dihitung dinamis setiap ada perubahan status. Paralelisme maksimum, tanpa barrier wave.

### Pivot 3 — Framing: Fleet = execution-style ala Ralph, tapi BUKAN Ralph
Fleet dan Ralph **share konsep eksekusi**, tapi beda scope → beda rule-of-engagement. Bukan dua sistem terpisah, bukan sistem yang sama. Detail di §Fleet≈Ralph.

---

## Fleet ≈ Ralph (satu-flow, beda rule-of-engagement)

| Aspek | Fleet | Ralph |
|---|---|---|
| Scope | XL / major / hampir pasti greenfield | L / minor feature / implementasi panjang |
| Struktur | DAG-of-DAG (captain → per-DAG orchestrator → tasks) | single slice, task-DAG |
| Iteration loop | **TIDAK ADA** | **ADA** (`acceptance.command` run-until-pass) |
| Gate | **Judge per-DAG = AUTHORITY** (bounded 2x retry) | acceptance.command + judge advisory/early-exit |
| Manusia dalam loop | tidak (autonomous, resume-driven) | ya (ralph biasanya ada manusia) |
| "Ulang" | Judge decision (bounded 2x) | loop iterate sampai acceptance pass |

Konsep hampir sama → di-share jadi satu flow. Perbedaan = rule-of-engagement (fleet no-loop judge-authority, ralph loop judge-advisory).

---

## Topologi Fleet

```
Captain (L0 / main-session, SKILL) ── track DAG-dependency tree
  │  compute runnable-set (DAG tak-depend-ke-failed)
  │  spawn orchestrator per-DAG (nested fork)
  │  spawn judge post-DAG
  │
  ├─ Orchestrator per-DAG (L1, AGENT FILE, fresh context)
  │    │  track task-dependency tree, jalankan DAG SEKALI (NO loop)
  │    │  TAK menulis code (kecuali pengecualian debug-fix-kecil di main agent)
  │    ├─ Implementer (L2) ── SATU-SATUNYA yang menulis code
  │    └─ Reviewer per-task (L2, hanya kalau orchestrator = Sonnet)
  │         edge-gate + JALANKAN acceptance check (executable)
  │
  └─ Judge post-DAG (L1, AGENT FILE, fresh, STATE-FILE-ONLY, Opus)
       GATE DAG: baca acceptanceResult semua task + nilai integrasi/goal holistik
```

**Peran roster:**
- `captain` = **SKILL baru** (L0, main-session captain). Track DAG dep-tree, spawn orchestrator + judge, relay steering user ke worker.
- `fleet-orchestrator` = **AGENT FILE baru** (nested, `tools: Agent`). Fresh context per-DAG.
- `judge` = **AGENT FILE baru** (Opus, state-file-only).
- Reuse existing: `implementer` ×3 (lite/std/critical), `reviewer` ×2 (std/deep), `scout`, `planner`, `support`.
- `fleet-plan` = **SKILL baru** (share sub-konsep `ralph-plan`; ralph-plan tetap utuh).

---

## Model routing — 2 sumbu

Routing model = 2 sumbu independen, keduanya ditetapkan **planner** saat Plan (deterministik, persist di state):

**Sumbu 1 — orchestratorModel ← failureTolerance (per-DAG):**
- `low` (auth/secrets/migration/schema/money/irreversible) → orchestrator **Opus** (scope sengaja dibuat kecil).
- `standard` / `trivial` → orchestrator **Sonnet**.

**Sumbu 2 — thinking/reasoning-effort (per-task & per-DAG):**
- Level thinking di-set per node sesuai kompleksitas. Planner map.

**Konsekuensi review-topology (dari failureTolerance):**
- **Opus orchestrator** → rangkap reviewer inline (Opus cukup kuat review sendiri). Judge post-DAG tetap jalan.
- **Sonnet orchestrator** → reviewer TERPISAH per-task (Sonnet tak review diri sendiri untuk low-tolerance edge).

**Safety ratchet (upgrade-only, carry-over dari doc lama):** tier order `implementer-lite < implementer < implementer-critical` dan `reviewer < deep-reviewer`. Orchestrator boleh NAIKKAN effective tier ≥ planned, TAK boleh turunkan. Resume baca effective tier — tak ada silent-downgrade, tak ada re-judgment.

---

## State Schema (rework dari doc lama)

Dua level, sama seperti doc lama, tapi **wave dibuang**, **judge + validation + task-DAG ditambah**.

### Level-1 — captain state (`state.json`)

Perubahan vs doc lama:
- **BUANG** `sliceDag[].wave` dan `phases.waves{}`. Ganti dengan `dependsOn[]` murni → captain compute runnable-set.
- **TAMBAH** per-DAG: `orchestratorModel` (opus/sonnet ← failureTolerance), `thinking` level.
- **TAMBAH** per-DAG `judge` block: `{verdict, attempt (bounded 2x), lastArtifactPointer}`.
- **TAMBAH** `failedDags[]` + captain scan: DAG yang tak-depend ke DAG failed → tetap jalankan. Tak ada runnable → fleet stop.
- **KEEP** dari doc lama: assignment safety-ratchet (upgrade-only), branchStrategy, `knowledge[]`, `stopFlag`.

```jsonc
{
  "runName": "add-billing-2026-07-03",
  "schemaVersion": 2,                        // bump: wave→DAG
  "baseBranch": "main",
  "integrationBranch": "fleet/add-billing",

  "dags": [                                  // DAG-level nodes (was: sliceDag + wave)
    {
      "id": "d1",
      "dependsOn": [],                        // DAG murni — NO wave
      "failureTolerance": "low",             // planner set — sumber routing
      "orchestratorModel": "opus",           // ← failureTolerance (low→opus)
      "thinking": "high",                     // per-DAG reasoning effort
      "assignment": { /* safety-ratchet, carry-over doc lama */
        "plannedImplementer": "implementer-critical",
        "plannedReviewer": "deep-reviewer",
        "effectiveImplementer": "implementer-critical",
        "effectiveReviewer": "deep-reviewer"
      },
      "judge": {                              // BARU — gate DAG
        "verdict": null,                      // pass | fail | needs-fix
        "attempt": 0,                         // bounded 2x
        "lastArtifactPointer": null           // pointer ke L2 state / commit
      }
    },
    { "id": "d2", "dependsOn": ["d1"], "failureTolerance": "standard",
      "orchestratorModel": "sonnet", "thinking": "medium",
      "assignment": { "plannedImplementer": "implementer", "plannedReviewer": "reviewer",
                      "effectiveImplementer": "implementer", "effectiveReviewer": "reviewer" },
      "judge": { "verdict": null, "attempt": 0, "lastArtifactPointer": null } }
  ],

  "dagStatus": {                              // status per-DAG (resume anchor)
    "d1": { "status": "running", "level2": "dags/d1.json" },
    "d2": { "status": "pending", "level2": null }
  },
  // status enum: pending | running | passed | failed | blocked-hard

  "failedDags": ["..."],                      // BARU — captain scan: skip DAG yang depend ke sini

  "knowledge": [ /* accumulated durable knowledge, reload saat resume */ ],

  "stopFlag": { "stopped": false, "reason": null, "stoppedAt": null }
}
```

**Runnable-set computation (captain):** DAG `d` runnable ⟺ semua `d.dependsOn` berstatus `passed` DAN tak ada di `failedDags`. Setiap perubahan status → recompute. Tak ada runnable & ada `running` → tunggu. Tak ada runnable & tak ada running → fleet stop.

### Level-2 — orchestrator state, task-DAG array (`dags/<dagId>.json`)

Perubahan besar: dari single-slice progress → **array task-DAG** (satu DAG berisi banyak task dengan dependency internal).

```jsonc
{
  "dagId": "d1",
  "schemaVersion": 2,
  "branch": "fleet/add-billing/d1",

  "tasks": [                                  // task-DAG (was: single slice)
    {
      "taskId": "t1",
      "dependsOn": [],
      "implementer": "implementer-critical",  // = effective dari L1
      "reviewer": "deep-reviewer",            // hanya dipakai kalau Sonnet-orch
      "thinking": "high",
      "edgeGateStatus": "open",               // open | passed | blocked — node hilir blocked sampai hulu passed
      "commitSha": null,
      "artifactPointer": null,                // pointer artefak task
      "reviewVerdict": null,                  // pass | fail | needs-fix
      "checkCommand": "npm test -- billing",  // BARU — executable truth-signal (planner define)
      "acceptanceResult": null                // BARU — pass | fail (hasil run checkCommand)
    }
  ],

  "assignment": {                             // carry-over: mirror L1 + jejak upgrade
    "upgradedFromPlan": false, "upgradeReason": null
  },

  "assumptions": [ /* carry-over doc lama — orchestrator putuskan-sendiri */ ],
  "escalations": [ /* carry-over doc lama */ ],
  "knowledgeDelta": [ /* durable candidate → pipeline, lihat §Knowledge */ ]
}
```

**Edge-gate:** node hilir `blocked` sampai review node hulu `pass`. Review `pass` BUTUH `acceptanceResult: pass` (executable hijau) — **bukan cuma baca kode**.

**Judge = per-task pointer (holistik + pinpoint):** judge baca L2 state → dapat peta lengkap setiap task (artifactPointer + reviewVerdict + commitSha + acceptanceResult). Bisa nilai integrasi holistik DAN pinpoint task bermasalah.

### Ralph state
KEEP `loop.iteration` + `acceptance.command`. Judge advisory optional (early-exit + prompt-file handoff).

---

## Validation / truth-signal (2 lapis)

Ketegangan yang diselesaikan: judge semantic (subjektif, state-file-only) BISA salah menilai "kode keliatan bener" padahal test fail. Solusi = 2 lapis:

**Lapis 1 — Objektif (executable) di edge-gate per-task:**
Reviewer per-task **WAJIB menjalankan** `checkCommand` (test/build/lint task). Verdict `pass` butuh check **HIJAU**, bukan cuma baca kode. State rekam `acceptanceResult: pass/fail`.

**Lapis 2 — Semantic di judge post-DAG:**
Judge (Opus, state-file-only) baca `acceptanceResult` semua task + nilai integrasi/goal holistik. Judge TAK menjalankan test sendiri (tetap murni state-file-only) — dia percaya `acceptanceResult` yang sudah tercatat objektif.

**Integration test level-DAG:** check command level-DAG ditaruh di edge-gate task TERAKHIR (cover cross-task integration). Planner define. Judge/orchestrator tak perlu eksekusi — judge tetap state-only.

**Pembagian eksekusi:** yang menjalankan test = reviewer (Sonnet-orch) atau orchestrator-rangkap-reviewer (Opus-orch). Judge tak pernah eksekusi.

---

## Knowledge promotion (by tier, role-agnostic)

**Transport = state `knowledgeDelta[]`** dengan flag `proposed` + `needsOpusReview` (reuse pipeline existing, konsisten state-file-only).

**Gate promosi = TIER model (Opus), BUKAN role:**
- **Sonnet** (role apapun — orchestrator/reviewer/dst): menemukan durable candidate → tulis `knowledgeDelta[]` flag `proposed` → **lapor, TAK promote**.
- **Opus** (role apapun — judge/orchestrator/captain/reviewer Opus): begitu knowledge masuk konteksnya + dinilai durable/reusable → **promote langsung** ke `.pi/rules`/`.pi/skills` via `writeKnowledge()` (tanpa izin — keputusan #8; ini konteks fleet-autonomous, permission implicit).

Judge post-DAG = titik promote **natural paling sering** (Opus + baca state), tapi BUKAN gerbang eksklusif. Opus manapun di rantai yang "melihat" proposed item + setuju durable → crystallize.

Reuse: `skills/promote-rules`, `skills/promote-skills` (writeKnowledge existing).

---

## Rate-limit survival (resume-ready)

Fokus rework = flow **RESUME-READY**, BUKAN membangun pause-detection/external-wake:
- State persist tiap step + `commit@sha` (fork-nesting toolkit → disk by construction).
- Re-invoke `resume=true` → captain baca L1 (skip DAG passed, re-enter DAG running), orchestrator baca L2 (skip task done, checkout `branch@commitSha`, lanjut).
- Low-tolerance TAK silent-downgrade (safety-ratchet baca effective tier).

**Di LUAR scope (dokumentasikan kontrak saja):**
- Pause-detection (kapan agent tahu mendekati hard-limit) + external-wake (cron/watcher/systemd) = **mekanisme terpisah**. Fleet/ralph JANGAN deteksi rate-limit sendiri. Cukup ekspos **kontrak resume interface** (apa yang external caller panggil) agar mekanisme terpisah tinggal colok.

---

## Hard-failure & degradation

- Judge `fail` → orchestrator perbaiki → gagal lagi (bounded 2x) → captain mark DAG `failed`, DAG stop prematur.
- Sonnet-orch hard-fail → escalate review Opus → Opus setuju → report captain.
- Opus-orch hard-fail → langsung report captain.
- Captain scan runnable-set (DAG tak-depend ke failed) → jalankan sisa. Tak ada runnable → fleet stop (`stopFlag`).

---

## Flow-offer taksonomi (always-loaded rule)

Main agent WAJIB, tiap selesai bahas task, offer flow by size:
- **One-shot (S/M)** = fixes / small feature → delegate langsung, review tight.
- **Ralph (L)** = minor feature, implementasi panjang.
- **Fleet (XL)** = major feature, hampir pasti greenfield.
- **Debug (fase khusus):** (1) info+knowledge gathering (repro/env/data/expected). (2) branch by size: fix kecil → execute langsung, subagent tak wajib, **main agent BOLEH sentuh code** (pengecualian orchestrator-no-code); medium/besar → flow planning.

Mekanik `debug.md` interactive = backlog terpisah (out-of-scope rework ini).

---

## Risks & tradeoffs

| Risk | Mitigasi |
|---|---|
| Judge semantic salah (kode keliatan bener, test fail) | Validation lapis-1 executable di edge-gate — judge percaya acceptanceResult objektif, tak menilai buta |
| Fork-nesting toolkit belum battle-tested | Verified live sesi ini (depth-2 + two-hop steer); mulai low-risk DAG dulu (rollout) |
| Opus promote knowledge tanpa izin bikin noise di `.pi/rules` | Trivia-filter: hanya DURABLE concept; Opus judgment gate; manual review pasca-run |
| Bounded 2x judge retry tak cukup untuk DAG kompleks | Escalate ke captain (mark failed) — user resolve, bukan infinite loop |
| Resume baca tier salah → silent-downgrade low-tolerance | Safety-ratchet upgrade-only + effective tier persist di L1 |

---

## Rollout

1. State schema + template (foundation) — L1 DAG, L2 task-DAG.
2. Agent files: judge, fleet-orchestrator.
3. Skill files: fleet-plan, captain.
4. Flow-offer rule (always-loaded).
5. Ralph judge integration (advisory).
6. Resume contract doc (untuk external-wake terpisah).
7. Dogfood: jalankan fleet low-risk DAG kecil dulu, verifikasi resume + judge-gate, baru scale.

Detail langkah + dependency + tier per artifact: lihat `docs/plans/2026-07-03-fleet-dag-impl-plan.md`.

---

## Referensi
- Doc lama (superseded): `docs/design/2026-07-01-fleet-ralph-state-schema.md`
- Topologi 4-scope: `docs/design/2026-07-01-intercom-orchestration-map.md`
- Impl plan: `docs/plans/2026-07-03-fleet-dag-impl-plan.md`
- Toolkit: `@kmmuntasir/pi-nested-subagents` (fork, verified live 2026-07-03)
