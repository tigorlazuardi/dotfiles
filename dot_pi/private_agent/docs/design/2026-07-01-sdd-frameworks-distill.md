# SDD Frameworks Distill — OpenSpec vs Superpowers vs bigpowers

**Tanggal:** 2026-07-01
**Tujuan:** Distill konsep dari tiga framework spec/skill-driven untuk diserap ke workflow orchestrator/fleet/ralph yang sudah ada di `~/.pi/agent/AGENTS.md`. **Bukan** adopsi wholesale — ambil konsep, integrasi ke workflow existing.
**Status:** Memo analisis. Belum mengubah rule apa pun. Review → promote yang terpilih ke `.agents/rules` nanti (butuh izin eksplisit).

---

## 1. Profil tiga framework

| | **OpenSpec** | **Superpowers** (obra) | **bigpowers** |
|---|---|---|---|
| Inti | Spec-driven, spec = living doc di repo | Skill-driven methodology, TDD + subagent | SDLC penuh prescriptive, vertical-slice |
| Berat | Ringan (4 fase fluid) | Sedang (7 skill workflow) | **Berat** (70 skill, 6 fase, semver, metrics) |
| Unit kerja | "change" folder | "skill" composable, auto-trigger | "epic → story", 8-step build cycle |
| State | `tasks.md` + specs di repo | `plan_tracker` (session, TUI) | `specs/state.yaml` + `handoff.next_skill` |
| Resume | tasks.md anchor | plan_tracker rebuild dari branch | `survey-context` baca `state.yaml` |
| Knowledge | archive → `specs/` permanen | skills file | `specs/adr/`, hierarchy-of-truth |
| pi support | native slash | native skills + bootstrap inject | 62 pi skills + prompt templates + MCP |
| Sumber | openspec.dev, github.com/Fission-AI/OpenSpec | github.com/obra/superpowers | npm bigpowers@2.x, github.com/danielvm-git/bigpowers |

### OpenSpec — 4 fase fluid
`Proposal → Planning → Implementation → Archiving`. Per change = folder `openspec/changes/<id>/` berisi `proposal.md` (why+scope+success) / `design.md` (decisions) / `tasks.md` (checklist) / `specs/` (spec deltas). Selesai → `archive/` + konsolidasi ke `openspec/specs/` permanen. Prinsip: brownfield-first, spec ringkas (~250 vs ~800 baris), specs hidup di repo bukan throwaway prompt, fluid bukan gate kaku.

### Superpowers — 7 skill auto-trigger
`brainstorming → using-git-worktrees → writing-plans → subagent-driven-development/executing-plans → test-driven-development → requesting-code-review → finishing-a-development-branch`. Skill trigger otomatis ("agent cek skill sebelum task — mandatory, bukan saran"). TDD RED-GREEN-REFACTOR enforced (hapus code yang ditulis sebelum test). Subagent-driven = fresh subagent per task + **2-stage review** (spec-compliance dulu, lalu code-quality). Port pi (coctostan/pi-superpowers) tambah `plan_tracker` tool (state di session + TUI progress, rebuild dari conversation branch).

### bigpowers — SDLC berat + akunting
6 fase: `DISCOVER → ELABORATE → PLAN → BUILD → VERIFY → RELEASE`. Per story = 8-step build cycle (survey-context → plan-work → kickoff-branch → develop-tdd → verify-work → audit-code ≥94% → commit-message → release-branch). **Hierarchy of Truth** (7 level dokumen, tiap level 1 file). **`next_skill` signaling**: tiap skill kritis tulis `handoff.next_skill` ke `state.yaml`; resume = panggil `survey-context` baca state. BCP accounting + `cycle-times.yaml` metrics. Semver auto. MCP server expose skill sebagai tool.

---

## 2. Konvergensi (3 framework setuju → sinyal kuat)

1. **Spec/plan sebelum code.** Semua menolak "jump to code". → Workflow-mu sudah: `/grill` + Plan + SCOPE/RALPH.
2. **State file di disk = resume anchor.** OpenSpec `tasks.md`, bigpowers `state.yaml`, SP `plan_tracker`. → **Jawaban langsung untuk resume-gap fleet/ralph** (tercatat di `fleet-knowledge.md`).
3. **Knowledge consolidation lintas-sesi.** OpenSpec archive→specs, bigpowers adr/hierarchy, SP skills. → Workflow-mu sudah: `.agents/rules` + `.agents/skills`.

Konvergensi = bukti pola-mu benar. Yang kurang cuma **mekanik state-file konkret** (poin 2).

---

## 3. Tiga konsep yang layak diserap

### Konsep A — State-file pattern (jawab resume-gap) ⭐ prioritas
**Sumber:** bigpowers `state.yaml` + `handoff.next_skill`, OpenSpec change-folder, SP `plan_tracker`.

Resume-gap fleet/ralph (per `fleet-knowledge.md`): butuh Level-1 (control-plane: wave/slice status/knowledge) + Level-2 (per-slice progress). Belum ada skema disk konkret.

**Serap:**
- **Change-folder struktur** (OpenSpec) → tiap fleet-run/ralph-slice punya folder konsisten: `proposal.md` (why+success criteria) / `design.md` (decisions) / `tasks.md` (checklist = resume anchor) / `state.json` (current).
- **`handoff.next_skill` pola** (bigpowers) → `state.json` simpan langkah terakhir selesai + langkah berikutnya. Resume = baca state, lompat ke next, skip yang done.
- **Hard prerequisite** (sudah dicatat di fleet-knowledge): impl harus COMMIT incremental ke branch slice — state file yang nunjuk edit uncommitted = useless.

**Tidak diserap:** BCP/cycle-times metrics, semver-auto (overkill solo).

### Konsep B — Spec-delta format
**Sumber:** OpenSpec spec delta (`+`/`-` requirement + scenario GIVEN/WHEN/THEN).

Review *perubahan* requirement, bukan dump full spec. Reviewer paham niat dalam detik. Format:
```
### Requirement: Session expiration
- The system SHALL expire sessions after a configured duration.
+ The system SHALL support configurable session expiration periods.
#### Scenario: Extended session with remember me
+ - GIVEN user checks "Remember me" at login
+ - WHEN 30 days have passed
+ - THEN invalidate the session token
```
**Serap:** SCOPE/RALPH/grill output pakai diff-style spec untuk perubahan ke sistem existing (brownfield). Percepat /grill→Plan review.

### Konsep C — 2-stage subagent review
**Sumber:** Superpowers subagent-driven-development.

Tiap task: fresh subagent, lalu **dua tahap review terpisah** — (1) spec-compliance (apakah sesuai plan?), (2) code-quality (apakah bersih?). Critical issue block progress.

**Serap:** Pertegas pipeline `implementer → reviewer → deep-reviewer`-mu. Punyamu campur dua concern; pisahkan jadi gate-1 spec-compliance, gate-2 code-quality. Escalation deep-reviewer (auth/secrets/migration) tetap di gate-2.

---

## 4. Yang TIDAK diserap (terlalu berat untuk solo-orchestrator)

| Fitur | Asal | Alasan tolak |
|---|---|---|
| BCP accounting + cycle-times.yaml | bigpowers | Metrics proses, overkill solo |
| Quality-score gate ≥94%, UAT gate | bigpowers | Gate kaku, prescriptive |
| Semver auto (0.0.0-β → minor per feat) | bigpowers | Tak cocok semua repo |
| MCP server expose skill sebagai tool | bigpowers | Sudah punya skill lazy-load |
| Hierarchy of Truth 7-level penuh | bigpowers | Sebagian berguna (Scope/Decisions/Current), tapi 7 file overkill |
| 70-skill prescriptive library | bigpowers | Worker-pool-mu sudah cukup |
| CLI + slash `/opsx:*`, `/skill:*` | OpenSpec/SP | Sudah punya `/fleet` `/ralph` `/grill` |
| Adopsi workflow wholesale | semua | Tujuan = distill konsep, bukan ganti |

---

## 5. Rekomendasi langkah

Urut prioritas:
1. **Konsep A** → promote jadi konkret di `fleet-knowledge.md`: definisikan skema `state.json` (Level-1 + Level-2) + change-folder layout + invariant commit-incremental. Ini menutup resume-gap yang sudah lama tercatat.
2. **Konsep C** → pertegas worker-pool review jadi 2-stage di AGENTS.md (gate spec-compliance vs code-quality).
3. **Konsep B** → opsional; tambah ke skill grill/plan sebagai format output untuk brownfield change.

Semua butuh izin eksplisit sebelum tulis ke `.agents/rules`/`AGENTS.md` (per konvensi knowledge-transfer normal-session).

---

## Sumber
- OpenSpec: https://openspec.dev/ · https://openspec.pro/workflow/ · github.com/Fission-AI/OpenSpec
- Superpowers: github.com/obra/superpowers · github.com/coctostan/pi-superpowers (port pi)
- bigpowers: https://pi.dev/packages/bigpowers · npm bigpowers@2.x · github.com/danielvm-git/bigpowers
