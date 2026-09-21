import { exit } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_CALL } from '@zos/sensor'
import { set as setNativeAlarm, cancel as cancelNativeAlarm } from '@zos/alarm'
import {
  getAlarmById,
  scheduleNextCheck,
  rearmAfterRing,
  snooze,
  checkForWakeSignal,
  SNOOZE_MINUTES,
} from '../alarm'
import { COLOR, formatTime, WidgetTracker, getSkin } from '../ui'
import { getCaptcha } from '../captcha'

function getCurrentClockTime() {
  const now = new Date()
  return formatTime(now.getHours(), now.getMinutes())
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

  onInit() {
    const globalData = getApp()._options.globalData
    const wake = globalData.wakeParams
    globalData.wakeParams = null // consume so subsequent manual launch starts clean
    this.state.wake = wake

    if (!wake || !wake.id) {
      exit()
      return
    }

    const alarm = getAlarmById(wake.id)
    this.state.alarm = alarm

    if (!alarm || !alarm.enabled) {
      exit()
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
        exit()
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

    const early = this.state.wake && this.state.wake.mode === 'smart-check'
    const failedCaptcha = this.state.captchaFailed

    let wakeMessage = 'Wake up!'
    if (early) {
      wakeMessage = 'Light sleep detected\nRise and shine'
    } else if (failedCaptcha) {
      wakeMessage = 'Challenge not finished!\nWake up!'
    }

    // Render the watch face appearance using the configured Skin adapter
    const skin = getSkin(this.state.alarm?.skin || 'classic')
    skin.renderRing(
      { tracker: this.state.tracker, px },
      {
        timeStr: getCurrentClockTime(),
        message: wakeMessage,
        isWarning: failedCaptcha,
        snoozeMinutes: SNOOZE_MINUTES,
        onSnooze: () => this.onSnooze(),
        onDismiss: () => this.onDismiss(),
      }
    )

    this.startVibration()
  },

  startVibration() {
    if (!this.state.vibrator) {
      const vibrator = new Vibrator()
      vibrator.setMode(VIBRATOR_SCENE_CALL)
      vibrator.start()
      this.state.vibrator = vibrator
    }
  },

  stopVibration() {
    if (this.state.vibrator) {
      this.state.vibrator.stop()
      this.state.vibrator = null
    }
  },

  onSnooze() {
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      this.state.activeStrategy.cleanup(true)
      this.state.activeStrategy = null
    }
    this.stopVibration()
    snooze(this.state.alarm, SNOOZE_MINUTES)
    exit()
  },

  onDismiss() {
    const type =
      (this.state.alarm && this.state.alarm.captcha && this.state.alarm.captcha.type) || 'none'
    const strategy = getCaptcha(type)

    // CAPTCHA = None -> alarm dismissed immediately without delay
    if (!strategy || strategy.id === 'none') {
      this.cancelFallbackTimer()
      this.stopVibration()
      rearmAfterRing(this.state.alarm)
      exit()
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
    try {
      this.state.fallbackAlarmId = setNativeAlarm({
        url: 'page/ring.page',
        time: nowSec + timeoutSec,
        store: true,
        param: JSON.stringify({ id: this.state.alarm.id, mode: 'captcha-fail' }),
      })
    } catch (e) {}
  },

  cancelFallbackTimer() {
    if (this.state.fallbackAlarmId) {
      try { cancelNativeAlarm(this.state.fallbackAlarmId) } catch (e) {}
      this.state.fallbackAlarmId = null
    }
  },

  /**
   * CAPTCHA = SUCCESS: Alarm is officially dismissed and re-armed for next occurrence.
   */
  onCaptchaSuccess() {
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      this.state.activeStrategy.cleanup(true)
      this.state.activeStrategy = null
    }
    this.stopVibration()
    this.clearWidgets()

    const skin = getSkin(this.state.alarm?.skin || 'classic')
    skin.renderSuccess(
      { tracker: this.state.tracker, px },
      { message: '✓ AWAKE!\nChallenge complete' }
    )

    // Brief confirmation vibration
    try {
      const vibrator = new Vibrator()
      vibrator.setMode(VIBRATOR_SCENE_CALL)
      vibrator.start()
      setTimeout(() => {
        try { vibrator.stop() } catch (e) {}
      }, 400)
    } catch (e) {}

    rearmAfterRing(this.state.alarm)

    setTimeout(() => {
      exit()
    }, 1500)
  },

  /**
   * CAPTCHA = FAIL: Time expired or challenge failed. Return to ringing with updated current time!
   */
  onCaptchaFail() {
    this.cancelFallbackTimer()
    if (this.state.activeStrategy) {
      this.state.activeStrategy.cleanup(true)
      this.state.activeStrategy = null
    }
    this.state.captchaFailed = true
    this.build()
  },

  clearWidgets() {
    this.state.tracker.clear()
  },

  track(w) {
    return this.state.tracker.track(w)
  },

  onDestroy() {
    this.stopVibration()
    if (this.state.activeStrategy) {
      // Clean up challenge runtime UI and sensors, but keep fallback OS alarm
      // active so the alarm rings if the user closed the app without solving!
      this.state.activeStrategy.cleanup(false)
      this.state.activeStrategy = null
    }
    this.clearWidgets()
  },
})
