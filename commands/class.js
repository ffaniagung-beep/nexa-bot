import {
  chooseRpgClass,
  RPG_CLASSES
} from '../lib/rpg/core.js'

import {
  getRpgJid
} from '../lib/rpg/ui.js'

export default {
  name: 'class',
  aliases: [],
  category: 'RPG',
  description: 'Memilih class karakter RPG',
  usage: '.class warrior/ranger/mage',

  async run({
    sock,
    msg,
    jid,
    args,
    isOwner
  }) {
    const choice =
      String(
        args?.[0] || ''
      ).trim()

    if (!choice) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━〔 🧬 *PILIH CLASS* 〕━━╮\n` +
            `│\n` +
            `│ ⚔️ *Warrior*\n` +
            `│ ❤️ HP tinggi • 🛡 DEF tinggi\n` +
            `│\n` +
            `│ 🏹 *Ranger*\n` +
            `│ ⚔️ ATK bagus • status seimbang\n` +
            `│\n` +
            `│ 🔮 *Mage*\n` +
            `│ 🔷 Mana tinggi • ⚔️ ATK tinggi\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n` +
            `Gunakan:\n` +
            `*.class warrior*\n` +
            `*.class ranger*\n` +
            `*.class mage*`
        },
        {
          quoted: msg
        }
      )
    }

    const userJid =
      await getRpgJid({
        sock,
        msg,
        jid
      })

    const result =
      chooseRpgClass(
        userJid,
        choice,
        {
          force:
            Boolean(
              isOwner
            )
        }
      )

    if (
      result.reason ===
      'INVALID_CLASS'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '❌ Class tidak dikenal.\n\n' +
            'Pilih: *warrior / ranger / mage*'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      result.reason ===
      'CLASS_LOCKED'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🔒 Class kamu sudah dipilih.\n\n` +
            `Class: *${
              RPG_CLASSES[
                result.profile.class
              ]?.name ||
              result.profile.class
            }*`
        },
        {
          quoted: msg
        }
      )
    }

    const p =
      result.profile

    const c =
      result.classInfo

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━〔 🧬 *CLASS SELECTED* 〕━━╮\n` +
          `│\n` +
          `│ ${c.icon} *${c.name}*\n` +
          `│\n` +
          `│ ❤️ HP   : *${p.maxHp}*\n` +
          `│ 🔷 Mana : *${p.maxMana}*\n` +
          `│ ⚔️ ATK  : *${p.attack}*\n` +
          `│ 🛡 DEF  : *${p.defense}*\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━╯` +
          (
            result.firstClass
              ? `\n\n🎁 Starter gear + *2 Small Potion* diterima.`
              : `\n\n😇 Owner class override.`
          )
      },
      {
        quoted: msg
      }
    )
  }
}
