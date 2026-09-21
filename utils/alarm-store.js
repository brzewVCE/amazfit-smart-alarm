import { LocalStorage } from '@zos/storage'
import {
  STORAGE_KEY_ALARMS,
  STORAGE_KEY_NEXT_ID,
  CAPTCHA_TYPE,
  DEFAULT_ZOMBIE_STEPS,
  DEFAULT_ZOMBIE_TIMEOUT_SEC,
} from './constants'

const storage = new LocalStorage()

/**
 * @typedef {Object} CaptchaConfig
 * @property {string} type - 'none' | 'zombie'
 * @property {number} steps - target steps to walk
 * @property {number} timeoutSec - grace period before alarm rings again
 */

/**
 * @typedef {Object} Alarm
 * @property {number} id
 * @property {number} hour
 * @property {number} minute
 * @property {number} days - bitmask, bit 0 = Monday .. bit 6 = Sunday, 0 = one-time
 * @property {boolean} enabled
 * @property {boolean} smart
 * @property {number} smartWindow - minutes
 * @property {CaptchaConfig} captcha
 * @property {{ final: number, check: number }} nativeIds - ids returned by @zos/alarm set(), 0 = none
 */

function normalizeAlarm(alarm) {
  if (!alarm) return alarm
  if (!alarm.captcha) {
    alarm.captcha = {
      type: CAPTCHA_TYPE.ZOMBIE,
      steps: DEFAULT_ZOMBIE_STEPS,
      timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
    }
  }
  return alarm
}

export function getAlarms() {
  const list = storage.getItem(STORAGE_KEY_ALARMS, [])
  return list.map(normalizeAlarm)
}

export function saveAlarms(alarms) {
  storage.setItem(STORAGE_KEY_ALARMS, alarms)
}

export function getAlarmById(id) {
  const alarm = getAlarms().find((a) => a.id === id)
  return normalizeAlarm(alarm)
}

export function upsertAlarm(alarm) {
  normalizeAlarm(alarm)
  const alarms = getAlarms()
  const index = alarms.findIndex((a) => a.id === alarm.id)
  if (index >= 0) {
    alarms[index] = alarm
  } else {
    alarms.push(alarm)
  }
  saveAlarms(alarms)
  return alarm
}

export function removeAlarm(id) {
  saveAlarms(getAlarms().filter((a) => a.id !== id))
}

export function nextAlarmId() {
  const id = storage.getItem(STORAGE_KEY_NEXT_ID, 1)
  storage.setItem(STORAGE_KEY_NEXT_ID, id + 1)
  return id
}

export function createDraftAlarm() {
  const now = new Date()
  return {
    id: 0, // 0 = unsaved draft
    hour: now.getHours(),
    minute: now.getMinutes(),
    days: 0,
    enabled: true,
    smart: false,
    smartWindow: 20,
    captcha: {
      type: CAPTCHA_TYPE.ZOMBIE,
      steps: DEFAULT_ZOMBIE_STEPS,
      timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
    },
    nativeIds: { final: 0, check: 0 },
  }
}
