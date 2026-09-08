import {
  randomItem
} from '../lib/fun.js'

export default {
  name:
    'choose',

  aliases: [
    'pilih',
    'pick'
  ],

  category:
    'FUN',

  description:
    'Meminta NEXA memilih salah satu pilihan',

  usage:
    '.choose pilihan1 | pilihan2',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const input =
      args
        .join(' ')
        .trim()

    if (!input) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎯 *NEXA CHOOSE*\n\n` +
            `Pisahkan pilihan pakai *|*.\n\n` +
            `Contoh:\n` +
            `*${config.prefix}choose mie | nasi | ayam*`
        },
        {
          quoted: msg
        }
      )
    }

    const raw =
      input
        .split('|')
        .map(
          x =>
            x.trim()
        )
        .filter(Boolean)

    const seen =
      new Set()

    const choices =
      raw.filter(
        choice => {
          const key =
            choice.toLowerCase()

          if (
            seen.has(key)
          ) {
            return false
          }

          seen.add(key)
          return true
        }
      )

    if (
      choices.length < 2
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Kasih minimal *2 pilihan berbeda*.\n\n` +
            `Contoh:\n` +
            `*${config.prefix}choose tidur | main game*`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      choices.length > 20
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '😭 Maksimal *20 pilihan*.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      choices.some(
        x =>
          x.length > 150
      )
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            '😭 Salah satu pilihannya kepanjangan.'
        },
        {
          quoted: msg
        }
      )
    }

    const normalized =
      choices
        .map(
          x =>
            x.toLowerCase()
        )
        .sort()
        .join('|')

    const result =
      randomItem(
        choices,
        {
          key:
            `choose:${jid}:${normalized}`,

          keep:
            Math.min(
              3,
              choices.length - 1
            )
        }
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 🎯 *NEXA CHOOSE* 」\n` +
          `│\n` +
          `│ 🤔 Dari *${choices.length} pilihan*...\n` +
          `│\n` +
          `│ 👉 *${result}*\n` +
          `│\n` +
          `╰──────────────`
      },
      {
        quoted: msg
      }
    )
  }
}
