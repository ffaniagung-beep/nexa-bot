// API contract supplied by Haidar's HutaoNator CLI. No automatic POST retries.
const BASE = 'https://hutaonator.satriadeveloperz.workers.dev'
export async function hutaoRequest(path, body, method = 'POST') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(BASE + path, {
      method, signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!res.ok) throw new Error(`HTTP_${res.status}`)
    const data = await res.json()
    if (!data?.game || data.success === false) throw new Error('INVALID_GAME_RESPONSE')
    return data.game
  } finally { clearTimeout(timer) }
}
// Fetch the actual picture before asking Baileys to upload it.
// Timeout stays active until the response body has been consumed.
export async function fetchHutaoPhoto(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('PHOTO_URL_INVALID')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let reader
  try {
    const res = await fetch(parsed, { signal: controller.signal })
    if (!res.ok) throw new Error(`PHOTO_HTTP_${res.status}`)
    const max = 5 * 1024 * 1024
    if (Number(res.headers.get('content-length')) > max) throw new Error('PHOTO_TOO_LARGE')
    reader = res.body?.getReader()
    if (!reader) throw new Error('PHOTO_EMPTY')
    const chunks=[]
    let size=0
    while(true) {
      const {done,value}=await reader.read()
      if(done)break
      size+=value.length
      if(size>max)throw new Error('PHOTO_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
    const buffer=Buffer.concat(chunks)
    const jpeg=buffer[0]===0xff && buffer[1]===0xd8 && buffer[2]===0xff
    const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    const webp=buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP'
    if(!jpeg && !png && !webp)throw new Error('PHOTO_FORMAT_INVALID')
    return buffer
  } finally {
    clearTimeout(timer)
    controller.abort()
    if(reader)await reader.cancel().catch(()=>{})
  }
}

const ANSWERS = new Map([
  ['1', 'yes'], ['ya', 'yes'], ['iya', 'yes'], ['yes', 'yes'],
  ['2', 'no'], ['tidak', 'no'], ['no', 'no'],
  ['3', 'idk'], ['tidak tau', 'idk'], ['tidak tahu', 'idk'], ['idk', 'idk'],
  ['4', 'probably'], ['mungkin', 'probably'],
  ['5', 'probably not'], ['mungkin tidak', 'probably not']
])
const THINK = ['🤔 NEXA sedang berpikir sebentar…', '🧐 Hmm… NEXA sedang mencocokkan petunjukmu…', '💭 Sebentar, NEXA sedang mencari tebakan berikutnya…']
const clean = (v, max = 800) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max)
const frame = lines => '╭━━〔 🔮 *NEXA HUTAONATOR* 〕━━╮\n│\n' + lines.map(x => '│ ' + x).join('\n') + '\n│\n╰━━━━━━━━━━━━━━━━━━━━╯'
const fingerprint = g => JSON.stringify([g.id,g.status,g.step,g.question,g.guess?.name,g.wrongGuesses,g.revealedName])

export function createHutaonator({ request = hutaoRequest, now = Date.now, photo = fetchHutaoPhoto } = {}) {
  const sessions = new Map()
  const typing = new Map()
  function presence(sock,jid,state) {
    Promise.resolve().then(()=>sock.sendPresenceUpdate?.(state,jid)).catch(()=>{})
  }
  function beginTyping(c) {
    let entry=typing.get(c.jid)
    if(!entry) {
      entry={count:0,sock:c.sock,timer:null}
      entry.timer=setInterval(()=>presence(entry.sock,c.jid,'composing'),4000)
      entry.timer.unref?.()
      typing.set(c.jid,entry)
    }
    entry.sock=c.sock
    entry.count++
    presence(c.sock,c.jid,'composing')
    let done=false
    return ()=>{
      if(done)return
      done=true
      if(--entry.count===0) {
        clearInterval(entry.timer)
        typing.delete(c.jid)
        presence(entry.sock,c.jid,'paused')
      }
    }
  }
  const ttl = 10 * 60 * 1000
  function sweep() {
    for (const [key,s] of sessions) if (!s.busy && now() - s.touched > ttl) sessions.delete(key)
  }
  const timer = setInterval(sweep, 60000)
  timer.unref?.()
  const keyOf = c => JSON.stringify([c.jid,c.actor])
  const send = (c, text) => c.sock.sendMessage(c.jid, { text, linkPreview: null }, { quoted: c.msg })
  async function display(c,s) {
    const g = s.game
    let lines
    if (g.status === 'playing') {
      if (typeof g.question !== 'string' || !g.question.trim()) throw new Error('QUESTION_MISSING')
      lines = [`❓ *Pertanyaan ${Number(g.step || 0) + 1}*`, clean(g.question), '',
        '1. Ya', '2. Tidak', '3. Tidak tau', '4. Mungkin', '5. Mungkin tidak', '',
        `🧠 Keyakinan: ${Math.round(Math.max(0,Math.min(100,Number(g.progression)||0)))}%`,
        '💬 Reply pesan ini dengan angka atau jawaban.', '🛑 Reply *stop* untuk berhenti.']
    } else if (g.status === 'guessing' || g.status === 'won') {
      lines = [g.status === 'won' ? '🎉 *Tebakan NEXA benar!*' : '🔮 *NEXA menebak…*',
        `👤 *${clean(g.guess?.name || 'Karakter misterius',120)}*`, clean(g.guess?.description || '',350)]

      if (g.status === 'guessing') lines.push('', '1. Benar', '2. Salah', '', '💬 Reply pesan ini dengan *1* atau *2*.', '🛑 Reply *stop* untuk berhenti.')
      else lines.push('', `❓ ${Number(g.step)||0} pertanyaan`, `Main lagi: *${s.prefix}hutaonator*`)
    } else if (g.status === 'lost' && g.revealedName) {
      lines = ['✨ Terima kasih! Jawabanmu sudah dikirim.', `Main lagi: *${s.prefix}hutaonator*`]
    } else if (g.status === 'lost') {
      lines = ['🏆 *Kamu menang! NEXA menyerah.*', `❓ ${Number(g.step)||0} pertanyaan`, '',
        'Siapa karakter yang kamu pikirkan?', '💬 Reply namanya, atau *stop* untuk selesai.']
    } else if (g.status === 'abandoned') {
      lines = ['🛑 Permainan selesai.', `Main lagi: *${s.prefix}hutaonator*`]
    } else throw new Error('UNKNOWN_GAME_STATUS')
    s.prompt = null // Never accept a reply to an old question after state advancement.
    const photoUrl = ['guessing','won'].includes(g.status) && /^https:\/\//i.test(g.guess?.photo || '')
      ? g.guess.photo : null
    let out
    // Once a guess picture was delivered, the final confirmation can be text only.
    if(photoUrl && !(g.status==='won' && s.photoSent===photoUrl)) {
      try {
        const buffer=await photo(photoUrl)
        out=await c.sock.sendMessage(c.jid, {
          image:buffer, caption:frame(lines)
        }, {quoted:c.msg, mediaUploadTimeoutMs:20000})
        if(!out?.key?.id)throw new Error('PHOTO_MESSAGE_ID_MISSING')
        s.photoSent=photoUrl
      } catch(err) {
        console.error('[HUTAONATOR] photo:',err?.message || err)
        out=await send(c,frame([...lines,'','🖼️ Foto belum berhasil dikirim.',`Foto: ${clean(photoUrl,600)}`]))
      }
    } else out=await send(c,frame(lines))
    if (!out?.key?.id) throw new Error('PROMPT_ID_MISSING')
    s.prompt = out.key.id
    s.touched = now()
    if (['won','abandoned'].includes(g.status) || (g.status === 'lost' && g.revealedName)) sessions.delete(keyOf(c))
  }
  async function failure(c,s,err) {
    console.error('[HUTAONATOR]',err?.message || err)
    await send(c,frame(['⚠️ Proses belum selesai.',
      `Ketik *${s.prefix}hutaonator lanjut* untuk mengambil keadaan terakhir.`,
      `Atau *${s.prefix}hutaonator stop* untuk berhenti.`])).catch(()=>{})
  }
  async function command(c, action = '') {
    sweep()
    const key = keyOf(c)
    let s = sessions.get(key)
    action = action.toLowerCase().trim()
    if (!['','start','mulai','stop','berhenti','lanjut'].includes(action)) {
      return send(c,frame([`Mulai: *${c.prefix}hutaonator*`, `Pulihkan: *${c.prefix}hutaonator lanjut*`, `Berhenti: *${c.prefix}hutaonator stop*`]))
    }
    if (s?.busy) return send(c,'⏳ Jawabanmu masih diproses. Tunggu sebentar ya.')
    if (['stop','berhenti'].includes(action)) {
      sessions.delete(key)
      await send(c,frame(['🛑 Permainan dihentikan.', `Main lagi: *${c.prefix}hutaonator*`]))
      if (s?.game?.id) request(`/api/game/${encodeURIComponent(s.game.id)}/abandon`).catch(e=>console.error('[HUTAONATOR] abandon:',e.message))
      return
    }
    if (s) {
      s.busy = true
      const endTyping=beginTyping(c)
      try {
        if (s.uncertain) {
          const latest = await request(`/api/game/${encodeURIComponent(s.game.id)}`,undefined,'GET')
          if (fingerprint(latest) === s.before) {
            return send(c,frame(['⏳ Jawaban terakhir belum bisa dipastikan.',
              `Coba *${s.prefix}hutaonator lanjut* beberapa saat lagi, atau *${s.prefix}hutaonator stop*.`]))
          }
          s.game = latest
          s.uncertain = false
        }
        await display(c,s)
      } catch(err) { await failure(c,s,err) }
      finally { endTyping(); s.busy = false; s.touched = now() }
      return
    }
    if (action === 'lanjut') return send(c,frame(['Tidak ada sesi aktif.', `Mulai: *${c.prefix}hutaonator*`]))
    if (sessions.size >= 100) return send(c,'⏳ Sesi permainan sedang penuh. Coba lagi nanti.')
    s = { busy:true, touched:now(), prefix:c.prefix, prompt:null, game:null, uncertain:false, seen:new Set(), turn:0 }
    sessions.set(key,s)
    const endTyping=beginTyping(c)
    try {
      await send(c,frame(['Pikirkan satu karakter 🤔', 'NEXA akan mencoba menebaknya!', '', '💬 Jawab dengan me-reply pertanyaan.', '⏳ Menyiapkan permainan…']))
      s.game = await request('/api/game/start',{childMode:true})
      if (!s.game?.id) throw new Error('GAME_ID_MISSING')
      await display(c,s)
    } catch(err) {
      if (!s.game) {
        sessions.delete(key)
        console.error('[HUTAONATOR] start:',err.message)
        await send(c,frame(['⚠️ Layanan belum berhasil memulai permainan.', `Coba *${c.prefix}hutaonator* beberapa saat lagi.`])).catch(()=>{})
      } else await failure(c,s,err)
    } finally { endTyping(); s.busy = false }
  }
  async function reply(c) {
    sweep()
    const s = sessions.get(keyOf(c))
    if (!s || !c.quoteId || c.quoteId !== s.prompt) return false
    if (s.busy) return true
    if (!c.msg.key.id || s.seen.has(c.msg.key.id)) return true
    const answer = c.text.trim().toLowerCase().replace(/\s+/g,' ')
    if (['stop','berhenti'].includes(answer)) { await command(c,'stop'); return true }
    if (s.uncertain) { await send(c,`⏳ Ketik *${s.prefix}hutaonator lanjut* untuk memeriksa jawaban sebelumnya.`); return true }
    let endpoint, body
    if (s.game.status === 'playing') {
      const value = ANSWERS.get(answer)
      if (!value) { await send(c,'💬 Reply pertanyaan tadi dengan: *1 Ya*, *2 Tidak*, *3 Tidak tau*, *4 Mungkin*, atau *5 Mungkin tidak*.'); return true }
      endpoint = 'answer'; body = {answer:value}
    } else if (s.game.status === 'guessing') {
      if (['1','benar','ya','iya'].includes(answer)) endpoint='confirm'
      else if (['2','salah','tidak'].includes(answer)) endpoint='reject'
      else { await send(c,'💬 Reply tebakan tadi dengan *1 / Benar* atau *2 / Salah*.'); return true }
    } else if (s.game.status === 'lost') {
      if (!c.text.trim() || c.text.trim().length > 120) { await send(c,'💬 Tulis nama karakter maksimal 120 karakter, atau *stop*.'); return true }
      endpoint = 'reveal'; body={name:c.text.trim()}
    } else return false
    s.busy=true
    const endTyping=beginTyping(c)
    s.seen.add(c.msg.key.id)
    if (s.seen.size > 300) s.seen.delete(s.seen.values().next().value)
    try {
      if(endpoint==='answer') await send(c,THINK[s.turn++ % THINK.length])
      else if(endpoint==='reject') await send(c,'🤔 Oke, tebakan tadi belum cocok. NEXA mencari lagi…')
      else if(endpoint==='reveal') await send(c,'📝 NEXA sedang mencatat jawabanmu…')
      // Confirm: typing only, then the actual final result from the API.
      s.before=fingerprint(s.game)
      s.uncertain=true
      const game = await request(`/api/game/${encodeURIComponent(s.game.id)}/${endpoint}`,body)
      s.game=game
      s.uncertain=false
      if (endpoint === 'reveal') {
        await send(c,frame(['✨ Terima kasih! Jawabanmu sudah dikirim.', `Main lagi: *${s.prefix}hutaonator*`]))
        sessions.delete(keyOf(c))
      } else await display(c,s)
    } catch(err) { await failure(c,s,err) }
    finally { endTyping(); s.busy=false; s.touched=now() }
    return true
  }
  return {command,reply,close(){clearInterval(timer);sessions.clear();for(const [jid,e] of typing){clearInterval(e.timer);presence(e.sock,jid,'paused')}typing.clear()}}
}
