// NEXA_WAIFUTEST_V11
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  runTool,
  react
} from '../lib/maker-runtime.js'

let running = false

function shortError(error, max = 1200) {
  const raw = String(
    error?.message ||
    error ||
    'unknown error'
  )
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()

  return raw.length <= max
    ? raw
    : raw.slice(0, max) + '\n…(dipotong)'
}

async function withTimeout(promise, ms, onTimeout) {
  let timer

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {}

      reject(
        new Error(
          'WAIFU_TEST_TIMEOUT'
        )
      )
    }, ms)
  })

  try {
    return await Promise.race([
      promise,
      timeout
    ])
  } finally {
    clearTimeout(timer)
  }
}

export default {
  name: 'waifutest',

  aliases: [
    'w2xtest'
  ],

  category: 'OWNER',

  ownerOnly: true,
  hideFromMenu: true,
  menuHidden: true,

  description:
    'Hidden Real-ESRGAN Vulkan smoke test',

  usage:
    '.waifutest',

  async run({
    sock,
    msg,
    jid
  }) {
    if (running) {
      return sock.sendMessage(
        jid,
        {
          text:
            '⏳ *WAIFU TEST* masih berjalan.'
        },
        {
          quoted: msg
        }
      )
    }

    running = true

    const dir = await mkdtemp(
      join(
        tmpdir(),
        'nexa-waifutest-'
      )
    )

    const input = join(
      dir,
      'input.png'
    )

    const output = join(
      dir,
      'output.png'
    )

    const started = Date.now()

    await react(
      sock,
      jid,
      msg,
      '🧪'
    )

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '🧪 *NEXA • WAIFU2X TEST*\n\n' +
            'Real-ESRGAN 2× • input 64×64 • 1 thread • timeout 60 detik.'
        },
        {
          quoted: msg
        }
      )

      await runTool(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=64x64:rate=1',
          '-frames:v',
          '1',
          input
        ],
        10000
      )

      let imported

      try {
        imported = await import(
          'waifu2x'
        )
      } catch (error) {
        throw new Error(
          'WAIFU2X_PACKAGE_MISSING: ' +
          (
            error?.message ||
            error
          )
        )
      }

      const Waifu2x =
        imported?.default

      if (
        !Waifu2x ||
        typeof Waifu2x.upscaleImage !==
          'function'
      ) {
        throw new Error(
          'WAIFU2X_IMPORT_INVALID'
        )
      }

      try {
        Waifu2x.chmod777?.()
      } catch {}

      const task =
        Waifu2x.upscaleImage(
          input,
          output,
          {
            upscaler:
              'real-esrgan',

            scale:
              2,

            threads:
              1
          }
        )

      await withTimeout(
        task,
        60000,
        () => {
          const processes =
            Array.isArray(
              Waifu2x.processes
            )
              ? Waifu2x.processes
              : []

          for (
            const proc
            of processes
          ) {
            try {
              proc?.kill?.(
                'SIGKILL'
              )
            } catch {}
          }
        }
      )

      const info = await stat(
        output
      )

      if (
        !info.isFile() ||
        info.size <= 0
      ) {
        throw new Error(
          'REAL_ESRGAN_OUTPUT_EMPTY'
        )
      }

      const result = await readFile(
        output
      )

      const elapsed =
        Date.now() -
        started

      await react(
        sock,
        jid,
        msg,
        '✅'
      )

      return sock.sendMessage(
        jid,
        {
          document:
            result,

          mimetype:
            'image/png',

          fileName:
            `NEXA-WAIFUTEST-${Date.now()}.png`,

          caption:
            '✅ *NEXA • WAIFU2X TEST BERHASIL*\n\n' +
            'Backend: *Real-ESRGAN NCNN-Vulkan*\n' +
            'Input: *64×64*\n' +
            'Scale: *2×*\n' +
            'Threads: *1*\n' +
            `Waktu: *${(elapsed / 1000).toFixed(2)} detik*\n` +
            `Output: *${Math.round(result.length / 1024)} KiB*`
        },
        {
          quoted: msg,
          mediaUploadTimeoutMs:
            30000
        }
      )
    } catch (error) {
      const elapsed =
        Date.now() -
        started

      await react(
        sock,
        jid,
        msg,
        '❌'
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ *NEXA • WAIFU2X TEST GAGAL*\n\n' +
            `Waktu: *${(elapsed / 1000).toFixed(2)} detik*\n\n` +
            '```' +
            shortError(
              error
            ) +
            '```'
        },
        {
          quoted: msg
        }
      )
    } finally {
      running = false

      await rm(
        dir,
        {
          recursive: true,
          force: true
        }
      ).catch(
        () => {}
      )
    }
  }
}
