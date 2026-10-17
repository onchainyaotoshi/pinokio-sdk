# pinokio-sdk — client typed untuk script Pinokio

**Date:** 2026-10-17
**Status:** Brainstorm complete — design approved, ready for planning
**Scope:** Paket npm publik baru (repo terpisah)

## Masalah

1. **Consumer luar tidak bisa menjalankan flow browser.** `ginee-unofficial-auth` butuh
   reCAPTCHA Enterprise yang dieksekusi di origin `accounts.ginee.com` plus cookie jar,
   jadi flow itu tidak mungkin jadi library zero-dep yang tinggal `npm i`.
2. **Karena itu consumer menyalin manual.** `camis_api_native` menyimpan token unofficial di
   Meta `ginee_nocache.unofficial` yang ditempel operator setelah login browser. Kalau token
   kedaluwarsa, seluruh job arsip Tutup Buku gagal sampai ada manusia login ulang. Insiden
   11 Okt 2026: dua salinan token (`ginee` dan `ginee_nocache`) kedaluwarsa terpisah —
   satu diperbarui, yang lain basi, dan gejalanya menyesatkan.
3. **Protokolnya terdokumentasi tapi mentah.** `GET /llms.txt` menjelaskan POST → poll →
   result, tapi setiap consumer tetap menulis ulang poll loop, timeout, dan penanganan error.

## Keputusan inti

Paket = **client ke gateway Pinokio**, bukan engine browser. Gateway yang sudah dideploy
memegang browser, kredensial, dan sesi Ginee; consumer hanya butuh `baseUrl` (dev atau live,
cukup beda env var — bukan cabang kode) dan API key `pk_...` dari `/apikeys`.

- Nama paket: `@yaotoshi/pinokio-sdk`, repo baru, publish publik.
- Konvensi meniru `@yaotoshi/openclaw-wa-sdk`: tsup dual ESM/CJS + `.d.ts`/`.d.cts`,
  vitest, `publint` + `attw --pack`, publish lewat tag `v*` + `--provenance`,
  **nol runtime dependency** (global `fetch`).
- Spec ini disalin ke repo baru sebagai `docs/design.md`.

## Lokasi & repo

- Repo **terpisah**, bukan subfolder repo `pinokio`: direktori kerja sendiri, sejajar dengan
  `openclaw-wa-sdk` dan `wa-follow-up-service`.
- Alasan yang menentukan: `npm publish --provenance` mensyaratkan repo sumber **publik**,
  sedangkan `onchainyaotoshi/pinokio` privat. Menaruh paket di dalam repo privat berarti
  melepas provenance.
- Alasan kedua: siklus rilis SDK (minor per modul baru) tidak boleh terikat deploy aplikasi.
- GitHub `onchainyaotoshi/pinokio-sdk` (publik) → npm `@yaotoshi/pinokio-sdk`.
- Spec ini disalin ke sana sebagai `docs/design.md`.

## Permukaan publik v1

```ts
import { fromEnv } from '@yaotoshi/pinokio-sdk'

const pk = fromEnv() // PINOKIO_BASE_URL + PINOKIO_API_KEY

const { token, expiresAt, source } = await pk.browserAutomation.gineeUnofficialAuth.login({
  forceLogin: true,
})
const { expired, reason } = await pk.browserAutomation.gineeUnofficialAuth.isExpired(token, {
  marginSeconds: 3600,
})
```

- Entry utama **hanya** berisi modul domain. Tidak ada jalur untuk memanggil script sembarang.
  Ini keputusan keamanan, bukan kerapian: type tidak menahan apa pun saat runtime — yang
  menahan adalah script ID yang dipaku di dalam method, sehingga tidak bisa dioper pemanggil
  (termasuk agent LLM yang salah memilih).
- Escape hatch ada di subpath terpisah:

```ts
import { runScript } from '@yaotoshi/pinokio-sdk/raw'

await runScript(pk, 'functions/contoh/laporan-harian', { tanggal: '2026-10-17' }, { dryRun: true })
```

`dryRun` **wajib** disebutkan di `/raw` (tidak ada default), supaya pemanggil menyatakan
maksudnya alih-alih mewarisi default server.

## Aturan penamaan modul (mekanis)

```
<archetype>/<workspace>/<script>  →  pk.<archetype>.<workspace>.<script>()

browser-automation / ginee-unofficial-auth / is-expired
  →  pk.browserAutomation.gineeUnofficialAuth.isExpired()
```

kebab-case → camelCase, tanpa alias buatan tangan. Workspace baru otomatis menentukan nama
modulnya — tidak ada keputusan penamaan yang perlu diambil. Satu modul = satu workspace, dan
setiap method wajib bernama sama dengan script yang dibungkusnya (tanpa alias).

Nesting per archetype dipakai karena nama workspace hanya unik di dalam archetype-nya
(`/scripts/<archetype>/<workspace>/`); dengan nested, pemetaan 1:1 dengan path dan tidak
mungkin tabrakan. Alias pendek sengaja dihindari: `pk.ginee` akan ambigu karena workspace
`ginee` (products) sudah ada.

Dijaga tes round-trip: setiap method modul dipetakan balik ke camelCase→kebab, lalu assert
script ID itu ada di fixture manifest. Mustahil ada modul yang menunjuk script salah atau
sudah tidak ada.

## Semantik protokol yang wajib di-encode SDK

| # | Fakta | Konsekuensi di SDK |
|---|---|---|
| 1 | `dryRun` default **true** di HTTP layer (`nest/src/scripts/scripts.service.ts:374-376`) dan memicu intercept CDP di archetype browser (`nest/src/core/scripts/harness/invoke.ts:380-418`) | SDK selalu mengirim `dryRun` eksplisit: modul domain `readOnly` → `dryRun:false`; `/raw` mewajibkan caller memilih |
| 2 | Selalu async: POST → `{status:'started',runId}` | Tidak ada mode sinkron; SDK wajib poll |
| 3 | Poll `GET …/runs/:id` tiap 1–2 dtk; terminal `succeeded \| failed \| timed_out \| cancelled` | Poll loop interval tetap; `?cursor=N` didukung untuk log |
| 4 | Result di-evict ~5 menit setelah run settle | `result()` dipanggil segera; `RUN_NOT_FOUND` diberi pesan yang menjelaskan sebabnya |
| 5 | Edge memotong request ~100 dtk | Timeout per request < 100 dtk, deadline total terpisah |
| 6 | `login` mengembalikan `source:'session'\|'login'` (±0,7 dtk vs 6–9 dtk) | Tidak perlu cache: memanggil `login` setiap kali sudah benar by construction |
| 7 | `is-expired` fail-closed; token tidak pernah di-log | SDK tidak menyimpan maupun mencetak token |

## Taxonomi error

Satu kelas `PinokioSdkError` dengan `code` terdiskriminasi:

`MISSING_CONFIG | INVALID_REQUEST | AUTH_ERROR | SCRIPT_NOT_FOUND | RUN_NOT_FOUND |
RUN_FAILED | RUN_TIMED_OUT | RUN_CANCELLED | TIMEOUT | NETWORK_ERROR | API_ERROR`

Envelope server `{ status:'error', code, message }` dipetakan ke code di atas; code asli
server disimpan sebagai `serverCode` supaya pesan tetap actionable.

## Pertumbuhan: menambah workspace

Modul domain dibuat **hanya kalau** memenuhi minimal satu:

1. ada urutan protokol tersembunyi (contoh Ginee: cek `exp` → `is-expired` → `login`), atau
2. ada semantik tersembunyi yang mudah salah (contoh: `dryRun` default true, eviction 5 menit), atau
3. dipakai berulang oleh consumer yang sama.

Kalau hanya "satu POST", `/raw` sudah cukup — tanpa aturan ini paket akan membengkak jadi
puluhan modul yang separuhnya tidak pernah dipanggil.

Langkah menambah modul (juga ditulis di `CLAUDE.md` repo baru):

1. `src/modules/<archetype>/<workspace>.ts` — types params/result disalin dari manifest.
2. Daftarkan di `src/modules/index.ts` dengan nama camelCase hasil aturan di atas.
3. Fixture manifest + tes kontrak (round-trip nama, bentuk params/result).
4. Rilis minor.

Tidak ada paket baru, tidak ada perubahan pipeline publish, transport tidak diduplikasi.
Workspace yang belum punya modul tetap bisa dipakai lewat `/raw` pada hari yang sama.

## Deliverable lain: CLAUDE.md repo baru

Meniru `openclaw-wa-sdk/CLAUDE.md` (handoff untuk LLM yang melanjutkan): what this is,
current status, **exact server contract** (dari `GET /llms.txt` + `scripts.controller.ts`),
locked design decisions, architecture, commands, langkah publish manual, dan checklist
"Adding a workspace module" di atas.

## Non-goals

- Tidak ada cache token / refresh proaktif. Cache hanya menghemat ±0,7 dtk dan menambah
  satu mode gagal (cache basi) — persis kelas bug yang sudah kejadian di camis.
- Tidak membungkus endpoint data `erp.ginee.com`; cakupan v1 hanya auth.
- Tidak menggantikan `_common/*.js` di dalam Pinokio — script tetap tidak bisa `npm i`.
- Tidak ada `getToken()`; nama method mengikuti nama script (`login`, `isExpired`).

## Pengujian

- Unit: transport dengan `fetch` di-stub — poll sampai terminal, timeout per request,
  pemetaan envelope error ke taxonomy.
- Kontrak: fixture manifest → round-trip nama modul dan bentuk params/result.
- Live smoke opt-in `PINOKIO_LIVE_SMOKE=1` terhadap instance **dev**, tidak pernah prod.

## Item terbuka

- Verifikasi empiris apakah intercept CDP `dryRun` benar-benar memblokir
  `page.request.post` (APIRequestContext tidak lewat renderer, jadi kemungkinan tidak).
  Tidak memblokir rancangan karena SDK selalu mengirim `dryRun:false`, tapi memengaruhi
  dokumentasi `/raw`: kalau intercept tidak efektif untuk `page.request`, maka `dryRun`
  bukan jaminan "tidak ada mutasi" untuk script yang memakai jalur itu.
