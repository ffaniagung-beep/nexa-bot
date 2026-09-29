import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let registryPromise = null

function registerToken(registry, tokenOwners, token, command, file) {
  const key = String(token || '').trim().toLowerCase()
  if (!key) return
  const existing = registry.get(key)
  if (existing && existing !== command) {
    const previousFile = tokenOwners.get(key) || 'unknown'
    throw new Error(`COMMAND_COLLISION: ${key} -> ${previousFile}, ${file}`)
  }
  registry.set(key, command)
  tokenOwners.set(key, file)
}

async function buildRegistry() {
  const folder = path.resolve('./commands')
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
  const files = fs.readdirSync(folder).filter(file => file.endsWith('.js')).sort((a,b)=>a.localeCompare(b))
  const registry = new Map()
  const tokenOwners = new Map()
  for (const file of files) {
    const module = await import(pathToFileURL(path.join(folder, file)).href)
    const command = module.default
    if (!command?.name || typeof command.run !== 'function') {
      console.log(`⚠️ Skip command tidak valid: ${file}`)
      continue
    }
    registerToken(registry, tokenOwners, command.name, command, file)
    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) registerToken(registry, tokenOwners, alias, command, file)
    }
    console.log(`📦 Loaded: ${command.name}`)
  }
  return registry
}

export async function loadCommandRegistry() {
  if (!registryPromise) {
    registryPromise = buildRegistry().catch(error => { registryPromise = null; throw error })
  }
  return registryPromise
}
