import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  spawn,
  spawnSync
} from 'node:child_process'

const root =
  process.cwd()

const failures = []

function walk(dir) {
  const out = []

  for (
    const entry
    of fs.readdirSync(
      dir,
      {
        withFileTypes: true
      }
    )
  ) {
    if (
      [
        'node_modules',
        '.git',
        'session',
        'session-new',
        'sessions-bots',
        'database',
        'temp'
      ].includes(
        entry.name
      )
    ) {
      continue
    }

    const full =
      path.join(
        dir,
        entry.name
      )

    if (entry.isDirectory()) {
      out.push(
        ...walk(full)
      )
    } else {
      out.push(full)
    }
  }

  return out
}

function gitLines(args) {
  const result =
    spawnSync(
      'git',
      args,
      {
        cwd: root,
        encoding: 'utf8'
      }
    )

  if (result.status !== 0) {
    return []
  }

  return String(
    result.stdout || ''
  )
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

const hasGit =
  fs.existsSync(
    path.join(
      root,
      '.git'
    )
  )

const allJsFiles =
  walk(root)
    .filter(
      file =>
        file.endsWith('.js')
    )

function getSyntaxTargets() {
  if (
    process.env
      .NEXA_CHECK_ALL === '1'
  ) {
    return allJsFiles
  }

  if (!hasGit) {
    // ZIP/folder tanpa .git: full check masih bisa,
    // tapi dijalankan paralel terbatas supaya tidak terasa hang.
    return allJsFiles
  }

  const changed =
    new Set([
      ...gitLines([
        'diff',
        '--name-only',
        '--diff-filter=ACMR',
        'HEAD',
        '--',
        '*.js'
      ]),
      ...gitLines([
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        '*.js'
      ])
    ])

  if (!changed.size) {
    for (
      const file
      of gitLines([
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '--diff-filter=ACMR',
        '-r',
        'HEAD',
        '--',
        '*.js'
      ])
    ) {
      changed.add(file)
    }
  }

  return [...changed]
    .map(file =>
      path.resolve(
        root,
        file
      )
    )
    .filter(file =>
      fs.existsSync(file)
    )
}

function checkSyntax(file) {
  return new Promise(resolve => {
    const child =
      spawn(
        process.execPath,
        [
          '--check',
          file
        ],
        {
          cwd: root,
          stdio: [
            'ignore',
            'ignore',
            'pipe'
          ]
        }
      )

    let stderr = ''

    child.stderr.on(
      'data',
      chunk => {
        stderr +=
          String(chunk)
      }
    )

    child.on(
      'error',
      error => {
        resolve({
          ok: false,
          error:
            error?.message ||
            String(error)
        })
      }
    )

    child.on(
      'close',
      code => {
        resolve({
          ok: code === 0,
          error: stderr
        })
      }
    )
  })
}

async function runPool(
  files,
  concurrency
) {
  let cursor = 0

  async function worker() {
    while (true) {
      const index =
        cursor++

      if (
        index >=
        files.length
      ) {
        return
      }

      const file =
        files[index]

      const result =
        await checkSyntax(
          file
        )

      if (!result.ok) {
        failures.push(
          `Syntax: ${path.relative(root, file)}\n${result.error}`
        )
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            Math.max(
              1,
              concurrency
            ),
            Math.max(
              1,
              files.length
            )
          )
      },
      () => worker()
    )
  )
}

const syntaxTargets =
  getSyntaxTargets()

const concurrency =
  Math.min(
    4,
    Math.max(
      2,
      os.cpus()?.length || 2
    )
  )

await runPool(
  syntaxTargets,
  concurrency
)

function parseStringField(
  source,
  field
) {
  const pattern =
    new RegExp(
      `\\b${field}\\s*:\\s*['\"]([^'\"]+)['\"]`
    )

  return (
    source.match(pattern)?.[1] ||
    null
  )
}

function parseAliases(source) {
  const block =
    source.match(
      /\baliases\s*:\s*\[([\s\S]*?)\]/
    )?.[1]

  if (!block) {
    return []
  }

  return [
    ...block.matchAll(
      /['\"]([^'\"]+)['\"]/g
    )
  ].map(
    match => match[1]
  )
}

if (hasGit) {
  const tracked =
    spawnSync(
      'git',
      [
        'ls-files',
        '--',
        '.env',
        'session',
        'session-new',
        'sessions-bots',
        'database',
        'pairing-qr.png'
      ],
      {
        cwd: root,
        encoding: 'utf8'
      }
    )

  if (
    tracked.status === 0 &&
    tracked.stdout.trim()
  ) {
    failures.push(
      'Runtime/secret masih tracked Git:\n' +
      tracked.stdout.trim() +
      '\nJalankan git rm -r --cached untuk path tersebut sebelum push.'
    )
  }
}

const commandDir =
  path.join(
    root,
    'commands'
  )

const commandFiles =
  fs.readdirSync(
    commandDir
  )
    .filter(name =>
      name.endsWith('.js')
    )
    .sort()

const tokens =
  new Map()

for (
  const file
  of commandFiles
) {
  const source =
    fs.readFileSync(
      path.join(
        commandDir,
        file
      ),
      'utf8'
    )

  const name =
    parseStringField(
      source,
      'name'
    )

  if (!name) {
    failures.push(
      `Command name tidak bisa dibaca statis: ${file}`
    )

    continue
  }

  for (
    const raw
    of [
      name,
      ...parseAliases(source)
    ]
  ) {
    const token =
      String(raw || '')
        .trim()
        .toLowerCase()

    if (!token) {
      continue
    }

    const previous =
      tokens.get(token)

    if (
      previous &&
      previous !== file
    ) {
      failures.push(
        `Collision .${token}: ${previous} <-> ${file}`
      )
    } else {
      tokens.set(
        token,
        file
      )
    }
  }
}

if (failures.length) {
  console.error(
    `❌ Project check gagal (${failures.length})`
  )

  for (
    const failure
    of failures
  ) {
    console.error(
      `\n${failure}`
    )
  }

  process.exit(1)
}

console.log(
  `✅ Syntax: ${syntaxTargets.length} file JS (${hasGit ? 'perubahan/commit terakhir' : 'full'})`
)
console.log(
  `✅ Commands: ${commandFiles.length} file, tanpa collision name/alias`
)
