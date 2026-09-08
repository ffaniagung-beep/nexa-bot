import {
  ensureUser,
  getRequiredExp,
  isPremium
} from '../lib/userdb.js'

import {
  getProfileJid,
  getProfileNumber,
  formatGender
} from '../lib/profile.js'

function formatPremiumDate(
  timestamp
) {
  if (!timestamp) {
    return null
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',

      timeZone:
        'Asia/Jakarta'
    }
  ).format(
    new Date(timestamp)
  )
}

function formatPremiumRemaining(
  timestamp
) {
  let ms =
    Math.max(
      0,
      Number(timestamp) -
        Date.now()
    )

  const day =
    Math.floor(
      ms / 86400000
    )

  ms %=
    86400000

  const hour =
    Math.floor(
      ms / 3600000
    )

  ms %=
    3600000

  const minute =
    Math.floor(
      ms / 60000
    )

  ms %=
    60000

  const second =
    Math.floor(
      ms / 1000
    )

  return (
    `${day} hari ` +
    `${hour} jam ` +
    `${minute} menit ` +
    `${second} detik`
  )
}

export default {
  name:
    'me',

  aliases: [
    'profile',
    'profil'
  ],

  category:
    'PROFILE',

  description:
    'Melihat profil NEXA',

  usage:
    '.me',

  async run({
    sock,
    msg,
    jid,
    isOwner
  }) {
    const userJid =
      getProfileJid(
        msg,
        jid
      )

    // isPremium() sekaligus membersihkan
    // Premium yang sudah kedaluwarsa.
    const premiumActive =
      !isOwner &&
      isPremium(
        userJid
      )

    const user =
      ensureUser(
        userJid
      )

    const requiredExp =
      getRequiredExp(
        user.level
      )

    const role =
      isOwner
        ? 'Owner 👑'
        : 'User'

    let status

    if (isOwner) {
      status =
        'Owner 👑'
    } else if (
      premiumActive
    ) {
      status =
        'Premium ⭐'
    } else {
      status =
        'Free'
    }

    const limit =
      isOwner
        ? '∞'
        : user.limit

    const level =
      isOwner
        ? '∞'
        : user.level

    const exp =
      isOwner
        ? '∞'
        : `${user.exp}/${requiredExp}`

    const number =
      getProfileNumber(
        userJid
      )

    let premiumLine =
      ''

    if (
      premiumActive &&
      user.premiumUntil
    ) {
      premiumLine =
        `│ ⏳ Sisa    : ${formatPremiumRemaining(
          user.premiumUntil
        )}\n` +
        `│ 📅 Sampai  : ${formatPremiumDate(
          user.premiumUntil
        )} WIB\n`
    }

    const text =
      `╭─ *NEXA PROFILE*\n` +
      `│\n` +
      `│ 👤 Nama   : ${user.name || msg.pushName || 'Belum diatur'}\n` +
      `│ 🎂 Umur   : ${user.age ?? 'Belum diatur'}\n` +
      `│ ⚧ Gender : ${formatGender(user.gender)}\n` +
      `│ 👑 Role   : ${role}\n` +
      `│ ⭐ Status : ${status}\n` +
      premiumLine +
      `│\n` +
      `│ 🧬 Level  : ${level}\n` +
      `│ ✨ EXP    : ${exp}\n` +
      `│ 🎟 Limit  : ${limit}\n` +
      `│ 🪙 Coin   : ${Number(user.coin).toLocaleString('id-ID')}\n` +
      `│\n` +
      `│ 📱 ID     : ${number || '-'}\n` +
      `╰────────────`

    try {
      const pp =
        await sock
          .profilePictureUrl(
            userJid,
            'image'
          )

      await sock.sendMessage(
        jid,
        {
          image: {
            url: pp
          },

          caption:
            text
        },
        {
          quoted:
            msg
        }
      )
    } catch {
      await sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
