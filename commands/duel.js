import { runDuel } from '../lib/funPack.js'

export default {
  name: 'duel',
  aliases: [],
  category: 'FUN',
  description: 'Duel random melawan user lain',
  usage: '.duel @user',
  run: runDuel
}
