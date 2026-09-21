/**
 * Strategy interface for alarm dismissal CAPTCHA challenges.
 *
 * Each challenge implementation (e.g. Zombie Walk, Math, Shake) must adhere to
 * this interface, ensuring ring.page.js and edit.page.js remain fully decoupled
 * from specific sensor, UI, or challenge logic.
 *
 * @typedef {Object} CaptchaContext
 * @property {Function} trackWidget - Registers a widget with the page tracker
 * @property {Function} clearWidgets - Clears all widgets currently on screen
 * @property {Object} alarm - The current Alarm object
 * @property {Object} config - The alarm.captcha configuration object
 * @property {Function} onSuccess - Callback when the challenge is solved
 * @property {Function} onFail - Callback when timeout expires or challenge fails
 * @property {Function} onSnooze - Callback if user chooses to snooze during challenge
 */

import { zombieCaptcha } from './zombie'
import { noneCaptcha } from './none'

const REGISTRY = new Map()

export function registerCaptcha(strategy) {
  REGISTRY.set(strategy.id, strategy)
}

export function getCaptcha(id) {
  return REGISTRY.get(id) || REGISTRY.get('none') || noneCaptcha
}

export function getAvailableCaptchas() {
  return Array.from(REGISTRY.values())
}

// Register built-in strategies
registerCaptcha(noneCaptcha)
registerCaptcha(zombieCaptcha)
