import fs from 'fs'

// =====================================
// PILIH JID USER
//
// participantAlt biasanya PN
// kalau Baileys menyediakan.
// =====================================

const JID_MAP_FILE =
  './database/jidmap.json'

function readJidMap() {
  try {
    if (!fs.existsSync('./database')) {
      fs.mkdirSync(
        './database',
        {
          recursive: true
        }
      )
    }

    if (!fs.existsSync(JID_MAP_FILE)) {
      fs.writeFileSync(
        JID_MAP_FILE,
        '{}'
      )

      return {}
    }

    return JSON.parse(
      fs.readFileSync(
        JID_MAP_FILE,
        'utf8'
      )
    )
  } catch {
    return {}
  }
}

function saveJidMap(data) {
  try {
    fs.writeFileSync(
      JID_MAP_FILE,
      JSON.stringify(
        data,
        null,
        2
      )
    )
  } catch {}
}

function rememberJidPair(
  lid,
  pn
) {
  if (
    !lid ||
    !pn ||
    !String(lid).endsWith('@lid') ||
    !String(pn).endsWith('@s.whatsapp.net')
  ) {
    return
  }

  const db =
    readJidMap()

  const lidKey =
    String(lid)
      .trim()
      .toLowerCase()

  const pnKey =
    String(pn)
      .trim()
      .toLowerCase()

  if (
    db[lidKey] ===
    pnKey
  ) {
    return
  }

  db[lidKey] =
    pnKey

  saveJidMap(
    db
  )
}

// =====================================
// PILIH JID USER
//
// PN dipakai sebagai canonical ID.
//
// Kalau pesan membawa LID + participantAlt PN,
// mapping disimpan permanen.
//
// Kalau setelah reconnect yang datang cuma LID,
// mapping sebelumnya tetap bisa digunakan.
// =====================================

export function getProfileJid(
  msg,
  jid
) {
  const candidates = [
    msg?.key?.participantAlt,
    msg?.key?.remoteJidAlt,
    msg?.key?.participant,
    msg?.participant,
    msg?.key?.remoteJid,
    jid
  ]
    .filter(Boolean)
    .map(
      value =>
        String(value)
          .trim()
          .toLowerCase()
    )

  const pn =
    candidates.find(
      value =>
        value.endsWith(
          '@s.whatsapp.net'
        )
    )

  const lid =
    candidates.find(
      value =>
        value.endsWith(
          '@lid'
        )
    )

  if (
    lid &&
    pn
  ) {
    rememberJidPair(
      lid,
      pn
    )
  }

  if (pn) {
    return pn
  }

  if (lid) {
    const map =
      readJidMap()

    const mapped =
      map[lid]

    if (
      mapped &&
      String(mapped)
        .endsWith(
          '@s.whatsapp.net'
        )
    ) {
      return String(mapped)
        .trim()
        .toLowerCase()
    }

    return lid
  }

  return null
}

// =====================================
// ASYNC PROFILE RESOLVER
//
// 1. participantAlt / remoteJidAlt
// 2. local jidmap
// 3. Baileys LID Mapping Store
// 4. groupMetadata phoneNumber
// 5. fallback LID
// =====================================

export async function resolveProfileJid(
  sock,
  msg,
  jid
) {
  const direct =
    getProfileJid(
      msg,
      jid
    )

  if (!direct) {
    return null
  }

  if (
    direct.endsWith(
      '@s.whatsapp.net'
    )
  ) {
    return direct
  }

  if (
    !direct.endsWith(
      '@lid'
    )
  ) {
    return null
  }

  // =================================
  // BAILEYS INTERNAL LID -> PN STORE
  // =================================

  try {
    const mapper =
      sock
        ?.signalRepository
        ?.lidMapping

    if (
      mapper &&
      typeof mapper.getPNForLID ===
        'function'
    ) {
      const pn =
        await mapper.getPNForLID(
          direct
        )

      if (
        pn &&
        String(pn)
          .endsWith(
            '@s.whatsapp.net'
          )
      ) {
        const cleanPn =
          String(pn)
            .trim()
            .toLowerCase()

        rememberJidPair(
          direct,
          cleanPn
        )

        return cleanPn
      }
    }
  } catch (
    err
  ) {
    console.error(
      'Profile LID mapping:',
      err?.message ||
      err
    )
  }

  // =================================
  // GROUP METADATA FALLBACK
  //
  // Participant object Baileys dapat:
  // {
  //   id: "...@lid",
  //   phoneNumber: "...@s.whatsapp.net"
  // }
  // =================================

  const groupJid =
    String(
      msg?.key?.remoteJid ||
      jid ||
      ''
    )

  if (
    groupJid.endsWith(
      '@g.us'
    ) &&
    typeof sock?.groupMetadata ===
      'function'
  ) {
    try {
      const metadata =
        await sock.groupMetadata(
          groupJid
        )

      const participant =
        metadata?.participants
          ?.find(
            item => {
              const ids = [
                item?.id,
                item?.lid,
                item?.jid,
                item?.participant
              ]
                .filter(Boolean)
                .map(
                  value =>
                    String(value)
                      .trim()
                      .toLowerCase()
                )

              return ids.includes(
                direct
              )
            }
          )

      const pn = [
        participant
          ?.phoneNumber,

        participant
          ?.pn,

        participant
          ?.participantAlt
      ]
        .filter(Boolean)
        .map(
          value =>
            String(value)
              .trim()
              .toLowerCase()
        )
        .find(
          value =>
            value.endsWith(
              '@s.whatsapp.net'
            )
        )

      if (pn) {
        rememberJidPair(
          direct,
          pn
        )

        return pn
      }
    } catch (
      err
    ) {
      console.error(
        'Profile group mapping:',
        err?.message ||
        err
      )
    }
  }

  return direct
}

export function getProfileNumber(
  jid
) {
  return String(jid || '')
    .split('@')[0]
    .replace(/\D/g, '')
}

export function formatGender(
  gender
) {
  if (!gender) {
    return 'Belum diatur'
  }

  if (gender === 'male') {
    return 'Laki-laki'
  }

  if (gender === 'female') {
    return 'Perempuan'
  }

  return 'Lainnya'
}
