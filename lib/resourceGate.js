// NEXA RESOURCE GATE V1
import {
  statfsSync
} from 'node:fs'

import {
  randomUUID
} from 'node:crypto'

import {
  DatabaseSync
} from 'node:sqlite'

import {
  tmpdir
} from 'node:os'

const db =
  new DatabaseSync(
    './database/nexa.sqlite',
    {
      timeout: 10000
    }
  )

db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS resource_jobs (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS
    idx_resource_jobs_kind_exp
  ON resource_jobs(
    kind,
    expires_at
  );

  CREATE INDEX IF NOT EXISTS
    idx_resource_jobs_owner_exp
  ON resource_jobs(
    owner_key,
    expires_at
  );
`)

export const ONE_MIB =
  1024 * 1024

export const ONE_GIB =
  1024 * 1024 * 1024

export const SERVER_DISK_RESERVE_BYTES =
  5 * ONE_GIB

function cleanKey(
  value,
  fallback =
    'unknown'
) {
  const text =
    String(
      value || ''
    )
      .trim()
      .toLowerCase()

  return (
    text ||
    fallback
  )
}

function positiveInt(
  value,
  fallback
) {
  const number =
    Math.trunc(
      Number(value) ||
      0
    )

  return number > 0
    ? number
    : fallback
}

function rollback() {
  try {
    db.exec(
      'ROLLBACK'
    )
  } catch {}
}

export function acquireResourceJob({
  kind,
  ownerKey,
  globalLimit = 2,
  perOwnerLimit = 1,
  ttlMs =
    30 * 60 * 1000
}) {
  const cleanKind =
    cleanKey(
      kind,
      'heavy'
    )

  const cleanOwner =
    cleanKey(
      ownerKey,
      'anonymous'
    )

  const maxGlobal =
    positiveInt(
      globalLimit,
      1
    )

  const maxOwner =
    positiveInt(
      perOwnerLimit,
      1
    )

  const ttl =
    Math.max(
      30_000,
      Math.trunc(
        Number(ttlMs) ||
        0
      )
    )

  const now =
    Date.now()

  const token =
    randomUUID()

  db.exec(
    'BEGIN IMMEDIATE'
  )

  try {
    db.prepare(`
      DELETE FROM resource_jobs
      WHERE expires_at <= ?
    `).run(
      now
    )

    const globalRow =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM resource_jobs
        WHERE kind = ?
          AND expires_at > ?
      `).get(
        cleanKind,
        now
      )

    const globalActive =
      Number(
        globalRow?.total
      ) || 0

    if (
      globalActive >=
      maxGlobal
    ) {
      rollback()

      return {
        ok: false,
        reason:
          'GLOBAL_BUSY',
        active:
          globalActive,
        limit:
          maxGlobal
      }
    }

    const ownerRow =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM resource_jobs
        WHERE kind = ?
          AND owner_key = ?
          AND expires_at > ?
      `).get(
        cleanKind,
        cleanOwner,
        now
      )

    const ownerActive =
      Number(
        ownerRow?.total
      ) || 0

    if (
      ownerActive >=
      maxOwner
    ) {
      rollback()

      return {
        ok: false,
        reason:
          'USER_BUSY',
        active:
          ownerActive,
        limit:
          maxOwner
      }
    }

    db.prepare(`
      INSERT INTO resource_jobs (
        token,
        kind,
        owner_key,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      token,
      cleanKind,
      cleanOwner,
      now + ttl,
      now
    )

    db.exec(
      'COMMIT'
    )
  } catch (
    error
  ) {
    rollback()
    throw error
  }

  let released =
    false

  return {
    ok: true,
    token,
    kind:
      cleanKind,
    ownerKey:
      cleanOwner,

    release() {
      if (released) {
        return false
      }

      released =
        true

      try {
        db.prepare(`
          DELETE FROM resource_jobs
          WHERE token = ?
        `).run(
          token
        )
      } catch (
        error
      ) {
        console.error(
          '[RESOURCE GATE] release:',
          error
        )
      }

      return true
    }
  }
}

export function getFreeDiskBytes(
  target =
    tmpdir()
) {
  const info =
    statfsSync(
      target
    )

  const blockSize =
    Number(
      info.bsize ||
      info.frsize ||
      0
    )

  const availableBlocks =
    Number(
      info.bavail ??
      info.bfree ??
      0
    )

  const bytes =
    blockSize *
    availableBlocks

  return Number.isFinite(
    bytes
  )
    ? Math.max(
        0,
        bytes
      )
    : 0
}

export function ensureDiskHeadroom(
  requiredBytes = 0,
  {
    target =
      tmpdir(),
    reserveBytes =
      SERVER_DISK_RESERVE_BYTES
  } = {}
) {
  const fileBytes =
    Math.max(
      0,
      Number(
        requiredBytes
      ) || 0
    )

  const reserve =
    Math.max(
      ONE_GIB,
      Number(
        reserveBytes
      ) ||
      SERVER_DISK_RESERVE_BYTES
    )

  // Keep the fixed safety reserve plus roughly two copies of the
  // requested file (download + upload/temporary overhead).
  const needed =
    reserve +
    fileBytes * 2

  const available =
    getFreeDiskBytes(
      target
    )

  if (
    available <
    needed
  ) {
    throw Object.assign(
      new Error(
        'SERVER_DISK_LOW'
      ),
      {
        availableBytes:
          available,
        neededBytes:
          needed,
        requestedBytes:
          fileBytes
      }
    )
  }

  return {
    ok: true,
    availableBytes:
      available,
    neededBytes:
      needed,
    requestedBytes:
      fileBytes
  }
}

export function getDownloadLimitCost(
  bytes,
  {
    premium = false
  } = {}
) {
  const size =
    Number(bytes)

  const known =
    Number.isFinite(size) &&
    size > 0

  if (!known) {
    // Kalau ukuran belum diketahui, reserve tier tertinggi dulu.
    // Setelah file selesai, billing akan menyesuaikan turun dan refund selisih.
    return premium
      ? 8
      : 15
  }

  if (
    size <=
    100 * ONE_MIB
  ) {
    return premium
      ? 2
      : 3
  }

  if (
    size <=
    300 * ONE_MIB
  ) {
    return premium
      ? 3
      : 5
  }

  if (
    size <=
    600 * ONE_MIB
  ) {
    return premium
      ? 4
      : 8
  }

  return premium
    ? 8
    : 15
}

export function resourceBusyText(
  result,
  label =
    'proses berat'
) {
  if (
    result?.reason ===
    'USER_BUSY'
  ) {
    return (
      `⏳ Kamu masih punya ${label} yang aktif. ` +
      `Tunggu proses sebelumnya selesai.`
    )
  }

  return (
    `⏳ Server sedang menangani terlalu banyak ${label}. ` +
    `Coba lagi setelah salah satu selesai.`
  )
}

export function formatResourceBytes(
  value
) {
  const size =
    Number(value)

  if (
    !Number.isFinite(size) ||
    size < 0
  ) {
    return '-'
  }

  if (
    size <
    1024
  ) {
    return `${size} B`
  }

  const units = [
    'KB',
    'MB',
    'GB',
    'TB'
  ]

  let current =
    size / 1024

  let unit =
    units[0]

  for (
    let i = 1;
    i < units.length &&
    current >= 1024;
    i += 1
  ) {
    current /=
      1024

    unit =
      units[i]
  }

  return (
    `${current.toFixed(2)} ${unit}`
  )
}
