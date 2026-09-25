import { LocalStorage } from '@zos/storage'
import { getAllAlarms } from '@zos/alarm'
import { getSystemMode } from '@zos/settings'

const STORAGE_KEY_DIAG_LOGS = 'smart_alarm_diag_logs'
const MAX_LOG_ENTRIES = 30

const storage = new LocalStorage()

/**
 * Appends a timestamped log entry to persistent local storage.
 * @param {string} tag - Event category / name (e.g. 'SCHEDULE', 'WAKE', 'VIBRATE')
 * @param {any} [details] - Additional contextual data
 */
export function logEvent(tag, details = null) {
  try {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const timeStr = `${h}:${m}:${s}`

    const logs = storage.getItem(STORAGE_KEY_DIAG_LOGS, [])
    const entry = {
      t: timeStr,
      tag,
      d: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : '',
    }

    logs.push(entry)
    while (logs.length > MAX_LOG_ENTRIES) {
      logs.shift()
    }

    storage.setItem(STORAGE_KEY_DIAG_LOGS, logs)
  } catch (e) {}
}

/**
 * Retrieves the stored diagnostic logs.
 * @returns {Array<{ t: string, tag: string, d: string }>}
 */
export function getLogs() {
  try {
    return storage.getItem(STORAGE_KEY_DIAG_LOGS, [])
  } catch (e) {
    return []
  }
}

/**
 * Clears all stored diagnostic logs.
 */
export function clearLogs() {
  try {
    storage.setItem(STORAGE_KEY_DIAG_LOGS, [])
  } catch (e) {}
}

/**
 * Inspects system-level states (DND, Sleep, battery/power saving, native alarms).
 * Handles API Level differences gracefully.
 */
export function getSystemDiagnosticInfo() {
  let modeInfo = {
    dnd: false,
    sleep: false,
    theater: false,
    powerSaving: false,
    available: false,
  }

  try {
    if (typeof getSystemMode === 'function') {
      const mode = getSystemMode()
      if (mode) {
        modeInfo = {
          dnd: Boolean(mode.DND),
          sleep: Boolean(mode.sleep),
          theater: Boolean(mode.theater),
          powerSaving: Boolean(mode.powerSaving),
          available: true,
        }
      }
    }
  } catch (e) {}

  let osAlarmIds = []
  try {
    if (typeof getAllAlarms === 'function') {
      osAlarmIds = getAllAlarms() || []
    }
  } catch (e) {}

  return {
    mode: modeInfo,
    osAlarmIds,
  }
}
