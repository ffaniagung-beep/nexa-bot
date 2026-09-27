import {
  acquireTikTokTask,
  loginTikTokQr
} from '../lib/tiktok-studio.js'

export default {
  name: 'tiktoklogin',

  aliases: [
    'ttlogin',
    'tiktokqr'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Login TikTok Studio pakai QR untuk sesi owner',

  usage:
    '.tiktoklogin',

  async run({
    sock,
    msg,
    jid
  }) {
    const release =
      acquireTikTokTask()

    if (!release) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🗿 TikTok Studio lagi dipakai proses lain. Tunggu bentar dulu 😭'
        },
        {
          quoted: msg
        }
      )
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            '🌐 Gue buka TikTok di browser server dulu...\n' +
            'Kalau sesi belum ada, QR bakal gue kirim ke sini 😭🗿'
        },
        {
          quoted: msg
        }
      )

      let qrSent = false

      const result =
        await loginTikTokQr({
          onQr:
            async buffer => {
              qrSent = true

              await sock.sendMessage(
                jid,
                {
                  image: buffer,
                  caption:
                    '✦ *NEXA • TIKTOK QR*\n\n' +
                    '📱 Scan QR ini pakai TikTok lalu konfirmasi login.\n' +
                    'Browser server bakal nunggu maksimal 3 menit.\n\n' +
                    '🗿 Kalau TikTok minta CAPTCHA/verifikasi tambahan, selesaikan secara normal—NEXA nggak nge-bypass itu.'
                },
                {
                  quoted: msg
                }
              )
            },

          onStatus:
            async status => {
              if (
                status ===
                'session_received'
              ) {
                await sock.sendMessage(
                  jid,
                  {
                    text:
                      '👀 QR diterima. Lagi gue cek apakah sesi TikTok-nya beneran nempel...'
                  },
                  {
                    quoted: msg
                  }
                )
              }
            }
        })

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            '✅ Sesi TikTok Studio siap dipakai.\n' +
            (
              result.alreadyLoggedIn
                ? '🗿 Ternyata dari tadi udah login, QR nggak perlu.'
                : '🔥 Sekarang reply video pakai *.tiktokpost caption*.'
            )
        },
        {
          quoted: msg
        }
      )

      if (
        !qrSent &&
        !result.alreadyLoggedIn
      ) {
        console.log(
          '[TIKTOK_LOGIN] login selesai tanpa QR terkirim'
        )
      }
    } catch (error) {
      const code =
        String(
          error?.message ||
          error
        )

      let text =
        '⚠️ TikTok login gagal.\n' +
        `🧩 ${code.slice(0, 220)}`

      if (
        code.includes(
          'TIKTOK_LOGIN_TIMEOUT'
        )
      ) {
        text =
          '⌛ QR TikTok keburu basi 😭\n' +
          'Jalankan *.tiktoklogin* lagi terus scan QR yang baru.'
      } else if (
        code.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA nggak bakal ngakal-ngakalin itu 🗿. Selesaikan verifikasinya secara normal lalu coba login lagi.'
      } else if (
        code.includes(
          'TIKTOK_BROWSER'
        )
      ) {
        text =
          '🌐 Chromium server gagal nyala 😭\n' +
          'Cek dependency *@sparticuz/chromium* + *puppeteer-core* di Ptero.'
      }

      await sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted: msg
        }
      )
    } finally {
      release()
    }
  }
}
