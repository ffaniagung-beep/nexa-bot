import {
  getOwnerTarget
} from '../lib/ownerTools.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

import {
  attemptTheft
} from '../lib/rpg/crime.js'

function num(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

function duration(
  ms
) {
  const total =
    Math.max(
      1,
      Math.ceil(
        Number(ms) /
        1000
      )
    )

  const hours =
    Math.floor(
      total /
      3600
    )

  const minutes =
    Math.floor(
      (
        total %
        3600
      ) /
      60
    )

  const seconds =
    total %
    60

  if (hours) {
    return (
      `${hours}j ${minutes}m`
    )
  }

  if (minutes) {
    return (
      `${minutes}m ${seconds}d`
    )
  }

  return `${seconds} detik`
}

export default {
  name:
    'maling',

  aliases: [
    'curi'
  ],

  category:
    'RPG',

  groupOnly:
    true,

  description:
    'Aksi crime RPG terhadap Money target',

  usage:
    '.maling @user',

  async run({
    sock,
    msg,
    jid,
    config,
    isOwner
  }) {
    const target =
      getOwnerTarget(
        msg
      )

    if (!target) {
      return sock.sendMessage(
        jid,
        {
          text:
            `☠️ *MALING RPG*\n\n` +
            `Mention target:\n` +
            `*.maling @user*\n\n` +
            `Atau reply pesan target:\n` +
            `*.maling*`
        },
        {
          quoted:
            msg
        }
      )
    }

    const attackerJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      )

    const r =
      attemptTheft({
        attackerJid,
        targetJid:
          target,
        config,
        isOwner
      })

    if (
      r.reason ===
      'OWNER_PROTECTED'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭──「 🚨 AKSI DITOLAK 」\n` +
            `│\n` +
            `│ Target: @owner\n` +
            `│\n` +
            `│ 💀 Lu serius mau maling\n` +
            `│ pemilik dunia ini?\n` +
            `│\n` +
            `│ NEXA pura-pura gak lihat\n` +
            `│ demi keselamatan lu.\n` +
            `│\n` +
            `╰──────────────`
        },
        {
          quoted:
            msg
        }
      )
    }

    const errors = {
      SELF_TARGET:
        `😭 Lu mau maling dompet sendiri?\nNEXA bingung mau bantu siapa.`,

      TARGET_NOT_FOUND:
        '❌ Target tidak ditemukan di database NEXA.',

      TARGET_NO_RPG:
        '⚔️ Target belum punya profile RPG.',

      NO_ATTACKER_RPG:
        '⚔️ Profile RPG kamu belum tersedia.',

      LEVEL_LOW:
        `🔒 *.maling* terbuka mulai *RPG Lv.${r.requiredLevel || 3}*.`,

      WANTED_MAX:
        `🚨 Wanted kamu sudah *5/5*.\n\nBayar dulu dengan *.payfine*.`,

      TARGET_PROTECTED:
        `🔐 Dompet target terlalu aman untuk dicuri.\n\n` +
        `💵 ${num(r.protected || 500)} Money pertama dilindungi.`,

      GLOBAL_COOLDOWN:
        `⏳ Kamu masih cooldown crime.\n\n` +
        `Sisa: *${duration(r.cooldown)}*`,

      TARGET_COOLDOWN:
        `🛡️ Target itu baru saja kamu ganggu 😭\n\n` +
        `Coba lagi: *${duration(r.cooldown)}*`
    }

    if (!r.success) {
      return sock.sendMessage(
        jid,
        {
          text:
            errors[r.reason] ||
            '❌ Aksi maling gagal diproses.'
        },
        {
          quoted:
            msg
        }
      )
    }

    const mention =
      `@${String(
        target
      ).split('@')[0]}`

    if (
      r.outcome ===
      'SUCCESS'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `╭━━━━〔 🧤 *MALING BERHASIL* 〕━━━━╮\n` +
            `│\n` +
            `│ 🎯 Target: ${mention}\n` +
            `│\n` +
            `│ ${r.scenario}\n` +
            `│\n` +
            `│ 💵 Hasil: *+${num(r.amount)} Money*\n` +
            `│ 🚨 Wanted: *${r.wanted}/5*\n` +
            `│ 💼 Wallet: *${num(r.attackerMoney)}*\n` +
            `│\n` +
            `│ 🏦 Saldo Bank target tetap aman.\n` +
            `│\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`,

          mentions: [
            target
          ]
        },
        {
          quoted:
            msg
        }
      )
    }

    return sock.sendMessage(
      jid,
      {
        text:
          `╭━━━━〔 🚨 *MALING GAGAL* 〕━━━━╮\n` +
          `│\n` +
          `│ 🎯 Target: ${mention}\n` +
          `│\n` +
          `│ ${r.scenario}\n` +
          `│\n` +
          `│ 💸 Denda: *${num(r.fine)} Money*\n` +
          `│ 🚨 Wanted: *${r.wanted}/5*\n` +
          `│ 💼 Wallet: *${num(r.attackerMoney)}*\n` +
          `│\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`,

        mentions: [
          target
        ]
      },
      {
        quoted:
          msg
      }
    )
  }
}
