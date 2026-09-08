import {
  resolveProfileJid
} from '../profile.js'

export async function getRpgJid({
  sock,
  msg,
  jid
}) {
  return resolveProfileJid(
    sock,
    msg,
    jid
  )
}

export function rpgNum(
  value
) {
  return Number(
    value || 0
  ).toLocaleString(
    'id-ID'
  )
}
