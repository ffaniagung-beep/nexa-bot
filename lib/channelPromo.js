// NEXA CHANNEL PROMO CONTEXT V1
const DEFAULT_RETRY_MS = 10 * 60 * 1000

function clean(value) {
  return String(value || '').trim()
}

function inviteCodeFrom(value) {
  const raw = clean(value)
  if (!raw) return ''
  const match = raw.match(/(?:whatsapp\.com\/channel\/)?([A-Za-z0-9_-]{10,})/i)
  return match?.[1] || ''
}

function isNormalChatJid(jid) {
  const value = clean(jid)
  if (!value) return false
  if (value === 'status@broadcast') return false
  if (value.endsWith('@newsletter')) return false
  if (value.endsWith('@broadcast')) return false
  return true
}

function shouldDecorate(content) {
  if (!content || typeof content !== 'object') return false
  const skipKeys = [
    'delete',
    'edit',
    'react',
    'protocolMessage',
    'statusNotification',
    'statusStickerInteraction'
  ]
  return !skipKeys.some(key => key in content)
}

function readChannelMeta(meta) {
  const jid = clean(
    meta?.id ||
    meta?.jid ||
    meta?.newsletterJid ||
    meta?.thread_metadata?.jid
  )

  const name = clean(
    meta?.name ||
    meta?.newsletterName ||
    meta?.thread_metadata?.name ||
    meta?.thread_metadata?.title
  )

  if (!jid.endsWith('@newsletter') || !name) {
    return null
  }

  return { jid, name }
}

export function installChannelPromo(
  sock,
  {
    inviteUrl,
    retryMs = DEFAULT_RETRY_MS,
    serverMessageId = 1
  } = {}
) {
  if (!sock || typeof sock.sendMessage !== 'function') {
    throw new Error('Socket WhatsApp tidak valid untuk Channel Promo.')
  }

  if (sock.__nexaChannelPromoInstalled) {
    return sock
  }

  const inviteCode = inviteCodeFrom(inviteUrl)

  if (!inviteCode) {
    console.log('⚠️ Channel promo: invite code tidak valid.')
    return sock
  }

  const originalSendMessage = sock.sendMessage.bind(sock)

  let promo = null
  let pending = null
  let lastAttempt = 0
  let lastErrorLog = 0

  async function resolvePromo() {
    if (promo) return promo
    if (pending) return pending

    const now = Date.now()
    if (lastAttempt && now - lastAttempt < retryMs) {
      return null
    }

    lastAttempt = now

    pending = (async () => {
      try {
        if (typeof sock.newsletterMetadata !== 'function') {
          throw new Error('newsletterMetadata() tidak tersedia di Baileys ini.')
        }

        const metadata = await sock.newsletterMetadata(
          'invite',
          inviteCode
        )

        const found = readChannelMeta(metadata)
        if (!found) {
          throw new Error('Metadata saluran tidak berisi JID/nama yang valid.')
        }

        promo = found
        console.log(`📢 Channel promo ready: ${promo.name} (${promo.jid})`)
        return promo
      } catch (error) {
        if (Date.now() - lastErrorLog > 60_000) {
          lastErrorLog = Date.now()
          console.log(
            '⚠️ Channel promo metadata:',
            error?.message || error
          )
        }
        return null
      } finally {
        pending = null
      }
    })()

    return pending
  }

  void resolvePromo()

  sock.sendMessage = async function nexaSendMessage(
    jid,
    content,
    options
  ) {
    if (!isNormalChatJid(jid) || !shouldDecorate(content)) {
      return originalSendMessage(jid, content, options)
    }

    const currentPromo = promo || await resolvePromo()
    if (!currentPromo) {
      return originalSendMessage(jid, content, options)
    }

    const existingContext =
      content?.contextInfo && typeof content.contextInfo === 'object'
        ? content.contextInfo
        : {}

    const decorated = {
      ...content,
      contextInfo: {
        ...existingContext,
        forwardingScore: Math.max(
          Number(existingContext.forwardingScore) || 0,
          1
        ),
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: currentPromo.jid,
          serverMessageId: Number(serverMessageId) || 1,
          newsletterName: currentPromo.name
        }
      }
    }

    return originalSendMessage(jid, decorated, options)
  }

  Object.defineProperty(
    sock,
    '__nexaChannelPromoInstalled',
    {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false
    }
  )

  return sock
}
