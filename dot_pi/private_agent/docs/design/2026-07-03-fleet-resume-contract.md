# Fleet Resume Contract — interface for external wake

**Tanggal:** 2026-07-03
**Status:** Kontrak interface. Companion ke `2026-07-03-fleet-dag-rework.md`.
**Tujuan:** Mendefinisikan interface yang **external wake mechanism** (cron / watcher / systemd — dibangun TERPISAH, di luar scope fleet-rework) panggil untuk me-resume fleet run setelah interupsi (rate-limit, process death, machine reboot). Fleet TIDAK mendeteksi rate-limit sendiri; ia hanya **resume-ready**. Doc ini adalah kontrak yang harus dipenuhi supaya mekanisme wake eksternal tinggal colok.

---

## Boundary — apa yang fleet TANGGUNG vs TIDAK

**Fleet TANGGUNG (in scope, sudah dibangun):**
- State persist tiap step (L1 captain + L2 per-DAG) ke disk, di-commit ke repo proyek.
- Partial work di-commit ke branch (`commit@sha`) — resume checkout + lanjut, tak rebuild dari nol.
- Idempotent re-entry: re-invoke dengan `resume=true` melanjutkan tanpa mengulang kerja yang sudah `passed`.
- Safety ratchet: resume membaca **effective tier** dari state — low-tolerance DAG TAK PERNAH silent-downgrade.

**Fleet TIDAK tanggung (out of scope — mekanisme terpisah):**
- **Pause-detection** — kapan agent tahu mendekati hard-limit lalu berhenti bersih. Fleet tak punya logic ini.
- **External wake transport** — cron / file-watcher / systemd-timer / webhook yang mendeteksi "rate-limit reset" lalu memicu resume. Dibangun terpisah.
- **Scheduling policy** — kapan mencoba resume, berapa kali retry, backoff. Kebijakan caller.

Fleet cukup: begitu proses hidup lagi & dipanggil dengan kontrak di bawah, ia melanjutkan dengan benar.

---

## Kontrak invoke

External caller me-resume dengan memanggil captain flow pada run yang sama:

```
captain resume=true runName=<same-runName> repo=<project-repo-root>
```

- `runName` — identitas run, SAMA dengan run awal (captain memakainya sebagai resume anchor). Tersimpan di L1 `runName`.
- `resume=true` — flag yang memberitahu captain: JANGAN plan ulang, baca state yang ada.
- `repo` — root repo proyek tempat state + artefak hidup (state RELATIF ke repo proyek, bukan `~/.pi`).

Caller TIDAK perlu tahu progress internal — captain merekonstruksi semuanya dari state file.

---

## State yang dibaca saat resume

**Level-1 (`<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/state.json`):**
- `dags[]` + `dagStatus{}` — DAG mana `passed` (skip), `running` (re-enter), `pending` (belum mulai), `failed`.
- `failedDags[]` — DAG gagal; dependent-nya unreachable → skip.
- `dags[].judge{}` — verdict + attempt (bounded 2x) per DAG; resume melanjutkan retry-count, tak reset.
- `dags[].assignment.effective*` — tier efektif (safety ratchet). Resume WAJIB baca ini, bukan re-judgment.
- `knowledge[]` — durable knowledge terakumulasi; reload ke konteks.
- `stopFlag` — kalau sudah `stopped`, resume melapor final status, tak jalan lagi.

**Level-2 (`<repo>/plans/fleet/<...>/dags/<dagId>.json`) — untuk DAG `running`:**
- `tasks[]` — task mana `edgeGateStatus=passed` (skip), mana belum.
- `tasks[].commitSha` — checkout `branch@commitSha`, lanjut dari titik itu.
- `tasks[].acceptanceResult` — hasil executable check yang sudah tercatat; tak re-run yang sudah hijau.
- `tasks[].implementer` / `reviewer` — tier efektif per task (ratchet).
- `assumptions[]` — keputusan orchestrator sebelumnya; TAK ditanya/diputus ulang.

---

## Guarantee yang fleet berikan saat resume

1. **No re-work** — DAG/task `passed` tak dijalankan ulang. Runnable-set dihitung ulang dari status terkini.
2. **No silent-downgrade** — low-tolerance DAG/task di-resume dengan tier yang SAMA (effective tier dari state). Slice money/auth tak pernah turun ke worker lebih murah karena resume.
3. **No lost decisions** — `assumptions[]` + `knowledge[]` ter-reload; orchestrator tak mengulang judgment yang sudah diputus.
4. **Deterministic re-entry** — dua resume dari state yang sama menghasilkan langkah lanjutan yang sama (state = source of truth, bukan memori proses).
5. **Judge continuity** — attempt count judge (bounded 2x) dilanjutkan, bukan direset — DAG gagal-2x tetap terdeteksi lintas resume.

---

## Yang external wake mechanism harus lakukan (referensi, BUKAN spec fleet)

Ini deskripsi supaya pembangun mekanisme terpisah tahu bentuknya. Bukan bagian rework ini:

1. **Deteksi** kondisi resume layak (mis. rate-limit window reset, jam tertentu, file-signal muncul).
2. **Invoke** kontrak di atas (`captain resume=true runName=... repo=...`) di environment yang punya kredensial + working dir benar.
3. **Backoff / retry** kalau invoke gagal (rate-limit masih aktif) — kebijakan caller.
4. **Stop** ketika captain melapor `stopFlag.stopped=true` atau semua DAG `passed`/`failed` (fleet selesai).

Transport (cron / systemd-timer / watcher / webhook) bebas — fleet agnostik terhadapnya selama kontrak invoke dipenuhi.

---

## Referensi
- Arsitektur: `docs/design/2026-07-03-fleet-dag-rework.md` (§Rate-limit survival, §State Schema)
- State templates: `templates/fleet-captain.state.template.json`, `templates/fleet-slice.state.template.json`
- Captain execution: `skills/captain/SKILL.md`
