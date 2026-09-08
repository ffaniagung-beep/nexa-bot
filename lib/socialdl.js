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

function id() {
  return (
    Date.now().toString() +
    '_' +
    Math.random()
      .toString(36)
      .slice(2, 8)
  )
}

function sanitize(text) {
  return String(text || 'media')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 90)
}

function findOutput(prefix) {
  if (!fs.existsSync(TMP)) {
    return null
  }

  const files =
    fs.readdirSync(TMP)

  const match =
    files.find(file =>
      file.startsWith(prefix)
    )

  if (!match) {
    return null
  }

  return path.join(
    TMP,
    match
  )
}

async function getInfo(url) {
  try {
    const { stdout } =
      await execFileAsync(
        'yt-dlp',
        [
          '--dump-single-json',
          '--no-playlist',
          '--impersonate',
          'chrome',
          url
        ],
        {
          maxBuffer:
            20 * 1024 * 1024
        }
      )

    return JSON.parse(stdout)
  } catch {
    return {}
  }
}

export async function downloadSocial(
  url,
  platform = 'social'
) {
  ensureTemp()

  const unique =
    id()

  const prefix =
    `${platform}_${unique}`

  const output =
    path.join(
      TMP,
      `${prefix}.%(ext)s`
    )

  const info =
    await getInfo(url)

  try {
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
        output,

        url
      ],
      {
        maxBuffer:
          30 * 1024 * 1024
      }
    )
  } catch (err) {
    const message =
      String(
        err?.stderr ||
        err?.message ||
        err
      )

    if (
      /login|private|sign in/i
        .test(message)
    ) {
      throw new Error(
        'PRIVATE_OR_LOGIN_REQUIRED'
      )
    }

    throw new Error(
      'DOWNLOAD_FAILED'
    )
  }

  const file =
    findOutput(prefix)

  if (!file) {
    throw new Error(
      'OUTPUT_NOT_FOUND'
    )
  }

  return {
    file,

    title:
      sanitize(
        info.title ||
        info.description ||
        platform
      ),

    author:
      info.uploader ||
      info.channel ||
      info.creator ||
      null,

    duration:
      info.duration ||
      null
  }
}

export function sizeMB(file) {
  return (
    fs.statSync(file).size /
    1024 /
    1024
  )
}

export function cleanupSocial(
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
