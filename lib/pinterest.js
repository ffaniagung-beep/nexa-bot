import fs from 'fs'
import puppeteer from 'puppeteer-core'

// =====================================
// PINTEREST HEADLESS SEARCH
//
// .pin query
// → Chromium headless
// → Pinterest Search
// → ambil FIXED 3 gambar
// =====================================

let searchBusy = false

// =====================================
// DETECT CHROMIUM
//
// Termux:
// /data/data/com.termux/files/usr/bin/
// chromium-browser
//
// VPS:
// /usr/bin/chromium
// /usr/bin/chromium-browser
// /usr/bin/google-chrome
// =====================================

function detectBrowser() {
  const candidates = [
    process.env.CHROME_PATH,

    '/data/data/com.termux/files/usr/bin/chromium-browser',

    '/data/data/com.termux/files/usr/bin/chromium',

    '/usr/bin/chromium',

    '/usr/bin/chromium-browser',

    '/usr/bin/google-chrome',

    '/usr/bin/google-chrome-stable'
  ].filter(Boolean)

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file
    }
  }

  throw new Error(
    'CHROMIUM_NOT_FOUND'
  )
}

// =====================================
// NORMALIZE PINTEREST IMAGE
// =====================================

function normalizePinImage(url) {
  if (!url) return null

  try {
    const parsed = new URL(url)

    if (
      !parsed.hostname.endsWith(
        'pinimg.com'
      )
    ) {
      return null
    }

    // Naikin thumbnail ke ukuran 736x
    parsed.pathname =
      parsed.pathname
        .replace(
          /\/(?:60x60|75x75_RS|136x136|170x|236x|474x|564x)\//,
          '/736x/'
        )

    return parsed.toString()
  } catch {
    return null
  }
}

// =====================================
// SEARCH
// =====================================

export async function searchPinterest(
  query
) {
  const keyword =
    String(query || '')
      .trim()

  if (!keyword) {
    throw new Error(
      'EMPTY_QUERY'
    )
  }

  // Biar 10 orang nggak buka
  // 10 Chromium sekaligus 🗿
  if (searchBusy) {
    throw new Error(
      'PIN_BUSY'
    )
  }

  searchBusy = true

  let browser

  try {
    const executablePath =
      detectBrowser()

    console.log(
      `📌 Chromium: ${executablePath}`
    )

    browser =
      await puppeteer.launch({
        executablePath,

        headless: true,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      })

    const page =
      await browser.newPage()

    // =================================
    // BROWSER PROFILE
    // =================================

    await page.setViewport({
      width: 1280,
      height: 900
    })

    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 13) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/140.0.0.0 Mobile Safari/537.36'
    )

    await page.setExtraHTTPHeaders({
      'accept-language':
        'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    })

    // Block resource berat yang nggak perlu
    await page.setRequestInterception(
      true
    )

    page.on(
      'request',
      request => {
        const type =
          request.resourceType()

        // Jangan block image!
        if (
          type === 'font' ||
          type === 'media'
        ) {
          request.abort()
        } else {
          request.continue()
        }
      }
    )

    // =================================
    // OPEN PINTEREST SEARCH
    // =================================

    const searchUrl =
      'https://www.pinterest.com/search/pins/?q=' +
      encodeURIComponent(keyword)

    console.log(
      `🔎 Pinterest: ${keyword}`
    )

    await page.goto(
      searchUrl,
      {
        waitUntil:
          'domcontentloaded',

        timeout:
          30000
      }
    )

    // kasih JS Pinterest waktu
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          3000
        )
    )

    // =================================
    // SCROLL + COLLECT
    //
    // Coba beberapa kali sampai
    // minimal punya 3 kandidat.
    // =================================

    const collected =
      new Set()

    for (
      let attempt = 0;
      attempt < 6;
      attempt++
    ) {
      const urls =
        await page.evaluate(
          () => {
            const result = []

            const images =
              document.querySelectorAll(
                'img'
              )

            for (
              const img
              of images
            ) {
              const candidates = [
                img.src,
                img.currentSrc,
                img.getAttribute(
                  'data-src'
                )
              ]

              const srcset =
                img.getAttribute(
                  'srcset'
                )

              if (srcset) {
                for (
                  const part
                  of srcset.split(',')
                ) {
                  const url =
                    part
                      .trim()
                      .split(/\s+/)[0]

                  candidates.push(
                    url
                  )
                }
              }

              for (
                const url
                of candidates
              ) {
                if (
                  typeof url ===
                    'string' &&
                  url.includes(
                    'i.pinimg.com'
                  )
                ) {
                  result.push(url)
                }
              }
            }

            return result
          }
        )

      for (const url of urls) {
        const normalized =
          normalizePinImage(
            url
          )

        if (normalized) {
          collected.add(
            normalized
          )
        }
      }

      if (
        collected.size >= 3
      ) {
        break
      }

      await page.evaluate(
        () => {
          window.scrollBy(
            0,
            window.innerHeight *
              2
          )
        }
      )

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            1800
          )
      )
    }

    // =================================
    // FILTER
    // =================================

    const images =
      [...collected]
        .filter(url => {
          return (
            !url.includes(
              '/75x75_RS/'
            ) &&
            !url.includes(
              '/60x60/'
            )
          )
        })
        .slice(0, 3)

    if (
      images.length < 3
    ) {
      console.log(
        `⚠️ Pinterest cuma dapat ${images.length}/3`
      )

      throw new Error(
        'NOT_ENOUGH_RESULTS'
      )
    }

    console.log(
      '✅ Pinterest found 3 images'
    )

    return images
  } catch (err) {
    console.error(
      '📌 Pinterest headless:',
      err?.message || err
    )

    throw err
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }

    searchBusy = false
  }
}
