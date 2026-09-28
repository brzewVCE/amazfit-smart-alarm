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

/**
 * Formats diagnostic logs and system info into a compact string suitable for QR code export.
 * @param {Array<{ t: string, tag: string, d: string }>} logs
 * @param {object} [sys]
 * @param {number} [pageIdx=0] - 0-indexed page (0 = latest entries)
 * @param {number} [pageSize=15] - entries per QR code
 * @returns {{ content: string, totalPages: number, pageIdx: number, count: number }}
 */
export function formatLogsForQr(logs = [], sys = null, pageIdx = 0, pageSize = 15) {
  if (!logs || logs.length === 0) {
    const sysSummary = sys?.mode?.available
      ? `DND:${sys.mode.dnd ? 1 : 0} Sleep:${sys.mode.sleep ? 1 : 0}`
      : 'SysMode:N/A'
    return {
      content: `SmartAlarm\n${sysSummary}\nNo events logged.`,
      totalPages: 1,
      pageIdx: 0,
      count: 0,
    }
  }

  // Reverse so newest entries come first
  const reversed = logs.slice().reverse()
  const totalPages = Math.max(1, Math.ceil(reversed.length / pageSize))
  const safePage = Math.max(0, Math.min(pageIdx, totalPages - 1))
  const start = safePage * pageSize
  const slice = reversed.slice(start, start + pageSize)

  const sysSummary = sys?.mode?.available
    ? `DND:${sys.mode.dnd ? 1 : 0} Sleep:${sys.mode.sleep ? 1 : 0} Timers:[${(sys.osAlarmIds || []).join(',')}]`
    : `Timers:[${(sys?.osAlarmIds || []).join(',')}]`

  const lines = [
    `SmartAlarm (p${safePage + 1}/${totalPages})`,
    sysSummary,
    '---',
  ]

  for (const entry of slice) {
    const detail = entry.d ? ' ' + entry.d : ''
    lines.push(`${entry.t} ${entry.tag}${detail}`)
  }

  return {
    content: lines.join('\n'),
    totalPages,
    pageIdx: safePage,
    count: reversed.length,
  }
}

