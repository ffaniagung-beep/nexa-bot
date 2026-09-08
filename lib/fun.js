// =====================================
// NEXA FUN ENGINE
// =====================================

const recent =
  new Map()

function hash(
  value
) {
  let h =
    2166136261

  for (
    const ch
    of String(value)
  ) {
    h ^=
      ch.charCodeAt(0)

    h =
      Math.imul(
        h,
        16777619
      )
  }

  return h >>> 0
}

export function randomInt(
  min,
  max
) {
  min =
    Math.ceil(min)

  max =
    Math.floor(max)

  if (max <= min) {
    return min
  }

  return (
    min +
    Math.floor(
      Math.random() *
      (
        max -
        min +
        1
      )
    )
  )
}

// Legacy compatibility.
// Command FUN lama masih boleh memanggil
// stableInt(seed, min, max), tapi seed
// sekarang sengaja diabaikan.
export function stableInt(
  _seed,
  min,
  max
) {
  return randomInt(
    min,
    max
  )
}

export function jakartaDayKey() {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Asia/Jakarta',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit'
      }
    )
      .formatToParts(
        new Date()
      )

  const get =
    type =>
      parts.find(
        p =>
          p.type === type
      )?.value || ''

  return (
    `${get('year')}-` +
    `${get('month')}-` +
    `${get('day')}`
  )
}

export function randomItem(
  list,
  {
    key = null,
    keep = 4
  } = {}
) {
  if (
    !Array.isArray(list) ||
    !list.length
  ) {
    return null
  }

  if (!key) {
    return list[
      Math.floor(
        Math.random() *
        list.length
      )
    ]
  }

  const old =
    recent.get(key) ||
    []

  let choices =
    list.filter(
      item =>
        !old.includes(item)
    )

  if (!choices.length) {
    choices = [
      ...list
    ]
  }

  const selected =
    choices[
      Math.floor(
        Math.random() *
        choices.length
      )
    ]

  const next = [
    selected,
    ...old.filter(
      item =>
        item !== selected
    )
  ].slice(
    0,
    Math.max(
      1,
      Math.min(
        keep,
        list.length - 1
      )
    )
  )

  recent.set(
    key,
    next
  )

  return selected
}
