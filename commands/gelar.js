import { runGelar } from '../lib/funPack.js'

export default {
  name: 'gelar',
  aliases: ['title'],
  category: 'FUN',
  description: 'Mendapat gelar random',
  usage: '.gelar',
  run: runGelar
}
