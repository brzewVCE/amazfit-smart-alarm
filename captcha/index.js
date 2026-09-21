export { CaptchaStrategy } from './base'
export { getCaptcha, getAvailableCaptchas, registerCaptcha } from './registry'
export { noneCaptcha, NoneCaptchaStrategy } from './strategies/none'
export {
  zombieCaptcha,
  ZombieWalkStrategy,
  DEFAULT_ZOMBIE_STEPS,
  DEFAULT_ZOMBIE_TIMEOUT_SEC,
} from './strategies/zombie'
