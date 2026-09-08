// =====================================
// NEXA GAME MEDIA PROVIDERS
// =====================================

function randomItem(array) {
  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ]
}

// =====================================
// ANIME
//
// Kita pakai curated character populer,
// image-nya diambil lewat Jikan.
// =====================================

const animeCharacters = [
  {
    search: 'Naruto Uzumaki',
    answer: 'naruto',
    clue: 'Karakter ninja'
  },
  {
    search: 'Monkey D. Luffy',
    answer: 'luffy',
    clue: 'Karakter bajak laut'
  },
  {
    search: 'Satoru Gojo',
    answer: 'gojo',
    clue: 'Karakter penyihir'
  },
  {
    search: 'Levi Ackerman',
    answer: 'levi',
    clue: 'Karakter prajurit'
  },
  {
    search: 'Roronoa Zoro',
    answer: 'zoro',
    clue: 'Pengguna pedang'
  },
  {
    search: 'Tanjiro Kamado',
    answer: 'tanjiro',
    clue: 'Pembasmi iblis'
  },
  {
    search: 'Rem',
    answer: 'rem',
    clue: 'Karakter maid'
  },
  {
    search: 'Megumin',
    answer: 'megumin',
    clue: 'Penyihir ledakan'
  },
  {
    search: 'Elaina',
    answer: 'elaina',
    clue: 'Seorang penyihir pengembara'
  },
  {
    search: 'Anya Forger',
    answer: 'anya',
    clue: 'Karakter anak kecil'
  }
]

export async function getAnimeQuiz() {
  const selected =
    randomItem(
      animeCharacters
    )

  const url =
    'https://api.jikan.moe/v4/characters' +
    `?q=${encodeURIComponent(selected.search)}` +
    '&limit=1'

  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            15000
          )
      }
    )

  if (!response.ok) {
    throw new Error(
      `JIKAN_HTTP_${response.status}`
    )
  }

  const json =
    await response.json()

  const character =
    json?.data?.[0]

  const image =
    character?.images?.jpg?.image_url ||
    character?.images?.webp?.image_url

  if (!image) {
    throw new Error(
      'ANIME_IMAGE_NOT_FOUND'
    )
  }

  return {
    answer:
      selected.answer,

    clue:
      selected.clue,

    image
  }
}

// =====================================
// TEBAK GAMBAR
//
// Gambar umum via Wikimedia Commons.
// Query Inggris dipakai supaya hasil
// image search lebih konsisten.
// =====================================

const pictureBank = [
  {
    query: 'domestic cat',
    answer: 'kucing',
    clue: 'Hewan'
  },
  {
    query: 'elephant',
    answer: 'gajah',
    clue: 'Hewan'
  },
  {
    query: 'banana fruit',
    answer: 'pisang',
    clue: 'Buah'
  },
  {
    query: 'mango fruit',
    answer: 'mangga',
    clue: 'Buah'
  },
  {
    query: 'bicycle',
    answer: 'sepeda',
    clue: 'Kendaraan'
  },
  {
    query: 'guitar musical instrument',
    answer: 'gitar',
    clue: 'Alat musik'
  },
  {
    query: 'computer keyboard',
    answer: 'keyboard',
    clue: 'Perangkat komputer'
  },
  {
    query: 'camera',
    answer: 'kamera',
    clue: 'Benda elektronik'
  },
  {
    query: 'umbrella',
    answer: 'payung',
    clue: 'Benda'
  },
  {
    query: 'train locomotive',
    answer: 'kereta',
    clue: 'Kendaraan'
  }
]

async function searchCommonsImage(
  query
) {
  const params =
    new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',

      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: '10',

      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '800'
    })

  const response =
    await fetch(
      'https://commons.wikimedia.org/w/api.php?' +
      params.toString(),
      {
        signal:
          AbortSignal.timeout(
            15000
          )
      }
    )

  if (!response.ok) {
    throw new Error(
      `COMMONS_HTTP_${response.status}`
    )
  }

  const json =
    await response.json()

  const pages =
    Object.values(
      json?.query?.pages || {}
    )

  const valid =
    pages.filter(page => {
      const info =
        page?.imageinfo?.[0]

      return Boolean(
        info?.thumburl ||
        info?.url
      )
    })

  if (!valid.length) {
    throw new Error(
      'PICTURE_NOT_FOUND'
    )
  }

  const picked =
    randomItem(valid)

  const info =
    picked.imageinfo[0]

  return (
    info.thumburl ||
    info.url
  )
}

export async function getPictureQuiz() {
  const selected =
    randomItem(
      pictureBank
    )

  const image =
    await searchCommonsImage(
      selected.query
    )

  return {
    answer:
      selected.answer,

    clue:
      selected.clue,

    image
  }
}

// =====================================
// MOBILE LEGENDS
//
// Kita pakai daftar hero pilihan +
// raw image assets komunitas.
// =====================================

const mlHeroes = [
  {
    answer: 'miya',
    role: 'Marksman',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Miya%20-%20Hero011.png'
  },
  {
    answer: 'balmond',
    role: 'Fighter',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Balmond%20-%20Hero021.png'
  },
  {
    answer: 'saber',
    role: 'Assassin',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Saber%20-%20Hero031.png'
  },
  {
    answer: 'nana',
    role: 'Mage',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Nana%20-%20Hero051.png'
  },
  {
    answer: 'tigreal',
    role: 'Tank',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Tigreal%20-%20Hero061.png'
  },
  {
    answer: 'alucard',
    role: 'Fighter/Assassin',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Alucard%20-%20Hero071.png'
  },
  {
    answer: 'franco',
    role: 'Tank',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Franco%20-%20Hero101.png'
  },
  {
    answer: 'chou',
    role: 'Fighter',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Chou%20-%20Hero261.png'
  },
  {
    answer: 'ruby',
    role: 'Fighter',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Ruby%20-%20Hero291.png'
  },
  {
    answer: 'moskov',
    role: 'Marksman',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Moskov%20-%20Hero311.png'
  },
  {
    answer: 'johnson',
    role: 'Tank',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Johnson%20-%20Hero321.png'
  },
  {
    answer: 'kagura',
    role: 'Mage',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Kagura%20-%20Hero251%20(Revamped).png'
  },
  {
    answer: 'lancelot',
    role: 'Assassin',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Lancelot%20-%20Hero471%20(Revamped).png'
  },
  {
    answer: 'ling',
    role: 'Assassin',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Ling%20-%20Hero841.png'
  },
  {
    answer: 'wanwan',
    role: 'Marksman',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Wanwan%20-%20Hero891.png'
  },
  {
    answer: 'beatrix',
    role: 'Marksman',
    image:
      'https://raw.githubusercontent.com/Lara3924/Lara_Image/main/Beatrix%20-%20Hero1051.png'
  }
]

export function getMLQuiz() {
  return randomItem(
    mlHeroes
  )
}
