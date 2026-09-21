import { createWidget, widget, align, text_style } from '@zos/ui'
import { px } from '@zos/utils'
import { Step } from '@zos/sensor'
import { COLOR, formatDuration } from '../../ui'
import { ProgressiveChallengeStrategy } from '../progressive-base'

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

/**
 * Zombie Walk CAPTCHA challenge adapter:
 * Requires the user to walk a specified number of steps within a time window
 * to permanently dismiss the alarm.
 * Inherits visual layout, bounds calculation, progress bar, timer, and snooze from ProgressiveChallengeStrategy.
 */
export class ZombieWalkStrategy extends ProgressiveChallengeStrategy {
  constructor() {
    super('zombie', 'Zombie Walk', {
      title: 'ZOMBIE WALK',
      subtitle: 'Walk to turn off alarm',
      unitLabel: 'steps walked',
    })

    // Sensor state
    this._stepSensor = null
    this._legacySensor = null
    this._onSensorChange = null
    this._initialSteps = -1
    this._lastRawSteps = 0
  }

  get _currentSteps() {
    return this._currentValue
  }

  set _currentSteps(val) {
    this._currentValue = val
  }

  get _targetSteps() {
    return this._targetValue
  }

  set _targetSteps(val) {
    this._targetValue = val
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
   * Uses horizontally centered controls with safe margins for square screens.
   */
  renderSettings(page, config, onUpdate, startY = 180) {
    if (!config.steps) config.steps = DEFAULT_ZOMBIE_STEPS
    if (!config.timeoutSec) config.timeoutSec = DEFAULT_ZOMBIE_TIMEOUT_SEC

    let y = startY

    // Steps section label
    page.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(y),
        w: px(384),
        h: px(32),
        text: 'Steps to dismiss:',
        text_size: px(24),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )
    y += 32 + 12

    // [-5] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(24),
        y: px(y),
        w: px(104),
        h: px(60),
        radius: px(18),
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
        y: px(y),
        w: px(160),
        h: px(60),
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
        x: px(304),
        y: px(y),
        w: px(104),
        h: px(60),
        radius: px(18),
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
    y += 60 + 20

    // Timeout section label
    page.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(y),
        w: px(384),
        h: px(32),
        text: 'Timeout (resumes alarm):',
        text_size: px(24),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )
    y += 32 + 12

    // [-30s] button
    page.track(
      createWidget(widget.BUTTON, {
        x: px(24),
        y: px(y),
        w: px(104),
        h: px(60),
        radius: px(18),
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
        y: px(y),
        w: px(160),
        h: px(60),
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
        x: px(304),
        y: px(y),
        w: px(104),
        h: px(60),
        radius: px(18),
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
    y += 60 + 20

    // Explanatory text
    const textH = 70
    page.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(y),
        w: px(384),
        h: px(textH),
        text: `Walk ${config.steps} steps within ${formatDuration(config.timeoutSec)}.\nIf time expires, alarm resumes ringing.`,
        text_size: px(20),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )
    y += textH + 24

    return y
  }

  onChallengeInit(config) {
    this._targetValue = config.steps || DEFAULT_ZOMBIE_STEPS
    this._remainingSeconds = config.timeoutSec || DEFAULT_ZOMBIE_TIMEOUT_SEC
    this._currentValue = 0
    this._initialSteps = -1
    this._lastRawSteps = 0
  }

  onStartChallenge(_ctx) {
    // 1. Initialize Step sensor: modern @zos/sensor first, fallback to legacy hmSensor ONLY if modern is absent
    try {
      this._stepSensor = new Step()
    } catch (e) {
      this._stepSensor = null
    }

    if (!this._stepSensor) {
      try {
        this._legacySensor = createLegacyStepSensor()
      } catch (e) {
        this._legacySensor = null
      }
    }

    // 2. Read initial baseline steps if available
    const initialRaw = this._readRawSteps()
    if (initialRaw !== null) {
      this._initialSteps = initialRaw
      this._lastRawSteps = initialRaw
      this._statusText = `Today: ${initialRaw} steps`
    }

    // 3. Register change listeners on active sensor only
    this._onSensorChange = () => this._onStepUpdate()

    if (this._stepSensor && typeof this._stepSensor.onChange === 'function') {
      try {
        this._stepSensor.onChange(this._onSensorChange)
      } catch (e) {}
    } else if (
      this._legacySensor &&
      typeof this._legacySensor.addEventListener === 'function' &&
      typeof hmSensor !== 'undefined' &&
      hmSensor.event
    ) {
      try {
        this._legacySensor.addEventListener(hmSensor.event.CHANGE, this._onSensorChange)
      } catch (e) {}
    }
  }

  _readRawSteps() {
    const s1 = extractStepCount(this._stepSensor)
    if (s1 !== null) return s1

    const s2 = extractStepCount(this._legacySensor)
    if (s2 !== null) return s2

    return null
  }

  _onStepUpdate() {
    const raw = this._readRawSteps()
    if (raw !== null) {
      this._lastRawSteps = raw
      if (this._initialSteps < 0) {
        this._initialSteps = raw
        this._currentValue = 0
      } else if (raw >= this._initialSteps) {
        this._currentValue = raw - this._initialSteps
      } else {
        // Counter reset (e.g. midnight rollover)
        this._initialSteps = raw
        this._currentValue = 0
      }
    }

    const statusText = this._lastRawSteps > 0
      ? `Today: ${this._lastRawSteps} steps`
      : 'Sensor active'

    this.updateProgress({
      current: this._currentValue,
      statusText,
    })
  }

  onTick() {
    this._onStepUpdate()
  }

  onCleanup(_isCancelled) {
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
  }
}

export const zombieCaptcha = new ZombieWalkStrategy()
