import { createWidget, widget, align, text_style, prop } from '@zos/ui'
import { px } from '@zos/utils'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
} from '@zos/display'
import { COLOR, formatDuration, getCenteredBounds } from '../ui'
import { SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES } from '../alarm'
import { CaptchaStrategy } from './base'

function updateWidgetText(w, text) {
  if (!w) return
  try {
    w.setProperty(prop.MORE, { text })
  } catch (e) {
    try {
      w.setProperty(prop.TEXT, text)
    } catch (e2) {}
  }
}

function updateWidgetWidth(w, width, x, y, h) {
  if (!w) return
  try {
    w.setProperty(prop.MORE, {
      x: px(x),
      y: px(y),
      w: px(width),
      h: px(h),
    })
  } catch (e) {
    try {
      w.setProperty(prop.W, px(width))
    } catch (e2) {}
  }
}

/**
 * Base class for progressive, sensor-driven CAPTCHA challenges
 * (e.g. Zombie Walk, Heart Rate Surge, Shake, etc.).
 *
 * Encapsulates:
 * - Responsive screen bounds (getCenteredBounds) for both square and round displays
 * - Metric counter, progress bar track and dynamic fill
 * - 1-second countdown timer and fallback timeout handling
 * - Wake locks (keeping display on during active challenge)
 * - Snooze action button and callbacks
 * - Unified success and failure dispatching
 */
export class ProgressiveChallengeStrategy extends CaptchaStrategy {
  constructor(id, label, options = {}) {
    super(id, label)
    this.challengeTitle = options.title || label.toUpperCase()
    this.challengeSubtitle = options.subtitle || 'Complete challenge to dismiss'
    this.unitLabel = options.unitLabel || 'completed'

    // Runtime state
    this._ctx = null
    this._currentValue = 0
    this._targetValue = 1
    this._remainingSeconds = 180
    this._statusText = 'Sensor active'
    this._timerId = null

    // Cached widget references for in-place UI updates
    this._counterWidget = null
    this._fillWidget = null
    this._timerWidget = null
    this._statusWidget = null
  }

  /**
   * Subclass hook called during start() to configure target values and timeout.
   * @param {Object} config
   */
  onChallengeInit(config) {}

  /**
   * Subclass hook called during start() to initialize sensors and listeners.
   * @param {Object} ctx
   */
  onStartChallenge(ctx) {}

  /**
   * Subclass hook executed on every 1-second countdown tick.
   */
  onTick() {}

  /**
   * Subclass hook called during cleanup() to dispose sensors and timers.
   * @param {boolean} isCancelled
   */
  onCleanup(isCancelled) {}

  /**
   * Formats text displayed in the large central metric widget.
   * @returns {string}
   */
  getCounterText() {
    return `${this._currentValue} / ${this._targetValue}`
  }

  /**
   * Calculates progress ratio between 0 and 1.
   * @returns {number}
   */
  getProgress() {
    if (this._targetValue <= 0) return 0
    return Math.min(1, Math.max(0, this._currentValue / this._targetValue))
  }

  /**
   * Formats the countdown timer text.
   * @returns {string}
   */
  getTimerText() {
    return `Alarm resumes in ${formatDuration(this._remainingSeconds)}`
  }

  /**
   * Checks whether the user has satisfied the challenge conditions.
   * @returns {boolean}
   */
  isSuccess() {
    return this._currentValue >= this._targetValue
  }

  /**
   * Starts the progressive challenge.
   * @param {Object} ctx
   */
  start(ctx) {
    this._ctx = ctx
    const config = ctx.config || {}
    this._currentValue = 0
    this._targetValue = 1
    this._remainingSeconds = config.timeoutSec || 180
    this._snoozeEnabled = ctx.alarm ? ctx.alarm.snooze !== false : true
    this._snoozeMinutes = (ctx.alarm && ctx.alarm.snoozeMinutes) || DEFAULT_SNOOZE_MINUTES
    this._statusText = 'Sensor active'
    this._isFinished = false
    this._cleanedUp = false

    this.onChallengeInit(config)

    // Keep screen bright during challenge
    try {
      const brightMs = Math.min(this._remainingSeconds * 1000 + 10000, 300000)
      setPageBrightTime({ brightTime: brightMs })
      pauseDropWristScreenOff({ duration: brightMs })
    } catch (e) {}

    // Build the responsive UI
    this._buildChallengeUI()

    // Subclass hook to initialize sensors
    this.onStartChallenge(ctx)

    // Start 1-second periodic countdown
    this._timerId = setInterval(() => {
      this._onTick()
    }, 1000)
  }

  _buildChallengeUI() {
    if (!this._ctx) return
    this._ctx.clearWidgets()

    const headerBounds = getCenteredBounds(82, 36, 384)
    const subBounds = getCenteredBounds(122, 26, 384)
    const countBounds = getCenteredBounds(156, 78, 384)
    const labelBounds = getCenteredBounds(238, 24, 384)
    const barBounds = getCenteredBounds(274, 16, 340)
    const timerBounds = getCenteredBounds(304, 32, 384)
    const statusBounds = getCenteredBounds(342, 24, 384)
    const snoozeBounds = getCenteredBounds(382, 64, 220)

    // Background
    this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(432),
        h: px(514),
        color: COLOR.background,
      })
    )

    // Header title
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(headerBounds.x),
        y: px(82),
        w: px(headerBounds.w),
        h: px(36),
        text: this.challengeTitle,
        text_size: px(28),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Subtitle
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(subBounds.x),
        y: px(122),
        w: px(subBounds.w),
        h: px(26),
        text: this.challengeSubtitle,
        text_size: px(20),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Big Metric Counter
    this._counterWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(countBounds.x),
        y: px(156),
        w: px(countBounds.w),
        h: px(78),
        text: this.getCounterText(),
        text_size: px(58),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Label under counter
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(labelBounds.x),
        y: px(238),
        w: px(labelBounds.w),
        h: px(24),
        text: this.unitLabel,
        text_size: px(18),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Progress bar track
    this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(barBounds.x),
        y: px(274),
        w: px(barBounds.w),
        h: px(16),
        radius: px(8),
        color: COLOR.surfaceAlt,
      })
    )

    // Progress bar fill
    const progress = this.getProgress()
    const fillW = Math.max(16, Math.floor(barBounds.w * progress))
    this._fillWidget = this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(barBounds.x),
        y: px(274),
        w: px(fillW),
        h: px(16),
        radius: px(8),
        color: COLOR.primary,
      })
    )

    // Countdown timer
    this._timerWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(timerBounds.x),
        y: px(304),
        w: px(timerBounds.w),
        h: px(32),
        text: this.getTimerText(),
        text_size: px(21),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Status indicator
    this._statusWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(statusBounds.x),
        y: px(342),
        w: px(statusBounds.w),
        h: px(24),
        text: this._statusText,
        text_size: px(17),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Snooze button delegated to generic base implementation
    this.renderSnoozeButton(this._ctx, snoozeBounds)
  }

  _updateChallengeUI() {
    if (!this._ctx) return

    updateWidgetText(this._counterWidget, this.getCounterText())

    const barBounds = getCenteredBounds(274, 16, 340)
    const progress = this.getProgress()
    const fillW = Math.max(16, Math.floor(barBounds.w * progress))
    updateWidgetWidth(this._fillWidget, fillW, barBounds.x, 274, 16)

    updateWidgetText(this._timerWidget, this.getTimerText())
    updateWidgetText(this._statusWidget, this._statusText)
  }

  /**
   * Updates state values and refreshes the UI or triggers completion.
   * @param {Object} update
   * @param {number} [update.current]
   * @param {number} [update.target]
   * @param {string} [update.statusText]
   */
  updateProgress(update = {}) {
    if (typeof update.current === 'number') {
      this._currentValue = update.current
    }
    if (typeof update.target === 'number') {
      this._targetValue = update.target
    }
    if (typeof update.statusText === 'string') {
      this._statusText = update.statusText
    }
    this._checkProgress()
  }

  _onTick() {
    this._remainingSeconds = Math.max(0, this._remainingSeconds - 1)
    this.onTick()
    this._checkProgress()
  }

  _checkProgress() {
    if (this._isFinished) return

    if (this.isSuccess()) {
      this._isFinished = true
      const ctx = this._ctx
      // CRITICAL: Defer sensor unsubscription and UI widget teardown by a short delay.
      // If this was triggered synchronously by a native sensor event callback (e.g. Step.onChange),
      // attempting to unsubscribe offChange() or null out sensor objects immediately inside the callback
      // corrupts the underlying C++ event dispatch stack on Zepp OS / FreeRTOS hardware, causing a reboot!
      setTimeout(() => {
        this.cleanup(true)
        if (ctx && ctx.onSuccess) {
          ctx.onSuccess()
        }
      }, 50)
    } else if (this._remainingSeconds <= 0) {
      this._isFinished = true
      const ctx = this._ctx
      setTimeout(() => {
        this.cleanup(true)
        if (ctx && ctx.onFail) {
          ctx.onFail()
        }
      }, 50)
    } else {
      this._updateChallengeUI()
    }
  }

  cleanup(isCancelled = false) {
    if (this._timerId) {
      clearInterval(this._timerId)
      this._timerId = null
    }

    if (this._cleanedUp) return
    this._cleanedUp = true

    try {
      this.onCleanup(isCancelled)
    } catch (e) {}

    this._counterWidget = null
    this._fillWidget = null
    this._timerWidget = null
    this._statusWidget = null
  }
}
