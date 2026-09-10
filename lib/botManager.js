import fs from 'node:fs'
import path from 'node:path'
import {
  fork
} from 'node:child_process'
import {
  randomBytes
} from 'node:crypto'

const ROOT =
  path.resolve(
    './sessions-bots'
  )

const REGISTRY =
  path.join(
    ROOT,
    'registry.json'
  )

const ENTRY =
  path.resolve(
    './index.js'
  )

const IS_CHILD =
  process.env
    .NEXA_CHILD_BOT === '1'

const MAX_BOTS =
  Math.max(
    1,
    Number(
      process.env
        .NEXA_MAX_BOTS ||
      3
    ) || 3
  )

const runtime =
  new Map()

let autoStarted =
  false

function now() {
  return Date.now()
}

function ensureRoot() {
  fs.mkdirSync(
    ROOT,
    {
      recursive: true
    }
  )
}

function readRegistry() {
  ensureRoot()

  try {
    const data =
      JSON.parse(
        fs.readFileSync(
          REGISTRY,
          'utf8'
        )
      )

    if (
      !data ||
      !Array.isArray(
        data.bots
      )
    ) {
      return {
        bots: []
      }
    }

    return {
      bots:
        data.bots
    }
  } catch {
    return {
      bots: []
    }
  }
}

function writeRegistry(
  data
) {
  ensureRoot()

  const tmp =
    `${REGISTRY}.tmp-${process.pid}-${Date.now()}`

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      data,
      null,
      2
    )
  )

  fs.renameSync(
    tmp,
    REGISTRY
  )
}

function mutateRegistry(
  updater
) {
  const current =
    readRegistry()

  const next =
    updater({
      bots:
        [...current.bots]
    }) ||
    current

  writeRegistry(
    next
  )

  return next
}

function cleanNumber(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /\D/g,
      ''
    )
}

function maskNumber(
  value
) {
  const number =
    cleanNumber(
      value
    )

  if (
    number.length <= 6
  ) {
    return number
  }

  return (
    number.slice(
      0,
      4
    ) +
    '••••' +
    number.slice(
      -3
    )
  )
}

function makeId(
  number
) {
  const tail =
    cleanNumber(
      number
    ).slice(-4) ||
    'bot'

  const salt =
    randomBytes(2)
      .toString('hex')

  return (
    `bot_${tail}_${salt}`
  )
}

function sessionPathFor(
  id
) {
  return path.join(
    ROOT,
    id,
    'auth'
  )
}

function getRecord(
  id
) {
  return (
    readRegistry()
      .bots
      .find(
        bot =>
          bot.id === id
      ) ||
    null
  )
}

function updateRecord(
  id,
  changes
) {
  let result = null

  mutateRegistry(
    data => {
      data.bots =
        data.bots.map(
          bot => {
            if (
              bot.id !== id
            ) {
              return bot
            }

            result = {
              ...bot,
              ...changes,
              updatedAt:
                now()
            }

            return result
          }
        )

      return data
    }
  )

  return result
}

function getRuntime(
  id
) {
  return (
    runtime.get(id) ||
    null
  )
}

function setRuntime(
  id,
  changes
) {
  const current =
    runtime.get(id) || {}

  const next = {
    ...current,
    ...changes
  }

  runtime.set(
    id,
    next
  )

  return next
}

function safeLog(
  id,
  kind,
  chunk
) {
  const text =
    String(
      chunk || ''
    )

  for (
    const line
    of text.split(/\r?\n/)
  ) {
    if (!line.trim()) {
      continue
    }

    const prefix =
      kind === 'err'
        ? '⚠️'
        : '🤖'

    console.log(
      `${prefix} [${id}] ${line}`
    )
  }
}

function resolveWaiters(
  id,
  type,
  payload
) {
  const item =
    getRuntime(id)

  const waiters =
    item?.waiters || []

  if (!waiters.length) {
    return
  }

  const keep = []

  for (
    const waiter
    of waiters
  ) {
    if (
      waiter.type !== type
    ) {
      keep.push(
        waiter
      )

      continue
    }

    clearTimeout(
      waiter.timer
    )

    waiter.resolve(
      payload
    )
  }

  setRuntime(
    id,
    {
      waiters:
        keep
    }
  )
}

function waitForEvent(
  id,
  type,
  timeoutMs
) {
  const current =
    getRuntime(id) || {}

  if (
    type ===
      'nexa:pairing-code' &&
    current.pairingCode
  ) {
    return Promise.resolve({
      code:
        current.pairingCode,
      number:
        getRecord(id)
          ?.number ||
        null
    })
  }

  if (
    type ===
      'nexa:online' &&
    current.status ===
      'online'
  ) {
    return Promise.resolve({
      type:
        'nexa:online',
      botId:
        id,
      userJid:
        current.userJid ||
        null
    })
  }

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const item =
        getRuntime(id) || {}

      const waiters =
        Array.isArray(
          item.waiters
        )
          ? [...item.waiters]
          : []

      const waiter = {
        type,
        resolve,
        reject,
        timer: null
      }

      waiter.timer =
        setTimeout(
          () => {
            const latest =
              getRuntime(id) || {}

            const next =
              (
                latest.waiters ||
                []
              ).filter(
                x =>
                  x !== waiter
              )

            setRuntime(
              id,
              {
                waiters:
                  next
              }
            )

            reject(
              new Error(
                'PAIRING_CODE_TIMEOUT'
              )
            )
          },
          timeoutMs
        )

      waiters.push(
        waiter
      )

      setRuntime(
        id,
        {
          waiters
        }
      )
    }
  )
}

function handleChildMessage(
  id,
  message
) {
  if (
    !message ||
    typeof message !==
      'object'
  ) {
    return
  }

  const type =
    String(
      message.type || ''
    )

  if (
    type ===
    'nexa:pairing-code'
  ) {
    const code =
      String(
        message.code || ''
      ).trim()

    setRuntime(
      id,
      {
        status:
          'pairing',
        pairingCode:
          code || null,
        pairingAt:
          now()
      }
    )

    console.log(
      `🔑 [BOT MANAGER] Pairing code diterima via IPC untuk ${id}`
    )

    updateRecord(
      id,
      {
        status:
          'pairing'
      }
    )

    resolveWaiters(
      id,
      type,
      {
        code,
        number:
          message.number ||
          null
      }
    )

    return
  }

  if (
    type ===
    'nexa:online'
  ) {
    setRuntime(
      id,
      {
        status:
          'online',
        pairingCode:
          null,
        onlineAt:
          now(),
        userJid:
          message.userJid ||
          null
      }
    )

    updateRecord(
      id,
      {
        status:
          'online',
        paired:
          true,
        userJid:
          message.userJid ||
          null,
        lastOnlineAt:
          now()
      }
    )

    resolveWaiters(
      id,
      type,
      message
    )

    return
  }

  if (
    type ===
    'nexa:logged-out'
  ) {
    setRuntime(
      id,
      {
        status:
          'logged-out'
      }
    )

    updateRecord(
      id,
      {
        status:
          'logged-out',
        paired:
          false
      }
    )
  }
}

function scheduleRespawn(
  id
) {
  const record =
    getRecord(id)

  if (
    !record ||
    record.enabled === false
  ) {
    return
  }

  const item =
    getRuntime(id) || {}

  if (
    item.manualStop
  ) {
    return
  }

  const attempts =
    Number(
      item.restartAttempts ||
      0
    )

  if (
    attempts >= 3
  ) {
    setRuntime(
      id,
      {
        status:
          'offline',
        restartExhausted:
          true
      }
    )

    updateRecord(
      id,
      {
        status:
          'offline'
      }
    )

    return
  }

  const delays = [
    5000,
    15000,
    30000
  ]

  const delay =
    delays[
      Math.min(
        attempts,
        delays.length - 1
      )
    ]

  setRuntime(
    id,
    {
      status:
        'restarting',
      restartAttempts:
        attempts + 1
    }
  )

  const timer =
    setTimeout(
      () => {
        const latest =
          getRuntime(id) || {}

        if (
          latest.manualStop
        ) {
          return
        }

        spawnManagedBot(
          id
        ).catch(
          err => {
            console.error(
              `💥 [${id}] respawn:`,
              err?.message ||
              err
            )
          }
        )
      },
      delay
    )

  setRuntime(
    id,
    {
      respawnTimer:
        timer
    }
  )
}

export function isManagerHost() {
  return !IS_CHILD
}

export function getManagerRoot() {
  return ROOT
}

export function getManagedBots() {
  const data =
    readRegistry()

  return data.bots.map(
    bot => {
      const live =
        getRuntime(
          bot.id
        ) || {}

      return {
        ...bot,
        runtimeStatus:
          live.status ||
          bot.status ||
          'offline',
        pid:
          live.child?.pid ||
          null,
        pairingCode:
          live.pairingCode ||
          null
      }
    }
  )
}

export async function spawnManagedBot(
  id
) {
  if (IS_CHILD) {
    throw new Error(
      'MANAGER_ONLY_MAIN_BOT'
    )
  }

  const record =
    getRecord(id)

  if (!record) {
    throw new Error(
      'BOT_NOT_FOUND'
    )
  }

  const existing =
    getRuntime(id)

  if (
    existing?.child &&
    existing.child.exitCode ===
      null
  ) {
    return {
      record,
      status:
        existing.status ||
        'online',
      reused:
        true
    }
  }

  ensureRoot()

  fs.mkdirSync(
    record.sessionPath,
    {
      recursive: true
    }
  )

  const child =
    fork(
      ENTRY,
      [],
      {
        cwd:
          process.cwd(),

        env: {
          ...process.env,

          NEXA_CHILD_BOT:
            '1',

          NEXA_BOT_ID:
            record.id,

          NEXA_SESSION_FOLDER:
            record.sessionPath,

          NEXA_PAIR_NUMBER:
            record.number,

          NEXA_NO_MANAGER_AUTOSTART:
            '1'
        },

        stdio: [
          'ignore',
          'pipe',
          'pipe',
          'ipc'
        ]
      }
    )

  setRuntime(
    id,
    {
      child,
      status:
        'starting',
      manualStop:
        false,
      restartExhausted:
        false
    }
  )

  updateRecord(
    id,
    {
      status:
        'starting',
      enabled:
        true,
      lastStartedAt:
        now()
    }
  )

  child.stdout?.on(
    'data',
    chunk => {
      safeLog(
        id,
        'out',
        chunk
      )
    }
  )

  child.stderr?.on(
    'data',
    chunk => {
      safeLog(
        id,
        'err',
        chunk
      )
    }
  )

  child.on(
    'message',
    message => {
      handleChildMessage(
        id,
        message
      )
    }
  )

  child.once(
    'exit',
    (
      code,
      signal
    ) => {
      const latest =
        getRuntime(id) || {}

      setRuntime(
        id,
        {
          child:
            null,
          status:
            latest.manualStop
              ? 'stopped'
              : 'offline',
          lastExitCode:
            code,
          lastSignal:
            signal || null
        }
      )

      updateRecord(
        id,
        {
          status:
            latest.manualStop
              ? 'stopped'
              : 'offline',
          lastExitAt:
            now()
        }
      )

      if (
        !latest.manualStop
      ) {
        scheduleRespawn(
          id
        )
      }
    }
  )

  return {
    record:
      getRecord(id),
    status:
      'starting',
    reused:
      false
  }
}

export async function addManagedBot(
  number
) {
  if (IS_CHILD) {
    throw new Error(
      'MANAGER_ONLY_MAIN_BOT'
    )
  }

  const clean =
    cleanNumber(
      number
    )

  if (
    clean.length < 8 ||
    clean.length > 15
  ) {
    throw new Error(
      'INVALID_NUMBER'
    )
  }

  const data =
    readRegistry()

  const duplicate =
    data.bots.find(
      bot =>
        bot.number ===
        clean
    )

  if (duplicate) {
    throw Object.assign(
      new Error(
        'BOT_ALREADY_EXISTS'
      ),
      {
        botId:
          duplicate.id
      }
    )
  }

  if (
    data.bots.length >=
    MAX_BOTS
  ) {
    throw Object.assign(
      new Error(
        'BOT_LIMIT_REACHED'
      ),
      {
        max:
          MAX_BOTS
      }
    )
  }

  const id =
    makeId(
      clean
    )

  const record = {
    id,
    number:
      clean,
    numberMasked:
      maskNumber(
        clean
      ),
    sessionPath:
      sessionPathFor(
        id
      ),
    paired:
      false,
    enabled:
      true,
    status:
      'starting',
    addedAt:
      now(),
    updatedAt:
      now()
  }

  mutateRegistry(
    current => {
      current.bots.push(
        record
      )

      return current
    }
  )

  try {
    await spawnManagedBot(
      id
    )

    const pairing =
      await waitForEvent(
        id,
        'nexa:pairing-code',
        60000
      )

    return {
      ...record,
      pairingCode:
        pairing.code
    }
  } catch (error) {
    updateRecord(
      id,
      {
        status:
          'pairing-error'
      }
    )

    throw Object.assign(
      error,
      {
        botId:
          id
      }
    )
  }
}

export async function restartManagedBot(
  id
) {
  if (IS_CHILD) {
    throw new Error(
      'MANAGER_ONLY_MAIN_BOT'
    )
  }

  const record =
    getRecord(id)

  if (!record) {
    throw new Error(
      'BOT_NOT_FOUND'
    )
  }

  const item =
    getRuntime(id) || {}

  if (
    item.respawnTimer
  ) {
    clearTimeout(
      item.respawnTimer
    )
  }

  if (
    item.child &&
    item.child.exitCode ===
      null
  ) {
    setRuntime(
      id,
      {
        manualStop:
          true
      }
    )

    item.child.kill(
      'SIGTERM'
    )

    await new Promise(
      resolve => {
        const timeout =
          setTimeout(
            resolve,
            5000
          )

        item.child.once(
          'exit',
          () => {
            clearTimeout(
              timeout
            )

            resolve()
          }
        )
      }
    )
  }

  setRuntime(
    id,
    {
      manualStop:
        false,
      restartAttempts:
        0,
      pairingCode:
        null
    }
  )

  updateRecord(
    id,
    {
      enabled:
        true,
      status:
        'starting'
    }
  )

  return spawnManagedBot(
    id
  )
}

export async function removeManagedBot(
  id
) {
  if (IS_CHILD) {
    throw new Error(
      'MANAGER_ONLY_MAIN_BOT'
    )
  }

  const record =
    getRecord(id)

  if (!record) {
    throw new Error(
      'BOT_NOT_FOUND'
    )
  }

  const item =
    getRuntime(id) || {}

  if (
    item.respawnTimer
  ) {
    clearTimeout(
      item.respawnTimer
    )
  }

  setRuntime(
    id,
    {
      manualStop:
        true
    }
  )

  if (
    item.child &&
    item.child.exitCode ===
      null
  ) {
    item.child.kill(
      'SIGTERM'
    )

    await new Promise(
      resolve => {
        const timeout =
          setTimeout(
            resolve,
            5000
          )

        item.child.once(
          'exit',
          () => {
            clearTimeout(
              timeout
            )

            resolve()
          }
        )
      }
    )
  }

  const resolvedRoot =
    path.resolve(
      ROOT
    )

  const botRoot =
    path.resolve(
      ROOT,
      id
    )

  if (
    botRoot.startsWith(
      resolvedRoot +
      path.sep
    ) &&
    fs.existsSync(
      botRoot
    )
  ) {
    fs.rmSync(
      botRoot,
      {
        recursive: true,
        force: true
      }
    )
  }

  mutateRegistry(
    data => {
      data.bots =
        data.bots.filter(
          bot =>
            bot.id !== id
        )

      return data
    }
  )

  runtime.delete(
    id
  )

  return record
}

export function getManagedBotInfo(
  id
) {
  const record =
    getRecord(id)

  if (!record) {
    return null
  }

  const live =
    getRuntime(id) || {}

  return {
    ...record,
    runtimeStatus:
      live.status ||
      record.status ||
      'offline',
    pid:
      live.child?.pid ||
      null,
    pairingCode:
      live.pairingCode ||
      null,
    onlineAt:
      live.onlineAt ||
      record.lastOnlineAt ||
      null
  }
}

export function ensureBotManagerStarted() {
  if (
    IS_CHILD ||
    autoStarted ||
    process.env
      .NEXA_NO_MANAGER_AUTOSTART ===
      '1'
  ) {
    return
  }

  autoStarted =
    true

  ensureRoot()

  setTimeout(
    async () => {
      const data =
        readRegistry()

      for (
        const bot
        of data.bots
      ) {
        if (
          bot.enabled === false
        ) {
          continue
        }

        try {
          await spawnManagedBot(
            bot.id
          )

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                1200
              )
          )
        } catch (error) {
          console.error(
            `💥 [${bot.id}] autostart:`,
            error?.message ||
            error
          )
        }
      }
    },
    1500
  )
}

function shutdownChildren() {
  for (
    const [
      id,
      item
    ]
    of runtime.entries()
  ) {
    if (
      item?.respawnTimer
    ) {
      clearTimeout(
        item.respawnTimer
      )
    }

    if (
      item?.child &&
      item.child.exitCode ===
        null
    ) {
      setRuntime(
        id,
        {
          manualStop:
            true
        }
      )

      try {
        item.child.kill(
          'SIGTERM'
        )
      } catch {}
    }
  }
}

if (!IS_CHILD) {
  process.once(
    'exit',
    shutdownChildren
  )

  process.once(
    'SIGINT',
    () => {
      shutdownChildren()
      process.exit(0)
    }
  )

  process.once(
    'SIGTERM',
    () => {
      shutdownChildren()
      process.exit(0)
    }
  )
}
