import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import webp from 'node-webpmux'

import {
  downloadMediaMessage
} from '@whiskeysockets/baileys'

// =====================================
// NEXA MAKER CORE
// =====================================

const TEMP_DIR =
  path.resolve('./temp')

const STICKER_PACK = {
  id:
    'nexa-bot-sticker-pack',

  name:
    'NEXA-BOT',

  publisher:
    'Sticker by: Nexa-Bot',

  emojis: [
    '⚡'
  ]
}

// =====================================
// TEMP
// =====================================

function ensureTemp() {
  if (
    !fs.existsSync(
      TEMP_DIR
    )
  ) {
    fs.mkdirSync(
      TEMP_DIR,
      {
        recursive: true
      }
    )
  }
}

function randomName(ext) {
  ensureTemp()

  return path.join(
    TEMP_DIR,
    `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  )
}

export function safeDelete(
  ...files
) {
  for (
    const file
    of files
  ) {
    if (!file) {
      continue
    }

    try {
      if (
        fs.existsSync(
          file
        )
      ) {
        fs.unlinkSync(
          file
        )
      }
    } catch {}
  }
}

// =====================================
// QUOTED MESSAGE
// =====================================

export function getQuotedMessage(
  msg
) {
  return (
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.quotedMessage ||

    msg?.message
      ?.imageMessage
      ?.contextInfo
      ?.quotedMessage ||

    msg?.message
      ?.videoMessage
      ?.contextInfo
      ?.quotedMessage ||

    msg?.message
      ?.documentMessage
      ?.contextInfo
      ?.quotedMessage ||

    null
  )
}

// =====================================
// MEDIA SOURCE
// =====================================

export function getMediaSource(
  msg
) {
  const quoted =
    getQuotedMessage(
      msg
    )

  // =================================
  // QUOTED
  // =================================

  if (quoted) {
    if (
      quoted.imageMessage
    ) {
      return {
        type:
          'image',

        message: {
          imageMessage:
            quoted.imageMessage
        }
      }
    }

    if (
      quoted.videoMessage
    ) {
      return {
        type:
          'video',

        message: {
          videoMessage:
            quoted.videoMessage
        }
      }
    }

    if (
      quoted.stickerMessage
    ) {
      return {
        type:
          'sticker',

        message: {
          stickerMessage:
            quoted.stickerMessage
        }
      }
    }
  }

  // =================================
  // DIRECT
  // =================================

  if (
    msg?.message
      ?.imageMessage
  ) {
    return {
      type:
        'image',

      message: {
        imageMessage:
          msg.message
            .imageMessage
      }
    }
  }

  if (
    msg?.message
      ?.videoMessage
  ) {
    return {
      type:
        'video',

      message: {
        videoMessage:
          msg.message
            .videoMessage
      }
    }
  }

  if (
    msg?.message
      ?.stickerMessage
  ) {
    return {
      type:
        'sticker',

      message: {
        stickerMessage:
          msg.message
            .stickerMessage
      }
    }
  }

  return null
}

// =====================================
// DOWNLOAD MEDIA
// =====================================

export async function downloadMedia(
  source
) {
  if (
    !source?.message
  ) {
    throw new Error(
      'MEDIA_NOT_FOUND'
    )
  }

  const fakeMessage = {
    key: {
      remoteJid:
        'status@broadcast',

      fromMe:
        false,

      id:
        `NEXA-${Date.now()}`
    },

    message:
      source.message
  }

  const silentLogger = {
    info() {},
    error() {},
    warn() {},
    debug() {},
    trace() {},

    child() {
      return this
    }
  }

  const buffer =
    await downloadMediaMessage(
      fakeMessage,
      'buffer',
      {},
      {
        logger:
          silentLogger,

        reuploadRequest:
          async () => {
            throw new Error(
              'REUPLOAD_REQUIRED'
            )
          }
      }
    )

  if (
    !buffer ||
    !buffer.length
  ) {
    throw new Error(
      'DOWNLOAD_FAILED'
    )
  }

  return buffer
}

// =====================================
// FFMPEG
// =====================================

function runFFmpeg(
  args
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const process =
        spawn(
          'ffmpeg',
          args,
          {
            stdio: [
              'ignore',
              'ignore',
              'pipe'
            ]
          }
        )

      let errorText =
        ''

      process.stderr.on(
        'data',
        data => {
          errorText +=
            data.toString()
        }
      )

      process.on(
        'error',
        err => {
          reject(
            err
          )
        }
      )

      process.on(
        'close',
        code => {
          if (
            code === 0
          ) {
            resolve()
            return
          }

          reject(
            new Error(
              errorText ||
              `FFmpeg exit ${code}`
            )
          )
        }
      )
    }
  )
}

// =====================================
// WHATSAPP STICKER EXIF
// =====================================

function buildStickerExif({
  packId,
  packName,
  publisher,
  emojis
}) {
  const metadata = {
    'sticker-pack-id':
      packId,

    'sticker-pack-name':
      packName,

    'sticker-pack-publisher':
      publisher,

    emojis:
      Array.isArray(emojis)
        ? emojis
        : ['⚡']
  }

  const jsonBuffer =
    Buffer.from(
      JSON.stringify(
        metadata
      ),
      'utf8'
    )

  /*
   * Standard EXIF header yang umum
   * dipakai sticker WhatsApp.
   *
   * JSON length ditulis langsung
   * ke offset 14.
   */
  const exifAttr =
    Buffer.from([
      0x49,
      0x49,
      0x2A,
      0x00,

      0x08,
      0x00,
      0x00,
      0x00,

      0x01,
      0x00,

      0x41,
      0x57,

      0x07,
      0x00,

      0x00,
      0x00,
      0x00,
      0x00,

      0x16,
      0x00,
      0x00,
      0x00
    ])

  exifAttr.writeUIntLE(
    jsonBuffer.length,
    14,
    4
  )

  return Buffer.concat([
    exifAttr,
    jsonBuffer
  ])
}

async function addStickerExif(
  filePath,
  options = {}
) {
  const packId =
    options.packId ||
    STICKER_PACK.id

  const packName =
    options.packName ||
    STICKER_PACK.name

  const publisher =
    options.publisher ||
    STICKER_PACK.publisher

  const emojis =
    options.emojis ||
    STICKER_PACK.emojis

  const image =
    new webp.Image()

  await image.load(
    filePath
  )

  image.exif =
    buildStickerExif({
      packId,
      packName,
      publisher,
      emojis
    })

  await image.save(
    filePath
  )
}

// =====================================
// IMAGE → STICKER
// =====================================

export async function imageToSticker(
  buffer
) {
  const input =
    randomName(
      'img'
    )

  const output =
    randomName(
      'webp'
    )

  fs.writeFileSync(
    input,
    buffer
  )

  try {
    await runFFmpeg([
      '-y',

      '-i',
      input,

      '-vf',
      [
        'scale=512:512:force_original_aspect_ratio=decrease',
        'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
      ].join(','),

      '-vcodec',
      'libwebp',

      '-lossless',
      '0',

      '-compression_level',
      '6',

      '-q:v',
      '75',

      '-preset',
      'picture',

      '-an',

      '-vsync',
      '0',

      output
    ])

    // =================================
    // NEXA STICKER INFO
    // =================================

    await addStickerExif(
      output
    )

    const outputBuffer =
      fs.readFileSync(
        output
      )

    return {
      path:
        output,

      buffer:
        outputBuffer,

      cleanup() {
        safeDelete(
          input,
          output
        )
      }
    }
  } catch (err) {
    safeDelete(
      input,
      output
    )

    throw err
  }
}

// =====================================
// VIDEO → STICKER
// =====================================

export async function videoToSticker(
  buffer
) {
  const input =
    randomName(
      'mp4'
    )

  const output =
    randomName(
      'webp'
    )

  fs.writeFileSync(
    input,
    buffer
  )

  try {
    await runFFmpeg([
      '-y',

      '-t',
      '6',

      '-i',
      input,

      '-vf',
      [
        'fps=15',
        'scale=512:512:force_original_aspect_ratio=decrease',
        'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
      ].join(','),

      '-vcodec',
      'libwebp',

      '-lossless',
      '0',

      '-compression_level',
      '6',

      '-q:v',
      '55',

      '-loop',
      '0',

      '-an',

      '-vsync',
      '0',

      output
    ])

    // =================================
    // NEXA STICKER INFO
    // =================================

    await addStickerExif(
      output
    )

    const outputBuffer =
      fs.readFileSync(
        output
      )

    return {
      path:
        output,

      buffer:
        outputBuffer,

      cleanup() {
        safeDelete(
          input,
          output
        )
      }
    }
  } catch (err) {
    safeDelete(
      input,
      output
    )

    throw err
  }
}

// =====================================
// STICKER → PNG
// =====================================

export async function stickerToImage(
  buffer
) {
  const input =
    randomName(
      'webp'
    )

  const output =
    randomName(
      'png'
    )

  fs.writeFileSync(
    input,
    buffer
  )

  try {
    await runFFmpeg([
      '-y',

      '-i',
      input,

      '-frames:v',
      '1',

      output
    ])

    const outputBuffer =
      fs.readFileSync(
        output
      )

    return {
      path:
        output,

      buffer:
        outputBuffer,

      cleanup() {
        safeDelete(
          input,
          output
        )
      }
    }
  } catch (err) {
    safeDelete(
      input,
      output
    )

    throw err
  }
}
