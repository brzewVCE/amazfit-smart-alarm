/**
 * Formats hour and minute into standard HH:MM representation.
 */
export function formatTime(hour, minute) {
  const h = String(hour).padStart(2, '0')
  const m = String(minute).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Generates a human-readable summary of the weekday bitmask:
 * bit 0 = Monday .. bit 6 = Sunday.
 */
export function daysSummary(days) {
  if (!days) return 'Once'
  if (days === 0b1111111) return 'Every day'
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const picked = []
  for (let i = 0; i < 7; i++) {
    if (days & (1 << i)) picked.push(labels[i])
  }
  return picked.join(' ')
}

/**
 * Formats seconds into M:SS countdown representation.
 */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
