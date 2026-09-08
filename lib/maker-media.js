import { downloadMediaMessage, areJidsSameUser } from '@whiskeysockets/baileys'
import webp from 'node-webpmux'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTool } from './maker-runtime.js'

function unwrap(message) {
  for (let i = 0; message && i < 8; i++) {
    const next = message.ephemeralMessage?.message || message.viewOnceMessage?.message ||
      message.viewOnceMessageV2?.message || message.viewOnceMessageV2Extension?.message ||
      message.documentWithCaptionMessage?.message
    if (!next) return message
    message = next
  }
  return message || {}
}

export function getMediaSource(msg, sock) {
  const body = unwrap(msg?.message)
  const context = Object.values(body).find(v => v?.contextInfo?.quotedMessage)?.contextInfo
  const candidates = []
  if (context) {
    const participant = context.participant
    const mine = [sock?.user?.id, sock?.user?.lid].filter(Boolean)
    candidates.push({
      message: unwrap(context.quotedMessage),
      key: {
        remoteJid: context.remoteJid || msg.key.remoteJid,
        id: context.stanzaId,
        participant,
        fromMe: !!participant && mine.some(j => areJidsSameUser(j, participant))
      }
    })
  }
  candidates.push({ key: msg?.key, message: body })
  for (const candidate of candidates) {
    for (const [field, type] of [['imageMessage', 'image'], ['videoMessage', 'video'], ['stickerMessage', 'sticker']]) {
      if (candidate.message?.[field]) return { ...candidate, type }
    }
  }
  return null
}

export async function downloadMedia(source, sock) {
  if (!source?.message) throw new Error('MEDIA_NOT_FOUND')
  const controller = new AbortController()
  let stream
  let timedOut = false
  const logger = { info() {}, error() {}, warn() {}, debug() {}, trace() {}, child() { return this } }
  const maxBytes = 16 * 1024 * 1024
  let rejectDeadline
  const deadline = new Promise((_, reject) => { rejectDeadline = reject })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
    stream?.destroy(new Error('DOWNLOAD_TIMEOUT'))
    rejectDeadline(new Error('DOWNLOAD_TIMEOUT'))
  }, 30000)
  const operation = (async () => {
    const media = Object.values(source.message).find(v => v?.mediaKey)
    if (Number(media?.fileLength) > maxBytes) throw new Error('MEDIA_TOO_LARGE')
    stream = await downloadMediaMessage(
      { key: source.key, message: source.message }, 'stream',
      { options: { signal: controller.signal, timeout: 25000 } },
      { logger, reuploadRequest: async message => {
        if (timedOut) throw new Error('DOWNLOAD_TIMEOUT')
        if (!source.key?.id || !sock?.updateMediaMessage) throw new Error('REUPLOAD_REQUIRED')
        return sock.updateMediaMessage(message)
      } }
    )
    if (timedOut) { stream.destroy(); throw new Error('DOWNLOAD_TIMEOUT') }
    const chunks = []
    let size = 0
    for await (const chunk of stream) {
      size += chunk.length
      if (size > maxBytes) throw new Error('MEDIA_TOO_LARGE')
      chunks.push(Buffer.from(chunk))
    }
    if (!size) throw new Error('DOWNLOAD_EMPTY')
    return Buffer.concat(chunks)
  })()
  try { return await Promise.race([operation, deadline]) }
  finally { clearTimeout(timer); controller.abort(); stream?.destroy() }
}

export async function stickerToImage(buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'nexa-toimg-'))
  const input = join(dir, 'frame.webp'), output = join(dir, 'result.png')
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const image = new webp.Image()
    await image.load(buffer)
    if (image.width * image.height > 16000000) throw new Error('PIXEL_LIMIT')
    let pad = []
    if (image.hasAnim) {
      const frames = await image.demux({ buffers: true, frame: 0 })
      if (!frames?.[0]) throw new Error('STICKER_FRAME_EMPTY')
      buffer = frames[0]
      const frame = image.frames[0]
      pad = ['-vf', `format=rgba,pad=${image.width}:${image.height}:${frame.x}:${frame.y}:color=0x00000000`]
    }
    await writeFile(input, buffer)
    await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-threads', '1', '-i', input, '-filter_threads', '1', ...pad,
      '-frames:v', '1', '-threads', '1', output], 20000)
    const result = await readFile(output)
    if (!result.length) throw new Error('TOIMG_OUTPUT_EMPTY')
    return { buffer: result, path: output, animated: image.hasAnim, cleanup }
  } catch (err) { await cleanup(); throw err }
}
