import fs from 'fs'

const FILE =
  './database/bot.json'

function ensure() {
  if (!fs.existsSync('./database')) {
    fs.mkdirSync(
      './database',
      {
        recursive: true
      }
    )
  }

  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(
      FILE,
      JSON.stringify(
        {
          antiSpam: true,
          rejectCall: true,
          callMode: 'warn',

          spam: {
            max: 5,
            windowMs: 8000,
            cooldownMs: 15000
          }
        },
        null,
        2
      )
    )
  }
}

export function getBotDB() {
  ensure()

  try {
    const data =
      JSON.parse(
        fs.readFileSync(
          FILE,
          'utf8'
        )
      )

    return {
      ...data,

      antiSpam:
        data.antiSpam ?? true,

      rejectCall:
        data.rejectCall ?? true,

      callMode:
        data.callMode || 'warn',

      spam: {
        max:
          data.spam?.max ?? 5,

        windowMs:
          data.spam?.windowMs ??
          8000,

        cooldownMs:
          data.spam
            ?.cooldownMs ??
          15000
      }
    }
  } catch {
    return {
      antiSpam: true,
      rejectCall: true,
      callMode: 'warn',

      spam: {
        max: 5,
        windowMs: 8000,
        cooldownMs: 15000
      }
    }
  }
}

export function updateBotDB(
  changes
) {
  const current =
    getBotDB()

  const next = {
    ...current,
    ...changes,

    spam: {
      ...current.spam,
      ...(changes.spam || {})
    }
  }

  fs.writeFileSync(
    FILE,
    JSON.stringify(
      next,
      null,
      2
    )
  )

  return next
}
