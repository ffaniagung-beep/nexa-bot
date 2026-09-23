import {
  openGroupNow
} from '../lib/groupSchedule.js'

async function reply(sock, jid, msg, text) {
  await sock.sendMessage(
    jid,
    { text },
    { quoted: msg }
  )
}

export default {
  name: 'opengroup',
  aliases: [
    'bukagroup',
    'bukagrup'
  ],
  category: 'GROUP',
  description:
    'Buka grup sekarang (semua member bisa chat)',
  usage:
    '.opengroup',
  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    groupInfo
  }) {
    if (!groupInfo?.isBotAdmin) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • GROUP CONTROL*\n\n` +
        `😐 NEXA belum jadi Admin.\n\n` +
        `Mau ngatur grup pakai kekuatan pikiran? 🗿\n` +
        `Jadikan bot Admin dulu.`
      )
      return
    }

    await openGroupNow(
      sock,
      jid
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • GROUP CONTROL*\n\n` +
          `🔓 Grup dibuka kembali.\n\n` +
          `Semua anggota sekarang dapat mengirim pesan.\n` +
          `☀️ Silakan berisik lagi 😹`
      }
    )
  }
}
