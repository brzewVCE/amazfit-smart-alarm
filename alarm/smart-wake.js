import { HeartRate } from '@zos/sensor'
import { SMART_HR_DELTA } from './constants'

/**
 * Checks if the wearer's current heart rate shows an elevation above resting
 * heart rate, indicating light sleep or an impending awakening.
 *
 * @param {number} [delta=SMART_HR_DELTA] - Minimum bpm difference to qualify as a wake signal
 * @returns {boolean}
 */
export function checkForWakeSignal(delta = SMART_HR_DELTA) {
  try {
    const hr = new HeartRate()
    const last = hr.getLast()
    const resting = hr.getResting()
    if (last && resting && last - resting >= delta) {
      return true
    }
  } catch (e) {
    // Sensor not available/ready - fall through and keep waiting for the
    // final alarm instead of failing the whole check.
  }
  return false
}
