export const __mock = {
  brightTime: 0,
  dropWristPaused: false,
  reset() {
    this.brightTime = 0
    this.dropWristPaused = false
  },
}

export function setPageBrightTime(option) {
  __mock.brightTime = (option && option.brightTime) || 0
}

export function pauseDropWristScreenOff(option) {
  __mock.dropWristPaused = true
}

export function resetDropWristScreenOff() {
  __mock.dropWristPaused = false
}

export function pausePalmScreenOff(option) {}

export function resetPalmScreenOff() {}

export function setScreenOff() {}
