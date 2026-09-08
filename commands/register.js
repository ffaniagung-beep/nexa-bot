import {
  ensureUser,
  updateUser
} from '../lib/userdb.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

function getText(msg) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    ''
  )
}

export default {
  name:
    'register',

  aliases: [
    'reg'
  ],

  category:
    'PROFILE',

  description:
    'Mendaftarkan akun NEXA',

  usage:
    '.register nama.umur',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    const userJid =
      await resolveProfileJid(sock, msg, jid)

    const user =
      ensureUser(
        userJid
      )

    if (
      user.registeredAt
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `✓ Kamu sudah terdaftar di NEXA.\n\n` +
            `Nama  : *${user.name}*\n` +
            `Umur  : *${user.age}*\n\n` +
            `Ketik *.menu* untuk membuka menu.`
        },
        {
          quoted: msg
        }
      )
    }

    const fullText =
      getText(msg)

    const input =
      fullText
        .replace(
          /^\.(register|reg)\s*/i,
          ''
        )
        .trim()

    const separator =
      input.lastIndexOf('.')

    if (
      separator <= 0 ||
      separator ===
        input.length - 1
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `✦ *REGISTER NEXA*\n\n` +
            `Format pendaftaran:\n` +
            `*.register nama.umur*\n\n` +
            `Contoh:\n` +
            `*.register Budi.17*`
        },
        {
          quoted: msg
        }
      )
    }

    const name =
      input
        .slice(
          0,
          separator
        )
        .trim()

    const ageText =
      input
        .slice(
          separator + 1
        )
        .trim()

    const age =
      Number(ageText)

    if (
      !name ||
      name.length > 30
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Nama harus berisi 1–30 karakter.'
        },
        {
          quoted: msg
        }
      )
    }

    if (
      !Number.isInteger(age) ||
      age < 1 ||
      age > 120
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            'Umur harus berupa angka yang valid.'
        },
        {
          quoted: msg
        }
      )
    }

    updateUser(
      userJid,
      {
        name,
        age,
        registeredAt:
          Date.now()
      }
    )

    const role =
      isOwner
        ? 'Owner 👑'
        : 'Member'

    await sock.sendMessage(
      jid,
      {
        text:
          `✓ *REGISTRASI BERHASIL*\n\n` +
          `Selamat datang di *NEXA-BOT*.\n\n` +
          `Nama  : *${name}*\n` +
          `Umur  : *${age}*\n` +
          `Role  : *${role}*\n\n` +
          `Akun NEXA kamu sudah aktif.\n` +
          `Ketik *.menu* untuk mulai menggunakan bot.`
      },
      {
        quoted: msg
      }
    )
  }
}
