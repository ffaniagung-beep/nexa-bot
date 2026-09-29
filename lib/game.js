import config from '../config.js'

import {
  addExp,
  getRequiredExp
} from './userdb.js'

import {
  grantGameCoin
} from './economyPolicy.js'

import {
  getProfileJid
} from './profile.js'

import {
  chargeLimit,
  refundLimit
} from './limitGate.js'

import {
  limitHabisMessage
} from './limitMessage.js'

// =====================================
// NEXA MULTIPLAYER GAME CORE
// =====================================

const rounds = new Map()
const cooldowns = new Map()
const listenedSockets = new WeakSet()

const ROUND_COOLDOWN =
  15 * 1000

const GAME_LIMIT_COST =
  1

const FIRST_CORRECT_WINDOW =
  15 * 1000

// =====================================
// UTILS
// =====================================

function chatKey(jid) {
  return String(jid || '')
    .trim()
    .toLowerCase()
}

function cleanGameNumber(
  value
) {
  return String(
    value || ''
  )
    .split('@')[0]
    .replace(/\D/g, '')
}

function isOwnerGamePlayer(
  jid
) {
  const normalized =
    String(jid || '')
      .trim()
      .toLowerCase()

  const number =
    cleanGameNumber(
      jid
    )

  const owners =
    Array.isArray(
      config.owner
    )
      ? config.owner.map(
          cleanGameNumber
        )
      : []

  if (
    number &&
    owners.includes(
      number
    )
  ) {
    return true
  }

  const ownerJids =
    Array.isArray(
      config.ownerJids
    )
      ? config.ownerJids
      : []

  return ownerJids.some(
    value =>
      String(value || '')
        .trim()
        .toLowerCase() ===
      normalized
  )
}

function getText(msg) {
  const m =
    msg?.message || {}

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

function getReplyId(msg) {
  return (
    msg?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.stanzaId ||
    null
  )
}

export function normalizeAnswer(
  text
) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
}

export function randomItem(
  array
) {
  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ]
}

export function shuffleWord(
  word
) {
  const original =
    String(word)

  let result =
    original

  let tries = 0

  while (
    result.toLowerCase() ===
      original.toLowerCase() &&
    tries < 30
  ) {
    result =
      original
        .split('')
        .sort(
          () =>
            Math.random() -
            0.5
        )
        .join('')

    tries++
  }

  return result
}

// =====================================
// QUESTION BANK
// =====================================

export const tebakKata = [
  {
    clue:
      'Hewan yang suka mengeong',
    answer:
      'kucing'
  },
  {
    clue:
      'Tempat belajar bersama guru',
    answer:
      'sekolah'
  },
  {
    clue:
      'Benda untuk melihat waktu',
    answer:
      'jam'
  },
  {
    clue:
      'Planet tempat manusia tinggal',
    answer:
      'bumi'
  },
  {
    clue:
      'Alat untuk menulis dengan tinta',
    answer:
      'pulpen'
  },
  {
    clue:
      'Hewan besar yang punya belalai',
    answer:
      'gajah'
  },
  {
    clue:
      'Benda yang digunakan saat hujan',
    answer:
      'payung'
  },
  {
    clue:
      'Cairan yang kita minum setiap hari',
    answer:
      'air'
  },
  {
    clue:
      'Benda untuk membuka pintu',
    answer:
      'kunci'
  },
  {
    clue:
      'Kendaraan yang berjalan di rel',
    answer:
      'kereta'
  }
]

export const susunKata = [
  {
    word: 'kucing',
    clue: 'Hewan peliharaan yang suka mengeong'
  },
  {
    word: 'gajah',
    clue: 'Hewan darat besar yang memiliki belalai'
  },
  {
    word: 'harimau',
    clue: 'Kucing besar bercorak loreng'
  },
  {
    word: 'kelinci',
    clue: 'Hewan bertelinga panjang yang suka wortel'
  },
  {
    word: 'kuda',
    clue: 'Hewan yang sering digunakan untuk berkuda'
  },
  {
    word: 'sapi',
    clue: 'Hewan ternak penghasil susu'
  },
  {
    word: 'kambing',
    clue: 'Hewan ternak yang sering mengembik'
  },
  {
    word: 'ayam',
    clue: 'Unggas yang berkokok pada pagi hari'
  },
  {
    word: 'bebek',
    clue: 'Unggas berkaki berselaput yang suka berenang'
  },
  {
    word: 'burung',
    clue: 'Hewan berbulu yang umumnya dapat terbang'
  },
  {
    word: 'mangga',
    clue: 'Buah manis yang sering berwarna hijau atau kuning'
  },
  {
    word: 'pisang',
    clue: 'Buah panjang berkulit kuning saat matang'
  },
  {
    word: 'apel',
    clue: 'Buah bulat yang sering berwarna merah atau hijau'
  },
  {
    word: 'jeruk',
    clue: 'Buah sitrus yang kaya vitamin C'
  },
  {
    word: 'anggur',
    clue: 'Buah kecil yang tumbuh bergerombol'
  },
  {
    word: 'semangka',
    clue: 'Buah besar dengan daging merah dan banyak air'
  },
  {
    word: 'melon',
    clue: 'Buah manis dengan kulit berjaring'
  },
  {
    word: 'pepaya',
    clue: 'Buah jingga dengan banyak biji hitam'
  },
  {
    word: 'durian',
    clue: 'Buah berkulit duri dengan aroma kuat'
  },
  {
    word: 'rambutan',
    clue: 'Buah kecil dengan kulit seperti berambut'
  },
  {
    word: 'bakso',
    clue: 'Makanan berbentuk bulat yang biasa disajikan berkuah'
  },
  {
    word: 'sate',
    clue: 'Potongan daging yang ditusuk lalu dibakar'
  },
  {
    word: 'rendang',
    clue: 'Masakan daging berbumbu khas Minangkabau'
  },
  {
    word: 'soto',
    clue: 'Masakan berkuah yang sering berisi daging dan sayur'
  },
  {
    word: 'gudeg',
    clue: 'Makanan khas Yogyakarta berbahan nangka muda'
  },
  {
    word: 'pempek',
    clue: 'Makanan khas Palembang berbahan ikan dan sagu'
  },
  {
    word: 'siomay',
    clue: 'Kudapan kukus yang sering disajikan dengan saus kacang'
  },
  {
    word: 'ketupat',
    clue: 'Olahan beras yang dimasak dalam anyaman janur'
  },
  {
    word: 'tempe',
    clue: 'Makanan fermentasi berbahan kedelai'
  },
  {
    word: 'nastar',
    clue: 'Kue kering yang biasanya berisi selai nanas'
  },
  {
    word: 'meja',
    clue: 'Perabot datar yang biasanya memiliki kaki'
  },
  {
    word: 'kursi',
    clue: 'Perabot yang digunakan untuk duduk'
  },
  {
    word: 'lemari',
    clue: 'Perabot untuk menyimpan pakaian atau barang'
  },
  {
    word: 'bantal',
    clue: 'Benda empuk untuk menyangga kepala saat tidur'
  },
  {
    word: 'kasur',
    clue: 'Alas empuk yang digunakan untuk tidur'
  },
  {
    word: 'cermin',
    clue: 'Benda yang memantulkan bayangan'
  },
  {
    word: 'sendok',
    clue: 'Alat makan berbentuk cekung'
  },
  {
    word: 'garpu',
    clue: 'Alat makan dengan beberapa ujung runcing'
  },
  {
    word: 'piring',
    clue: 'Wadah datar untuk menyajikan makanan'
  },
  {
    word: 'gelas',
    clue: 'Wadah yang umum digunakan untuk minum'
  },
  {
    word: 'komputer',
    clue: 'Perangkat elektronik untuk mengolah data'
  },
  {
    word: 'kamera',
    clue: 'Perangkat untuk mengambil foto atau video'
  },
  {
    word: 'ponsel',
    clue: 'Perangkat genggam untuk komunikasi'
  },
  {
    word: 'laptop',
    clue: 'Komputer portabel yang dapat dilipat'
  },
  {
    word: 'monitor',
    clue: 'Layar yang menampilkan keluaran komputer'
  },
  {
    word: 'keyboard',
    clue: 'Perangkat komputer yang digunakan untuk mengetik'
  },
  {
    word: 'printer',
    clue: 'Perangkat yang mencetak dokumen ke kertas'
  },
  {
    word: 'router',
    clue: 'Perangkat yang mengatur lalu lintas jaringan'
  },
  {
    word: 'speaker',
    clue: 'Perangkat yang menghasilkan suara'
  },
  {
    word: 'tablet',
    clue: 'Perangkat layar sentuh berukuran lebih besar dari ponsel'
  },
  {
    word: 'jakarta',
    clue: 'Ibu kota Indonesia sebelum pemindahan resmi ke Nusantara'
  },
  {
    word: 'bandung',
    clue: 'Kota di Jawa Barat yang dijuluki Kota Kembang'
  },
  {
    word: 'surabaya',
    clue: 'Kota terbesar di Jawa Timur'
  },
  {
    word: 'semarang',
    clue: 'Ibu kota Provinsi Jawa Tengah'
  },
  {
    word: 'yogyakarta',
    clue: 'Kota yang terkenal dengan Malioboro'
  },
  {
    word: 'medan',
    clue: 'Kota besar di Sumatra Utara'
  },
  {
    word: 'makassar',
    clue: 'Kota besar di Sulawesi Selatan'
  },
  {
    word: 'malang',
    clue: 'Kota di Jawa Timur yang terkenal berhawa sejuk'
  },
  {
    word: 'bogor',
    clue: 'Kota di Jawa Barat yang dijuluki Kota Hujan'
  },
  {
    word: 'palembang',
    clue: 'Kota di Sumatra Selatan yang terkenal dengan pempek'
  },
  {
    word: 'indonesia',
    clue: 'Negara kepulauan tempat kita tinggal'
  },
  {
    word: 'jepang',
    clue: 'Negara yang dijuluki Negeri Sakura'
  },
  {
    word: 'korea',
    clue: 'Negara di Asia Timur yang dikenal dengan budaya K-pop'
  },
  {
    word: 'kanada',
    clue: 'Negara besar di Amerika Utara dengan daun maple sebagai simbol'
  },
  {
    word: 'meksiko',
    clue: 'Negara di Amerika Utara yang terkenal dengan taco'
  },
  {
    word: 'mesir',
    clue: 'Negara yang terkenal dengan piramida kuno'
  },
  {
    word: 'thailand',
    clue: 'Negara Asia Tenggara yang beribu kota Bangkok'
  },
  {
    word: 'vietnam',
    clue: 'Negara Asia Tenggara yang beribu kota Hanoi'
  },
  {
    word: 'spanyol',
    clue: 'Negara Eropa yang beribu kota Madrid'
  },
  {
    word: 'brasil',
    clue: 'Negara Amerika Selatan yang terkenal dengan sepak bola dan karnaval'
  },
  {
    word: 'dokter',
    clue: 'Profesi yang memeriksa dan merawat pasien'
  },
  {
    word: 'petani',
    clue: 'Profesi yang mengolah lahan pertanian'
  },
  {
    word: 'guru',
    clue: 'Profesi yang mengajar murid'
  },
  {
    word: 'pilot',
    clue: 'Profesi yang menerbangkan pesawat'
  },
  {
    word: 'polisi',
    clue: 'Profesi yang menjaga keamanan dan ketertiban'
  },
  {
    word: 'hakim',
    clue: 'Profesi yang memimpin persidangan dan memberi putusan'
  },
  {
    word: 'koki',
    clue: 'Profesi yang memasak makanan secara profesional'
  },
  {
    word: 'nelayan',
    clue: 'Profesi yang mencari ikan di laut atau perairan'
  },
  {
    word: 'arsitek',
    clue: 'Profesi yang merancang bangunan'
  },
  {
    word: 'apoteker',
    clue: 'Profesi yang ahli mengenai obat dan bekerja di bidang farmasi'
  },
  {
    word: 'sepeda',
    clue: 'Kendaraan roda dua yang digerakkan dengan pedal'
  },
  {
    word: 'mobil',
    clue: 'Kendaraan darat beroda empat'
  },
  {
    word: 'motor',
    clue: 'Kendaraan bermesin dengan dua roda'
  },
  {
    word: 'kereta',
    clue: 'Kendaraan panjang yang berjalan di atas rel'
  },
  {
    word: 'pesawat',
    clue: 'Kendaraan yang digunakan untuk terbang'
  },
  {
    word: 'kapal',
    clue: 'Kendaraan besar yang bergerak di atas air'
  },
  {
    word: 'becak',
    clue: 'Kendaraan roda tiga yang umum digunakan untuk jarak dekat'
  },
  {
    word: 'angkot',
    clue: 'Kendaraan umum kecil untuk mengangkut penumpang dalam kota'
  },
  {
    word: 'skuter',
    clue: 'Kendaraan roda dua dengan pijakan kaki datar'
  },
  {
    word: 'truk',
    clue: 'Kendaraan besar untuk mengangkut barang'
  },
  {
    word: 'gunung',
    clue: 'Permukaan bumi yang menjulang tinggi'
  },
  {
    word: 'pantai',
    clue: 'Wilayah pertemuan antara daratan dan laut'
  },
  {
    word: 'sungai',
    clue: 'Aliran air alami menuju danau atau laut'
  },
  {
    word: 'hutan',
    clue: 'Wilayah luas yang dipenuhi pepohonan'
  },
  {
    word: 'danau',
    clue: 'Genangan air luas yang dikelilingi daratan'
  },
  {
    word: 'lembah',
    clue: 'Daerah rendah di antara bukit atau gunung'
  },
  {
    word: 'gurun',
    clue: 'Wilayah sangat kering dengan sedikit tumbuhan'
  },
  {
    word: 'awan',
    clue: 'Kumpulan titik air yang tampak melayang di langit'
  },
  {
    word: 'hujan',
    clue: 'Air yang jatuh dari awan ke permukaan bumi'
  },
  {
    word: 'pelangi',
    clue: 'Lengkungan warna-warni yang dapat muncul setelah hujan'
  },
  {
    word: 'sekolah',
    clue: 'Tempat murid belajar bersama guru'
  },
  {
    word: 'kelas',
    clue: 'Ruangan atau kelompok tempat kegiatan belajar berlangsung'
  },
  {
    word: 'pensil',
    clue: 'Alat tulis yang menggunakan grafit'
  },
  {
    word: 'pulpen',
    clue: 'Alat tulis yang menggunakan tinta'
  },
  {
    word: 'penghapus',
    clue: 'Benda untuk menghilangkan tulisan pensil'
  },
  {
    word: 'penggaris',
    clue: 'Alat untuk mengukur panjang dan membuat garis lurus'
  },
  {
    word: 'buku',
    clue: 'Kumpulan lembaran berisi tulisan atau gambar'
  },
  {
    word: 'rapor',
    clue: 'Dokumen berisi hasil belajar siswa'
  },
  {
    word: 'seragam',
    clue: 'Pakaian dengan bentuk yang sama untuk suatu kelompok'
  },
  {
    word: 'papan',
    clue: 'Permukaan datar di kelas yang digunakan untuk menulis materi'
  },
  {
    word: 'kepala',
    clue: 'Bagian tubuh tempat otak berada'
  },
  {
    word: 'mata',
    clue: 'Indra yang digunakan untuk melihat'
  },
  {
    word: 'telinga',
    clue: 'Indra yang digunakan untuk mendengar'
  },
  {
    word: 'hidung',
    clue: 'Indra yang digunakan untuk mencium aroma'
  },
  {
    word: 'mulut',
    clue: 'Bagian wajah yang digunakan untuk makan dan berbicara'
  },
  {
    word: 'tangan',
    clue: 'Anggota tubuh yang digunakan untuk memegang'
  },
  {
    word: 'kaki',
    clue: 'Anggota tubuh yang digunakan untuk berjalan'
  },
  {
    word: 'jantung',
    clue: 'Organ yang memompa darah ke seluruh tubuh'
  },
  {
    word: 'rambut',
    clue: 'Helai yang tumbuh di bagian kepala'
  },
  {
    word: 'leher',
    clue: 'Bagian tubuh yang menghubungkan kepala dan badan'
  },
  {
    word: 'gitar',
    clue: 'Alat musik berdawai yang dimainkan dengan dipetik'
  },
  {
    word: 'piano',
    clue: 'Alat musik bertuts hitam dan putih'
  },
  {
    word: 'biola',
    clue: 'Alat musik berdawai yang dimainkan dengan digesek'
  },
  {
    word: 'drum',
    clue: 'Alat musik perkusi yang dimainkan dengan dipukul'
  },
  {
    word: 'seruling',
    clue: 'Alat musik tiup berbentuk tabung'
  },
  {
    word: 'angklung',
    clue: 'Alat musik bambu khas Jawa Barat'
  },
  {
    word: 'gamelan',
    clue: 'Ansambel musik tradisional yang banyak ditemukan di Jawa dan Bali'
  },
  {
    word: 'trompet',
    clue: 'Alat musik tiup logam dengan suara nyaring'
  },
  {
    word: 'harmonika',
    clue: 'Alat musik kecil yang dimainkan dengan ditiup dan diisap'
  },
  {
    word: 'kendang',
    clue: 'Alat musik pukul tradisional berbentuk tabung'
  },
  {
    word: 'badminton',
    clue: 'Olahraga raket yang menggunakan kok'
  },
  {
    word: 'basket',
    clue: 'Olahraga memasukkan bola ke ring'
  },
  {
    word: 'voli',
    clue: 'Olahraga beregu dengan bola yang dipukul melewati net'
  },
  {
    word: 'tenis',
    clue: 'Olahraga raket yang dimainkan di lapangan berpembatas net'
  },
  {
    word: 'renang',
    clue: 'Olahraga bergerak di dalam air'
  },
  {
    word: 'panahan',
    clue: 'Olahraga menggunakan busur dan anak panah'
  },
  {
    word: 'karate',
    clue: 'Seni bela diri asal Jepang'
  },
  {
    word: 'silat',
    clue: 'Seni bela diri tradisional dari kawasan Nusantara'
  },
  {
    word: 'senam',
    clue: 'Olahraga yang mengandalkan gerakan tubuh teratur'
  },
  {
    word: 'futsal',
    clue: 'Permainan mirip sepak bola yang dimainkan di lapangan lebih kecil'
  },
  {
    word: 'merah',
    clue: 'Warna yang identik dengan darah'
  },
  {
    word: 'kuning',
    clue: 'Warna yang sering diasosiasikan dengan matahari'
  },
  {
    word: 'hijau',
    clue: 'Warna yang umum terlihat pada daun'
  },
  {
    word: 'biru',
    clue: 'Warna yang sering digunakan untuk menggambarkan langit cerah'
  },
  {
    word: 'ungu',
    clue: 'Warna hasil perpaduan merah dan biru'
  },
  {
    word: 'cokelat',
    clue: 'Warna yang sering terlihat pada tanah atau kayu'
  },
  {
    word: 'hitam',
    clue: 'Warna paling gelap'
  },
  {
    word: 'putih',
    clue: 'Warna yang sering diasosiasikan dengan salju'
  },
  {
    word: 'oranye',
    clue: 'Warna antara merah dan kuning'
  },
  {
    word: 'merahmuda',
    clue: 'Warna lembut yang merupakan variasi terang dari merah'
  },
  {
    word: 'mawar',
    clue: 'Bunga berduri yang sering berwarna merah'
  },
  {
    word: 'melati',
    clue: 'Bunga kecil putih dengan aroma harum'
  },
  {
    word: 'anggrek',
    clue: 'Bunga hias dengan bentuk dan warna yang beragam'
  },
  {
    word: 'teratai',
    clue: 'Tumbuhan berbunga yang hidup di permukaan air'
  },
  {
    word: 'kaktus',
    clue: 'Tumbuhan berduri yang mampu menyimpan banyak air'
  },
  {
    word: 'bambu',
    clue: 'Tumbuhan beruas yang batangnya sering digunakan sebagai bahan bangunan'
  },
  {
    word: 'jati',
    clue: 'Pohon penghasil kayu yang terkenal kuat'
  },
  {
    word: 'kelapa',
    clue: 'Pohon tropis yang buahnya memiliki air di dalamnya'
  },
  {
    word: 'pinus',
    clue: 'Pohon berdaun seperti jarum dan menghasilkan runjung'
  },
  {
    word: 'mangrove',
    clue: 'Tumbuhan yang hidup di kawasan pesisir berlumpur'
  },
  {
    word: 'kemeja',
    clue: 'Pakaian bagian atas yang biasanya memiliki kerah dan kancing'
  },
  {
    word: 'celana',
    clue: 'Pakaian yang menutupi tubuh bagian bawah dan kedua kaki'
  },
  {
    word: 'jaket',
    clue: 'Pakaian luar untuk melindungi tubuh dari udara dingin'
  },
  {
    word: 'sepatu',
    clue: 'Alas kaki yang menutupi sebagian besar kaki'
  },
  {
    word: 'sandal',
    clue: 'Alas kaki terbuka yang ringan'
  },
  {
    word: 'topi',
    clue: 'Penutup yang dikenakan di kepala'
  },
  {
    word: 'sarung',
    clue: 'Kain lebar berbentuk tabung yang dikenakan pada tubuh bagian bawah'
  },
  {
    word: 'dasi',
    clue: 'Aksesori kain panjang yang dikenakan di leher'
  },
  {
    word: 'kaus',
    clue: 'Pakaian santai bagian atas tanpa kancing depan'
  },
  {
    word: 'kerudung',
    clue: 'Kain yang digunakan untuk menutupi kepala'
  },
  {
    word: 'rumah',
    clue: 'Tempat tinggal manusia'
  },
  {
    word: 'masjid',
    clue: 'Tempat ibadah umat Islam'
  },
  {
    word: 'gereja',
    clue: 'Tempat ibadah umat Kristen'
  },
  {
    word: 'pasar',
    clue: 'Tempat penjual dan pembeli melakukan transaksi'
  },
  {
    word: 'kantor',
    clue: 'Tempat orang menjalankan pekerjaan administrasi atau profesional'
  },
  {
    word: 'bandara',
    clue: 'Tempat pesawat lepas landas dan mendarat'
  },
  {
    word: 'terminal',
    clue: 'Tempat kendaraan umum memulai atau mengakhiri perjalanan'
  },
  {
    word: 'stasiun',
    clue: 'Tempat kereta berhenti untuk menaikkan dan menurunkan penumpang'
  },
  {
    word: 'perpustakaan',
    clue: 'Tempat menyimpan dan membaca koleksi buku'
  },
  {
    word: 'museum',
    clue: 'Tempat menyimpan dan memamerkan benda bersejarah atau bernilai'
  },
  {
    word: 'wajan',
    clue: 'Alat masak datar atau cekung untuk menggoreng'
  },
  {
    word: 'panci',
    clue: 'Wadah masak yang biasa digunakan untuk merebus'
  },
  {
    word: 'kompor',
    clue: 'Alat yang menghasilkan panas untuk memasak'
  },
  {
    word: 'spatula',
    clue: 'Alat dapur untuk membalik atau mengaduk makanan'
  },
  {
    word: 'pisau',
    clue: 'Alat tajam yang digunakan untuk memotong'
  },
  {
    word: 'talenan',
    clue: 'Papan yang menjadi alas saat memotong bahan makanan'
  },
  {
    word: 'blender',
    clue: 'Peralatan listrik untuk menghaluskan bahan makanan'
  },
  {
    word: 'termos',
    clue: 'Wadah yang menjaga suhu minuman tetap panas atau dingin'
  },
  {
    word: 'teko',
    clue: 'Wadah bercerat untuk menuang air atau minuman'
  },
  {
    word: 'saringan',
    clue: 'Alat berlubang untuk memisahkan cairan dari bahan padat'
  },
  {
    word: 'bumi',
    clue: 'Planet tempat manusia hidup'
  },
  {
    word: 'mars',
    clue: 'Planet merah di tata surya'
  },
  {
    word: 'venus',
    clue: 'Planet yang sering disebut bintang kejora'
  },
  {
    word: 'saturnus',
    clue: 'Planet yang terkenal dengan sistem cincinnya'
  },
  {
    word: 'merkurius',
    clue: 'Planet terdekat dengan Matahari'
  },
  {
    word: 'galaksi',
    clue: 'Kumpulan besar bintang, gas, dan debu di ruang angkasa'
  },
  {
    word: 'meteor',
    clue: 'Benda langit yang berpijar saat memasuki atmosfer'
  },
  {
    word: 'komet',
    clue: 'Benda langit yang dapat memiliki ekor ketika mendekati Matahari'
  },
  {
    word: 'orbit',
    clue: 'Lintasan suatu benda langit mengelilingi benda lainnya'
  },
  {
    word: 'astronaut',
    clue: 'Orang yang dilatih untuk melakukan perjalanan ke luar angkasa'
  }
]

export function validateSusunKataBank(
  bank = susunKata
) {
  if (!Array.isArray(bank) || bank.length === 0) {
    throw new Error('Bank Susun Kata kosong')
  }

  const seen =
    new Set()

  for (const item of bank) {
    const word =
      String(item?.word || '').trim().toLowerCase()

    const clue =
      String(item?.clue || '').trim()

    if (!/^[a-z]+$/.test(word)) {
      throw new Error(
        `Susun Kata tidak valid: "${word || '(kosong)'}" harus satu kata tanpa spasi`
      )
    }

    if (
      word.length < 4 ||
      word.length > 14
    ) {
      throw new Error(
        `Susun Kata tidak valid: "${word}" panjangnya harus 4-14 huruf`
      )
    }

    if (!clue) {
      throw new Error(
        `Clue Susun Kata kosong untuk "${word}"`
      )
    }

    if (seen.has(word)) {
      throw new Error(
        `Duplikat Susun Kata: "${word}"`
      )
    }

    seen.add(word)
  }

  return {
    count:
      seen.size
  }
}

export const cakLontong = [
  {
    question:
      'Apa yang naik tapi tidak pernah turun?',
    answer:
      'umur'
  },
  {
    question:
      'Apa yang punya banyak gigi tapi tidak bisa menggigit?',
    answer:
      'sisir'
  },
  {
    question:
      'Apa yang punya jarum tapi tidak bisa menjahit?',
    answer:
      'jam'
  },
  {
    question:
      'Apa yang semakin diisi malah semakin ringan?',
    answer:
      'balon'
  },
  {
    question:
      'Benda apa yang kalau dipotong malah jadi lebih panjang?',
    answer:
      'antrian'
  }
]

// =====================================
// ROUND STATUS
// =====================================

export function getRound(
  jid
) {
  return (
    rounds.get(
      chatKey(jid)
    ) || null
  )
}

export function getCooldown(
  jid
) {
  const key =
    chatKey(jid)

  const until =
    cooldowns.get(key) || 0

  const remaining =
    until - Date.now()

  if (remaining <= 0) {
    cooldowns.delete(key)
    return 0
  }

  return remaining
}

// =====================================
// REWARD
// =====================================

// NEXA_GAME_ECONOMY_V21
function randomReward(
  min,
  max
) {
  return (
    Math.floor(
      Math.random() *
      (
        max -
        min +
        1
      )
    ) +
    min
  )
}

function getReward(rank) {
  if (rank === 1) {
    return {
      exp:
        randomReward(
          25,
          35
        ),
      coin:
        randomReward(
          15,
          25
        )
    }
  }

  if (rank === 2) {
    return {
      exp:
        randomReward(
          20,
          28
        ),
      coin:
        randomReward(
          10,
          18
        )
    }
  }

  if (rank === 3) {
    return {
      exp:
        randomReward(
          15,
          22
        ),
      coin:
        randomReward(
          7,
          13
        )
    }
  }

  if (rank === 4) {
    return {
      exp:
        randomReward(
          10,
          16
        ),
      coin:
        randomReward(
          4,
          9
        )
    }
  }

  return {
    exp:
      randomReward(
        6,
        10
      ),
    coin:
      randomReward(
        2,
        5
      )
  }
}

// =====================================
// LEVEL UP
// =====================================

async function sendLevelUp(
  sock,
  jid,
  playerJid,
  expResult
) {
  const mention =
    `@${String(
      playerJid
    ).split('@')[0]}`

  const required =
    getRequiredExp(
      expResult.level
    )

  await sock.sendMessage(
    jid,
    {
      text:
        `✨ *LEVEL UP*\n\n` +
        `Selamat, ${mention}! 🎉\n` +
        `Kamu berhasil mencapai *Level ${expResult.level}*.\n\n` +
        `Level  : ${expResult.oldLevel} → ${expResult.level}\n` +
        `EXP    : ${expResult.exp}/${required}\n\n` +
        `Terus bermain dan naik lebih tinggi. 🚀`,

      mentions: [
        playerJid
      ]
    }
  )
}

// =====================================
// FINISH ROUND
// =====================================

async function finishRound(
  sock,
  jid
) {
  const key =
    chatKey(jid)

  const round =
    rounds.get(key)

  if (!round) {
    return
  }

  if (
    round.finishTimer
  ) {
    clearTimeout(
      round.finishTimer
    )

    round.finishTimer =
      null
  }

  rounds.delete(key)

  cooldowns.set(
    key,
    Date.now() +
      ROUND_COOLDOWN
  )

  const correct =
    [...round.correct]
      .sort(
        (a, b) =>
          a.time - b.time
      )

  const surrendered =
    [...round.surrendered.values()]

  const mentions = []
  const levelUps = []

  let text =
    `🏁 *RONDE SELESAI*\n\n` +
    `✅ Jawaban: *${round.answer}*\n\n`

  if (correct.length) {
    text +=
      `🏆 *Ranking*\n`

    for (
      let i = 0;
      i < correct.length;
      i++
    ) {
      const player =
        correct[i]

      const rank =
        i + 1

      const reward =
        getReward(rank)

      const expResult =
        addExp(
          player.jid,
          reward.exp
        )

      const coinResult =
        grantGameCoin(
          player.jid,
          reward.coin
        )

      const grantedCoin =
        Number(
          coinResult?.granted
        ) || 0

      if (
        expResult.leveledUp
      ) {
        levelUps.push({
          jid:
            player.jid,
          expResult
        })
      }

      mentions.push(
        player.jid
      )

      const mention =
        `@${String(
          player.jid
        ).split('@')[0]}`

      let medal

      if (rank === 1) {
        medal = '🥇'
      } else if (
        rank === 2
      ) {
        medal = '🥈'
      } else if (
        rank === 3
      ) {
        medal = '🥉'
      } else {
        medal =
          `${rank}.`
      }

      text +=
        `${medal} ${mention}` +
        ` — +${reward.exp} EXP`

      if (
        grantedCoin > 0
      ) {
        text +=
          ` +${grantedCoin} Coin`
      }

      if (
        expResult.leveledUp
      ) {
        text +=
          ` 🎊 Lv.${expResult.level}`
      }

      text += '\n'

      console.log(
        `🎮 Rank ${rank}: ` +
        `${player.jid} | ` +
        `EXP ${expResult.exp}/${getRequiredExp(expResult.level)} | ` +
        `Coin +${grantedCoin} (saldo ${coinResult.coin})`
      )
    }
  } else {
    text +=
      '❌ Belum ada jawaban yang benar.\n'
  }

  if (surrendered.length) {
    text +=
      '\n🏳️ *Menyerah*\n'

    for (
      const player
      of surrendered
    ) {
      mentions.push(
        player.jid
      )

      const mention =
        `@${String(
          player.jid
        ).split('@')[0]}`

      text +=
        `• ${mention}\n`
    }
  }

  if (
    !correct.length &&
    !surrendered.length &&
    round.participants.size === 0
  ) {
    text +=
      '\n😴 Belum ada yang ikut ronde ini.\n'
  }

  text +=
    `\n⏳ Cooldown game: 15 detik`

  await sock.sendMessage(
    jid,
    {
      text:
        text.trim(),

      mentions:
        [...new Set(mentions)]
    }
  )

  for (
    const item
    of levelUps
  ) {
    try {
      await sendLevelUp(
        sock,
        jid,
        item.jid,
        item.expResult
      )
    } catch (err) {
      console.error(
        '✨ Level up message:',
        err
      )
    }
  }
}

// =====================================
// ROUND FINISH SCHEDULER
// =====================================

function scheduleRoundFinish(
  sock,
  jid,
  round,
  delayMs
) {
  if (!round) {
    return
  }

  const delay =
    Math.max(
      250,
      Math.trunc(
        Number(
          delayMs
        ) || 0
      )
    )

  if (
    round.finishTimer
  ) {
    clearTimeout(
      round.finishTimer
    )
  }

  round.endsAt =
    Date.now() +
    delay

  round.finishTimer =
    setTimeout(
      async () => {
        const active =
          getRound(
            jid
          )

        if (
          !active ||
          active !== round
        ) {
          return
        }

        try {
          await finishRound(
            sock,
            jid
          )
        } catch (err) {
          console.error(
            '🎮 Finish round:',
            err
          )
        }
      },
      delay
    )

  round.finishTimer
    ?.unref?.()
}

// =====================================
// HANDLE REPLY
// =====================================

async function handleGameReply(
  sock,
  msg
) {
  if (
    !msg?.message ||
    msg.key?.fromMe
  ) {
    return
  }

  const jid =
    msg.key.remoteJid

  if (!jid) {
    return
  }

  const round =
    getRound(jid)

  if (!round) {
    return
  }

  const replyId =
    getReplyId(msg)

  if (
    !replyId ||
    replyId !==
      round.questionMessageId
  ) {
    return
  }

  const text =
    normalizeAnswer(
      getText(msg)
    )

  if (!text) {
    return
  }

  const userJid =
    getProfileJid(
      msg,
      jid
    )

  if (!userJid) {
    return
  }

  // Owner boleh membuka ronde, tapi tidak ikut
  // ranking/reward fair-play.
  if (
    isOwnerGamePlayer(
      userJid
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '👑 Owner tidak ikut ranking/reward game.'
      },
      {
        quoted:
          msg
      }
    )

    return
  }

  if (
    round.correctUsers.has(
      userJid
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '✅ Jawabanmu sudah tercatat di ranking.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    round.surrendered.has(
      userJid
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '🏳️ Kamu sudah menyerah di ronde ini 😭'
      },
      {
        quoted: msg
      }
    )

    return
  }

  round.participants.add(
    userJid
  )

  if (
    text === 'nyerah' ||
    text === 'menyerah' ||
    text === 'surrender'
  ) {
    round.surrendered.set(
      userJid,
      {
        jid:
          userJid,
        time:
          Date.now()
      }
    )

    await sock.sendMessage(
      jid,
      {
        text:
          '🏳️ Menyerah tercatat.'
      },
      {
        quoted: msg
      }
    )

    return
  }

  if (
    text !==
    normalizeAnswer(
      round.answer
    )
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          '❌ Belum tepat.\n' +
          'Coba lagi sebelum waktunya habis 😭'
      },
      {
        quoted: msg
      }
    )

    return
  }

  const rank =
    round.correct.length +
    1

  round.correct.push({
    jid:
      userJid,
    time:
      Date.now()
  })

  round.correctUsers.add(
    userJid
  )

  // Full 15 detik setelah juara #1 muncul.
  // Kalau #1 baru muncul dekat timeout awal,
  // ronde boleh memanjang supaya peserta lain
  // tetap punya kesempatan rebut ranking.
  if (
    rank === 1
  ) {
    scheduleRoundFinish(
      sock,
      jid,
      round,
      FIRST_CORRECT_WINDOW
    )
  }

  let position

  if (rank === 1) {
    position = '🥇 #1'
  } else if (
    rank === 2
  ) {
    position = '🥈 #2'
  } else if (
    rank === 3
  ) {
    position = '🥉 #3'
  } else {
    position =
      `#${rank}`
  }

  await sock.sendMessage(
    jid,
    {
      text:
        `✅ *BENAR!* 🎉\n` +
        `🏆 Posisi sementara: *${position}*` +
        (
          rank === 1
            ? `\n⏱ Ranking ditutup *15 detik* lagi.`
            : ''
        )
    },
    {
      quoted: msg
    }
  )
}

// =====================================
// LISTENER
// =====================================

function ensureListener(
  sock
) {
  if (
    listenedSockets.has(sock)
  ) {
    return
  }

  listenedSockets.add(sock)

  sock.ev.on(
    'messages.upsert',
    async ({
      messages,
      type
    }) => {
      if (
        type !== 'notify'
      ) {
        return
      }

      for (
        const msg
        of messages
      ) {
        try {
          await handleGameReply(
            sock,
            msg
          )
        } catch (err) {
          console.error(
            '🎮 Game reply:',
            err
          )
        }
      }
    }
  )
}

// =====================================
// START ROUND
// =====================================

export async function startRound({
  sock,
  msg,
  jid,
  type,
  answer,
  questionText,
  image = null,
  duration = 60
}) {
  ensureListener(sock)

  const key =
    chatKey(jid)

  // =================================
  // ROUND CHECK
  // =================================

  if (
    rounds.has(key)
  ) {
    throw new Error(
      'ROUND_ACTIVE'
    )
  }

  const cooldown =
    getCooldown(jid)

  if (cooldown > 0) {
    const err =
      new Error(
        'ROUND_COOLDOWN'
      )

    err.remaining =
      cooldown

    throw err
  }

  // =================================
  // RESERVE LIMIT
  //
  // Reserve dilakukan sebelum kirim soal
  // supaya dua process tidak bisa memakai
  // saldo yang sama secara bersamaan.
  // Kalau pengiriman soal gagal, refund.
  // =================================

  const payment =
    chargeLimit({
      msg,
      jid,
      cost:
        GAME_LIMIT_COST
    })

  if (
    !payment.success
  ) {
    throw new Error(
      'LIMIT_EMPTY'
    )
  }

  // =================================
  // SEND QUESTION
  // =================================

  let content

  if (image) {
    content = {
      image: {
        url: image
      },

      caption:
        questionText
    }
  } else {
    content = {
      text:
        questionText
    }
  }

  let sent

  try {
    sent =
      await sock.sendMessage(
        jid,
        content,
        {
          quoted: msg
        }
      )
  } catch (
    error
  ) {
    refundLimit(
      payment,
      'game_question_send_failed'
    )

    throw error
  }

  const questionMessageId =
    sent?.key?.id

  if (!questionMessageId) {
    refundLimit(
      payment,
      'game_question_id_missing'
    )

    throw new Error(
      'QUESTION_ID_NOT_FOUND'
    )
  }

  // =================================
  // SAVE ROUND
  // =================================

  rounds.set(
    key,
    {
      type,
      answer,
      questionMessageId,
      startedAt:
        Date.now(),
      endsAt:
        Date.now() +
        duration * 1000,
      participants:
        new Set(),
      correct: [],
      correctUsers:
        new Set(),
      surrendered:
        new Map(),
      finishTimer:
        null
    }
  )

  console.log(
    `🎮 ${type} started in ${jid}`
  )

  scheduleRoundFinish(
    sock,
    jid,
    rounds.get(key),
    duration * 1000
  )

  return sent
}

// =====================================
// ERROR HELPER
// =====================================

export function gameStartError(
  err
) {
  if (
    err.message ===
    'ROUND_ACTIVE'
  ) {
    return (
      '🎮 Masih ada ronde aktif di chat ini.\n' +
      'Selesaikan dulu sampai waktunya habis.'
    )
  }

  if (
    err.message ===
    'ROUND_COOLDOWN'
  ) {
    const sec =
      Math.max(
        1,
        Math.ceil(
          err.remaining /
          1000
        )
      )

    return (
      `⏳ Game masih cooldown.\n` +
      `Coba lagi dalam *${sec} detik*.`
    )
  }

  if (
    err.message ===
    'LIMIT_EMPTY'
  ) {
    return limitHabisMessage(
      config.prefix
    )
  }

  return (
    '⚠️ Gagal memulai game.'
  )
}
