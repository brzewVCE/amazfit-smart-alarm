export const KEY_BACK = 1
export const KEY_SELECT = 2
export const KEY_HOME = 3
export const KEY_UP = 4
export const KEY_DOWN = 5
export const KEY_SHORTCUT = 6

export const KEY_EVENT_CLICK = 1
export const KEY_EVENT_LONG_PRESS = 2
export const KEY_EVENT_DOUBLE_CLICK = 3
export const KEY_EVENT_PRESS = 4
export const KEY_EVENT_RELEASE = 5

export const GESTURE_UP = 1
export const GESTURE_DOWN = 2
export const GESTURE_LEFT = 3
export const GESTURE_RIGHT = 4

export const __mock = {
  keyCallback: null,
  gestureCallback: null,
  calls: [],
  reset() {
    this.keyCallback = null
    this.gestureCallback = null
    this.calls = []
  },
  triggerKey(key, event = KEY_EVENT_CLICK) {
    if (this.keyCallback) {
      return this.keyCallback(key, event)
    }
    return false
  },
  triggerGesture(gesture) {
    if (this.gestureCallback) {
      return this.gestureCallback(gesture)
    }
    return false
  },
}

export function onKey(options) {
  __mock.calls.push({ fn: 'onKey', options })
  if (options && typeof options.callback === 'function') {
    __mock.keyCallback = options.callback
  }
}

export function offKey() {
  __mock.calls.push({ fn: 'offKey' })
  __mock.keyCallback = null
}

export function onGesture(options) {
  __mock.calls.push({ fn: 'onGesture', options })
  if (options && typeof options.callback === 'function') {
    __mock.gestureCallback = options.callback
  }
}

export function offGesture() {
  __mock.calls.push({ fn: 'offGesture' })
  __mock.gestureCallback = null
}
