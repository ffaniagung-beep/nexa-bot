function formatUptime(seconds) {
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

  const parts = []

  if (days) {
    parts.push(
      `${days}d`
    )
  }

  if (hours) {
    parts.push(
      `${hours}h`
    )
  }

  if (minutes) {
    parts.push(
      `${minutes}m`
    )
  }

  parts.push(
    `${secs}s`
  )

  return parts.join(' ')
}

function formatBytes(bytes) {
  const mb =
    Number(bytes || 0) /
    1024 /
    1024

  return `${mb.toFixed(1)} MB`
}

function getMessageTimestamp(msg) {
  try {
    const raw =
      msg?.messageTimestamp

    if (!raw) {
      return null
    }

    const value =
      Number(raw)

    if (
      !Number.isFinite(value)
    ) {
      return null
    }

    return value * 1000
  } catch {
    return null
  }
}

function getPingLevel(ms) {
  if (ms <= 150) {
    return '🟢 Sangat Cepat'
  }

  if (ms <= 350) {
    return '🟢 Cepat'
  }

  if (ms <= 700) {
    return '🟡 Normal'
  }

  if (ms <= 1200) {
    return '🟠 Agak Delay'
  }

  return '🔴 Delay'
}

export default {
  name: 'ping',

  aliases: [
    'speed',
    'latency'
  ],

  category: 'BOT',

  description:
    'Mengecek kecepatan dan status NEXA-BOT',

  usage:
    '.ping',

  async run({
    sock,
    msg,
    jid
  }) {
    const now =
      Date.now()

    const messageTime =
      getMessageTimestamp(
        msg
      )

    const latency =
      messageTime
        ? Math.max(
            0,
            now - messageTime
          )
        : 0

    const memory =
      process.memoryUsage()

    const uptime =
      formatUptime(
        process.uptime()
      )

    const status =
      getPingLevel(
        latency
      )

    const text =
      `╭───「 ⚡ *NEXA PING* 」───\n` +
      `│\n` +
      `│ 🏓 Pong!\n` +
      `│ ⚡ Latency : *${latency} ms*\n` +
      `│ 📡 Status  : *${status}*\n` +
      `│ 🧠 RAM     : *${formatBytes(memory.rss)}*\n` +
      `│ ⏱ Uptime  : *${uptime}*\n` +
      `│ 🟢 NEXA    : *ONLINE*\n` +
      `│\n` +
      `╰──────────────────\n\n` +
      `⚡ *NEXA-BOT SYSTEM*`

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
