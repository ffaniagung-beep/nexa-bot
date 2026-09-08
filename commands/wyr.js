import {
  randomItem
} from '../lib/fun.js'

const QUESTIONS = [
  ['🍕 Pizza gratis setahun', '🍔 Burger gratis setahun'],
  ['📱 Internet super cepat selamanya', '🔋 Baterai HP gak pernah habis'],
  ['🎮 Semua game gratis', '🎬 Semua film gratis'],
  ['🌙 Gak perlu tidur tapi tetap segar', '🍜 Gak pernah lapar tapi tetap bisa makan'],
  ['🧠 Bisa membaca pikiran', '👻 Bisa menghilang'],
  ['⏪ Kembali 10 menit ke masa lalu', '⏩ Melihat 10 menit ke masa depan'],
  ['🏠 Punya rumah impian', '✈️ Liburan gratis kapan saja'],
  ['🎵 Bisa memainkan semua alat musik', '🌍 Bisa berbicara semua bahasa'],
  ['📚 Selalu dapat nilai bagus', '⚡ Belajar apa pun 10x lebih cepat'],
  ['🐱 Bisa bicara dengan hewan', '🤖 Punya robot pribadi'],
  ['☀️ Cuaca selalu sesuai keinginan', '🚦 Gak pernah kena macet'],
  ['💻 Laptop super kencang', '📱 HP super kencang'],
  ['🕹 Punya semua konsol', '💻 Punya PC impian'],
  ['🧊 Selalu tahan panas', '🔥 Selalu tahan dingin'],
  ['🍜 Makan gratis selamanya', '🚕 Transportasi gratis selamanya'],
  ['📖 Ingat semua yang pernah dibaca', '🎧 Ingat semua yang pernah didengar'],
  ['🏝 Tinggal di pulau pribadi', '🏙 Tinggal di penthouse kota besar'],
  ['🐉 Punya naga mini', '🦖 Punya dinosaurus mini'],
  ['🎨 Jago menggambar apa pun', '🎸 Jago memainkan lagu apa pun'],
  ['🛌 Bisa tidur nyenyak kapan pun', '⏰ Selalu bangun tepat waktu'],
  ['🔮 Tahu cuaca seminggu ke depan', '🧭 Gak pernah tersesat'],
  ['📦 Paket selalu sampai hari yang sama', '🍔 Pesanan makanan selalu datang 5 menit'],
  ['🧠 Memori sempurna', '⚡ Refleks super cepat'],
  ['🌊 Bisa bernapas di bawah air', '☁️ Bisa terbang'],
  ['🎮 Jadi pro di satu game', '🎯 Lumayan jago di semua game'],
  ['💬 Selalu tahu jawaban yang pas', '😂 Selalu bisa bikin orang ketawa']
]

export default {
  name:
    'wyr',

  aliases: [
    'wouldyourather'
  ],

  category:
    'FUN',

  description:
    'Would You Rather dalam bentuk polling',

  usage:
    '.wyr',

  async run({
    sock,
    msg,
    jid
  }) {
    const pair =
      randomItem(
        QUESTIONS,
        {
          key:
            `wyr:${jid}`,

          keep: 8
        }
      )

    const [
      optionA,
      optionB
    ] = pair

    try {
      await sock.sendMessage(
        jid,
        {
          poll: {
            name:
              `🤔 WOULD YOU RATHER?\n\nPilih salah satu 😭`,

            values: [
              optionA,
              optionB
            ],

            selectableCount:
              1
          }
        },
        {
          quoted: msg
        }
      )
    } catch (err) {
      console.error(
        '🤔 WYR poll fallback:',
        err?.message ||
        err
      )

      await sock.sendMessage(
        jid,
        {
          text:
            `╭──「 🤔 *WOULD YOU RATHER?* 」\n` +
            `│\n` +
            `│ 🅰️ ${optionA}\n` +
            `│\n` +
            `│            ATAU\n` +
            `│\n` +
            `│ 🅱️ ${optionB}\n` +
            `│\n` +
            `╰──────────────`
        },
        {
          quoted: msg
        }
      )
    }
  }
}
