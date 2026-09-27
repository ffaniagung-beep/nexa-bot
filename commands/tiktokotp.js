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
    'Masukkan kode verifikasi TikTok',

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
            '🔐 Kode verifikasi jangan dikirim di grup 😭🗿'
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
            '🗿 Kodenya harus 6 digit.\n' +
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
            '🔐 Kodenya gue masukin ke TikTok...\n' +
            'Nggak disimpan ke file atau dicetak ke console.'
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
            '✅ *LOGIN TIKTOK BERHASIL* 😭🔥🗿\n' +
            'Session udah nempel. *.tiktokpost* siap dipakai.'
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
        '❌ Kode verifikasi gagal 😭\n' +
        `🧩 ${raw.slice(0, 220)}`

      if (
        raw.includes(
          'TIKTOK_NO_PENDING_OTP'
        )
      ) {
        text =
          '🗿 Nggak ada login yang lagi nunggu kode.\n' +
          'Pakai *.tiktoklogin phone* atau *.tiktoklogin email* dulu.'
      } else if (
        raw.includes(
          'TIKTOK_OTP_INVALID'
        )
      ) {
        text =
          '❌ TikTok bilang kodenya salah 😭'
      } else if (
        raw.includes(
          'TIKTOK_OTP_EXPIRED'
        )
      ) {
        text =
          '⌛ Kodenya keburu expired 🗿😭'
      } else if (
        raw.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA berhenti dan nggak mencoba ngebypass.'
      }

      await sock.sendMessage(
        jid,
        { text },
        { quoted: msg }
      )
    }
  }
}
