import fs from 'fs'
import {
  getGroupInfo
} from '../lib/group.js'

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

function saveDB(data) {
  fs.writeFileSync(
    DB,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

export default {
  name: 'setrules',
  category: 'GROUP',
  description: 'Mengubah rules grup',
  usage: '.setrules <teks>',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const info =
      await getGroupInfo(
        sock,
        jid,
        msg
      )

    if (!info.isGroup) {
      await sock.sendMessage(
        jid,
        {
          text:
            '❌ Command ini cuma buat grup.'
        },
        { quoted: msg }
      )

      return
    }

    if (!info.isAdmin) {
      await sock.sendMessage(
        jid,
        {
          text:
            '⛔ Hanya admin yang bisa mengubah rules.'
        },
        { quoted: msg }
      )

      return
    }

    const rules =
      args.join(' ').trim()

    if (!rules) {
      await sock.sendMessage(
        jid,
        {
          text:
            'Contoh:\n' +
            '!setrules Dilarang spam, saling menghormati.'
        },
        { quoted: msg }
      )

      return
    }

    const db = readDB()

    db[jid] ??= {}

    db[jid].rules =
      rules

    saveDB(db)

    await sock.sendMessage(
      jid,
      {
        text:
          '✅ Rules grup berhasil disimpan.'
      },
      { quoted: msg }
    )
  }
}
