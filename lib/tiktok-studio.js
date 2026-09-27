// NEXA TikTok Studio browser automation (owner-only commands use this helper).
// Uses the existing puppeteer-core + @sparticuz/chromium stack already used by NEXA.
// No CAPTCHA/verification bypass: TikTok challenges fail cleanly and must be completed normally.

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import {
  Browser,
  detectBrowserPlatform,
  install
} from '@puppeteer/browsers'


import {
  spawn,
  spawnSync
} from 'node:child_process'

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
let pendingPhoneLogin = null

export function acquireTikTokTask() {
  if (
    taskBusy ||
    pendingPhoneLogin
  ) return null

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

function xvfbCandidates() {
  return [
    process.env.XVFB_PATH,
    '/usr/bin/Xvfb',
    '/usr/local/bin/Xvfb',
    '/bin/Xvfb'
  ]
    .filter(Boolean)
    .filter(path =>
      existsSync(path)
    )
}

function systemBrowserPath() {
  return browserCandidates()[0] || null
}

function xvfbPath() {
  return xvfbCandidates()[0] || null
}

async function startXvfb() {
  const binary =
    xvfbPath()

  if (!binary) {
    throw new Error(
      'TIKTOK_XVFB_NOT_FOUND'
    )
  }

  const display =
    String(
      process.env.TIKTOK_DISPLAY ||
      ':99'
    )

  const proc =
    spawn(
      binary,
      [
        display,
        '-screen',
        '0',
        '1365x900x24',
        '-ac',
        '-nolisten',
        'tcp'
      ],
      {
        stdio: 'ignore'
      }
    )

  await sleep(700)

  if (
    proc.exitCode !== null
  ) {
    throw new Error(
      'TIKTOK_XVFB_START_FAILED:' +
      proc.exitCode
    )
  }

  return {
    proc,
    display,
    binary
  }
}

function stopXvfb(xvfb) {
  if (!xvfb?.proc) return

  try {
    if (
      xvfb.proc.exitCode === null
    ) {
      xvfb.proc.kill(
        'SIGTERM'
      )
    }
  } catch {}
}

async function launchHeadfulBrowser({
  chromePath
}) {
  let xvfb

  try {
    xvfb =
      await startXvfb()

    console.log(
      '[TIKTOK_BROWSER] Xvfb:',
      {
        path:
          xvfb.binary,
        display:
          xvfb.display
      }
    )

    const browser =
      await puppeteer.launch({
        executablePath:
          chromePath,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--lang=en-US'
        ],

        headless:
          false,

        env: {
          ...process.env,
          DISPLAY:
            xvfb.display
        },

        userDataDir:
          PROFILE_DIR,

        defaultViewport: {
          width: 1365,
          height: 900,
          deviceScaleFactor: 2
        }
      })

    browser.once(
      'disconnected',
      () => {
        stopXvfb(xvfb)
      }
    )

    return {
      browser,
      source:
        'system+xvfb-headful'
    }
  } catch (error) {
    stopXvfb(xvfb)
    throw error
  }
}

async function launchHeadlessBrowser() {
  const executable =
    await chromiumExecutable()

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
      executable.source +
      '-headless'
  }
}


const CFT_BUILD_ID =
  String(
    process.env.TIKTOK_CFT_BUILD ||
    '153.0.8010.36'
  )
    .trim()

const CFT_CACHE_DIR =
  resolve(
    PROFILE_DIR,
    'chrome-for-testing'
  )

function commandExists(name) {
  try {
    const result =
      spawnSync(
        name,
        ['-v'],
        {
          stdio: 'ignore'
        }
      )

    return (
      result.status === 0
    )
  } catch {
    return false
  }
}

async function primeSparticuzLibraries() {
  try {
    const path =
      await chromium.executablePath()

    console.log(
      '[TIKTOK_BROWSER] Sparticuz libs primed:',
      Boolean(path)
    )
  } catch (error) {
    console.warn(
      '[TIKTOK_BROWSER] Sparticuz lib prime skipped:',
      cleanText(
        error?.message ||
        error,
        220
      )
    )
  }
}

async function ensureChromeForTesting() {
  const platform =
    detectBrowserPlatform()

  if (!platform) {
    throw new Error(
      'TIKTOK_CFT_PLATFORM_UNSUPPORTED:' +
      process.platform +
      '/' +
      process.arch
    )
  }

  if (!commandExists('unzip')) {
    throw new Error(
      'TIKTOK_CFT_UNZIP_MISSING'
    )
  }

  await mkdir(
    CFT_CACHE_DIR,
    {
      recursive: true
    }
  )

  console.log(
    '[TIKTOK_BROWSER] Chrome for Testing:',
    {
      build:
        CFT_BUILD_ID,
      platform,
      cache:
        CFT_CACHE_DIR
    }
  )

  let lastPercent = -10

  const installed =
    await install({
      browser:
        Browser.CHROME,

      buildId:
        CFT_BUILD_ID,

      platform,

      cacheDir:
        CFT_CACHE_DIR,

      downloadProgressCallback:
        (
          downloadedBytes,
          totalBytes
        ) => {
          if (
            !totalBytes ||
            totalBytes <= 0
          ) {
            return
          }

          const percent =
            Math.floor(
              downloadedBytes /
              totalBytes *
              100
            )

          if (
            percent >=
            lastPercent + 10
          ) {
            lastPercent =
              percent

            console.log(
              '[TIKTOK_BROWSER] CFT download:',
              `${percent}%`
            )
          }
        }
    })

  const path =
    installed?.executablePath

  if (
    !path ||
    !existsSync(path)
  ) {
    throw new Error(
      'TIKTOK_CFT_BINARY_NOT_FOUND'
    )
  }

  return {
    path,
    build:
      CFT_BUILD_ID,
    platform
  }
}

async function launchChromeForTesting() {
  // Sparticuz also unpacks serverless-compatible runtime libs
  // and updates LD_LIBRARY_PATH. The CFT binary itself is still
  // Google's full Chrome, not Sparticuz headless_shell.
  await primeSparticuzLibraries()

  const cft =
    await ensureChromeForTesting()

  console.log(
    '[TIKTOK_BROWSER] launching full Chrome headless-new:',
    {
      build:
        cft.build,
      platform:
        cft.platform
    }
  )

  try {
    const browser =
      await puppeteer.launch({
        executablePath:
          cft.path,

        headless:
          true,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--lang=en-US'
        ],

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
        'chrome-for-testing-' +
        cft.build +
        '-headless-new'
    }
  } catch (error) {
    throw new Error(
      'TIKTOK_CFT_LAUNCH:' +
      cleanText(
        error?.message ||
        error,
        650
      )
    )
  }
}

async function launchBrowser() {
  await mkdir(
    PROFILE_DIR,
    {
      recursive: true
    }
  )

  const mode =
    String(
      process.env.TIKTOK_BROWSER_MODE ||
      'cft'
    )
      .trim()
      .toLowerCase()

  const chrome =
    systemBrowserPath()

  const xvfb =
    xvfbPath()

  console.log(
    '[TIKTOK_BROWSER] capability:',
    {
      mode,
      systemChrome:
        Boolean(chrome),
      chromePath:
        chrome || null,
      xvfb:
        Boolean(xvfb),
      xvfbPath:
        xvfb || null,
      cftBuild:
        CFT_BUILD_ID,
      unzip:
        commandExists('unzip')
    }
  )

  if (
    mode === 'cft' ||
    mode === 'chrome' ||
    mode === 'full'
  ) {
    return launchChromeForTesting()
  }

  if (
    mode === 'headful'
  ) {
    if (
      chrome &&
      xvfb
    ) {
      return launchHeadfulBrowser({
        chromePath:
          chrome
      })
    }

    console.warn(
      '[TIKTOK_BROWSER] headful unavailable; pindah ke full Chrome headless-new.'
    )

    return launchChromeForTesting()
  }

  if (
    mode === 'auto'
  ) {
    try {
      return await launchChromeForTesting()
    } catch (error) {
      console.warn(
        '[TIKTOK_BROWSER] CFT failed, fallback Sparticuz:',
        cleanText(
          error?.message ||
          error,
          400
        )
      )

      return launchHeadlessBrowser()
    }
  }

  if (
    mode === 'sparticuz' ||
    mode === 'shell'
  ) {
    return launchHeadlessBrowser()
  }

  throw new Error(
    'TIKTOK_BROWSER_MODE_INVALID:' +
    mode
  )
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

// ---- NEXA TikTok phone + OTP login ----

const PHONE_LOGIN_URL =
  'https://www.tiktok.com/login/phone-or-email?lang=en'

function digitsOnly(value) {
  return String(value || '')
    .replace(/\D/g, '')
}

function normalizeTikTokPhone(rawPhone, rawCountryCode) {
  const countryCode =
    digitsOnly(rawCountryCode || '62')

  let phone =
    digitsOnly(rawPhone)

  if (!phone) {
    throw new Error('TIKTOK_PHONE_MISSING')
  }

  if (
    countryCode &&
    phone.startsWith(countryCode)
  ) {
    phone =
      phone.slice(countryCode.length)
  }

  phone =
    phone.replace(/^0+/, '')

  if (
    phone.length < 6 ||
    phone.length > 16
  ) {
    throw new Error('TIKTOK_PHONE_INVALID')
  }

  return {
    countryCode,
    phone
  }
}

async function visibleHandles(page, selector) {
  const all =
    await page.$$(selector)

  const visible = []

  for (const handle of all) {
    try {
      const box =
        await handle.boundingBox()

      if (
        box &&
        box.width > 2 &&
        box.height > 2
      ) {
        visible.push(handle)
      }
    } catch {}
  }

  return visible
}

async function handleMeta(handle) {
  try {
    return await handle.evaluate(
      el => ({
        text:
          String(
            el.innerText ||
            el.textContent ||
            ''
          )
            .replace(/\s+/g, ' ')
            .trim(),

        placeholder:
          String(
            el.getAttribute('placeholder') ||
            ''
          ),

        aria:
          String(
            el.getAttribute('aria-label') ||
            ''
          ),

        type:
          String(
            el.getAttribute('type') ||
            ''
          )
      })
    )
  } catch {
    return {
      text: '',
      placeholder: '',
      aria: '',
      type: ''
    }
  }
}

async function findInputByHints(page, hints) {
  const wanted =
    hints.map(x =>
      x.toLowerCase()
    )

  const inputs =
    await visibleHandles(
      page,
      'input'
    )

  let fallback = null

  for (const input of inputs) {
    const meta =
      await handleMeta(input)

    const hay =
      (
        meta.placeholder + ' ' +
        meta.aria
      ).toLowerCase()

    if (
      wanted.some(hint =>
        hay.includes(hint)
      )
    ) {
      return input
    }

    if (
      !fallback &&
      (
        meta.type === 'tel' ||
        meta.type === 'text'
      )
    ) {
      fallback = input
    }
  }

  return fallback
}

async function findButtonText(page, labels) {
  const wanted =
    labels.map(x =>
      x.toLowerCase()
    )

  const buttons =
    await visibleHandles(
      page,
      'button, [role="button"]'
    )

  for (const button of buttons) {
    const meta =
      await handleMeta(button)

    const text =
      meta.text.toLowerCase()

    if (
      wanted.some(label =>
        text === label ||
        text.startsWith(label + ' ')
      )
    ) {
      return button
    }
  }

  return null
}

async function ensureCountryCode(page, countryCode) {
  const wanted =
    '+' + countryCode

  const body =
    await pageText(page)

  if (
    body.includes(wanted)
  ) {
    return true
  }

  const controls =
    await visibleHandles(
      page,
      '[role="combobox"], button, [role="button"]'
    )

  let opener = null

  for (const control of controls) {
    const meta =
      await handleMeta(control)

    const text =
      meta.text.trim()

    if (
      /^\+?\d{1,4}$/.test(text) ||
      /^[A-Z]{2,3}\s*\+\d{1,4}$/i.test(text)
    ) {
      opener = control
      break
    }
  }

  if (!opener) {
    return false
  }

  await opener.click()
  await sleep(500)

  const options =
    await visibleHandles(
      page,
      '[role="option"], li, button, [role="button"], div'
    )

  let best = null
  let bestLen = Infinity

  for (const option of options) {
    const meta =
      await handleMeta(option)

    const text =
      meta.text.trim()

    if (
      text &&
      text.includes(wanted) &&
      text.length < bestLen
    ) {
      best = option
      bestLen = text.length
    }
  }

  if (!best) {
    throw new Error(
      'TIKTOK_COUNTRY_CODE_NOT_FOUND:' +
      wanted
    )
  }

  await best.click()
  await sleep(350)

  return true
}

async function fillInput(handle, value) {
  await handle.click({
    clickCount: 3
  })

  try {
    await handle.evaluate(el => {
      el.value = ''
      el.dispatchEvent(
        new Event(
          'input',
          { bubbles: true }
        )
      )
    })
  } catch {}

  await handle.type(
    value,
    { delay: 55 }
  )
}

function loginErrorText(text) {
  const lower =
    String(text || '')
      .toLowerCase()

  if (
    lower.includes('too many attempts') ||
    lower.includes('try again later')
  ) {
    return 'TIKTOK_OTP_RATE_LIMIT'
  }

  if (
    lower.includes('code has expired') ||
    lower.includes('verification code expired')
  ) {
    return 'TIKTOK_OTP_EXPIRED'
  }

  if (
    lower.includes('incorrect code') ||
    lower.includes('invalid code') ||
    lower.includes('code is incorrect')
  ) {
    return 'TIKTOK_OTP_INVALID'
  }

  return null
}

async function closePendingLogin() {
  const pending =
    pendingPhoneLogin

  pendingPhoneLogin = null

  if (!pending) return

  try {
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
  } catch {}

  try {
    await pending.browser?.close()
  } catch {}
}

export async function startTikTokPhoneLogin({
  phone,
  countryCode = '62',
  timeoutMs = 180_000,
  onCodeRequested
} = {}) {
  if (pendingPhoneLogin) {
    throw new Error('TIKTOK_LOGIN_PENDING')
  }

  const normalized =
    normalizeTikTokPhone(phone, countryCode)

  let browser

  try {
    const launched =
      await launchBrowser()

    browser =
      launched.browser

    console.log(
      '[TIKTOK_STUDIO] phone login browser:',
      launched.source
    )

    console.log(
      '[TIKTOK_LOGIN] env phone:',
      {
        country: '+' + normalized.countryCode,
        digits: normalized.phone.length
      }
    )

    const page =
      await newPage(browser)

    const netEvents = []

    page.on(
      'response',
      response => {
        try {
          const raw =
            response.url()

          const lower =
            raw.toLowerCase()

          if (
            !lower.includes('passport') &&
            !lower.includes('login') &&
            !lower.includes('verify') &&
            !lower.includes('sms') &&
            !lower.includes('code')
          ) {
            return
          }

          const u =
            new URL(raw)

          netEvents.push({
            status: response.status(),
            path:
              u.hostname +
              u.pathname
          })

          if (
            netEvents.length > 15
          ) {
            netEvents.shift()
          }
        } catch {}
      }
    )

    await page.goto(
      PHONE_LOGIN_URL,
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    await sleep(3000)

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
      await browser.close()

      return {
        alreadyLoggedIn: true,
        waitingOtp: false,
        method: 'phone'
      }
    }

    const phoneInput =
      await findInputByHints(
        page,
        [
          'phone number',
          'phone'
        ]
      )

    if (!phoneInput) {
      throw new Error(
        'TIKTOK_PHONE_INPUT_NOT_FOUND'
      )
    }

    const selected =
      await ensureCountryCode(
        page,
        normalized.countryCode
      )

    const valueToType =
      selected
        ? normalized.phone
        : (
            '+' +
            normalized.countryCode +
            normalized.phone
          )

    await fillInput(
      phoneInput,
      valueToType
    )

    await sleep(500)

    const sendCode =
      await findButtonText(
        page,
        ['send code']
      )

    if (!sendCode) {
      throw new Error(
        'TIKTOK_SEND_CODE_BUTTON_NOT_FOUND'
      )
    }

    const before =
      await sendCode.evaluate(
        el => ({
          disabled:
            Boolean(el.disabled) ||
            el.getAttribute(
              'aria-disabled'
            ) === 'true',

          text:
            String(
              el.innerText ||
              el.textContent ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
        })
      )

    console.log(
      '[TIKTOK_LOGIN] send-code before:',
      before
    )

    if (before.disabled) {
      throw new Error(
        'TIKTOK_SEND_CODE_DISABLED'
      )
    }

    await sendCode.click()

    const deadline =
      Date.now() + 15_000

    let confirmed = false
    let reason = ''

    while (
      Date.now() < deadline
    ) {
      await sleep(700)

      if (
        await hasChallenge(page)
      ) {
        throw new Error(
          'TIKTOK_CHALLENGE'
        )
      }

      const body =
        await pageText(page)

      const immediateError =
        loginErrorText(body)

      if (immediateError) {
        throw new Error(
          immediateError
        )
      }

      let after = null

      try {
        after =
          await sendCode.evaluate(
            el => ({
              disabled:
                Boolean(el.disabled) ||
                el.getAttribute(
                  'aria-disabled'
                ) === 'true',

              text:
                String(
                  el.innerText ||
                  el.textContent ||
                  ''
                )
                  .replace(/\s+/g, ' ')
                  .trim()
            })
          )
      } catch {}

      const lower =
        body.toLowerCase()

      const countdown =
        /\b(?:[1-5]?\d)\s*s\b/i
          .test(body) ||
        /\b(?:[1-5]?\d)\s*sec/i
          .test(body)

      const resendState =
        lower.includes(
          'resend code'
        ) ||
        lower.includes(
          'resend in'
        ) ||
        lower.includes(
          'code sent'
        ) ||
        lower.includes(
          'sent to'
        )

      const buttonChanged =
        Boolean(
          after &&
          (
            after.disabled ||
            (
              after.text &&
              after.text !==
              before.text
            )
          )
        )

      const likelyNetwork =
        netEvents.some(
          item =>
            item.status >= 200 &&
            item.status < 400 &&
            /sms|code|verify/i
              .test(item.path)
        )

      if (countdown) {
        confirmed = true
        reason = 'countdown'
        break
      }

      if (resendState) {
        confirmed = true
        reason = 'resend-state'
        break
      }

      if (
        buttonChanged &&
        likelyNetwork
      ) {
        confirmed = true
        reason = 'button+network'
        break
      }
    }

    console.log(
      '[TIKTOK_LOGIN] network trace:',
      netEvents
    )

    if (!confirmed) {
      const error =
        new Error(
          'TIKTOK_SEND_CODE_NOT_CONFIRMED'
        )

      error.debugInfo = {
        buttonBefore: before,
        netEvents:
          netEvents.slice(-8)
      }

      error.debugScreenshot =
        await page.screenshot({
          type: 'png',
          fullPage: false
        })

      throw error
    }

    console.log(
      '[TIKTOK_LOGIN] OTP request confirmed:',
      reason
    )

    const expiresAt =
      Date.now() +
      timeoutMs

    pendingPhoneLogin = {
      browser,
      page,
      expiresAt,
      timer: null,
      method: 'phone'
    }

    pendingPhoneLogin.timer =
      setTimeout(
        () => {
          closePendingLogin()
            .catch(() => {})
        },
        timeoutMs
      )

    browser = null

    await onCodeRequested?.({
      method: 'phone'
    })

    return {
      alreadyLoggedIn: false,
      waitingOtp: true,
      expiresAt,
      method: 'phone'
    }
  } catch (error) {
    try {
      await browser?.close()
    } catch {}

    throw error
  }
}

export async function startTikTokEmailLogin({
  email,
  password,
  timeoutMs = 180_000,
  onCodeRequested
} = {}) {
  if (pendingPhoneLogin) {
    throw new Error(
      'TIKTOK_LOGIN_PENDING'
    )
  }

  const cleanEmail =
    String(email || '')
      .trim()

  const cleanPassword =
    String(password || '')

  if (!cleanEmail) {
    throw new Error(
      'TIKTOK_EMAIL_MISSING'
    )
  }

  if (!cleanPassword) {
    throw new Error(
      'TIKTOK_PASSWORD_MISSING'
    )
  }

  let browser

  try {
    const launched =
      await launchBrowser()

    browser =
      launched.browser

    console.log(
      '[TIKTOK_STUDIO] email login browser:',
      launched.source
    )

    console.log(
      '[TIKTOK_LOGIN] env email loaded:',
      {
        chars:
          cleanEmail.length,
        hasAt:
          cleanEmail.includes('@')
      }
    )

    const page =
      await newPage(browser)

    await page.goto(
      PHONE_LOGIN_URL,
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    await sleep(3000)

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
      await browser.close()

      return {
        alreadyLoggedIn: true,
        waitingOtp: false,
        method: 'email'
      }
    }

    let clickedMode = false

    const controls =
      await visibleHandles(
        page,
        'a, button, [role="button"]'
      )

    for (const control of controls) {
      const meta =
        await handleMeta(control)

      if (
        meta.text
          .toLowerCase()
          .includes(
            'log in with email or username'
          )
      ) {
        await control.click()
        clickedMode = true
        await sleep(900)
        break
      }
    }

    if (!clickedMode) {
      throw new Error(
        'TIKTOK_EMAIL_MODE_NOT_FOUND'
      )
    }

    const userInput =
      await findInputByHints(
        page,
        [
          'email or username',
          'email',
          'username'
        ]
      )

    if (!userInput) {
      throw new Error(
        'TIKTOK_EMAIL_INPUT_NOT_FOUND'
      )
    }

    const passInputs =
      await visibleHandles(
        page,
        'input[type="password"]'
      )

    const passInput =
      passInputs[0]

    if (!passInput) {
      throw new Error(
        'TIKTOK_PASSWORD_INPUT_NOT_FOUND'
      )
    }

    await fillInput(
      userInput,
      cleanEmail
    )

    await fillInput(
      passInput,
      cleanPassword
    )

    await sleep(450)

    const loginButton =
      await findButtonText(
        page,
        [
          'log in',
          'login'
        ]
      )

    if (!loginButton) {
      throw new Error(
        'TIKTOK_LOGIN_BUTTON_NOT_FOUND'
      )
    }

    await loginButton.click()

    const deadline =
      Date.now() + 65_000

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

      if (
        await hasSessionCookie(page)
      ) {
        await page.goto(
          UPLOAD_URL,
          {
            waitUntil:
              'domcontentloaded'
          }
        )

        await sleep(4000)

        if (
          await looksLoggedOut(page)
        ) {
          throw new Error(
            'TIKTOK_LOGIN_NOT_PERSISTED'
          )
        }

        await browser.close()

        return {
          alreadyLoggedIn: false,
          waitingOtp: false,
          loggedIn: true,
          method: 'email'
        }
      }

      const body =
        await pageText(page)

      const lower =
        body.toLowerCase()

      if (
        lower.includes(
          'incorrect password'
        ) ||
        lower.includes(
          'wrong password'
        ) ||
        lower.includes(
          'password is incorrect'
        )
      ) {
        throw new Error(
          'TIKTOK_BAD_PASSWORD'
        )
      }

      const verifyInput =
        await findInputByHints(
          page,
          [
            'verification code',
            '6-digit code',
            'code'
          ]
        )

      const verificationText =
        lower.includes(
          'verification code'
        ) ||
        lower.includes(
          'verify your identity'
        ) ||
        lower.includes(
          'enter the code'
        )

      if (
        verifyInput &&
        verificationText
      ) {
        const expiresAt =
          Date.now() +
          timeoutMs

        pendingPhoneLogin = {
          browser,
          page,
          expiresAt,
          timer: null,
          method: 'email'
        }

        pendingPhoneLogin.timer =
          setTimeout(
            () => {
              closePendingLogin()
                .catch(() => {})
            },
            timeoutMs
          )

        browser = null

        await onCodeRequested?.({
          method: 'email'
        })

        return {
          alreadyLoggedIn: false,
          waitingOtp: true,
          expiresAt,
          method: 'email'
        }
      }
    }

    const error =
      new Error(
        'TIKTOK_EMAIL_LOGIN_TIMEOUT'
      )

    error.debugScreenshot =
      await page.screenshot({
        type: 'png',
        fullPage: false
      })

    throw error
  } catch (error) {
    try {
      await browser?.close()
    } catch {}

    throw error
  }
}

export async function completeTikTokPhoneLogin(rawCode) {
  const code =
    digitsOnly(rawCode)

  if (
    !/^\d{6}$/.test(code)
  ) {
    throw new Error('TIKTOK_OTP_FORMAT')
  }

  const pending =
    pendingPhoneLogin

  if (!pending) {
    throw new Error('TIKTOK_NO_PENDING_OTP')
  }

  if (
    Date.now() >
    pending.expiresAt
  ) {
    await closePendingLogin()
    throw new Error('TIKTOK_OTP_EXPIRED')
  }

  const page =
    pending.page

  try {
    if (
      await hasChallenge(page)
    ) {
      throw new Error('TIKTOK_CHALLENGE')
    }

    const codeInput =
      await findInputByHints(
        page,
        [
          '6-digit code',
          'verification code',
          'code'
        ]
      )

    if (!codeInput) {
      throw new Error(
        'TIKTOK_OTP_INPUT_NOT_FOUND'
      )
    }

    await fillInput(
      codeInput,
      code
    )

    await sleep(350)

    const loginButton =
      await findButtonText(
        page,
        [
          'log in',
          'login',
          'verify',
          'continue',
          'confirm'
        ]
      )

    if (!loginButton) {
      throw new Error(
        'TIKTOK_LOGIN_BUTTON_NOT_FOUND'
      )
    }

    await loginButton.click()

    const deadline =
      Date.now() + 65_000

    while (
      Date.now() < deadline
    ) {
      await sleep(1200)

      if (
        await hasChallenge(page)
      ) {
        throw new Error('TIKTOK_CHALLENGE')
      }

      if (
        await hasSessionCookie(page)
      ) {
        break
      }

      const err =
        loginErrorText(
          await pageText(page)
        )

      if (err) {
        throw new Error(err)
      }
    }

    if (
      !await hasSessionCookie(page)
    ) {
      throw new Error(
        'TIKTOK_LOGIN_TIMEOUT'
      )
    }

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
      throw new Error('TIKTOK_CHALLENGE')
    }

    if (
      await looksLoggedOut(page)
    ) {
      throw new Error(
        'TIKTOK_LOGIN_NOT_PERSISTED'
      )
    }

    return {
      ok: true
    }
  } finally {
    await closePendingLogin()
  }
}

// ---- end NEXA TikTok phone + OTP login ----

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
