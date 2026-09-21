import { noneCaptcha } from './strategies/none'
import { zombieCaptcha } from './strategies/zombie'

const registry = new Map()

// Register default strategies
registry.set(noneCaptcha.id, noneCaptcha)
registry.set(zombieCaptcha.id, zombieCaptcha)

/**
 * Retrieves a strategy adapter by its ID, defaulting to 'none'.
 * @param {string} type
 * @returns {import('./base').CaptchaStrategy}
 */
export function getCaptcha(type) {
  return registry.get(type) || noneCaptcha
}

/**
 * Returns an array of all registered challenge strategies.
 * @returns {import('./base').CaptchaStrategy[]}
 */
export function getAvailableCaptchas() {
  return Array.from(registry.values())
}

/**
 * Dynamically registers an additional challenge strategy.
 * @param {import('./base').CaptchaStrategy} strategy
 */
export function registerCaptcha(strategy) {
  if (!strategy || !strategy.id) {
    throw new Error('Invalid CAPTCHA strategy: missing id')
  }
  registry.set(strategy.id, strategy)
}
