import {
  disableGroupSchedule,
  getGroupSchedule
} from '../lib/groupSchedule.js'

async function reply(sock, jid, msg, text) {
  await sock.sendMessage(
    jid,
    { text },
    { quoted: msg }
  )
}

export default {
  name: 'cancelgroupschedule',
  aliases: [
    'stopgroupschedule',
    'hapusjadwalgroup',
    'hapusjadwalgrup'
  ],
  category: 'GROUP',
  description:
    'Matikan jadwal otomatis buka/tutup grup',
  usage:
    '.cancelgroupschedule',
  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    const schedule =
      getGroupSchedule(jid)

    if (!schedule || !schedule.enabled) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • GROUP SCHEDULE*\n\n` +
        `🗿 Jadwalnya aja belum aktif, mau dibatalin apanya 😹`
      )
      return
    }

    disableGroupSchedule(jid)

    await reply(
      sock,
      jid,
      msg,
      `✦ *NEXA • GROUP SCHEDULE*\n\n` +
      `🛑 Jadwal otomatis dinonaktifkan.\n\n` +
      `🔒/🔓 Grup sekarang hanya berubah kalau Admin mengaturnya manual.`
    )
  }
}
