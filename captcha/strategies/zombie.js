import { createWidget, widget, align, text_style, prop } from '@zos/ui'
import { px } from '@zos/utils'
import { Step } from '@zos/sensor'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import { COLOR, formatDuration } from '../../ui'
import { SNOOZE_MINUTES } from '../../alarm'
import { CaptchaStrategy } from '../base'

// Internal configuration defaults and bounds for Zombie Walk challenge
export const DEFAULT_ZOMBIE_STEPS = 30
export const ZOMBIE_STEPS_STEP = 5
export const ZOMBIE_STEPS_MIN = 10
export const ZOMBIE_STEPS_MAX = 200

export const DEFAULT_ZOMBIE_TIMEOUT_SEC = 180
export const ZOMBIE_TIMEOUT_STEP_SEC = 30
export const ZOMBIE_TIMEOUT_MIN_SEC = 60
export const ZOMBIE_TIMEOUT_MAX_SEC = 600

/**
 * Safely extracts numeric step count from any Zepp OS step sensor object.
 * Handles Zepp OS 3.x (getCurrent), Zepp OS 2.x/1.x properties (current, step), and legacy objects.
 */
function extractStepCount(sensor) {
  if (!sensor) return null

  // 1. getCurrent() method (standard in @zos/sensor)
  try {
    if (typeof sensor.getCurrent === 'function') {
      const val = sensor.getCurrent()
      if (typeof val === 'number' && !isNaN(val) && val >= 0) {
        return val
      }
    }
  } catch (e) {}

  // 2. .current property (standard in Zepp OS 1.0/2.0 native hmSensor)
  try {
    if (typeof sensor.current === 'number' && !isNaN(sensor.current) && sensor.current >= 0) {
      return sensor.current
    }
  } catch (e) {}

  // 3. getStep() method (alternate SDK naming)
  try {
    if (typeof sensor.getStep === 'function') {
      const val = sensor.getStep()
      if (typeof val === 'number' && !isNaN(val) && val >= 0) {
        return val
      }
    }
  } catch (e) {}

  // 4. .step property
  try {
    if (typeof sensor.step === 'number' && !isNaN(sensor.step) && sensor.step >= 0) {
      return sensor.step
    }
  } catch (e) {}

  return null
}

/**
 * Creates legacy hmSensor fallback if available in runtime.
 */
function createLegacyStepSensor() {
  try {
    if (
      typeof hmSensor !== 'undefined' &&
      hmSensor &&
      typeof hmSensor.createSensor === 'function' &&
      hmSensor.id &&
      hmSensor.id.STEP
    ) {
      return hmSensor.createSensor(hmSensor.id.STEP)
    }
  } catch (e) {}
  return null
}

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

function updateWidgetWidth(w, width) {
  if (!w) return
  try {
    w.setProperty(prop.MORE, { w: px(width) })
  } catch (e) {
    try {
      w.setProperty(prop.W, px(width))
    } catch (e2) {}
  }
}

/**
 * Zombie Walk CAPTCHA challenge adapter:
 * Requires the user to walk a specified number of steps within a time window
 * to permanently dismiss the alarm.
 */
export class ZombieWalkStrategy extends CaptchaStrategy {
  constructor() {
    super('zombie', 'Zombie Walk')

    // Runtime state
    this._ctx = null
    this._stepSensor = null
    this._legacySensor = null
    this._onSensorChange = null
    this._initialSteps = -1
    this._currentSteps = 0
    this._lastRawSteps = 0
    this._targetSteps = DEFAULT_ZOMBIE_STEPS
    this._remainingSeconds = DEFAULT_ZOMBIE_TIMEOUT_SEC
    this._timerId = null

    // Cached widget references for in-place UI updates
    this._counterWidget = null
    this._fillWidget = null
    this._timerWidget = null
    this._statusWidget = null
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
   * Uses safe widths (350px) to prevent edge clipping on 390px square screens.
   */
  renderSettings(page, config, onUpdate) {
    if (!config.steps) config.steps = DEFAULT_ZOMBIE_STEPS
    if (!config.timeoutSec) config.timeoutSec = DEFAULT_ZOMBIE_TIMEOUT_SEC

    // Steps section label
    page.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(132),
        w: px(350),
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
        x: px(20),
        y: px(164),
        w: px(96),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `-${ZOMBIE_STEPS_STEP}`,
        text_size: px(24),
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
        x: px(126),
        y: px(164),
        w: px(138),
        h: px(52),
        text: `${config.steps} steps`,
        text_size: px(24),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // [+5] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(274),
        y: px(164),
        w: px(96),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `+${ZOMBIE_STEPS_STEP}`,
        text_size: px(24),
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
        x: px(20),
        y: px(228),
        w: px(350),
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
        x: px(20),
        y: px(260),
        w: px(96),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `-${ZOMBIE_TIMEOUT_STEP_SEC}s`,
        text_size: px(22),
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
        x: px(126),
        y: px(260),
        w: px(138),
        h: px(52),
        text: `${formatDuration(config.timeoutSec)} min`,
        text_size: px(24),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // [+30s] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(274),
        y: px(260),
        w: px(96),
        h: px(52),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `+${ZOMBIE_TIMEOUT_STEP_SEC}s`,
        text_size: px(22),
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
        x: px(20),
        y: px(322),
        w: px(350),
        h: px(50),
        text: `Walk ${config.steps} steps within ${formatDuration(config.timeoutSec)}.\nIf time expires, alarm resumes ringing.`,
        text_size: px(18),
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
    this._initialSteps = -1
    this._lastRawSteps = 0

    // 1. Initialize Step sensors (both modern @zos/sensor and legacy hmSensor fallback)
    try {
      this._stepSensor = new Step()
    } catch (e) {
      this._stepSensor = null
    }

    try {
      this._legacySensor = createLegacyStepSensor()
    } catch (e) {
      this._legacySensor = null
    }

    // 2. Read initial baseline steps if available
    const initialRaw = this._readRawSteps()
    if (initialRaw !== null) {
      this._initialSteps = initialRaw
      this._lastRawSteps = initialRaw
    }

    // 3. Register change listeners
    this._onSensorChange = () => this._onStepUpdate()

    if (this._stepSensor && typeof this._stepSensor.onChange === 'function') {
      try {
        this._stepSensor.onChange(this._onSensorChange)
      } catch (e) {}
    }

    if (
      this._legacySensor &&
      typeof this._legacySensor.addEventListener === 'function' &&
      typeof hmSensor !== 'undefined' &&
      hmSensor.event
    ) {
      try {
        this._legacySensor.addEventListener(hmSensor.event.CHANGE, this._onSensorChange)
      } catch (e) {}
    }

    // 4. Keep screen bright during challenge
    try {
      const brightMs = Math.min(this._remainingSeconds * 1000 + 10000, 300000)
      setPageBrightTime({ brightTime: brightMs })
      pauseDropWristScreenOff({ duration: brightMs })
    } catch (e) {}

    // 5. Render initial challenge UI widgets
    this._buildChallengeUI()

    // 6. Start periodic 1-second tick interval (both for countdown and sensor polling)
    this._timerId = setInterval(() => {
      this._onTick()
    }, 1000)
  }

  _readRawSteps() {
    const s1 = extractStepCount(this._stepSensor)
    if (s1 !== null) return s1

    const s2 = extractStepCount(this._legacySensor)
    if (s2 !== null) return s2

    return null
  }

  _buildChallengeUI() {
    if (!this._ctx) return
    this._ctx.clearWidgets()

    const BAR_WIDTH = 330

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
        y: px(16),
        w: px(350),
        h: px(36),
        text: 'ZOMBIE WALK',
        text_size: px(28),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Subtitle
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(54),
        w: px(350),
        h: px(26),
        text: 'Walk to turn off alarm',
        text_size: px(20),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Big Step Counter
    this._counterWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(92),
        w: px(350),
        h: px(78),
        text: `${this._currentSteps} / ${this._targetSteps}`,
        text_size: px(58),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Label under counter
    this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(172),
        w: px(350),
        h: px(24),
        text: 'steps walked',
        text_size: px(18),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Progress bar track
    this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(30),
        y: px(208),
        w: px(BAR_WIDTH),
        h: px(14),
        radius: px(7),
        color: COLOR.surfaceAlt,
      })
    )

    // Progress bar fill
    const progress = Math.min(1, this._currentSteps / this._targetSteps)
    const fillW = Math.max(14, Math.floor(BAR_WIDTH * progress))
    this._fillWidget = this._ctx.trackWidget(
      createWidget(widget.FILL_RECT, {
        x: px(30),
        y: px(208),
        w: px(fillW),
        h: px(14),
        radius: px(7),
        color: COLOR.primary,
      })
    )

    // Countdown timer
    this._timerWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(236),
        w: px(350),
        h: px(32),
        text: `Alarm resumes in ${formatDuration(this._remainingSeconds)}`,
        text_size: px(21),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Daily Total / Sensor Live Indicator
    const initialStatus = this._lastRawSteps > 0
      ? `Today: ${this._lastRawSteps} steps`
      : 'Sensor active'
    this._statusWidget = this._ctx.trackWidget(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(272),
        w: px(350),
        h: px(24),
        text: initialStatus,
        text_size: px(17),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Snooze button
    this._ctx.trackWidget(
      createWidget(widget.BUTTON, {
        x: px(95),
        y: px(312),
        w: px(200),
        h: px(64),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: `Snooze ${SNOOZE_MINUTES}m`,
        text_size: px(22),
        click_func: () => {
          this.cleanup(true)
          if (this._ctx && this._ctx.onSnooze) {
            this._ctx.onSnooze()
          }
        },
      })
    )
  }

  _updateChallengeUI() {
    if (!this._ctx) return

    updateWidgetText(this._counterWidget, `${this._currentSteps} / ${this._targetSteps}`)

    const BAR_WIDTH = 330
    const progress = Math.min(1, this._currentSteps / this._targetSteps)
    const fillW = Math.max(14, Math.floor(BAR_WIDTH * progress))
    updateWidgetWidth(this._fillWidget, fillW)

    updateWidgetText(
      this._timerWidget,
      `Alarm resumes in ${formatDuration(this._remainingSeconds)}`
    )

    const statusText = this._lastRawSteps > 0
      ? `Today: ${this._lastRawSteps} steps`
      : 'Sensor active'
    updateWidgetText(this._statusWidget, statusText)
  }

  _onStepUpdate() {
    const raw = this._readRawSteps()
    if (raw !== null) {
      this._lastRawSteps = raw
      if (this._initialSteps < 0) {
        this._initialSteps = raw
        this._currentSteps = 0
      } else if (raw >= this._initialSteps) {
        this._currentSteps = raw - this._initialSteps
      } else {
        // Counter reset (e.g. midnight rollover)
        this._initialSteps = raw
        this._currentSteps = 0
      }
    }
    this._checkProgress()
  }

  _onTick() {
    this._remainingSeconds = Math.max(0, this._remainingSeconds - 1)
    this._onStepUpdate()
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
      this._updateChallengeUI()
    }
  }

  cleanup(isCancelled = false) {
    if (this._timerId) {
      clearInterval(this._timerId)
      this._timerId = null
    }

    if (this._stepSensor && this._onSensorChange) {
      try {
        if (typeof this._stepSensor.offChange === 'function') {
          this._stepSensor.offChange(this._onSensorChange)
        }
      } catch (e) {}
      this._stepSensor = null
    }

    if (this._legacySensor && this._onSensorChange) {
      try {
        if (
          typeof this._legacySensor.removeEventListener === 'function' &&
          typeof hmSensor !== 'undefined' &&
          hmSensor.event
        ) {
          this._legacySensor.removeEventListener(hmSensor.event.CHANGE, this._onSensorChange)
        }
      } catch (e) {}
      this._legacySensor = null
    }

    this._onSensorChange = null
    this._counterWidget = null
    this._fillWidget = null
    this._timerWidget = null
    this._statusWidget = null

    try { resetDropWristScreenOff() } catch (e) {}
  }
}

export const zombieCaptcha = new ZombieWalkStrategy()
