export const __mock = {
  heartRate: { last: 60, resting: 58 },
  vibrations: [],
  steps: { current: 100, target: 8000, callbacks: [] },
  reset() {
    this.heartRate = { last: 60, resting: 58 }
    this.vibrations = []
    this.steps = { current: 100, target: 8000, callbacks: [] }
  },
}

export class HeartRate {
  getLast() {
    return __mock.heartRate.last
  }

  getResting() {
    return __mock.heartRate.resting
  }
}

export class Vibrator {
  setMode(modeOrOption) {
    this._mode = typeof modeOrOption === 'object' && modeOrOption !== null ? modeOrOption.mode : modeOrOption
  }

  start(option) {
    const mode = option && typeof option === 'object' && option.mode ? option.mode : this._mode
    __mock.vibrations.push({ mode, action: 'start' })
  }

  stop() {
    __mock.vibrations.push({ mode: this._mode, action: 'stop' })
  }
}

export class Step {
  getCurrent() {
    return __mock.steps.current
  }

  getTarget() {
    return __mock.steps.target
  }

  onChange(cb) {
    __mock.steps.callbacks.push(cb)
  }

  offChange(cb) {
    if (cb) {
      __mock.steps.callbacks = __mock.steps.callbacks.filter((c) => c !== cb)
    } else {
      __mock.steps.callbacks = []
    }
  }
}

export const VIBRATOR_SCENE_CALL = 'VIBRATOR_SCENE_CALL'
export const VIBRATOR_SCENE_TIMER = 'VIBRATOR_SCENE_TIMER'

