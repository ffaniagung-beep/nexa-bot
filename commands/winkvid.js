// NEXA WINK VIDEO HD V2
import {
  getMediaSource
} from '../lib/maker-media.js'

import {
  downloadWinkInput,
  uploadWinkInput,
  enhanceWinkVideo,
  winkvidErrorText
} from '../lib/winkvid.js'

function humanBytes(bytes) {
  const value =
    Number(bytes) || 0

  if (value < 1024 * 1024) {
    return (
      `${(value / 1024).toFixed(1)} KB`
    )
  }

  return (
    `${(
      value /
      1024 /
      1024
    ).toFixed(1)} MB`
  )
}

function isHttpUrl(value) {
  try {
    const url =
      new URL(
        String(value || '').trim()
      )

    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:'
    )
  } catch {
    return false
  }
}

async function updateStatus(
  sock,
  jid,
  key,
  text
) {
  if (!key) return

  await sock.sendMessage(
    jid,
    {
      text,
      edit: key
    }
  ).catch(() => {})
}

export default {
  name: 'winkvid',

  aliases: [
    'winkvideo',
    'hdvid'
  ],

  category: 'MAKER',

  description:
    'Enhance video ke HD dengan Wink AI',

  usage:
    '.winkvid (kirim/reply video)',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const prefix =
      config?.prefix || '.'

    const manualUrl =
      String(
        args?.[0] || ''
      ).trim()

    const source =
      getMediaSource(
        msg,
        sock
      )

    const hasVideo =
      source?.type === 'video'

    const hasManualUrl =
      isHttpUrl(manualUrl)

    if (
      !hasVideo &&
      !hasManualUrl
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎬 *NEXA • WINK HD VIDEO*\n\n` +
            `Cara pakai paling gampang:\n` +
            `• Kirim video dengan caption *${prefix}winkvid*\n` +
            `• Atau reply video lalu kirim *${prefix}winkvid*\n\n` +
            `URL manual tetap didukung, tapi tidak wajib.`
        },
        {
          quoted: msg
        }
      )
    }

    if (
      source &&
      source.type !== 'video' &&
      !hasManualUrl
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎬 Reply/kirim *video*, bukan ${source.type}.`
        },
        {
          quoted: msg
        }
      )
    }

    let statusKey = null

    try {
      const status =
        await sock.sendMessage(
          jid,
          {
            text:
              `🎬 *NEXA • WINK HD VIDEO*\n\n` +
              (
                hasVideo
                  ? `⬇️ Mengambil video dari WhatsApp...`
                  : `🔗 Memproses URL video...`
              )
          },
          {
            quoted: msg
          }
        )

      statusKey =
        status?.key ||
        null

      let sourceUrl =
        hasManualUrl
          ? manualUrl
          : null

      if (hasVideo) {
        const input =
          await downloadWinkInput(
            source,
            sock
          )

        await updateStatus(
          sock,
          jid,
          statusKey,
          `🎬 *NEXA • WINK HD VIDEO*\n\n` +
          `☁️ Upload video sementara...\n` +
          `📦 ${humanBytes(input.buffer.length)}`
        )

        sourceUrl =
          await uploadWinkInput(
            input
          )
      }

      await updateStatus(
        sock,
        jid,
        statusKey,
        `🎬 *NEXA • WINK HD VIDEO*\n\n` +
        `✨ Wink sedang enhance video...\n` +
        `Proses AI bisa memakan waktu beberapa menit.`
      )

      const result =
        await enhanceWinkVideo(
          sourceUrl
        )

      await updateStatus(
        sock,
        jid,
        statusKey,
        `🎬 *NEXA • WINK HD VIDEO*\n\n` +
        `✅ Enhancement selesai.\n` +
        `📦 ${humanBytes(result.bytes)}\n` +
        `📤 Mengirim video...`
      )

      await sock.sendMessage(
        jid,
        {
          video:
            result.buffer,
          mimetype:
            result.mimetype ||
            'video/mp4',
          fileName:
            `NEXA-WINK-HD-${Date.now()}.mp4`,
          caption:
            `✨ *WINK HD VIDEO*\n` +
            `Enhancement selesai • ${humanBytes(result.bytes)}`
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            2 * 60 * 1000
        }
      )

      await updateStatus(
        sock,
        jid,
        statusKey,
        `🎬 *NEXA • WINK HD VIDEO*\n\n` +
        `✅ Selesai dikirim.`
      )
    } catch (error) {
      console.error(
        '[WINKVID]',
        error
      )

      const text =
        `🎬 *NEXA • WINK HD VIDEO*\n\n` +
        `❌ Gagal enhance video.\n` +
        `${winkvidErrorText(error)}`

      await updateStatus(
        sock,
        jid,
        statusKey,
        text
      )

      if (!statusKey) {
        await sock.sendMessage(
          jid,
          {
            text
          },
          {
            quoted: msg
          }
        )
      }
    }
  }
}
