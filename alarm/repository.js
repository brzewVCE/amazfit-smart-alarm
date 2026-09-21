import { LocalStorage } from '@zos/storage'
import { STORAGE_KEY_ALARMS, STORAGE_KEY_NEXT_ID } from './constants'
import { normalizeAlarm } from './model'

const storage = new LocalStorage()

/**
 * Retrieves all stored alarms, normalizing any legacy records.
 * @returns {import('./model').Alarm[]}
 */
export function getAlarms() {
  const list = storage.getItem(STORAGE_KEY_ALARMS, [])
  return list.map(normalizeAlarm)
}

/**
 * Persists the entire alarms list to storage.
 * @param {import('./model').Alarm[]} alarms
 */
export function saveAlarms(alarms) {
  storage.setItem(STORAGE_KEY_ALARMS, alarms)
}

/**
 * Finds an alarm by its ID.
 * @param {number} id
 * @returns {import('./model').Alarm|null}
 */
export function getAlarmById(id) {
  const alarm = getAlarms().find((a) => a.id === id)
  return alarm ? normalizeAlarm(alarm) : null
}

/**
 * Inserts or updates an alarm entity in storage.
 * @param {import('./model').Alarm} alarm
 * @returns {import('./model').Alarm}
 */
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

/**
 * Deletes an alarm by ID from storage.
 * @param {number} id
 */
export function removeAlarm(id) {
  saveAlarms(getAlarms().filter((a) => a.id !== id))
}

/**
 * Generates and increments the next available alarm ID.
 * @returns {number}
 */
export function nextAlarmId() {
  const id = storage.getItem(STORAGE_KEY_NEXT_ID, 1)
  storage.setItem(STORAGE_KEY_NEXT_ID, id + 1)
  return id
}
