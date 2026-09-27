import {
  completeTikTokPhoneLogin
} from '../lib/tiktok-studio.js'

function isPrivate(jid) {
  return !String(jid || '')
    .endsWith('@g.us')
}

export default {
  name: 'tiktokotp',

  aliases: [
    'ttotp'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Masukkan OTP login TikTok yang sedang ditunggu',

  usage:
    '.tiktokotp <6 digit>',

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
            '🔐 OTP jangan dikirim di grup 😭🗿\n' +
            'Kirim di chat pribadi bot.'
        },
        { quoted: msg }
      )
    }

    const code =
      String(
        (args || []).join('')
      )
        .replace(/\D/g, '')

    if (
      !/^\d{6}$/.test(code)
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🗿 OTP harus 6 digit.\n' +
            'Contoh: *.tiktokotp 123456*'
        },
        { quoted: msg }
      )
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '🔐 Kodenya gue masukin ke browser TikTok...\n' +
            'OTP nggak gue print ke console atau simpan ke file.'
        },
        { quoted: msg }
      )

      await completeTikTokPhoneLogin(
        code
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK LOGIN*\n\n' +
            '✅ LOGIN BERHASIL 😭🔥🗿\n' +
            'Session TikTok udah nempel di server.\n\n' +
            'Sekarang reply video pakai *.tiktokpost <caption>*.'
        },
        { quoted: msg }
      )
    } catch (error) {
      const raw =
        String(
          error?.message ||
          error
        )

      let text =
        '❌ OTP TikTok gagal 😭\n' +
        `🧩 ${raw.slice(0, 220)}`

      if (
        raw.includes(
          'TIKTOK_NO_PENDING_OTP'
        )
      ) {
        text =
          '🗿 Nggak ada login yang lagi nunggu OTP.\n' +
          'Jalankan *.tiktoklogin* dulu.'
      } else if (
        raw.includes(
          'TIKTOK_OTP_INVALID'
        )
      ) {
        text =
          '❌ TikTok bilang OTP salah 😭\n' +
          'Jalankan *.tiktoklogin* lagi buat minta kode baru.'
      } else if (
        raw.includes(
          'TIKTOK_OTP_EXPIRED'
        )
      ) {
        text =
          '⌛ OTP keburu expired 🗿😭\n' +
          'Jalankan *.tiktoklogin* lagi.'
      } else if (
        raw.includes(
          'TIKTOK_OTP_RATE_LIMIT'
        )
      ) {
        text =
          '🚦 TikTok lagi ngerem percobaan login.\n' +
          'Jangan spam kode; tunggu dulu sebelum coba lagi.'
      } else if (
        raw.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA berhenti dan nggak mencoba ngebypass itu.'
      } else if (
        raw.includes(
          'TIKTOK_LOGIN_TIMEOUT'
        )
      ) {
        text =
          '⌛ TikTok belum kasih session setelah OTP 😭\n' +
          'Coba *.tiktoklogin* lagi dengan kode baru.'
      }

      await sock.sendMessage(
        jid,
        { text },
        { quoted: msg }
      )
    }
  }
}
