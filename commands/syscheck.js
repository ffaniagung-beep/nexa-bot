// NEXA_SYSCHECK_V1
import os from 'node:os'
import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'

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

function yn(value) {
  return value ? '✅ ada' : '❌ tidak ada'
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
    .filter(line => {
      const key = line.split('=', 1)[0]
      return wanted.has(key)
    })
    .map(line => line.replace(/^([^=]+)=["']?(.*?)["']?$/, '$1=$2'))
}

function uniq(list) {
  return [...new Set(list)]
}

function shortList(list, max = 12) {
  const arr = Array.isArray(list) ? list : []

  if (arr.length <= max) {
    return arr
  }

  return [
    ...arr.slice(0, max),
    `… +${arr.length - max} lainnya`
  ]
}

export default {
  name: 'syscheck',

  aliases: [
    'envcheck',
    'vulkancheck',
    'servercheck'
  ],

  category: 'OWNER',

  ownerOnly: true,

  description:
    'Cek environment server untuk HD+/waifu2x',

  usage:
    '.syscheck',

  async run({
    sock,
    msg,
    jid
  }) {
    try {
      const osRelease = await safeRead('/etc/os-release')

      const driExists = await exists('/dev/dri')
      const nvidia0Exists = await exists('/dev/nvidia0')
      const nvidiaCtlExists = await exists('/dev/nvidiactl')

      const driList = await safeList('/dev/dri')
      const vulkanShare = await safeList('/usr/share/vulkan/icd.d')
      const vulkanEtc = await safeList('/etc/vulkan/icd.d')

      const lib64 = await safeList('/usr/lib64')
      const libX64 = await safeList('/usr/lib/x86_64-linux-gnu')
      const libArm64 = await safeList('/usr/lib/aarch64-linux-gnu')
      const binList = await safeList('/usr/bin')

      const vulkanLibs = uniq([
        ...lib64,
        ...libX64,
        ...libArm64
      ].filter(name => /vulkan/i.test(name)))

      const vulkanBins = binList.filter(
        name => /^(vulkaninfo|vkcube)$/i.test(name)
      )

      const nvidiaVisible = String(
        process.env.NVIDIA_VISIBLE_DEVICES || ''
      ).trim()

      const gpuVisible =
        driExists ||
        nvidia0Exists ||
        nvidiaCtlExists

      const vulkanVisible =
        vulkanShare.length > 0 ||
        vulkanEtc.length > 0 ||
        vulkanLibs.length > 0

      let verdict

      if (gpuVisible && vulkanVisible) {
        verdict =
          '✅ GPU device + Vulkan terdeteksi. Waifu2x NCNN *punya peluang besar* bisa jalan.'
      } else if (gpuVisible) {
        verdict =
          '⚠️ GPU device terlihat, tapi Vulkan belum jelas. Perlu tes binary waifu2x berikutnya.'
      } else {
        verdict =
          '❌ GPU device tidak terlihat dari container. NCNN-Vulkan kemungkinan tidak bisa dipakai langsung.'
      }

      const lines = [
        '🧪 *NEXA • SERVER SYSCHECK*',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🖥️ *RUNTIME*',
        `• Platform: *${process.platform}*`,
        `• Arch: *${process.arch}*`,
        `• Node: *${process.version}*`,
        `• CPU: *${os.cpus()?.[0]?.model || 'unknown'}*`,
        `• CPU cores: *${os.cpus()?.length || 0}*`,
        `• RAM total: *${Math.round(os.totalmem() / 1024 / 1024)} MiB*`,
        '',
        '📦 *OS*',
        ...(
          cleanOsRelease(osRelease).length
            ? cleanOsRelease(osRelease).map(line => `• ${line}`)
            : ['• /etc/os-release tidak terbaca']
        ),
        '',
        '🎮 *GPU DEVICE*',
        `• /dev/dri: ${yn(driExists)}`,
        `• /dev/nvidia0: ${yn(nvidia0Exists)}`,
        `• /dev/nvidiactl: ${yn(nvidiaCtlExists)}`,
        `• NVIDIA_VISIBLE_DEVICES: *${nvidiaVisible || '-'}*`,
        `• Isi /dev/dri: *${driList.length ? shortList(driList, 10).join(', ') : '-'}*`,
        '',
        '🔥 *VULKAN*',
        `• ICD /usr/share: *${vulkanShare.length ? shortList(vulkanShare).join(', ') : '-'}*`,
        `• ICD /etc: *${vulkanEtc.length ? shortList(vulkanEtc).join(', ') : '-'}*`,
        `• Vulkan libs: *${vulkanLibs.length ? shortList(vulkanLibs).join(', ') : '-'}*`,
        `• Tools: *${vulkanBins.length ? vulkanBins.join(', ') : '-'}*`,
        '',
        '🧠 *HASIL SEMENTARA*',
        verdict,
        '',
        '🔐 Tidak menampilkan token atau ENV rahasia.'
      ]

      return sock.sendMessage(
        jid,
        {
          text: lines.join('\n')
        },
        {
          quoted: msg
        }
      )
    } catch (error) {
      console.error(
        '[SYSCHECK]',
        error?.message || error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '⚠️ *NEXA • SERVER SYSCHECK*\n\n' +
            'Gagal membaca environment server.'
        },
        {
          quoted: msg
        }
      )
    }
  }
}
