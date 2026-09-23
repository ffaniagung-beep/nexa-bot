import {
  closeGroupNow
} from '../lib/groupSchedule.js'

async function reply(sock, jid, msg, text) {
  await sock.sendMessage(
    jid,
    { text },
    { quoted: msg }
  )
}

export default {
  name: 'closegroup',
  aliases: [
    'tutupgroup',
    'tutupgrup'
  ],
  category: 'GROUP',
  description:
    'Tutup grup sekarang (hanya admin bisa chat)',
  usage:
    '.closegroup',
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

    await closeGroupNow(
      sock,
      jid
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `✦ *NEXA • GROUP CONTROL*\n\n` +
          `🔒 Grup ditutup.\n\n` +
          `Hanya Admin yang dapat mengirim pesan.\n` +
          `🌙 Sampai jumpa besok, warga sekalian 🗿`
      }
    )
  }
}
