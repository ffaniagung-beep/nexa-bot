import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const failures = []

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'session', 'session-new', 'sessions-bots', 'database', 'temp'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const jsFiles = walk(root).filter(file => file.endsWith('.js'))
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) failures.push(`Syntax: ${path.relative(root, file)}\n${result.stderr}`)
}

function parseStringField(source, field) {
  const pattern = new RegExp(`\\b${field}\\s*:\\s*['\"]([^'\"]+)['\"]`)
  return source.match(pattern)?.[1] || null
}

function parseAliases(source) {
  const block = source.match(/\baliases\s*:\s*\[([\s\S]*?)\]/)?.[1]
  if (!block) return []
  return [...block.matchAll(/['\"]([^'\"]+)['\"]/g)].map(match => match[1])
}

if (fs.existsSync(path.join(root, '.git'))) {
  const tracked = spawnSync(
    'git',
    ['ls-files', '--', '.env', 'session', 'session-new', 'sessions-bots', 'database', 'pairing-qr.png'],
    { cwd: root, encoding: 'utf8' }
  )

  if (tracked.status === 0 && tracked.stdout.trim()) {
    failures.push(
      'Runtime/secret masih tracked Git:\n' +
      tracked.stdout.trim() +
      '\nJalankan git rm -r --cached untuk path tersebut sebelum push.'
    )
  }
}

const commandDir = path.join(root, 'commands')
const commandFiles = fs.readdirSync(commandDir).filter(name => name.endsWith('.js')).sort()
const tokens = new Map()

for (const file of commandFiles) {
  const source = fs.readFileSync(path.join(commandDir, file), 'utf8')
  const name = parseStringField(source, 'name')
  if (!name) {
    failures.push(`Command name tidak bisa dibaca statis: ${file}`)
    continue
  }

  for (const raw of [name, ...parseAliases(source)]) {
    const token = String(raw || '').trim().toLowerCase()
    if (!token) continue
    const previous = tokens.get(token)
    if (previous && previous !== file) failures.push(`Collision .${token}: ${previous} <-> ${file}`)
    else tokens.set(token, file)
  }
}

if (failures.length) {
  console.error(`❌ Project check gagal (${failures.length})`)
  for (const failure of failures) console.error(`\n${failure}`)
  process.exit(1)
}

console.log(`✅ Syntax: ${jsFiles.length} file JS`)
console.log(`✅ Commands: ${commandFiles.length} file, tanpa collision name/alias`)
