import {
  Button
} from '@rexxhayanasi/elaina-baileys'

import {
  getRpgProfile,
  RPG_CLASSES
} from './core.js'

function clean(
  value,
  max = 1800
) {
  return String(
    value ?? ''
  )
    .replace(/\r/g, '')
    .trim()
    .slice(0, max)
}

export function rpgPrefix(
  config
) {
  return (
    config?.prefix ||
    '.'
  )
}

export function rpgCommand(
  config,
  name,
  args = ''
) {
  const prefix =
    rpgPrefix(config)

  const suffix =
    String(args || '')
      .trim()

  return (
    `${prefix}${name}` +
    (
      suffix
        ? ` ${suffix}`
        : ''
    )
  )
}

export function rpgBar(
  current,
  max,
  size = 10
) {
  const safeMax =
    Math.max(
      1,
      Number(max) || 1
    )

  const ratio =
    Math.max(
      0,
      Math.min(
        1,
        (Number(current) || 0) /
          safeMax
      )
    )

  const filled =
    Math.round(
      ratio * size
    )

  return (
    '█'.repeat(filled) +
    '░'.repeat(
      size - filled
    )
  )
}

export async function sendRpgQuickPanel({
  sock,
  msg,
  jid,
  title,
  body,
  footer = 'NEXA • RPG UX V2',
  actions = [],
  fallbackText = null,
  mentions = []
}) {
  const safeTitle =
    clean(
      title,
      120
    )

  const safeBody =
    clean(
      body,
      1800
    )

  const validActions =
    (Array.isArray(actions)
      ? actions
      : []
    )
      .filter(
        item =>
          item &&
          item.text &&
          item.id
      )
      .slice(0, 10)

  if (
    validActions.length &&
    !mentions.length
  ) {
    try {
      let panel =
        new Button(sock)
          .setTitle(
            safeTitle
          )
          .setBody(
            safeBody
          )
          .setFooter(
            clean(
              footer,
              120
            )
          )

      for (
        const action
        of validActions
      ) {
        panel =
          panel.addReply(
            clean(
              action.text,
              40
            ),
            String(
              action.id
            )
          )
      }

      return await panel.send(
        jid
      )
    } catch (error) {
      console.warn(
        '[RPG UX V2] button fallback:',
        error?.message ||
        error
      )
    }
  }

  const text =
    fallbackText ||
    `✦ *${safeTitle}*\n\n${safeBody}`

  return sock.sendMessage(
    jid,
    {
      text,
      ...(
        mentions.length
          ? { mentions }
          : {}
      )
    },
    {
      quoted:
        msg
    }
  )
}

export async function sendRpgHub({
  sock,
  msg,
  jid,
  userJid,
  config
}) {
  const p =
    getRpgProfile(
      userJid
    )

  if (!p) {
    return sock.sendMessage(
      jid,
      {
        text:
          '⚔️ Profile RPG belum tersedia.'
      },
      {
        quoted: msg
      }
    )
  }

  const c =
    p.class
      ? RPG_CLASSES[p.class]
      : null

  const hpBar =
    rpgBar(
      p.hp,
      p.maxHp
    )

  const manaBar =
    rpgBar(
      p.mana,
      p.maxMana
    )

  const body =
    `${c?.icon || '🧬'} *${c?.name || 'Belum pilih class'}* • Lv.${p.level}\n` +
    `❤️ ${hpBar} ${p.hp}/${p.maxHp}\n` +
    `🔷 ${manaBar} ${p.mana}/${p.maxMana}\n\n` +
    `💵 Wallet: *${Number(p.money || 0).toLocaleString('id-ID')}*\n` +
    `🏦 Bank: *${Number(p.bankMoney || 0).toLocaleString('id-ID')}*\n` +
    `🚨 Wanted: *${p.wanted || 0}/5*\n\n` +
    `Pilih panel RPG di bawah.`

  return sendRpgQuickPanel({
    sock,
    msg,
    jid,
    title:
      '⚔️ NEXA • RPG HUB',
    body,
    actions: [
      {
        text: '👤 Profile',
        id: rpgCommand(
          config,
          'rpg'
        )
      },
      {
        text: '📊 Stats',
        id: rpgCommand(
          config,
          'stats'
        )
      },
      {
        text: '🌲 Adventure',
        id: rpgCommand(
          config,
          'adventure'
        )
      },
      {
        text: '🎒 Inventory',
        id: rpgCommand(
          config,
          'inventory'
        )
      },
      {
        text: '🛒 Store',
        id: rpgCommand(
          config,
          'rpgshop'
        )
      },
      {
        text: '🏦 Bank',
        id: rpgCommand(
          config,
          'bank'
        )
      },
      {
        text: '🗺️ Region',
        id: rpgCommand(
          config,
          'region'
        )
      },
      {
        text: '🚨 Wanted',
        id: rpgCommand(
          config,
          'wanted'
        )
      }
    ],
    fallbackText:
      `✦ *NEXA • RPG HUB*\n\n${body}\n\n` +
      `⌂ *${rpgCommand(config, 'rpg')}*  ·  ` +
      `🎒 *${rpgCommand(config, 'inventory')}*  ·  ` +
      `🛒 *${rpgCommand(config, 'rpgshop')}*`
  })
}
