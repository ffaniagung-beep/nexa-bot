import {
  getMaintenance,
  setMaintenance
} from '../lib/maintenance.js'

export default {
  name:
    'maintenance',

  aliases: [
    'maint',
    'mt'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  description:
    'Mengaktifkan atau mematikan maintenance global',

  usage:
    '.maintenance on/off/status',

  async run({
    sock,
    msg,
    jid,
    args,
    config
  }) {
    const action =
      String(
        args?.[0] || ''
      )
        .trim()
        .toLowerCase()

    // ================================
    // STATUS
    // ================================

    if (
      !action ||
      action === 'status'
    ) {
      const data =
        getMaintenance()

      return sock.sendMessage(
        jid,
        {
          text:
            `🛠️ *MAINTENANCE STATUS*\n\n` +
            `Status: ${
              data.enabled
                ? '🔴 ON'
                : '🟢 OFF'
            }\n\n` +
            `Pesan maintenance:\n` +
            `${data.message}`
        },
        {
          quoted: msg
        }
      )
    }

    // ================================
    // ON
    // ================================

    if (
      action === 'on'
    ) {
      const customMessage =
        args
          .slice(1)
          .join(' ')
          .trim()

      const data =
        setMaintenance(
          true,
          customMessage || null
        )

      return sock.sendMessage(
        jid,
        {
          text:
            `🔴 *MAINTENANCE ON*\n\n` +
            `NEXA sekarang masuk mode maintenance.\n\n` +
            `👑 Owner tetap bisa menggunakan bot.\n` +
            `👤 User biasa sementara diblokir dari command.\n\n` +
            `Pesan:\n${data.message}`
        },
        {
          quoted: msg
        }
      )
    }

    // ================================
    // OFF
    // ================================

    if (
      action === 'off'
    ) {
      setMaintenance(
        false
      )

      return sock.sendMessage(
        jid,
        {
          text:
            `🟢 *MAINTENANCE OFF*\n\n` +
            `NEXA kembali normal.\n` +
            `Semua user sudah bisa menggunakan command lagi. 🚀`
        },
        {
          quoted: msg
        }
      )
    }

    // ================================
    // INVALID
    // ================================

    return sock.sendMessage(
      jid,
      {
        text:
          `🛠️ *MAINTENANCE*\n\n` +
          `Gunakan:\n` +
          `*${config.prefix}maintenance on*\n` +
          `*${config.prefix}maintenance off*\n` +
          `*${config.prefix}maintenance status*\n\n` +
          `Custom message:\n` +
          `*${config.prefix}maintenance on Lagi update fitur bentar 😭*`
      },
      {
        quoted: msg
      }
    )
  }
}
