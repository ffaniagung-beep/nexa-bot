import { runApakahAku } from '../lib/funPack.js'

export default {
  name: 'apakahaku',
  aliases: ['apakahgw'],
  category: 'FUN',
  description: 'Menjawab pertanyaan random tentang diri kamu',
  usage: '.apakahaku <pertanyaan>',
  run: runApakahAku
}
