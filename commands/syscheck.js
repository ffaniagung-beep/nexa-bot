// NEXA_SYSCHECK_V2
import os from 'node:os'
import { access, readFile, readdir, readlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function safeRead(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function safeList(path) {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

async function safeLink(path) {
  try {
    return await readlink(path)
  } catch {
    return ''
  }
}

async function runFixed(command, args = [], timeout = 5000) {
  try {
    const result = await execFileAsync(
      command,
      args,
      {
        timeout,
        maxBuffer: 256 * 1024
      }
    )

    return {
      ok: true,
      stdout: String(result?.stdout || '').trim(),
      stderr: String(result?.stderr || '').trim()
    }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || '').trim(),
      stderr: String(error?.stderr || error?.message || '').trim()
    }
  }
}

function cleanOsRelease(text) {
  const wanted = new Set([
    'PRETTY_NAME',
    'NAME',
    'VERSION',
    'VERSION_ID',
    'ID'
  ])

  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => wanted.has(line.split('=', 1)[0]))
}

function cut(text, max = 1200) {
  const value = String(text || '').trim()
  return value.length <= max
    ? value
    : value.slice(0, max) + '\n…(dipotong)'
}

async function pciDisplayDevices() {
  const root = '/sys/bus/pci/devices'
  const devices = await safeList(root)
  const rows = []

  for (const dev of devices) {
    const base = `${root}/${dev}`
    const classCode = (await safeRead(`${base}/class`)).trim()

    if (!classCode.toLowerCase().startsWith('0x03')) {
      continue
    }

    const vendor = (await safeRead(`${base}/vendor`)).trim() || '-'
    const device = (await safeRead(`${base}/device`)).trim() || '-'
    const driverLink = await safeLink(`${base}/driver`)
    const driver = driverLink
      ? driverLink.split('/').filter(Boolean).pop()
      : '-'

    rows.push({
      pci: dev,
      vendor,
      device,
      driver
    })
  }

  return rows
}

async function drmNodes() {
  const entries = await safeList('/sys/class/drm')
  const rows = []

  for (const name of entries) {
    if (!/^card\d+$/.test(name) && !/^renderD\d+$/.test(name)) {
      continue
    }

    const driverLink = await safeLink(`/sys/class/drm/${name}/device/driver`)
    const driver = driverLink
      ? driverLink.split('/').filter(Boolean).pop()
      : '-'

    rows.push({
      name,
      driver
    })
  }

  return rows
}

export default {
  name: 'syscheck',
  aliases: [
    'envcheck',
    'vulkancheck',
    'servercheck',
    'gpucheck'
  ],
  category: 'OWNER',
  ownerOnly: true,
  description: 'Cek GPU/Vulkan server untuk HD+',
  usage: '.syscheck',

  async run({ sock, msg, jid }) {
    try {
      const osRelease = await safeRead('/etc/os-release')
      const devDri = await safeList('/dev/dri')
      const devRoot = await safeList('/dev')
      const nvidiaDev = devRoot.filter(name => /^nvidia/i.test(name))

      const pci = await pciDisplayDevices()
      const drm = await drmNodes()

      const nvidiaProcRoot = '/proc/driver/nvidia/gpus'
      const nvidiaProc = await safeList(nvidiaProcRoot)

      const vulkanShare = await safeList('/usr/share/vulkan/icd.d')
      const vulkanEtc = await safeList('/etc/vulkan/icd.d')

      const libCandidates = []
      for (const root of [
        '/usr/lib64',
        '/usr/lib/x86_64-linux-gnu',
        '/usr/lib/aarch64-linux-gnu'
      ]) {
        const entries = await safeList(root)
        libCandidates.push(
          ...entries.filter(name => /vulkan/i.test(name))
        )
      }

      const lspci = await runFixed('lspci', [], 5000)
      const vulkaninfo = await runFixed('vulkaninfo', ['--summary'], 8000)
      const glxinfo = await runFixed('glxinfo', ['-B'], 5000)

      const softwareVulkan =
        vulkanShare.some(name => /lvp|lavapipe|swiftshader/i.test(name)) ||
        /llvmpipe|lavapipe/i.test(vulkaninfo.stdout)

      const gpuVisible =
        devDri.length > 0 ||
        nvidiaDev.length > 0 ||
        pci.length > 0 ||
        drm.length > 0 ||
        nvidiaProc.length > 0

      let verdict

      if (pci.length > 0 || nvidiaProc.length > 0 || nvidiaDev.length > 0) {
        verdict =
          '✅ Ada indikasi GPU hardware yang terlihat dari container. Cek detail driver/Vulkan di bawah.'
      } else if (gpuVisible && softwareVulkan) {
        verdict =
          '⚠️ Ada graphics node, tapi Vulkan tampak software-rendered.'
      } else if (softwareVulkan) {
        verdict =
          '⚠️ Lavapipe/LLVMpipe terdeteksi, tapi GPU hardware tetap tidak terlihat.'
      } else {
        verdict =
          '❌ Tidak ada bukti GPU hardware yang bisa diakses container.'
      }

      const lines = [
        '🧪 *NEXA • SERVER SYSCHECK V2*',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🖥️ *RUNTIME*',
        `• Platform: *${process.platform}*`,
        `• Arch: *${process.arch}*`,
        `• Node: *${process.version}*`,
        `• CPU: *${os.cpus()?.[0]?.model || 'unknown'}*`,
        `• CPU cores: *${os.cpus()?.length || 0}*`,
        `• RAM: *${Math.round(os.totalmem() / 1024 / 1024)} MiB*`,
        '',
        '📦 *OS*',
        ...(cleanOsRelease(osRelease).length
          ? cleanOsRelease(osRelease).map(line => `• ${line}`)
          : ['• /etc/os-release tidak terbaca']),
        '',
        '🎮 *DEVICE NODES*',
        `• /dev/dri: *${devDri.length ? devDri.join(', ') : '-'}*`,
        `• /dev/nvidia*: *${nvidiaDev.length ? nvidiaDev.join(', ') : '-'}*`,
        `• NVIDIA_VISIBLE_DEVICES: *${process.env.NVIDIA_VISIBLE_DEVICES || '-'}*`,
        '',
        '🧩 *PCI DISPLAY*',
        ...(pci.length
          ? pci.map(row =>
              `• ${row.pci} | vendor ${row.vendor} | device ${row.device} | driver ${row.driver}`
            )
          : ['• tidak ada PCI display device']),
        '',
        '🖼️ *DRM / RENDER*',
        ...(drm.length
          ? drm.map(row => `• ${row.name} | driver ${row.driver}`)
          : ['• tidak ada DRM card/render node']),
        '',
        '🟩 *NVIDIA PROCFS*',
        `• GPU entries: *${nvidiaProc.length ? nvidiaProc.join(', ') : '-'}*`,
        '',
        '🔥 *VULKAN*',
        `• ICD /usr/share: *${vulkanShare.length ? vulkanShare.join(', ') : '-'}*`,
        `• ICD /etc: *${vulkanEtc.length ? vulkanEtc.join(', ') : '-'}*`,
        `• Vulkan libs: *${[...new Set(libCandidates)].length ? [...new Set(libCandidates)].join(', ') : '-'}*`,
        '',
        '🛠️ *COMMAND PROBES*',
        `• lspci: *${lspci.ok ? '✅ jalan' : '❌ gagal/tidak ada'}*`,
        `• vulkaninfo --summary: *${vulkaninfo.ok ? '✅ jalan' : '❌ gagal/tidak ada'}*`,
        `• glxinfo -B: *${glxinfo.ok ? '✅ jalan' : '❌ gagal/tidak ada'}*`,
        '',
        '🧠 *VERDICT*',
        verdict
      ]

      if (lspci.ok && lspci.stdout) {
        const gpuLines = lspci.stdout
          .split(/\r?\n/)
          .filter(line => /vga|3d controller|display controller/i.test(line))
          .join('\n')

        if (gpuLines) {
          lines.push(
            '',
            '📋 *lspci GPU*',
            cut(gpuLines, 1000)
          )
        }
      }

      if (vulkaninfo.ok && vulkaninfo.stdout) {
        lines.push(
          '',
          '📋 *vulkaninfo summary*',
          cut(vulkaninfo.stdout, 1500)
        )
      }

      if (glxinfo.ok && glxinfo.stdout) {
        lines.push(
          '',
          '📋 *glxinfo -B*',
          cut(glxinfo.stdout, 1000)
        )
      }

      lines.push(
        '',
        '🔐 Tetap tidak menampilkan token/ENV rahasia.'
      )

      return sock.sendMessage(
        jid,
        { text: lines.join('\n') },
        { quoted: msg }
      )
    } catch (error) {
      console.error('[SYSCHECK-V2]', error?.message || error)

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • SERVER SYSCHECK V2*\n\n' +
            'Gagal membaca environment server.'
        },
        { quoted: msg }
      )
    }
  }
}
