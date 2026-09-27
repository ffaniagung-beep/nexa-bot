// NEXA_PREMIUM_MENU_FOUNDATION_V11
import { getUser } from '../lib/userdb.js'
import { getPremiumAccess } from '../lib/premiumGate.js'

function remain(ts) {
  const m = Math.max(0, Math.floor(((Number(ts) || 0) - Date.now()) / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const r = m % 60
  if (d > 0) return `${d} hari ${h} jam`
  if (h > 0) return `${h} jam ${r} menit`
  return `${r} menit`
}

function fmt(ts) {
  return new Intl.DateTimeFormat(
    'id-ID',
    {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'short'
    }
  ).format(new Date(Number(ts) || Date.now()))
}

export default {
  name: 'premstatus',
  aliases: ['premiumstatus', 'premprofile'],
  category: 'PREMIUM',
  premiumOnly: true,
  description: 'Lihat status akses Premium NEXA',
  usage: '.premstatus',

  async run({ sock, msg, jid, isOwner }) {
    const access = getPremiumAccess({ msg, jid, isOwner })

    if (access.owner) {
      return sock.sendMessage(
        jid,
        {
          text:
            '💎 *NEXA • PREMIUM STATUS*\n' +
            '━━━━━━━━━━━━━━━━━━\n\n' +
            '👑 Status: *OWNER BYPASS*\n' +
            '🔓 Premium Access: *TERBUKA*\n' +
            '⏳ Masa aktif: *∞*'
        },
        { quoted: msg }
      )
    }

    const user = getUser(access.userJid)
    const until = Number(user?.premiumUntil) || 0

    return sock.sendMessage(
      jid,
      {
        text:
          '💎 *NEXA • PREMIUM STATUS*\n' +
          '━━━━━━━━━━━━━━━━━━\n\n' +
          '⭐ Status: *PREMIUM AKTIF*\n' +
          '🔓 Premium Access: *TERBUKA*\n' +
          `⏳ Tersisa: *${remain(until)}*\n` +
          `📅 Aktif sampai: *${fmt(until)}*\n\n` +
          '✨ Benefit:\n' +
          '• Akses fitur Premium\n' +
          '• Diskon Limit di fitur tertentu\n\n' +
          '🛡️ Anti-Spam tetap berlaku.'
      },
      { quoted: msg }
    )
  }
}
