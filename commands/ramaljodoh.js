import { runRamalJodoh } from '../lib/funPack.js'

export default {
  name: 'ramaljodoh',
  aliases: ['jodoh'],
  category: 'FUN',
  description: 'Mengukur kecocokan dua user',
  usage: '.ramaljodoh @user @user',
  run: runRamalJodoh
}
