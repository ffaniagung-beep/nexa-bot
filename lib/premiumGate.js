import {
  isPremium
} from './userdb.js'

import {
  getProfileJid
} from './profile.js'

// =====================================
// PREMIUM ACCESS
// =====================================

export function getPremiumAccess({
  msg,
  jid,
  isOwner
}) {
  const userJid =
    getProfileJid(
      msg,
      jid
    )

  if (isOwner) {
    return {
      allowed: true,
      owner: true,
      premium: false,
      userJid
    }
  }

  const premium =
    isPremium(
      userJid
    )

  return {
    allowed:
      premium,

    owner:
      false,

    premium,

    userJid
  }
}

// =====================================
// PREMIUM MESSAGE
// =====================================

export async function sendPremiumOnly({
  sock,
  msg,
  jid
}) {
  return sock.sendMessage(
    jid,
    {
      text:
        `👑 *NEXA PREMIUM*\n\n` +
        `Fitur ini khusus user Premium 😭\n\n` +

        `✨ *Paket Premium:*\n` +
        `• Rp3.000  → 2 Hari\n` +
        `• Rp5.000  → 5 Hari\n` +
        `• Rp10.000 → 15 Hari\n` +
        `• Rp20.000 → 30 Hari\n\n` +

        `⭐ Premium mendapatkan:\n` +
        `• Akses fitur Premium\n` +
        `• Bebas pemakaian Limit\n\n` +

        `⚠️ Premium tetap terkena Anti-Spam.\n` +
        `Premium ≠ Owner.\n\n` +

        `💬 Kalau mau Premium, chat Owner NEXA 😇`
    },
    {
      quoted:
        msg
    }
  )
}
