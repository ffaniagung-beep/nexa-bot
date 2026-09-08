import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

import {
  spawn
} from 'child_process'

import {
  imageToSticker,
  safeDelete
} from './maker.js'

// =====================================
// NEXA BRAT MAKER
// =====================================

const TEMP_DIR =
  path.resolve('./temp')

const CANVAS_SIZE =
  512

const MAX_TEXT_LENGTH =
  300

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

function randomFile(
  ext
) {
  ensureTemp()

  return path.join(
    TEMP_DIR,
    `brat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  )
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
      const proc =
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

      proc.stderr.on(
        'data',
        data => {
          errorText +=
            data.toString()
        }
      )

      proc.on(
        'error',
        err => {
          reject(
            err
          )
        }
      )

      proc.on(
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
// TEXT CLEANER
// =====================================

function cleanText(
  text
) {
  return String(
    text || ''
  )
    .replace(
      /\r/g,
      ''
    )
    .replace(
      /\t/g,
      ' '
    )
    .replace(
      /[ ]{2,}/g,
      ' '
    )
    .trim()
    .slice(
      0,
      MAX_TEXT_LENGTH
    )
}

// =====================================
// SPLIT LONG WORD
// =====================================

function splitLongWord(
  word,
  maxChars
) {
  const parts = []

  let remaining =
    String(word)

  while (
    remaining.length >
    maxChars
  ) {
    parts.push(
      remaining.slice(
        0,
        maxChars
      )
    )

    remaining =
      remaining.slice(
        maxChars
      )
  }

  if (
    remaining.length
  ) {
    parts.push(
      remaining
    )
  }

  return parts
}

// =====================================
// WORD WRAP
// =====================================

function wrapParagraph(
  paragraph,
  maxChars
) {
  const words =
    String(paragraph)
      .trim()
      .split(/\s+/)
      .filter(Boolean)

  if (
    !words.length
  ) {
    return ['']
  }

  const lines = []

  let current =
    ''

  for (
    const originalWord
    of words
  ) {
    const chunks =
      originalWord.length >
      maxChars
        ? splitLongWord(
            originalWord,
            maxChars
          )
        : [
            originalWord
          ]

    for (
      const word
      of chunks
    ) {
      const candidate =
        current
          ? `${current} ${word}`
          : word

      if (
        candidate.length <=
        maxChars
      ) {
        current =
          candidate

        continue
      }

      if (
        current
      ) {
        lines.push(
          current
        )
      }

      current =
        word
    }
  }

  if (
    current
  ) {
    lines.push(
      current
    )
  }

  return lines
}

function wrapText(
  text,
  maxChars
) {
  const paragraphs =
    String(text)
      .split('\n')

  const output = []

  for (
    const paragraph
    of paragraphs
  ) {
    if (
      !paragraph.trim()
    ) {
      output.push('')
      continue
    }

    output.push(
      ...wrapParagraph(
        paragraph,
        maxChars
      )
    )
  }

  return output
}

// =====================================
// AUTO FONT
// =====================================

function estimateCharsPerLine(
  fontSize
) {
  /*
   * Estimasi lebar karakter font sans-serif.
   * Kita sisakan margin sekitar 25px kiri/kanan.
   */

  const usableWidth =
    CANVAS_SIZE - 50

  const averageCharWidth =
    fontSize * 0.56

  return Math.max(
    5,
    Math.floor(
      usableWidth /
      averageCharWidth
    )
  )
}

function findLayout(
  text
) {
  /*
   * Coba font besar dulu.
   * Kalau teks kepanjangan / kebanyakan baris,
   * turun sampai muat.
   */

  for (
    let fontSize = 92;
    fontSize >= 26;
    fontSize -= 2
  ) {
    const maxChars =
      estimateCharsPerLine(
        fontSize
      )

    const lines =
      wrapText(
        text,
        maxChars
      )

    const lineSpacing =
      Math.max(
        4,
        Math.round(
          fontSize * 0.12
        )
      )

    const estimatedHeight =
      (
        lines.length *
        fontSize
      ) +
      (
        Math.max(
          0,
          lines.length - 1
        ) *
        lineSpacing
      )

    const longestLine =
      lines.reduce(
        (
          longest,
          line
        ) =>
          Math.max(
            longest,
            line.length
          ),
        0
      )

    const estimatedWidth =
      longestLine *
      fontSize *
      0.56

    if (
      estimatedHeight <=
        440 &&
      estimatedWidth <=
        465 &&
      lines.length <=
        10
    ) {
      return {
        fontSize,
        lineSpacing,
        lines
      }
    }
  }

  /*
   * Fallback buat teks super panjang.
   */

  const fontSize =
    24

  return {
    fontSize,

    lineSpacing:
      4,

    lines:
      wrapText(
        text,
        estimateCharsPerLine(
          fontSize
        )
      ).slice(
        0,
        12
      )
  }
}

// =====================================
// DRAW TEXT FILE PATH
// =====================================

function escapeFilterPath(
  filePath
) {
  return String(
    filePath
  )
    .replace(
      /\\/g,
      '\\\\'
    )
    .replace(
      /:/g,
      '\\:'
    )
    .replace(
      /'/g,
      "\\'"
    )
}

// =====================================
// CREATE BRAT
// =====================================

export async function createBratSticker(
  text
) {
  const cleaned =
    cleanText(
      text
    )

  if (
    !cleaned
  ) {
    throw new Error(
      'EMPTY_TEXT'
    )
  }

  const png =
    randomFile(
      'png'
    )

  const textFile =
    randomFile(
      'txt'
    )

  let stickerResult =
    null

  try {
    const layout =
      findLayout(
        cleaned
      )

    const finalText =
      layout.lines
        .join('\n')

    fs.writeFileSync(
      textFile,
      finalText,
      'utf8'
    )

    const escapedTextFile =
      escapeFilterPath(
        textFile
      )

    /*
     * BRAT:
     *
     * White background
     * Black text
     * Auto wrap
     * Auto font size
     * Centered
     */

    const filter =
      [
        'drawtext=' +
        `font='sans-serif':` +
        `textfile='${escapedTextFile}':` +
        `fontcolor=black:` +
        `fontsize=${layout.fontSize}:` +
        `line_spacing=${layout.lineSpacing}:` +
        `x=(w-text_w)/2:` +
        `y=(h-text_h)/2`
      ].join('')

    await runFFmpeg([
      '-y',

      '-f',
      'lavfi',

      '-i',
      `color=c=white:s=${CANVAS_SIZE}x${CANVAS_SIZE}:d=1`,

      '-vf',
      filter,

      '-frames:v',
      '1',

      png
    ])

    const imageBuffer =
      fs.readFileSync(
        png
      )

    stickerResult =
      await imageToSticker(
        imageBuffer
      )

    return {
      buffer:
        stickerResult.buffer,

      cleanup() {
        safeDelete(
          png,
          textFile
        )

        try {
          stickerResult
            ?.cleanup()
        } catch {}
      }
    }
  } catch (err) {
    safeDelete(
      png,
      textFile
    )

    try {
      stickerResult
        ?.cleanup()
    } catch {}

    throw err
  }
}
