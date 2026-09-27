import {
  acquireTikTokTask,
  startTikTokEmailLogin,
  startTikTokPhoneLogin
} from '../lib/tiktok-studio.js'

function isPrivate(jid) {
  return !String(jid || '')
    .endsWith('@g.us')
}

export default {
  name: 'tiktoklogin',

  aliases: [
    'ttlogin'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Login TikTok Studio via phone atau email',

  usage:
    '.tiktoklogin phone|email',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    if (!isPrivate(jid)) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🔐 Login TikTok jangan di grup 😭🗿\n' +
            'Chat pribadi NEXA lalu pakai *.tiktoklogin phone* atau *.tiktoklogin email*.'
        },
        { quoted: msg }
      )
    }

    const mode =
      String(args?.[0] || '')
        .trim()
        .toLowerCase()

    if (
      mode !== 'phone' &&
      mode !== 'email'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            'Pilih metode dulu 🗿😭\n\n' +
            '📱 *.tiktoklogin phone*\n' +
            '📧 *.tiktoklogin email*\n\n' +
            'Nomor/email tetap dari *.env*, jadi nggak nongol di log command.'
        },
        { quoted: msg }
      )
    }

    const release =
      acquireTikTokTask()

    if (!release) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🗿 TikTok Studio lagi dipakai / lagi nunggu kode verifikasi.\n' +
            'Selesaikan proses sebelumnya dulu 😭'
        },
        { quoted: msg }
      )
    }

    try {
      if (mode === 'phone') {
        const phone =
          String(
            process.env.TIKTOK_PHONE ||
            ''
          ).trim()

        const countryCode =
          String(
            process.env.TIKTOK_COUNTRY_CODE ||
            '62'
          ).trim()

        if (!phone) {
          return sock.sendMessage(
            jid,
            {
              text:
                '🗿 *TIKTOK_PHONE* belum ada di .env.\n\n' +
                'Contoh:\n' +
                '```TIKTOK_COUNTRY_CODE=62\n' +
                'TIKTOK_PHONE=81234567890```'
            },
            { quoted: msg }
          )
        }

        await sock.sendMessage(
          jid,
          {
            text:
              '✦ *NEXA • PHONE LOGIN*\n\n' +
              '📱 Gue coba minta kode TikTok.\n' +
              'Sekarang gue cek tombol + network, bukan cuma lihat kolom OTP 😭🗿'
          },
          { quoted: msg }
        )

        const result =
          await startTikTokPhoneLogin({
            phone,
            countryCode,

            onCodeRequested:
              async () => {
                await sock.sendMessage(
                  jid,
                  {
                    text:
                      '📨 *Request kode terkonfirmasi dari state halaman/network.*\n\n' +
                      'Kalau SMS masuk:\n' +
                      '``` .tiktokotp 123456 ```'
                  },
                  { quoted: msg }
                )
              }
          })

        if (
          result.alreadyLoggedIn
        ) {
          await sock.sendMessage(
            jid,
            {
              text:
                '✅ Session TikTok ternyata masih hidup 🗿🔥'
            },
            { quoted: msg }
          )
        }

        return
      }

      const email =
        String(
          process.env.TIKTOK_EMAIL ||
          ''
        ).trim()

      const password =
        String(
          process.env.TIKTOK_PASSWORD ||
          ''
        )

      if (
        !email ||
        !password
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '✦ *NEXA • EMAIL LOGIN*\n\n' +
              'Tambahin ke *.env* Ptero:\n' +
              '```TIKTOK_EMAIL=email-akun-lu\n' +
              'TIKTOK_PASSWORD=password-akun-lu```\n\n' +
              '🔐 Jangan kirim credential asli ke chat.'
          },
          { quoted: msg }
        )
      }

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • EMAIL LOGIN*\n\n' +
            '📧 Gue coba login pakai email/username + password...\n' +
            'Kalau TikTok minta kode tambahan, lanjut *.tiktokotp*.'
        },
        { quoted: msg }
      )

      const result =
        await startTikTokEmailLogin({
          email,
          password,

          onCodeRequested:
            async () => {
              await sock.sendMessage(
                jid,
                {
                  text:
                    '📨 TikTok minta verifikasi tambahan.\n\n' +
                    'Kalau kode masuk ke email/nomor akun:\n' +
                    '``` .tiktokotp 123456 ```'
                },
                { quoted: msg }
              )
            }
        })

      if (
        result.alreadyLoggedIn
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              '✅ Session TikTok ternyata masih hidup 🗿🔥'
          },
          { quoted: msg }
        )
      } else if (
        result.loggedIn
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              '✅ *LOGIN EMAIL BERHASIL* 😭🔥🗿\n' +
              'Session udah nempel. *.tiktokpost* siap dipakai.'
          },
          { quoted: msg }
        )
      }
    } catch (error) {
      const code =
        String(
          error?.message ||
          error
        )

      console.error(
        '[TIKTOK_LOGIN] error:',
        code
      )

      if (
        error?.debugInfo
      ) {
        console.log(
          '[TIKTOK_LOGIN] debug:',
          error.debugInfo
        )
      }

      let text =
        '✦ *NEXA • TIKTOK LOGIN*\n\n' +
        '❌ TikTok ngajak ribut lagi 😭🗿\n' +
        `🧩 ${code.slice(0, 220)}`

      if (
        code.includes(
          'TIKTOK_SEND_CODE_NOT_CONFIRMED'
        )
      ) {
        text =
          '📵 Klik *Send code* nggak bisa dikonfirmasi sebagai request OTP yang bener.\n' +
          'Jadi kemungkinan TikTok web/Ptero yang nahan, bukan format nomor lu 😭🗿'
      } else if (
        code.includes(
          'TIKTOK_SEND_CODE_DISABLED'
        )
      ) {
        text =
          '📵 Tombol *Send code* TikTok masih disabled.\n' +
          'Request SMS belum jalan.'
      } else if (
        code.includes(
          'TIKTOK_BAD_PASSWORD'
        )
      ) {
        text =
          '🔐 TikTok nolak password.\n' +
          'Cek *TIKTOK_EMAIL* / *TIKTOK_PASSWORD* di .env.'
      } else if (
        code.includes(
          'TIKTOK_EMAIL_MODE_NOT_FOUND'
        ) ||
        code.includes(
          'TIKTOK_EMAIL_INPUT_NOT_FOUND'
        ) ||
        code.includes(
          'TIKTOK_PASSWORD_INPUT_NOT_FOUND'
        )
      ) {
        text =
          '🗿 Layout login email TikTok berubah / elemennya nggak ketemu.\n' +
          `🧩 ${code}`
      } else if (
        code.includes(
          'TIKTOK_EMAIL_LOGIN_TIMEOUT'
        )
      ) {
        text =
          '⌛ Login email nggak selesai dalam batas waktu.\n' +
          'Screenshot kondisi browser gue lampirin.'
      } else if (
        code.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA berhenti di situ dan nggak mencoba ngebypass.'
      }

      if (
        error?.debugScreenshot
      ) {
        await sock.sendMessage(
          jid,
          {
            image:
              error.debugScreenshot,
            caption:
              text
          },
          { quoted: msg }
        )
      } else {
        await sock.sendMessage(
          jid,
          { text },
          { quoted: msg }
        )
      }
    } finally {
      release()
    }
  }
}
