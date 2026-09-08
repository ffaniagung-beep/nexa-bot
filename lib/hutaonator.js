import { createHutaonator } from './hutaonator-core.js'
import { resolveProfileJid, getProfileJid } from './profile.js'
import { getUser, userKey } from './userdb.js'
const game = createHutaonator()
function contextInfo(msg) {
  let body=msg.message
  for(let i=0;i<8;i++) {
    const next=body?.ephemeralMessage?.message || body?.viewOnceMessage?.message || body?.viewOnceMessageV2?.message
    if(!next) break
    body=next
  }
  return Object.values(body || {}).find(v=>v?.contextInfo?.stanzaId)?.contextInfo
}
async function context(c) {
  const id=await resolveProfileJid(c.sock,c.msg,c.jid) || getProfileJid(c.msg,c.jid)
  if (!id) return null
  if (!c.isOwner && !getUser(id)?.registeredAt) return null
  const actor=userKey(id)
  if(!actor) return null
  return {...c,actor,prefix:c.config?.prefix || '.',quoteId:contextInfo(c.msg)?.stanzaId}
}
export async function startHutaonator(c) {
  const ctx=await context(c)
  if(ctx) return game.command(ctx,(c.args || []).join(' '))
}
export async function handleHutaonatorReply(c) {
  if(!contextInfo(c.msg)?.stanzaId) return false
  const ctx=await context(c)
  return ctx ? game.reply(ctx) : false
}
