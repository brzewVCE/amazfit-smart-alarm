import { createWidget, widget, align, text_style, deleteWidget, prop } from '@zos/ui'
import { exit } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_CALL, HeartRate, Step } from '@zos/sensor'
import { set as setNativeAlarm, cancel as cancelNativeAlarm } from '@zos/alarm'
import {
  setPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import { getAlarmById } from '../utils/alarm-store'
import { scheduleNextCheck, rearmAfterRing, snooze } from '../utils/alarm-scheduler'
import {
  COLOR,
  SMART_HR_DELTA,
  SNOOZE_MINUTES,
  formatTime,
  CAPTCHA_TYPE,
  DEFAULT_ZOMBIE_STEPS,
  DEFAULT_ZOMBIE_TIMEOUT_SEC,
  formatDuration,
} from '../utils/constants'

function checkForWakeSignal() {
  try {
    const hr = new HeartRate()
    const last = hr.getLast()
    const resting = hr.getResting()
    if (last && resting && last - resting >= SMART_HR_DELTA) {
      return true
    }
  } catch (e) {
    // Sensor not available/ready - fall through and keep waiting for the
    // final alarm instead of failing the whole check.
  }
  return false
}

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
    widgets: [],
    // Zombie Walk challenge state
    zombieMode: false,
    zombieFailed: false,
    zombieTimerId: null,
    zombieFallbackAlarmId: null,
    stepSensor: null,
    initialSteps: 0,
    currentSteps: 0,
    targetSteps: DEFAULT_ZOMBIE_STEPS,
    remainingSeconds: DEFAULT_ZOMBIE_TIMEOUT_SEC,
    stepTextWidget: null,
    timerTextWidget: null,
  },

  onInit() {
    const globalData = getApp()._options.globalData
    const wake = globalData.wakeParams
    globalData.wakeParams = null // consume it so a later manual open doesn't reuse stale data
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
    } else if (wake.mode === 'zombie-fail') {
      // Woken up by fallback timer because user didn't complete steps in time
      this.state.zombieFailed = true
      this.state.ringing = true
    } else {
      this.state.ringing = true
    }
  },

  build() {
    if (!this.state.ringing) return

    this.clearWidgets()

    const alarm = this.state.alarm
    const early = this.state.wake && this.state.wake.mode === 'smart-check'
    const failedZombie = this.state.zombieFailed

    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(432),
        h: px(514),
        color: COLOR.background,
      })
    )

    // Displays the current real-time clock so repeated loops reflect actual time
    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(140),
        w: px(392),
        h: px(100),
        text: getCurrentClockTime(),
        text_size: px(80),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )

    let wakeMessage = 'Wake up!'
    if (early) {
      wakeMessage = 'Light sleep detected\nRise and shine'
    } else if (failedZombie) {
      wakeMessage = 'Walk not finished!\nWake up!'
    }

    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(250),
        w: px(392),
        h: px(65),
        text: wakeMessage,
        text_size: px(28),
        color: failedZombie ? COLOR.danger : COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )

    this.track(
      createWidget(widget.BUTTON, {
        x: px(40),
        y: px(370),
        w: px(160),
        h: px(90),
        radius: px(20),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: `Snooze ${SNOOZE_MINUTES}m`,
        text_size: px(22),
        click_func: () => this.onSnooze(),
      })
    )

    this.track(
      createWidget(widget.BUTTON, {
        x: px(232),
        y: px(370),
        w: px(160),
        h: px(90),
        radius: px(20),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Dismiss',
        text_size: px(26),
        click_func: () => this.onDismiss(),
      })
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
    this.cleanupZombieWalk(true)
    this.stopVibration()
    snooze(this.state.alarm, SNOOZE_MINUTES)
    exit()
  },

  onDismiss() {
    const captcha = this.state.alarm && this.state.alarm.captcha
    const isZombie = captcha && captcha.type === CAPTCHA_TYPE.ZOMBIE

    if (isZombie) {
      this.startZombieWalk()
    } else {
      this.stopVibration()
      rearmAfterRing(this.state.alarm)
      exit()
    }
  },

  startZombieWalk() {
    // 1. Stop current loud alarm vibration
    this.stopVibration()
    this.clearWidgets()

    const captcha = this.state.alarm.captcha || {}
    const targetSteps = captcha.steps || DEFAULT_ZOMBIE_STEPS
    const timeoutSec = captcha.timeoutSec || DEFAULT_ZOMBIE_TIMEOUT_SEC

    this.state.zombieMode = true
    this.state.targetSteps = targetSteps
    this.state.remainingSeconds = timeoutSec
    this.state.currentSteps = 0

    // 2. Schedule fallback alarm timer to resume ringing if user doesn't finish
    const nowSec = Math.floor(Date.now() / 1000)
    try {
      this.state.zombieFallbackAlarmId = setNativeAlarm({
        url: 'page/ring.page',
        time: nowSec + timeoutSec,
        store: true,
        param: JSON.stringify({ id: this.state.alarm.id, mode: 'zombie-fail' }),
      })
    } catch (e) {
      // Non-fatal if scheduling fails in mock/unsupported environment
    }

    // 3. Initialize Step sensor
    try {
      this.state.stepSensor = new Step()
      this.state.initialSteps = this.state.stepSensor.getCurrent() || 0
      this.state.stepSensor.onChange(() => this.onStepUpdate())
    } catch (e) {
      this.state.initialSteps = 0
    }

    // 4. Prevent screen off during walk challenge
    try {
      const brightMs = Math.min(timeoutSec * 1000 + 10000, 300000)
      setPageBrightTime({ brightTime: brightMs })
      pauseDropWristScreenOff({ duration: brightMs })
    } catch (e) {}

    // 5. Render challenge UI
    this.renderZombieWalkUI()

    // 6. Start 1-second countdown and sensor polling interval
    this.state.zombieTimerId = setInterval(() => {
      this.onZombieTick()
    }, 1000)
  },

  renderZombieWalkUI() {
    this.clearWidgets()

    // Background
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(432),
        h: px(514),
        color: COLOR.background,
      })
    )

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(24),
        w: px(392),
        h: px(40),
        text: 'ZOMBIE WALK',
        text_size: px(30),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Subtitle
    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(68),
        w: px(392),
        h: px(30),
        text: 'Walk to turn off alarm',
        text_size: px(22),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Big Step Counter
    this.state.stepTextWidget = this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(118),
        w: px(392),
        h: px(84),
        text: `${this.state.currentSteps} / ${this.state.targetSteps}`,
        text_size: px(64),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(204),
        w: px(392),
        h: px(28),
        text: 'steps walked',
        text_size: px(20),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Progress bar track
    const barW = 352
    const progress = Math.min(1, this.state.currentSteps / this.state.targetSteps)
    const fillW = Math.max(16, Math.floor(barW * progress))

    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(40),
        y: px(244),
        w: px(barW),
        h: px(16),
        radius: px(8),
        color: COLOR.surfaceAlt,
      })
    )

    if (progress > 0) {
      this.track(
        createWidget(widget.FILL_RECT, {
          x: px(40),
          y: px(244),
          w: px(fillW),
          h: px(16),
          radius: px(8),
          color: COLOR.primary,
        })
      )
    }

    // Countdown timer
    this.state.timerTextWidget = this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(282),
        w: px(392),
        h: px(36),
        text: `Alarm resumes in ${formatDuration(this.state.remainingSeconds)}`,
        text_size: px(24),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Snooze button as a fallback option
    this.track(
      createWidget(widget.BUTTON, {
        x: px(116),
        y: px(370),
        w: px(200),
        h: px(70),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: `Snooze ${SNOOZE_MINUTES}m`,
        text_size: px(24),
        click_func: () => this.onSnooze(),
      })
    )
  },

  onStepUpdate() {
    if (!this.state.zombieMode) return
    if (this.state.stepSensor) {
      const total = this.state.stepSensor.getCurrent() || 0
      this.state.currentSteps = Math.max(0, total - this.state.initialSteps)
    }
    this.checkZombieProgress()
  },

  onZombieTick() {
    if (!this.state.zombieMode) return
    this.state.remainingSeconds = Math.max(0, this.state.remainingSeconds - 1)

    // Poll step sensor in tick as well
    if (this.state.stepSensor) {
      const total = this.state.stepSensor.getCurrent() || 0
      this.state.currentSteps = Math.max(0, total - this.state.initialSteps)
    }

    this.checkZombieProgress()
  },

  checkZombieProgress() {
    if (this.state.currentSteps >= this.state.targetSteps) {
      this.onZombieSuccess()
    } else if (this.state.remainingSeconds <= 0) {
      this.onZombieFail()
    } else {
      // Re-render UI to update step counts, progress bar, and timer
      this.renderZombieWalkUI()
    }
  },

  onZombieSuccess() {
    this.cleanupZombieWalk(true)

    // Clear challenge UI and show success
    this.clearWidgets()

    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(432),
        h: px(514),
        color: COLOR.background,
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(160),
        w: px(392),
        h: px(70),
        text: '✓ AWAKE!',
        text_size: px(54),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(240),
        w: px(392),
        h: px(60),
        text: 'Challenge complete\nAlarm dismissed',
        text_size: px(26),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
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

  onZombieFail() {
    // Timeout expired without completing steps: loop repeats!
    this.cleanupZombieWalk(true)
    this.state.zombieFailed = true
    this.state.zombieMode = false

    // Ring again with current clock time
    this.build()
  },

  cleanupZombieWalk(cancelAlarm = false) {
    if (this.state.zombieTimerId) {
      clearInterval(this.state.zombieTimerId)
      this.state.zombieTimerId = null
    }

    if (this.state.stepSensor) {
      try { this.state.stepSensor.offChange() } catch (e) {}
      this.state.stepSensor = null
    }

    if (cancelAlarm && this.state.zombieFallbackAlarmId) {
      try { cancelNativeAlarm(this.state.zombieFallbackAlarmId) } catch (e) {}
      this.state.zombieFallbackAlarmId = null
    }

    try { resetDropWristScreenOff() } catch (e) {}
  },

  clearWidgets() {
    this.state.widgets.forEach((w) => deleteWidget(w))
    this.state.widgets = []
    this.state.stepTextWidget = null
    this.state.timerTextWidget = null
  },

  track(w) {
    this.state.widgets.push(w)
    return w
  },

  onDestroy() {
    this.stopVibration()
    // Notice: if zombieMode was active and not succeeded, do NOT cancel the
    // fallback alarm so that if user force-closed the app or screen shut off,
    // the system timer will fire and wake the watch back up!
    this.cleanupZombieWalk(false)
    this.clearWidgets()
  },
})
