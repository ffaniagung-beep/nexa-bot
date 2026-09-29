import fs from 'node:fs'
import {
  getGroupConfig,
  updateGroupConfig
} from './groupdb.js'

const LEGACY_FILE =
  './database/groupIntro.json'

function migrateLegacyIntroOnceFor(
  groupJid
) {
  const current =
    getGroupConfig(groupJid)

  if (current.introduced) {
    return current
  }

  try {
    const legacy =
      JSON.parse(
        fs.readFileSync(
          LEGACY_FILE,
          'utf8'
        )
      )

    const old =
      legacy?.[groupJid]

    if (old?.introduced) {
      return updateGroupConfig(
        groupJid,
        {
          introduced: true,
          introducedAt:
            Number(
              old.introducedAt
            ) ||
            Date.now()
        }
      )
    }
  } catch {}

  return current
}

export function hasIntroduced(
  groupJid
) {
  return Boolean(
    migrateLegacyIntroOnceFor(
      groupJid
    ).introduced
  )
}

export function markIntroduced(
  groupJid
) {
  updateGroupConfig(
    groupJid,
    {
      introduced: true,
      introducedAt:
        Date.now()
    }
  )

  return true
}
