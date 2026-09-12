import {
  getUser,
  isPremium
} from './userdb.js'

import {
  purchaseShopItemAtomic
} from './economyPolicy.js'

import {
  getProfileJid
} from './profile.js'

// =====================================
// NEXA SHOP CORE
// =====================================

const sessions =
  new Map()

const listenedSockets =
  new WeakSet()

const SESSION_TIME =
  2 * 60 * 1000

// =====================================
// CATALOG
// =====================================

export const SHOP_ITEMS = {
  '1': {
    type: 'limit',
    amount: 5,
    price: 200,
    label: '+5 Limit'
  },

  '2': {
    type: 'limit',
    amount: 10,
    price: 380,
    label: '+10 Limit'
  },

  '3': {
    type: 'limit',
    amount: 25,
    price: 850,
    label: '+25 Limit'
  },

  '4': {
    type: 'limit',
    amount: 50,
    price: 1600,
    label: '+50 Limit'
  },

  '5': {
    type: 'premium',
    days: 15,
    price: 25000,
    label: 'Premium 15 Hari'
  },

  '6': {
    type: 'premium',
    days: 30,
    price: 45000,
    label: 'Premium 30 Hari'
  }
}

// =====================================
// HELPERS
// =====================================

function sessionKey(
  jid
) {
  return String(jid || '')
    .trim()
    .toLowerCase()
}

function getText(msg) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    ''
  )
}

function getReplyId(msg) {
  return (
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.stanzaId ||
    null
  )
}

function formatNumber(
  number
) {
  return Number(number || 0)
    .toLocaleString('id-ID')
}

function formatPremiumDate(
  timestamp
) {
  return new Intl.DateTimeFormat(
    'id-ID',
    {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone:
        'Asia/Jakarta'
    }
  ).format(
    new Date(timestamp)
  )
}

// =====================================
// SESSION
// =====================================

function getSession(
  userJid
) {
  const key =
    sessionKey(userJid)

  const session =
    sessions.get(key)

  if (!session) {
    return null
  }

  if (
    session.expiresAt <=
    Date.now()
  ) {
    sessions.delete(key)
    return null
  }

  return session
}

function deleteSession(
  userJid
) {
  sessions.delete(
    sessionKey(userJid)
  )
}

// =====================================
// PROCESS BUY
// =====================================

async function processPurchase(
  sock,
  msg,
  jid,
  userJid,
  session,
  choice
) {
  const item =
    SHOP_ITEMS[choice]

  if (!item) {
    await sock.sendMessage(
      jid,
      {
        text:
          '❌ Item tidak tersedia.\n' +
          'Reply angka *1–6*.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  // =================================
  // OWNER 🗿👑
  // =================================

  if (session.isOwner) {
    let thing

    if (
      item.type ===
      'premium'
    ) {
      thing =
        'Premium'
    } else {
      thing =
        'Limit'
    }

    deleteSession(
      userJid
    )

    await sock.sendMessage(
      jid,
      {
        text:
          `👑 Lu Owner njir, ngapain beli *${thing}* 😭\n` +
          `Akses lu udah di atas Premium.`
      },
      {
        quoted: msg
      }
    )

    return
  }

  // =================================
  // ATOMIC PURCHASE
  // Coin spend + reward berada dalam
  // satu SQLite transaction.
  // =================================

  const purchase =
    purchaseShopItemAtomic(
      userJid,
      item
    )

  if (!purchase.success) {
    if (
      purchase.reason ===
      'COIN_LOW'
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            `🪙 Coin lu kurang 😭\n\n` +
            `Harga: *${formatNumber(item.price)} Coin*\n` +
            `Coin lu: *${formatNumber(purchase.user?.coin)}*\n` +
            `Kurang: *${formatNumber(purchase.missing)} Coin*`
        },
        {
          quoted: msg
        }
      )

      // Session tetap hidup.
      // User bisa pilih item lebih murah.
      return
    }

    throw new Error(
      `SHOP_${purchase.reason || 'FAILED'}`
    )
  }

  const updated =
    purchase.user

  deleteSession(
    userJid
  )

  if (
    item.type ===
    'limit'
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `✅ *PEMBELIAN BERHASIL*\n\n` +
          `🎟 +${item.amount} Limit\n` +
          `🪙 -${formatNumber(item.price)} Coin\n\n` +
          `🎟 Limit: *${updated.limit}*\n` +
          `🪙 Coin: *${formatNumber(updated.coin)}*`
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    item.type ===
    'premium'
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          `⭐ *PREMIUM ACTIVATED*\n\n` +
          `⏳ +${item.days} Hari\n` +
          `🪙 -${formatNumber(item.price)} Coin\n` +
          `📅 Aktif sampai:\n` +
          `*${formatPremiumDate(updated.premiumUntil)}*\n\n` +
          `🪙 Coin tersisa: *${formatNumber(updated.coin)}*`
      },
      {
        quoted: msg
      }
    )
  }
}

// =====================================
// HANDLE REPLY
// =====================================

async function handleShopReply(
  sock,
  msg
) {
  if (
    !msg?.message ||
    msg.key?.fromMe
  ) {
    return
  }

  const jid =
    msg.key.remoteJid

  if (!jid) {
    return
  }

  const userJid =
    getProfileJid(
      msg,
      jid
    )

  if (!userJid) {
    return
  }

  const session =
    getSession(
      userJid
    )

  if (!session) {
    return
  }

  const replyId =
    getReplyId(msg)

  // Harus reply pesan shop milik sendiri.
  if (
    !replyId ||
    replyId !==
      session.shopMessageId
  ) {
    return
  }

  const choice =
    String(
      getText(msg)
    )
      .trim()

  if (!choice) {
    return
  }

  await processPurchase(
    sock,
    msg,
    jid,
    userJid,
    session,
    choice
  )
}

// =====================================
// LISTENER
// =====================================

function ensureListener(
  sock
) {
  if (
    listenedSockets.has(
      sock
    )
  ) {
    return
  }

  listenedSockets.add(
    sock
  )

  sock.ev.on(
    'messages.upsert',
    async ({
      messages,
      type
    }) => {
      if (
        type !== 'notify'
      ) {
        return
      }

      for (
        const msg
        of messages
      ) {
        try {
          await handleShopReply(
            sock,
            msg
          )
        } catch (err) {
          console.error(
            '🛒 Shop reply:',
            err
          )
        }
      }
    }
  )
}

// =====================================
// OPEN SHOP
// =====================================

export async function openShop({
  sock,
  msg,
  jid,
  userJid,
  isOwner
}) {
  ensureListener(sock)

  // isPremium() sekaligus membersihkan
  // Premium yang sudah expired.
  const premiumActive =
    !isOwner &&
    isPremium(
      userJid
    )

  const user =
    getUser(
      userJid
    )

  const premiumStatus =
    isOwner
      ? 'Owner 👑'
      : premiumActive
        ? 'Premium ⭐'
        : 'Free'

  const text =
    `🛒 *NEXA SHOP*\n\n` +
    `🪙 Coin: *${formatNumber(user.coin)}*\n` +
    `🎟 Limit: *${isOwner ? '∞' : user.limit}*\n` +
    `⭐ Status: *${premiumStatus}*\n\n` +

    `*1.* +5 Limit\n` +
    `   🪙 100 Coin\n\n` +

    `*2.* +10 Limit\n` +
    `   🪙 180 Coin\n\n` +

    `*3.* +25 Limit\n` +
    `   🪙 400 Coin\n\n` +

    `*4.* +50 Limit\n` +
    `   🪙 700 Coin\n\n` +

    `*5.* Premium 15 Hari\n` +
    `   🪙 25.000 Coin\n\n` +

    `*6.* Premium 30 Hari\n` +
    `   🪙 45.000 Coin\n\n` +

    `💬 Reply pesan ini dengan nomor *1–6*\n` +
    `⏳ Shop berlaku selama *2 menit*`

  const sent =
    await sock.sendMessage(
      jid,
      {
        text
      },
      {
        quoted: msg
      }
    )

  const shopMessageId =
    sent?.key?.id

  if (!shopMessageId) {
    throw new Error(
      'SHOP_MESSAGE_ID_NOT_FOUND'
    )
  }

  sessions.set(
    sessionKey(userJid),
    {
      shopMessageId,

      isOwner:
        Boolean(isOwner),

      expiresAt:
        Date.now() +
        SESSION_TIME
    }
  )

  return sent
}
