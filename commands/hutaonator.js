import { startHutaonator } from '../lib/hutaonator.js'
export default {
  name: 'hutaonator',
  aliases: ['hutao', 'akinator'],
  category: 'FUN',
  description: 'Tebak karakter bersama NEXA melalui reply pertanyaan',
  usage: '.hutaonator [stop/lanjut]',
  async run(context) { return startHutaonator(context) }
}
