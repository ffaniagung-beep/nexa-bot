function getRuntime(seconds) {
  const total =
    Math.floor(
      Number(seconds) || 0
    )

  const days =
    Math.floor(
      total / 86400
    )

  const hours =
    Math.floor(
      (total % 86400) / 3600
    )

  const minutes =
    Math.floor(
      (total % 3600) / 60
    )

  const secs =
    total % 60

  return {
    days,
    hours,
    minutes,
    secs
  }
}

function formatStartTime() {
  const startedAt =
    new Date(
      Date.now() -
      process.uptime() * 1000
    )

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      timeZone:
        'Asia/Jakarta',

      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',

      hour:
        '2-digit',

      minute:
        '2-digit',

      second:
        '2-digit',

      hour12:
        false
    }
  )
    .format(
      startedAt
    )
    .replace(
      /\./g,
      ':'
    )
}

export default {
  name: 'runtime',

  aliases: [
    'uptime'
  ],

  category: 'BOT',

  description:
    'Menampilkan waktu hidup NEXA-BOT',

  usage:
    '.runtime',

  async run({
    sock,
    msg,
    jid
  }) {
    const runtime =
      getRuntime(
        process.uptime()
      )

    const text =
      `╭───「 ⏱ *NEXA RUNTIME* 」───\n` +
      `│\n` +
      `│ 🗓 Hari   : *${runtime.days}*\n` +
      `│ 🕐 Jam    : *${runtime.hours}*\n` +
      `│ ⏳ Menit  : *${runtime.minutes}*\n` +
      `│ ⚡ Detik  : *${runtime.secs}*\n` +
      `│\n` +
      `│ 🚀 Started:\n` +
      `│ *${formatStartTime()} WIB*\n` +
      `│\n` +
      `│ 🟢 Status : *ONLINE*\n` +
      `│ ⚙️ PID    : *${process.pid}*\n` +
      `│ 🟩 Node   : *${process.version}*\n` +
      `│\n` +
      `╰────────────────────\n\n` +
      `⚡ *NEXA-BOT NEVER SLEEP* 😭`

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
}
