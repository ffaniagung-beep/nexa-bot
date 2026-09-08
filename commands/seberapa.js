import { runSeberapa } from '../lib/funPack.js'

export default {
  name: 'seberapa',
  aliases: ['berapa'],
  category: 'FUN',
  description: 'Mengukur sesuatu dengan persen random',
  usage: '.seberapa <teks>',
  run: runSeberapa
}
