import { exit, home, back } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_CALL } from '@zos/sensor'
import { set as setNativeAlarm, cancel as cancelNativeAlarm } from '@zos/alarm'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import {
  getAlarmById,
  scheduleNextCheck,
  rearmAfterRing,
  snooze,
  checkForWakeSignal,
  SNOOZE_MINUTES,
  DEFAULT_SNOOZE_MINUTES,
} from '../alarm'
import { COLOR, formatTime, WidgetTracker, getSkin } from '../ui'
import { getCaptcha } from '../captcha'
import { lockExit, unlockExit } from '../utils/anti-exit'

function getCurrentClockTime() {
  const now = new Date()
  return formatTime(now.getHours(), now.getMinutes())
}

/**
 * Safely exits the ring application back to the watch face.
 * Uses home() first (standard for Zepp OS alarm wake-ups) to prevent
 * watchdog reboots caused by empty activity launcher stacks.
 */
function safeExit() {
  try {
    unlockExit()
  } catch (e) {}
  try {
    resetDropWristScreenOff()
  } catch (e) {}
  try {
    if (typeof home === 'function') {
      home()
      return
    }
  } catch (e) {}
  try {
    if (typeof exit === 'function') {
      exit()
      return
    }
  } catch (e) {}
  try {
    if (typeof back === 'function') {
      back()
      return
    }
  } catch (e) {}
}

Page({
  state: {
    alarm: null,
    wake: null,
    ringing: false,
    vibrator: null,
    tracker: new WidgetTracker(),
    captchaFailed: false,
    activeStrategy: null,
    fallbackAlarmId: null,
  },

  onInit(param) {
    let wake = null
    if (param) {
      try {
        wake = typeof param === 'string' ? JSON.parse(param) : param
      } catch (e) {}
    }
    if (!wake) {
      try {
        const globalData = getApp()._options.globalData
        wake = globalData.wakeParams
        globalData.wakeParams = null // consume so subsequent manual launch starts clean
      } catch (e) {}
    }
    this.state.wake = wake

    if (!wake || !wake.id) {
      safeExit()
      return
    }

    const alarm = getAlarmById(wake.id)
    this.state.alarm = alarm

    if (!alarm || !alarm.enabled) {
      safeExit()
      return
    }

    if (wake.mode === 'smart-check') {
      if (checkForWakeSignal()) {
        this.state.ringing = true
      } else {
        const remaining = (wake.checksRemaining || 1) - 1
        const nowSec = Math.floor(Date.now() / 1000)
        if (remaining > 0 && nowSec < wake.finalTime) {
          scheduleNextCheck(alarm, remaining, wake.finalTime)
        }
        safeExit()
      }
    } else if (wake.mode === 'captcha-fail') {
      // Re-woken by OS fallback timer because user did not complete challenge in time
      this.state.captchaFailed = true
      this.state.ringing = true
    } else {
      this.state.ringing = true
    }
  },

  build() {
    if (!this.state.ringing) return

    this.clearWidgets()

    // Keep screen on and pause wrist drop screen off while alarm is ringing!
    try {
      setPageBrightTime({ brightTime: 120000 })
      pauseDropWristScreenOff({ duration: 120000 })
    } catch (e) {}

    // Strict Anti-Exit Lock: block physical buttons and swipe gestures during ringing
    try {
      lockExit()
    } catch (e) {}

    const early = this.state.wake && this.state.wake.mode === 'smart-check'
    const failedCaptcha = this.state.captchaFailed

    let wakeMessage = 'Wake up!'
    if (early) {
      wakeMessage = 'Light sleep detected\nRise and shine'
    } else if (failedCaptcha) {
      wakeMessage = 'Challenge not finished!\nWake up!'
    }

    const snoozeEnabled =
      this.state.alarm && typeof this.state.alarm.snooze === 'boolean'
        ? this.state.alarm.snooze
        : true
    const snoozeMin =
      (this.state.alarm && this.state.alarm.snoozeMinutes) || DEFAULT_SNOOZE_MINUTES

    // Auto-snooze safety timer: if no user interaction after 120s of ringing, postpone or re-arm
    if (this._autoSnoozeTimer) {
      clearTimeout(this._autoSnoozeTimer)
      this._autoSnoozeTimer = null
    }
    this._autoSnoozeTimer = setTimeout(() => {
      if (this.state.ringing) {
        if (snoozeEnabled) {
          this.onSnooze()
        } else {
          rearmAfterRing(this.state.alarm)
          safeExit()
        }
      }
    }, 120000)

    // Render the watch face appearance using the configured Skin adapter
    try {
      const skin = getSkin(this.state.alarm?.skin || 'classic')
      skin.renderRing(
        { tracker: this.state.tracker, px },
        {
          timeStr: getCurrentClockTime(),
          message: wakeMessage,
          isWarning: failedCaptcha,
          snoozeMinutes: snoozeMin,
          snoozeEnabled,
          onSnooze: () => this.onSnooze(),
          onDismiss: () => this.onDismiss(),
        }
      )
    } catch (e) {}

    this.startVibration()
  },

  startVibration() {
    try {
      if (!this.state.vibrator) {
        this.state.vibrator = new Vibrator()
      }
      if (this.state.vibrator) {
        try {
          this.state.vibrator.setMode(VIBRATOR_SCENE_CALL)
        } catch (e) {}
        this.state.vibrator.start()
      }
    } catch (e) {}
  },

  stopVibration() {
    if (this.state.vibrator) {
      try {
        this.state.vibrator.stop()
      } catch (e) {}
    }
  },

  onSnooze() {
    if (this._autoSnoozeTimer) {
      clearTimeout(this._autoSnoozeTimer)
      this._autoSnoozeTimer = null
    }
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      this.state.activeStrategy.cleanup(true)
      this.state.activeStrategy = null
    }
    this.stopVibration()
    const snoozeMin =
      (this.state.alarm && this.state.alarm.snoozeMinutes) || DEFAULT_SNOOZE_MINUTES
    snooze(this.state.alarm, snoozeMin)
    safeExit()
  },

  onDismiss() {
    if (this._autoSnoozeTimer) {
      clearTimeout(this._autoSnoozeTimer)
      this._autoSnoozeTimer = null
    }
    const type =
      (this.state.alarm && this.state.alarm.captcha && this.state.alarm.captcha.type) || 'none'
    const strategy = getCaptcha(type)

    // CAPTCHA = None -> alarm dismissed immediately without delay
    if (!strategy || strategy.id === 'none') {
      this.cancelFallbackTimer()
      this.stopVibration()
      rearmAfterRing(this.state.alarm)
      safeExit()
      return
    }

    // CAPTCHA active -> Controller silences alarm, arms generic fallback timer, starts challenge
    this.stopVibration()
    this.clearWidgets()
    this.armFallbackTimer(this.state.alarm.captcha?.timeoutSec || 180)

    this.state.activeStrategy = strategy
    strategy.start({
      trackWidget: (w) => this.track(w),
      clearWidgets: () => this.clearWidgets(),
      alarm: this.state.alarm,
      config: this.state.alarm.captcha,
      onSuccess: () => this.onCaptchaSuccess(),
      onFail: () => this.onCaptchaFail(),
      onSnooze: () => this.onSnooze(),
    })
  },

  armFallbackTimer(timeoutSec) {
    const nowSec = Math.floor(Date.now() / 1000)
    // Add 15s grace period so native watchdog timer never fires while
    // the app is in foreground and handling its own in-app countdown.
    const watchdogSec = timeoutSec + 15
    try {
      this.state.fallbackAlarmId = setNativeAlarm({
        url: 'page/ring.page',
        time: nowSec + watchdogSec,
        store: true,
        param: JSON.stringify({ id: this.state.alarm.id, mode: 'captcha-fail' }),
      })
    } catch (e) {}
  },

  cancelFallbackTimer() {
    const id = this.state.fallbackAlarmId
    this.state.fallbackAlarmId = null
    if (id !== null && id !== undefined && id > 0) {
      try {
        cancelNativeAlarm(id)
      } catch (e) {}
    }
  },

  /**
   * CAPTCHA = SUCCESS: Alarm is officially dismissed and re-armed for next occurrence.
   */
  onCaptchaSuccess() {
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      try {
        this.state.activeStrategy.cleanup(true)
      } catch (e) {}
      this.state.activeStrategy = null
    }
    this.stopVibration()
    this.clearWidgets()

    const skin = getSkin(this.state.alarm?.skin || 'classic')
    try {
      skin.renderSuccess(
        { tracker: this.state.tracker, px },
        { message: '✓ AWAKE!\nChallenge complete' }
      )
    } catch (e) {}

    try {
      rearmAfterRing(this.state.alarm)
    } catch (e) {}

    this._exitTimer = setTimeout(() => {
      this.stopVibration()
      safeExit()
    }, 1500)
  },

  /**
   * CAPTCHA = FAIL: Time expired or challenge failed. Return to ringing with updated current time!
   */
  onCaptchaFail() {
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      try {
        this.state.activeStrategy.cleanup(true)
      } catch (e) {}
      this.state.activeStrategy = null
    }
    this.state.captchaFailed = true
    this.state.ringing = true

    // Re-arm screen brightness, pause wrist-drop screen off, and lock exit immediately
    try {
      setPageBrightTime({ brightTime: 120000 })
      pauseDropWristScreenOff({ duration: 120000 })
    } catch (e) {}
    try {
      lockExit()
    } catch (e) {}

    try {
      this.build()
    } catch (e) {
      this.startVibration()
    }
  },

  clearWidgets() {
    this.state.tracker.clear()
  },

  track(w) {
    return this.state.tracker.track(w)
  },

  onDestroy() {
    if (this._autoSnoozeTimer) {
      clearTimeout(this._autoSnoozeTimer)
      this._autoSnoozeTimer = null
    }
    if (this._hapticTimer) {
      clearTimeout(this._hapticTimer)
      this._hapticTimer = null
    }
    if (this._exitTimer) {
      clearTimeout(this._exitTimer)
      this._exitTimer = null
    }
    try {
      unlockExit()
    } catch (e) {}
    this.stopVibration()
    this.state.vibrator = null
    try {
      resetDropWristScreenOff()
    } catch (e) {}
    if (this.state.activeStrategy) {
      // Clean up challenge runtime UI and sensors, but keep fallback OS alarm
      // active so the alarm rings if the user closed the app without solving!
      this.state.activeStrategy.cleanup(false)
      this.state.activeStrategy = null
    }
    this.clearWidgets()
  },
})
