import fs from 'fs'
import path from 'path'

const TMP =
  './temp'

function ensureTemp() {
  if (!fs.existsSync(TMP)) {
    fs.mkdirSync(
      TMP,
      {
        recursive: true
      }
    )
  }
}

function decodeHtml(text) {
  return String(text)
    .replaceAll(
      '&amp;',
      '&'
    )
    .replaceAll(
      '&#39;',
      "'"
    )
    .replaceAll(
      '&quot;',
      '"'
    )
}

function extractDirect(html) {
  const patterns = [
    /id="downloadButton"[^>]+href="([^"]+)"/i,
    /href="([^"]+)"[^>]+id="downloadButton"/i,
    /aria-label="Download file"[^>]+href="([^"]+)"/i
  ]

  for (const pattern of patterns) {
    const match =
      html.match(pattern)

    if (match?.[1]) {
      return decodeHtml(
        match[1]
      )
    }
  }

  return null
}

function filenameFromUrl(url) {
  try {
    const parsed =
      new URL(url)

    const part =
      parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop()

    return decodeURIComponent(
      part ||
      `mediafire_${Date.now()}`
    )
  } catch {
    return `mediafire_${Date.now()}`
  }
}

export async function downloadMediaFire(
  url,
  maxMB = 50
) {
  ensureTemp()

  const page =
    await fetch(
      url,
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
        }
      }
    )

  if (!page.ok) {
    throw new Error(
      `PAGE_HTTP_${page.status}`
    )
  }

  const html =
    await page.text()

  const direct =
    extractDirect(html)

  if (!direct) {
    throw new Error(
      'DIRECT_NOT_FOUND'
    )
  }

  const response =
    await fetch(
      direct,
      {
        redirect:
          'follow',

        headers: {
          'user-agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
        }
      }
    )

  if (!response.ok) {
    throw new Error(
      `FILE_HTTP_${response.status}`
    )
  }

  const length =
    Number(
      response.headers
        .get(
          'content-length'
        ) || 0
    )

  if (
    length >
    maxMB *
      1024 *
      1024
  ) {
    throw new Error(
      'FILE_TOO_LARGE'
    )
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    )

  if (
    buffer.length >
    maxMB *
      1024 *
      1024
  ) {
    throw new Error(
      'FILE_TOO_LARGE'
    )
  }

  const name =
    filenameFromUrl(
      response.url ||
      direct
    )
      .replace(
        /[<>:"/\\|?*\x00-\x1F]/g,
        '_'
      )

  const file =
    path.join(
      TMP,
      name
    )

  fs.writeFileSync(
    file,
    buffer
  )

  return {
    file,
    filename:
      name,
    size:
      buffer.length
  }
}

export function cleanupMediaFire(
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
