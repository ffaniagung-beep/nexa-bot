import { spawn } from 'node:child_process'

export function runTool(program, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false
    const timer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL') }, timeout)
    proc.stdout.on('data', b => { stdout = (stdout + b).slice(-65536) })
    proc.stderr.on('data', b => { stderr = (stderr + b).slice(-8192) })
    proc.on('error', err => { clearTimeout(timer); reject(err) })
    proc.on('close', code => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error('PROCESS_TIMEOUT'))
      if (code !== 0) return reject(new Error(`${program}: ${stderr || code}`))
      resolve(stdout)
    })
  })
}

// Keep the deadline active through response-body consumption, not just headers.
export async function fetchBuffered(url, options = {}, timeout = 35000, maxBytes = 16 * 1024 * 1024) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('NETWORK_TIMEOUT')), timeout)
  let reader
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP_${res.status}`)
    if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('RESULT_TOO_LARGE')
    reader = res.body?.getReader()
    if (!reader) throw new Error('EMPTY_RESPONSE')
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('RESULT_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
    return new Response(Buffer.concat(chunks), { status: res.status, headers: res.headers })
  } finally {
    clearTimeout(timer)
    controller.abort()
    if (reader) await reader.cancel().catch(() => {})
  }
}

let active = 0
export function acquireMaker() {
  if (active >= 2) return null
  active++
  let released = false
  return () => { if (!released) { released = true; active-- } }
}

// A reaction is cosmetic: its failure must not turn a delivered result into an error.
export function react(sock, jid, msg, text) {
  Promise.resolve().then(() => sock.sendMessage(jid, { react: { text, key: msg.key } })).catch(() => {})
}

export async function stage(name, fn) {
  const start = Date.now()
  console.log(`[MAKER] ${name} start`)
  try {
    const result = await fn()
    console.log(`[MAKER] ${name} ok ${Date.now() - start}ms`)
    return result
  } catch (err) {
    console.error(`[MAKER] ${name} failed ${Date.now() - start}ms:`, err?.code || err?.message)
    err.makerStage = name
    throw err
  }
}

export function failureText(err) {
  const code = String(err?.code || err?.message || '')
  if (/ENOENT/.test(code)) return 'Alat konversi belum tersedia. Owner perlu cek FFmpeg/curl.'
  if (/TOO_LARGE|PIXEL_LIMIT/.test(code)) return 'Gambar terlalu besar. Coba kirim versi berukuran lebih kecil.'
  if (/timeout|timed out|abort/i.test(code)) return 'Batas waktu proses tercapai. Coba lagi dengan gambar lebih kecil atau koneksi lebih stabil.'
  if (/REUPLOAD|404|410/.test(code)) return 'Media tidak tersedia lagi. Kirim ulang foto atau stikernya, lalu coba lagi.'
  return 'Proses gagal. Coba kirim ulang medianya; owner bisa cek log [MAKER].'
}
