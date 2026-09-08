import fs from 'fs'
import path from 'path'
import pino from 'pino'

import {
  downloadMediaMessage
} from '@whiskeysockets/baileys'

const logger =
  pino({
    level: 'silent'
  })

function getQuotedImage(
  msg,
  jid
) {
  const context =
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo

  const quotedMessage =
    context?.quotedMessage

  if (
    !quotedMessage
      ?.imageMessage
  ) {
    return null
  }

  return {
    key: {
      remoteJid:
        jid,

      fromMe:
        false,

      id:
        context.stanzaId,

      participant:
        context.participant
    },

    message:
      quotedMessage
  }
}

export default {
  name: 'setpp',

  aliases: [
    'setppbot'
  ],

  category: 'OWNER',
  ownerOnly: true,

  description:
    'Mengganti foto profil bot',

  usage:
    '.setpp (reply foto)',

  async run({
    sock,
    msg,
    jid
  }) {
    let mediaMessage = null

    // Foto dikirim langsung
    // dengan caption .setpp
    if (
      msg?.message
        ?.imageMessage
    ) {
      mediaMessage =
        msg
    } else {
      // Atau command .setpp
      // me-reply sebuah foto
      mediaMessage =
        getQuotedImage(
          msg,
          jid
        )
    }

    if (!mediaMessage) {
      return sock.sendMessage(
        jid,
        {
          text:
            `🖼️ Kirim foto dengan caption *.setpp*\n` +
            `atau reply sebuah foto dengan *.setpp*.`
        },
        {
          quoted: msg
        }
      )
    }

    const tempDir =
      './temp'

    fs.mkdirSync(
      tempDir,
      {
        recursive: true
      }
    )

    const tempPath =
      path.join(
        tempDir,
        `nexa-pp-${Date.now()}.jpg`
      )

    try {
      const buffer =
        await downloadMediaMessage(
          mediaMessage,
          'buffer',
          {},
          {
            logger,

            reuploadRequest:
              sock.updateMediaMessage
          }
        )

      if (
        !buffer ||
        !Buffer.isBuffer(buffer)
      ) {
        throw new Error(
          'IMAGE_DOWNLOAD_FAILED'
        )
      }

      fs.writeFileSync(
        tempPath,
        buffer
      )

      const botJid =
        sock.user?.id

      if (!botJid) {
        throw new Error(
          'BOT_JID_NOT_FOUND'
        )
      }

      await sock.updateProfilePicture(
        botJid,
        {
          url:
            tempPath
        }
      )

      await sock.sendMessage(
        jid,
        {
          text:
            '✅ Foto profil NEXA berhasil diganti. 👑'
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        '👑 setpp:',
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ Gagal mengganti foto profil bot.\n` +
            `Coba gunakan gambar JPG/PNG biasa.`
        },
        {
          quoted: msg
        }
      )
    } finally {
      try {
        if (
          fs.existsSync(
            tempPath
          )
        ) {
          fs.unlinkSync(
            tempPath
          )
        }
      } catch {}
    }
  }
}
