import {
  acquireTikTokTask,
  startTikTokPhoneLogin
} from '../lib/tiktok-studio.js'

function isPrivate(jid) {
  return !String(jid || '')
    .endsWith('@g.us')
}

export default {
  name: 'tiktoklogin',

  aliases: [
    'ttlogin',
    'tiktokphone'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Login TikTok Studio pakai nomor HP + OTP',

  usage:
    '.tiktoklogin',

  async run({
    sock,
    msg,
    jid
  }) {
    if (!isPrivate(jid)) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🔐 Login TikTok jangan di grup 😭🗿\n' +
            'Chat NEXA secara pribadi lalu jalankan *.tiktoklogin*.'
        },
        { quoted: msg }
      )
    }

    const phone =
      String(
        process.env.TIKTOK_PHONE || ''
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
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            '🗿 Nomor TikTok belum dipasang.\n\n' +
            'Tambahin ke *.env* Ptero:\n' +
            '```TIKTOK_COUNTRY_CODE=62\n' +
            'TIKTOK_PHONE=81234567890```\n\n' +
            'Itu contoh format. Isi nomor akun lu sendiri.'
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
            '🗿 TikTok Studio lagi dipakai / lagi nunggu OTP.\n' +
            'Tunggu proses sebelumnya dulu 😭'
        },
        { quoted: msg }
      )
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            '📱 Gue minta kode SMS TikTok dulu...\n' +
            'Nomor diambil dari *.env* jadi nggak gue tampilin di chat 🔐'
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
                    '✦ *NEXA • TIKTOK OTP*\n\n' +
                    '📨 Kalau SMS TikTok udah masuk, kirim:\n' +
                    '``` .tiktokotp 123456 ```\n\n' +
                    '⏳ Ditunggu sekitar 3 menit.\n' +
                    '🔐 Jangan kirim OTP di grup.'
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
              '✅ Ternyata session TikTok masih hidup 🗿🔥\n' +
              '*.tiktokpost* udah bisa dipakai.'
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

      let text =
        '✦ *NEXA • TIKTOK LOGIN*\n\n' +
        '❌ Login nomor HP gagal 😭\n' +
        `🧩 ${code.slice(0, 220)}`

      if (
        code.includes(
          'TIKTOK_COUNTRY_CODE_NOT_FOUND'
        )
      ) {
        text =
          '🌍 Kode negara nggak ketemu 😭\n' +
          'Cek *TIKTOK_COUNTRY_CODE* di .env. Indonesia = `62`.'
      } else if (
        code.includes(
          'TIKTOK_PHONE_INPUT_NOT_FOUND'
        ) ||
        code.includes(
          'TIKTOK_SEND_CODE_BUTTON_NOT_FOUND'
        )
      ) {
        text =
          '🗿 Form login TikTok berubah.\n' +
          'Kolom nomor / tombol *Send code* nggak ketemu 😭\n' +
          `🧩 ${code}`
      } else if (
        code.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA berhenti di sini, nggak mencoba ngebypass itu.'
      } else if (
        code.includes(
          'TIKTOK_LOGIN_PENDING'
        )
      ) {
        text =
          '📨 Masih ada login yang nunggu OTP.\n' +
          'Kirim *.tiktokotp 123456* kalau SMS sudah masuk.'
      }

      await sock.sendMessage(
        jid,
        { text },
        { quoted: msg }
      )
    } finally {
      release()
    }
  }
}
