import fs from 'fs'

const FILE =
  './database/afk.json'

// =====================================
// DATABASE
// =====================================

function ensure() {
  if (
    !fs.existsSync(
      './database'
    )
  ) {
    fs.mkdirSync(
      './database',
      {
        recursive: true
      }
    )
  }

  if (
    !fs.existsSync(FILE)
  ) {
    fs.writeFileSync(
      FILE,
      '{}'
    )
  }
}

function read() {
  ensure()

  try {
    return JSON.parse(
      fs.readFileSync(
        FILE,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

function save(data) {
  ensure()

  fs.writeFileSync(
    FILE,
    JSON.stringify(
      data,
      null,
      2
    )
  )
}

// =====================================
// KEY
// =====================================

function key(jid) {
  return String(jid || '')
    .trim()
    .toLowerCase()
}

// =====================================
// AFK
// =====================================

export function setAfk(
  jid,
  reason = 'Tidak ada alasan'
) {
  const db =
    read()

  const id =
    key(jid)

  db[id] = {
    reason:
      String(reason || '')
        .trim() ||
      'Tidak ada alasan',

    since:
      Date.now()
  }

  save(db)

  return db[id]
}

export function getAfk(
  jid
) {
  const db =
    read()

  return (
    db[key(jid)] ||
    null
  )
}

export function removeAfk(
  jid
) {
  const db =
    read()

  const id =
    key(jid)

  const data =
    db[id]

  if (!data) {
    return null
  }

  delete db[id]

  save(db)

  return data
}

export function isAfk(
  jid
) {
  return Boolean(
    getAfk(jid)
  )
}

// =====================================
// TIME FORMAT
// =====================================

export function formatAfkDuration(
  since
) {
  const ms =
    Math.max(
      0,
      Date.now() -
      Number(since || 0)
    )

  const seconds =
    Math.floor(
      ms / 1000
    )

  if (seconds < 60) {
    return `${seconds} detik`
  }

  const minutes =
    Math.floor(
      seconds / 60
    )

  if (minutes < 60) {
    return `${minutes} menit`
  }

  const hours =
    Math.floor(
      minutes / 60
    )

  const remainingMinutes =
    minutes % 60

  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours} jam ${remainingMinutes} menit`
      : `${hours} jam`
  }

  const days =
    Math.floor(
      hours / 24
    )

  const remainingHours =
    hours % 24

  return remainingHours > 0
    ? `${days} hari ${remainingHours} jam`
    : `${days} hari`
}
