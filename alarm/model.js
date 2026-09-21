/**
 * @typedef {Object} CaptchaConfig
 * @property {string} type - 'none' | 'zombie' | custom
 * @property {number} [steps] - target steps to walk (for zombie challenge)
 * @property {number} [timeoutSec] - grace period before fallback alarm rings
 */

/**
 * @typedef {Object} Alarm
 * @property {number} id - unique identifier, 0 = unsaved draft
 * @property {number} hour - 0..23
 * @property {number} minute - 0..59
 * @property {number} days - bitmask: bit 0 = Monday .. bit 6 = Sunday, 0 = one-time
 * @property {boolean} enabled - active state
 * @property {boolean} smart - light-sleep smart-wake enabled
 * @property {number} smartWindow - minutes (10, 20, 30)
 * @property {CaptchaConfig} captcha - challenge configuration
 * @property {{ final: number, check: number }} nativeIds - native @zos/alarm ids, 0 = none
 */

export const DEFAULT_CAPTCHA_CONFIG = {
  type: 'zombie',
  steps: 30,
  timeoutSec: 180,
}

/**
 * Ensures backwards compatibility for legacy alarm records missing captcha fields.
 * @param {Alarm} alarm
 * @returns {Alarm}
 */
export function normalizeAlarm(alarm) {
  if (!alarm) return alarm
  if (!alarm.captcha) {
    alarm.captcha = { ...DEFAULT_CAPTCHA_CONFIG }
  }
  return alarm
}

/**
 * Creates an unsaved draft alarm initialized with current time and default settings.
 * @returns {Alarm}
 */
export function createDraftAlarm() {
  const now = new Date()
  return {
    id: 0,
    hour: now.getHours(),
    minute: now.getMinutes(),
    days: 0,
    enabled: true,
    smart: false,
    smartWindow: 20,
    captcha: { ...DEFAULT_CAPTCHA_CONFIG },
    nativeIds: { final: 0, check: 0 },
  }
}
