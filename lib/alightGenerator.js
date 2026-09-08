// ============================================
// ALIGHT MOTION PREMIUM GENERATOR
// Untuk NEXA-BOT WhatsApp
// ============================================

import axios from 'axios'

const BASE_URL = 'https://satriam.satriadeveloperz.workers.dev'

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    'Content-Type': 'application/json',
    'Origin': 'https://satriam.satriadeveloperz.workers.dev',
    'Referer': 'https://satriam.satriadeveloperz.workers.dev/'
}

// ============================================
// STORAGE SEMENTARA (per chat)
// ============================================

const userSessions = new Map()

function sessionKey(sender) {
    return String(sender || '').trim().toLowerCase()
}

// ============================================
// FUNGSI GENERATOR
// ============================================

async function sendMagicLink(email) {
    const res = await axios.post(`${BASE_URL}/api/satriam/send-link`,
        { email },
        { headers: HEADERS, timeout: 15000 }
    )
    if (!res.data?.success) {
        throw new Error(res.data?.message || 'Gagal kirim link')
    }
    return res.data
}

async function verifyMagicLink(email, magicLink) {
    const res = await axios.post(`${BASE_URL}/api/satriam/verify-link`,
        { email, magicLink },
        { headers: HEADERS, timeout: 15000 }
    )
    if (!res.data?.success) {
        throw new Error(res.data?.message || 'Verifikasi gagal')
    }
    return res.data
}

// ============================================
// COMMAND HANDLER
// ============================================

export async function handleAlightCommand({ sock, msg, jid, email, config, isOwner }) {
    const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || jid
    const key = sessionKey(sender)

    try {
        const result = await sendMagicLink(email)

        if (!userSessions.has(key)) {
            userSessions.set(key, {})
        }
        const session = userSessions.get(key)
        session.email = email
        session.step = 'waiting_link'

        setTimeout(() => {
            if (userSessions.has(key) && userSessions.get(key)?.step === 'waiting_link') {
                userSessions.delete(key)
            }
        }, 5 * 60 * 1000)

        return {
            reply: `✅ *Magic Link terkirim!*\n\n📧 Email: ${email}\n📌 Status: ${result.message}\n\n⚠️ Cek inbox/spam, lalu kirim link dengan:\n*.verify <paste_link_here>*`
        }
    } catch (err) {
        return {
            reply: `❌ *Error:* ${err.message}`
        }
    }
}

export async function handleVerifyCommand({ sock, msg, jid, magicLink, config, isOwner }) {
    const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || jid
    const key = sessionKey(sender)

    const session = userSessions.get(key)

    if (!session || !session.email) {
        return {
            reply: '❌ *Belum ada sesi!*\nGunakan *.alight <email>* dulu.'
        }
    }

    const email = session.email

    try {
        const result = await verifyMagicLink(email, magicLink)

        userSessions.delete(key)

        let features = result.features?.map(f => `✅ ${f}`).join('\n') || 'Tidak ada data'

        return {
            reply: `🎉 *ALIGHT MOTION PREMIUM AKTIF!*\n\n` +
                   `📧 Email: ${result.email}\n` +
                   `🔑 UID: ${result.uid}\n` +
                   `💎 Plan: ${result.planName}\n` +
                   `📅 Valid Until: ${result.validUntil}\n` +
                   `🆔 Order ID: ${result.orderId || 'Tidak tersedia'}\n\n` +
                   `🔓 *Fitur Premium:*\n${features}\n\n` +
                   `📝 *Token:*\n${result.idToken?.substring(0, 50)}...`
        }
    } catch (err) {
        return {
            reply: `❌ *Verifikasi Gagal:* ${err.message}`
        }
    }
}
