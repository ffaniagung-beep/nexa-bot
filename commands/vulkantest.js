// NEXA_VULKANTEST_V1
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PY_PROBE = String.raw`
import ctypes
import json
import struct

VK_SUCCESS = 0
VK_STRUCTURE_TYPE_APPLICATION_INFO = 0
VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO = 1

DEVICE_TYPES = {
    0: "OTHER",
    1: "INTEGRATED_GPU",
    2: "DISCRETE_GPU",
    3: "VIRTUAL_GPU",
    4: "CPU"
}

class VkApplicationInfo(ctypes.Structure):
    _fields_ = [
        ("sType", ctypes.c_uint32),
        ("pNext", ctypes.c_void_p),
        ("pApplicationName", ctypes.c_char_p),
        ("applicationVersion", ctypes.c_uint32),
        ("pEngineName", ctypes.c_char_p),
        ("engineVersion", ctypes.c_uint32),
        ("apiVersion", ctypes.c_uint32)
    ]

class VkInstanceCreateInfo(ctypes.Structure):
    _fields_ = [
        ("sType", ctypes.c_uint32),
        ("pNext", ctypes.c_void_p),
        ("flags", ctypes.c_uint32),
        ("pApplicationInfo", ctypes.POINTER(VkApplicationInfo)),
        ("enabledLayerCount", ctypes.c_uint32),
        ("ppEnabledLayerNames", ctypes.POINTER(ctypes.c_char_p)),
        ("enabledExtensionCount", ctypes.c_uint32),
        ("ppEnabledExtensionNames", ctypes.POINTER(ctypes.c_char_p))
    ]

def vk_version(v):
    return f"{(v >> 22) & 0x3ff}.{(v >> 12) & 0x3ff}.{v & 0xfff}"

out = {
    "loader": None,
    "createResult": None,
    "devices": [],
    "error": None
}

instance = ctypes.c_void_p()

try:
    lib = ctypes.CDLL("libvulkan.so.1")
    out["loader"] = "libvulkan.so.1"

    vkCreateInstance = lib.vkCreateInstance
    vkCreateInstance.argtypes = [
        ctypes.POINTER(VkInstanceCreateInfo),
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p)
    ]
    vkCreateInstance.restype = ctypes.c_int32

    vkEnumeratePhysicalDevices = lib.vkEnumeratePhysicalDevices
    vkEnumeratePhysicalDevices.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.POINTER(ctypes.c_void_p)
    ]
    vkEnumeratePhysicalDevices.restype = ctypes.c_int32

    vkGetPhysicalDeviceProperties = lib.vkGetPhysicalDeviceProperties
    vkGetPhysicalDeviceProperties.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p
    ]
    vkGetPhysicalDeviceProperties.restype = None

    vkDestroyInstance = lib.vkDestroyInstance
    vkDestroyInstance.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p
    ]
    vkDestroyInstance.restype = None

    app = VkApplicationInfo(
        sType=VK_STRUCTURE_TYPE_APPLICATION_INFO,
        pNext=None,
        pApplicationName=b"NEXA-VulkanTest",
        applicationVersion=1,
        pEngineName=b"NEXA",
        engineVersion=1,
        apiVersion=0
    )

    info = VkInstanceCreateInfo(
        sType=VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        pNext=None,
        flags=0,
        pApplicationInfo=ctypes.pointer(app),
        enabledLayerCount=0,
        ppEnabledLayerNames=None,
        enabledExtensionCount=0,
        ppEnabledExtensionNames=None
    )

    result = vkCreateInstance(
        ctypes.byref(info),
        None,
        ctypes.byref(instance)
    )

    out["createResult"] = int(result)

    if result != VK_SUCCESS:
        raise RuntimeError(f"vkCreateInstance gagal: {result}")

    count = ctypes.c_uint32(0)

    result = vkEnumeratePhysicalDevices(
        instance,
        ctypes.byref(count),
        None
    )

    if result != VK_SUCCESS:
        raise RuntimeError(
            f"vkEnumeratePhysicalDevices(count) gagal: {result}"
        )

    if count.value:
        DeviceArray = ctypes.c_void_p * count.value
        devices = DeviceArray()

        result = vkEnumeratePhysicalDevices(
            instance,
            ctypes.byref(count),
            devices
        )

        if result != VK_SUCCESS:
            raise RuntimeError(
                f"vkEnumeratePhysicalDevices(list) gagal: {result}"
            )

        for i in range(count.value):
            buf = ctypes.create_string_buffer(4096)

            vkGetPhysicalDeviceProperties(
                devices[i],
                ctypes.byref(buf)
            )

            raw = bytes(buf)

            api_version = struct.unpack_from("<I", raw, 0)[0]
            driver_version = struct.unpack_from("<I", raw, 4)[0]
            vendor_id = struct.unpack_from("<I", raw, 8)[0]
            device_id = struct.unpack_from("<I", raw, 12)[0]
            device_type = struct.unpack_from("<I", raw, 16)[0]

            device_name = raw[20:276].split(b"\x00", 1)[0].decode(
                "utf-8",
                errors="replace"
            )

            out["devices"].append({
                "index": i,
                "name": device_name,
                "type": DEVICE_TYPES.get(
                    device_type,
                    f"UNKNOWN_{device_type}"
                ),
                "typeId": device_type,
                "vendorId": f"0x{vendor_id:04x}",
                "deviceId": f"0x{device_id:04x}",
                "apiVersion": vk_version(api_version),
                "driverVersionRaw": driver_version
            })

except Exception as exc:
    out["error"] = str(exc)

finally:
    try:
        if instance.value:
            vkDestroyInstance(instance, None)
    except Exception:
        pass

print(json.dumps(out, ensure_ascii=False))
`

async function runProbe() {
  let lastError = ''

  for (const binary of ['python3', 'python']) {
    try {
      const result = await execFileAsync(
        binary,
        ['-c', PY_PROBE],
        {
          timeout: 15000,
          maxBuffer: 512 * 1024
        }
      )

      return {
        binary,
        stdout: String(result?.stdout || '').trim(),
        stderr: String(result?.stderr || '').trim()
      }
    } catch (error) {
      lastError = String(
        error?.stderr ||
        error?.message ||
        error
      ).trim()
    }
  }

  throw new Error(
    lastError || 'Python runtime tidak tersedia'
  )
}

function verdict(devices) {
  if (!devices.length) {
    return [
      '❌ *Tidak ada Vulkan physical device*',
      'Loader Vulkan terbuka, tapi tidak ada device yang bisa dipakai.'
    ]
  }

  const physical = devices.filter(
    d =>
      d.type === 'DISCRETE_GPU' ||
      d.type === 'INTEGRATED_GPU'
  )

  if (physical.length) {
    return [
      '✅ *Hardware GPU terdeteksi oleh Vulkan*',
      'Ada GPU fisik yang benar-benar ter-enumerate Vulkan.'
    ]
  }

  const virtual = devices.filter(
    d => d.type === 'VIRTUAL_GPU'
  )

  if (virtual.length) {
    return [
      '⚠️ *Virtual GPU terdeteksi*',
      'Vulkan melihat GPU virtual; ini belum tentu hardware passthrough penuh.'
    ]
  }

  const cpu = devices.filter(
    d =>
      d.type === 'CPU' ||
      /llvmpipe|lavapipe|software/i.test(d.name || '')
  )

  if (cpu.length) {
    return [
      '🧠 *Vulkan berjalan lewat CPU/software*',
      'Ini bukan akselerasi GPU fisik. Waifu2x NCNN kemungkinan berat.'
    ]
  }

  return [
    '⚠️ *Vulkan device terdeteksi*',
    'Jenis device belum cukup jelas.'
  ]
}

export default {
  name: 'vulkantest',

  aliases: [
    'vktest',
    'gpuvulkan',
    'vkcheck'
  ],

  category: 'OWNER',

  ownerOnly: true,

  description:
    'Tes Vulkan runtime dan physical device langsung',

  usage:
    '.vulkantest',

  async run({
    sock,
    msg,
    jid
  }) {
    await sock.sendMessage(
      jid,
      {
        text:
          '🔥 *NEXA • VULKAN RUNTIME TEST*\n\n' +
          'Membuka Vulkan loader dan enumerate physical device…'
      },
      {
        quoted: msg
      }
    )

    try {
      const probe = await runProbe()
      const data = JSON.parse(probe.stdout)

      const devices = Array.isArray(data?.devices)
        ? data.devices
        : []

      const result = verdict(devices)

      const lines = [
        '🔥 *NEXA • VULKAN RUNTIME TEST*',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🧩 *LOADER*',
        `• Python: *${probe.binary}*`,
        `• Vulkan loader: *${data?.loader || '-'}*`,
        `• vkCreateInstance: *${data?.createResult ?? '-'}*`,
        '',
        '🎮 *PHYSICAL DEVICES*'
      ]

      if (devices.length) {
        for (const device of devices) {
          lines.push(
            '',
            `*#${device.index} ${device.name || 'Unnamed device'}*`,
            `• Type: *${device.type}*`,
            `• Vendor ID: *${device.vendorId}*`,
            `• Device ID: *${device.deviceId}*`,
            `• Vulkan API: *${device.apiVersion}*`,
            `• Driver raw: *${device.driverVersionRaw}*`
          )
        }
      } else {
        lines.push(
          '• Tidak ada device yang ter-enumerate.'
        )
      }

      if (data?.error) {
        lines.push(
          '',
          '⚠️ *PROBE ERROR*',
          `• ${data.error}`
        )
      }

      lines.push(
        '',
        '🧠 *VERDICT*',
        result[0],
        result[1],
        '',
        '🔐 Fixed diagnostic only; tidak menerima command shell dari user.'
      )

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
        '[VULKANTEST]',
        error?.message || error
      )

      return sock.sendMessage(
        jid,
        {
          text:
            '❌ *NEXA • VULKAN RUNTIME TEST*\n\n' +
            `Probe gagal: ${error?.message || 'unknown error'}`
        },
        {
          quoted: msg
        }
      )
    }
  }
}
