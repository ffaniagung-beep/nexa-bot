// NEXA TikTok Studio browser automation (owner-only commands use this helper).
// Uses the existing puppeteer-core + @sparticuz/chromium stack already used by NEXA.
// No CAPTCHA/verification bypass: TikTok challenges fail cleanly and must be completed normally.

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

import {
  existsSync
} from 'node:fs'

import {
  mkdir,
  rm
} from 'node:fs/promises'

import {
  resolve
} from 'node:path'

const LOGIN_URL =
  'https://www.tiktok.com/login/qrcode?lang=en'

const UPLOAD_URL =
  'https://www.tiktok.com/tiktokstudio/upload?lang=en'

const PROFILE_DIR = resolve(
  process.env.TIKTOK_PROFILE_DIR ||
  'session-tiktok'
)

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/153.0.0.0 Safari/537.36'

const sleep = ms =>
  new Promise(resolve =>
    setTimeout(resolve, ms)
  )

let taskBusy = false

export function acquireTikTokTask() {
  if (taskBusy) return null

  taskBusy = true
  let released = false

  return () => {
    if (released) return
    released = true
    taskBusy = false
  }
}

function cleanText(value, max = 600) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function browserCandidates() {
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]
    .filter(Boolean)
    .filter(path =>
      existsSync(path)
    )
}

async function chromiumExecutable() {
  const local =
    browserCandidates()[0]

  if (local) {
    return {
      path: local,
      source: 'system'
    }
  }

  try {
    const path =
      await chromium.executablePath()

    if (
      path &&
      existsSync(path)
    ) {
      return {
        path,
        source: 'sparticuz'
      }
    }
  } catch (error) {
    throw new Error(
      'TIKTOK_BROWSER_BINARY:' +
      cleanText(
        error?.message || error,
        300
      )
    )
  }

  throw new Error(
    'TIKTOK_BROWSER_BINARY_NOT_FOUND'
  )
}

async function launchBrowser() {
  const executable =
    await chromiumExecutable()

  await mkdir(
    PROFILE_DIR,
    {
      recursive: true
    }
  )

  const args = [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--lang=en-US'
  ]

  const browser =
    await puppeteer.launch({
      executablePath:
        executable.path,

      args:
        [...new Set(args)],

      headless:
        'shell',

      userDataDir:
        PROFILE_DIR,

      defaultViewport: {
        width: 1365,
        height: 900,
        deviceScaleFactor: 2
      }
    })

  return {
    browser,
    source:
      executable.source
  }
}

async function newPage(browser) {
  const pages =
    await browser.pages()

  const page =
    pages[0] ||
    await browser.newPage()

  await page.setUserAgent(
    DESKTOP_UA
  )

  page.setDefaultTimeout(
    20_000
  )

  page.setDefaultNavigationTimeout(
    35_000
  )

  return page
}

async function pageText(page) {
  try {
    return cleanText(
      await page.evaluate(() =>
        document.body?.innerText || ''
      ),
      15_000
    )
  } catch {
    return ''
  }
}

async function hasChallenge(page) {
  const text =
    (await pageText(page))
      .toLowerCase()

  return (
    text.includes('captcha') ||
    text.includes('verify to continue') ||
    text.includes('security verification') ||
    text.includes('drag the slider')
  )
}

async function hasSessionCookie(page) {
  try {
    const cookies =
      await page.cookies()

    return cookies.some(cookie =>
      [
        'sessionid',
        'sessionid_ss',
        'sid_tt'
      ].includes(cookie.name)
    )
  } catch {
    return false
  }
}

async function looksLoggedOut(page) {
  const url =
    page.url().toLowerCase()

  if (
    url.includes('/login') ||
    url.includes('login.tiktok')
  ) {
    return true
  }

  const text =
    (await pageText(page))
      .toLowerCase()

  return (
    text.includes('log in to tiktok') &&
    !text.includes('upload video')
  )
}

async function captureQr(page) {
  const candidates =
    await page.$$('canvas, img')

  let best = null
  let bestScore = -Infinity
  let bestMeta = null

  for (const handle of candidates) {
    try {
      const meta =
        await handle.evaluate(el => {
          const rect =
            el.getBoundingClientRect()

          const contextText =
            String(
              el.parentElement?.parentElement?.innerText ||
              el.parentElement?.innerText ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 1000)

          return {
            tag: el.tagName.toLowerCase(),
            width: rect.width,
            height: rect.height,
            src:
              el.tagName === 'IMG'
                ? String(
                    el.getAttribute('src') ||
                    el.getAttribute('data-src') ||
                    ''
                  )
                : '',
            alt:
              String(
                el.getAttribute('alt') ||
                el.getAttribute('aria-label') ||
                ''
              ),
            contextText
          }
        })

      const minSide =
        Math.min(meta.width, meta.height)

      const maxSide =
        Math.max(meta.width, meta.height)

      if (
        minSide < 110 ||
        maxSide > 650
      ) {
        continue
      }

      const ratio =
        maxSide / minSide

      if (ratio > 1.30) continue

      const context =
        (
          meta.alt + ' ' +
          meta.contextText
        ).toLowerCase()

      let score =
        minSide -
        Math.abs(
          meta.width - meta.height
        ) * 2

      if (context.includes('qr')) {
        score += 3000
      }

      if (context.includes('scan')) {
        score += 2200
      }

      if (
        context.includes(
          'mobile device'
        )
      ) {
        score += 1800
      }

      if (
        meta.src.startsWith(
          'data:image/'
        )
      ) {
        score += 1500
      }

      if (meta.tag === 'canvas') {
        score += 1000
      }

      if (score > bestScore) {
        best = handle
        bestScore = score
        bestMeta = meta
      }
    } catch {}
  }

  if (best) {
    console.log(
      '[TIKTOK_LOGIN] QR candidate:',
      {
        tag: bestMeta?.tag,
        size:
          `${Math.round(
            bestMeta?.width || 0
          )}x${Math.round(
            bestMeta?.height || 0
          )}`,
        score:
          Math.round(bestScore)
      }
    )

    try {
      const raw =
        await best.evaluate(el => {
          try {
            if (
              el.tagName === 'CANVAS'
            ) {
              return el.toDataURL(
                'image/png'
              )
            }

            if (
              el.tagName === 'IMG'
            ) {
              const src =
                el.getAttribute('src') ||
                el.getAttribute('data-src') ||
                ''

              if (
                src.startsWith(
                  'data:image/'
                )
              ) {
                return src
              }
            }
          } catch {}

          return null
        })

      if (
        raw &&
        raw.startsWith(
          'data:image/'
        )
      ) {
        const comma =
          raw.indexOf(',')

        if (comma > 0) {
          return Buffer.from(
            raw.slice(comma + 1),
            'base64'
          )
        }
      }
    } catch {}

    try {
      return await best.screenshot({
        type: 'png',
        captureBeyondViewport: true
      })
    } catch {}
  }

  console.warn(
    '[TIKTOK_LOGIN] QR spesifik nggak ketemu, kirim screenshot halaman.'
  )

  return page.screenshot({
    type: 'png',
    fullPage: false
  })
}

export async function loginTikTokQr({
  onQr,
  onStatus,
  timeoutMs = 180_000
} = {}) {
  let browser

  try {
    const launched =
      await launchBrowser()

    browser =
      launched.browser

    console.log(
      '[TIKTOK_STUDIO] login browser:',
      launched.source
    )

    const page =
      await newPage(browser)

    await page.goto(
      LOGIN_URL,
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    await sleep(3500)

    if (
      await hasChallenge(page)
    ) {
      throw new Error(
        'TIKTOK_CHALLENGE'
      )
    }

    if (
      await hasSessionCookie(page)
    ) {
      await onStatus?.(
        'already_logged_in'
      )

      return {
        alreadyLoggedIn: true
      }
    }

    const qr =
      await captureQr(page)

    await onQr?.(qr)

    const started =
      Date.now()

    while (
      Date.now() - started <
      timeoutMs
    ) {
      await sleep(2500)

      if (
        await hasChallenge(page)
      ) {
        throw new Error(
          'TIKTOK_CHALLENGE'
        )
      }

      if (
        await hasSessionCookie(page)
      ) {
        break
      }
    }

    if (
      !await hasSessionCookie(page)
    ) {
      throw new Error(
        'TIKTOK_LOGIN_TIMEOUT'
      )
    }

    await onStatus?.(
      'session_received'
    )

    await page.goto(
      UPLOAD_URL,
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    await sleep(4500)

    if (
      await hasChallenge(page)
    ) {
      throw new Error(
        'TIKTOK_CHALLENGE'
      )
    }

    if (
      await looksLoggedOut(page)
    ) {
      throw new Error(
        'TIKTOK_LOGIN_NOT_PERSISTED'
      )
    }

    return {
      alreadyLoggedIn: false
    }
  } finally {
    try {
      await browser?.close()
    } catch {}
  }
}

async function uploadScope(page) {
  const deadline =
    Date.now() + 20_000

  while (
    Date.now() < deadline
  ) {
    const frames =
      page.frames()

    for (
      const frame of frames
    ) {
      try {
        const input =
          await frame.$(
            'input[type="file"]'
          )

        if (input) {
          return frame
        }
      } catch {}
    }

    await sleep(700)
  }

  return page
}

async function visibleElement(
  scope,
  selector
) {
  const handles =
    await scope.$$(selector)

  for (
    const handle of handles
  ) {
    try {
      const box =
        await handle.boundingBox()

      if (
        box &&
        box.width > 1 &&
        box.height > 1
      ) {
        return handle
      }
    } catch {}
  }

  return null
}

async function elementText(
  handle
) {
  try {
    return cleanText(
      await handle.evaluate(
        el =>
          el.innerText ||
          el.textContent ||
          ''
      ),
      300
    )
  } catch {
    return ''
  }
}

async function findButtonByText(
  scope,
  labels
) {
  const wanted =
    labels.map(label =>
      label.toLowerCase()
    )

  const buttons =
    await scope.$$('button')

  for (
    const button of buttons
  ) {
    try {
      const box =
        await button.boundingBox()

      if (!box) continue

      const text =
        (await elementText(button))
          .toLowerCase()

      if (
        wanted.some(label =>
          text === label ||
          text.startsWith(label + ' ')
        )
      ) {
        return button
      }
    } catch {}
  }

  return null
}

async function selectVideo(
  page,
  scope,
  filePath
) {
  let input =
    await visibleElement(
      scope,
      'input[type="file"]'
    )

  if (!input) {
    input =
      await scope.$(
        'input[type="file"]'
      )
  }

  if (input) {
    await input.uploadFile(
      filePath
    )
    return
  }

  const button =
    await findButtonByText(
      scope,
      [
        'Select video',
        'Select file'
      ]
    )

  if (!button) {
    throw new Error(
      'TIKTOK_UPLOAD_INPUT_NOT_FOUND'
    )
  }

  const chooserPromise =
    page.waitForFileChooser({
      timeout: 10_000
    })

  await button.click()

  const chooser =
    await chooserPromise

  await chooser.accept([
    filePath
  ])
}

async function setCaption(
  page,
  scope,
  caption
) {
  if (!caption) return

  const selectors = [
    '[contenteditable="true"][data-e2e*="caption"]',
    '[contenteditable="true"][aria-label*="caption" i]',
    '[contenteditable="true"][aria-label*="description" i]',
    '[contenteditable="true"]'
  ]

  let editor = null

  for (
    const selector of selectors
  ) {
    editor =
      await visibleElement(
        scope,
        selector
      )

    if (editor) break
  }

  if (!editor) {
    throw new Error(
      'TIKTOK_CAPTION_INPUT_NOT_FOUND'
    )
  }

  await editor.click()

  await page.keyboard.down(
    'Control'
  )
  await page.keyboard.press(
    'A'
  )
  await page.keyboard.up(
    'Control'
  )
  await page.keyboard.press(
    'Backspace'
  )

  await page.keyboard.type(
    caption,
    {
      delay: 8
    }
  )
}

async function waitPostButton(
  scope,
  timeoutMs = 150_000
) {
  const deadline =
    Date.now() + timeoutMs

  let lastButton = null

  while (
    Date.now() < deadline
  ) {
    const button =
      await findButtonByText(
        scope,
        ['Post']
      )

    if (button) {
      lastButton = button

      const enabled =
        await button.evaluate(el =>
          !el.disabled &&
          el.getAttribute(
            'aria-disabled'
          ) !== 'true'
        )

      if (enabled) {
        return button
      }
    }

    await sleep(1500)
  }

  if (lastButton) {
    throw new Error(
      'TIKTOK_POST_STILL_DISABLED'
    )
  }

  throw new Error(
    'TIKTOK_POST_BUTTON_NOT_FOUND'
  )
}

async function confirmPostIfNeeded(
  page
) {
  await sleep(1800)

  for (
    const scope of page.frames()
  ) {
    const button =
      await findButtonByText(
        scope,
        [
          'Post now'
        ]
      )

    if (!button) continue

    try {
      const enabled =
        await button.evaluate(el =>
          !el.disabled &&
          el.getAttribute(
            'aria-disabled'
          ) !== 'true'
        )

      if (enabled) {
        await button.click()
        return true
      }
    } catch {}
  }

  return false
}

async function waitPublishSignal(
  page,
  timeoutMs = 45_000
) {
  const startedUrl =
    page.url()

  const deadline =
    Date.now() + timeoutMs

  while (
    Date.now() < deadline
  ) {
    await sleep(1200)

    if (
      await hasChallenge(page)
    ) {
      throw new Error(
        'TIKTOK_CHALLENGE'
      )
    }

    const url =
      page.url()

    if (
      url !== startedUrl &&
      !url.includes('/login')
    ) {
      return {
        signal: 'navigation',
        url
      }
    }

    const text =
      (await pageText(page))
        .toLowerCase()

    if (
      text.includes('your video has been uploaded') ||
      text.includes('your video is being uploaded') ||
      text.includes('video uploaded successfully') ||
      text.includes('manage posts')
    ) {
      return {
        signal: 'page_text',
        url
      }
    }
  }

  return {
    signal: 'post_clicked',
    url: page.url()
  }
}

export async function postTikTokVideo({
  filePath,
  caption = '',
  onStatus
}) {
  let browser

  try {
    const launched =
      await launchBrowser()

    browser =
      launched.browser

    console.log(
      '[TIKTOK_STUDIO] post browser:',
      launched.source
    )

    const page =
      await newPage(browser)

    await onStatus?.(
      'opening_studio'
    )

    await page.goto(
      UPLOAD_URL,
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    await sleep(4500)

    if (
      await hasChallenge(page)
    ) {
      throw new Error(
        'TIKTOK_CHALLENGE'
      )
    }

    if (
      await looksLoggedOut(page)
    ) {
      throw new Error(
        'TIKTOK_LOGIN_REQUIRED'
      )
    }

    const scope =
      await uploadScope(page)

    await onStatus?.(
      'uploading_video'
    )

    await selectVideo(
      page,
      scope,
      filePath
    )

    await sleep(2500)

    await onStatus?.(
      'setting_caption'
    )

    await setCaption(
      page,
      scope,
      caption.slice(0, 2200)
    )

    await onStatus?.(
      'waiting_ready'
    )

    const postButton =
      await waitPostButton(
        scope
      )

    await onStatus?.(
      'posting'
    )

    await postButton.click()

    await confirmPostIfNeeded(
      page
    )

    const result =
      await waitPublishSignal(
        page
      )

    return {
      ...result,
      browserSource:
        launched.source
    }
  } catch (error) {
    console.error(
      '[TIKTOK_STUDIO]',
      cleanText(
        error?.stack ||
        error?.message ||
        error,
        2500
      )
    )

    throw error
  } finally {
    try {
      await browser?.close()
    } catch {}
  }
}

export async function clearTikTokSession() {
  await rm(
    PROFILE_DIR,
    {
      recursive: true,
      force: true
    }
  )
}
