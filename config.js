import 'dotenv/config'

const envOwners = String(process.env.NEXA_OWNER || '')
  .split(',')
  .map(value => value.replace(/\D/g, ''))
  .filter(Boolean)

const owner = envOwners.length
  ? envOwners
  : ['62882006409303']

export default {
  botName: 'NEXA-BOT',
  prefix: '.',
  owner,
  ownerJids: [],
  sessionFolder: process.env.NEXA_SESSION_FOLDER || './session-new'
}
