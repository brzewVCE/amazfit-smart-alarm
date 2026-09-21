import {
  onKey,
  offKey,
  onGesture,
  offGesture,
  KEY_EVENT_CLICK,
  GESTURE_RIGHT,
} from '@zos/interaction'

let isLocked = false

/**
 * Locks physical buttons and swipe gestures to prevent the user from
 * dismissing or exiting the alarm prematurely.
 *
 * Strict Lock: Returns true from onKey and onGesture callbacks to block
 * the default Zepp OS navigation (returning to watchface or previous page).
 */
export function lockExit(options = {}) {
  const { onButtonPress = null, blockSwipe = true } = options

  if (isLocked) {
    unlockExit()
  }

  try {
    onKey({
      callback: (key, keyEvent) => {
        // If an optional button handler is provided and handles the click:
        if (typeof onButtonPress === 'function') {
          const handled = onButtonPress(key, keyEvent)
          if (handled !== undefined) {
            return !!handled
          }
        }
        // Strict Lock default: return true to intercept and cancel OS default exit
        return true
      },
    })
  } catch (e) {}

  if (blockSwipe) {
    try {
      onGesture({
        callback: (event) => {
          if (event === GESTURE_RIGHT) {
            // Block swipe-to-back navigation
            return true
          }
          return false
        },
      })
    } catch (e) {}
  }

  isLocked = true
}

/**
 * Releases the key and gesture locks, restoring normal watch operation.
 */
export function unlockExit() {
  if (!isLocked) return

  try {
    offKey()
  } catch (e) {}

  try {
    offGesture()
  } catch (e) {}

  isLocked = false
}

/**
 * Returns whether exit is currently locked.
 */
export function isExitLocked() {
  return isLocked
}
