import { createWidget, widget, align, text_style } from '@zos/ui'
import { px } from '@zos/utils'
import { Step } from '@zos/sensor'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import {
  COLOR,
  SNOOZE_MINUTES,
  DEFAULT_ZOMBIE_STEPS,
  ZOMBIE_STEPS_STEP,
  ZOMBIE_STEPS_MIN,
  ZOMBIE_STEPS_MAX,
  DEFAULT_ZOMBIE_TIMEOUT_SEC,
  ZOMBIE_TIMEOUT_STEP_SEC,
  ZOMBIE_TIMEOUT_MIN_SEC,
  ZOMBIE_TIMEOUT_MAX_SEC,
  formatDuration,
} from '../constants'

/**
 * Zombie Walk CAPTCHA challenge strategy:
 * Requires the user to walk a specified number of steps to permanently dismiss the alarm.
 */
class ZombieWalkStrategy {
  constructor() {
    this.id = 'zombie'
    this.label = 'Zombie Walk'

    // Runtime challenge state
    this._ctx = null
    this._stepSensor = null
    this._initialSteps = 0
    this._currentSteps = 0
    this._targetSteps = DEFAULT_ZOMBIE_STEPS
    this._remainingSeconds = DEFAULT_ZOMBIE_TIMEOUT_SEC
    this._timerId = null
  }

  getDefaultConfig() {
    return {
      type: this.id,
      steps: DEFAULT_ZOMBIE_STEPS,
      timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
    }
  }

  getSummary(config) {
    const steps = (config && config.steps) || DEFAULT_ZOMBIE_STEPS
    const timeout = (config && config.timeoutSec) || DEFAULT_ZOMBIE_TIMEOUT_SEC
    return `${steps} st, ${formatDuration(timeout)}`
  }

  /**
   * Renders the configuration controls for Zombie Walk in the edit page.
   */
  renderSettings(page, config, onUpdate) {
    if (!config.steps) config.steps = DEFAULT_ZOMBIE_STEPS
    if (!config.timeoutSec) config.timeoutSec = DEFAULT_ZOMBIE_TIMEOUT_SEC

    // Steps section label
    page.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(132),
        w: px(400),
        h: px(28),
        text: 'Steps to dismiss:',
        text_size: px(22),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // [-5] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(164),
        w: px(110),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `-${ZOMBIE_STEPS_STEP}`,
        text_size: px(26),
        click_func: () => {
          config.steps = Math.max(
            ZOMBIE_STEPS_MIN,
            Math.min(ZOMBIE_STEPS_MAX, config.steps - ZOMBIE_STEPS_STEP)
          )
          onUpdate()
        },
      })
    )

    // Steps display
    page.track(
      createWidget(widget.TEXT, {
        x: px(136),
        y: px(164),
        w: px(160),
        h: px(52),
        text: `${config.steps} steps`,
        text_size: px(26),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // [+5] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(306),
        y: px(164),
        w: px(110),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `+${ZOMBIE_STEPS_STEP}`,
        text_size: px(26),
        click_func: () => {
          config.steps = Math.max(
            ZOMBIE_STEPS_MIN,
            Math.min(ZOMBIE_STEPS_MAX, config.steps + ZOMBIE_STEPS_STEP)
          )
          onUpdate()
        },
      })
    )

    // Timeout section label
    page.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(228),
        w: px(400),
        h: px(28),
        text: 'Timeout (resumes alarm):',
        text_size: px(22),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // [-30s] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(260),
        w: px(110),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `-${ZOMBIE_TIMEOUT_STEP_SEC}s`,
        text_size: px(24),
        click_func: () => {
          config.timeoutSec = Math.max(
            ZOMBIE_TIMEOUT_MIN_SEC,
            Math.min(ZOMBIE_TIMEOUT_MAX_SEC, config.timeoutSec - ZOMBIE_TIMEOUT_STEP_SEC)
          )
          onUpdate()
        },
      })
    )

    // Timeout display
    page.track(
      createWidget(widget.TEXT, {
        x: px(136),
        y: px(260),
        w: px(160),
        h: px(52),
        text: `${formatDuration(config.timeoutSec)} min`,
        text_size: px(26),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // [+30s] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(306),
        y: px(260),
        w: px(110),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `+${ZOMBIE_TIMEOUT_STEP_SEC}s`,
        text_size: px(24),
        click_func: () => {
          config.timeoutSec = Math.max(
            ZOMBIE_TIMEOUT_MIN_SEC,
            Math.min(ZOMBIE_TIMEOUT_MAX_SEC, config.timeoutSec + ZOMBIE_TIMEOUT_STEP_SEC)
          )
          onUpdate()
        },
      })
    )

    // Explanatory text
    page.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(322),
        w: px(400),
        h: px(50),
        text: `Walk ${config.steps} steps within ${formatDuration(config.timeoutSec)}.\nIf time expires, alarm rings again.`,
        text_size: px(19),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )
  }

  /**
   * Starts the Zombie Walk challenge.
   */
  start(ctx) {
    this._ctx = ctx
    const config = ctx.config || {}
    this._targetSteps = config.steps || DEFAULT_ZOMBIE_STEPS
    this._remainingSeconds = config.timeoutSec || DEFAULT_ZOMBIE_TIMEOUT_SEC
    this._currentSteps = 0

    // 1. Initialize Step sensor
    try {
      this._stepSensor = new Step()
      this._initialSteps = this._stepSensor.getCurrent() || 0
      this._stepSensor.onChange(() => this._onStepUpdate())
    } catch (e) {
      this._initialSteps = 0
    }

    // 3. Keep screen bright during challenge
    try {
      const brightMs = Math.min(this._remainingSeconds * 1000 + 10000, 300000)
      setPageBrightTime({ brightTime: brightMs })
      pauseDropWristScreenOff({ duration: brightMs })
    } catch (e) {}

    // 4. Render initial UI
    this._renderChallengeUI()

    // 5. Start periodic tick interval
    this._timerId = setInterval(() => {
      this._onTick()
    }, 1000)
  }

  _renderChallengeUI() {
    if (!this._ctx) return
    this._ctx.clearWidgets()

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
        x: px(20),
        y: px(24),
        w: px(392),
        h: px(40),
        text: 'ZOMBIE WALK',
        text_size: px(30),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Subtitle
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(68),
        w: px(392),
        h: px(30),
        text: 'Walk to turn off alarm',
        text_size: px(22),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Big Step Counter
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(118),
        w: px(392),
        h: px(84),
        text: `${this._currentSteps} / ${this._targetSteps}`,
        text_size: px(64),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(204),
        w: px(392),
        h: px(28),
        text: 'steps walked',
        text_size: px(20),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Progress bar
    const barW = 352
    const progress = Math.min(1, this._currentSteps / this._targetSteps)
    const fillW = Math.max(16, Math.floor(barW * progress))

    this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(40),
        y: px(244),
        w: px(barW),
        h: px(16),
        radius: px(8),
        color: COLOR.surfaceAlt,
      })
    )

    if (progress > 0) {
      this._ctx.trackWidget(
        createWidget(widget.FILL_RECT, {
          x: px(40),
          y: px(244),
          w: px(fillW),
          h: px(16),
          radius: px(8),
          color: COLOR.primary,
        })
      )
    }

    // Countdown timer
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(282),
        w: px(392),
        h: px(36),
        text: `Alarm resumes in ${formatDuration(this._remainingSeconds)}`,
        text_size: px(24),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Snooze button
    this._ctx.trackWidget(
      createWidget(widget.BUTTON, {
        x: px(116),
        y: px(370),
        w: px(200),
        h: px(70),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: `Snooze ${SNOOZE_MINUTES}m`,
        text_size: px(24),
        click_func: () => {
          this.cleanup(true)
          if (this._ctx && this._ctx.onSnooze) {
            this._ctx.onSnooze()
          }
        },
      })
    )
  }

  _onStepUpdate() {
    if (this._stepSensor) {
      const total = this._stepSensor.getCurrent() || 0
      this._currentSteps = Math.max(0, total - this._initialSteps)
    }
    this._checkProgress()
  }

  _onTick() {
    this._remainingSeconds = Math.max(0, this._remainingSeconds - 1)
    if (this._stepSensor) {
      const total = this._stepSensor.getCurrent() || 0
      this._currentSteps = Math.max(0, total - this._initialSteps)
    }
    this._checkProgress()
  }

  _checkProgress() {
    if (this._currentSteps >= this._targetSteps) {
      const ctx = this._ctx
      this.cleanup(true)
      if (ctx && ctx.onSuccess) {
        ctx.onSuccess()
      }
    } else if (this._remainingSeconds <= 0) {
      const ctx = this._ctx
      this.cleanup(true)
      if (ctx && ctx.onFail) {
        ctx.onFail()
      }
    } else {
      this._renderChallengeUI()
    }
  }

  cleanup() {
    if (this._timerId) {
      clearInterval(this._timerId)
      this._timerId = null
    }

    if (this._stepSensor) {
      try { this._stepSensor.offChange() } catch (e) {}
      this._stepSensor = null
    }

    try { resetDropWristScreenOff() } catch (e) {}
  }
}

export const zombieCaptcha = new ZombieWalkStrategy()
