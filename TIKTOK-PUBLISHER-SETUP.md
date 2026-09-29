# NEXA TikTok Publisher — Owner Only

Fitur ini memakai TikTok Content Posting API resmi, bukan browser automation/private endpoint.

## File yang ditambahkan

- `lib/tiktokPublisher.js`
- `commands/tiktokauth.js`
- `commands/tiktokaccount.js`
- `commands/tiktokpost.js`
- `commands/tiktokconfirm.js`
- `commands/tiktokstatus.js`
- `commands/tiktokcancel.js`
- `commands/tiktoklogout.js`
- `install-tiktok-publisher.py`

`.env.example` juga mendapat variabel konfigurasi TikTok.

## 1. Pasang via Termux

Jalankan dari root project `wa-bot`:

```bash
python install-tiktok-publisher.py
```

Installer akan membackup file dengan nama sama ke `backups/tiktok-publisher-<timestamp>/`, menulis modul baru, lalu menjalankan `node --check`.

## 2. TikTok Developer

Aplikasi TikTok perlu Login Kit + Content Posting API dan scope `video.publish` untuk Direct Post.

Redirect URI web harus HTTPS, terdaftar persis di TikTok Developer, dan diarahkan ke callback server bot. Contoh:

```env
TIKTOK_CLIENT_KEY=isi_client_key
TIKTOK_CLIENT_SECRET=isi_client_secret
TIKTOK_REDIRECT_URI=https://domain-kamu.example/tiktok/callback
TIKTOK_OAUTH_PORT=8787
TIKTOK_OAUTH_HOST=0.0.0.0
TIKTOK_SCOPES=video.publish
TIKTOK_MAX_VIDEO_MB=512
```

Jangan commit `.env`. Token hasil OAuth disimpan di `database/tiktok-publisher/auth.json` dengan permission file terbatas; folder `database/` project sudah di-ignore Git.

Public HTTPS `TIKTOK_REDIRECT_URI` harus diteruskan/reverse-proxy ke port `TIKTOK_OAUTH_PORT` pada Pterodactyl. Path callback harus tetap sama.

## 3. Deploy seperti biasa

```bash
git add .
git commit -m "feat: add owner-only TikTok publisher"
git push origin main
```

Lalu restart bot di Pterodactyl.

## 4. Hubungkan TikTok

Di WhatsApp sebagai owner:

```text
.tiktokauth
```

Buka URL yang dikirim bot, login/authorize di TikTok, lalu setelah callback sukses:

```text
.tiktokaccount
```

## 5. Stage video

Kirim video dengan caption command atau reply video:

```text
.tiktokpost caption video #tag
```

Bot akan menampilkan account tujuan, pilihan privacy terbaru dari TikTok, status Comment/Duet/Stitch, ukuran/durasi, dan job ID.

## 6. Konfirmasi publish

Tidak ada default privacy/interaksi. Isi semuanya secara manual:

```text
.tiktokconfirm <job> <PRIVACY> <comments:on/off> <duet:on/off> <stitch:on/off> <commercial:none/own/paid/both> <aigc:on/off> SETUJU
```

Contoh untuk test private non-komersial:

```text
.tiktokconfirm abc123abcd SELF_ONLY off off off none off SETUJU
```

`commercial`:

- `none`: bukan konten promosi
- `own`: mempromosikan diri/bisnis sendiri
- `paid`: branded/paid partnership pihak ketiga
- `both`: keduanya

Untuk `paid`/`both`, bot menolak `SELF_ONLY` dan meminta privacy yang sesuai dengan aturan branded content TikTok.

`aigc:on` digunakan bila video memang AI-generated sehingga flag API TikTok ikut dikirim.

## 7. Status / cancel / logout

```text
.tiktokstatus <job>
.tiktokcancel <job>
.tiktoklogout SETUJU
```

Job yang sudah mendapatkan `publish_id` tidak otomatis di-init ulang ketika upload mengalami network error ambigu. Ini sengaja untuk mengurangi risiko duplicate post; gunakan `.tiktokstatus <job>` lebih dulu.

## Catatan TikTok saat ini

- Direct Post membutuhkan `video.publish` dan creator harus mengotorisasi scope tersebut.
- Client yang belum diaudit dibatasi untuk private viewership; pengujian umumnya memakai `SELF_ONLY` dan target account private.
- TikTok meminta creator info terbaru, pilihan privacy/interaksi manual, commercial disclosure, consent sebelum upload, dan pengecekan durasi sesuai `max_video_post_duration_sec`.
- Guideline Direct Post TikTok menyatakan utility internal/private untuk akun yang dikelola sendiri bukan intended use yang mereka terima untuk produk yang diaudit. Karena itu konfigurasi owner-only ini cocok sebagai prototype/testing, bukan jaminan lolos audit publik.
