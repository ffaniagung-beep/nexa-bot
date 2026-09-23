import {
  enableGroupCommand,
  getDisabledGroupCommands
} from '../lib/groupCommandControl.js'

function normalizeInput(
  value,
  prefix
) {
  let name =
    String(
      value || ''
    ).trim()

  if (
    prefix &&
    name.startsWith(prefix)
  ) {
    name =
      name.slice(
        prefix.length
      )
  }

  return name
    .trim()
    .toLowerCase()
}

async function reply(
  sock,
  jid,
  msg,
  text
) {
  await sock.sendMessage(
    jid,
    {
      text
    },
    {
      quoted: msg
    }
  )
}

export default {
  name: 'oncmd',

  aliases: [
    'cmdon',
    'enablecmd'
  ],

  category: 'GROUP',

  description:
    'Mengaktifkan kembali command yang dimatikan di grup',

  usage:
    '.oncmd <command>',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config,
    commands,
    isOwner
  }) {
    const input =
      normalizeInput(
        args[0],
        config.prefix
      )

    if (!input) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `Gunakan:\n` +
        `*${config.prefix}oncmd <command>*\n\n` +
        `Lihat daftar OFF:\n` +
        `*${config.prefix}offcmdlist*`
      )

      return
    }

    const target =
      commands.get(
        input
      )

    const canonical =
      String(
        target?.name ||
        input
      )
        .trim()
        .toLowerCase()

    const disabled =
      getDisabledGroupCommands(
        jid
      )

    if (
      !disabled.includes(
        canonical
      )
    ) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `🟢 \`${canonical}\` sudah aktif di grup ini.`
      )

      return
    }

    const result =
      enableGroupCommand({
        groupJid:
          jid,
        commandName:
          canonical
      })

    if (!result.changed) {
      await reply(
        sock,
        jid,
        msg,
        `⚠️ Gagal mengaktifkan \`${canonical}\`.`
      )

      return
    }

    await reply(
      sock,
      jid,
      msg,
      `✦ *NEXA • COMMAND CONTROL*\n\n` +
      `🟢 \`${canonical}\` kembali aktif di grup ini.\n\n` +
      `👤 Oleh: ${
        isOwner
          ? 'Owner 👑'
          : 'Admin'
      }`
    )
  }
}
