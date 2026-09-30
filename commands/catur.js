import fs from 'fs'
import path from 'path'

import { MB, sendHtmlApp } from '@rexxhayanasi/elaina-baileys'

import { getUser } from '../lib/userdb.js'
import { getProfileJid, resolveProfileJid } from '../lib/profile.js'
import {
  createChessHostedLaunchUrl,
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

    let hostedLaunchUrl = ''
    let multiplayerIssue = null

    if (multiplayerReady) {
      try {
        hostedLaunchUrl = createChessHostedLaunchUrl({
          playerJid,
          registrationVerified: registered
        })
      } catch (err) {
        multiplayerReady = false
        multiplayerIssue = String(err?.message || err || 'CHESS_LAUNCH_ERROR')
        console.error('♟️ NEXA Chess hosted multiplayer launch:', err)
      }
    }

    const html = injectConfig(
      fs.readFileSync(GAME_FILE, 'utf8'),
      {
        transport: 'hosted-multiplayer-v10',
        gatewayWsUrl: null,
        vercelUrl: realtime.vercelUrl,
        accessToken: null,
        sessionId: null,
        sessionExpiresAt: null,
        playerId: null,
        playerName: String(user?.name || 'NEXA Player').slice(0, 48),
        hostedLaunchUrl,
        hostedMode: false,
        multiplayerReady,
        isGroup,
        registered,
        multiplayerIssue
      }
    )

    try {
      const trustedSources = ['nexa.local']
      try {
        const host = realtime.vercelUrl ? new URL(realtime.vercelUrl).hostname : ''
        if (host && !trustedSources.includes(host)) trustedSources.push(host)
      } catch {}

      await sendHtmlApp(sock, jid, html, {
        title: '⚡ NEXA ARCADE',
        label: '♟️ NEXA CHESS • Android Only',
        trustedSources,
        height: 610
      })


      if (hostedLaunchUrl && !isGroup && registered) {
        const multiplayerButton = new MB.Button(sock)
          .setTitle('♟️ NEXA CHESS MULTIPLAYER')
          .setBody('Arena multiplayer dibuka sebagai halaman aman Vercel supaya realtime tidak bergantung pada WebView offline di bubble WhatsApp.')
          .setFooter('Room ID • real-time • private chat')
          .addUrl('♟️ Buka Multiplayer', hostedLaunchUrl)

        await multiplayerButton.send(jid)
      }
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
