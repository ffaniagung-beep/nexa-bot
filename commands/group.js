export default {
  name: 'group',
  aliases: ['gc'],
  category: 'GROUP',
  description: 'Membuka atau menutup grup',
  usage: '.group open/close',

  groupOnly: true,
  adminOnly: true,
  botAdmin: true,

  async run({ sock, msg, jid, args }) {
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(
        jid,
        { text: '❌ Command ini cuma buat grup.' },
        { quoted: msg }
      )
      return
    }

    const action =
      args[0]?.toLowerCase()

    if (!action) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Gunakan:\n' +
            '!group open\n' +
            '!group close'
        },
        { quoted: msg }
      )
      return
    }

    if (action === 'open') {
      await sock.groupSettingUpdate(
        jid,
        'not_announcement'
      )

      await sock.sendMessage(
        jid,
        { text: '🔓 Grup dibuka.' }
      )

      return
    }

    if (action === 'close') {
      await sock.groupSettingUpdate(
        jid,
        'announcement'
      )

      await sock.sendMessage(
        jid,
        { text: '🔒 Grup ditutup.' }
      )

      return
    }

    await sock.sendMessage(
      jid,
      {
        text:
          '❓ Pilih `open` atau `close`.'
      },
      { quoted: msg }
    )
  }
}
