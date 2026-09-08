import {
  access
} from 'node:fs/promises'

import {
  constants
} from 'node:fs'

import os from 'node:os'

import {
  execFile
} from 'node:child_process'

import {
  promisify
} from 'node:util'

const execFileAsync =
  promisify(
    execFile
  )

const COMMAND_TIMEOUT =
  10_000

async function exists(path) {
  try {
    await access(
      path,
      constants.F_OK
    )

    return true
  } catch {
    return false
  }
}

async function runTool(
  file,
  args
) {
  try {
    const {
      stdout,
      stderr
    } =
      await execFileAsync(
        file,
        args,
        {
          timeout:
            COMMAND_TIMEOUT,

          maxBuffer:
            256 * 1024,

          env:
            process.env
        }
      )

    return {
      ok: true,

      text:
        String(
          stdout ||
          stderr ||
          ''
        ).trim()
    }
  } catch (error) {
    return {
      ok: false,

      text:
        String(
          error?.stderr ||
          error?.stdout ||
          error?.message ||
          error
        ).trim()
    }
  }
}

function codeBlock(
  value
) {
  const text =
    String(
      value ||
      '-'
    )
      .replace(
        /```/g,
        '``\u200b`'
      )
      .trim()

  return (
    '```' +
    text +
    '```'
  )
}

export default {
  name:
    'diskinfo',

  aliases: [
    'diskcheck',
    'tmpinfo'
  ],

  category:
    'OWNER',

  ownerOnly:
    true,

  // Tidak muncul di .menu / .menu all /
  // pencarian command menu.
  menuHidden:
    true,

  hideFromMenu:
    true,

  description:
    'Diagnostik storage dan temporary filesystem NEXA',

  usage:
    '.diskinfo',

  async run({
    sock,
    msg,
    jid
  }) {
    const cwd =
      process.cwd()

    const nodeTemp =
      os.tmpdir()

    const isProd =
      await exists(
        '/home/container'
      )

    const candidates =
      [
        nodeTemp,
        cwd,
        isProd
          ? '/home/container'
          : null,
        isProd
          ? '/home/container/temp'
          : `${cwd}/temp`
      ]
        .filter(Boolean)

    const paths = []

    for (
      const path
      of candidates
    ) {
      if (
        !paths.includes(path) &&
        await exists(path)
      ) {
        paths.push(path)
      }
    }

    const [
      disk,
      inode
    ] =
      await Promise.all([
        runTool(
          'df',
          [
            '-h',
            ...paths
          ]
        ),

        runTool(
          'df',
          [
            '-i',
            ...paths
          ]
        )
      ])

    const tempUsage =
      await runTool(
        'du',
        [
          '-sh',
          nodeTemp
        ]
      )

    const projectTemp =
      paths.find(
        path =>
          path.endsWith(
            '/temp'
          ) &&
          path !== nodeTemp
      )

    const projectTempUsage =
      projectTemp
        ? await runTool(
            'du',
            [
              '-sh',
              projectTemp
            ]
          )
        : null

    const tmpEnv =
      process.env.TMPDIR ||
      '(tidak diset)'

    let hint =
      'ℹ️ Node memakai temporary directory sesuai nilai di atas.'

    if (
      nodeTemp === '/tmp' &&
      !process.env.TMPDIR
    ) {
      hint =
        '⚠️ *TMPDIR belum diarahkan.* Node/Baileys saat ini kemungkinan memakai `/tmp` untuk file temporary media.'
    } else if (
      nodeTemp.startsWith(
        '/home/container'
      )
    ) {
      hint =
        '✅ Temporary directory sudah berada di storage `/home/container`.'
    }

    const sections = [
      '✦ *NEXA • DISK INFO*',
      '',
      `◈ Runtime : *${isProd ? 'PROD / Pterodactyl' : 'DEV / Local'}*`,
      `◈ CWD     : \`${cwd}\``,
      `◈ TMPDIR  : \`${tmpEnv}\``,
      `◈ Node tmp: \`${nodeTemp}\``,
      '',
      '💾 *FILESYSTEM SPACE*',
      disk.ok
        ? codeBlock(
            disk.text
          )
        : `❌ df -h gagal:\n${codeBlock(disk.text)}`,
      '',
      '🧩 *INODE USAGE*',
      inode.ok
        ? codeBlock(
            inode.text
          )
        : `❌ df -i gagal:\n${codeBlock(inode.text)}`,
      '',
      '🗑️ *TEMP USAGE*',
      tempUsage.ok
        ? codeBlock(
            tempUsage.text
          )
        : `❌ du tmp gagal:\n${codeBlock(tempUsage.text)}`
    ]

    if (
      projectTempUsage
    ) {
      sections.push(
        projectTempUsage.ok
          ? codeBlock(
              projectTempUsage.text
            )
          : `❌ du project temp gagal:\n${codeBlock(projectTempUsage.text)}`
      )
    }

    sections.push(
      '',
      hint
    )

    await sock.sendMessage(
      jid,
      {
        text:
          sections.join(
            '\n'
          )
      },
      {
        quoted: msg
      }
    )
  }
}
