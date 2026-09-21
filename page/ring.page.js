import { createWidget, widget, align, text_style, deleteWidget } from '@zos/ui'
import { exit } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_CALL } from '@zos/sensor'
import { getAlarmById } from '../utils/alarm-store'
import { scheduleNextCheck, rearmAfterRing, snooze } from '../utils/alarm-scheduler'
import { checkForWakeSignal } from '../utils/smart-wake'
import { getCaptcha } from '../utils/captcha'
import { COLOR, SNOOZE_MINUTES, formatTime } from '../utils/constants'

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
    zombieFailed: false,
    activeStrategy: null,
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
      this.state.zombieFailed = true
      this.state.ringing = true
    } else {
      this.state.ringing = true
    }
  },

  build() {
    if (!this.state.ringing) return

    this.clearWidgets()

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

    if (strategy && strategy.id !== 'none') {
      this.stopVibration()
      this.clearWidgets()
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
    } else {
      this.stopVibration()
      rearmAfterRing(this.state.alarm)
      exit()
    }
  },

  onCaptchaSuccess() {
    this.state.activeStrategy = null
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

  onCaptchaFail() {
    this.state.activeStrategy = null
    this.state.zombieFailed = true
    this.build()
  },

  clearWidgets() {
    this.state.widgets.forEach((w) => deleteWidget(w))
    this.state.widgets = []
  },

  track(w) {
    this.state.widgets.push(w)
    return w
  },

  onDestroy() {
    this.stopVibration()
    if (this.state.activeStrategy) {
      // Clean up runtime timers/listeners, but preserve fallback OS alarm
      // if user exited before solving the challenge.
      this.state.activeStrategy.cleanup(false)
      this.state.activeStrategy = null
    }
    this.clearWidgets()
  },
})
