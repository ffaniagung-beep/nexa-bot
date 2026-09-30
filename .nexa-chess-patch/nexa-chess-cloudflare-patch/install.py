#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil
import sys

HERE = Path(__file__).resolve().parent
PAYLOAD = HERE / "payload"

if len(sys.argv) > 1:
    root = Path(sys.argv[1]).expanduser().resolve()
else:
    cwd = Path.cwd().resolve()
    root = cwd if (cwd / "package.json").exists() else (Path.home() / "wa-bot").resolve()

required = [
    "commands/catur.js",
    "lib/chessRealtime.js",
    "arcade/chess.html",
    "package.json",
    "package-lock.json",
]

if not (root / "package.json").exists():
    raise SystemExit(f"Project tidak ditemukan: {root}\nJalankan: python install.py ~/wa-bot")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = root.parent / f"{root.name}-chess-backup-{stamp}"

for rel in required:
    src = PAYLOAD / rel
    dst = root / rel
    if not src.exists():
        raise SystemExit(f"Payload hilang: {src}")
    if dst.exists():
        b = backup / rel
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dst, b)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

notes = HERE / "NEXA-CHESS-CLOUDFLARE-RESTORE.txt"
if notes.exists():
    shutil.copy2(notes, root / notes.name)

print("✅ NEXA Chess Cloudflare restore terpasang")
print(f"📦 Backup: {backup}")
print()
print("VPS .env:")
print("NEXA_CHESS_WS_URL=https://nexa-chess.nametrill.workers.dev")
print("NEXA_CHESS_SECRET=<SAMA PERSIS DENGAN SECRET DI CLOUDFLARE>")
print()
print("Lanjutkan:")
print("  npm install")
print("  npm run check")
print("  git status")
print("  git add commands/catur.js lib/chessRealtime.js arcade/chess.html package.json package-lock.json NEXA-CHESS-CLOUDFLARE-RESTORE.txt")
print('  git commit -m "restore chess cloudflare realtime"')
print("  git push origin main")
