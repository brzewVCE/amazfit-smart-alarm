import { exit, home, back } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_TIMER, VIBRATOR_SCENE_CALL } from '@zos/sensor'
import { set as setNativeAlarm, cancel as cancelNativeAlarm } from '@zos/alarm'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
  pausePalmScreenOff,
  resetPalmScreenOff,
  setWakeUpRelaunch,
} from '@zos/display'
import {
  getAlarmById,
  getAlarms,
  scheduleNextCheck,
  rearmAfterRing,
  snooze,
  checkForWakeSignal,
  SNOOZE_MINUTES,
  DEFAULT_SNOOZE_MINUTES,
  logEvent,
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
    resetPalmScreenOff()
  } catch (e) {}
  try {
    if (typeof setWakeUpRelaunch === 'function') {
      setWakeUpRelaunch({ relaunch: false })
    }
  } catch (e) {}
  logEvent('SAFE_EXIT')
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

    // Fallback for Cold-Start / Deep Sleep param loss:
    // If woken by @zos/alarm but param was dropped/empty by OS, search for the enabled alarm
    // closest to the current clock time instead of exiting!
    if (!wake || !wake.id) {
      const allAlarms = getAlarms()
      const now = new Date()
      const currentMin = now.getHours() * 60 + now.getMinutes()
      const candidate = allAlarms
        .filter((a) => a.enabled)
        .sort((a, b) => {
          const diffA = Math.min(
            Math.abs(currentMin - (a.hour * 60 + a.minute)),
            1440 - Math.abs(currentMin - (a.hour * 60 + a.minute))
          )
          const diffB = Math.min(
            Math.abs(currentMin - (b.hour * 60 + b.minute)),
            1440 - Math.abs(currentMin - (b.hour * 60 + b.minute))
          )
          return diffA - diffB
        })[0]

      if (candidate) {
        wake = { id: candidate.id, mode: 'final' }
      }
    }

    this.state.wake = wake

    logEvent('RING_INIT', {
      wake: wake ? { id: wake.id, mode: wake.mode } : null,
      clock: getCurrentClockTime(),
    })

    if (!wake || !wake.id) {
      logEvent('RING_EXIT_NO_WAKE')
      safeExit()
      return
    }

    const alarm = getAlarmById(wake.id)
    this.state.alarm = alarm

    if (!alarm || !alarm.enabled) {
      logEvent('RING_EXIT_NOT_ENABLED', { id: wake.id })
      safeExit()
      return
    }

    // Arm anti-death watchdog: keep app relaunching if screen was turned off
    try {
      if (typeof setWakeUpRelaunch === 'function') {
        setWakeUpRelaunch({ relaunch: true })
      }
    } catch (e) {}

    if (wake.mode === 'smart-check') {
      if (checkForWakeSignal()) {
        logEvent('SMART_WAKE_TRIGGER', { id: alarm.id })
        this.state.ringing = true
      } else {
        const remaining = (wake.checksRemaining || 1) - 1
        const nowSec = Math.floor(Date.now() / 1000)
        logEvent('SMART_CHECK_SILENT', { id: alarm.id, remaining })
        if (remaining > 0 && nowSec < wake.finalTime) {
          scheduleNextCheck(alarm, remaining, wake.finalTime)
        }
        safeExit()
      }
    } else if (wake.mode === 'captcha-fail') {
      // Re-woken by OS fallback timer because user did not complete challenge in time
      logEvent('CAPTCHA_FAIL_LOOP', { id: alarm.id })
      this.state.captchaFailed = true
      this.state.ringing = true
    } else {
      logEvent('RING_ARMED', { id: alarm.id, h: alarm.hour, m: alarm.minute })
      this.state.ringing = true
    }
  },

  build() {
    if (!this.state.ringing) return

    this.clearWidgets()

    // Keep screen on and pause wrist drop screen off while alarm is ringing!
    try {
      setPageBrightTime({ brightTime: 180000 })
      pauseDropWristScreenOff({ duration: 180000 })
      pausePalmScreenOff({ duration: 180000 })
      if (typeof setWakeUpRelaunch === 'function') {
        setWakeUpRelaunch({ relaunch: true })
      }
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
        logEvent('AUTO_SNOOZE', { id: this.state.alarm?.id })
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
        const scene = VIBRATOR_SCENE_TIMER || VIBRATOR_SCENE_CALL
        try {
          this.state.vibrator.setMode({ mode: scene })
        } catch (e) {
          try {
            this.state.vibrator.setMode(scene)
          } catch (e2) {}
        }
        try {
          this.state.vibrator.start({ mode: scene })
        } catch (e) {
          try {
            this.state.vibrator.start()
          } catch (e2) {}
        }
        logEvent('VIBRATE_START', { scene: 'TIMER' })

        // Resilient vibration pulse heartbeat:
        // Zepp OS audio/haptic hardware may be in low-power standby during initial page init.
        // Re-issuing start({ mode: VIBRATOR_SCENE_TIMER }) every 2s ensures the motor stays actively vibrating while ringing.
        if (this._vibratorPulseTimer) {
          clearInterval(this._vibratorPulseTimer)
        }
        this._vibratorPulseTimer = setInterval(() => {
          if (this.state.ringing && this.state.vibrator) {
            try {
              this.state.vibrator.start({ mode: scene })
            } catch (e) {
              try {
                this.state.vibrator.start()
              } catch (e2) {}
            }
          } else {
            this.stopVibration()
          }
        }, 2000)
      }
    } catch (e) {}
  },

  stopVibration() {
    if (this._vibratorPulseTimer) {
      clearInterval(this._vibratorPulseTimer)
      this._vibratorPulseTimer = null
    }
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
      setPageBrightTime({ brightTime: 180000 })
      pauseDropWristScreenOff({ duration: 180000 })
      pausePalmScreenOff({ duration: 180000 })
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
    logEvent('RING_DESTROY')
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
    if (this._vibratorPulseTimer) {
      clearInterval(this._vibratorPulseTimer)
      this._vibratorPulseTimer = null
    }
    try {
      unlockExit()
    } catch (e) {}
    this.stopVibration()
    this.state.vibrator = null
    try {
      resetDropWristScreenOff()
    } catch (e) {}
    try {
      resetPalmScreenOff()
    } catch (e) {}
    try {
      if (typeof setWakeUpRelaunch === 'function') {
        setWakeUpRelaunch({ relaunch: false })
      }
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
