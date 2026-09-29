import 'dotenv/config'

const owner = String(process.env.NEXA_OWNER || '')
  .split(',')
  .map(value => value.replace(/\D/g, ''))
  .filter(Boolean)

export default {
  botName: 'NEXA-BOT',
  prefix: '.',
  owner,
  ownerJids: [],
  sessionFolder: process.env.NEXA_SESSION_FOLDER || './session-new'
}
