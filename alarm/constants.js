export const STORAGE_KEY_ALARMS = 'alarms'
export const STORAGE_KEY_NEXT_ID = 'nextAlarmId'

// Order matches the row of day-toggle buttons shown on the edit page.
export const WEEKDAYS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

// Smart-wake window choices, in minutes.
export const SMART_WINDOWS = [10, 20, 30]

// How often (seconds) the watch re-checks the wearer's heart rate while
// inside a smart-wake window.
export const SMART_CHECK_INTERVAL_SEC = 120

// Minimum bpm rise above resting heart rate that counts as a light-sleep /
// waking signal, good enough to wake the wearer early.
export const SMART_HR_DELTA = 6

// Snooze duration choices, in minutes.
export const SNOOZE_OPTIONS = [5, 10, 15, 20]

// Default snooze duration, in minutes.
export const DEFAULT_SNOOZE_MINUTES = 10
export const SNOOZE_MINUTES = 10
