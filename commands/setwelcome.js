import {
  getGroupConfig,
  updateGroupConfig
} from '../lib/groupdb.js'

const MAX_TEMPLATE_LENGTH =
  3000

function extractTemplate(
  text,
  prefix
) {
  const raw =
    String(text || '')

  if (!raw.startsWith(prefix)) {
    return ''
  }

  const body =
    raw.slice(prefix.length)

  const firstSpace =
    body.search(/\s/)

  if (firstSpace < 0) {
    return ''
  }

  return body
    .slice(firstSpace)
    .replace(/^\s+/, '')
    .trimEnd()
}

function statusText(
  data,
  prefix
) {
  return data.welcome
    ? '🟢 Welcome/Goodbye: ON'
    : (
        `🔴 Welcome/Goodbye: OFF\n` +
        `Aktifkan dengan *${prefix}welcome on*.`
      )
}

function helpText(
  data,
  prefix
) {
  const current =
    data.welcomeText
      ? (
          `\n\n📝 *Template sekarang:*\n` +
          `${data.welcomeText}`
        )
      : '\n\n📝 Template sekarang: *default NEXA*'

  return (
    `✦ *NEXA • SET WELCOME*\n\n` +
    `${prefix}setwelcome <pesan>\n` +
    `${prefix}setwelcome show\n` +
    `${prefix}setwelcome reset\n\n` +
    `Variable:\n` +
    `• @user = member\n` +
    `• @group = nama grup\n` +
    `• @count = jumlah member\n\n` +
    `Pesan multi-baris didukung.\n` +
    `${statusText(data, prefix)}` +
    current
  )
}

export default {
  name:
    'setwelcome',

  category:
    'GROUP',

  description:
    'Mengatur pesan welcome grup',

  usage:
    '.setwelcome <pesan>',

  groupOnly:
    true,

  adminOnly:
    true,

  async run({
    sock,
    msg,
    jid,
    text,
    config
  }) {
    const prefix =
      config?.prefix || '.'

    const data =
      getGroupConfig(jid)

    const template =
      extractTemplate(
        text,
        prefix
      )

    const action =
      template
        .trim()
        .toLowerCase()

    if (!template) {
      return sock.sendMessage(
        jid,
        {
          text:
            helpText(
              data,
              prefix
            )
        },
        {
          quoted: msg
        }
      )
    }

    if (
      action === 'show' ||
      action === 'lihat'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • WELCOME TEMPLATE*\n\n` +
            (
              data.welcomeText ||
              'Menggunakan template default NEXA.'
            )
        },
        {
          quoted: msg
        }
      )
    }

    if (
      action === 'reset' ||
      action === 'default'
    ) {
      const updated =
        updateGroupConfig(
          jid,
          {
            welcomeText: null
          }
        )

      return sock.sendMessage(
        jid,
        {
          text:
            `✅ Template welcome dikembalikan ke default NEXA.\n` +
            `${statusText(updated, prefix)}`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      template.length >
      MAX_TEMPLATE_LENGTH
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `❌ Template terlalu panjang.\n` +
            `Maksimal *${MAX_TEMPLATE_LENGTH} karakter*.`
        },
        {
          quoted: msg
        }
      )
    }

    const updated =
      updateGroupConfig(
        jid,
        {
          welcomeText: template
        }
      )

    return sock.sendMessage(
      jid,
      {
        text:
          `✅ Pesan welcome berhasil disimpan.\n` +
          `🧪 Preview: *${prefix}simulatewelcome*\n` +
          `${statusText(updated, prefix)}`
      },
      {
        quoted: msg
      }
    )
  }
}
