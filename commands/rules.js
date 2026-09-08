import fs from 'fs'

const DB =
  './database/groups.json'

function readDB() {
  try {
    return JSON.parse(
      fs.readFileSync(DB, 'utf8')
    )
  } catch {
    return {}
  }
}

export default {
  name: 'rules',
  aliases: ['rule'],
  category: 'GROUP',
  description: 'Menampilkan rules grup',
  usage: '.rules',
  groupOnly: true,

  async run({
    sock,
    msg,
    jid
  }) {
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Rules cuma tersedia di grup.'
        },
        { quoted: msg }
      )

      return
    }

    const db = readDB()

    const rules =
      db[jid]?.rules ||
      'Belum ada rules untuk grup ini.'

    await sock.sendMessage(
      jid,
      {
        text:
          `📜 *GROUP RULES*\n\n${rules}`
      },
      { quoted: msg }
    )
  }
}
