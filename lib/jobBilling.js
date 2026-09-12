// NEXA BILLED HEAVY JOB V1
import {
  canUseLimit,
  chargeLimit,
  refundLimit
} from './limitGate.js'

import {
  useLimit,
  addLimit
} from './userdb.js'

import {
  acquireResourceJob
} from './resourceGate.js'

export function beginBilledJob({
  msg,
  jid,
  kind,
  normalCost,
  premiumCost =
    normalCost,
  globalLimit = 2,
  perOwnerLimit = 1,
  ttlMs =
    30 * 60 * 1000
}) {
  const access =
    canUseLimit({
      msg,
      jid,
      cost:
        normalCost,
      premiumCost
    })

  if (
    !access.allowed
  ) {
    return {
      ok: false,
      reason:
        'LIMIT',
      access
    }
  }

  const slot =
    acquireResourceJob({
      kind,
      ownerKey:
        access.userJid,
      globalLimit,
      perOwnerLimit,
      ttlMs
    })

  if (!slot.ok) {
    return {
      ok: false,
      reason:
        'BUSY',
      busy:
        slot,
      access
    }
  }

  const reservation =
    chargeLimit({
      msg,
      jid,
      cost:
        normalCost,
      premiumCost
    })

  if (
    !reservation.success
  ) {
    slot.release()

    return {
      ok: false,
      reason:
        'LIMIT',
      access
    }
  }

  return {
    ok: true,
    access,
    reservation,
    slot,

    get cost() {
      return Number(
        this.reservation
          ?.cost
      ) || 0
    },

    release() {
      return slot.release()
    }
  }
}

export function adjustBilledJob(
  job,
  finalCost
) {
  if (
    !job?.ok ||
    !job.reservation
  ) {
    return {
      success: false,
      reason:
        'JOB_INVALID'
    }
  }

  if (
    job.access?.owner
  ) {
    job.reservation.cost =
      0

    return {
      success: true,
      cost: 0
    }
  }

  const target =
    Math.max(
      0,
      Math.trunc(
        Number(
          finalCost
        ) || 0
      )
    )

  const current =
    Math.max(
      0,
      Math.trunc(
        Number(
          job.reservation
            .cost
        ) || 0
      )
    )

  if (
    target ===
    current
  ) {
    return {
      success: true,
      cost:
        current
    }
  }

  if (
    target >
    current
  ) {
    const extra =
      target -
      current

    const paid =
      useLimit(
        job.reservation
          .userJid,
        extra
      )

    if (
      !paid?.success
    ) {
      return {
        success: false,
        reason:
          'LIMIT',
        missingExtra:
          extra,
        cost:
          current
      }
    }

    job.reservation
      .cost =
        target

    job.reservation
      .charged =
        true

    job.reservation
      .user =
        paid.user

    return {
      success: true,
      cost:
        target
    }
  }

  const refund =
    current -
    target

  if (
    refund > 0 &&
    job.reservation
      .userJid
  ) {
    const user =
      addLimit(
        job.reservation
          .userJid,
        refund
      )

    job.reservation
      .cost =
        target

    job.reservation
      .user =
        user

    if (
      target <= 0
    ) {
      job.reservation
        .charged =
          false
    }
  }

  return {
    success: true,
    cost:
      target
  }
}

export function refundBilledJob(
  job,
  reason =
    'job_failed'
) {
  if (
    !job?.reservation
  ) {
    return {
      refunded: false,
      reason
    }
  }

  return refundLimit(
    job.reservation,
    reason
  )
}
