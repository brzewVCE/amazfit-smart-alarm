import { createWidget, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { COLOR, getCenteredBounds } from '../ui'
import { DEFAULT_SNOOZE_MINUTES } from '../alarm'

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
   * Helper to check if snooze is enabled for the active alarm.
   * @param {Object} options - start() options object containing alarm
   * @returns {boolean}
   */
  isSnoozeEnabled(options) {
    return options && options.alarm && typeof options.alarm.snooze === 'boolean'
      ? options.alarm.snooze
      : true
  }

  /**
   * Helper to get configured snooze duration in minutes.
   * @param {Object} options - start() options object containing alarm
   * @returns {number}
   */
  getSnoozeMinutes(options) {
    return (options && options.alarm && options.alarm.snoozeMinutes) || DEFAULT_SNOOZE_MINUTES
  }

  /**
   * Generic snooze button renderer for any CAPTCHA challenge.
   * Automatically respects alarm.snooze on/off, formats duration, uses responsive bounds,
   * and cleans up challenge state before invoking options.onSnooze().
   *
   * @param {Object} options - start() options object { trackWidget, alarm, onSnooze }
   * @param {Object} [bounds] - optional custom bounds { x, y, w, h }
   * @returns {Object|null} created widget reference or null if snooze disabled
   */
  renderSnoozeButton(options, bounds) {
    if (!options || !this.isSnoozeEnabled(options)) {
      return null
    }

    const defaultBounds = getCenteredBounds(382, 64, 220)
    const b = bounds || defaultBounds
    const minutes = this.getSnoozeMinutes(options)

    return options.trackWidget(
      createWidget(widget.BUTTON, {
        x: px(b.x),
        y: px(b.y !== undefined ? b.y : 382),
        w: px(b.w),
        h: px(b.h !== undefined ? b.h : 64),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: `Snooze ${minutes}m`,
        text_size: px(22),
        click_func: () => {
          this.cleanup(true)
          if (options && options.onSnooze) {
            options.onSnooze()
          }
        },
      })
    )
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
