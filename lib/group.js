import {
  areJidsSameUser
} from '@whiskeysockets/baileys'

export function isGroup(jid) {
  return jid?.endsWith('@g.us')
}

export function getSender(msg) {
  return (
    msg.key.participant ||
    msg.key.participantAlt ||
    msg.participant ||
    msg.key.remoteJid
  )
}

function sameParticipant(participant, jid) {
  if (!participant || !jid) return false

  return (
    areJidsSameUser(participant.id, jid) ||
    areJidsSameUser(participant.phoneNumber, jid) ||
    areJidsSameUser(participant.lid, jid)
  )
}

function hasAdmin(participant) {
  return (
    participant?.admin === 'admin' ||
    participant?.admin === 'superadmin'
  )
}

export async function getGroupInfo(
  sock,
  jid,
  msg
) {
  if (!isGroup(jid)) {
    return {
      isGroup: false,
      metadata: null,
      sender: null,
      isAdmin: false,
      isBotAdmin: false
    }
  }

  const metadata =
    await sock.groupMetadata(jid)

  const sender =
    getSender(msg)

  const botPn =
    sock.user?.id

  const botLid =
    sock.user?.lid

  // Cari pengirim
  const senderParticipant =
    metadata.participants.find(p =>
      sameParticipant(p, sender)
    )

  // Cari bot melalui PN maupun LID
  const botParticipant =
    metadata.participants.find(p => {
      return (
        sameParticipant(p, botPn) ||
        sameParticipant(p, botLid)
      )
    })

  const isAdmin =
    hasAdmin(senderParticipant)

  const isBotAdmin =
    hasAdmin(botParticipant)

  return {
    isGroup: true,
    metadata,
    sender,

    senderParticipant,
    botParticipant,

    isAdmin,
    isBotAdmin
  }
}

export function getTarget(msg) {
  const context =
    msg.message
      ?.extendedTextMessage
      ?.contextInfo

  const mentioned =
    context?.mentionedJid?.[0]

  if (mentioned) {
    return mentioned
  }

  const quoted =
    context?.participant

  if (quoted) {
    return quoted
  }

  return null
}
