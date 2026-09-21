import { createWidget, widget, align, text_style, prop, deleteWidget } from '@zos/ui'
import { back } from '@zos/router'
import { px } from '@zos/utils'
import {
  getAlarmById,
  createDraftAlarm,
  removeAlarm,
  nextAlarmId,
  upsertAlarm,
} from '../utils/alarm-store'
import { scheduleAlarm, cancelNative } from '../utils/alarm-scheduler'
import {
  COLOR,
  WEEKDAYS,
  SMART_WINDOWS,
  formatTime,
  CAPTCHA_TYPE,
  DEFAULT_ZOMBIE_STEPS,
  ZOMBIE_STEPS_STEP,
  ZOMBIE_STEPS_MIN,
  ZOMBIE_STEPS_MAX,
  DEFAULT_ZOMBIE_TIMEOUT_SEC,
  ZOMBIE_TIMEOUT_STEP_SEC,
  ZOMBIE_TIMEOUT_MIN_SEC,
  ZOMBIE_TIMEOUT_MAX_SEC,
  formatDuration,
} from '../utils/constants'

function parseParams(paramsStr) {
  const out = {}
  ;(paramsStr || '').split('&').forEach((pair) => {
    const [k, v] = pair.split('=')
    if (k) out[k] = v
  })
  return out
}

Page({
  state: {
    alarm: null,
    isNew: true,
    mode: 'settings', // 'settings' | 'time'
    tempHour: 0,
    tempMinute: 0,
    hourWidget: null,
    minWidget: null,
    widgets: [],
  },

  onInit(paramsStr) {
    const { id } = parseParams(paramsStr)
    const numId = Number(id) || 0

    if (numId) {
      const existing = getAlarmById(numId)
      this.state.alarm = existing || createDraftAlarm()
      this.state.isNew = !existing
    } else {
      this.state.alarm = createDraftAlarm()
      this.state.isNew = true
    }
  },

  build() {
    this.render()
  },

  clear() {
    this.state.widgets.forEach((w) => deleteWidget(w))
    this.state.widgets = []
    this.state.hourWidget = null
    this.state.minWidget = null
  },

  track(w) {
    this.state.widgets.push(w)
    return w
  },

  render() {
    this.clear()
    if (this.state.mode === 'time') {
      this.renderTimePicker()
    } else if (this.state.mode === 'captcha') {
      this.renderCaptchaMenu()
    } else {
      this.renderSettings()
    }
  },

  setTempHour(h) {
    this.state.tempHour = ((h % 24) + 24) % 24
    this.render()
  },

  setTempMinute(m) {
    this.state.tempMinute = ((m % 60) + 60) % 60
    this.render()
  },

  renderTimePicker() {
    const pad = (n) => String(n).padStart(2, '0')

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(14),
        w: px(400),
        h: px(36),
        text: 'Set Time',
        text_size: px(26),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Hour Up Button (+)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(56),
        w: px(140),
        h: px(56),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '+',
        text_size: px(34),
        click_func: () => this.setTempHour(this.state.tempHour + 1),
      })
    )

    // Minute Up Button (+)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(246),
        y: px(56),
        w: px(140),
        h: px(56),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '+',
        text_size: px(34),
        click_func: () => this.setTempMinute(this.state.tempMinute + 1),
      })
    )

    // Hour Display Button (tap cycles +1)
    this.state.hourWidget = this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(120),
        w: px(140),
        h: px(80),
        radius: px(16),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: pad(this.state.tempHour),
        text_size: px(52),
        click_func: () => this.setTempHour(this.state.tempHour + 1),
      })
    )

    // Colon separator
    this.track(
      createWidget(widget.TEXT, {
        x: px(196),
        y: px(120),
        w: px(40),
        h: px(80),
        text: ':',
        text_size: px(48),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Minute Display Button (tap cycles +5)
    this.state.minWidget = this.track(
      createWidget(widget.BUTTON, {
        x: px(246),
        y: px(120),
        w: px(140),
        h: px(80),
        radius: px(16),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: pad(this.state.tempMinute),
        text_size: px(52),
        click_func: () => this.setTempMinute(this.state.tempMinute + 5),
      })
    )

    // Hour Down Button (-)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(208),
        w: px(140),
        h: px(56),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '-',
        text_size: px(34),
        click_func: () => this.setTempHour(this.state.tempHour - 1),
      })
    )

    // Minute Down Button (-)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(246),
        y: px(208),
        w: px(140),
        h: px(56),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '-',
        text_size: px(34),
        click_func: () => this.setTempMinute(this.state.tempMinute - 1),
      })
    )

    // Quick minute presets (:00, :15, :30, :45)
    const presets = [
      { label: ':00', val: 0 },
      { label: ':15', val: 15 },
      { label: ':30', val: 30 },
      { label: ':45', val: 45 },
    ]
    const preW = 88
    const preGap = 10
    presets.forEach((p, i) => {
      this.track(
        createWidget(widget.BUTTON, {
          x: px(22 + i * (preW + preGap)),
          y: px(274),
          w: px(preW),
          h: px(44),
          radius: px(12),
          normal_color: COLOR.surface,
          press_color: COLOR.primaryDim,
          text: p.label,
          text_size: px(22),
          click_func: () => this.setTempMinute(p.val),
        })
      )
    })

    // Cancel Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(22),
        y: px(332),
        w: px(185),
        h: px(60),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: 'Cancel',
        text_size: px(26),
        click_func: () => {
          this.state.mode = 'settings'
          this.render()
        },
      })
    )

    // Confirm Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(225),
        y: px(332),
        w: px(185),
        h: px(60),
        radius: px(18),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Confirm',
        text_size: px(26),
        click_func: () => {
          this.state.alarm.hour = this.state.tempHour
          this.state.alarm.minute = this.state.tempMinute
          this.state.mode = 'settings'
          this.render()
        },
      })
    )
  },

  setEnabled(checked) {
    this.state.alarm.enabled = checked
  },

  toggleDay(bitIndex) {
    this.state.alarm.days ^= 1 << bitIndex
    this.render()
  },

  setSmart(checked) {
    this.state.alarm.smart = checked
    this.render()
  },

  /** A label + native SLIDE_SWITCH row. Returns the row height used. */
  renderSwitchRow(y, labelText, checked, onChange) {
    const h = 56
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(280),
        h: px(h),
        text: labelText,
        text_size: px(28),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )
    this.track(
      createWidget(widget.SLIDE_SWITCH, {
        x: px(320),
        y: px(y),
        w: px(96),
        h: px(56),
        select_bg: 'switch_on.png',
        un_select_bg: 'switch_off.png',
        slide_src: 'switch_knob.png',
        slide_select_x: px(44),
        slide_un_select_x: px(4),
        slide_y: px(4),
        checked,
        checked_change_func: (_widget, isChecked) => onChange(isChecked),
      })
    )
    return h
  },

  cycleSmartWindow() {
    const alarm = this.state.alarm
    const idx = SMART_WINDOWS.indexOf(alarm.smartWindow)
    alarm.smartWindow = SMART_WINDOWS[(idx + 1) % SMART_WINDOWS.length]
    this.render()
  },

  saveAndExit() {
    const alarm = this.state.alarm
    if (this.state.isNew) {
      alarm.id = nextAlarmId()
    }
    if (alarm.enabled) {
      scheduleAlarm(alarm)
    } else {
      cancelNative(alarm)
      upsertAlarm(alarm)
    }
    back()
  },

  deleteAndExit() {
    const alarm = this.state.alarm
    cancelNative(alarm)
    removeAlarm(alarm.id)
    back()
  },

  setCaptchaType(type) {
    if (!this.state.alarm.captcha) {
      this.state.alarm.captcha = {
        type: CAPTCHA_TYPE.ZOMBIE,
        steps: DEFAULT_ZOMBIE_STEPS,
        timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
      }
    }
    this.state.alarm.captcha.type = type
    this.render()
  },

  adjustZombieSteps(delta) {
    const c = this.state.alarm.captcha
    c.steps = Math.max(ZOMBIE_STEPS_MIN, Math.min(ZOMBIE_STEPS_MAX, c.steps + delta))
    this.render()
  },

  adjustZombieTimeout(deltaSec) {
    const c = this.state.alarm.captcha
    c.timeoutSec = Math.max(
      ZOMBIE_TIMEOUT_MIN_SEC,
      Math.min(ZOMBIE_TIMEOUT_MAX_SEC, c.timeoutSec + deltaSec)
    )
    this.render()
  },

  renderCaptchaMenu() {
    const alarm = this.state.alarm
    if (!alarm.captcha) {
      alarm.captcha = {
        type: CAPTCHA_TYPE.ZOMBIE,
        steps: DEFAULT_ZOMBIE_STEPS,
        timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
      }
    }
    const isZombie = alarm.captcha.type === CAPTCHA_TYPE.ZOMBIE

    // Header Back button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(10),
        w: px(90),
        h: px(44),
        radius: px(14),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: 'Back',
        text_size: px(24),
        click_func: () => {
          this.state.mode = 'settings'
          this.render()
        },
      })
    )

    // Header Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(116),
        y: px(10),
        w: px(300),
        h: px(44),
        text: 'CAPTCHA Menu',
        text_size: px(26),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Method selection buttons: None vs Zombie Walk
    const btnW = 194
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(68),
        w: px(btnW),
        h: px(52),
        radius: px(16),
        normal_color: !isZombie ? COLOR.primary : COLOR.surface,
        press_color: COLOR.primaryDim,
        text: 'None',
        text_size: px(26),
        click_func: () => this.setCaptchaType(CAPTCHA_TYPE.NONE),
      })
    )

    this.track(
      createWidget(widget.BUTTON, {
        x: px(222),
        y: px(68),
        w: px(btnW),
        h: px(52),
        radius: px(16),
        normal_color: isZombie ? COLOR.primary : COLOR.surface,
        press_color: COLOR.primaryDim,
        text: 'Zombie Walk',
        text_size: px(24),
        click_func: () => this.setCaptchaType(CAPTCHA_TYPE.ZOMBIE),
      })
    )

    if (isZombie) {
      // Steps section label
      this.track(
        createWidget(widget.TEXT, {
          x: px(16),
          y: px(132),
          w: px(400),
          h: px(28),
          text: 'Steps to dismiss:',
          text_size: px(22),
          color: COLOR.textDim,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
        })
      )

      // [-5] button
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(164),
          w: px(110),
          h: px(52),
          radius: px(16),
          normal_color: COLOR.surface,
          press_color: COLOR.surfaceAlt,
          text: `-${ZOMBIE_STEPS_STEP}`,
          text_size: px(26),
          click_func: () => this.adjustZombieSteps(-ZOMBIE_STEPS_STEP),
        })
      )

      // Steps display
      this.track(
        createWidget(widget.TEXT, {
          x: px(136),
          y: px(164),
          w: px(160),
          h: px(52),
          text: `${alarm.captcha.steps} steps`,
          text_size: px(26),
          color: COLOR.primary,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
        })
      )

      // [+5] button
      this.track(
        createWidget(widget.BUTTON, {
          x: px(306),
          y: px(164),
          w: px(110),
          h: px(52),
          radius: px(16),
          normal_color: COLOR.surface,
          press_color: COLOR.surfaceAlt,
          text: `+${ZOMBIE_STEPS_STEP}`,
          text_size: px(26),
          click_func: () => this.adjustZombieSteps(ZOMBIE_STEPS_STEP),
        })
      )

      // Timeout section label
      this.track(
        createWidget(widget.TEXT, {
          x: px(16),
          y: px(228),
          w: px(400),
          h: px(28),
          text: 'Timeout (resumes alarm):',
          text_size: px(22),
          color: COLOR.textDim,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
        })
      )

      // [-30s] button
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(260),
          w: px(110),
          h: px(52),
          radius: px(16),
          normal_color: COLOR.surface,
          press_color: COLOR.surfaceAlt,
          text: `-${ZOMBIE_TIMEOUT_STEP_SEC}s`,
          text_size: px(24),
          click_func: () => this.adjustZombieTimeout(-ZOMBIE_TIMEOUT_STEP_SEC),
        })
      )

      // Timeout display
      this.track(
        createWidget(widget.TEXT, {
          x: px(136),
          y: px(260),
          w: px(160),
          h: px(52),
          text: `${formatDuration(alarm.captcha.timeoutSec)} min`,
          text_size: px(26),
          color: COLOR.text,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
        })
      )

      // [+30s] button
      this.track(
        createWidget(widget.BUTTON, {
          x: px(306),
          y: px(260),
          w: px(110),
          h: px(52),
          radius: px(16),
          normal_color: COLOR.surface,
          press_color: COLOR.surfaceAlt,
          text: `+${ZOMBIE_TIMEOUT_STEP_SEC}s`,
          text_size: px(24),
          click_func: () => this.adjustZombieTimeout(ZOMBIE_TIMEOUT_STEP_SEC),
        })
      )

      // Helper description
      this.track(
        createWidget(widget.TEXT, {
          x: px(16),
          y: px(322),
          w: px(400),
          h: px(50),
          text: `Walk ${alarm.captcha.steps} steps within ${formatDuration(alarm.captcha.timeoutSec)}.\nIf time expires, alarm rings again.`,
          text_size: px(19),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.WRAP,
        })
      )
    }

    // Done button at bottom
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(420),
        w: px(400),
        h: px(56),
        radius: px(18),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Done',
        text_size: px(28),
        click_func: () => {
          this.state.mode = 'settings'
          this.render()
        },
      })
    )
  },

  renderSettings() {
    const alarm = this.state.alarm
    if (!alarm.captcha) {
      alarm.captcha = {
        type: CAPTCHA_TYPE.ZOMBIE,
        steps: DEFAULT_ZOMBIE_STEPS,
        timeoutSec: DEFAULT_ZOMBIE_TIMEOUT_SEC,
      }
    }

    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(10),
        w: px(90),
        h: px(44),
        radius: px(14),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: 'Back',
        text_size: px(24),
        click_func: () => back(),
      })
    )

    if (!this.state.isNew) {
      this.track(
        createWidget(widget.BUTTON, {
          x: px(300),
          y: px(10),
          w: px(96),
          h: px(44),
          radius: px(14),
          normal_color: COLOR.surface,
          press_color: COLOR.danger,
          text: 'Del',
          text_size: px(24),
          click_func: () => this.deleteAndExit(),
        })
      )
    }

    let y = 58

    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(400),
        h: px(74),
        radius: px(20),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: formatTime(alarm.hour, alarm.minute),
        text_size: px(52),
        click_func: () => {
          this.state.tempHour = alarm.hour
          this.state.tempMinute = alarm.minute
          this.state.mode = 'time'
          this.render()
        },
      })
    )
    y += 74 + 8

    y += this.renderSwitchRow(y, 'Alarm enabled', alarm.enabled, (checked) =>
      this.setEnabled(checked)
    )
    y += 8

    const dayW = 52
    const dayGap = 6
    WEEKDAYS.forEach((day, i) => {
      const active = (alarm.days & (1 << i)) !== 0
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16 + i * (dayW + dayGap)),
          y: px(y),
          w: px(dayW),
          h: px(46),
          radius: px(12),
          normal_color: active ? COLOR.primary : COLOR.surface,
          press_color: COLOR.primaryDim,
          text: day.label,
          text_size: px(22),
          click_func: () => this.toggleDay(i),
        })
      )
    })
    y += 46 + 8

    y += this.renderSwitchRow(y, 'Smart Wake', alarm.smart, (checked) =>
      this.setSmart(checked)
    )
    y += 6

    if (alarm.smart) {
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(y),
          w: px(400),
          h: px(40),
          radius: px(12),
          normal_color: COLOR.surface,
          press_color: COLOR.border,
          text: `Wake window: ${alarm.smartWindow} min before`,
          text_size: px(20),
          click_func: () => this.cycleSmartWindow(),
        })
      )
      y += 40 + 6
    }

    // CAPTCHA settings button
    const captchaLabel =
      alarm.captcha.type === CAPTCHA_TYPE.ZOMBIE
        ? `CAPTCHA: Zombie (${alarm.captcha.steps} st, ${formatDuration(alarm.captcha.timeoutSec)})`
        : 'CAPTCHA: None'

    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(400),
        h: px(44),
        radius: px(14),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: captchaLabel,
        text_size: px(22),
        click_func: () => {
          this.state.mode = 'captcha'
          this.render()
        },
      })
    )
    y += 44 + 8

    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(400),
        h: px(50),
        radius: px(16),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Save',
        text_size: px(28),
        click_func: () => this.saveAndExit(),
      })
    )
    y += 50 + 8

    if (!this.state.isNew) {
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(y),
          w: px(400),
          h: px(46),
          radius: px(16),
          normal_color: COLOR.danger,
          press_color: 0x992222,
          text: 'Delete Alarm',
          text_size: px(24),
          click_func: () => this.deleteAndExit(),
        })
      )
    }
  },

  onDestroy() {
    this.clear()
  },
})
