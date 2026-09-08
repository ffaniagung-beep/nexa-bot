import {
  makeBattleActionCommand
} from '../lib/rpg/actionCommand.js'

export default makeBattleActionCommand({
  name: 'attack',
  aliases: ['atk'],
  action: 'attack',
  description: 'Menyerang monster RPG'
})
