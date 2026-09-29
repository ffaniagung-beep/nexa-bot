import fs from 'node:fs'
import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

const LEGACY_FILE =
  './database/groups.json'

function getRules(groupJid) {
  const current =
    getGroupConfig(groupJid)

  if (current.rules) {
    return current.rules
  }

  // Fallback sekali untuk rules lama yang mungkin ditulis ke
  // groups.json setelah migrasi group DB pertama kali selesai.
  try {
    const legacy =
      JSON.parse(
        fs.readFileSync(
          LEGACY_FILE,
          'utf8'
        )
      )

    const oldRules =
      String(
        legacy?.[groupJid]
          ?.rules || ''
      ).trim()

    if (oldRules) {
      updateGroupConfig(
        groupJid,
        {
          rules: oldRules
        }
      )

      return oldRules
    }
  } catch {}

  return null
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

    const rules =
      getRules(jid) ||
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
