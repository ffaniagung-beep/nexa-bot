import {
  getGlobalSetting,
  setGlobalSetting
} from './botdb.js'

const DEFAULT_MESSAGE =
  `🛠️ *NEXA MAINTENANCE*\n\n` +
  `NEXA-BOT sedang dalam proses maintenance.\n` +
  `Beberapa fitur sementara tidak dapat digunakan.\n\n` +
  `Silakan coba lagi nanti. 🔧`

export function getMaintenance() {
  const maintenance =
    getGlobalSetting(
      'maintenance',
      {}
    ) || {}

  return {
    enabled:
      maintenance.enabled ===
      true,

    message:
      maintenance.message ||
      DEFAULT_MESSAGE,

    updatedAt:
      maintenance.updatedAt ||
      null
  }
}

export function isMaintenance() {
  return (
    getMaintenance()
      .enabled === true
  )
}

export function setMaintenance(
  enabled,
  message = null
) {
  const old =
    getMaintenance()

  const next = {
    enabled:
      Boolean(enabled),

    message:
      message?.trim() ||
      old.message ||
      DEFAULT_MESSAGE,

    updatedAt:
      Date.now()
  }

  setGlobalSetting(
    'maintenance',
    next
  )

  return next
}

export function getMaintenanceMessage() {
  return (
    getMaintenance()
      .message
  )
}
