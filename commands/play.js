import axios from 'axios'

const API_URL =
  'https://api.ikyyxd.my.id/search/ytplayv2'

function formatDuration(value) {
  const total =
    Math.max(
      0,
      Number(value) || 0
    )

  const minutes =
    Math.floor(total / 60)

  const seconds =
    Math.floor(total % 60)
      .toString()
      .padStart(2, '0')

  return `${minutes}:${seconds}`
}

function clean(value, max = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export default {
  name: 'play',

  aliases: [
    'song',
    'music'
  ],

  category:
    'DOWNLOADER',

  description:
    'Cari dan putar audio dari YouTube',

  usage:
    '.play <judul / url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const query =
      args.join(' ').trim()

    if (!query) {
      await sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • PLAY*\n\n` +
            `Masukkan judul lagu atau link YouTube.\n\n` +
            `Contoh:\n` +
            `${config?.prefix || '.'}play judul lagu`
        },
        {
          quoted: msg
        }
      )

      return
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            `✦ *NEXA • PLAY*\n\n` +
            `⌕ Sedang mencari audio...\n` +
            `NEXA lagi menyiapkan pilihanmu. Mohon tunggu sebentar 🎧`
        },
        {
          quoted: msg
        }
      )

      const {
        data
      } =
        await axios.get(
          API_URL,
          {
            params: {
              q: query
            },

            timeout:
              30_000,

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                'NEXA-BOT/1.0'
            }
          }
        )

      if (
        !data?.status ||
        !data?.result
      ) {
        await sock.sendMessage(
          jid,
          {
            text:
              `✦ *NEXA • PLAY*\n\n` +
              `Audio tidak ditemukan.\n` +
              `Coba judul atau link lain.`
          },
          {
            quoted: msg
          }
        )

        return
      }

      const res =
        data.result

      const title =
        clean(
          res.title ||
          'Unknown Title',
          180
        )

      const duration =
        formatDuration(
          res.duration
        )

      const source =
        clean(
          res.source ||
          '',
          500
        )

      const thumbnail =
        res.thumbnail

      const audioUrl =
        res.audio?.url

      if (!audioUrl) {
        console.error(
          '[PLAY] Bentuk response API:',
          JSON.stringify(
            data,
            null,
            2
          ).slice(0, 5000)
        )

        throw new Error(
          'AUDIO_URL_NOT_FOUND'
        )
      }

      const info =
        [
          '✦ *NEXA • PLAY*',
          '',
          `♫ *${title}*`,
          `⏱ ${duration}`,
          source
            ? `🔗 ${source}`
            : null,
          '',
          'Audio siap diputar 🎧'
        ]
          .filter(Boolean)
          .join('\n')

      if (
        typeof thumbnail === 'string' &&
        /^https?:\/\//i.test(thumbnail)
      ) {
        try {
          await sock.sendMessage(
            jid,
            {
              image: {
                url: thumbnail
              },

              caption:
                info
            },
            {
              quoted: msg,

              mediaUploadTimeoutMs:
                30_000
            }
          )
        } catch (thumbError) {
          console.error(
            '[PLAY] Thumbnail gagal:',
            thumbError?.message ||
            thumbError
          )

          await sock.sendMessage(
            jid,
            {
              text:
                info
            },
            {
              quoted: msg
            }
          )
        }
      } else {
        await sock.sendMessage(
          jid,
          {
            text:
              info
          },
          {
            quoted: msg
          }
        )
      }

      await sock.sendMessage(
        jid,
        {
          audio: {
            url: audioUrl
          },

          mimetype:
            res.audio?.mimetype ||
            'audio/mpeg',

          fileName:
            `${title
              .replace(
                /[\\/:*?"<>|]+/g,
                ''
              )
              .slice(0, 80) || 'NEXA-PLAY'
            }.mp3`,

          ptt:
            false
        },
        {
          quoted: msg,

          mediaUploadTimeoutMs:
            60_000
        }
      )

      console.log(
        '✅ PLAY:',
        title
      )
    } catch (err) {
      console.error(
        '[PLAY]',
        err
      )

      let detail =
        'Gagal memproses audio. Coba lagi beberapa saat nanti.'

      if (
        err?.code ===
        'ECONNABORTED'
      ) {
        detail =
          'Server audio terlalu lama merespons. Coba lagi sebentar.'
      } else if (
        err?.message ===
        'AUDIO_URL_NOT_FOUND'
      ) {
        detail =
          'API merespons, tapi link audio tidak ditemukan.'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *NEXA • PLAY*\n\n` +
            detail
        },
        {
          quoted: msg
        }
      )
    }
  }
}
