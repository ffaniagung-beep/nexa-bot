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

function extractId(url) {
  const patterns = [
    /\/file\/d\/([^/]+)/i,
    /[?&]id=([^&]+)/i,
    /\/d\/([^/]+)/i
  ]

  for (const pattern of patterns) {
    const match =
      String(url)
        .match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function filenameFromHeader(
  header
) {
  if (!header) {
    return null
  }

  const utf =
    header.match(
      /filename\*=UTF-8''([^;]+)/i
    )

  if (utf?.[1]) {
    try {
      return decodeURIComponent(
        utf[1]
      )
    } catch {}
  }

  const normal =
    header.match(
      /filename="?([^"]+)"?/i
    )

  return normal?.[1] || null
}

export async function downloadGDrive(
  url,
  maxMB = 50
) {
  ensureTemp()

  const fileId =
    extractId(url)

  if (!fileId) {
    throw new Error(
      'INVALID_GDRIVE'
    )
  }

  const direct =
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`

  const response =
    await fetch(
      direct,
      {
        redirect:
          'follow'
      }
    )

  if (!response.ok) {
    throw new Error(
      `HTTP_${response.status}`
    )
  }

  const type =
    response.headers
      .get('content-type') ||
    ''

  if (
    type.includes('text/html')
  ) {
    throw new Error(
      'GDRIVE_PERMISSION'
    )
  }

  const length =
    Number(
      response.headers
        .get('content-length') ||
      0
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

  const disposition =
    response.headers
      .get(
        'content-disposition'
      )

  const filename =
    filenameFromHeader(
      disposition
    ) ||
    `gdrive_${fileId}`

  const safe =
    filename.replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      '_'
    )

  const file =
    path.join(
      TMP,
      safe
    )

  fs.writeFileSync(
    file,
    buffer
  )

  return {
    file,
    filename: safe,
    size:
      buffer.length
  }
}

export function cleanupGDrive(
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
