import fs from 'fs'
import path from 'path'

import {
  pathToFileURL
} from 'url'

import {
  getUser,
  isPremium
} from '../lib/userdb.js'

import {
  resolveProfileJid
} from '../lib/profile.js'

// =====================================
// PATH
// =====================================

const COMMANDS_DIR =
  path.resolve(
    './commands'
  )

const MENU_IMAGE =
  path.resolve(
    './media/menu.jpg'
  )

// =====================================
// CATEGORY
// =====================================

const CATEGORY_ORDER = [
  'GENERAL',
  'GROUP',
  'BOT',
  'GAME',
  'MINI GAME',
  'RPG',
  'FUN',
  'MAKER',
  'TOOLS',
  'AI',
  'MEDIA',
  'SEARCH',
  'DOWNLOADER',
  'PROFILE',
  'OWNER',
  'OTHER'
]

const CATEGORY_ICON = {
  GENERAL: '🌐',
  GROUP: '👥',
  BOT: '🤖',
  GAME: '🎮',
  'MINI GAME': '🕹️',
  RPG: '⚔️',
  FUN: '🎭',
  MAKER: '🎨',
  TOOLS: '🧰',
  AI: '🧠',
  MEDIA: '🎬',
  SEARCH: '🔎',
  DOWNLOADER: '📥',
  PROFILE: '👤',
  OWNER: '👑',
  OTHER: '📦'
}

const CATEGORY_ALIAS = {
  UMUM:
    'GENERAL',

  GRUP:
    'GROUP',

  MINIGAME:
    'MINI GAME',

  'MINI-GAME':
    'MINI GAME',

  'MINI_GAME':
    'MINI GAME',

  TOOL:
    'TOOLS',

  DOWNLOAD:
    'DOWNLOADER',

  DL:
    'DOWNLOADER',

  PROFIL:
    'PROFILE',

  LAIN:
    'OTHER',

  LAINNYA:
    'OTHER'
}

// =====================================
// UTILS
// =====================================

function cleanText(
  value
) {
  return String(
    value || ''
  )
    .trim()
}

function normalizeCategory(
  value
) {
  let text =
    cleanText(
      value
    )
      .replace(
        /\s+/g,
        ' '
      )
      .toUpperCase()

  return (
    CATEGORY_ALIAS[text] ||
    text
  )
}

function commandPrefix(
  prefix,
  name
) {
  return (
    `${prefix}${name}`
  )
}

function getSenderJid(
  msg
) {
  return (
    msg?.key?.participant ||
    msg?.participant ||
    msg?.key?.remoteJid ||
    ''
  )
}

function isRegisteredUser(
  user
) {
  return Boolean(
    user?.registeredAt
  )
}

function formatNumber(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}

// =====================================
// DYNAMIC COMMAND LOADER
// =====================================

async function loadCommands() {
  const result = []

  let files = []

  try {
    files =
      fs.readdirSync(
        COMMANDS_DIR
      )
        .filter(
          file =>
            file.endsWith(
              '.js'
            )
        )
  } catch (
    err
  ) {
    console.error(
      '📋 Menu scan:',
      err
    )

    return result
  }

  for (
    const file
    of files
  ) {
    try {
      const fullPath =
        path.join(
          COMMANDS_DIR,
          file
        )

      const url =
        pathToFileURL(
          fullPath
        ).href

      const imported =
        await import(
          `${url}?nexaMenu=${Date.now()}-${Math.random()}`
        )

      const command =
        imported.default

      if (
        !command ||
        !command.name ||
        command.hideFromMenu
      ) {
        continue
      }

      result.push(
        command
      )
    } catch (
      err
    ) {
      console.error(
        `📋 Menu load ${file}:`,
        err?.message ||
        err
      )
    }
  }

  return result
}

// =====================================
// COMMAND GROUPING
// =====================================

function sortCommands(
  commands
) {
  return [
    ...commands
  ].sort(
    (
      a,
      b
    ) =>
      cleanText(
        a.name
      ).localeCompare(
        cleanText(
          b.name
        ),
        'id'
      )
  )
}

function groupCommands(
  commands,
  owner
) {
  const groups = {}

  for (
    const command
    of commands
  ) {
    const category =
      normalizeCategory(
        command.category ||
        'OTHER'
      )

    // OWNER tetap ditampilkan untuk semua pengguna.
    // Hak akses eksekusi tetap dijaga oleh global permission gate
    // (command.ownerOnly), jadi visibility tidak mengubah permission.

    if (
      !groups[
        category
      ]
    ) {
      groups[
        category
      ] = []
    }

    if (
      command.menuHidden
    ) {
      continue
    }

    groups[
      category
    ].push(
      command
    )
  }

  for (
    const category
    of Object.keys(
      groups
    )
  ) {
    groups[
      category
    ] =
      sortCommands(
        groups[
          category
        ]
      )
  }

  return groups
}

function getAvailableCategories(
  groups
) {
  const known =
    CATEGORY_ORDER.filter(
      category =>
        groups[
          category
        ]?.length
    )

  const custom =
    Object.keys(
      groups
    )
      .filter(
        category =>
          !CATEGORY_ORDER.includes(
            category
          ) &&
          groups[
            category
          ]?.length
      )
      .sort(
        (
          a,
          b
        ) =>
          a.localeCompare(
            b,
            'id'
          )
      )

  return [
    ...known,
    ...custom
  ]
}

function countCommands(
  groups
) {
  return Object.values(
    groups
  ).reduce(
    (
      total,
      list
    ) =>
      total +
      list.length,
    0
  )
}

// =====================================
// FIND
// =====================================

function findCommand(
  commands,
  query
) {
  const target =
    cleanText(
      query
    )
      .replace(
        /^[.!/#]+/,
        ''
      )
      .toLowerCase()

  if (!target) {
    return null
  }

  return (
    commands.find(
      command => {
        const name =
          cleanText(
            command.name
          )
            .toLowerCase()

        if (
          name ===
          target
        ) {
          return true
        }

        const aliases =
          Array.isArray(
            command.aliases
          )
            ? command.aliases
            : []

        return aliases.some(
          alias =>
            cleanText(
              alias
            )
              .toLowerCase() ===
            target
        )
      }
    ) ||
    null
  )
}

function findCategory(
  groups,
  query
) {
  const target =
    normalizeCategory(
      query
    )

  if (
    groups[
      target
    ]?.length
  ) {
    return target
  }

  return null
}

// =====================================
// USER CONTEXT
// =====================================

async function getMenuUser({
  sock,
  msg,
  jid,
  owner
}) {
  const fallbackName =
    cleanText(
      msg?.pushName
    ) ||
    'NEXA User'

  let userJid =
    getSenderJid(
      msg
    )

  try {
    userJid =
      await resolveProfileJid(
        sock,
        msg,
        jid
      ) ||
      userJid
  } catch {}

  if (!userJid) {
    return {
      userJid: '',
      user: null,
      name: fallbackName,
      premium: false
    }
  }

  // Sekaligus membersihkan
  // Premium yang sudah expired.
  const premium =
    !owner &&
    isPremium(
      userJid
    )

  const user =
    getUser(
      userJid
    )

  return {
    userJid,
    user,
    premium,

    name:
      cleanText(
        user?.name
      ) ||
      fallbackName
  }
}

// =====================================
// HEADER
// =====================================

// NEXA menu visual language: compact masthead, short dividers, one command per line.
function menuText(value, max = 160) {
  return cleanText(value).replace(/[\r\n\t]+/g, ' ').replace(/[*_~`]/g, '').slice(0, max)
}
const MENU_LINE = '━━━━━━━━━━━━━━━━━━';
const CATEGORY_NOTE = {
  GENERAL: 'Mulai dari yang paling sederhana.',
  GROUP: 'Atur ruang obrolanmu.',
  BOT: 'Status dan pengaturan NEXA.',
  GAME: 'Tantangan kecil, serunya panjang.',
  'MINI GAME': 'Satu ronde lagi?',
  RPG: 'Bangun karakter. Lanjutkan petualangan.',
  FUN: 'Bikin obrolan lebih ramai.',
  MAKER: 'Ubah ide jadi gambar dan stiker.',
  AI: 'Tanya, diskusi, cari inspirasi.',
  DOWNLOADER: 'Simpan media yang kamu perlukan.',
  PROFILE: 'Kenalan dengan profilmu.',
  OWNER: 'Pusat pengaturan pemilik bot.',
  TOOLS: 'Bantuan kecil untuk kebutuhan harian.',
  MEDIA: 'Koleksi media dalam satu tempat.',
  SEARCH: 'Temukan yang sedang kamu cari.'
}
function menuTitle(botName, label) {
  return `✦ *${menuText(botName || 'NEXA-BOT', 40)}*\n${label}\n${MENU_LINE}`
}
function commandBadges(command) {
  return `${command.premiumOnly ? ' ⭐' : ''}${command.ownerOnly ? ' 👑' : ''}`
}
function menuFooter(prefix) {
  return `${MENU_LINE}\n⌂ *${prefix}menu*  ·  *${prefix}menu all*\n↳ Detail: *${prefix}help <command>*`
}
function menuLegend(commands) {
  const tags=[]
  if(commands.some(c=>c.premiumOnly)) tags.push('⭐ Premium')
  if(commands.some(c=>c.ownerOnly)) tags.push('👑 Owner')
  return tags.length ? '\n' + tags.join('  ·  ') : ''
}
function buildHeader({botName, name, user, premium, owner, total, categoryCount}) {
  const status=owner ? '👑 Owner' : premium ? '⭐ Premium' : '👤 Member'
  const limit=owner ? '∞' : formatNumber(user?.limit)
  return menuTitle(botName,'COMMAND CENTER') +
    `\n\nHalo, *${menuText(name, 45)}* 👋\nMau ngapain hari ini?\n\n` +
    `╭─ *PROFIL SINGKAT*\n` +
    `│ ${status}\n` +
    `│ 🎟 ${limit} limit  ·  🪙 ${formatNumber(user?.coin)} coin\n` +
    `╰─ ${total} command · ${categoryCount} kategori`
}
function buildMainMenu(context) {
  const {groups,prefix}=context
  const categories=getAvailableCategories(groups)
  const header=buildHeader({...context,total:countCommands(groups),categoryCount:categories.length})
  const list=categories.map(category=>
    `${CATEGORY_ICON[category] || '📦'} *${category}*  ·  ${groups[category].length}\n` +
    `   ↳ ${prefix}menu ${category.toLowerCase()}`
  ).join('\n\n')
  return `${header}\n\n*JELAJAHI NEXA*\nPilih kategori lewat command di bawah.\n\n${list}\n\n`+
    `${MENU_LINE}\n📚 Semua fitur: *${prefix}menu all*\n🔎 Cara pakai: *${prefix}help <command>*`
}
function buildCategoryMenu({groups,category,prefix,name,botName}) {
  const list=groups[category] || []
  const title=`${CATEGORY_ICON[category] || '📦'} ${category}`
  const intro=menuTitle(botName,title)+`\n\n*${CATEGORY_NOTE[category] || 'Pilih fitur yang kamu butuhkan.'}*\n`+
    `${list.length} command tersedia.\n\n`
  const render=command=>`✧ *${commandPrefix(prefix,command.name)}*${commandBadges(command)}`+
    (command.description ? `\n   ${menuText(command.description,180)}` : '')
  let body=''
  if(category==='RPG') {
    const sections=[
      ['KARAKTER',['rpg','class','stats']],
      ['PETUALANGAN',['adventure','region','battle','potion','rest']],
      ['PERLENGKAPAN',['inventory']],
      ['TOKO',['rpgshop']],
      ['BANK',['bank','bankdepo','bankwd']],
      ['AKSI & KONSEKUENSI',['maling','rampokbank','wanted','payfine']]
    ]
    const used=new Set()
    const blocks=[]
    for(const [label,names] of sections) {
      const selected=names.map(n=>list.find(c=>c.name===n)).filter(Boolean)
      if(!selected.length)continue
      selected.forEach(c=>used.add(c.name))
      blocks.push(`▸ *${label}*\n\n${selected.map(render).join('\n\n')}`)
    }
    const others=list.filter(c=>!used.has(c.name))
    if(others.length)blocks.push(`▸ *LAINNYA*\n\n${others.map(render).join('\n\n')}`)
    body=blocks.join('\n\n')
  }else body=list.map(render).join('\n\n')
  return `${intro}${body}${menuLegend(list)}\n\n${menuFooter(prefix)}`
}
function buildAllMenu(context) {
  const {groups,prefix}=context
  const categories=getAvailableCategories(groups)
  const header=buildHeader({...context,total:countCommands(groups),categoryCount:categories.length})
  const sections=categories.map(category=>{
    const list=groups[category]
    return `╭─ ${CATEGORY_ICON[category] || '📦'} *${category}* · ${list.length}\n`+
      list.map(c=>`│ ${commandPrefix(prefix,c.name)}${commandBadges(c)}`).join('\n')+
      '\n╰────────────'
  })
  return `${header}\n\n*DIREKTORI COMMAND*\nSemua fitur, satu tempat.\n\n`+
    sections.join('\n\n')+menuLegend(Object.values(groups).flat())+`\n\n${menuFooter(prefix)}`
}
function usageWithPrefix(command,prefix) {
  const raw=cleanText(command.usage)
  if(!raw)return `${prefix}${command.name}`
  const names=[command.name,...(Array.isArray(command.aliases)?command.aliases:[])].map(String)
  return raw.split('\n').map(line=>{
    // Only replace a command token; argument punctuation/URLs stay unchanged.
    const trimmed=line.trim()
    const m=trimmed.match(/^(\S+)([\s\S]*)$/)
    if(!m)return trimmed
    for(const name of names) {
      if(m[1]===name || (m[1].endsWith(name) && /^[^\p{L}\p{N}\s]+$/u.test(m[1].slice(0,-name.length)))) {
        return `${prefix}${name}${m[2]}`
      }
    }
    return trimmed
  }).join('\n')
}
function buildHelp(command,prefix,botName) {
  const category=normalizeCategory(command.category || 'OTHER')
  const access=[command.ownerOnly ? 'Owner' : command.premiumOnly ? 'Premium' : 'Semua pengguna']
  if(command.groupOnly)access.push('Dalam grup')
  if(command.adminOnly)access.push('Pengirim admin')
  if(command.botAdmin)access.push('Bot harus admin')
  const aliases=Array.isArray(command.aliases) && command.aliases.length
    ? command.aliases.map(a=>`${prefix}${a}`).join(' · ') : 'Tidak ada'
  return menuTitle(botName,'PANDUAN COMMAND')+
    `\n\n⚡ *${prefix}${command.name}*\n${menuText(command.description,350) || 'Panduan penggunaan command.'}\n\n`+
    `▸ *CARA PAKAI*\n${usageWithPrefix(command,prefix)}\n\n`+
    `▸ *DETAIL*\n${CATEGORY_ICON[category] || '📦'} Kategori: ${category}\n`+
    `🔁 Alias: ${aliases}\n🔐 Akses: ${access.join(' · ')}\n\n`+
    `${MENU_LINE}\n↳ *${prefix}menu ${category.toLowerCase()}*\n⌂ *${prefix}menu*`
}

// =====================================
// SEND
// =====================================

async function sendMenu({
  sock,
  msg,
  jid,
  text,
  useImage = false
}) {
  // Untuk menu sangat panjang (.menu all), kirim banner sebagai
  // pesan terpisah supaya daftar command tidak kepotong caption media.
  if (
    useImage &&
    fs.existsSync(
      MENU_IMAGE
    ) &&
    text.length > 3000
  ) {
    try {
      await sock.sendMessage(
        jid,
        {
          image:
            fs.readFileSync(
              MENU_IMAGE
            ),

          caption:
            '✦ *NEXA-BOT*\nCOMMAND DIRECTORY'
        },
        {
          quoted:
            msg
        }
      )
    } catch (err) {
      console.error(
        '📋 Menu long banner:',
        err?.message ||
        err
      )
    }
  }
  if (
    useImage &&
    fs.existsSync(
      MENU_IMAGE
    )
  ) {
    const image =
      fs.readFileSync(
        MENU_IMAGE
      )

    // Menu pendek:
    // gambar + caption jadi satu pesan.
    if (
      text.length <= 3000
    ) {
      try {
        return await sock.sendMessage(
          jid,
          {
            image,
            caption:
              text
          },
          {
            quoted:
              msg
          }
        )
      } catch (
        err
      ) {
        console.error(
          '📋 Menu image fallback:',
          err?.message ||
          err
        )
      }
    } else {
      // Menu panjang:
      // banner tetap muncul,
      // teks dikirim setelahnya.
      try {
        await sock.sendMessage(
          jid,
          {
            image
          },
          {
            quoted:
              msg
          }
        )

        return sock.sendMessage(
          jid,
          {
            text
          },
          {
            quoted:
              msg
          }
        )
      } catch (
        err
      ) {
        console.error(
          '📋 Menu long image fallback:',
          err?.message ||
          err
        )
      }
    }
  }

  return sock.sendMessage(
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

// =====================================
// COMMAND
// =====================================

export default {
  name:
    'menu',

  aliases: [
    'help',
    'commands'
  ],

  category:
    'GENERAL',

  description:
    'Menampilkan menu NEXA-BOT',

  usage:
    '.menu [kategori/all/command]',

  async run({
    sock,
    msg,
    jid,
    args,
    config,
    isOwner
  }) {
    const prefix =
      config?.prefix ||
      '.'

    const botName = config?.botName || 'NEXA-BOT'

    const owner =
      Boolean(
        isOwner ||
        msg?.key?.fromMe
      )

    const sender =
      getSenderJid(
        msg
      )

    // =================================
    // REGISTER GATE
    // =================================

    if (
      !owner &&
      sender
    ) {
      try {
        const userJid =
          await resolveProfileJid(
            sock,
            msg,
            jid
          ) ||
          sender

        const user =
          getUser(
            userJid
          )

        if (
          !isRegisteredUser(
            user
          )
        ) {
          return sock.sendMessage(
            jid,
            {
              text:
                menuTitle(botName, 'MULAI DI SINI') +
                `\n\n👋 Daftar dulu untuk membuka fitur ${menuText(botName,40)}.\n\n` +
                `Gunakan: *${prefix}register nama.umur*`
            },
            {
              quoted:
                msg
            }
          )
        }
      } catch (
        err
      ) {
        console.error(
          '📋 Menu register check:',
          err?.message ||
          err
        )
      }
    }

    // =================================
    // LOAD + GROUP
    // =================================

    const commands =
      await loadCommands()

    const groups =
      groupCommands(
        commands,
        owner
      )

    const context =
      await getMenuUser({
        sock,
        msg,
        jid,
        owner
      })

    const query =
      cleanText(
        args?.join(' ')
      )

    // =================================
    // .menu
    // =================================

    if (!query) {
      const text =
        buildMainMenu({
          botName,
          groups,
          prefix,
          name:
            context.name,
          user:
            context.user,
          premium:
            context.premium,
          owner
        })

      return sendMenu({
        sock,
        msg,
        jid,
        text,
        useImage:
          true
      })
    }

    // =================================
    // .menu all
    // =================================

    if (
      query.toLowerCase() ===
      'all'
    ) {
      const text =
        buildAllMenu({
          botName,
          groups,
          prefix,
          name:
            context.name,
          user:
            context.user,
          premium:
            context.premium,
          owner
        })

      return sendMenu({
        sock,
        msg,
        jid,
        text,
        useImage:
          true
      })
    }

    // =================================
    // CATEGORY FIRST
    //
    // FIX:
    // .menu fun
    // .menu mini game
    // =================================

    const category =
      findCategory(
        groups,
        query
      )

    if (category) {
      const text =
        buildCategoryMenu({
          botName,
          groups,
          category,
          prefix,
          name:
            context.name
        })

      return sendMenu({
        sock,
        msg,
        jid,
        text,
        useImage:
          true
      })
    }

    // =================================
    // COMMAND DETAIL
    // =================================

    const command =
      findCommand(
        commands,
        query
      )

    if (command) {
      const commandCategory =
        normalizeCategory(
          command.category ||
          'OTHER'
        )

      // Detail command Owner boleh dilihat semua pengguna.
      // Menjalankan command-nya tetap membutuhkan Owner.

      return sendMenu({
        sock,
        msg,
        jid,
        text:
          buildHelp(
            command,
            prefix,
            botName
          ),
        useImage:
          true
      })
    }

    // =================================
    // NOT FOUND
    // =================================

    const available =
      getAvailableCategories(
        groups
      )
        .map(
          item =>
            item.toLowerCase()
        )
        .join(
          ', '
        )

    return sock.sendMessage(
      jid,
      {
        text:
          menuTitle(botName, 'PENCARIAN MENU') +
          `\n\nBelum menemukan *${menuText(query,80)}*.\n\n` +

          `📚 Kategori tersedia:\n` +
          `${available}\n\n` +

          `Coba:\n` +
          `*${prefix}menu fun*\n` +
          `*${prefix}menu all*`
      },
      {
        quoted:
          msg
      }
    )
  }
}
