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
  setMode(mode) {
    this._mode = mode
  }

  start() {
    __mock.vibrations.push({ mode: this._mode, action: 'start' })
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

