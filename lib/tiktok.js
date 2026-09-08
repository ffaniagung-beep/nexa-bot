import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const TMP = './temp'

function ensureTemp() {
  if (!fs.existsSync(TMP)) {
    fs.mkdirSync(TMP, {
      recursive: true
    })
  }
}

function sanitize(text) {
  return String(text || 'tiktok')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 70)
}

function validTikTok(url) {
  try {
    const parsed = new URL(url)

    return (
      parsed.hostname === 'tiktok.com' ||
      parsed.hostname.endsWith('.tiktok.com')
    )
  } catch {
    return false
  }
}

async function downloadUrl(url, output) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
    }
  })

  if (!response.ok) {
    throw new Error(
      `Media server HTTP ${response.status}`
    )
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    )

  fs.writeFileSync(
    output,
    buffer
  )

  return output
}

// =====================================
// PROVIDER 1 — API
// =====================================

async function apiProvider(url) {
  const endpoint =
    'https://tdownv4.sl-bjs.workers.dev/?down=' +
    encodeURIComponent(url)

  const response =
    await fetch(endpoint, {
      headers: {
        accept: 'application/json'
      }
    })

  if (!response.ok) {
    throw new Error(
      `Provider API HTTP ${response.status}`
    )
  }

  const data =
    await response.json()

  if (!data?.download_url) {
    throw new Error(
      'Provider tidak mengembalikan video.'
    )
  }

  ensureTemp()

  const id =
    data.video_id ||
    Date.now()

  const file =
    path.join(
      TMP,
      `tiktok_${id}.mp4`
    )

  await downloadUrl(
    data.download_url,
    file
  )

  return {
    file,

    title:
      sanitize(
        data.title ||
        'TikTok'
      ),

    author:
      data.author?.username ||
      data.author?.nickname ||
      null,

    provider: 'api'
  }
}

// =====================================
// PROVIDER 2 — YT-DLP FALLBACK
// =====================================

async function ytDlpProvider(
  url
) {
  ensureTemp()

  const id =
    Date.now()

  const template =
    path.join(
      TMP,
      `tiktok_${id}.%(ext)s`
    )

  await execFileAsync(
    'yt-dlp',
    [
      '--no-playlist',
      '--impersonate',
      'chrome',

      '-f',
      'bv*+ba/b',

      '--merge-output-format',
      'mp4',

      '-o',
      template,

      url
    ],
    {
      maxBuffer:
        20 * 1024 * 1024
    }
  )

  const files =
    fs.readdirSync(TMP)

  const match =
    files.find(name =>
      name.startsWith(
        `tiktok_${id}.`
      )
    )

  if (!match) {
    throw new Error(
      'yt-dlp tidak menghasilkan file.'
    )
  }

  return {
    file:
      path.join(
        TMP,
        match
      ),

    title:
      'TikTok',

    author:
      null,

    provider:
      'yt-dlp'
  }
}

// =====================================
// MAIN
// =====================================

export async function downloadTikTok(
  url
) {
  if (!validTikTok(url)) {
    throw new Error(
      'INVALID_TIKTOK_URL'
    )
  }

  const errors = []

  try {
    return await apiProvider(
      url
    )
  } catch (err) {
    errors.push(
      `API: ${err.message}`
    )
  }

  try {
    return await ytDlpProvider(
      url
    )
  } catch (err) {
    errors.push(
      `yt-dlp: ${err.message}`
    )
  }

  console.error(
    'TikTok providers gagal:',
    errors
  )

  throw new Error(
    'ALL_PROVIDERS_FAILED'
  )
}

export function getTikTokSizeMB(
  file
) {
  const stat =
    fs.statSync(file)

  return (
    stat.size /
    1024 /
    1024
  )
}

export function cleanupTikTok(
  file
) {
  try {
    if (
      file &&
      fs.existsSync(file)
    ) {
      fs.unlinkSync(file)
    }
  } catch {}
}
