// NEXA HD+ AI V1
import {
  mkdtemp,
  writeFile,
  rm
} from 'node:fs/promises'

import {
  tmpdir
} from 'node:os'

import {
  join
} from 'node:path'

import {
  fal
} from '@fal-ai/client'

import {
  fetchBuffered
} from './maker-runtime.js'

const MAX_INPUT_BYTES =
  16 * 1024 * 1024

const MAX_OUTPUT_BYTES =
  32 * 1024 * 1024

const FAL_UPLOAD_TIMEOUT =
  90 * 1000

const FAL_INFERENCE_TIMEOUT =
  5 * 60 * 1000

const FAL_DOWNLOAD_TIMEOUT =
  90 * 1000

function timeoutPromise(
  promise,
  timeout,
  code
) {
  let timer

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(
          new Error(code)
        ),
        timeout
      )

      timer.unref?.()
    })
  ]).finally(() => {
    clearTimeout(timer)
  })
}

function detectImage(buffer) {
  if (
    buffer?.[0] === 0x89 &&
    buffer?.[1] === 0x50 &&
    buffer?.[2] === 0x4e &&
    buffer?.[3] === 0x47
  ) {
    return {
      mime: 'image/png',
      ext: 'png'
    }
  }

  if (
    buffer?.[0] === 0xff &&
    buffer?.[1] === 0xd8
  ) {
    return {
      mime: 'image/jpeg',
      ext: 'jpg'
    }
  }

  if (
    buffer?.slice(0, 4)
      .toString() === 'RIFF' &&
    buffer?.slice(8, 12)
      .toString() === 'WEBP'
  ) {
    return {
      mime: 'image/webp',
      ext: 'webp'
    }
  }

  return {
    mime: 'application/octet-stream',
    ext: 'img'
  }
}

function isPng(buffer) {
  return Boolean(
    buffer?.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

function normalizeScale(value) {
  return Number(value) === 4
    ? 4
    : 2
}

function normalizeMode(value) {
  return String(value || '')
    .trim()
    .toLowerCase() === 'photo'
    ? 'photo'
    : 'anime'
}

function modelFor(mode) {
  return mode === 'photo'
    ? 'RealESRGAN_x4plus'
    : 'RealESRGAN_x4plus_anime_6B'
}

export async function enhancePhotoPlusAI(
  buffer,
  {
    scale = 2,
    mode = 'anime'
  } = {}
) {
  if (!buffer?.length) {
    throw new Error('EMPTY_IMAGE')
  }

  if (
    buffer.length >
    MAX_INPUT_BYTES
  ) {
    throw new Error('MEDIA_TOO_LARGE')
  }

  const key =
    String(
      process.env.FAL_KEY || ''
    ).trim()

  if (!key) {
    throw new Error(
      'FAL_KEY_MISSING'
    )
  }

  fal.config({
    credentials: key
  })

  const inputType =
    detectImage(buffer)

  const finalScale =
    normalizeScale(scale)

  const finalMode =
    normalizeMode(mode)

  const model =
    modelFor(finalMode)

  const inputFile =
    new File(
      [buffer],
      `nexa-hdplus-input.${inputType.ext}`,
      {
        type: inputType.mime
      }
    )

  const imageUrl =
    await timeoutPromise(
      fal.storage.upload(
        inputFile
      ),
      FAL_UPLOAD_TIMEOUT,
      'FAL_UPLOAD_TIMEOUT'
    )

  const result =
    await timeoutPromise(
      fal.subscribe(
        'fal-ai/esrgan',
        {
          input: {
            image_url:
              imageUrl,
            scale:
              finalScale,
            model,
            output_format:
              'png'
          },
          logs: false
        }
      ),
      FAL_INFERENCE_TIMEOUT,
      'FAL_INFERENCE_TIMEOUT'
    )

  const image =
    result?.data?.image

  const outputUrl =
    String(
      image?.url || ''
    ).trim()

  if (!outputUrl) {
    throw new Error(
      'FAL_OUTPUT_MISSING'
    )
  }

  const response =
    await fetchBuffered(
      outputUrl,
      {},
      FAL_DOWNLOAD_TIMEOUT,
      MAX_OUTPUT_BYTES
    )

  const output =
    Buffer.from(
      await response
        .arrayBuffer()
    )

  if (!output.length) {
    throw new Error(
      'HDPLUS_OUTPUT_EMPTY'
    )
  }

  if (!isPng(output)) {
    throw new Error(
      'HDPLUS_OUTPUT_NOT_PNG'
    )
  }

  const dir =
    await mkdtemp(
      join(
        tmpdir(),
        'nexa-hdplus-ai-'
      )
    )

  const path =
    join(
      dir,
      'NEXA-HD+.png'
    )

  const cleanup =
    () => rm(
      dir,
      {
        recursive: true,
        force: true
      }
    )

  try {
    await writeFile(
      path,
      output
    )
  } catch (error) {
    await cleanup()
    throw error
  }

  return {
    buffer: output,
    path,
    width:
      Number(image?.width) ||
      null,
    height:
      Number(image?.height) ||
      null,
    fileSize:
      output.length,
    scale:
      finalScale,
    mode:
      finalMode,
    model,
    requestId:
      result?.requestId ||
      null,
    cleanup
  }
}
