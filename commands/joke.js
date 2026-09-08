import {
  randomItem
} from '../lib/fun.js'

const JOKES = {
  receh: [
    'Kenapa kalender santai? Karena dia tahu semua ada tanggalnya.',
    'Kenapa buku matematika murung? Hidupnya penuh masalah 🗿',
    'Guru: “Kenapa telat?” Murid: “Di jalan ada tulisan sekolah, pelan-pelan.” 😭',
    'Kenapa pintu jarang galau? Karena kalau satu tertutup, tinggal buka yang lain.',
    'Apa yang naik tapi gak pernah turun? Umur. Dompet mah beda cerita 😭',
    'Kenapa pensil rajin? Karena dia selalu punya poin.',
    'Kenapa jam dinding gak pernah protes? Kerjanya muter-muter doang.',
    'Kenapa charger dianggap setia? Tiap baterai kosong dia selalu datang.'
  ],

  tech: [
    'Kenapa komputer kedinginan? Kebanyakan buka Windows 😭',
    'Programmer lapar makan apa? Cookies 🍪',
    'Apa makanan favorit server? RAM-en 🗿',
    'Wi-Fi paling jago bikin drama: pas dibutuhkan malah menghilang.',
    'Bot capek tinggal restart. Manusia kapan dapat fitur itu? 😭',
    'Bug berkata: “Di laptop saya jalan kok.”',
    'Keyboard paling siap kabur karena selalu punya Escape.',
    'Programmer pergi ke warung: beli satu susu. Kalau ada telur, beli sepuluh. Pulang bawa sepuluh susu 😭'
  ],

  absurd: [
    'Seekor cicak menatap langit-langit lalu sadar: dia sudah di langit-langit.',
    'NEXA mencoba berpikir keras. RAM: jangan maksa bang 😭',
    'Kalau sandal hilang sebelah, apakah yang satunya sekarang single? 🗿',
    'Bayangin alarm bangun tidur ikut ketiduran.',
    'Kulkas kalau lampunya mati mungkin cuma lagi tidur.',
    'Kalau awan punya Wi-Fi, password-nya pasti mendung123.',
    'Ayam nyebrang jalan cuma buat bikin manusia bertanya kenapa.',
    'Kalau kursi bisa ngomong, mungkin kalimat pertamanya: berdiri dulu bang.'
  ]
}

export default {
  name:
    'joke',

  aliases: [
    'jokes',
    'lawak'
  ],

  category:
    'FUN',

  description:
    'Joke random dari NEXA',

  usage:
    '.joke [receh/tech/absurd]',

  async run({
    sock,
    msg,
    jid,
    args
  }) {
    const requested =
      String(
        args?.[0] || ''
      )
        .trim()
        .toLowerCase()

    let category =
      requested

    if (
      !JOKES[category]
    ) {
      category =
        randomItem(
          Object.keys(
            JOKES
          ),
          {
            key:
              `joke-category:${jid}`,

            keep: 1
          }
        )
    }

    const joke =
      randomItem(
        JOKES[category],
        {
          key:
            `joke:${jid}:${category}`,

          keep: 4
        }
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 😭 *NEXA JOKE* 」\n` +
          `│\n` +
          `│ 🏷 ${category.toUpperCase()}\n` +
          `│\n` +
          `│ ${joke}\n` +
          `│\n` +
          `╰──────────────`
      },
      {
        quoted: msg
      }
    )
  }
}
