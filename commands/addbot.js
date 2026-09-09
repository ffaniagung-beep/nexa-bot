import {
  addManagedBot,
  ensureBotManagerStarted,
  isManagerHost
} from '../lib/botManager.js'

ensureBotManagerStarted()

export default {
  name:
    'addbot',

  aliases: [
    'pairbot',
    'tambahbot'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Menambahkan akun NEXA tambahan dengan pairing code',

  usage:
    '.addbot 628xxxxxxxxxx',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    if (
      !isManagerHost()
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⚠️ Bot Manager hanya bisa dijalankan dari *NEXA Main*.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    if (
      String(
        jid || ''
      ).endsWith(
        '@g.us'
      )
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '🔒 *.addbot hanya boleh digunakan lewat chat pribadi dengan NEXA Main.*\n\nPairing code tidak akan ditampilkan di grup.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    const number =
      String(
        args?.[0] || ''
      )
        .replace(
          /\D/g,
          ''
        )

    if (!number) {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • BOT MANAGER*\n\n' +
            'Gunakan:\n' +
            '`.addbot 628xxxxxxxxxx`\n\n' +
            'Nomor harus merupakan akun WhatsApp yang memang kamu kelola.'
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    await sock.sendMessage(
      jid,
      {
        text:
          '✦ *NEXA • BOT MANAGER*\n\n' +
          '⏳ Menyiapkan session bot baru dan meminta pairing code...'
      },
      {
        quoted:
          msg
      }
    )

    try {
      const result =
        await addManagedBot(
          number
        )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • BOT MANAGER*\n\n' +
            '✅ Session bot tambahan dibuat.\n\n' +
            `🤖 ID: \`${result.id}\`\n` +
            `📱 Nomor: \`${result.numberMasked}\`\n\n` +
            '🔑 *PAIRING CODE*\n' +
            `\`${result.pairingCode}\`\n\n` +
            'Buka WhatsApp pada akun tersebut → *Perangkat tertaut* → *Tautkan dengan nomor telepon*, lalu masukkan kode di atas.\n\n' +
            'Setelah berhasil, cek dengan:\n' +
            '`.listbot`'
        },
        {
          quoted:
            msg
        }
      )
    } catch (
      error
    ) {
      let message =
        error?.message ||
        String(error)

      if (
        message ===
        'INVALID_NUMBER'
      ) {
        message =
          'Nomor WhatsApp tidak valid.'
      } else if (
        message ===
        'BOT_ALREADY_EXISTS'
      ) {
        message =
          `Nomor itu sudah terdaftar sebagai \`${error.botId}\`.`
      } else if (
        message ===
        'BOT_LIMIT_REACHED'
      ) {
        message =
          `Batas bot tambahan saat ini: ${error.max}.`
      } else if (
        message ===
        'PAIRING_CODE_TIMEOUT'
      ) {
        message =
          'Pairing code tidak keluar dalam 60 detik. Coba `.restartbot <id>` saat jaringan sudah stabil.'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            '❌ *Gagal menambahkan bot*\n\n' +
            message
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
