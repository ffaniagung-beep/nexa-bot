// NEXA HD VIDEO V1
// Interactive WhatsApp settings + direct multipart upload.
import {
  Button
} from '@rexxhayanasi/elaina-baileys'

import {
  randomBytes
} from 'node:crypto'

import {
  getMediaSource
} from '../lib/maker-media.js'

import {
  getProfileJid
} from '../lib/profile.js'

import {
  downloadHdvidInput,
  enhanceHdVideo,
  hdvidErrorText
} from '../lib/hdvid-api.js'

const SESSION_TTL =
  10 * 60 * 1000

const sessions =
  new Map()

const byOwner =
  new Map()

function clean(value) {
  return String(
    value || ''
  )
    .trim()
}

function cleanKey(value) {
  return clean(value)
    .toLowerCase()
}

function ownerKey(
  msg,
  jid
) {
  return cleanKey(
    getProfileJid(
      msg,
      jid
    ) ||
    msg?.key
      ?.participantAlt ||
    msg?.key
      ?.participant ||
    msg?.participant ||
    jid
  )
}

function prettyBytes(
  bytes
) {
  const value =
    Number(bytes) || 0

  if (
    value >=
    1024 * 1024
  ) {
    return (
      `${(
        value /
        1024 /
        1024
      ).toFixed(2)} MB`
    )
  }

  return (
    `${Math.max(
      1,
      Math.round(
        value /
        1024
      )
    )} KB`
  )
}

function yesNo(value) {
  return value
    ? 'ON'
    : 'OFF'
}

function defaultSettings() {
  return {
    fps:
      30,

    resolution:
      '1080p',

    quality:
      90,

    enhance:
      true,

    denoise:
      false,

    stabilize:
      false,

    format:
      'mp4'
  }
}

function bodyText(
  session
) {
  const s =
    session.settings

  return (
    `📐 Resolusi : *${s.resolution}*\n` +
    `🎞 FPS       : *${s.fps}*\n` +
    `💎 Quality   : *${s.quality}*\n` +
    `✨ Enhance   : *${yesNo(s.enhance)}*\n` +
    `🧹 Denoise   : *${yesNo(s.denoise)}*\n` +
    `📹 Stabilize : *${yesNo(s.stabilize)}*\n` +
    `📦 Format    : *MP4*\n\n` +
    `Video sudah disimpan sementara di sesi ini.\n` +
    `Pilih *PROSES* kalau setting-nya sudah pas.`
  )
}

function commandId(
  prefix,
  parts
) {
  return (
    `${prefix}hdvid ` +
    parts
      .map(clean)
      .filter(Boolean)
      .join(' ')
  )
}

async function removeSession(
  token
) {
  const id =
    clean(token)

  const session =
    sessions.get(id)

  if (!session) {
    return false
  }

  sessions.delete(id)

  if (
    byOwner.get(
      session.owner
    ) === id
  ) {
    byOwner.delete(
      session.owner
    )
  }

  clearTimeout(
    session.timer
  )

  return true
}

function createSession({
  owner,
  jid,
  source,
  prefix
}) {
  const previous =
    byOwner.get(
      owner
    )

  if (previous) {
    void removeSession(
      previous
    )
  }

  let token

  do {
    token =
      randomBytes(7)
        .toString('hex')
  } while (
    sessions.has(
      token
    )
  )

  const session = {
    token,

    owner,

    jid:
      cleanKey(jid),

    source,

    prefix,

    settings:
      defaultSettings(),

    processing:
      false,

    createdAt:
      Date.now(),

    timer:
      null
  }

  session.timer =
    setTimeout(
      () => {
        void removeSession(
          token
        )
      },
      SESSION_TTL
    )

  session.timer
    .unref?.()

  sessions.set(
    token,
    session
  )

  byOwner.set(
    owner,
    token
  )

  return session
}

function resolveSession({
  token,
  msg,
  jid
}) {
  const session =
    sessions.get(
      clean(token)
    )

  if (!session) {
    return {
      ok:
        false,

      reason:
        'EXPIRED'
    }
  }

  if (
    session.owner !==
      ownerKey(
        msg,
        jid
      ) ||
    session.jid !==
      cleanKey(jid)
  ) {
    return {
      ok:
        false,

      reason:
        'OWNER'
    }
  }

  return {
    ok:
      true,

    session
  }
}

async function sendMainPanel({
  sock,
  jid,
  session
}) {
  const panel =
    new Button(sock)
      .setTitle(
        '🎬 NEXA • HD VIDEO'
      )
      .setBody(
        bodyText(
          session
        )
      )
      .setFooter(
        'Direct upload • Zyvor TOHD'
      )
      .addReply(
        '⚙️ EDIT SETTING',
        commandId(
          session.prefix,
          [
            '__edit',
            session.token
          ]
        )
      )
      .addReply(
        '✨ PROSES',
        commandId(
          session.prefix,
          [
            '__process',
            session.token
          ]
        )
      )
      .addReply(
        '❌ BATAL',
        commandId(
          session.prefix,
          [
            '__cancel',
            session.token
          ]
        )
      )

  return panel.send(
    jid
  )
}

async function sendEditPanel({
  sock,
  jid,
  session
}) {
  const s =
    session.settings

  const panel =
    new Button(sock)
      .setTitle(
        '⚙️ HD VIDEO • SETTING'
      )
      .setBody(
        `Pilih setting yang mau diubah.\n\n` +
        bodyText(
          session
        )
      )
      .setFooter(
        'NEXA • HD Video'
      )
      .addReply(
        `📐 Resolusi ${s.resolution}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'resolution'
          ]
        )
      )
      .addReply(
        `🎞 FPS ${s.fps}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'fps'
          ]
        )
      )
      .addReply(
        `💎 Quality ${s.quality}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'quality'
          ]
        )
      )
      .addReply(
        `✨ Enhance ${yesNo(s.enhance)}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'enhance'
          ]
        )
      )
      .addReply(
        `🧹 Denoise ${yesNo(s.denoise)}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'denoise'
          ]
        )
      )
      .addReply(
        `📹 Stabilize ${yesNo(s.stabilize)}`,
        commandId(
          session.prefix,
          [
            '__menu',
            session.token,
            'stabilize'
          ]
        )
      )
      .addReply(
        '⬅️ KEMBALI',
        commandId(
          session.prefix,
          [
            '__back',
            session.token
          ]
        )
      )

  return panel.send(
    jid
  )
}

async function sendChoicePanel({
  sock,
  jid,
  session,
  setting
}) {
  let title = ''
  let options = []

  if (
    setting ===
    'resolution'
  ) {
    title =
      '📐 PILIH RESOLUSI'

    options = [
      ['720p', '720p'],
      ['1080p', '1080p'],
      ['1440p', '1440p'],
      ['2160p', '2160p']
    ]
  } else if (
    setting ===
    'fps'
  ) {
    title =
      '🎞 PILIH FPS'

    options = [
      ['24 FPS', '24'],
      ['30 FPS', '30'],
      ['60 FPS', '60']
    ]
  } else if (
    setting ===
    'quality'
  ) {
    title =
      '💎 PILIH QUALITY'

    options = [
      ['70', '70'],
      ['80', '80'],
      ['90', '90'],
      ['100', '100']
    ]
  } else if (
    [
      'enhance',
      'denoise',
      'stabilize'
    ].includes(
      setting
    )
  ) {
    title =
      `⚙️ ${setting.toUpperCase()}`

    options = [
      ['✅ ON', 'yes'],
      ['❌ OFF', 'no']
    ]
  } else {
    return sendEditPanel({
      sock,
      jid,
      session
    })
  }

  let panel =
    new Button(sock)
      .setTitle(
        title
      )
      .setBody(
        'Pilih satu opsi.'
      )
      .setFooter(
        'NEXA • HD Video'
      )

  for (
    const [
      label,
      value
    ]
    of options
  ) {
    panel =
      panel.addReply(
        label,
        commandId(
          session.prefix,
          [
            '__set',
            session.token,
            setting,
            value
          ]
        )
      )
  }

  panel =
    panel.addReply(
      '⬅️ KEMBALI',
      commandId(
        session.prefix,
        [
          '__edit',
          session.token
        ]
      )
    )

  return panel.send(
    jid
  )
}

function applySetting(
  session,
  key,
  value
) {
  const s =
    session.settings

  if (
    key ===
    'resolution'
  ) {
    const allowed =
      new Set([
        '720p',
        '1080p',
        '1440p',
        '2160p'
      ])

    if (
      !allowed.has(
        value
      )
    ) {
      return false
    }

    s.resolution =
      value

    return true
  }

  if (
    key ===
    'fps'
  ) {
    const number =
      Number(value)

    if (
      ![
        24,
        30,
        60
      ].includes(
        number
      )
    ) {
      return false
    }

    s.fps =
      number

    return true
  }

  if (
    key ===
    'quality'
  ) {
    const number =
      Number(value)

    if (
      ![
        70,
        80,
        90,
        100
      ].includes(
        number
      )
    ) {
      return false
    }

    s.quality =
      number

    return true
  }

  if (
    [
      'enhance',
      'denoise',
      'stabilize'
    ].includes(
      key
    )
  ) {
    if (
      ![
        'yes',
        'no'
      ].includes(
        value
      )
    ) {
      return false
    }

    s[key] =
      value ===
      'yes'

    return true
  }

  return false
}

async function statusEdit(
  sock,
  jid,
  key,
  text
) {
  if (!key) {
    return
  }

  await sock
    .sendMessage(
      jid,
      {
        text,
        edit:
          key
      }
    )
    .catch(() => {})
}

export default {
  name:
    'hdvid',

  aliases:
    [],

  category:
    'MAKER',

  description:
    'HD video interaktif via Zyvor TOHD',

  usage:
    '.hdvid',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      config?.prefix ||
      '.'

    const action =
      clean(
        args?.[0]
      )

    if (
      action.startsWith(
        '__'
      )
    ) {
      const token =
        clean(
          args?.[1]
        )

      const resolved =
        resolveSession({
          token,
          msg,
          jid
        })

      if (
        !resolved.ok
      ) {
        return sock
          .sendMessage(
            jid,
            {
              text:
                resolved.reason ===
                'OWNER'
                  ? '❌ Sesi HD Video ini bukan milik kamu.'
                  : `⌛ Sesi HD Video sudah habis. Reply video lalu kirim ${prefix}hdvid lagi.`
            },
            {
              quoted:
                msg
            }
          )
      }

      const session =
        resolved.session

      if (
        action ===
        '__edit'
      ) {
        return sendEditPanel({
          sock,
          jid,
          session
        })
      }

      if (
        action ===
        '__back'
      ) {
        return sendMainPanel({
          sock,
          jid,
          session
        })
      }

      if (
        action ===
        '__menu'
      ) {
        return sendChoicePanel({
          sock,
          jid,
          session,
          setting:
            clean(
              args?.[2]
            )
        })
      }

      if (
        action ===
        '__set'
      ) {
        const changed =
          applySetting(
            session,
            clean(
              args?.[2]
            ),
            clean(
              args?.[3]
            )
          )

        if (!changed) {
          return sock
            .sendMessage(
              jid,
              {
                text:
                  '❌ Opsi setting tidak valid.'
              },
              {
                quoted:
                  msg
              }
            )
        }

        return sendEditPanel({
          sock,
          jid,
          session
        })
      }

      if (
        action ===
        '__cancel'
      ) {
        await removeSession(
          session.token
        )

        return sock
          .sendMessage(
            jid,
            {
              text:
                '❌ HD Video dibatalkan.'
            },
            {
              quoted:
                msg
            }
          )
      }

      if (
        action ===
        '__process'
      ) {
        if (
          session.processing
        ) {
          return sock
            .sendMessage(
              jid,
              {
                text:
                  '⏳ Video ini sedang diproses.'
              },
              {
                quoted:
                  msg
              }
            )
        }

        session.processing =
          true

        let statusKey =
          null

        try {
          const sent =
            await sock
              .sendMessage(
                jid,
                {
                  text:
                    `🎬 *NEXA • HD VIDEO*\n\n` +
                    `⬇️ Mengambil video dari WhatsApp...`
                },
                {
                  quoted:
                    msg
                }
              )

          statusKey =
            sent?.key ||
            null

          const input =
            await downloadHdvidInput(
              session.source,
              sock
            )

          await statusEdit(
            sock,
            jid,
            statusKey,
            `🎬 *NEXA • HD VIDEO*\n\n` +
            `✨ Memproses langsung ke TOHD...\n` +
            `📦 Input: ${prettyBytes(input.buffer.length)}\n` +
            `📐 ${session.settings.resolution} • ${session.settings.fps} FPS • Q${session.settings.quality}\n` +
            `Proses video bisa memakan waktu.`
          )

          const result =
            await enhanceHdVideo({
              buffer:
                input.buffer,

              mimetype:
                input.mimetype,

              settings:
                session.settings
            })

          await statusEdit(
            sock,
            jid,
            statusKey,
            `🎬 *NEXA • HD VIDEO*\n\n` +
            `✅ Enhancement selesai.\n` +
            `📦 Output: ${prettyBytes(result.buffer.length)}\n` +
            `📤 Mengirim video...`
          )

          await sock
            .sendMessage(
              jid,
              {
                video:
                  result.buffer,

                mimetype:
                  result.mimetype ||
                  'video/mp4',

                fileName:
                  `NEXA-HDVID-${Date.now()}.mp4`,

                caption:
                  `✨ *NEXA HD VIDEO*\n` +
                  `${session.settings.resolution} • ${session.settings.fps} FPS • Quality ${session.settings.quality}\n` +
                  `Enhance ${yesNo(session.settings.enhance)} • Denoise ${yesNo(session.settings.denoise)} • Stabilize ${yesNo(session.settings.stabilize)}`
              },
              {
                quoted:
                  msg,

                mediaUploadTimeoutMs:
                  2 * 60 * 1000
              }
            )

          await statusEdit(
            sock,
            jid,
            statusKey,
            `🎬 *NEXA • HD VIDEO*\n\n` +
            `✅ Selesai dikirim.`
          )

          await removeSession(
            session.token
          )

          return
        } catch (error) {
          console.error(
            '[HDVID]',
            error
          )

          session.processing =
            false

          const text =
            `🎬 *NEXA • HD VIDEO*\n\n` +
            `❌ Gagal memproses video.\n` +
            `${hdvidErrorText(error)}`

          await statusEdit(
            sock,
            jid,
            statusKey,
            text
          )

          if (
            !statusKey
          ) {
            await sock
              .sendMessage(
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

          return
        }
      }

      return
    }

    const source =
      getMediaSource(
        msg,
        sock
      )

    if (
      source?.type !==
      'video'
    ) {
      return sock
        .sendMessage(
          jid,
          {
            text:
              `🎬 *NEXA • HD VIDEO*\n\n` +
              `Kirim video dengan caption *${prefix}hdvid*\n` +
              `atau reply video lalu kirim *${prefix}hdvid*.\n\n` +
              `Default: 1080p • 30 FPS • Quality 90 • Enhance ON.`
          },
          {
            quoted:
              msg
          }
        )
    }

    const session =
      createSession({
        owner:
          ownerKey(
            msg,
            jid
          ),

        jid,

        source,

        prefix
      })

    return sendMainPanel({
      sock,
      jid,
      session
    })
  }
}
