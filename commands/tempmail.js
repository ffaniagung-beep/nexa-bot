// NEXA TEMPMAIL TOOLS V1
// Backend flow adapted from the source shared by the user.
// Token stays in process memory and is never printed to chat/logs.

import {
  getProfileJid
} from '../lib/profile.js'

const BASE_URL =
  'https://tempmail-backend.hasnaintariq142.workers.dev'

const CREATE_INBOX_URL =
  `${BASE_URL}/api/create-inbox`

const CHECK_INBOX_URL =
  `${BASE_URL}/api/inbox`

const SESSION_TTL =
  30 * 60 * 1000

const CREATE_COOLDOWN =
  60 * 1000

const REQUEST_TIMEOUT =
  15 * 1000

const MAX_LIST_MESSAGES =
  10

const MAX_BODY_CHARS =
  3500

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10; K) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/139.0.0.0 Mobile Safari/537.36',

  Referer:
    'https://tempmail.chat/',

  Origin:
    'https://tempmail.chat',

  'Content-Type':
    'application/json',

  Accept:
    'application/json, text/plain, */*'
}

const sessions =
  new Map()

const createCooldowns =
  new Map()

const cleanupTimer =
  setInterval(
    () => {
      const now =
        Date.now()

      for (
        const [key, session]
        of sessions
      ) {
        if (
          now -
          session.createdAt >=
          SESSION_TTL
        ) {
          sessions.delete(
            key
          )
        }
      }

      for (
        const [key, at]
        of createCooldowns
      ) {
        if (
          now - at >=
          CREATE_COOLDOWN
        ) {
          createCooldowns.delete(
            key
          )
        }
      }
    },
    5 * 60 * 1000
  )

cleanupTimer.unref?.()

function prefixOf(
  config
) {
  return (
    config?.prefix ||
    '.'
  )
}

function sessionKey(
  msg,
  jid
) {
  return (
    getProfileJid(
      msg,
      jid
    ) ||
    String(jid || '')
  )
}

function getActiveSession(
  key
) {
  const session =
    sessions.get(
      key
    )

  if (!session) {
    return null
  }

  if (
    Date.now() -
    session.createdAt >=
    SESSION_TTL
  ) {
    sessions.delete(
      key
    )

    return null
  }

  return session
}

function formatRemaining(
  createdAt
) {
  const left =
    Math.max(
      0,
      SESSION_TTL -
      (
        Date.now() -
        createdAt
      )
    )

  const minutes =
    Math.ceil(
      left /
      60000
    )

  return (
    `${minutes} menit`
  )
}

async function fetchJson(
  url,
  options = {}
) {
  const controller =
    new AbortController()

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT
    )

  timer.unref?.()

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          headers: {
            ...HEADERS,
            ...(
              options.headers ||
              {}
            )
          },

          signal:
            controller.signal,

          redirect:
            'follow'
        }
      )

    const raw =
      await response.text()

    let data

    try {
      data =
        raw
          ? JSON.parse(raw)
          : {}
    } catch {
      throw new Error(
        `RESPON_BUKAN_JSON_${response.status}`
      )
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        `HTTP_${response.status}`

      throw new Error(
        String(message)
      )
    }

    return data
  } catch (err) {
    if (
      err?.name ===
      'AbortError'
    ) {
      throw new Error(
        'REQUEST_TIMEOUT'
      )
    }

    throw err
  } finally {
    clearTimeout(
      timer
    )
  }
}

async function createInbox() {
  const data =
    await fetchJson(
      CREATE_INBOX_URL,
      {
        method:
          'POST'
      }
    )

  const email =
    String(
      data?.email ||
      ''
    ).trim()

  const token =
    String(
      data?.access_token ||
      data?.token ||
      ''
    ).trim()

  if (
    !data?.success ||
    !email ||
    !token
  ) {
    throw new Error(
      'CREATE_INBOX_INVALID_RESPONSE'
    )
  }

  return {
    email,
    token
  }
}

async function fetchInbox(
  token
) {
  const url =
    new URL(
      CHECK_INBOX_URL
    )

  url.searchParams.set(
    'token',
    token
  )

  const data =
    await fetchJson(
      url.toString(),
      {
        method:
          'GET'
      }
    )

  if (
    data?.success ===
    false
  ) {
    throw new Error(
      String(
        data?.error ||
        data?.message ||
        'INBOX_FAILED'
      )
    )
  }

  return Array.isArray(
    data?.messages
  )
    ? data.messages
    : []
}

function decodeEntities(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /&nbsp;/gi,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&lt;/gi,
      '<'
    )
    .replace(
      /&gt;/gi,
      '>'
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;|&apos;/gi,
      "'"
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, hex) => {
        const code =
          Number.parseInt(
            hex,
            16
          )

        return Number.isFinite(
          code
        )
          ? String.fromCodePoint(
              code
            )
          : ''
      }
    )
    .replace(
      /&#([0-9]+);/g,
      (_, dec) => {
        const code =
          Number.parseInt(
            dec,
            10
          )

        return Number.isFinite(
          code
        )
          ? String.fromCodePoint(
              code
            )
          : ''
      }
    )
}

function stripTags(
  value
) {
  return decodeEntities(
    String(
      value ||
      ''
    )
      .replace(
        /<[^>]*>/g,
        ' '
      )
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}

function cleanHtmlWithLinks(
  htmlString
) {
  if (!htmlString) {
    return {
      text: '',
      links: []
    }
  }

  const links = []

  let html =
    String(
      htmlString
    )

  html =
    html.replace(
      /<(script|style|meta|link|img)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi,
      ''
    )

  html =
    html.replace(
      /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
      (
        full,
        attrs,
        body
      ) => {
        const hrefMatch =
          String(
            attrs ||
            ''
          ).match(
            /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
          )

        const url =
          String(
            hrefMatch?.[1] ||
            hrefMatch?.[2] ||
            hrefMatch?.[3] ||
            ''
          ).trim()

        const label =
          stripTags(
            body
          ) ||
          'Link'

        if (
          /^https?:\/\//i.test(
            url
          )
        ) {
          if (
            !links.some(
              item =>
                item.url ===
                url
            )
          ) {
            links.push({
              text:
                label,

              url
            })
          }

          return (
            `\n🔗 ${label}\n${url}\n`
          )
        }

        return (
          ` ${label} `
        )
      }
    )

  html =
    html
      .replace(
        /<br\s*\/?>/gi,
        '\n'
      )
      .replace(
        /<\/(p|div|li|tr|h[1-6]|section|article)>/gi,
        '\n'
      )
      .replace(
        /<li\b[^>]*>/gi,
        '\n• '
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )

  const text =
    decodeEntities(
      html
    )
      .replace(
        /\r/g,
        ''
      )
      .replace(
        /[ \t]+\n/g,
        '\n'
      )
      .replace(
        /\n[ \t]+/g,
        '\n'
      )
      .replace(
        /\n{3,}/g,
        '\n\n'
      )
      .replace(
        /[ \t]{2,}/g,
        ' '
      )
      .trim()

  return {
    text,
    links
  }
}

function normalizeMessage(
  msg
) {
  const sender =
    String(
      msg?.sender_name ||
      msg?.sender ||
      msg?.from ||
      'Unknown'
    ).trim()

  const subject =
    String(
      msg?.subject ||
      '(Tanpa subjek)'
    ).trim()

  const receivedAt =
    String(
      msg?.received_at ||
      msg?.date ||
      '-'
    ).trim()

  const rawBody =
    msg?.html_body ||
    msg?.body_html ||
    msg?.body ||
    msg?.text ||
    msg?.raw_text ||
    ''

  const cleaned =
    cleanHtmlWithLinks(
      rawBody
    )

  return {
    sender,
    subject,
    receivedAt,
    text:
      cleaned.text,

    links:
      cleaned.links
  }
}

function clampText(
  value,
  max =
    MAX_BODY_CHARS
) {
  const text =
    String(
      value ||
      ''
    )

  if (
    text.length <=
    max
  ) {
    return text
  }

  return (
    text.slice(
      0,
      max
    ) +
    '\n\n…[dipotong]'
  )
}

function helpText(
  prefix,
  session = null
) {
  const active =
    session
      ? (
          `\n\n📮 Inbox aktif:\n` +
          `${session.email}\n` +
          `⏳ Session lokal: ${formatRemaining(session.createdAt)}`
        )
      : ''

  return (
    `✦ *NEXA • TEMPMAIL*\n\n` +
    `${prefix}tempmail\n` +
    `↳ Buat inbox sementara.\n\n` +
    `${prefix}tempmail inbox\n` +
    `↳ Cek daftar email masuk.\n\n` +
    `${prefix}tempmail read <nomor>\n` +
    `↳ Baca isi email.\n\n` +
    `${prefix}tempmail email\n` +
    `↳ Lihat alamat inbox aktif.\n\n` +
    `${prefix}tempmail new\n` +
    `↳ Ganti dengan inbox baru.\n\n` +
    `${prefix}tempmail close\n` +
    `↳ Hapus session lokal.\n\n` +
    `🔐 Token inbox tidak ditampilkan dan tidak disimpan ke disk.` +
    active
  )
}

function friendlyError(
  err
) {
  const message =
    String(
      err?.message ||
      err ||
      ''
    )

  if (
    message ===
    'REQUEST_TIMEOUT'
  ) {
    return (
      'Server TempMail terlalu lama merespons.'
    )
  }

  if (
    message ===
    'CREATE_INBOX_INVALID_RESPONSE'
  ) {
    return (
      'Format respons create inbox berubah.'
    )
  }

  if (
    message.startsWith(
      'RESPON_BUKAN_JSON_'
    )
  ) {
    return (
      'Backend TempMail mengirim respons yang tidak dikenali.'
    )
  }

  return (
    message ||
    'Terjadi error pada layanan TempMail.'
  )
}

async function sendText(
  sock,
  jid,
  msg,
  text
) {
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

async function createForUser({
  sock,
  msg,
  jid,
  key,
  prefix,
  force = false
}) {
  const existing =
    getActiveSession(
      key
    )

  if (
    existing &&
    !force
  ) {
    return sendText(
      sock,
      jid,
      msg,
      helpText(
        prefix,
        existing
      )
    )
  }

  const lastCreate =
    createCooldowns.get(
      key
    ) ||
    0

  const elapsed =
    Date.now() -
    lastCreate

  if (
    lastCreate &&
    elapsed <
    CREATE_COOLDOWN
  ) {
    const seconds =
      Math.ceil(
        (
          CREATE_COOLDOWN -
          elapsed
        ) /
        1000
      )

    return sendText(
      sock,
      jid,
      msg,
      `⏳ Tunggu *${seconds} detik* sebelum membuat inbox baru.`
    )
  }

  createCooldowns.set(
    key,
    Date.now()
  )

  try {
    const account =
      await createInbox()

    const session = {
      email:
        account.email,

      token:
        account.token,

      createdAt:
        Date.now()
    }

    sessions.set(
      key,
      session
    )

    return sendText(
      sock,
      jid,
      msg,
      `📮 *TEMPMAIL BERHASIL DIBUAT*\n\n` +
      `Email:\n${session.email}\n\n` +
      `⏳ Session lokal: *30 menit*\n` +
      `🔐 Token disimpan di RAM dan tidak ditampilkan.\n\n` +
      `Cek inbox:\n*${prefix}tempmail inbox*`
    )
  } catch (err) {
    return sendText(
      sock,
      jid,
      msg,
      `⚠️ Gagal membuat TempMail.\n${friendlyError(err)}`
    )
  }
}

export default {
  name:
    'tempmail',

  aliases: [
    'tm',
    'mailtemp'
  ],

  category:
    'TOOLS',

  description:
    'Membuat dan membaca inbox email sementara',

  usage:
    '.tempmail [inbox|read <nomor>|email|new|close]',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      prefixOf(
        config
      )

    if (
      String(jid || '')
        .endsWith(
          '@g.us'
        )
    ) {
      return sendText(
        sock,
        jid,
        msg,
        '🔐 TempMail hanya bisa dipakai di chat pribadi supaya alamat email dan isi inbox tidak bocor ke grup.'
      )
    }

    const key =
      sessionKey(
        msg,
        jid
      )

    if (!key) {
      return sendText(
        sock,
        jid,
        msg,
        '⚠️ Gagal menentukan identitas user untuk session TempMail.'
      )
    }

    const action =
      String(
        args?.[0] ||
        ''
      )
        .trim()
        .toLowerCase()

    if (
      !action
    ) {
      return createForUser({
        sock,
        msg,
        jid,
        key,
        prefix
      })
    }

    if (
      action ===
        'help' ||
      action ===
        'menu'
    ) {
      return sendText(
        sock,
        jid,
        msg,
        helpText(
          prefix,
          getActiveSession(
            key
          )
        )
      )
    }

    if (
      action ===
        'new' ||
      action ===
        'baru'
    ) {
      return createForUser({
        sock,
        msg,
        jid,
        key,
        prefix,
        force:
          true
      })
    }

    if (
      action ===
        'close' ||
      action ===
        'delete' ||
      action ===
        'hapus'
    ) {
      const existed =
        sessions.delete(
          key
        )

      return sendText(
        sock,
        jid,
        msg,
        existed
          ? '✅ Session TempMail lokal dihapus.'
          : 'ℹ️ Tidak ada session TempMail aktif.'
      )
    }

    const session =
      getActiveSession(
        key
      )

    if (!session) {
      return sendText(
        sock,
        jid,
        msg,
        `📭 Belum ada TempMail aktif.\nBuat dulu dengan *${prefix}tempmail*.`
      )
    }

    if (
      action ===
        'email' ||
      action ===
        'address' ||
      action ===
        'alamat'
    ) {
      return sendText(
        sock,
        jid,
        msg,
        `📮 *TEMPMAIL AKTIF*\n\n` +
        `${session.email}\n\n` +
        `⏳ Session lokal tersisa: *${formatRemaining(session.createdAt)}*`
      )
    }

    if (
      action ===
        'inbox' ||
      action ===
        'cek' ||
      action ===
        'check'
    ) {
      try {
        const messages =
          await fetchInbox(
            session.token
          )

        if (!messages.length) {
          return sendText(
            sock,
            jid,
            msg,
            `📭 *Inbox masih kosong.*\n\n` +
            `Email:\n${session.email}\n\n` +
            `Coba cek lagi beberapa saat lagi dengan *${prefix}tempmail inbox*.`
          )
        }

        const shown =
          messages.slice(
            0,
            MAX_LIST_MESSAGES
          )

        const lines =
          shown.map(
            (item, index) => {
              const normalized =
                normalizeMessage(
                  item
                )

              return (
                `*${index + 1}.* ${normalized.subject}\n` +
                `   Dari: ${normalized.sender}\n` +
                `   Waktu: ${normalized.receivedAt}`
              )
            }
          )

        return sendText(
          sock,
          jid,
          msg,
          `📬 *NEXA • TEMPMAIL INBOX*\n\n` +
          `${lines.join('\n\n')}\n\n` +
          `Baca pesan:\n*${prefix}tempmail read <nomor>*`
        )
      } catch (err) {
        return sendText(
          sock,
          jid,
          msg,
          `⚠️ Gagal mengecek inbox.\n${friendlyError(err)}`
        )
      }
    }

    if (
      action ===
        'read' ||
      action ===
        'baca'
    ) {
      const number =
        Number.parseInt(
          args?.[1],
          10
        )

      if (
        !Number.isInteger(
          number
        ) ||
        number < 1
      ) {
        return sendText(
          sock,
          jid,
          msg,
          `Contoh:\n*${prefix}tempmail read 1*`
        )
      }

      try {
        const messages =
          await fetchInbox(
            session.token
          )

        const rawMessage =
          messages[
            number - 1
          ]

        if (!rawMessage) {
          return sendText(
            sock,
            jid,
            msg,
            `❌ Pesan #${number} tidak ditemukan.\nCek daftar dengan *${prefix}tempmail inbox*.`
          )
        }

        const data =
          normalizeMessage(
            rawMessage
          )

        const body =
          clampText(
            data.text ||
            '(Isi pesan kosong)'
          )

        const uniqueLinks =
          data.links
            .slice(
              0,
              8
            )

        const linkText =
          uniqueLinks.length
            ? (
                `\n\n🔗 *LINK TERDETEKSI*\n` +
                uniqueLinks
                  .map(
                    (item, index) =>
                      `${index + 1}. ${item.url}`
                  )
                  .join(
                    '\n'
                  )
              )
            : ''

        return sendText(
          sock,
          jid,
          msg,
          `📧 *TEMPMAIL • PESAN #${number}*\n\n` +
          `Dari: ${data.sender}\n` +
          `Subjek: ${data.subject}\n` +
          `Waktu: ${data.receivedAt}\n\n` +
          `${body}` +
          linkText
        )
      } catch (err) {
        return sendText(
          sock,
          jid,
          msg,
          `⚠️ Gagal membaca inbox.\n${friendlyError(err)}`
        )
      }
    }

    return sendText(
      sock,
      jid,
      msg,
      helpText(
        prefix,
        session
      )
    )
  }
}
