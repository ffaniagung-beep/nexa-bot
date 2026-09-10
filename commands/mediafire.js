const API =
  'https://api.alwayscodex.eu.cc/api/downloader/mediafire'

const API_TIMEOUT =
  45_000

const UPLOAD_TIMEOUT =
  15 * 60 * 1000

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  )
}

function isMediaFireUrl(
  value
) {
  try {
    const url =
      new URL(
        value
      )

    const host =
      url.hostname
        .toLowerCase()

    return (
      host ===
        'mediafire.com' ||
      host.endsWith(
        '.mediafire.com'
      )
    )
  } catch {
    return false
  }
}

function cleanFileName(
  value,
  ext
) {
  let name =
    String(
      value || ''
    )
      .replace(
        /[\u0000-\u001f\u007f]/g,
        ''
      )
      .replace(
        /[\\/]/g,
        '_'
      )
      .trim()

  const safeExt =
    String(
      ext || ''
    )
      .replace(
        /[^a-z0-9]/gi,
        ''
      )
      .toLowerCase()

  if (!name) {
    name =
      safeExt
        ? `NEXA-MediaFire.${safeExt}`
        : 'NEXA-MediaFire.bin'
  }

  if (
    safeExt &&
    !name
      .toLowerCase()
      .endsWith(
        `.${safeExt}`
      )
  ) {
    name +=
      `.${safeExt}`
  }

  if (
    name.length > 180
  ) {
    const dot =
      name.lastIndexOf(
        '.'
      )

    const suffix =
      dot > 0 &&
      name.length - dot <= 12
        ? name.slice(dot)
        : ''

    name =
      name.slice(
        0,
        180 -
          suffix.length
      ) +
      suffix
  }

  return name
}

function formatSize(
  value
) {
  const raw =
    String(
      value || '-'
    ).trim()

  return raw.replace(
    /^([\d.,]+)\s*(KB|MB|GB|TB)$/i,
    '$1 $2'
  )
}

function safeMime(
  value
) {
  const mime =
    String(
      value || ''
    ).trim()

  if (
    /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i
      .test(mime)
  ) {
    return mime
  }

  return 'application/octet-stream'
}

async function requestMediaFire(
  url
) {
  let lastError

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {
    const controller =
      new AbortController()

    const timer =
      setTimeout(
        () => {
          controller.abort(
            new Error(
              'MEDIAFIRE_API_TIMEOUT'
            )
          )
        },
        API_TIMEOUT
      )

    try {
      const response =
        await fetch(
          API,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json'
            },

            body:
              JSON.stringify({
                url
              }),

            signal:
              controller.signal
          }
        )

      const body =
        await response.text()

      let json

      try {
        json =
          JSON.parse(
            body
          )
      } catch {
        throw new Error(
          `MEDIAFIRE_API_INVALID_JSON_${response.status}`
        )
      }

      if (
        !response.ok
      ) {
        throw new Error(
          json?.message ||
          `MEDIAFIRE_API_HTTP_${response.status}`
        )
      }

      if (
        json?.status !== true
      ) {
        throw new Error(
          json?.message ||
          'MEDIAFIRE_API_FAILED'
        )
      }

      const data =
        json?.data

      if (
        !data ||
        typeof data !==
          'object' ||
        !data.link
      ) {
        throw new Error(
          'MEDIAFIRE_LINK_NOT_FOUND'
        )
      }

      return data
    } catch (
      error
    ) {
      lastError =
        error

      const code =
        String(
          error?.cause?.code ||
          error?.code ||
          ''
        )

      const message =
        String(
          error?.message ||
          ''
        )

      const retryable =
        (
          /timeout|fetch failed|connection|socket|econn|enotfound/i
            .test(
              `${code} ${message}`
            )
        )

      if (
        attempt < 2 &&
        retryable
      ) {
        await sleep(
          1500
        )

        continue
      }

      throw error
    } finally {
      clearTimeout(
        timer
      )
    }
  }

  throw (
    lastError ||
    new Error(
      'MEDIAFIRE_API_FAILED'
    )
  )
}

function errorText(
  error
) {
  const code =
    String(
      error?.cause?.code ||
      error?.code ||
      error?.message ||
      ''
    )

  if (
    /timeout/i.test(
      code
    )
  ) {
    return (
      'API MediaFire sedang lambat atau timeout.\n' +
      'Coba lagi beberapa saat.'
    )
  }

  if (
    /fetch failed|connection|socket|econn|enotfound/i
      .test(code)
  ) {
    return (
      'Tidak bisa terhubung ke layanan MediaFire saat ini.\n' +
      'Coba lagi beberapa saat.'
    )
  }

  if (
    /LINK_NOT_FOUND/i.test(
      code
    )
  ) {
    return (
      'Link download tidak ditemukan dari MediaFire.'
    )
  }

  if (
    /too large|413|file size|upload/i
      .test(code)
  ) {
    return (
      'File berhasil ditemukan, tetapi WhatsApp gagal menerima ukuran file tersebut.'
    )
  }

  return (
    error?.message &&
    !String(
      error.message
    ).startsWith(
      'MEDIAFIRE_'
    )
      ? String(
          error.message
        )
      : 'MediaFire downloader sedang tidak tersedia.'
  )
}

export default {
  name:
    'mediafire',

  aliases: [
    'mf',
    'mfdl'
  ],

  category:
    'DOWNLOADER',

  description:
    'Download file MediaFire',

  usage:
    '.mediafire <url>',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const url =
      String(
        args?.[0] || ''
      ).trim()

    if (
      !url ||
      !isMediaFireUrl(
        url
      )
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            'Kirim link MediaFire yang valid.\n\n' +
            `Contoh:\n` +
            `${config?.prefix || '.'}mediafire https://www.mediafire.com/file/xxxxx/file.zip/file`
        },
        {
          quoted:
            msg
        }
      )

      return
    }

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            '⏳ Mengambil informasi file dan menyiapkan download...'
        },
        {
          quoted:
            msg
        }
      )

      const data =
        await requestMediaFire(
          url
        )

      const fileName =
        cleanFileName(
          data.filename,
          data.ext
        )

      const mimetype =
        safeMime(
          data.mimetype
        )

      const filesize =
        formatSize(
          data.filesize
        )

      await sock.sendMessage(
        jid,
        {
          document: {
            url:
              data.link
          },

          fileName,

          mimetype,

          caption:
            '✦ *NEXA • MEDIAFIRE*\n\n' +
            `📁 *File:* ${fileName}\n` +
            `📦 *Ukuran:* ${filesize}\n` +
            `🧩 *Tipe:* ${mimetype}\n\n` +
            '✅ File berhasil disiapkan.'
        },
        {
          quoted:
            msg,

          mediaUploadTimeoutMs:
            UPLOAD_TIMEOUT
        }
      )
    } catch (
      error
    ) {
      console.error(
        '[MEDIAFIRE]',
        error
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '❌ *MediaFire gagal*\n\n' +
            errorText(
              error
            )
        },
        {
          quoted:
            msg
        }
      )
    }
  }
}
