/**
 * Abstract interface / base class for Ring Screen Skins (Themes).
 * Allows plugging in different visual watch layouts, shapes, and styles.
 */
export class RingSkin {
  constructor(id, label) {
    this.id = id
    this.label = label
  }

  /**
   * Renders the alarm ringing screen.
   *
   * @param {Object} ctx - View context containing { tracker, px }
   * @param {Object} options
   * @param {string} options.timeStr - Current formatted clock time (e.g. "07:30")
   * @param {string} options.message - Wake message or alert note
   * @param {boolean} options.isWarning - True if ringing due to a failed CAPTCHA
   * @param {number} options.snoozeMinutes - Snooze duration
   * @param {Function} options.onSnooze - Snooze button click handler
   * @param {Function} options.onDismiss - Dismiss button click handler
   */
  renderRing(ctx, options) {
    throw new Error('renderRing() must be implemented by RingSkin subclass')
  }

  /**
   * Renders the challenge completion / success screen.
   *
   * @param {Object} ctx - View context containing { tracker, px }
   * @param {Object} options
   * @param {string} options.message - Success text
   */
  renderSuccess(ctx, options) {
    throw new Error('renderSuccess() must be implemented by RingSkin subclass')
  }
}
