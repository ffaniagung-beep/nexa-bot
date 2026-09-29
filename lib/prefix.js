import config from '../config.js'
import {
  getBotDB,
  updateBotDB
} from './botdb.js'

export function getPrefix() {
  const stored =
    String(
      getBotDB().prefix || ''
    ).trim()

  return (
    stored ||
    config.prefix ||
    '.'
  )
}

export function setPrefix(
  newPrefix
) {
  const prefix =
    String(
      newPrefix || ''
    ).trim()

  if (!prefix) {
    throw new Error(
      'INVALID_PREFIX'
    )
  }

  updateBotDB({
    prefix
  })

  // Config hanya hidup di process bot ini,
  // jadi Bot A dan Bot B bisa punya prefix berbeda.
  config.prefix =
    prefix

  return prefix
}

config.prefix =
  getPrefix()
