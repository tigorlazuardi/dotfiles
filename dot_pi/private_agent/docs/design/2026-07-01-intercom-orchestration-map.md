# Intercom × End-Goal × 4 Scope Kerja

**Tanggal:** 2026-07-01
**Status:** Diskusi arah (belum implementasi, belum pasang intercom). Memo untuk menyamakan paham.

## End-goal
Autonomous coding agent: dilempar spec → implement + validate + test secara autonomous.

## Prinsip pengatur (ditetapkan user)
**Intensitas intercom berbanding terbalik dengan kehadiran human.**

```
Scope kecil (user hadir)  ───────────────►  Scope besar (user absen, 12 jam)
intercom = BACKBONE (kontrol)               intercom = SAFETY-VALVE (autonomy)
escalate target: user                        escalate target: orchestrator/captain
```

Dua hal bergeser sepanjang sumbu ini:
1. **Frekuensi** eskalasi: kecil = sering (conversational) → besar = jarang (exception only).
2. **Target** eskalasi: kecil = human in loop → besar = machine in loop (captain teruskan ke human hanya jika captain sendiri buntu).

## Mekanik intercom (recap)
- **PUSH (sudah ada):** `steer_subagent` — atasan dorong arah ke worker berjalan.
- **PULL (baru):** worker angkat tangan ke atasan:
  - `need_decision` — block, minta keputusan (irreversible/ambiguous).
  - `interview_request` — minta jawaban terstruktur (JSON schema).
  - `progress_update` — fire-forget, lapor hal yang ubah plan.
- **intercom sesi↔sesi:** `send` (fire-forget) / `ask` (block tunggu balas, 10-min timeout, jawaban jadi tool-result lanjut same-turn).
- **Prasyarat `contact_supervisor`:** butuh bridge env vars dari pi-subagents (nicobailon). Worker-pool sekarang (@tintinweb v0.12.0) TIDAK menyuntiknya → contact_supervisor belum aktif; baru intercom sesi↔sesi manual yang jalan.

---

## Peta per scope

### Scope 1 — Small feature add / fix (S-M) — FINAL (user)
- **Lama:** Opus one-shot. Spawn → return.
- **Kehadiran user:** TINGGI (kamu nungguin).
- **intercom = BACKBONE.** Eskalasi BOLEH sampai user (karena kamu hadir).

**Topologi (ditetapkan user):**
```
User (hadir, di-loop)
  ▲ escalate jika butuh keputusan user
  │
Opus (orchestrator + REVIEWER sendiri — tak spawn reviewer terpisah)
  │  • delegate ke implementer
  │  • review hasil SENDIRI (task kecil, Opus mampu nilai langsung)
  │  • post-review → STEER implementer yg SAMA untuk fix
  ▼ push: steer_subagent · pull: implementer ask saat ragu
Implementer (subagent PERSISTEN — di-steer untuk fix, BUKAN di-respawn)
```

**Beda kunci dari scope 3:**
1. **Opus = reviewer sendiri** — hemat 1 hop, task kecil tak perlu reviewer terpisah.
2. **Implementer persisten** — masalah saat review → steer subagent yg SAMA untuk fix, context terjaga, bukan respawn fresh.
3. **Eskalasi boleh ke USER** — implementer ragu → ask Opus; Opus butuh keputusan user → tanya user. (Beda fleet: di sana berhenti di orchestrator.)

- **Nilai:** steer real-time, hasil tepat sekali jalan, no respawn-churn.
- **Model:** Opus (orch+reviewer) → Implementer Sonnet (persisten).

### Scope 2 — Feature baru ke existing app (boundary jelas) — FINAL (user)
- **Lama:** Opus orchestrator → kadang ralph loop.
- **Kehadiran user:** SEDANG (attend di awal define-boundary, lalu semi-lepas).
- **intercom = BACKBONE→VALVE.** Awal backbone (define boundary, banyak konfirmasi). Saat impl jalan & user lepas → valve.
- **Prinsip kunci: BOUNDARY = KONTRAK = GARIS KEPUTUSAN.**

**Topologi (ditetapkan user):**
```
User (semi-lepas)
  ▲ parked-question HANYA jika keputusan LEWAT BOUNDARY (scope creep / di luar kontrak)
  │
Orchestrator (Opus)
  │  • DALAM boundary: putuskan sendiri + catat asumsi (spt scope 3)
  │  • naik ke ralph → spawn reviewer FRESH-context terpisah (task > scope 1, butuh mata bersih)
  │  • impl jalan tanpa user nonton
  ▼ push: steer · pull: implementer ask
Implementer (Sonnet)  ──►  Reviewer (fresh-context, saat mode ralph)
```

**Beda dari scope 1:** reviewer FRESH-context terpisah muncul (bukan Opus-review-sendiri), karena task lebih besar.
**Beda dari scope 3:** garis = boundary fitur (bukan hard-dep), seberang garis = user via parked-question (bukan captain-stop).

- **Nilai:** otonom dalam kontrak; user cuma diganggu untuk keputusan yang benar-benar lewat boundary.
- **Model:** Orchestrator Opus → Implementer Sonnet → Reviewer fresh (Sonnet/Opus).

### Scope 3 — Greenfield (fleet, autonomous 12 jam) — TOPOLOGI FIXED (user)
- **Lama:** Fleet. Captain → orchestrator → implementer. Wave parallel.
- **Kehadiran user:** RENDAH/NOL (kamu tidur).
- **intercom = SAFETY-VALVE, escalate teknis BERHENTI DI ORCHESTRATOR.** Tidak pernah sampai captain (kecuali sebagai status), tidak pernah sampai user.

**Topologi & peran (ditetapkan user):**
```
Captain (Opus)  ── welcoming agent (terima fleet plan dari user) lalu jadi
                   LOOPING / STATE-SYNC agent.
                   • terima laporan wave/slice status dari orchestrator
                   • captain↔orch = channel STATE SYNC saja, bukan decision
                   • STOP fleet jika hard-dependency kena & tak bisa lanjut
                   • ISU TEKNIS TIDAK PERNAH sampai captain
     │ state sync (status: pass/fail/blocked-by-hard-dep)
     ▼
Orchestrator (Opus)  ◄── ESKALASI TEKNIS BERHENTI DI SINI (unit autonomy/slice)
                   • spawn reviewer · steer implementer
                   • resolve titik-ragu implementer (inferior Sonnet → superior Opus)
                   • orchestrator ITU SENDIRI Opus = 'superior brain', tak perlu arbiter terpisah
     │ push: steer_subagent · pull: implementer ask / contact_supervisor
     ▼
Implementer (Sonnet)  ──►  Reviewer (Sonnet/Opus tergantung kompleksitas)
```

**Dua channel terpisah:**
- **Eskalasi teknis** (implementer ↔ orchestrator): titik-ragu, review, steer. Loop ketat dalam 1 slice. Berhenti di orchestrator.
- **State sync** (orchestrator → captain): status wave/slice. Naik untuk bookkeeping + stop-decision. Captain tak tahu detail teknis.

**Keputusan saat orchestrator ragu (bukan hard-dep, tapi judgment — spec ambigu / dua cara valid):**
- **Orchestrator putuskan sendiri + catat asumsi** (ditetapkan user). Opus ambil keputusan paling masuk akal, CATAT sebagai assumption/decision di slice state (audit trail). Slice tetap jalan. User review keputusan saat bangun via state log. Maksimal autonomy, traceable, bisa di-revert.
- Hard-dependency mati & tak bisa lanjut → orchestrator lapor status ke captain → **captain STOP fleet**.

- **Nilai:** worker tak lagi tebak-saat-buntu (resiko 12 jam) maupun gagal-lalu-respawn (mahal). Titik ragu di-resolve in-situ oleh orchestrator Opus. Review bergeser post-hoc → in-situ.
- **Model:** Captain Opus → Orchestrator Opus → Implementer Sonnet → Reviewer Sonnet/Opus.

### Scope 4 — Debugging / reporting — FINAL (user)
- **Lama:** Opus sendiri. MCP calls, fixing.
- **Kehadiran user:** TINGGI (pasti hadir).
- **Filosofi: debugging = CONTEXT-STARVED.** Bug tak bisa dipecah dari kode saja — butuh data luar: event timeline, state-data saat kejadian, API design, config. Opus DI-ENCOURAGE banyak bertanya + cross-check config + scout paralel.

**Topologi (ditetapkan user):**
```
User (HADIR — sumber context luar: event timeline, state-saat-kejadian, API design)
  ▲▼ Opus DI-ENCOURAGE banyak tanya — minta cross-check config, data non-kode
  │
Opus (analis utama, solo-lead)
  │  • banyak inject context dari user (bukan cuma baca kode)
  │  • cross-check settingan/config secara eksplisit
  │  • hypothesis-driven: proaktif curiga potensi bug
  ▼ spawn paralel
Scout subagent(s) — DB scouting, baca log, MCP call, cari root-cause
  └─ `ask`/lapor temuan ke Opus in-situ (paralel, tak nunggu selesai)
```

**Beda dari scope 1-3:**
1. **Eskalasi ke user = CONTEXT-PULL, bukan decision-escalate.** Opus tanya "apa yg terjadi saat itu? config-nya? state-nya?" — intercom/chat = saluran INJEKSI KONTEKS, bukan saluran izin.
2. **Scout paralel untuk DATA** (bukan implementer): investigasi DB/log/MCP, lapor in-situ.
3. **Opus didorong proaktif curiga** — behavior, bukan topologi: hypothesis-driven + verifikasi config eksplisit.

- **Nilai:** root-cause cepat lewat injeksi-konteks-kaya + scouting paralel, bukan nebak dari kode saja.
- **Model:** Opus (analis) + Scout subagent(s) untuk investigasi data paralel.

---

## Prinsip pemersatu (muncul dari finalisasi)
**Orchestrator selalu otonom + catat asumsi, SAMPAI menyentuh garis yang disepakati. Yang beda tiap scope: di mana garisnya & siapa di seberang.**

| Scope | Garis 'boleh putuskan sendiri' | Seberang garis → |
|---|---|---|
| 1. Small | (user hadir, tanya bebas) | user, real-time |
| 2. Feature | boundary / kontrak fitur | user, parked-question |
| 3. Fleet | hard-dependency | captain → STOP fleet |
| 4. Debug | (lihat scope 4) | peer sesi / user |

## Tabel ringkas

| Scope | Lama | Hadir | intercom | Target escalate | Mode | Reviewer |
|---|---|---|---|---|---|---|
| 1. Small fix | Opus one-shot | Tinggi | Backbone | User real-time | parent-child | Opus sendiri |
| 2. Feature baru | Opus orch / ralph | Sedang | Backbone→Valve | User jika lewat boundary | parent-child | Fresh terpisah |
| 3. Greenfield | Fleet 12h | Nol | Safety-valve | Stop di orchestrator | rantai mesin | Sonnet/Opus |
| 4. Debugging | Opus solo | Tinggi | Backbone lateral | Peer sesi / user | sesi↔sesi | — |

## Implikasi ke state-file (topik awal yang ditunda)
Topologi fleet mengonfirmasi DUA tingkat state dengan peran beda — cocok Level-1/Level-2 di fleet-knowledge.md:
- **Level-1 (control-plane / captain):** wave/slice status, hard-dep graph, stop-flag. Yang captain sync. Coarse.
- **Level-2 (per-slice / orchestrator):** progress langkah, next-step, **decisions[]/assumptions[]** (audit trail keputusan orchestrator-putuskan-sendiri). Yang orchestrator tulis. Fine.
- Audit trail keputusan (assumption log) = WAJIB, karena scope-3 orchestrator boleh putuskan sendiri → user harus bisa review saat bangun → resume tak tanya ulang.

## Pertanyaan terbuka (untuk dibahas, jangan diputus sekarang)
1. `contact_supervisor` butuh nicobailon/pi-subagents; worker-pool-mu @tintinweb. Ganti? Coexist? Patch? — keputusan infrastruktur, tunda sampai paham intercom hands-on.
2. Skema konkret Level-1 & Level-2 state file (field, lokasi disk, format) — turunkan setelah topologi mantap.
3. Threshold "kapan escalate vs putuskan sendiri" untuk implementer (kapan dia `ask` orchestrator vs jalan terus) — biar tak over/under-escalate.
4. Scope 1/2/4 (small/feature/debug) — apakah topologi & target escalate-nya juga perlu sefinal scope 3, atau cukup prinsip umum.
