const axios = require('axios');

module.exports = {
    name: 'xhamster',
    aliases: ['xh'],
    category: 'premium', // Masuk ke menu premium
    isPremium: true,     // Penanda akses khusus user premium
    description: 'Pencarian / Unduh video Xhamster',
    async run(m, { conn, text, reply }) {
        if (!text) {
            return reply('Harap masukkan kata kunci atau link!\nContoh: .xhamster <kata kunci>');
        }

        try {
            reply('⏳ Memproses permintaan premium kamu...');

            // Ganti URL endpoint ini dengan Rest API andalanmu (misal: Lolhuman, Zenzapis, dll)
            const apiUrl = `https://api.example.com/api/xhamster?query=${encodeURIComponent(text)}&apikey=APIKEY_KAMU`;
            const response = await axios.get(apiUrl);

            // Validasi response dari API
            if (!response.data || response.data.status !== 200) {
                return reply('❌ Gagal mengambil data dari API.');
            }

            const result = response.data.result;
            
            let caption = `*XHAMSTER PREMIUM*\n\n`;
            caption += `*Judul:* ${result.title}\n`;
            caption += `*Durasi:* ${result.duration}\n\n`;
            caption += `_Gunakan fitur premium ini dengan bijak._`;

            // Mengirimkan hasil video ke user
            await conn.sendMessage(m.chat, { 
                video: { url: result.videoUrl }, 
                caption: caption 
            }, { quoted: m });

        } catch (error) {
            console.error('Error in xhamster command:', error);
            reply('❌ Terjadi kesalahan pada server. Coba lagi nanti.');
        }
    }
}

