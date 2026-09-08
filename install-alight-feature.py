#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NEXA-BOT ALIGHT FEATURE INSTALLER
By Fanzzz ︴𓃵
Termux Ready • Python 3.10+

Usage:
    python install-alight-feature.py [--check]

Options:
    --check   Hanya cek dependency, tidak melakukan perubahan
"""

import os
import sys
import json
import subprocess
import shutil
from pathlib import Path

# =====================================
# KONFIGURASI
# =====================================

BOT_DIR = Path.home() / "wa-bot"
COMMANDS_DIR = BOT_DIR / "commands"
LIB_DIR = BOT_DIR / "lib"

REQUIRED_PACKAGES = [
    "nodejs",
    "npm",
    "python",
    "ffmpeg",
    "chromium"
]

NPM_PACKAGES = [
    "axios",
    "fs"
]

# =====================================
# WARNA
# =====================================

class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

def print_info(msg):
    print(f"{Colors.BLUE}ℹ️ {msg}{Colors.RESET}")

def print_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def print_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def print_warn(msg):
    print(f"{Colors.YELLOW}⚠️ {msg}{Colors.RESET}")

def print_header(msg):
    print(f"\n{Colors.CYAN}{Colors.BOLD}╔{'═' * 60}╗{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}║ {msg.center(58)} ║{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}╚{'═' * 60}╝{Colors.RESET}\n")

# =====================================
# DEPENDENCY CHECK
# =====================================

def check_command(cmd):
    """Cek apakah command tersedia di PATH"""
    return shutil.which(cmd) is not None

def check_python_package(pkg):
    """Cek apakah Python package terinstall"""
    try:
        __import__(pkg)
        return True
    except ImportError:
        return False

def check_dependencies(only_check=False):
    """Cek semua dependency yang diperlukan"""
    print_header("🔍 CEK DEPENDENSI")

    all_ok = True
    missing = []

    # 1. Cek package sistem
    print_info("Memeriksa package sistem...")
    for pkg in REQUIRED_PACKAGES:
        if check_command(pkg):
            print_success(f"{pkg} ✓")
        else:
            print_error(f"{pkg} ✗ (belum terinstall)")
            missing.append(pkg)
            all_ok = False

    # 2. Cek Python package
    print_info("\nMemeriksa Python package...")
    py_packages = ["requests"]
    for pkg in py_packages:
        if check_python_package(pkg):
            print_success(f"python-{pkg} ✓")
        else:
            print_warn(f"python-{pkg} ✗ (opsional, akan diinstall otomatis)")
            missing.append(f"python-{pkg}")

    # 3. Cek folder bot
    print_info("\nMemeriksa struktur bot...")
    if BOT_DIR.exists():
        print_success(f"Folder bot ditemukan: {BOT_DIR}")
    else:
        print_error(f"Folder bot tidak ditemukan di {BOT_DIR}")
        all_ok = False

    if COMMANDS_DIR.exists():
        print_success(f"Folder commands ditemukan")
    else:
        print_error("Folder commands tidak ditemukan")
        all_ok = False

    return all_ok, missing

# =====================================
# INSTALL DEPENDENSI
# =====================================

def install_dependencies(missing):
    """Install dependency yang kurang"""
    if not missing:
        print_success("Semua dependency sudah terinstall!")
        return True

    print_header("📦 INSTALL DEPENDENSI")

    for pkg in missing:
        if pkg in REQUIRED_PACKAGES:
            print_info(f"Install {pkg}...")
            try:
                subprocess.run(
                    ["pkg", "install", pkg, "-y"],
                    check=True,
                    capture_output=True
                )
                print_success(f"{pkg} berhasil diinstall")
            except subprocess.CalledProcessError as e:
                print_error(f"Gagal install {pkg}: {e.stderr.decode()}")
                return False

        elif pkg.startswith("python-"):
            pkg_name = pkg.replace("python-", "")
            print_info(f"Install {pkg_name} via pip...")
            try:
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", pkg_name],
                    check=True,
                    capture_output=True
                )
                print_success(f"{pkg_name} berhasil diinstall")
            except subprocess.CalledProcessError as e:
                print_warn(f"Gagal install {pkg_name}: {e.stderr.decode()}")

    return True

# =====================================
# INSTALL ALIGHT FEATURE
# =====================================

def install_alight_feature():
    """Install fitur alight motion ke bot"""
    print_header("🎬 INSTALL ALIGHT MOTION FEATURE")

    if not BOT_DIR.exists():
        print_error(f"Folder bot tidak ditemukan: {BOT_DIR}")
        return False

    # 1. Buat file command
    command_file = COMMANDS_DIR / "alight.js"
    command_content = '''import { handleAlightCommand } from '../lib/alightGenerator.js'

export default {
  name: 'alight',
  aliases: ['alightmotion', 'am'],
  category: 'TOOLS',
  description: 'Generate Alight Motion Premium',
  usage: '.alight <email>',

  async run({ sock, msg, jid, args, config, isOwner }) {
    const email = args?.[0]

    if (!email) {
      return sock.sendMessage(jid, {
        text: `🎬 *ALIGHT MOTION GENERATOR*\n\nGunakan:\n${config.prefix}alight <email>\n\nContoh:\n${config.prefix}alight user@gmail.com`
      }, { quoted: msg })
    }

    if (!email.includes('@')) {
      return sock.sendMessage(jid, {
        text: '❌ Format email tidak valid.'
      }, { quoted: msg })
    }

    const result = await handleAlightCommand({ sock, msg, jid, email, config, isOwner })

    if (result?.reply) {
      await sock.sendMessage(jid, {
        text: result.reply,
        mentions: result.mentions || []
      }, { quoted: msg })
    }
  }
}
'''

    # 2. Buat file library
    lib_file = LIB_DIR / "alightGenerator.js"
    lib_content = '''// ============================================
// ALIGHT MOTION PREMIUM GENERATOR
// Untuk NEXA-BOT WhatsApp
// ============================================

import axios from 'axios'
import fs from 'fs'

const BASE_URL = 'https://satriam.satriadeveloperz.workers.dev'

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    'Content-Type': 'application/json',
    'Origin': 'https://satriam.satriadeveloperz.workers.dev',
    'Referer': 'https://satriam.satriadeveloperz.workers.dev/'
}

// ============================================
// STORAGE SEMENTARA (per chat)
// ============================================

const userSessions = new Map()

function sessionKey(sender) {
    return String(sender || '').trim().toLowerCase()
}

// ============================================
// FUNGSI GENERATOR
// ============================================

async function sendMagicLink(email) {
    const res = await axios.post(`${BASE_URL}/api/satriam/send-link`,
        { email },
        { headers: HEADERS, timeout: 15000 }
    )
    if (!res.data?.success) {
        throw new Error(res.data?.message || 'Gagal kirim link')
    }
    return res.data
}

async function verifyMagicLink(email, magicLink) {
    const res = await axios.post(`${BASE_URL}/api/satriam/verify-link`,
        { email, magicLink },
        { headers: HEADERS, timeout: 15000 }
    )
    if (!res.data?.success) {
        throw new Error(res.data?.message || 'Verifikasi gagal')
    }
    return res.data
}

// ============================================
// COMMAND HANDLER (UNTUK BOT WHATSAPP)
// ============================================

export async function handleAlightCommand({ sock, msg, jid, email, config, isOwner }) {
    const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || jid
    const key = sessionKey(sender)

    // Step 1: Kirim Magic Link
    try {
        const result = await sendMagicLink(email)

        // Simpan session per sender
        if (!userSessions.has(key)) {
            userSessions.set(key, {})
        }
        const session = userSessions.get(key)
        session.email = email
        session.step = 'waiting_link'

        // Bersihkan session setelah 5 menit
        setTimeout(() => {
            if (userSessions.has(key) && userSessions.get(key)?.step === 'waiting_link') {
                userSessions.delete(key)
            }
        }, 5 * 60 * 1000)

        return {
            reply: `✅ *Magic Link terkirim!*\n\n📧 Email: ${email}\n📌 Status: ${result.message}\n\n⚠️ Cek inbox/spam, lalu kirim link dengan:\n*.verify <paste_link_here>*`
        }
    } catch (err) {
        return {
            reply: `❌ *Error:* ${err.message}`
        }
    }
}

// ============================================
// HANDLE VERIFY (dipanggil dari command verify)
// ============================================

export async function handleVerifyCommand({ sock, msg, jid, magicLink, config, isOwner }) {
    const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || jid
    const key = sessionKey(sender)

    const session = userSessions.get(key)

    if (!session || !session.email) {
        return {
            reply: '❌ *Belum ada sesi!*\nGunakan *.alight <email>* dulu.'
        }
    }

    const email = session.email

    try {
        const result = await verifyMagicLink(email, magicLink)

        // Hapus session setelah sukses
        userSessions.delete(key)

        // Format hasil
        let features = result.features?.map(f => `✅ ${f}`).join('\n') || 'Tidak ada data'

        return {
            reply: `🎉 *ALIGHT MOTION PREMIUM AKTIF!*\n\n` +
                   `📧 Email: ${result.email}\n` +
                   `🔑 UID: ${result.uid}\n` +
                   `💎 Plan: ${result.planName}\n` +
                   `📅 Valid Until: ${result.validUntil}\n` +
                   `🆔 Order ID: ${result.orderId || 'Tidak tersedia'}\n\n` +
                   `🔓 *Fitur Premium:*\n${features}\n\n` +
                   `📝 *Token:*\n\`${result.idToken?.substring(0, 50)}...\``
        }
    } catch (err) {
        return {
            reply: `❌ *Verifikasi Gagal:* ${err.message}`
        }
    }
}
'''

    # 3. Buat command verify
    verify_file = COMMANDS_DIR / "verify.js"
    verify_content = '''import { handleVerifyCommand } from '../lib/alightGenerator.js'

export default {
  name: 'verify',
  aliases: ['verif'],
  category: 'TOOLS',
  description: 'Verifikasi Magic Link Alight Motion',
  usage: '.verify <link>',

  async run({ sock, msg, jid, args, config, isOwner }) {
    const magicLink = args?.join(' ')

    if (!magicLink) {
      return sock.sendMessage(jid, {
        text: `🔐 *VERIFY MAGIC LINK*\n\nGunakan:\n${config.prefix}verify <link>\n\nContoh:\n${config.prefix}verify https://alight-creative.firebaseapp.com/...`
      }, { quoted: msg })
    }

    if (!magicLink.startsWith('http')) {
      return sock.sendMessage(jid, {
        text: '❌ Format link tidak valid. Pastikan link dimulai dengan http:// atau https://'
      }, { quoted: msg })
    }

    const result = await handleVerifyCommand({ sock, msg, jid, magicLink, config, isOwner })

    if (result?.reply) {
      await sock.sendMessage(jid, {
        text: result.reply,
        mentions: result.mentions || []
      }, { quoted: msg })
    }
  }
}
'''

    # 4. Tulis file
    try:
        with open(command_file, 'w') as f:
            f.write(command_content)
        print_success(f"Command alight.js dibuat: {command_file}")

        with open(lib_file, 'w') as f:
            f.write(lib_content)
        print_success(f"Library alightGenerator.js dibuat: {lib_file}")

        with open(verify_file, 'w') as f:
            f.write(verify_content)
        print_success(f"Command verify.js dibuat: {verify_file}")

    except Exception as e:
        print_error(f"Gagal menulis file: {e}")
        return False

    return True

# =====================================
# MAIN
# =====================================

def main():
    # Parse args
    only_check = "--check" in sys.argv

    print_header("NEXA-BOT ALIGHT FEATURE INSTALLER")
    print(f"📂 Bot directory: {BOT_DIR}")
    print(f"📂 Commands: {COMMANDS_DIR}")
    print(f"📂 Library: {LIB_DIR}")
    print(f"🔍 Mode: {'CHECK ONLY' if only_check else 'INSTALL'}\n")

    # 1. Cek dependency
    all_ok, missing = check_dependencies()

    if only_check:
        if all_ok:
            print_success("\nSemua dependency OK! Siap install.")
        else:
            print_error("\nAda dependency yang kurang. Jalankan tanpa --check untuk install.")
        return

    # 2. Install dependency yang kurang
    if missing:
        print_warn("\nAda dependency yang perlu diinstall.")
        confirm = input("Lanjutkan install? (y/n): ").strip().lower()
        if confirm != 'y':
            print_info("Installasi dibatalkan.")
            return

        if not install_dependencies(missing):
            print_error("Gagal install dependency. Coba manual: pkg install nodejs npm python ffmpeg chromium")
            return

    # 3. Install fitur
    if install_alight_feature():
        print_header("✅ INSTALLASI SELESAI")
        print_success("Fitur .alight dan .verify berhasil ditambahkan!")
        print_info("\nCara menggunakan:")
        print_info("1. Jalankan bot: cd ~/wa-bot && node index.js")
        print_info("2. Di WhatsApp: .alight email@gmail.com")
        print_info("3. Verifikasi: .verify <link_dari_email>")
        print_info("\n⚠️ Pastikan bot direstart setelah installasi.")
    else:
        print_error("Installasi gagal. Periksa error di atas.")

if __name__ == "__main__":
    main()