import fs from 'fs'
import path from 'path'

import { sendHtmlApp } from '@rexxhayanasi/elaina-baileys'

import { getUser } from '../lib/userdb.js'
import { getProfileJid, resolveProfileJid } from '../lib/profile.js'
import {
  createChessMenuSession,
  getChessPublicWsUrl,
  chessMultiplayerConfigured
} from '../lib/chessRealtime.js'

const GAME_FILE = path.resolve('./arcade/chess.html')

function injectConfig(html, config) {
  return String(html).replace(
    '__NEXA_CHESS_CONFIG__',
    JSON.stringify(config).replace(/</g, '\\u003c')
  )
}

export default {
  name: 'catur',
  aliases: ['chess'],
  category: 'MINI GAME',
  description: 'Main catur vs NEXA AI atau player lain',
  usage: '.catur',

  async run({ sock, msg, jid, isOwner = false }) {
    if (!fs.existsSync(GAME_FILE)) {
      return sock.sendMessage(
        jid,
        { text: '❌ File NEXA Chess tidak ditemukan.' },
        { quoted: msg }
      )
    }

    let playerJid = null
    try {
      playerJid = await resolveProfileJid(sock, msg, jid)
    } catch {}

    playerJid =
      playerJid ||
      getProfileJid(msg, jid) ||
      msg?.key?.participantAlt ||
      msg?.key?.participant ||
      msg?.participant ||
      msg?.key?.remoteJidAlt ||
      jid

    // Core NEXA sudah punya register gate. Di sini kita hanya
    // sinkronkan status untuk UI catur, dengan Owner tetap bypass.
    // Beberapa versi Baileys bisa membawa PN/LID di field berbeda,
    // jadi cek kandidat identitas yang relevan agar UI tidak salah
    // menganggap user terdaftar sebagai belum register.
    const identityCandidates = [
      playerJid,
      msg?.key?.participantAlt,
      msg?.key?.remoteJidAlt,
      msg?.key?.participant,
      msg?.participant,
      msg?.key?.remoteJid,
      jid
    ].filter(Boolean)

    let user = null
    let registered = Boolean(isOwner)

    for (const candidate of identityCandidates) {
      const candidateUser = getUser(candidate)
      if (!user && candidateUser?.playerId) user = candidateUser
      if (candidateUser?.registeredAt) {
        user = candidateUser
        registered = true
        break
      }
    }

    user = user || getUser(playerJid)

    const isGroup = String(jid).endsWith('@g.us')
    const wsUrl = getChessPublicWsUrl()
    const multiplayerReady =
      !isGroup && registered && chessMultiplayerConfigured()

    let menuToken = null
    if (multiplayerReady) {
      const menu = createChessMenuSession({
        chatJid: jid,
        playerJid,
        registrationVerified: registered
      })
      menuToken = menu.token
    }

    const html = injectConfig(
      fs.readFileSync(GAME_FILE, 'utf8'),
      {
        wsUrl,
        menuToken,
        multiplayerReady,
        isGroup,
        registered
      }
    )

    try {
      await sendHtmlApp(sock, jid, html, {
        title: '⚡ NEXA ARCADE',
        label: '♟️ NEXA CHESS • Android Only',
        trustedSources: ['nexa.local'],
        height: 610
      })
    } catch (err) {
      console.error('♟️ NEXA Chess:', err)

      await sock.sendMessage(
        jid,
        {
          text:
            `❌ *NEXA CHESS ERROR*\n\n` +
            `${err?.message || err}`
        },
        { quoted: msg }
      )
    }
  }
}
