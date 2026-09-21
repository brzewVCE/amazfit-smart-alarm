import { set, cancel } from '@zos/alarm'
import { SMART_CHECK_INTERVAL_SEC } from './constants'
import { upsertAlarm } from './repository'

const RING_URL = 'page/ring.page'

/**
 * Computes next UTC timestamp (seconds) at which `hour:minute` occurs, respecting the
 * `days` weekday bitmask (bit 0 = Monday .. bit 6 = Sunday). `days === 0`
 * means "next time this clock time occurs" (today or tomorrow).
 *
 * @param {number} hour
 * @param {number} minute
 * @param {number} days - bitmask
 * @param {Date} [from=new Date()]
 * @returns {number} UTC epoch seconds
 */
export function computeNextTimestamp(hour, minute, days, from = new Date()) {
  const base = new Date(from)
  base.setSeconds(0, 0)

  if (!days) {
    const candidate = new Date(base)
    candidate.setHours(hour, minute, 0, 0)
    if (candidate.getTime() <= from.getTime()) {
      candidate.setDate(candidate.getDate() + 1)
    }
    return Math.floor(candidate.getTime() / 1000)
  }

  for (let offset = 0; offset < 8; offset++) {
    const candidate = new Date(base)
    candidate.setDate(candidate.getDate() + offset)
    candidate.setHours(hour, minute, 0, 0)

    // JS getDay(): 0 = Sunday .. 6 = Saturday. Our bitmask bit index: 0 = Monday .. 6 = Sunday.
    const jsDay = candidate.getDay()
    const bitIndex = jsDay === 0 ? 6 : jsDay - 1
    const matchesDay = (days & (1 << bitIndex)) !== 0
    const isInFuture = candidate.getTime() > from.getTime()

    if (matchesDay && isInFuture) {
      return Math.floor(candidate.getTime() / 1000)
    }
  }

  return Math.floor(base.getTime() / 1000)
}

function cancelIfSet(id) {
  if (id) cancel(id)
}

/**
 * Cancels active native OS alarms associated with the alarm entity.
 * @param {import('./model').Alarm} alarm
 */
export function cancelNative(alarm) {
  cancelIfSet(alarm.nativeIds && alarm.nativeIds.final)
  cancelIfSet(alarm.nativeIds && alarm.nativeIds.check)
  alarm.nativeIds = { final: 0, check: 0 }
}

/**
 * Arms (or re-arms) the native OS timers for an alarm: the exact-time "final"
 * alarm, and, if smart-wake is enabled, an earlier "check" alarm that polls
 * heart rate at the start of the wake window.
 *
 * @param {import('./model').Alarm} alarm
 * @returns {import('./model').Alarm}
 */
export function scheduleAlarm(alarm) {
  cancelNative(alarm)

  const targetTime = computeNextTimestamp(alarm.hour, alarm.minute, alarm.days)

  alarm.nativeIds.final = set({
    url: RING_URL,
    time: targetTime,
    store: true,
    param: JSON.stringify({ id: alarm.id, mode: 'final' }),
  })

  if (alarm.smart) {
    const windowStart = targetTime - alarm.smartWindow * 60
    const checksAvailable = Math.max(
      1,
      Math.floor((alarm.smartWindow * 60) / SMART_CHECK_INTERVAL_SEC)
    )
    const firstCheckTime = Math.max(windowStart, Math.floor(Date.now() / 1000) + 5)

    alarm.nativeIds.check = set({
      url: RING_URL,
      time: firstCheckTime,
      store: true,
      param: JSON.stringify({
        id: alarm.id,
        mode: 'smart-check',
        checksRemaining: checksAvailable,
        finalTime: targetTime,
      }),
    })
  }

  upsertAlarm(alarm)
  return alarm
}

/**
 * Schedules the next periodic heart-rate check within a smart-wake window.
 */
export function scheduleNextCheck(alarm, checksRemaining, finalTime) {
  cancelIfSet(alarm.nativeIds.check)

  alarm.nativeIds.check = set({
    url: RING_URL,
    delay: SMART_CHECK_INTERVAL_SEC,
    store: true,
    param: JSON.stringify({
      id: alarm.id,
      mode: 'smart-check',
      checksRemaining,
      finalTime,
    }),
  })

  upsertAlarm(alarm)
}

/**
 * Called once the ring screen has been dismissed.
 * Re-arms repeating alarms or disables one-shot alarms.
 * @param {import('./model').Alarm} alarm
 */
export function rearmAfterRing(alarm) {
  cancelNative(alarm)

  if (alarm.days) {
    scheduleAlarm(alarm)
  } else {
    alarm.enabled = false
    upsertAlarm(alarm)
  }
}

/**
 * Snoozes an alarm for the given minutes by setting a delayed native timer.
 * @param {import('./model').Alarm} alarm
 * @param {number} minutes
 */
export function snooze(alarm, minutes) {
  cancelNative(alarm)
  alarm.nativeIds.final = set({
    url: RING_URL,
    delay: minutes * 60,
    store: true,
    param: JSON.stringify({ id: alarm.id, mode: 'final' }),
  })
  upsertAlarm(alarm)
}
