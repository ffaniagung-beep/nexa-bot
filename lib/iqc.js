import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import puppeteer from 'puppeteer-core'

// =====================================
// NEXA IQC MAKER
// iPhone WhatsApp Context Mockup
// =====================================

const TEMP_DIR =
  path.resolve('./temp')

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

function randomFile(ext) {
  ensureTemp()

  return path.join(
    TEMP_DIR,
    `iqc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  )
}

function safeDelete(...files) {
  for (
    const file
    of files
  ) {
    if (!file) {
      continue
    }

    try {
      if (
        fs.existsSync(file)
      ) {
        fs.unlinkSync(file)
      }
    } catch {}
  }
}

// =====================================
// CHROMIUM
// =====================================

function getChromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,

    '/data/data/com.termux/files/usr/bin/chromium-browser',

    '/data/data/com.termux/files/usr/bin/chromium',

    '/usr/bin/chromium',

    '/usr/bin/chromium-browser',

    '/usr/bin/google-chrome'
  ].filter(Boolean)

  for (
    const candidate
    of candidates
  ) {
    if (
      fs.existsSync(
        candidate
      )
    ) {
      return candidate
    }
  }

  throw new Error(
    'CHROMIUM_NOT_FOUND'
  )
}

// =====================================
// HTML ESCAPE
// =====================================

function escapeHtml(value) {
  return String(
    value || ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    )
}

// =====================================
// TIME
// =====================================

function getTime() {
  return new Intl.DateTimeFormat(
    'id-ID',
    {
      timeZone:
        'Asia/Jakarta',

      hour:
        '2-digit',

      minute:
        '2-digit',

      hour12:
        false
    }
  )
    .format(
      new Date()
    )
    .replace(
      '.',
      ':'
    )
}

// =====================================
// BUILD HTML
// =====================================

function buildHtml({
  text
}) {
  const safeText =
    escapeHtml(
      text
    )

  const time =
    getTime()

  return `
<!doctype html>

<html>

<head>

<meta charset="utf-8">

<style>

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;

  background:
    transparent;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    Helvetica,
    Arial,
    sans-serif;
}

body {
  width:
    720px;

  padding:
    0;
}

.capture {
  position:
    relative;

  width:
    720px;

  min-height:
    1180px;

  overflow:
    hidden;

  color:
    white;

  background:
    #101416;
}

/* =================================
   FAKE BLURRED CHAT BACKGROUND
   ================================= */

.chat-bg {
  position:
    absolute;

  inset:
    0;

  background:
    linear-gradient(
      135deg,
      #0a1110 0%,
      #101414 40%,
      #0a1c17 100%
    );
}

.chat-bg::before {
  content:
    "";

  position:
    absolute;

  inset:
    -30px;

  opacity:
    .65;

  filter:
    blur(16px);

  background:
    radial-gradient(
      circle at 70% 20%,
      rgba(0, 130, 95, .55),
      transparent 20%
    ),
    radial-gradient(
      circle at 35% 48%,
      rgba(0, 120, 85, .5),
      transparent 22%
    ),
    radial-gradient(
      circle at 75% 75%,
      rgba(0, 130, 95, .45),
      transparent 22%
    );
}

.fake-message {
  position:
    absolute;

  height:
    42px;

  border-radius:
    12px;

  opacity:
    .18;

  filter:
    blur(4px);
}

.f1 {
  top:
    120px;

  left:
    60px;

  width:
    310px;

  background:
    #4b4f51;
}

.f2 {
  top:
    210px;

  right:
    55px;

  width:
    350px;

  background:
    #075e54;
}

.f3 {
  top:
    330px;

  left:
    45px;

  width:
    400px;

  background:
    #4b4f51;
}

.f4 {
  top:
    435px;

  right:
    55px;

  width:
    300px;

  background:
    #075e54;
}

.f5 {
  top:
    900px;

  right:
    70px;

  width:
    360px;

  background:
    #075e54;
}

/* dark overlay */
.overlay {
  position:
    absolute;

  inset:
    0;

  background:
    rgba(
      0,
      0,
      0,
      .48
    );

  backdrop-filter:
    blur(5px);
}

/* =================================
   STATUS BAR
   ================================= */

.statusbar {
  position:
    relative;

  z-index:
    10;

  height:
    68px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  padding:
    0 28px;

  font-size:
    22px;

  font-weight:
    650;

  text-shadow:
    0 1px 4px
    rgba(0,0,0,.6);
}

.status-left {
  display:
    flex;

  gap:
    10px;

  align-items:
    center;
}

.status-right {
  display:
    flex;

  gap:
    10px;

  align-items:
    center;
}

/* =================================
   CONTENT
   ================================= */

.content {
  position:
    relative;

  z-index:
    20;

  width:
    100%;

  padding:
    350px 38px 55px;
}

/* =================================
   REACTION BAR
   ================================= */

.reactions {
  width:
    max-content;

  max-width:
    640px;

  min-height:
    88px;

  padding:
    12px 16px;

  margin-bottom:
    18px;

  display:
    flex;

  align-items:
    center;

  gap:
    19px;

  background:
    rgba(
      55,
      55,
      58,
      .96
    );

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      .05
    );

  border-radius:
    44px;

  box-shadow:
    0 12px 32px
    rgba(
      0,
      0,
      0,
      .32
    );
}

.emoji {
  font-size:
    42px;

  line-height:
    1;
}

.plus {
  width:
    59px;

  height:
    59px;

  border-radius:
    50%;

  background:
    #68686c;

  color:
    #cfcfd3;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  font-size:
    43px;

  font-weight:
    300;

  line-height:
    1;
}

/* =================================
   SELECTED MESSAGE
   ================================= */

.selected-wrap {
  margin-bottom:
    19px;
}

.selected-message {
  display:
    inline-block;

  min-width:
    210px;

  max-width:
    550px;

  padding:
    18px 22px 12px;

  background:
    rgba(
      64,
      64,
      67,
      .98
    );

  border-radius:
    17px;

  box-shadow:
    0 10px 26px
    rgba(
      0,
      0,
      0,
      .3
    );
}

.message-text {
  font-size:
    32px;

  line-height:
    1.22;

  font-weight:
    400;

  white-space:
    pre-wrap;

  overflow-wrap:
    anywhere;

  word-break:
    break-word;
}

.message-time {
  text-align:
    right;

  margin-top:
    8px;

  padding-right:
    3px;

  color:
    #a7a7aa;

  font-size:
    19px;
}

/* =================================
   IOS CONTEXT MENU
   ================================= */

.menu {
  width:
    465px;

  overflow:
    hidden;

  border-radius:
    20px;

  background:
    rgba(
      50,
      50,
      52,
      .98
    );

  box-shadow:
    0 14px 42px
    rgba(
      0,
      0,
      0,
      .34
    );
}

.row {
  height:
    85px;

  padding:
    0 25px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  border-bottom:
    1px solid
    rgba(
      255,
      255,
      255,
      .10
    );

  font-size:
    28px;

  font-weight:
    400;
}

.row:last-child {
  border-bottom:
    none;
}

.icon {
  width:
    42px;

  text-align:
    center;

  color:
    #f2f2f3;

  font-size:
    34px;
}

.delete {
  color:
    #ff453a;
}

.delete .icon {
  color:
    #ff453a;
}

/* =================================
   LABEL
   ================================= */

.watermark {
  margin-top:
    22px;

  padding-left:
    8px;

  color:
    rgba(
      255,
      255,
      255,
      .30
    );

  font-size:
    13px;

  font-weight:
    650;

  letter-spacing:
    1.4px;
}

</style>

</head>

<body>

<div class="capture">

  <div class="chat-bg">

    <div class="fake-message f1"></div>

    <div class="fake-message f2"></div>

    <div class="fake-message f3"></div>

    <div class="fake-message f4"></div>

    <div class="fake-message f5"></div>

  </div>

  <div class="overlay"></div>

  <div class="statusbar">

    <div class="status-left">

      <span>▮▮▮▮</span>

      <span>INDOSAT</span>

      <span>⌁</span>

    </div>

    <div>
      ${time}
    </div>

    <div class="status-right">

      <span>◉</span>

      <span>64%</span>

      <span>🔋</span>

    </div>

  </div>

  <div class="content">

    <div class="reactions">

      <span class="emoji">👍</span>

      <span class="emoji">❤️</span>

      <span class="emoji">😂</span>

      <span class="emoji">😮</span>

      <span class="emoji">😢</span>

      <span class="emoji">🙏</span>

      <span class="plus">+</span>

    </div>

    <div class="selected-wrap">

      <div class="selected-message">

        <div class="message-text">${safeText}</div>

        <div class="message-time">
          ${time}
        </div>

      </div>

    </div>

    <div class="menu">

      <div class="row">

        <span>
          Beri Bintang
        </span>

        <span class="icon">
          ☆
        </span>

      </div>

      <div class="row">

        <span>
          Balas
        </span>

        <span class="icon">
          ↩
        </span>

      </div>

      <div class="row">

        <span>
          Teruskan
        </span>

        <span class="icon">
          ↪
        </span>

      </div>

      <div class="row">

        <span>
          Salin
        </span>

        <span class="icon">
          ▣
        </span>

      </div>

      <div class="row">

        <span>
          Ucapkan
        </span>

        <span class="icon">
          ◌
        </span>

      </div>

      <div class="row">

        <span>
          Laporkan
        </span>

        <span class="icon">
          ⚠
        </span>

      </div>

      <div class="row delete">

        <span>
          Hapus
        </span>

        <span class="icon">
          ♲
        </span>

      </div>

    </div>

    <div class="watermark">
      NEXA • MOCKUP
    </div>

  </div>

</div>

</body>

</html>
`
}

// =====================================
// CREATE IQC
// =====================================

export async function createIqc({
  text
}) {
  const cleanText =
    String(
      text || ''
    )
      .trim()
      .slice(
        0,
        500
      )

  if (!cleanText) {
    throw new Error(
      'EMPTY_TEXT'
    )
  }

  const output =
    randomFile(
      'png'
    )

  let browser =
    null

  try {
    browser =
      await puppeteer.launch({
        executablePath:
          getChromiumPath(),

        headless:
          true,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      })

    const page =
      await browser.newPage()

    await page.setViewport({
      width:
        720,

      height:
        1400,

      deviceScaleFactor:
        1
    })

    await page.setContent(
      buildHtml({
        text:
          cleanText
      }),
      {
        waitUntil:
          'domcontentloaded'
      }
    )

    const element =
      await page.$(
        '.capture'
      )

    if (!element) {
      throw new Error(
        'IQC_CAPTURE_NOT_FOUND'
      )
    }

    await element.screenshot({
      path:
        output,

      type:
        'png'
    })

    return {
      path:
        output,

      buffer:
        fs.readFileSync(
          output
        ),

      cleanup() {
        safeDelete(
          output
        )
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
  }
}
