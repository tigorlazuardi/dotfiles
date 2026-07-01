# SCOPE — Implementasi State-Schema ke Workflow Fleet/Ralph Aktual

**Tanggal:** 2026-07-01
**Status:** SCOPE eksekusi per-slice. Belum ada kode. Menurunkan pekerjaan konkret dari desain skema (`docs/design/2026-07-01-fleet-ralph-state-schema.md` + `templates/{fleet-captain,fleet-slice,ralph-slice}.state.template.json`) ke workflow yang benar-benar jalan (`workflows/src/control_plane.js`, `workflows/src/slice_orchestrator.js`).
**Klasifikasi:** LOW-TOLERANCE. Menyentuh resume + routing worker. Salah = slice money/auth ke-resume dengan worker tier salah (silent downgrade) → silent failure — persis yang ratchet dirancang cegah.

**KEPUTUSAN USER (2026-07-01) — gerbang Kelompok B dibuka:**
- **D-1 = (a)** helper `persistState`/`loadState` DI DALAM workflow. Workflow flush state tiap fase; saat `args.resume=true`, fase pertama `loadState()` + skip fase/wave `done`. Tak ada supervisor eksternal.
- **D-2 = hybrid (a)+floor(c).** Slice biasa: commit per subtask logis (file/modul/fungsi + test lokal hijau). Slice `faultTolerance:low`: HANYA commit saat test relevan hijau (jangan tinggalkan money/auth setengah-jadi yang bisa ter-merge). `lastCommitSha` selalu nunjuk commit lulus-gate.
- **D-3 = (a)** `ralph-slice.state.template.json` = artefak PLANNER (sidecar RALPH.md yang dibaca saat susun kontrak), BUKAN runtime pi-ralph-loop. pi-ralph-loop tetap pakai `.ralph-runner` internalnya. **NOL slice kode ralph di repo ini.** Ralph = kontrak, bukan workflow JS.

**OQ-2/3/4 (backward-compat, save-pipeline, sandbox):** default aman planner dipakai; diselesaikan saat implementasi tiap slice, bukan blocker.

---

## 11. Branch-strategy detection & integrasi (KEPUTUSAN USER 2026-07-01)

Fleet/ralph HARUS deteksi model git repo sebelum menentukan cara integrasi. **Semua keputusan branch-strategy ditetapkan SEKALI di awal run (planning/Gate) saat user hadir, disimpan di state, lalu wave/slice berikutnya autonomous mengikuti — TAK interupsi mid-run.**

### Deteksi (cara captain tahu)
**Auto-deteksi + konfirmasi 1x di planning.** Captain scan:
- **Trunk-based?** git topology — cuma 1 long-lived branch (main), tak ada staging/develop; commit langsung ke main. vs classic (main/staging/develop).
- **Feature-flag/gate ada?** scan lib (unleash / LaunchDarkly / flagsmith / env-based gate) atau pola `if(flag)`.

Captain TAMPILKAN kesimpulan di planning (mis "deteksi: trunk-based + pakai unleash → rencana: auto-push tiap wave. Betul?"), user konfirm/koreksi **1x**. Hasil → simpan state + **tawarkan promote jadi `.agents/rules`** biar future fleet tak ulang deteksi/tanya.

### FLEET matrix
| Kondisi | Integrasi | Interaksi (di planning saja) |
|---|---|---|
| **trunk + flag ada** | bikin `fleet/<epic>`, **auto-push ke base tiap wave TANPA izin**; integrasikan feature-flag/gate **implicit** | konfirm deteksi; kalau flag belum jadi skill/rule → **tawarkan promote** (konsistensi) |
| **trunk, flag TAK ada** | sama seperti di atas | **tanya SEKALI di awal run** (bukan tiap wave): tiap wave selesai auto-merge+push ke base atau tidak? → simpan state. Tawarkan jadi rule ("base = branch ini → auto-merge") biar future fleet tak nanya |
| **classic (main/staging/dev)** | **tanya base branch** → bikin `fleet/<epic>` dari situ, kerja di sana | tanya base di planning; selesai → bikin **PR/MR atau kasih URL PR/MR** ke base |

### RALPH matrix (mirip fleet, lebih simpel)
| Kondisi | Aksi |
|---|---|
| **trunk + flag** | bikin `ralph/<slice>`, kerja, **langsung merge+push base** |
| **trunk, flag TAK ada** | bikin branch, kerja, **bikin PR/MR setelah selesai** |
| **classic** | **tanya checkout dari mana**, kerja, **PR/MR ke base setelah selesai** |

### ONE-SHOT
Langsung kerja **in-place** (di tempat), KECUALI ada knowledge (rule/skill) yang override ini.

### PR/MR tooling — TIDAK wajib (graceful degradation)
Untuk jalur `pr-mr` (classic + trunk-no-flag opt-out), PR/MR otomatis itu **best-effort, bukan hard requirement**. Alur (dilakukan **di planning bareng deteksi branch-strategy**, saat `integration=pr-mr` sudah diketahui):
1. **Probe** CLI tool (`gh` untuk GitHub / `glab` untuk GitLab): ada di PATH? auth proper (`gh auth status` / `glab auth status`)?
2. Belum wired → **tawarkan rekomendasi cara wiring 1x** saat user masih hadir (mis "install gh + `gh auth login`"). User setuju → wire; tolak → set **fallback URL-mode**.
3. **Simpan hasil ke state** (`prTool`, `prToolReady`, `prMode: cli|url`). Step akhir wave/slice autonomous ikut: `cli` → auto-bikin PR/MR; `url` → **print URL** utk bikin PR/MR manual.
4. Tawaran wiring bisa di-**promote jadi rule** biar future run tak ulang.

**Captain** yang probe untuk fleet (di planning, setelah tau integration mode). **Orchestrator** sendiri untuk ralph. One-shot in-place biasanya tak butuh PR/MR.

Catatan: kalau fleet 12h autonomous lalu CLI gagal saat step akhir (user absen), **selalu fallback ke URL-mode** — jangan block run. Probe di planning cuma untuk menawarkan wiring selagi user hadir; kegagalan runtime tetap aman.

### Persist ke state (WAJIB — resume anchor)
Base branch + strategy tersimpan di state biar tak lupa saat resume. Field baru:
- **Level-1 fleet-captain:** `branchStrategy { model: "trunk" | "classic", featureFlag: bool, flagLib: string|null, integration: "auto-push" | "pr-mr", baseBranch: string, confirmedAtPlanning: bool, promotedRule: string|null }`
- **ralph-slice:** `branchStrategy { model, featureFlag, integration, baseBranch, promotedRule }`

### Slice baru (Kelompok A, tambahan)
| Slice id | fault-tol | desc | deps |
|---|---|---|---|
| `branch-strategy-detect` | **low** | Captain auto-deteksi trunk/classic + feature-flag; tampilkan di planning utk konfirmasi 1x; simpan `branchStrategy` ke Level-1 state; tawarkan promote rule. Ganti Setup yang skrg hard-code `integrationBranch=fleet/${runName}` dari `origin/${baseBranch}`. | plan-schema-assignment, write-level1-state |
| `wave-integration-mode` | **low** | Build loop: integrasi tiap wave ikut `branchStrategy.integration` — auto-push ke base (trunk) vs kumpulkan utk PR/MR (classic). Auto-merge yang skrg selalu ke `integrationBranch` → conditional. Termasuk **probe PR/MR CLI di planning** (gh/glab ada+auth?), tawaran wiring 1x, simpan `prTooling` ke state; step akhir: cli-mode auto-PR vs url-mode print URL; gagal runtime -> fallback url. | branch-strategy-detect |
| `ralph-branch-strategy` | **low** | (jika D-3 tetap (a): ini artefak planner, NOL kode workflow — ralph-slice template + ralph-plan skill sebut branchStrategy). Kalau kelak ada workflow ralph JS, jadi slice kode. | branch-strategy-detect |

**Low-tol semua** — kenapa: `auto-push ke base TANPA izin` (trunk+flag) itu efek langsung ke branch produksi; salah deteksi/strategi = push ke base yang salah. `deep-reviewer` wajib.

**OQ-5:** integrasi feature-flag "implicit" (trunk+flag) — seberapa jauh fleet nulis kode flag sendiri? Bungkus fitur baru dalam flag OFF-by-default otomatis, atau cuma pastikan tak aktif tanpa gate? Perlu definisi konkret sebelum `wave-integration-mode`/impl. Tanya user saat mulai slice itu.
**Referensi kontrak:** `AGENTS.md` §Worker pool / §Fault-tolerance routing / §Escalation triggers / §Resume-NOT-YET-IMPLEMENTED; `rules/fleet-knowledge.md` §64-105.

---

## 1. Tujuan (satu kalimat)

Bikin workflow fleet aktual **menulis + membaca** state.json bentuk template (Level-1 captain + Level-2 slice), dan **meroute implementer by fault-tolerance dengan ratchet upgrade-only**, sehingga desain state-schema jadi perilaku nyata — tanpa memutus dulu blocker arsitektur resume penuh.

## 2. Kenapa low-tolerance

- **Routing worker (ratchet).** Kalau slice `faultTolerance: low` (money/auth/migration) ke-resume atau di-dispatch dengan `implementer` (Sonnet) padahal harus `implementer-critical` (Opus), itu **silent downgrade**. Tidak ada yang error; kodenya "jalan" tapi ditulis oleh tier yang salah. Ini kelas bug yang paling mahal karena tak kelihatan.
- **Resume anchor.** state.json adalah satu-satunya sumber kebenaran "siapa implementer/reviewer efektif tiap slice" saat proses mati. Kalau schema-nya salah tulis (mis. `effectiveImplementer` hilang), resume terpaksa re-judgment → non-deterministik → bisa downgrade.
- **Money-flow safety.** Slice yang menyentuh commit incremental setengah jalan + state file yang nunjuk ke edit uncommitted = state bohong. Resume dari state bohong bisa merge kerja setengah jadi. (Ini justru alasan Kelompok B diblokir, lihat §6.)

---

## 3. Temuan verifikasi (dibaca dari file, bukan asumsi)

| # | Klaim | Status verifikasi |
|---|---|---|
| V1 | control_plane.js: Plan→Gate→Setup→Build(wave)→Integrate, Kahn topo-wave, auto-merge, worktree, seedKnowledge+knowledgeDelta | **BENAR** (baris 1-265). |
| V2 | slice_orchestrator.js route REVIEWER by `slice.lowTolerance` (`deep-reviewer` vs `reviewer`) | **BENAR** (`reviewerType = slice.lowTolerance ? 'deep-reviewer' : 'reviewer'`). |
| V3 | IMPLEMENTER selalu `agentType: 'implementer'` — TIDAK route by fault-tolerance, TIDAK ada ratchet | **BENAR** (impl agent hard-coded `implementer`). |
| V4 | NOL persistensi state.json di kedua workflow (`grep state.json` = 0) | **BENAR**. Semua in-memory. |
| V5 | NOL resume — tak baca state.json, tak skip wave/step selesai | **BENAR**. Tak ada `args.resume` branch. |
| V6 | writeKnowledge helper nulis ke `.pi/rules` / `.pi/skills` | **BENAR** (control_plane.js writeKnowledge spec). AGENTS.md §Knowledge-transfer sekarang mewajibkan **`.agents/rules` / `.agents/skills`** repo-level. → **misalign**. |
| V7 | Plan schema pakai `tier` (string bebas) + `lowTolerance` (bool). TIDAK ada `faultTolerance` enum, `assignment{}`, `assumptions[]`, commit-sha, step-tracking | **BENAR**. |
| V8 | Path state: template + AGENTS.md pakai `<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/` & `<repo>/plans/ralph/<yyyy-mm-dd>-<slice>/`, repo-relatif, committed. control_plane.js pakai `runName` default `'integration'`, `integrationBranch = fleet/${runName}`, TIDAK ada folder `plans/` | **BENAR**. |
| V9 | **Ralph = pi-ralph-loop (npm), BUKAN workflow JS.** Menyimpan state di `.ralph-runner/` (dir sendiri, adjacent RALPH.md), punya resume sendiri (`/ralph-resume`, `runner-state.ts`). TIDAK punya konsep `faultTolerance` / `implementer-critical` / `deep-reviewer` / `assignment` | **BENAR** (src: `RUNNER_DIR_NAME=".ralph-runner"`, `pi.registerCommand("ralph-resume")`). skill `ralph-plan` mengonsepkan ralph sebagai kontrak RALPH.md + orchestrator model Sonnet/Opus, bukan workflow milik user. |

**Implikasi V9 (penting untuk scope):** `ralph-slice.state.template.json` **tidak** memetakan ke internal `.ralph-runner` state milik pi-ralph-loop. Tiga kemungkinan (lihat Open Question OQ-1) — SCOPE ini **tidak** membuat slice ralph yang menebak; ralph di-park sampai user memutuskan targetnya.

---

## 4. Peta gap → kelompok → slice → acceptance

Acceptance ditulis sebagai command konkret runnable dari root repo `~/.pi`. Untuk workflow yang tersimpan sebagai `fleet`/`slice_orchestrator`, sumber ada di `workflows/src/*.js` (asumsi build/save pipeline yang sudah dipakai user; kalau ada langkah `save` terpisah, itu masuk acceptance tiap slice — lihat OQ-3).

| Gap | Kel | Slice id | Acceptance command (runnable) |
|---|---|---|---|
| G1: IMPLEMENTER tak route by fault-tolerance; tak ada ratchet | **A** | `route-implementer-ratchet` | `node -e "const s=require('fs').readFileSync('workflows/src/slice_orchestrator.js','utf8'); if(!/implementer-critical/.test(s)||!/implementer-lite/.test(s)) process.exit(1)"` **dan** grep ada logika `effectiveImplementer`/upgrade-only (no downgrade). Lihat §5 acceptance detail. |
| G2: Plan schema tak punya `faultTolerance` enum + `assignment{}` | **A** | `plan-schema-assignment` | `node -e "const s=require('fs').readFileSync('workflows/src/control_plane.js','utf8'); if(!/faultTolerance/.test(s)||!/plannedImplementer/.test(s)) process.exit(1)"` |
| G3: knowledge nulis ke `.pi/rules` bukan `.agents/rules` | **A** | `knowledge-agents-dir` | `node -e "const s=require('fs').readFileSync('workflows/src/control_plane.js','utf8'); if(/\.pi\/rules|\.pi\/skills/.test(s)) process.exit(1); if(!/\.agents\/rules/.test(s)) process.exit(1)"` |
| G4: state.json tak pernah ditulis (Level-1) | **A** | `write-level1-state` | Jalankan fleet dry pada repo sandbox; assert `<repo>/plans/fleet/<date>-<epic>/state.json` ada + valid vs template (field: runName, phases, sliceDag[].assignment, slices[].status, knowledge, stopFlag). Command: `test -f "$SANDBOX/plans/fleet/"*/state.json && node scripts sanity` (lihat §5). |
| G5: state.json tak pernah ditulis (Level-2 per-slice) | **A** | `write-level2-state` | Assert `<repo>/plans/fleet/<date>-<epic>/<wave>/<sliceId>/state.json` ada + valid vs `fleet-slice` template (sliceId, assignment, step, impl.committed, review, assumptions[]). |
| G6: path state pakai `plans/fleet/<date>-<epic>/`, bukan `runName='integration'` telanjang | **A** | `state-path-convention` | grep control_plane.js: derivasi `plans/fleet/${date}-${epic}/`; assert folder terbentuk saat run. (Bagian dari G4/G6, boleh gabung — lihat DAG.) |
| G7: telemetry state-transition (log tiap fase + wave/slice status + assumption trail) | **A** | (masuk acceptance G4+G5, bukan slice terpisah) | Assert `log(...)` state-transition tiap phase boundary + tiap slice status change ada di source; assert state.json punya `updatedAt` yang berubah per fase. |
| G8: resume penuh — baca state.json, skip phase/wave/step selesai | **B** | `resume-level1`, `resume-level2` | **BLOCKED** todo #3. Acceptance ditulis, tapi tak dieksekusi sampai keputusan §6 diambil. |
| G9: commit-incremental mid-slice (prasyarat resume mid-slice) | **B** | `commit-incremental` | **BLOCKED** todo #4 (definisi "meaningful progress"). |
| G10: ralph state schema → target belum jelas | **BLOCKED (OQ-1)** | — | Tidak ada slice sampai OQ-1 dijawab. |

---

## 5. Slice DAG (Kelompok A — bisa dikerjakan SEKARANG)

DAG nyata: `route-implementer-ratchet` dan `knowledge-agents-dir` independen (paralel). `plan-schema-assignment` prasyarat state-writing karena state menuliskan `assignment`.

```
Wave 0 (paralel):
  ├─ plan-schema-assignment        (deps: [])
  ├─ knowledge-agents-dir          (deps: [])
  └─ route-implementer-ratchet     (deps: [])   ← low-tol

Wave 1:
  ├─ write-level1-state            (deps: [plan-schema-assignment])   ← low-tol
  └─ write-level2-state            (deps: [plan-schema-assignment, route-implementer-ratchet])   ← low-tol

Wave 2:
  └─ state-path-convention         (deps: [write-level1-state])   ← low-tol (boleh di-fold ke write-level1-state)
```

### A1 — `plan-schema-assignment`
- **desc:** Ganti Plan schema di control_plane.js: `tier`(string)+`lowTolerance`(bool) → `faultTolerance` enum (`low|standard|trivial`) + hitung `assignment{plannedImplementer, plannedReviewer, effectiveImplementer, effectiveReviewer}` per slice pakai mapping default (low→implementer-critical+deep-reviewer, standard→implementer+reviewer, trivial→implementer-lite+reviewer). Tulis ke struktur `sliceDag[]` yang sesuai `fleet-captain` template.
- **paths:** `workflows/src/control_plane.js`
- **deps:** []
- **faultTolerance:** low — ini yang menentukan routing semua slice hilir; salah mapping = salah tier di mana-mana.
- **acceptance:** schema JSON punya `faultTolerance` enum; fungsi mapping deterministik ada; unit-check `node -e` mapping low→implementer-critical. Backward-compat: kalau upstream plandoc masih `lowTolerance`, terjemahkan (`lowTolerance:true ⇒ faultTolerance:low`).

### A2 — `knowledge-agents-dir`
- **desc:** writeKnowledge helper + slice knowledgeDelta target dari `.pi/rules`/`.pi/skills` → `.agents/rules`/`.agents/skills` (repo-level, committed). Frontmatter tetap (`paths:` untuk rule, `name:`+`description:` untuk skill).
- **paths:** `workflows/src/control_plane.js` (helper writeKnowledge), cek juga slice_orchestrator.js kalau ada tulis langsung.
- **deps:** []
- **faultTolerance:** standard — mekanikal path swap; low-radius, mudah verifikasi. (Bukan low: tak sentuh routing/resume/money.)
- **acceptance:** `grep '\.pi/rules\|\.pi/skills' workflows/src/control_plane.js` = kosong; `grep '.agents/rules'` = ada.

### A3 — `route-implementer-ratchet`  ← LOW-TOL
- **desc:** slice_orchestrator.js: pilih `agentType` implementer dari `slice.assignment.effectiveImplementer` (bukan hard-coded `implementer`). Terapkan ratchet upgrade-only: orchestrator boleh NAIKKAN `effective*` ≥ `planned*` (catat `upgradedFromPlan`+`upgradeReason` di Level-2), TAK boleh turunkan. Reviewer juga baca `effectiveReviewer` (bukan bool `lowTolerance` telanjang) supaya konsisten dgn assignment.
- **paths:** `workflows/src/slice_orchestrator.js`
- **deps:** []  (bisa paralel; konsumsi `assignment` dari args slice yang A1 hasilkan — kalau A1 belum landing, fallback ke default mapping dari `slice.lowTolerance` supaya slice ini tetap self-testable)
- **faultTolerance:** LOW — **kenapa:** ini jantung silent-downgrade. Salah di sini = slice money di-implement Sonnet diam-diam. Butuh `deep-reviewer` gate.
- **acceptance:** grep ada `implementer-critical`+`implementer-lite`; ada guard downgrade (test: planned=implementer-critical, orchestrator coba set implementer → effective tetap implementer-critical). Test: low slice → `effectiveImplementer==='implementer-critical'`.

### A4 — `write-level1-state`  ← LOW-TOL
- **desc:** control_plane.js menulis `<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/state.json` (Level-1) SETELAH tiap phase boundary (Plan/Gate/Setup) DAN tiap perubahan status slice dalam wave. Bentuk = `fleet-captain` template: `runName, schemaVersion, phases{plan,gate,setup,waves{}}, sliceDag[]+assignment, slices{}.status, knowledge[], stopFlag`. **Tulis-saja untuk sekarang** (belum di-reload — reload = Kelompok B). `updatedAt` refresh tiap tulis. Ini persist helper yang dipanggil workflow tiap fase (kandidat jawaban blocker §6, tapi versi "write-only" tak butuh keputusan penuh karena belum ada reload/commit contract).
- **paths:** `workflows/src/control_plane.js`
- **deps:** [plan-schema-assignment]
- **faultTolerance:** LOW — **kenapa:** ini resume anchor + audit trail. Field salah = resume masa depan baca tier/status salah. Butuh `deep-reviewer` untuk validasi bentuk vs template.
- **acceptance:** jalankan fleet di repo sandbox sampai ≥1 wave; assert file ada di path benar; validasi field vs template (script sanity yang membandingkan keys). Assert `state-transition` di-`log()` tiap fase (telemetry, §7). Assert `updatedAt` berubah antar fase.

### A5 — `write-level2-state`  ← LOW-TOL
- **desc:** slice_orchestrator.js menulis `<repo>/plans/fleet/<...>/<wave>/<sliceId>/state.json` (Level-2, `fleet-slice` template): `sliceId, assignment{implementer,reviewer,upgradedFromPlan,upgradeReason}, step, stepsDone[], impl{committed,lastCommitSha,incrementalCommits}, review{reached,verdict,reviewer}, assumptions[], knowledgeDelta[]`. Tulis tiap step boundary. **Write-only** (reload = B). `impl.committed` boleh diisi dari commit tunggal yang sudah ada di orchestrator hari ini (step 5 `git commit`); commit-incremental multi-titik = Kelompok B.
- **paths:** `workflows/src/slice_orchestrator.js`
- **deps:** [plan-schema-assignment, route-implementer-ratchet]
- **faultTolerance:** LOW — **kenapa:** menyimpan `assignment.upgradedFromPlan`+`upgradeReason` (jejak ratchet) dan `assumptions[]` (audit keputusan orchestrator). Salah = jejak ratchet/assumption hilang, resume masa depan tak bisa dipercaya.
- **acceptance:** run sandbox; assert Level-2 file per slice ada + valid vs template; assert `assignment` mirror Level-1 `effective*`; assert `assumptions[]` ter-append saat orchestrator putuskan sesuatu; telemetry: step transition + slice status di-log.

### A6 — `state-path-convention` (opsional fold ke A4)  ← LOW-TOL
- **desc:** derivasi path `plans/fleet/<yyyy-mm-dd>-<epic>/` dari `runName`/`task` (bukan `integrationBranch='fleet/integration'` telanjang). `<epic>` diturunkan dari runName; tanggal dari createdAt. Pastikan repo-relatif (root repo proyek tempat fleet jalan), BUKAN `~/.pi`.
- **paths:** `workflows/src/control_plane.js`
- **deps:** [write-level1-state]
- **faultTolerance:** low — path salah = state ditulis ke tempat salah / ke `~/.pi` (bukan committed di repo). Boleh di-fold ke A4 kalau reviewer setuju satu PR.
- **acceptance:** run sandbox; assert folder cocok pola `plans/fleet/YYYY-MM-DD-<epic>/`; assert BUKAN di bawah `~/.pi`.

> **Catatan low-tol cluster:** A3,A4,A5,A6 semua `deep-reviewer`. Kalau dijalankan via fleet sendiri (dogfood), pastikan `faultTolerance:low` di-set supaya A1's mapping route `implementer-critical`. (Meta: bug di A1/A3 bisa salah-route slice-nya sendiri — jadi review manual pertama disarankan sebelum dogfood.)

---

## 6. Keputusan yang USER harus ambil dulu (Kelompok B — blocker todo #3/#4)

Ini gerbang. Kelompok B **tidak dieksekusi** sampai user memilih. Tiap keputusan: pertanyaan tajam + opsi + rekomendasi.

### D-1 (todo #3) — SIAPA yang flush Level-1 state ke disk saat workflow in-memory per-turn?
**Masalah:** `workflow()` run itu in-memory untuk turn-nya. Proses mati / rate-limit → run hilang. Menulis state.json write-only (Kelompok A) tak cukup untuk **resume**: resume butuh entitas yang, saat "continue", **membaca kembali** state dari disk dan me-reconstruct run.

- **Opsi (a) — Helper persist yang dipanggil workflow tiap fase.** Workflow memanggil `persistState(level1)` setelah Plan/Gate/Setup/tiap wave; saat re-invoke `args.resume=true`, fase pertama = `loadState()` lalu skip fase/wave `done`. Reconstruction terjadi DI DALAM workflow run baru. **Rekomendasi: INI.** Paling dekat dengan arsitektur sekarang; write-only (Kelompok A) sudah separuh jalan; hanya tambah baca + branch resume. Tak butuh proses supervisor eksternal.
- **Opsi (b) — Supervisor/captain di luar workflow yang meng-orchestrate re-invoke.** Entitas resident (main agent/captain) yang deteksi mati, baca state, panggil ulang workflow dengan args resume. Lebih tangguh terhadap process death total, tapi butuh komponen baru + kontrak captain↔disk. **Rekomendasi: tunda** — over-engineered untuk kebutuhan sekarang; bisa jadi lapisan di atas (a) nanti.
- **Opsi (c) — External durable queue/state store.** Berlebihan untuk single-user local tool. **Tolak.**

**Rekomendasiku: (a).** Alasan: Kelompok A sudah menulis state bentuk template; resume = tambah `loadState()` + branch skip. Blast radius kecil, tak ada komponen infra baru.

### D-2 (todo #4) — Definisi "meaningful progress" untuk commit-incremental mid-slice.
**Masalah:** Resume mid-slice mustahil kalau kerja impl tak di-commit incremental ke slice branch — state file yang nunjuk edit uncommitted = tak berguna (kerja mati bersama sesi in-memory). fleet-knowledge bilang "commit-on-meaningful-progress" tapi "meaningful" belum didefinisikan.

- **Opsi (a) — Per-completed-subtask.** Commit tiap unit logis selesai (satu file/modul/fungsi + test hijau lokal). Rekomendasi kalau slice bisa dipecah subtask jelas.
- **Opsi (b) — Per-N-menit / per-checkpoint waktu.** Commit tiap interval (mis. 10 menit) tanpa peduli batas logis. Lebih sederhana, tapi commit setengah-jadi bisa gagal acceptance.
- **Opsi (c) — Per-acceptance-green.** Hanya commit saat acceptance/subset test hijau. Paling aman (tak pernah commit broken), tapi bisa lama antar commit di impl besar → window kehilangan lebar.
- **Rekomendasiku: (a) dengan floor (c) untuk slice low-tolerance.** Slice biasa: commit per subtask logis. Slice `faultTolerance:low`: HANYA commit saat test relevan hijau (jangan pernah tinggalkan money/auth setengah jadi yang bisa ter-merge). `lastCommitSha` di Level-2 selalu nunjuk commit yang lulus gate-nya sendiri.

### D-3 (OQ-1, dari V9) — Target `ralph-slice.state.template.json` yang sebenarnya apa?
**Masalah:** pi-ralph-loop sudah punya state (`.ralph-runner/`) + resume (`/ralph-resume`) sendiri, dan **tak** punya faultTolerance/assignment. Template ralph-slice punya `assignment`+`faultTolerance`+`assumptions`+`parkedQuestions` yang TIDAK ada di pi-ralph-loop.

- **Opsi (a) — Template ralph-slice adalah artefak PLANNER (kontrak RALPH.md sidecar), bukan runtime state pi-ralph-loop.** Planner (`ralph-plan` skill) menulis assignment+faultTolerance ke sebuah state file yang dibaca manusia/orchestrator saat menyusun RALPH.md; pi-ralph-loop tetap pakai `.ralph-runner` internalnya. **Rekomendasi: paling mungkin** — konsisten dgn `ralph-plan` yang memisahkan planner (Opus) dari executor (loop). Ralph di sini = kontrak, bukan workflow JS.
- **Opsi (b) — Fleet slice_orchestrator dipakai juga untuk "ralph mode" (single-slice, no captain), dan ralph-slice template = state Level-2 mode itu.** Berarti ada workflow ralph baru berbasis slice_orchestrator, bukan pi-ralph-loop. Perlu keputusan besar (bikin workflow ralph JS).
- **Opsi (c) — Integrasi: pi-ralph-loop diajari baca assignment dari sidecar.** Butuh modifikasi package pihak-ketiga. **Tolak** kecuali user mau fork.
- **Rekomendasiku: (a).** SCOPE ini **tidak membuat slice ralph** sampai user pilih. Kalau (a): ralph-slice template murni artefak planner, tak ada perubahan kode workflow → nol slice implementasi di repo ini. Kalau (b): buka SCOPE terpisah untuk "workflow ralph JS".

---

## 7. Telemetry (bagian dari acceptance, bukan afterthought)

Workflow ini jalan berjam-jam → observability wajib masuk acceptance tiap slice state-writing (A4/A5), bukan tiket susulan. Mengikuti `AGENTS.md` §Telemetry + `skills/telemetry-planning`.

**Minimum yang harus ada (dan diuji di acceptance A4/A5):**
- **State-transition log tiap phase boundary.** `log("phase=<name> status=done->running")` di Plan/Gate/Setup/tiap wave. Sudah ada `log()` untuk wave; lengkapi tiap fase + tiap slice status change.
- **Wave/slice status trail.** Tiap slice flip `pending→running→passed/failed/merged/conflicted` di-log + tercermin di `state.json.slices[].status` dengan `updatedAt` baru. Ini metrik jejak untuk audit run panjang.
- **Assumption trail.** Tiap kali orchestrator putuskan-sendiri → append `assumptions[]` di Level-2 **dan** log satu baris (`assumption id=a1 slice=<id> reversible=<bool>`). Ini yang user baca pasca-run.
- **Ratchet-upgrade event.** Saat orchestrator naikkan tier → log `ratchet slice=<id> planned=<x> effective=<y> reason=<...>` + set `upgradedFromPlan`. Silent upgrade sama bahayanya dgn silent downgrade untuk audit.
- **Redaksi:** state.json + log TIDAK boleh menuliskan secret/token (Tier A redact). Nama field tetap terlihat. Slice yang menyentuh money/auth: assumption `context`/`decision` boleh berisi handle (Tier B, keep) tapi bukan nilai kredensial.
- **Kardinalitas:** status enum + tier low-cardinality (aman). `sliceId`/`runName` high-value untuk join audit — simpan sebagai field state, bukan label metrik high-cardinality kalau nanti ada metric export.

**Buckets/metrik:** belum ada metric backend di workflow ini (baru log). Kalau nanti diekspor durasi fase/slice, buckets harus domain-fit (fase bisa menit s/d jam) — bukan default OTel. Catat ini sebagai follow-up, bukan blocker A.

---

## 8. Urutan eksekusi yang disarankan

1. **Kelompok A dulu, urut wave:**
   - Wave 0: `plan-schema-assignment` ‖ `knowledge-agents-dir` ‖ `route-implementer-ratchet`
   - Wave 1: `write-level1-state` ‖ `write-level2-state`
   - Wave 2: `state-path-convention` (atau fold ke write-level1-state)
   - **Review manual** slice low-tol pertama (A3) sebelum dogfood fleet-jalankan-fleet, karena bug routing bisa salah-route dirinya sendiri.
2. **Gate keputusan:** ajukan D-1, D-2, D-3 ke user. Jangan mulai Kelompok B sebelum ketiganya terjawab.
3. **Kelompok B setelah keputusan:**
   - `commit-incremental` (butuh D-2) — prasyarat resume mid-slice.
   - `resume-level1` (butuh D-1) — load state, skip phase/wave done, re-merge unmerged, rebuild failed/never-started.
   - `resume-level2` (butuh D-1 + `commit-incremental`) — checkout `branch@lastCommitSha`, skip `stepsDone`, lanjut dari `step`, reload `assumptions[]`.
   - Ralph (butuh D-3) — hanya kalau user pilih opsi yang butuh kode; kalau (a), tak ada slice di repo ini.

---

## 9. Open questions untuk user (material — tidak ditebak jadi slice)

- **OQ-1 (=D-3):** Target ralph-slice template — artefak planner, workflow ralph JS baru, atau integrasi pi-ralph-loop? SCOPE tak bikin slice ralph sampai dijawab.
- **OQ-2:** Backward-compat plandoc: apakah plandoc upstream yang lama (masih `lowTolerance`/`tier`) harus tetap diterima control_plane.js, atau semua plandoc di-migrate ke `faultTolerance`? (A1 default: terjemahkan `lowTolerance:true⇒low`, tapi konfirmasi.)
- **OQ-3:** Pipeline save workflow: apakah `workflows/src/*.js` otomatis jadi `fleet`/`slice_orchestrator` tersimpan, atau ada langkah `save` manual yang harus masuk acceptance tiap slice? (Acceptance §4/§5 diasumsikan edit-source cukup; kalau ada build step, tambahkan ke tiap acceptance.)
- **OQ-4:** Repo sandbox untuk acceptance A4/A5/A6 (butuh repo git nyata dgn origin untuk `git worktree`/`checkout -B origin/...`). User sediakan fixture repo, atau acceptance pakai temp git-init lokal tanpa origin (lebih terbatas)?

---

## 10. Ringkasan slice

| Slice | Kelompok | faultTolerance | deps |
|---|---|---|---|
| plan-schema-assignment | A | low | — |
| knowledge-agents-dir | A | standard | — |
| route-implementer-ratchet | A | low | — |
| write-level1-state | A | low | plan-schema-assignment |
| write-level2-state | A | low | plan-schema-assignment, route-implementer-ratchet |
| state-path-convention | A | low | write-level1-state |
| commit-incremental | B (D-2) | low | — |
| resume-level1 | B (D-1) | low | write-level1-state |
| resume-level2 | B (D-1,D-2) | low | write-level2-state, commit-incremental |
| ralph-* | BLOCKED (D-3/OQ-1) | — | — |

**Kelompok A: 6 slice. Kelompok B: 3 slice (+ ralph diblokir OQ-1).**
