/**
 * Base contract / interface for CAPTCHA challenge strategies (Strategy / Adapter pattern).
 * All challenge types (None, Zombie Walk, Math Quiz, Shake, etc.) must implement this interface.
 */
export class CaptchaStrategy {
  constructor(id, label) {
    this.id = id
    this.label = label
  }

  /**
   * Returns the default configuration object for this challenge strategy.
   * @returns {Object}
   */
  getDefaultConfig() {
    return { type: this.id }
  }

  /**
   * Renders challenge parameter configuration controls within the Edit Page.
   *
   * @param {Object} ctx - Rendering context { track, clear, px, COLOR }
   * @param {Object} config - Current challenge configuration
   * @param {Function} onChange - Callback triggered when settings change: onChange(newConfig)
   */
  renderSettings(ctx, config, onChange) {
    // Optional hook: override if strategy provides custom settings UI
  }

  /**
   * Starts the challenge when the user attempts to dismiss the alarm.
   *
   * @param {Object} options
   * @param {Function} options.trackWidget - Function to track and register UI widgets
   * @param {Function} options.clearWidgets - Function to clear active challenge widgets
   * @param {Object} options.alarm - The ringing alarm entity
   * @param {Object} options.config - The challenge configuration
   * @param {Function} options.onSuccess - Callback to permanently dismiss the alarm
   * @param {Function} options.onFail - Callback when challenge fails (re-triggers alarm loop)
   * @param {Function} options.onSnooze - Callback when snooze is tapped during challenge
   */
  start(options) {
    throw new Error(`start() must be implemented by ${this.constructor.name}`)
  }

  /**
   * Disposes hardware sensors, timers, intervals, and display wake locks.
   * @param {boolean} [isCancelled=false] - True if interrupted by snooze or app destruction
   */
  cleanup(isCancelled = false) {
    // Cleanup hook
  }
}
