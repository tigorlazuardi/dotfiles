# Fleet State-File Schema (Level-1 / Level-2)

**Tanggal:** 2026-07-01
**Status:** Desain skema. Belum implementasi. Menurunkan field konkret dari topologi 4-scope (`2026-07-01-intercom-orchestration-map.md`) + spec resume yang sudah ada (pi config `rules/fleet-knowledge.md` §64-105).
**Tujuan:** Menutup resume-gap fleet (Level-1 + Level-2 belum persist ke disk) + menampung `assumptions[]` (orchestrator putuskan-sendiri) yang muncul dari diskusi 4-scope.

## Prinsip pemisahan (ditetapkan user)
- **state.json** = audit trail + resume anchor. SEMUA keputusan/asumsi orchestrator masuk sini. Transient per-run/per-slice. Mesin-readable.
- **.agents/rules / .agents/skills** = konvensi DURABLE saja. Di-promote dari state via pipeline `knowledgeDelta[] → knowledge[] → writeKnowledge()` yang SUDAH ADA. Tak campur.
- Pemisahan: `state.json.assumptions` = keputusan-judgment-spesifik-slice (mis "spec ambigu, aku pilih pendekatan X"). `.agents/rules` = konvensi-yang-slice-lain-harus-honor (mis "semua timestamp timezone-aware").

---

## Lokasi disk — RELATIF REPO PROYEK (bukan ~/.pi)
Semua state + artefak runtime ditulis RELATIF ke root repo proyek tempat fleet/ralph jalan, dan di-commit ke repo itu (team-shared, cross-machine resume). `~/.pi` HANYA untuk template master + dokumen desain meta — JANGAN tulis state runtime ke sana.

**Fleet** (point: epic):
```
<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/
  state.json                              # Level-1 (control-plane / captain)
  <wave>/<sliceId>/state.json             # Level-2 (per-slice / orchestrator, nested dlm wave)
  <wave>/<sliceId>/*                       # artefak slice
  assumptions.md                          # OPSIONAL human-readable rollup (lihat catatan)
```
**Ralph** (point: slice):
```
<repo>/plans/ralph/<yyyy-mm-dd>-<slice>/
  state.json                              # slice state (orchestrator, no captain/DAG/wave)
  *                                        # artefak slice
```
Template master: pi config `templates/{fleet-captain,fleet-slice,ralph-slice}.state.template.json` — planner copy + instantiate ke `<repo>/plans/...`. Commit ke git untuk cross-machine resume; local-only cukup file di disk (fleet-knowledge §101).

---

## Level-1 — control-plane / captain state (`state.json`)
Owner: fleet control plane, di-track captain lintas turn. Coarse. Yang dibaca "continue" untuk tahu wave mana dilanjut.

```jsonc
{
  "runName": "add-billing-2026-07-01",     // captain track ini utk resume re-invoke
  "schemaVersion": 1,
  "createdAt": "2026-07-01T...Z",
  "updatedAt": "2026-07-01T...Z",          // ditulis tiap phase boundary + tiap slice status change

  "baseBranch": "main",
  "integrationBranch": "fleet/add-billing",

  "phases": {                               // mana yg sudah selesai (skip saat resume)
    "plan":  "done",
    "gate":  "done",
    "setup": "done",
    "waves": { "0": "done", "1": "running", "2": "pending" }
  },

  "sliceDag": [                             // DAG penuh + waktu + ASSIGNMENT (utk resume deterministik)
    {
      "id": "s1", "dependsOn": [], "wave": 0,
      "faultTolerance": "low",            // low | standard | trivial — ditetapkan PLANNER, sumber kebenaran routing
      "assignment": {                      // safety ratchet: hanya boleh UPGRADE, tak pernah downgrade
        "plannedImplementer": "implementer-critical",   // by faultTolerance: low→critical, standard→implementer, trivial→implementer-lite
        "plannedReviewer":    "deep-reviewer",          // low→deep-reviewer, standard→reviewer, trivial→(none/reviewer)
        "effectiveImplementer": "implementer-critical", // = planned, KECUALI orchestrator upgrade (≥ planned tier)
        "effectiveReviewer":    "deep-reviewer"
      }
    },
    { "id": "s2", "dependsOn": ["s1"], "wave": 1, "faultTolerance": "standard",
      "assignment": { "plannedImplementer": "implementer", "plannedReviewer": "reviewer",
                       "effectiveImplementer": "implementer", "effectiveReviewer": "reviewer" } },
    { "id": "s3", "dependsOn": ["s1"], "wave": 1, "faultTolerance": "trivial",
      "assignment": { "plannedImplementer": "implementer-lite", "plannedReviewer": "reviewer",
                       "effectiveImplementer": "implementer-lite", "effectiveReviewer": "reviewer" } }
  ],
  // ASSIGNMENT RULES:
  //  - planner SET faultTolerance + planned* saat Plan (deterministik, ditulis Level-1).
  //  - tier order: implementer-lite < implementer < implementer-critical ; reviewer < deep-reviewer.
  //  - orchestrator boleh NAIKKAN effective* ≥ planned* (lihat slice lebih beresiko). TAK boleh turunkan.
  //  - RESUME baca effective* dari Level-1 → tau persis siapa implementer+reviewer, no re-judgment, no silent-downgrade.

  "slices": {                               // status per slice (resume: skip/rebuild/re-merge)
    "s1": { "status": "merged",  "branch": "fleet/add-billing/s1", "level2": "slices/s1.json" },
    "s2": { "status": "running", "branch": "fleet/add-billing/s2", "level2": "slices/s2.json" },
    "s3": { "status": "pending", "branch": null,                   "level2": null }
  },
  // status enum: pending | running | passed | failed | merged | conflicted | blocked-soft | blocked-hard

  "knowledge": [ /* accumulated knowledge[] items, reload saat resume */ ],

  "stopFlag": {                             // captain stop-decision (hard-dependency mati)
    "stopped": false,
    "reason": null,                         // mis "s1 hard-dep DB migration failed, s2/s3 depend on it"
    "stoppedAt": null
  }
}
```

**Catatan status baru** (dari diskusi 4-scope):
- `blocked-hard` — hard-dependency mati. Captain → stopFlag → STOP fleet.
- `blocked-soft` — orchestrator parkir slice (judgment tak bisa diputus aman / lewat boundary di scope 2). Wave lain lanjut; user resolve saat bangun. (Catatan: di scope 3 default = putuskan-sendiri, jadi blocked-soft jarang di fleet; lebih relevan scope 2.)

---

## Level-2 — slice-orchestrator state (`slices/<sliceId>.json`)
Owner: slice orchestrator. Fine. Progress SATU slice biar resume mid-slice (tak rebuild dari nol). Slice bisa jalan BERJAM-JAM → wajib persist (fleet-knowledge §80).

```jsonc
{
  "sliceId": "s2",
  "schemaVersion": 1,
  "branch": "fleet/add-billing/s2",
  "updatedAt": "2026-07-01T...Z",

  "step": "review",                         // current step: impl | review | knowledge-write | done
  "stepsDone": ["impl"],                     // resume: skip ini

  "impl": {
    "committed": true,                       // CRITICAL: partial work HARUS di branch, bukan cuma state
    "lastCommitSha": "a1b2c3d",              // resume = checkout branch@sha + lanjut
    "incrementalCommits": ["...","a1b2c3d"]  // commit-on-meaningful-progress (fleet-knowledge §84)
  },

  "assignment": {                           // mirror Level-1 effective* + jejak upgrade (resume baca ini)
    "implementer": "implementer-critical",   // = Level-1 effectiveImplementer saat dispatch
    "reviewer":    "deep-reviewer",          // = Level-1 effectiveReviewer
    "upgradedFromPlan": false,               // true kalau orchestrator naikkan tier dari planned
    "upgradeReason": null                    // mis "slice ternyata sentuh token signing, naikkan ke critical"
  },

  "review": {
    "reached": false,
    "verdict": null,                         // pass | fail | needs-fix
    "reviewer": "deep-reviewer",             // agent yg dipakai (= assignment.reviewer)
    "issues": []
  },

  "assumptions": [                           // BARU: orchestrator putuskan-sendiri (scope 1-3)
    {
      "id": "a1",
      "at": "2026-07-01T...Z",
      "context": "spec ambigu: retry pada semua endpoint atau idempotent saja?",
      "decision": "retry hanya GET/PUT/DELETE, never POST",
      "rationale": "POST non-idempotent, retry bisa double-charge",
      "reversible": true,
      "durable": false,                      // true → kandidat promote ke .agents/rules
      "reviewedByUser": false                // user flip true saat review pasca-bangun
    }
  ],

  "escalations": [                           // BARU: jejak intercom (jika contact_supervisor aktif)
    {
      "at": "2026-07-01T...Z",
      "from": "implementer",
      "reason": "need_decision",             // need_decision | interview_request | progress_update
      "question": "auth service balikin 403 bukan 401 utk expired token. treat sbg re-auth?",
      "resolvedBy": "orchestrator",          // orchestrator (fleet) | user (scope 1/2)
      "answer": "treat 403 sbg re-auth trigger",
      "ledToAssumption": "a1"                // optional link ke assumptions[]
    }
  ],

  "knowledgeDelta": [ /* durable conventions ditemukan di slice ini → pipeline ke knowledge[] */ ]
}
```

---

## Assignment & safety ratchet (ditetapkan user)
Gap yang ditutup: saat resume, orchestrator harus tahu PERSIS siapa implementer + reviewer tiap slice — bukan re-judgment. Slice money-flow yang ke-resume dengan implementer Sonnet (padahal harus Opus `implementer-critical`) = silent failure, persis yang mau dicegah.

**Aturan:**
1. **Planner tetapkan saat Plan.** Tiap slice dapat `faultTolerance` (low/standard/trivial) + `planned*` assignment. Deterministik, ditulis Level-1 `sliceDag`.
   - Mapping default: `low → implementer-critical + deep-reviewer`, `standard → implementer + reviewer`, `trivial → implementer-lite + reviewer`.
2. **Tier order (untuk ratchet):** implementer-lite < implementer < implementer-critical ; reviewer < deep-reviewer.
3. **Orchestrator UPGRADE-only.** Saat dispatch, kalau orchestrator lihat slice lebih beresiko dari klasifikasi planner (mis ternyata sentuh token signing), dia boleh NAIKKAN `effective*` ≥ `planned*`. **TAK boleh turunkan.** Upgrade dicatat di Level-2 `assignment.upgradedFromPlan` + `upgradeReason`.
4. **Resume = deterministik.** Baca `effectiveImplementer`/`effectiveReviewer` dari Level-1 (mirror di Level-2). Tak ada re-judgment, tak ada silent-downgrade. Slice low-tolerance selalu di-resume dengan worker tier yang benar.

Ini juga menyelaraskan AGENTS.md escalation-trigger: trigger auth/secrets/migration/schema/money sudah route REVIEW ke deep-reviewer; sekarang sisi IMPLEMENT-nya route ke implementer-critical lewat `faultTolerance: low`.

## Interplay Level-1 ↔ Level-2 (resume flow)
Per fleet-knowledge §86 + ditambah field baru:
1. Dispatch slice → Level-1 `slices.s2.status = running`.
2. Slice jalan → orchestrator tulis Level-2 tiap step + tiap assumption/escalation.
3. Selesai → slice return → Level-1 flip `passed`/`failed`/`merged`.
4. **Interupsi (rate-limit):** Level-1 slice tetap `running`. Resume:
   - Captain re-invoke `/fleet runName=<same> args.resume=true`.
   - Control plane baca Level-1: skip phase done, masuk wave pertama-belum-selesai.
   - Slice `running` → re-enter orchestrator → baca Level-2 → skip `stepsDone`, checkout `branch@lastCommitSha`, lanjut dari `step`.
   - `assumptions[]` ter-load → orchestrator TAK tanya/putuskan ulang hal yang sudah diputus.
   - `knowledge[]` reload dari Level-1 (atau re-read `.agents/rules`).

## Assumption lifecycle (jawab pertanyaan user)
- Orchestrator putuskan-sendiri → tulis ke `Level-2.assumptions[]` (audit + resume).
- Jika `durable: true` → masuk juga ke `knowledgeDelta[]` → pipeline `knowledge[]` → `.agents/rules` (durable, team-shared). **Dua-duanya, peran beda.**
- User bangun → baca assumptions (per-slice atau rollup `assumptions.md`) → flip `reviewedByUser`, revert yang salah (semua `reversible` idealnya).

## Catatan `assumptions.md` (opsional rollup)
Level-2 `assumptions[]` tersebar per-slice. Untuk human-review cepat pasca-bangun, control plane BISA generate rollup kronologis `plans/fleet/<runName>/assumptions.md` (human-readable) dari semua Level-2. Bukan source-of-truth (itu state.json), cuma view. Tunda sampai butuh.

---

## Per-scope: apakah butuh state file?
| Scope | Level-1 | Level-2 | assumptions[] | Alasan |
|---|---|---|---|---|
| 1. Small fix | ❌ | ❌ | inline chat | task pendek, user hadir, no resume perlu |
| 2. Feature/ralph | ringan | ✅ | ✅ | ralph bisa panjang; assumptions utk review saat balik |
| 3. Fleet | ✅ | ✅ | ✅ | resume 12 jam wajib; ini use-case utama |
| 4. Debug | ❌ | ❌ | inline | solo+scout, user hadir, ephemeral |

State-file pattern = **terutama untuk scope 3 (fleet), parsial scope 2 (ralph).** Scope 1 & 4 tak butuh (user hadir, task ephemeral).

---

## Pertanyaan terbuka tersisa
1. Routing rule belum di AGENTS.md: orchestrator perlu instruksi eksplisit "pilih implementer-critical untuk slice `faultTolerance: low`" + aturan upgrade-only. Sisi implement belum disebut (sisi review sudah). Perlu tambah — nyentuh AGENTS.md, butuh izin.
2. `contact_supervisor` (utk `escalations[]` otomatis) butuh nicobailon/pi-subagents — @tintinweb-mu belum. Tanpa itu, `escalations[]` diisi manual oleh orchestrator. Keputusan infra, tunda.
2. Format commit-incremental: tiap step atau tiap N-menit? (fleet-knowledge bilang "commit-on-meaningful-progress" — perlu definisi "meaningful").
3. Siapa nulis Level-1 saat captain = workflow in-memory? (fleet-knowledge §92: workflow in-memory hilang saat die → siapa flush ke disk & kapan). Ini blocker implementasi, bukan skema.
