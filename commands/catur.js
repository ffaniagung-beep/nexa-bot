import fs from 'fs'
import path from 'path'

import { sendHtmlApp } from '@rexxhayanasi/elaina-baileys'

import { getUser } from '../lib/userdb.js'
import { getProfileJid, resolveProfileJid } from '../lib/profile.js'
import {
  createChessMenuSession,
  getChessRealtimeConfig,
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
    const realtime = getChessRealtimeConfig()
    let multiplayerReady =
      !isGroup && registered && chessMultiplayerConfigured()

    let session = null
    let multiplayerIssue = null

    if (multiplayerReady) {
      try {
        session = await createChessMenuSession({
          chatJid: jid,
          playerJid,
          registrationVerified: registered
        })
      } catch (err) {
        multiplayerReady = false
        multiplayerIssue = String(err?.message || err || 'CHESS_SESSION_ERROR')
        console.error('♟️ NEXA Chess Supabase/Vercel session:', err)
      }
    }

    const html = injectConfig(
      fs.readFileSync(GAME_FILE, 'utf8'),
      {
        transport: 'supabase-realtime-v1',
        supabaseUrl: realtime.supabaseUrl,
        supabaseKey: realtime.supabaseKey,
        accessToken: session?.accessToken || null,
        sessionId: session?.sessionId || null,
        sessionExpiresAt: session?.expiresAt || null,
        playerId: session?.playerId || null,
        playerName: session?.playerName || String(user?.name || 'NEXA Player').slice(0, 48),
        multiplayerReady,
        isGroup,
        registered,
        multiplayerIssue
      }
    )

    try {
      const trustedSources = ['nexa.local']
      try {
        const host = realtime.supabaseUrl ? new URL(realtime.supabaseUrl).hostname : ''
        if (host && !trustedSources.includes(host)) trustedSources.push(host)
      } catch {}

      await sendHtmlApp(sock, jid, html, {
        title: '⚡ NEXA ARCADE',
        label: '♟️ NEXA CHESS • Android Only',
        trustedSources,
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
