import {
  makeBattleActionCommand
} from '../lib/rpg/actionCommand.js'

export default makeBattleActionCommand({
  name: 'run',
  aliases: ['flee'],
  action: 'run',
  description: 'Mencoba kabur dari battle'
})
