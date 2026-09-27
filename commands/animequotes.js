// NEXA ANIME QUOTES • ZYVOR V1
const API_URL =
  'https://api.zyvor.my.id/api/fun/anime-quotes'

const API_TIMEOUT =
  15 * 1000

async function getAnimeQuote() {
  const response =
    await fetch(
      API_URL,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
          'Accept':
            'application/json',
          'User-Agent':
            'NEXA-BOT/1.0'
        },

        body:
          JSON.stringify({}),

        signal:
          AbortSignal.timeout(
            API_TIMEOUT
          )
      }
    )

  if (!response.ok) {
    throw new Error(
      `ANIME_QUOTES_HTTP_${response.status}`
    )
  }

  const raw =
    await response.text()

  let data

  try {
    data =
      JSON.parse(raw)
  } catch {
    throw new Error(
      'ANIME_QUOTES_BAD_JSON'
    )
  }

  const result =
    data?.result

  const quote =
    String(
      result?.quote || ''
    ).trim()

  const character =
    String(
      result?.character || ''
    ).trim()

  const anime =
    String(
      result?.anime || ''
    ).trim()

  if (
    data?.status !== true ||
    !quote ||
    !character ||
    !anime
  ) {
    throw new Error(
      'ANIME_QUOTES_INVALID_RESPONSE'
    )
  }

  return {
    quote,
    character,
    anime,
    total:
      Number(data?.total) ||
      null,
    attribution:
      String(
        data?.attribution || ''
      ).trim()
  }
}

export default {
  name:
    'animequotes',

  aliases: [
    'animequote',
    'quoteanime',
    'aq'
  ],

  category:
    'FUN',

  description:
    'Quote anime random dari karakter anime',

  usage:
    '.animequotes',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const data =
        await getAnimeQuote()

      const totalText =
        data.total
          ? `\n│ 📚 Pool: *${data.total} quotes*`
          : ''

      await sock.sendMessage(
        jid,
        {
          text:
            `╭──「 🌸 *ANIME QUOTES* 」\n` +
            `│\n` +
            `│ ❝ ${data.quote} ❞\n` +
            `│\n` +
            `│ 👤 *${data.character}*\n` +
            `│ 🎬 ${data.anime}` +
            `${totalText}\n` +
            `│\n` +
            `╰──── *NEXA • FUN* ────`
        },
        {
          quoted:
            msg
        }
      )
    } catch (err) {
      console.error(
        '🌸 Anime Quotes:',
        err?.message ||
        err
      )

      const code =
        String(
          err?.message || ''
        )

      let detail =
        'Server quote sedang bermasalah. Coba lagi beberapa saat 😭'

      if (
        /TimeoutError|timeout|abort/i.test(
          code
        )
      ) {
        detail =
          'Server quote kelamaan merespons. Coba lagi sebentar lagi 😭'
      }

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ *ANIME QUOTES ERROR*\n\n` +
            detail
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
