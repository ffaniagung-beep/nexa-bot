// NEXA_INVESTMENT_FOUNDATION_V1
import {
  getProfileJid
} from './profile.js'

import {
  ensureInvestmentAccount
} from './investment.js'

export const INVESTMENT_WELCOME =
  '💠 *Selamat datang di Nexa Investment!*\n\n' +
  'Kamu mendapatkan modal awal:\n' +
  '*500 Nexium Coin*\n\n' +
  'Gunakan dengan bijak untuk membeli aset pertamamu.'

export async function prepareInvestmentUser({
  sock,
  msg,
  jid,
  isOwner = false
}) {
  const userJid =
    getProfileJid(
      msg,
      jid
    )

  if (!userJid) {
    throw new Error(
      'INVESTMENT_PROFILE_NOT_FOUND'
    )
  }

  const state =
    ensureInvestmentAccount(
      userJid,
      {
        isOwner
      }
    )

  if (
    state.created &&
    !isOwner
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          INVESTMENT_WELCOME
      },
      {
        quoted:
          msg
      }
    )
  }

  return {
    userJid,
    ...state
  }
}
