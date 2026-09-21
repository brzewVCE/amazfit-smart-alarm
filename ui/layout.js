import { getDeviceInfo, SCREEN_SHAPE_ROUND, SCREEN_SHAPE_SQUARE } from '@zos/device'
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './theme'

let cachedInfo = null

/**
 * Resets cached device info (useful for tests or hot-reloading).
 */
export function resetDeviceCache() {
  cachedInfo = null
}

/**
 * Returns safe cached device information from @zos/device.
 * @returns {Object}
 */
export function getDevice() {
  if (!cachedInfo) {
    try {
      cachedInfo = getDeviceInfo() || {}
    } catch (e) {
      cachedInfo = {
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        screenShape: SCREEN_SHAPE_SQUARE,
      }
    }
  }
  return cachedInfo
}

/**
 * Returns true if current target hardware has a circular display.
 * @returns {boolean}
 */
export function isRoundScreen() {
  return getDevice().screenShape === SCREEN_SHAPE_ROUND
}

/**
 * Horizontally centers a widget of given width within the canvas.
 * @param {number} width - Widget width
 * @param {number} [containerWidth=DESIGN_WIDTH] - Container width
 * @returns {number}
 */
export function centerX(width, containerWidth = DESIGN_WIDTH) {
  return Math.round((containerWidth - width) / 2)
}

/**
 * Vertically centers a widget within the canvas.
 * @param {number} height - Widget height
 * @param {number} [containerHeight=DESIGN_HEIGHT] - Container height
 * @param {number} [offset=0] - Additional vertical offset
 * @returns {number}
 */
export function centerY(height, containerHeight = DESIGN_HEIGHT, offset = 0) {
  return Math.round((containerHeight - height) / 2 + offset)
}

/**
 * Calculates safe widget width, automatically accounting for circular bezel clipping on round screens.
 *
 * On circular watches (Round), items near the top and bottom edges are constrained by
 * the circular chord of the screen. This function computes the maximum geometric chord
 * and applies a safety margin so that text/buttons are never clipped by the circular bezel.
 *
 * On square/rectangular watches, returns defaultWidth unmodified.
 *
 * @param {number} y - Top coordinate in design space
 * @param {number} height - Widget height in design space
 * @param {number} [defaultWidth=384] - Desired width for square screens
 * @param {number} [containerWidth=DESIGN_WIDTH] - Design width (432)
 * @param {number} [containerHeight=DESIGN_HEIGHT] - Design height (498)
 * @returns {number}
 */
export function getSafeWidth(
  y,
  height,
  defaultWidth = 384,
  containerWidth = DESIGN_WIDTH,
  containerHeight = DESIGN_HEIGHT
) {
  if (!isRoundScreen()) {
    return defaultWidth
  }

  const radius = containerWidth / 2
  const centerCanvasY = containerHeight / 2

  // Distance from screen center to the farthest vertical edge of this widget
  const dy = Math.max(
    Math.abs(y - centerCanvasY),
    Math.abs(y + height - centerCanvasY)
  )

  if (dy >= radius) {
    return Math.min(defaultWidth, 180)
  }

  // Pythagorean theorem for chord: chord = 2 * sqrt(R^2 - dy^2)
  const maxChord = 2 * Math.sqrt(radius * radius - dy * dy)
  // Apply safety margin (36px) to keep away from curved bezel edge
  const safeChord = Math.floor(maxChord - 36)

  return Math.max(160, Math.min(defaultWidth, safeChord))
}

/**
 * Helper to compute both width and centered X in one call.
 * Returns { x, w }.
 *
 * @param {number} y - Top coordinate in design space
 * @param {number} height - Widget height in design space
 * @param {number} [defaultWidth=384] - Desired width for square screens
 * @param {number} [containerWidth=DESIGN_WIDTH] - Design width
 * @param {number} [containerHeight=DESIGN_HEIGHT] - Design height
 * @returns {{ x: number, w: number }}
 */
export function getCenteredBounds(
  y,
  height,
  defaultWidth = 384,
  containerWidth = DESIGN_WIDTH,
  containerHeight = DESIGN_HEIGHT
) {
  const w = getSafeWidth(y, height, defaultWidth, containerWidth, containerHeight)
  const x = centerX(w, containerWidth)
  return { x, w }
}
