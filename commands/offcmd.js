import {
  disableGroupCommand,
  isGroupCommandDisabled,
  isProtectedGroupCommand
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
  name: 'offcmd',

  aliases: [
    'cmdoff',
    'disablecmd'
  ],

  category: 'GROUP',

  description:
    'Menonaktifkan command tertentu di grup',

  usage:
    '.offcmd <command>',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args,
    config,
    commands,
    isOwner,
    groupInfo
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
        `*${config.prefix}offcmd <command>*\n\n` +
        `Contoh:\n` +
        `${config.prefix}offcmd tebakkata`
      )

      return
    }

    const target =
      commands.get(
        input
      )

    if (!target) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `❓ Command \`${input}\` tidak ditemukan.`
      )

      return
    }

    const canonical =
      String(
        target.name || input
      )
        .trim()
        .toLowerCase()

    if (
      target.ownerOnly &&
      !isOwner
    ) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `🗿 Nice try.\n\n` +
        `\`${canonical}\` adalah command khusus Owner.\n` +
        `Admin grup tidak punya kuasa sampai situ 😹\n\n` +
        `👑 Owner tetap pemegang kekuasaan tertinggi.`
      )

      return
    }

    if (
      target.ownerOnly &&
      isOwner
    ) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `👑 \`${canonical}\` memang khusus Owner.\n` +
        `Command ini sudah terlindungi dari user/admin, jadi tidak perlu dimatikan.`
      )

      return
    }

    if (
      isProtectedGroupCommand(
        canonical
      )
    ) {
      const extra =
        canonical === 'menu'
          ? `\n\n🗿 Menu jangan dimatiin. Nanti admin sendiri nyari jalan pulang gimana 😹`
          : ''

      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `🛡️ \`${canonical}\` dilindungi sistem dan tidak bisa dinonaktifkan.` +
        extra
      )

      return
    }

    if (
      isGroupCommandDisabled(
        jid,
        canonical
      )
    ) {
      await reply(
        sock,
        jid,
        msg,
        `✦ *NEXA • COMMAND CONTROL*\n\n` +
        `🔴 \`${canonical}\` memang sudah OFF di grup ini.`
      )

      return
    }

    const result =
      disableGroupCommand({
        groupJid:
          jid,
        commandName:
          canonical,
        disabledBy:
          groupInfo?.sender ||
          null
      })

    if (!result.changed) {
      await reply(
        sock,
        jid,
        msg,
        `⚠️ Gagal menonaktifkan \`${canonical}\`.`
      )

      return
    }

    await reply(
      sock,
      jid,
      msg,
      `✦ *NEXA • COMMAND CONTROL*\n\n` +
      `🔴 \`${canonical}\` dinonaktifkan di grup ini.\n\n` +
      `👤 Oleh: ${
        isOwner
          ? 'Owner 👑'
          : 'Admin'
      }\n` +
      `👑 Owner tetap dapat menggunakan command ini.`
    )
  }
}
