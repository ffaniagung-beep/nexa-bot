import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execFileAsync =
  promisify(execFile)

const TMP =
  './temp'

// =====================================
// TEMP
// =====================================

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

function sanitizeName(name) {
  return String(name || 'media')
    .replace(
      /[<>:"/\\|?*\x00-\x1F]/g,
      '_'
    )
    .slice(0, 80)
}

function uniqueId() {
  return (
    Date.now().toString() +
    '_' +
    Math.random()
      .toString(36)
      .slice(2, 8)
  )
}

// =====================================
// INFO
// =====================================

export async function getInfo(url) {
  const {
    stdout
  } =
    await execFileAsync(
      'yt-dlp',
      [
        '--dump-single-json',
        '--no-playlist',
        url
      ],
      {
        maxBuffer:
          20 * 1024 * 1024
      }
    )

  return JSON.parse(stdout)
}

// =====================================
// AUDIO / MP3
// =====================================

export async function downloadAudio(
  url
) {
  ensureTemp()

  const info =
    await getInfo(url)

  const id =
    uniqueId()

  const title =
    sanitizeName(
      info.title
    )

  const output =
    path.join(
      TMP,
      `${id}.%(ext)s`
    )

  await execFileAsync(
    'yt-dlp',
    [
      '--no-playlist',

      '-x',

      '--audio-format',
      'mp3',

      '--audio-quality',
      '5',

      '-o',
      output,

      url
    ],
    {
      maxBuffer:
        30 * 1024 * 1024
    }
  )

  const file =
    path.join(
      TMP,
      `${id}.mp3`
    )

  if (!fs.existsSync(file)) {
    throw new Error(
      'File audio tidak ditemukan setelah download.'
    )
  }

  return {
    file,
    title,
    info
  }
}

// =====================================
// VIDEO / YOUTUBE
//
// yt-dlp download source dulu.
// Setelah itu FFmpeg convert menjadi:
//
// H.264
// AAC
// yuv420p
// MP4 faststart
//
// Supaya kompatibel WhatsApp.
// =====================================

export async function downloadVideo(
  url
) {
  ensureTemp()

  const info =
    await getInfo(url)

  const id =
    uniqueId()

  const title =
    sanitizeName(
      info.title
    )

  // Source bebas codec/container
  const sourceTemplate =
    path.join(
      TMP,
      `${id}_source.%(ext)s`
    )

  // ================================
  // DOWNLOAD SOURCE
  //
  // Maksimal sekitar 720p biar
  // proses Termux nggak terlalu berat.
  // ================================

  await execFileAsync(
    'yt-dlp',
    [
      '--no-playlist',

      '-f',
      'bv*[height<=720]+ba/b[height<=720]/best',

      '--merge-output-format',
      'mkv',

      '-o',
      sourceTemplate,

      url
    ],
    {
      maxBuffer:
        30 * 1024 * 1024
    }
  )

  // ================================
  // CARI FILE SOURCE
  // ================================

  const files =
    fs.readdirSync(TMP)

  const sourceName =
    files.find(name =>
      name.startsWith(
        `${id}_source.`
      )
    )

  if (!sourceName) {
    throw new Error(
      'File video sumber tidak ditemukan.'
    )
  }

  const sourceFile =
    path.join(
      TMP,
      sourceName
    )

  const outputFile =
    path.join(
      TMP,
      `${id}.mp4`
    )

  try {
    // ================================
    // WHATSAPP COMPATIBLE TRANSCODE
    // ================================

    await execFileAsync(
      'ffmpeg',
      [
        '-y',

        '-i',
        sourceFile,

        // Video codec
        '-c:v',
        'libx264',

        // Cepat di HP/Termux
        '-preset',
        'veryfast',

        // Balance kualitas/ukuran
        '-crf',
        '24',

        // Format pixel paling kompatibel
        '-pix_fmt',
        'yuv420p',

        // Maksimal 720p
        '-vf',
        'scale=min(1280\\,iw):-2',

        // Audio
        '-c:a',
        'aac',

        '-b:a',
        '128k',

        // MP4 metadata di depan file
        '-movflags',
        '+faststart',

        outputFile
      ],
      {
        maxBuffer:
          50 * 1024 * 1024
      }
    )
  } finally {
    // Source mentah nggak diperlukan lagi
    try {
      if (
        fs.existsSync(
          sourceFile
        )
      ) {
        fs.unlinkSync(
          sourceFile
        )
      }
    } catch {}
  }

  if (
    !fs.existsSync(
      outputFile
    )
  ) {
    throw new Error(
      'FFmpeg gagal menghasilkan video MP4.'
    )
  }

  return {
    file:
      outputFile,

    title,
    info
  }
}

// =====================================
// FILE SIZE
// =====================================

export function getFileSizeMB(
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

// =====================================
// CLEANUP
// =====================================

export function cleanup(
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
