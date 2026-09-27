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
  react,
  stage
} from '../lib/maker-runtime.js'

import {
  getMediaSource,
  downloadMedia
} from '../lib/maker-media.js'

import {
  acquireTikTokTask,
  postTikTokVideo
} from '../lib/tiktok-studio.js'

export default {
  name: 'tiktokpost',

  aliases: [
    'ttpost',
    'posttiktok'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Post video langsung lewat TikTok Studio Web',

  usage:
    '.tiktokpost <caption> (reply video)',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const source =
      getMediaSource(
        msg,
        sock
      )

    if (
      source?.type !==
      'video'
    ) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🎬 Reply video pakai *${config?.prefix || '.'}tiktokpost <caption>*\n\n` +
            'Contoh:\n' +
            '*.tiktokpost tes upload dari NEXA 🗿 #fyp*'
        },
        {
          quoted: msg
        }
      )
    }

    const release =
      acquireTikTokTask()

    if (!release) {
      return sock.sendMessage(
        jid,
        {
          text:
            '🗿 TikTok Studio lagi kerja. Jangan disuruh upload dua video sekaligus 😭'
        },
        {
          quoted: msg
        }
      )
    }

    const caption =
      (args || [])
        .join(' ')
        .trim()

    let dir

    react(
      sock,
      jid,
      msg,
      '⏳'
    )

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK POST*\n\n' +
            '🎬 Videonya gue ambil dulu...\n' +
            'Abis itu gue lempar ke TikTok Studio dan pencet Post 😭🗿'
        },
        {
          quoted: msg
        }
      )

      const buffer =
        await stage(
          'tiktokpost/download',
          () =>
            downloadMedia(
              source,
              sock
            )
        )

      dir =
        await mkdtemp(
          join(
            tmpdir(),
            'nexa-tiktok-'
          )
        )

      const filePath =
        join(
          dir,
          'upload.mp4'
        )

      await writeFile(
        filePath,
        buffer
      )

      const result =
        await stage(
          'tiktokpost/studio',
          () =>
            postTikTokVideo({
              filePath,
              caption,
              onStatus:
                async status => {
                  console.log(
                    '[TIKTOK_POST]',
                    status
                  )
                }
            })
        )

      react(
        sock,
        jid,
        msg,
        '✅'
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • TIKTOK POST*\n\n' +
            '✅ Tombol *Post* udah kepencet dari TikTok Studio 🔥\n' +
            `📡 Signal: *${result.signal}*\n` +
            (
              caption
                ? `📝 Caption: ${caption.slice(0, 500)}`
                : '📝 Caption: *(kosong)*'
            ) +
            '\n\n🗿 Tinggal cek akun TikTok owner buat mastiin postingannya tampil sesuai pengaturan akun.'
        },
        {
          quoted: msg
        }
      )
    } catch (error) {
      react(
        sock,
        jid,
        msg,
        '❌'
      )

      const code =
        String(
          error?.message ||
          error
        )

      let text =
        '✦ *NEXA • TIKTOK POST*\n\n' +
        '❌ TikTok Studio ngambek 😭\n' +
        `🧩 ${code.slice(0, 260)}`

      if (
        code.includes(
          'TIKTOK_LOGIN_REQUIRED'
        ) ||
        code.includes(
          'TIKTOK_LOGIN_NOT_PERSISTED'
        )
      ) {
        text =
          '🔐 Sesi TikTok belum ada / udah expired.\n' +
          'Jalankan *.tiktoklogin* dulu, scan QR, baru upload lagi 🗿.'
      } else if (
        code.includes(
          'TIKTOK_CHALLENGE'
        )
      ) {
        text =
          '🧩 TikTok minta CAPTCHA / verifikasi keamanan.\n' +
          'NEXA berhenti di sini—verifikasi itu harus diselesaikan secara normal 😭.'
      } else if (
        code.includes(
          'TIKTOK_UPLOAD_INPUT_NOT_FOUND'
        ) ||
        code.includes(
          'TIKTOK_CAPTION_INPUT_NOT_FOUND'
        ) ||
        code.includes(
          'TIKTOK_POST_BUTTON_NOT_FOUND'
        )
      ) {
        text =
          '🗿 Layout TikTok Studio kayaknya berubah.\n' +
          'Browser berhasil masuk, tapi selector upload/caption/Post udah nggak ketemu 😭.\n' +
          `🧩 ${code}`
      } else if (
        code.includes(
          'TIKTOK_POST_STILL_DISABLED'
        )
      ) {
        text =
          '⌛ Video udah masuk Studio, tapi tombol *Post* nggak aktif sampai timeout 😭.\n' +
          'Biasanya ada processing/check/modal TikTok yang belum selesai.'
      } else if (
        code.includes(
          'TIKTOK_BROWSER'
        )
      ) {
        text =
          '🌐 Chromium server gagal nyala 😭\n' +
          'Cek *@sparticuz/chromium* + *puppeteer-core* di Ptero.'
      }

      await sock.sendMessage(
        jid,
        {
          text
        },
        {
          quoted: msg
        }
      )
    } finally {
      try {
        if (dir) {
          await rm(
            dir,
            {
              recursive: true,
              force: true
            }
          )
        }
      } catch {}

      release()
    }
  }
}
