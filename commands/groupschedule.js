import {
  getGroupSchedule,
  setGroupSchedule
} from '../lib/groupSchedule.js'

function currentSender(msg) {
  return (
    msg?.key?.participant ||
    msg?.key?.participantAlt ||
    msg?.participant ||
    null
  )
}

async function reply(sock, jid, msg, text) {
  await sock.sendMessage(
    jid,
    { text },
    { quoted: msg }
  )
}

async function ensureBotAdmin({
  sock,
  jid,
  msg,
  groupInfo
}) {
  if (groupInfo?.isBotAdmin) {
    return true
  }

  await reply(
    sock,
    jid,
    msg,
    `✦ *NEXA • GROUP CONTROL*\n\n` +
    `😐 NEXA belum jadi Admin.\n\n` +
    `Mau ngatur grup pakai kekuatan pikiran? 🗿\n` +
    `Jadikan bot Admin dulu.`
  )

  return false
}

function statusText(schedule, prefix) {
  if (!schedule || !schedule.enabled) {
    return (
      `✦ *NEXA • GROUP SCHEDULE*\n\n` +
      `Status : 🔴 Tidak aktif\n\n` +
      `Atur jadwal dengan:\n` +
      `*${prefix}groupschedule 22:00 06:00*\n\n` +
      `🔒 Jam pertama = tutup\n` +
      `🔓 Jam kedua = buka`
    )
  }

  return (
    `✦ *NEXA • GROUP SCHEDULE*\n\n` +
    `Status : 🟢 Aktif\n` +
    `🔒 Tutup : *${schedule.closeAt} WIB*\n` +
    `🔓 Buka  : *${schedule.openAt} WIB*\n` +
    `🔁 Ulang : *Setiap hari*\n\n` +
    `Manual open/close tidak menghapus jadwal.`
  )
}

export default {
  name: 'groupschedule',
  aliases: [
    'groupsched',
    'jadwalgroup',
    'jadwalgrup'
  ],
  category: 'GROUP',
  description:
    'Atur jadwal otomatis buka/tutup grup',
  usage:
    '.groupschedule 22:00 06:00',
  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config,
    groupInfo
  }) {
    if (
      !await ensureBotAdmin({
        sock,
        jid,
        msg,
        groupInfo
      })
    ) {
      return
    }

    if (!args.length) {
      await reply(
        sock,
        jid,
        msg,
        statusText(
          getGroupSchedule(jid),
          config.prefix
        )
      )
      return
    }

    if (args.length < 2) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • GROUP SCHEDULE*\n\n` +
        `🗿 Jamnya kurang satu.\n\n` +
        `Contoh yang benar:\n` +
        `*${config.prefix}groupschedule 22:00 06:00*`
      )
      return
    }

    let schedule

    try {
      schedule = setGroupSchedule(
        jid,
        {
          closeAt: args[0],
          openAt: args[1],
          updatedBy: currentSender(msg)
        }
      )
    } catch (error) {
      const same =
        error?.message === 'SAME_TIME'

      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • GROUP SCHEDULE*\n\n` +
        (
          same
            ? `🗿 Jam tutup dan buka masa sama.\nGrupnya disuruh galau apa gimana 😹`
            : `🗿 Jamnya agak mencurigakan.\n\n` +
              `Format harus *HH:MM* (24 jam).\n` +
              `Contoh:\n` +
              `*${config.prefix}groupschedule 22:00 06:00*`
        )
      )
      return
    }

    await reply(
      sock,
      jid,
      msg,
      `✦ *NEXA • GROUP SCHEDULE*\n\n` +
      `✅ Jadwal grup berhasil diaktifkan.\n\n` +
      `🔒 Tutup : *${schedule.closeAt} WIB*\n` +
      `🔓 Buka  : *${schedule.openAt} WIB*\n` +
      `🔁 Ulang : *Setiap hari*\n\n` +
      `🗿 Warga resmi punya jam malam.`
    )

  }
}
