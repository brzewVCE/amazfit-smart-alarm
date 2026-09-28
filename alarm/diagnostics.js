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
 * Formats diagnostic logs and system info into an ultra-compact string safe for embedded QR encoders (capped <= 120 bytes).
 * @param {Array<{ t: string, tag: string, d: string }>} logs
 * @param {object} [sys]
 * @param {number} [pageIdx=0] - 0-indexed page (0 = latest entries)
 * @param {number} [pageSize=4] - entries per QR code (kept low for embedded RTOS safety)
 * @returns {{ content: string, totalPages: number, pageIdx: number, count: number }}
 */
export function formatLogsForQr(logs = [], sys = null, pageIdx = 0, pageSize = 4) {
  if (!logs || logs.length === 0) {
    return {
      content: 'SmartAlarm\nNo events logged.',
      totalPages: 1,
      pageIdx: 0,
      count: 0,
    }
  }

  const reversed = logs.slice().reverse()
  const totalPages = Math.max(1, Math.ceil(reversed.length / pageSize))
  const safePage = Math.max(0, Math.min(pageIdx, totalPages - 1))
  const start = safePage * pageSize
  const slice = reversed.slice(start, start + pageSize)

  const sysSummary = sys?.mode?.available
    ? `D:${sys.mode.dnd ? 1 : 0} S:${sys.mode.sleep ? 1 : 0}`
    : 'Sys:OK'

  const lines = [
    `SA (p${safePage + 1}/${totalPages}) ${sysSummary}`,
  ]

  for (const entry of slice) {
    let d = ''
    if (entry.d) {
      try {
        const p = JSON.parse(entry.d)
        if (p.params) d = ` ${p.params}`
        else if (p.id) d = ` id=${p.id}`
        else if (p.time) d = ` ${p.time}`
        else if (p.hr) d = ` hr=${p.hr}`
        else d = ` ${entry.d.slice(0, 8)}`
      } catch (e) {
        d = ` ${entry.d.slice(0, 8)}`
      }
    }
    const timeShort = entry.t ? entry.t.slice(0, 5) : ''
    lines.push(`${timeShort} ${entry.tag}${d}`)
  }

  // Strict clamp to 120 bytes max to prevent any RTOS buffer overflow
  const content = lines.join('\n').slice(0, 120)

  return {
    content,
    totalPages,
    pageIdx: safePage,
    count: reversed.length,
  }
}

