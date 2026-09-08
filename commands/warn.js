import {
  getTarget
} from '../lib/group.js'

import {
  addWarning,
  resetWarning
} from '../lib/groupdb.js'

export default {
  name: 'warn',

  category: 'GROUP',
  description:
    'Memberi warning kepada member',
  usage:
    '.warn @user',

  groupOnly: true,
  adminOnly: true,

  async run({
    sock,
    msg,
    jid,
    config,
    groupInfo
  }) {
    const target =
      getTarget(msg)

    if (!target) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Gunakan:\n` +
            `${config.prefix}warn @user\n\n` +
            `Atau reply pesan member lalu ketik ${config.prefix}warn`
        },
        {
          quoted: msg
        }
      )

      return
    }

    const count =
      addWarning(
        jid,
        target
      )

    const mention =
      `@${String(target)
        .split('@')[0]}`

    // ===============================
    // MAX WARNING
    // ===============================

    if (count >= 3) {
      if (
        groupInfo?.isBotAdmin
      ) {
        try {
          await sock
            .groupParticipantsUpdate(
              jid,
              [target],
              'remove'
            )

          resetWarning(
            jid,
            target
          )

          await sock.sendMessage(
            jid,
            {
              text:
                `⛔ ${mention} mencapai *3/3 warning* dan dikeluarkan dari grup.`,
              mentions: [target]
            }
          )

          return
        } catch (err) {
          console.error(
            'Warn kick error:',
            err
          )
        }
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ ${mention} mencapai *${count}/3 warning*.\n\n` +
            `NEXA-BOT belum bisa mengeluarkan member. Pastikan bot menjadi admin.`,
          mentions: [target]
        },
        {
          quoted: msg
        }
      )

      return
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ *Warning*\n\n` +
          `${mention} mendapatkan peringatan.\n` +
          `Warn: *${count}/3*`,
        mentions: [target]
      },
      {
        quoted: msg
      }
    )
  }
}
