import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, rm, stat, chmod } from 'node:fs/promises'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

const API = 'https://open.tiktokapis.com'
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const ROOT = path.resolve('./database/tiktok-publisher')
const JOBS_DIR = path.join(ROOT, 'jobs')
const MEDIA_DIR = path.join(ROOT, 'media')
const TOKEN_FILE = path.join(ROOT, 'auth.json')
const STATE_FILE = path.join(ROOT, 'oauth-state.json')

const MIN_CHUNK = 5 * 1024 * 1024
const DEFAULT_CHUNK = 10 * 1024 * 1024
const MAX_SINGLE = 64 * 1024 * 1024
const TOKEN_SKEW_MS = 2 * 60 * 1000
const STAGE_TTL_MS = 60 * 60 * 1000
const MAX_VIDEO_BYTES = Math.max(
  5 * 1024 * 1024,
  Number(process.env.TIKTOK_MAX_VIDEO_MB || 512) * 1024 * 1024
)

let oauthServer = null

function cleanText(value, max = 2200) {
  return String(value ?? '').trim().slice(0, max)
}

function boolEnv(value, fallback = false) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

async function ensureRoot() {
  await mkdir(JOBS_DIR, { recursive: true })
  await mkdir(MEDIA_DIR, { recursive: true })
}

async function writeJsonAtomic(file, data, mode = 0o600) {
  await ensureRoot()
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode })
  await rename(tmp, file)
  try { await chmod(file, mode) } catch {}
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

function requireMainBot() {
  if (process.env.NEXA_CHILD_BOT === '1') {
    throw new Error('TikTok publisher hanya boleh dipakai dari NEXA Main.')
  }
}

function oauthConfig() {
  const clientKey = String(process.env.TIKTOK_CLIENT_KEY || '').trim()
  const clientSecret = String(process.env.TIKTOK_CLIENT_SECRET || '').trim()
  const redirectUri = String(process.env.TIKTOK_REDIRECT_URI || '').trim()
  const scopes = String(process.env.TIKTOK_SCOPES || 'video.publish')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
  const port = Number(process.env.TIKTOK_OAUTH_PORT || 8787)
  const host = String(process.env.TIKTOK_OAUTH_HOST || '0.0.0.0').trim()

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error(
      'TikTok belum dikonfigurasi. Isi TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, dan TIKTOK_REDIRECT_URI di .env.'
    )
  }

  let redirect
  try {
    redirect = new URL(redirectUri)
  } catch {
    throw new Error('TIKTOK_REDIRECT_URI tidak valid.')
  }

  if (redirect.protocol !== 'https:') {
    throw new Error('TIKTOK_REDIRECT_URI harus HTTPS dan terdaftar di TikTok Developer.')
  }

  if (!scopes.includes('video.publish')) {
    throw new Error('TIKTOK_SCOPES harus memuat video.publish untuk Direct Post.')
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TIKTOK_OAUTH_PORT tidak valid.')
  }

  return { clientKey, clientSecret, redirectUri, redirect, scopes, port, host }
}

function apiError(json, status, fallback = 'TikTok API error') {
  const code = json?.error?.code
  const message = json?.error?.message
  const text = [code && code !== 'ok' ? code : '', message].filter(Boolean).join(': ')
  const error = new Error(text || `${fallback} (HTTP ${status})`)
  error.status = status
  error.code = code || null
  error.logId = json?.error?.log_id || json?.error?.logid || null
  return error
}

async function postJson(url, accessToken, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify(body)
  })

  let json = null
  try { json = await response.json() } catch {}

  if (!response.ok || json?.error?.code !== 'ok') {
    throw apiError(json, response.status)
  }

  return json
}

async function exchangeToken(form) {
  const response = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body: new URLSearchParams(form)
  })

  let json = null
  try { json = await response.json() } catch {}

  if (!response.ok || !json?.access_token) {
    const error = new Error(
      json?.error_description || json?.message || json?.error || `OAuth gagal (HTTP ${response.status})`
    )
    error.status = response.status
    throw error
  }

  return json
}

async function saveTokenBundle(bundle) {
  const now = Date.now()
  const current = await readJson(TOKEN_FILE, {})
  const data = {
    access_token: bundle.access_token,
    refresh_token: bundle.refresh_token || current.refresh_token || '',
    open_id: bundle.open_id || current.open_id || '',
    scope: bundle.scope || current.scope || '',
    token_type: bundle.token_type || current.token_type || 'Bearer',
    expires_at: now + Math.max(0, Number(bundle.expires_in || 0)) * 1000,
    refresh_expires_at: now + Math.max(0, Number(bundle.refresh_expires_in || 0)) * 1000,
    updated_at: now
  }

  await writeJsonAtomic(TOKEN_FILE, data)
  return data
}

export async function getAuthStatus() {
  const token = await readJson(TOKEN_FILE)
  if (!token?.access_token) return { connected: false }

  return {
    connected: true,
    openId: token.open_id || null,
    scope: token.scope || '',
    expiresAt: token.expires_at || 0,
    refreshExpiresAt: token.refresh_expires_at || 0
  }
}

export async function getValidAccessToken() {
  requireMainBot()
  const cfg = oauthConfig()
  const token = await readJson(TOKEN_FILE)

  if (!token?.access_token) {
    throw new Error('TikTok belum terhubung. Jalankan .tiktokauth dulu.')
  }

  if (Number(token.expires_at || 0) > Date.now() + TOKEN_SKEW_MS) {
    return token.access_token
  }

  if (!token.refresh_token) {
    throw new Error('Refresh token TikTok tidak tersedia. Hubungkan ulang dengan .tiktokauth.')
  }

  const bundle = await exchangeToken({
    client_key: cfg.clientKey,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token
  })

  const saved = await saveTokenBundle(bundle)
  return saved.access_token
}

export async function createAuthorizationUrl() {
  requireMainBot()
  const cfg = oauthConfig()
  await ensureRoot()

  const state = randomBytes(24).toString('hex')
  await writeJsonAtomic(STATE_FILE, {
    state,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  })

  const url = new URL(AUTH_URL)
  url.searchParams.set('client_key', cfg.clientKey)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', cfg.scopes.join(','))
  url.searchParams.set('redirect_uri', cfg.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('disable_auto_auth', '1')
  return url.toString()
}

async function handleOAuthCallback(req, res) {
  const cfg = oauthConfig()
  const incoming = new URL(req.url || '/', 'http://localhost')

  if (incoming.pathname !== cfg.redirect.pathname) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const savedState = await readJson(STATE_FILE)
  const state = incoming.searchParams.get('state') || ''
  const code = incoming.searchParams.get('code') || ''
  const oauthError = incoming.searchParams.get('error') || ''
  const oauthDescription = incoming.searchParams.get('error_description') || ''

  if (
    !savedState?.state ||
    savedState.state !== state ||
    Number(savedState.expiresAt || 0) < Date.now()
  ) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('OAuth state tidak valid atau sudah kedaluwarsa. Jalankan .tiktokauth lagi.')
    return
  }

  if (oauthError) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`TikTok OAuth gagal: ${oauthDescription || oauthError}`)
    return
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Authorization code tidak ditemukan.')
    return
  }

  try {
    const bundle = await exchangeToken({
      client_key: cfg.clientKey,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri
    })

    await saveTokenBundle(bundle)
    await rm(STATE_FILE, { force: true })

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      '<!doctype html><meta charset="utf-8"><title>NEXA TikTok</title>' +
      '<style>body{font-family:system-ui;background:#111;color:#eee;max-width:680px;margin:80px auto;padding:24px}code{color:#7ee787}</style>' +
      '<h1>✅ TikTok terhubung</h1><p>Token sudah disimpan di server NEXA.</p>' +
      '<p>Kembali ke WhatsApp lalu jalankan <code>.tiktokaccount</code>.</p>'
    )
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`Gagal menukar authorization code: ${error?.message || error}`)
  }
}

export async function ensureOAuthCallbackServer() {
  requireMainBot()
  const cfg = oauthConfig()
  if (oauthServer?.listening) return { port: cfg.port, host: cfg.host }

  oauthServer = http.createServer((req, res) => {
    handleOAuthCallback(req, res).catch(error => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`Internal OAuth error: ${error?.message || error}`)
    })
  })

  await new Promise((resolve, reject) => {
    const onError = error => {
      oauthServer?.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      oauthServer?.off('error', onError)
      resolve()
    }
    oauthServer.once('error', onError)
    oauthServer.once('listening', onListening)
    oauthServer.listen(cfg.port, cfg.host)
  })

  return { port: cfg.port, host: cfg.host }
}

export async function disconnectTikTok() {
  requireMainBot()
  await rm(TOKEN_FILE, { force: true })
  await rm(STATE_FILE, { force: true })
}

export async function queryCreatorInfo() {
  const accessToken = await getValidAccessToken()
  const json = await postJson(
    `${API}/v2/post/publish/creator_info/query/`,
    accessToken,
    {}
  )
  return json.data || {}
}

function mimeInfo(source) {
  const video = source?.message?.videoMessage
  const mime = String(video?.mimetype || 'video/mp4').toLowerCase()
  if (mime.includes('mp4')) return { mime: 'video/mp4', ext: '.mp4' }
  if (mime.includes('quicktime') || mime.includes('mov')) return { mime: 'video/quicktime', ext: '.mov' }
  if (mime.includes('webm')) return { mime: 'video/webm', ext: '.webm' }
  throw new Error(`Format video WhatsApp tidak didukung TikTok: ${mime}`)
}

async function downloadVideoToFile(source, sock, outputFile) {
  const media = source?.message?.videoMessage
  if (!media) throw new Error('Reply atau kirim sebuah video bersama command.')

  const declared = Number(media.fileLength || 0)
  if (declared > MAX_VIDEO_BYTES) {
    throw new Error(`Video terlalu besar untuk batas bot (${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`)
  }

  const controller = new AbortController()
  const logger = {
    info() {}, error() {}, warn() {}, debug() {}, trace() {}, child() { return this }
  }

  let stream
  let output
  let total = 0
  try {
    stream = await downloadMediaMessage(
      { key: source.key, message: source.message },
      'stream',
      { options: { signal: controller.signal, timeout: 120000 } },
      {
        logger,
        reuploadRequest: async message => {
          if (!source.key?.id || !sock?.updateMediaMessage) {
            throw new Error('Media WhatsApp perlu diunggah ulang tetapi socket tidak mendukung reupload.')
          }
          return sock.updateMediaMessage(message)
        }
      }
    )

    output = fs.createWriteStream(outputFile, { flags: 'wx', mode: 0o600 })
    for await (const chunk of stream) {
      total += chunk.length
      if (total > MAX_VIDEO_BYTES) {
        throw new Error(`Video melewati batas bot (${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB).`)
      }
      if (!output.write(chunk)) {
        await new Promise(resolve => output.once('drain', resolve))
      }
    }

    await new Promise((resolve, reject) => {
      output.end(resolve)
      output.once('error', reject)
    })
  } catch (error) {
    output?.destroy()
    await rm(outputFile, { force: true })
    throw error
  } finally {
    controller.abort()
    stream?.destroy?.()
  }

  if (!total) {
    await rm(outputFile, { force: true })
    throw new Error('Video kosong.')
  }

  return total
}

function jobFile(id) {
  return path.join(JOBS_DIR, `${id}.json`)
}

export async function readJob(id) {
  const safe = String(id || '').toLowerCase()
  if (!/^[a-f0-9]{10}$/.test(safe)) return null
  return readJson(jobFile(safe))
}

async function saveJob(job) {
  job.updatedAt = Date.now()
  await writeJsonAtomic(jobFile(job.id), job)
  return job
}

export async function stageVideo({ source, sock, caption }) {
  requireMainBot()
  await cleanupExpiredStages()

  const creator = await queryCreatorInfo()
  const id = randomBytes(5).toString('hex')
  const { mime, ext } = mimeInfo(source)
  const mediaPath = path.join(MEDIA_DIR, `${id}${ext}`)
  await ensureRoot()

  const declaredDurationSec = Number(source?.message?.videoMessage?.seconds || 0)
  const maxDurationSec = Number(creator.max_video_post_duration_sec || 0)
  if (declaredDurationSec > 0 && maxDurationSec > 0 && declaredDurationSec > maxDurationSec) {
    throw new Error(`Durasi video ${declaredDurationSec}s melebihi batas akun TikTok ${maxDurationSec}s.`)
  }

  const size = await downloadVideoToFile(source, sock, mediaPath)
  const info = await stat(mediaPath)
  if (info.size !== size) {
    await rm(mediaPath, { force: true })
    throw new Error('Ukuran video staging tidak konsisten.')
  }

  const job = {
    id,
    state: 'STAGED',
    caption: cleanText(caption, 2200),
    mediaPath,
    mime,
    size,
    durationSec: declaredDurationSec || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + STAGE_TTL_MS,
    creatorSnapshot: {
      creator_username: creator.creator_username || '',
      creator_nickname: creator.creator_nickname || '',
      privacy_level_options: creator.privacy_level_options || [],
      comment_disabled: Boolean(creator.comment_disabled),
      duet_disabled: Boolean(creator.duet_disabled),
      stitch_disabled: Boolean(creator.stitch_disabled),
      max_video_post_duration_sec: creator.max_video_post_duration_sec || null
    }
  }

  await saveJob(job)
  return { job, creator: job.creatorSnapshot }
}

export async function cleanupExpiredStages() {
  await ensureRoot()
  let names = []
  try { names = await fs.promises.readdir(JOBS_DIR) } catch {}
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = path.join(JOBS_DIR, name)
    const job = await readJson(file)
    if (!job) continue
    if (job.state === 'STAGED' && Number(job.expiresAt || 0) < Date.now()) {
      await rm(job.mediaPath || '', { force: true }).catch(() => {})
      await rm(file, { force: true }).catch(() => {})
    }
  }
}

function normalizeCommercial(value) {
  const raw = String(value || '').toLowerCase()
  if (['none', 'own', 'paid', 'both'].includes(raw)) return raw
  throw new Error('commercial harus none/own/paid/both.')
}

function normalizeToggle(value, label) {
  const raw = String(value || '').toLowerCase()
  if (['on', 'yes', '1', 'true'].includes(raw)) return true
  if (['off', 'no', '0', 'false'].includes(raw)) return false
  throw new Error(`${label} harus on/off.`)
}

function chunkPlan(size) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Ukuran video tidak valid.')
  if (size <= MAX_SINGLE) {
    return { chunkSize: size, totalChunkCount: 1 }
  }

  const chunkSize = DEFAULT_CHUNK
  const totalChunkCount = Math.floor(size / chunkSize)
  if (totalChunkCount < 1 || totalChunkCount > 1000) {
    throw new Error('Jumlah chunk TikTok berada di luar batas.')
  }
  return { chunkSize, totalChunkCount }
}

async function initDirectPost({ accessToken, job, privacy, comments, duet, stitch, creator, aigc, commercial }) {
  const allowed = Array.isArray(creator.privacy_level_options)
    ? creator.privacy_level_options
    : []

  if (!allowed.includes(privacy)) {
    throw new Error(`Privacy ${privacy} tidak tersedia. Pilihan: ${allowed.join(', ') || '-'}`)
  }

  if (comments && creator.comment_disabled) throw new Error('Comments sedang dinonaktifkan pada akun TikTok.')
  if (duet && creator.duet_disabled) throw new Error('Duet sedang dinonaktifkan pada akun TikTok.')
  if (stitch && creator.stitch_disabled) throw new Error('Stitch sedang dinonaktifkan pada akun TikTok.')

  if (['paid', 'both'].includes(commercial) && !['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS'].includes(privacy)) {
    throw new Error('Branded/Paid content tidak boleh memakai privacy private. Pilih PUBLIC_TO_EVERYONE atau MUTUAL_FOLLOW_FRIENDS jika tersedia.')
  }

  const maxDurationSec = Number(creator.max_video_post_duration_sec || 0)
  if (job.durationSec && maxDurationSec > 0 && Number(job.durationSec) > maxDurationSec) {
    throw new Error(`Durasi video ${job.durationSec}s melebihi batas akun TikTok ${maxDurationSec}s.`)
  }

  const { chunkSize, totalChunkCount } = chunkPlan(job.size)
  const json = await postJson(
    `${API}/v2/post/publish/video/init/`,
    accessToken,
    {
      post_info: {
        title: cleanText(job.caption, 2200),
        privacy_level: privacy,
        disable_comment: !comments,
        disable_duet: !duet,
        disable_stitch: !stitch,
        brand_content_toggle: ['paid', 'both'].includes(commercial),
        brand_organic_toggle: ['own', 'both'].includes(commercial),
        is_aigc: Boolean(aigc)
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: job.size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount
      }
    }
  )

  if (!json?.data?.publish_id || !json?.data?.upload_url) {
    throw new Error('TikTok tidak mengembalikan publish_id/upload_url.')
  }

  return {
    publishId: json.data.publish_id,
    uploadUrl: json.data.upload_url,
    chunkSize,
    totalChunkCount
  }
}

async function uploadChunk({ uploadUrl, file, mime, size, start, end, isFinal }) {
  const length = end - start + 1
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    const body = createReadStream(file, { start, end })
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mime,
          'Content-Length': String(length),
          'Content-Range': `bytes ${start}-${end}/${size}`
        },
        body,
        duplex: 'half'
      })

      const expected = isFinal ? [200, 201] : [200, 206]
      if (expected.includes(response.status)) return

      const text = await response.text().catch(() => '')
      const error = new Error(`Upload chunk gagal HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`)
      error.status = response.status
      if (response.status < 500 || attempt === 3) throw error
      lastError = error
    } catch (error) {
      lastError = error
      if (Number(error?.status || 0) && Number(error.status) < 500) throw error
      if (attempt === 3) throw error
    } finally {
      body.destroy()
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 1000))
  }

  throw lastError || new Error('Upload chunk gagal.')
}

async function uploadFile({ uploadUrl, job, chunkSize, totalChunkCount }) {
  let start = 0
  for (let index = 0; index < totalChunkCount; index++) {
    const isFinal = index === totalChunkCount - 1
    const end = isFinal
      ? job.size - 1
      : start + chunkSize - 1

    const thisLength = end - start + 1
    if (!isFinal && thisLength < MIN_CHUNK) {
      throw new Error('Chunk TikTok lebih kecil dari batas minimum.')
    }

    await uploadChunk({
      uploadUrl,
      file: job.mediaPath,
      mime: job.mime,
      size: job.size,
      start,
      end,
      isFinal
    })

    start = end + 1
  }
}

export async function confirmAndPublish({
  id,
  privacy,
  comments,
  duet,
  stitch,
  commercial,
  aigc,
  consent
}) {
  requireMainBot()
  if (String(consent || '').toUpperCase() !== 'SETUJU') {
    throw new Error('Konfirmasi harus diakhiri kata SETUJU.')
  }

  const job = await readJob(id)
  if (!job) throw new Error('Job TikTok tidak ditemukan.')
  if (job.state !== 'STAGED') throw new Error(`Job bukan STAGED (sekarang: ${job.state}).`)
  if (Number(job.expiresAt || 0) < Date.now()) {
    await cancelJob(id)
    throw new Error('Job staging sudah kedaluwarsa. Jalankan .tiktokpost lagi.')
  }

  const settings = {
    privacy: String(privacy || '').toUpperCase(),
    comments: normalizeToggle(comments, 'comments'),
    duet: normalizeToggle(duet, 'duet'),
    stitch: normalizeToggle(stitch, 'stitch'),
    commercial: normalizeCommercial(commercial),
    aigc: normalizeToggle(aigc, 'aigc')
  }

  const creator = await queryCreatorInfo()
  const accessToken = await getValidAccessToken()

  job.state = 'INITIALIZING'
  job.settings = settings
  await saveJob(job)

  let init
  try {
    init = await initDirectPost({ accessToken, job, creator, ...settings })
  } catch (error) {
    job.state = 'STAGED'
    job.lastError = error?.message || String(error)
    await saveJob(job)
    throw error
  }

  job.state = 'UPLOADING'
  job.publishId = init.publishId
  job.initializedAt = Date.now()
  delete job.lastError
  await saveJob(job)

  try {
    await uploadFile({
      uploadUrl: init.uploadUrl,
      job,
      chunkSize: init.chunkSize,
      totalChunkCount: init.totalChunkCount
    })

    job.state = 'PROCESSING'
    job.uploadedAt = Date.now()
    await saveJob(job)
    return job
  } catch (error) {
    // publishId sengaja dipertahankan. Jangan init ulang otomatis karena
    // request terakhir bisa saja sebenarnya sudah diterima TikTok.
    job.state = 'UPLOAD_UNKNOWN'
    job.lastError = error?.message || String(error)
    await saveJob(job)
    throw error
  }
}

export async function fetchPublishStatusById(publishId) {
  const accessToken = await getValidAccessToken()
  const json = await postJson(
    `${API}/v2/post/publish/status/fetch/`,
    accessToken,
    { publish_id: publishId }
  )
  return json.data || {}
}

export async function refreshJobStatus(id) {
  const job = await readJob(id)
  if (!job) throw new Error('Job TikTok tidak ditemukan.')
  if (!job.publishId) return { job, status: null }

  const status = await fetchPublishStatusById(job.publishId)
  const remote = String(status.status || '').toUpperCase()
  job.remoteStatus = remote
  job.remoteFailReason = status.fail_reason || null
  job.publicPostIds = status.publicaly_available_post_id || status.publicly_available_post_id || []

  if (remote === 'PUBLISH_COMPLETE' || remote === 'SEND_TO_USER_INBOX') {
    job.state = 'DONE'
    job.doneAt = Date.now()
    await rm(job.mediaPath || '', { force: true }).catch(() => {})
  } else if (remote === 'FAILED') {
    job.state = 'FAILED'
    job.failedAt = Date.now()
  } else if (job.state === 'UPLOAD_UNKNOWN') {
    job.state = 'PROCESSING'
  }

  await saveJob(job)
  return { job, status }
}

export async function cancelJob(id) {
  const job = await readJob(id)
  if (!job) return false
  if (job.publishId && !['DONE', 'FAILED', 'CANCELLED'].includes(job.state)) {
    try {
      const accessToken = await getValidAccessToken()
      await postJson(`${API}/v2/post/publish/cancel/`, accessToken, { publish_id: job.publishId })
    } catch {}
  }
  job.state = 'CANCELLED'
  job.cancelledAt = Date.now()
  await saveJob(job)
  await rm(job.mediaPath || '', { force: true }).catch(() => {})
  return true
}

export function formatPrivacyOptions(options = []) {
  return options.map((value, index) => `${index + 1}. ${value}`).join('\n') || '-'
}

export function bytesToHuman(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}
