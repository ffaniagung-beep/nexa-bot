import {
  getGroupConfig,
  updateGroupConfig
} from './groupdb.js'

const PROTECTED_COMMANDS =
  new Set([
    'menu',
    'offcmd',
    'oncmd',
    'offcmdlist'
  ])

function normalizeCommandName(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
}

function normalizeDisabledList(
  value
) {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value
        .map(normalizeCommandName)
        .filter(Boolean)
    )
  ]
}

function normalizeMeta(
  value
) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
      ? { ...value }
      : {}
  )
}

export function isProtectedGroupCommand(
  commandName
) {
  return PROTECTED_COMMANDS.has(
    normalizeCommandName(
      commandName
    )
  )
}

export function getDisabledGroupCommands(
  groupJid
) {
  const config =
    getGroupConfig(
      groupJid
    )

  return normalizeDisabledList(
    config.disabledCommands
  )
}

export function getDisabledGroupCommandMeta(
  groupJid
) {
  const config =
    getGroupConfig(
      groupJid
    )

  return normalizeMeta(
    config.disabledCommandMeta
  )
}

export function isGroupCommandDisabled(
  groupJid,
  commandName
) {
  const canonical =
    normalizeCommandName(
      commandName
    )

  if (
    !canonical ||
    isProtectedGroupCommand(
      canonical
    )
  ) {
    return false
  }

  return getDisabledGroupCommands(
    groupJid
  ).includes(
    canonical
  )
}

export function disableGroupCommand({
  groupJid,
  commandName,
  disabledBy = null
}) {
  const canonical =
    normalizeCommandName(
      commandName
    )

  if (!canonical) {
    return {
      changed: false,
      reason: 'invalid'
    }
  }

  if (
    isProtectedGroupCommand(
      canonical
    )
  ) {
    return {
      changed: false,
      reason: 'protected'
    }
  }

  const current =
    getGroupConfig(
      groupJid
    )

  const disabled =
    normalizeDisabledList(
      current.disabledCommands
    )

  const meta =
    normalizeMeta(
      current.disabledCommandMeta
    )

  if (
    disabled.includes(
      canonical
    )
  ) {
    return {
      changed: false,
      reason: 'already-disabled',
      disabled
    }
  }

  disabled.push(
    canonical
  )

  disabled.sort()

  meta[canonical] = {
    by:
      disabledBy
        ? String(disabledBy)
        : null,
    at:
      Date.now()
  }

  updateGroupConfig(
    groupJid,
    {
      disabledCommands:
        disabled,
      disabledCommandMeta:
        meta
    }
  )

  return {
    changed: true,
    reason: 'disabled',
    disabled
  }
}

export function enableGroupCommand({
  groupJid,
  commandName
}) {
  const canonical =
    normalizeCommandName(
      commandName
    )

  if (!canonical) {
    return {
      changed: false,
      reason: 'invalid'
    }
  }

  const current =
    getGroupConfig(
      groupJid
    )

  const disabled =
    normalizeDisabledList(
      current.disabledCommands
    )

  const meta =
    normalizeMeta(
      current.disabledCommandMeta
    )

  if (
    !disabled.includes(
      canonical
    )
  ) {
    return {
      changed: false,
      reason: 'already-enabled',
      disabled
    }
  }

  const next =
    disabled.filter(
      name =>
        name !== canonical
    )

  delete meta[canonical]

  updateGroupConfig(
    groupJid,
    {
      disabledCommands:
        next,
      disabledCommandMeta:
        meta
    }
  )

  return {
    changed: true,
    reason: 'enabled',
    disabled:
      next
  }
}
