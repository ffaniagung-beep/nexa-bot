import {
  randomItem
} from '../lib/fun.js'

const QUESTIONS = [
  'Pernah salah kirim chat? Apa yang terjadi? 😭',
  'Kebiasaan paling random yang lu lakukan kalau lagi sendirian apa?',
  'Siapa orang terakhir yang lu chat hari ini?',
  'Apa pencarian internet paling random yang pernah lu lakukan?',
  'Pernah pura-pura gak lihat pesan karena males balas?',
  'Aplikasi apa yang paling sering lu buka?',
  'Kalau bisa menghapus satu kejadian memalukan, kejadian apa?',
  'Alasan paling kocak yang pernah lu pakai buat menghindari tugas apa?',
  'Pernah ketawa di situasi yang harusnya serius? 🗿',
  'Makanan populer apa yang menurut lu biasa aja?',
  'Typo paling parah yang pernah lu kirim apa?',
  'Kalau harus uninstall satu aplikasi sebulan, pilih apa?',
  'Pernah lupa nama orang padahal sering ketemu?',
  'Lagu apa yang sering lu putar tapi jarang lu akui?',
  'Keputusan impulsif paling random yang pernah lu buat apa?',
  'Hal kecil apa yang gampang bikin lu kesel?',
  'Nickname paling aneh yang pernah lu punya apa?',
  'Kalau HP cuma boleh punya 3 aplikasi, pilih apa saja?',
  'Pernah ngakak gara-gara meme saat harus serius?',
  'Apa hal yang sering lu tunda padahal cuma butuh beberapa menit?',
  'Pernah mengetik pesan panjang terus batal kirim?',
  'Apa barang yang paling sering lu kehilangan?',
  'Kalau besok libur mendadak, hal pertama yang bakal lu lakukan apa?',
  'Apa makanan yang bisa lu makan berkali-kali tanpa bosan?',
  'Pernah bangun tidur lalu langsung lupa hari apa?',
  'Apa pembelian paling gak perlu yang pernah lu lakukan?',
  'Pernah sok ngerti padahal sebenarnya bingung? 😭',
  'Apa alasan paling receh yang pernah bikin mood lu rusak?',
  'Kalau boleh ganti nama sehari, lu mau pakai nama apa?',
  'Siapa yang paling sering lu kirimi meme?',
  'Apa skill kecil yang pengen banget lu kuasai?',
  'Pernah buka kulkas berkali-kali berharap isinya berubah? 🗿',
  'Kalau hidup lu punya soundtrack hari ini, lagunya tipe apa?',
  'Apa hal yang lu kira gampang sampai akhirnya lu coba sendiri?',
  'Apa kebiasaan yang selalu bilang mau lu ubah tapi belum berubah?'
]

export default {
  name:
    'truth',

  aliases: [
    'jujur'
  ],

  category:
    'FUN',

  description:
    'Pertanyaan Truth random',

  usage:
    '.truth',

  async run({
    sock,
    msg,
    jid
  }) {
    const question =
      randomItem(
        QUESTIONS,
        {
          key:
            `truth:${jid}`,

          keep: 10
        }
      )

    await sock.sendMessage(
      jid,
      {
        text:
          `╭──「 👀 *TRUTH* 」\n` +
          `│\n` +
          `│ ${question}\n` +
          `│\n` +
          `╰──────────────\n\n` +
          `😈 _Jawab jujur kalau berani._`
      },
      {
        quoted: msg
      }
    )
  }
}
