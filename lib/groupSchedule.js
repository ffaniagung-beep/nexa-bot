import {
  readGroups,
  getGroupConfig,
  updateGroupConfig
} from './groupdb.js'

const TIMEZONE = 'Asia/Jakarta'
const CHECK_INTERVAL_MS = 30_000

let intervalId = null
let warmupId = null
let running = false

function normalizeTime(value) {
  const text = String(value || '').trim()
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  return `${match[1]}:${match[2]}`
}

function timeToMinutes(value) {
  const normalized = normalizeTime(value)
  if (!normalized) return null
  const [hour, minute] = normalized.split(':').map(Number)
  return hour * 60 + minute
}

function getLocalParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }
  )

  const parts = {}
  for (const item of formatter.formatToParts(date)) {
    if (item.type !== 'literal') {
      parts[item.type] = item.value
    }
  }

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey:
      `${String(year).padStart(4, '0')}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`
  }
}

function previousDateKey({ year, month, day }) {
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)

  return (
    `${String(date.getUTCFullYear()).padStart(4, '0')}-` +
    `${String(date.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getUTCDate()).padStart(2, '0')}`
  )
}

function normalizeSchedule(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const closeAt = normalizeTime(value.closeAt)
  const openAt = normalizeTime(value.openAt)

  if (
    !closeAt ||
    !openAt ||
    closeAt === openAt
  ) {
    return null
  }

  return {
    ...value,
    enabled: value.enabled === true,
    closeAt,
    openAt,
    timezone: TIMEZONE
  }
}

function latestBoundary(schedule, now = new Date()) {
  const closeMinute = timeToMinutes(schedule.closeAt)
  const openMinute = timeToMinutes(schedule.openAt)
  const local = getLocalParts(now)
  const currentMinute = local.hour * 60 + local.minute
  const previousKey = previousDateKey(local)

  const candidates = [
    {
      kind: 'close',
      dateKey: previousKey,
      time: schedule.closeAt,
      score: -1440 + closeMinute
    },
    {
      kind: 'open',
      dateKey: previousKey,
      time: schedule.openAt,
      score: -1440 + openMinute
    }
  ]

  if (closeMinute <= currentMinute) {
    candidates.push({
      kind: 'close',
      dateKey: local.dateKey,
      time: schedule.closeAt,
      score: closeMinute
    })
  }

  if (openMinute <= currentMinute) {
    candidates.push({
      kind: 'open',
      dateKey: local.dateKey,
      time: schedule.openAt,
      score: openMinute
    })
  }

  candidates.sort((a, b) => b.score - a.score)

  const latest = candidates[0]

  return {
    ...latest,
    id: `${latest.dateKey}|${latest.kind}|${latest.time}`
  }
}

export function getGroupSchedule(groupJid) {
  return normalizeSchedule(
    getGroupConfig(groupJid).groupSchedule
  )
}

export function setGroupSchedule(
  groupJid,
  {
    closeAt,
    openAt,
    updatedBy = null
  }
) {
  const close = normalizeTime(closeAt)
  const open = normalizeTime(openAt)

  if (!close || !open) {
    throw new Error('INVALID_TIME')
  }

  if (close === open) {
    throw new Error('SAME_TIME')
  }

  const schedule = {
    enabled: true,
    closeAt: close,
    openAt: open,
    timezone: TIMEZONE,
    updatedAt: Date.now(),
    updatedBy: updatedBy ? String(updatedBy) : null,
    lastAppliedEventId: null,
    lastAppliedAt: null,
    lastAppliedState: null
  }

  // Saat jadwal baru dibuat, jangan langsung mengubah
  // kondisi grup. Aksi pertama terjadi di boundary berikutnya.
  // Kalau bot restart dan melewatkan boundary, scheduler
  // tetap bisa catch-up karena event ID tersimpan.
  const currentBoundary =
    latestBoundary(
      schedule
    )

  schedule.lastAppliedEventId =
    currentBoundary.id

  schedule.lastAppliedAt =
    Date.now()

  schedule.lastAppliedState =
    currentBoundary.kind

  updateGroupConfig(
    groupJid,
    {
      groupSchedule: schedule
    }
  )

  return schedule
}

export function disableGroupSchedule(groupJid) {
  const current = getGroupSchedule(groupJid)

  if (!current) {
    return null
  }

  const next = {
    ...current,
    enabled: false,
    disabledAt: Date.now()
  }

  updateGroupConfig(
    groupJid,
    {
      groupSchedule: next
    }
  )

  return next
}

export async function closeGroupNow(sock, groupJid) {
  await sock.groupSettingUpdate(
    groupJid,
    'announcement'
  )
}

export async function openGroupNow(sock, groupJid) {
  await sock.groupSettingUpdate(
    groupJid,
    'not_announcement'
  )
}

function closeMessage() {
  return (
    `✦ *NEXA • GROUP CONTROL*\n\n` +
    `🔒 Grup ditutup.\n\n` +
    `Hanya Admin yang dapat mengirim pesan.\n` +
    `🌙 Sampai jumpa besok, warga sekalian 🗿`
  )
}

function openMessage() {
  return (
    `✦ *NEXA • GROUP CONTROL*\n\n` +
    `🔓 Grup dibuka kembali.\n\n` +
    `Semua anggota sekarang dapat mengirim pesan.\n` +
    `☀️ Silakan berisik lagi 😹`
  )
}

async function applyBoundary(
  sock,
  groupJid,
  schedule,
  boundary
) {
  if (boundary.kind === 'close') {
    await closeGroupNow(sock, groupJid)
  } else {
    await openGroupNow(sock, groupJid)
  }

  try {
    await sock.sendMessage(
      groupJid,
      {
        text:
          boundary.kind === 'close'
            ? closeMessage()
            : openMessage()
      }
    )
  } catch (error) {
    console.error(
      `🕒 Group schedule notice ${groupJid}:`,
      error?.message || error
    )
  }

  const fresh = getGroupSchedule(groupJid)

  if (
    !fresh ||
    !fresh.enabled ||
    fresh.closeAt !== schedule.closeAt ||
    fresh.openAt !== schedule.openAt
  ) {
    return
  }

  updateGroupConfig(
    groupJid,
    {
      groupSchedule: {
        ...fresh,
        lastAppliedEventId: boundary.id,
        lastAppliedAt: Date.now(),
        lastAppliedState: boundary.kind
      }
    }
  )
}

export async function runGroupScheduleFor(
  sock,
  groupJid,
  now = new Date()
) {
  const schedule = getGroupSchedule(groupJid)

  if (!schedule || !schedule.enabled) {
    return {
      applied: false,
      reason: 'disabled'
    }
  }

  const boundary = latestBoundary(schedule, now)

  if (schedule.lastAppliedEventId === boundary.id) {
    return {
      applied: false,
      reason: 'already-applied',
      boundary
    }
  }

  await applyBoundary(
    sock,
    groupJid,
    schedule,
    boundary
  )

  return {
    applied: true,
    boundary
  }
}

async function tick(sock) {
  if (running) {
    return
  }

  running = true

  try {
    const groups = readGroups()

    for (const [groupJid, config] of Object.entries(groups)) {
      if (!groupJid.endsWith('@g.us')) {
        continue
      }

      const schedule = normalizeSchedule(
        config?.groupSchedule
      )

      if (!schedule || !schedule.enabled) {
        continue
      }

      try {
        await runGroupScheduleFor(
          sock,
          groupJid
        )
      } catch (error) {
        console.error(
          `🕒 Group schedule ${groupJid}:`,
          error?.message || error
        )
      }
    }
  } finally {
    running = false
  }
}

export function startGroupScheduleService(sock) {
  if (warmupId) {
    clearTimeout(warmupId)
    warmupId = null
  }

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }

  if (
    !sock ||
    typeof sock.groupSettingUpdate !== 'function'
  ) {
    console.log(
      '⚠️ Group Schedule: socket tidak mendukung groupSettingUpdate.'
    )
    return
  }

  warmupId = setTimeout(
    () => {
      tick(sock).catch(error => {
        console.error(
          '🕒 Group schedule warmup:',
          error?.message || error
        )
      })
    },
    5_000
  )

  intervalId = setInterval(
    () => {
      tick(sock).catch(error => {
        console.error(
          '🕒 Group schedule tick:',
          error?.message || error
        )
      })
    },
    CHECK_INTERVAL_MS
  )

  if (typeof intervalId?.unref === 'function') {
    intervalId.unref()
  }

  if (typeof warmupId?.unref === 'function') {
    warmupId.unref()
  }

  console.log(
    '🕒 Group Schedule service aktif (WIB).'
  )
}
