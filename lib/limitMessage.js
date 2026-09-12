const OWNER_NUMBER =
  '62882006409303'

export function limitHabisMessage(
  prefix = '.'
) {
  return (
    `🎟 *LIMIT HABIS*\n\n` +

    `Limit kamu sudah habis 😭\n\n` +

    `🛒 *Pilihan kamu:*\n` +
    `• Beli Limit di *${prefix}shop*\n` +
    `• Klaim *Daily* lagi setelah *00:00 WIB*\n` +
    `• Atau beli Premium dengan chat Owner 😇\n\n` +

    `👑 *NEXA PREMIUM*\n` +
    `• Rp3.000  → 2 Hari\n` +
    `• Rp5.000  → 5 Hari\n` +
    `• Rp10.000 → 15 Hari\n` +
    `• Rp20.000 → 30 Hari\n\n` +

    `✨ *Keuntungan Premium:*\n` +
    `• Diskon biaya Limit di fitur berat/downloader\n` +
    `• Akses fitur khusus Premium\n` +
    `• Premium tersimpan di akun NEXA\n\n` +

    `⚠️ Premium tetap terkena Anti-Spam.\n` +
    `Premium ≠ Owner.\n\n` +

    `Murah kok, sekalian bantu-bantu Owner 😇\n\n` +

    `💬 *Chat Owner:*\n` +
    `https://wa.me/${OWNER_NUMBER}`
  )
}
