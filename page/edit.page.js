import { createWidget, widget, align, text_style, prop } from '@zos/ui'
import { back } from '@zos/router'
import { px } from '@zos/utils'
import { setScrollMode, SCROLL_MODE_FREE } from '@zos/page'
import {
  getAlarmById,
  createDraftAlarm,
  removeAlarm,
  nextAlarmId,
  upsertAlarm,
  scheduleAlarm,
  cancelNative,
  WEEKDAYS,
  SMART_WINDOWS,
  SNOOZE_OPTIONS,
  DEFAULT_SNOOZE_MINUTES,
} from '../alarm'
import { COLOR, formatTime, WidgetTracker, getCenteredBounds, isRoundScreen, DESIGN_WIDTH } from '../ui'
import { getCaptcha, getAvailableCaptchas } from '../captcha'

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
    mode: 'settings', // 'settings' | 'time' | 'captcha' | 'smart' | 'snooze'
    tempHour: 0,
    tempMinute: 0,
    hourWidget: null,
    minWidget: null,
    tracker: new WidgetTracker(),
  },

  onInit(paramsStr) {
    try {
      setScrollMode({
        mode: SCROLL_MODE_FREE,
        options: {
          modeParams: {
            bounce: false,
          },
        },
      })
    } catch (e) {
      try {
        setScrollMode({ mode: SCROLL_MODE_FREE })
      } catch (e2) {}
    }

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
    try {
      setScrollMode({
        mode: SCROLL_MODE_FREE,
        options: {
          modeParams: {
            bounce: false,
          },
        },
      })
    } catch (e) {
      try {
        setScrollMode({ mode: SCROLL_MODE_FREE })
      } catch (e2) {}
    }
    this.render()
  },

  /**
   * Renders a safe, unclipped header with Back button and Title that respects
   * both circular (round) and rectangular display safe chords.
   */
  renderHeader(y, title, onBack) {
    const isRound = isRoundScreen()
    const backX = isRound ? 56 : 18
    const backW = isRound ? 116 : 110
    const backH = 52
    const titleX = isRound ? 180 : 138
    const titleW = isRound ? 230 : 276

    // Back Button - guaranteed within safe screen boundary
    this.track(
      createWidget(widget.BUTTON, {
        x: px(backX),
        y: px(y),
        w: px(backW),
        h: px(backH),
        radius: px(16),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: '< Back',
        text_size: px(24),
        click_func: onBack,
      })
    )

    // Header Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(titleX),
        y: px(y),
        w: px(titleW),
        h: px(backH),
        text: title,
        text_size: px(isRound ? 24 : 26),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    return backH
  },

  clear() {
    this.state.tracker.clear()
    this.state.hourWidget = null
    this.state.minWidget = null
  },

  track(w) {
    return this.state.tracker.track(w)
  },

  render() {
    this.clear()
    if (this.state.mode === 'time') {
      this.renderTimePicker()
    } else if (this.state.mode === 'captcha') {
      this.renderCaptchaMenu()
    } else if (this.state.mode === 'smart') {
      this.renderSmartWakeMenu()
    } else if (this.state.mode === 'snooze') {
      this.renderSnoozeMenu()
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
    const isRound = isRoundScreen()
    let y = isRound ? 84 : 56

    const titleBounds = getCenteredBounds(y, 40, 384)

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(titleBounds.x),
        y: px(y),
        w: px(titleBounds.w),
        h: px(40),
        text: 'Set Time',
        text_size: px(28),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )
    y += 40 + 16

    // Hour Up Button (+)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(y),
        w: px(144),
        h: px(62),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '+',
        text_size: px(36),
        click_func: () => this.setTempHour(this.state.tempHour + 1),
      })
    )

    // Minute Up Button (+)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(242),
        y: px(y),
        w: px(144),
        h: px(62),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '+',
        text_size: px(36),
        click_func: () => this.setTempMinute(this.state.tempMinute + 1),
      })
    )
    y += 62 + 10

    // Hour Display Button (tap cycles +1)
    this.state.hourWidget = this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(y),
        w: px(144),
        h: px(88),
        radius: px(18),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: pad(this.state.tempHour),
        text_size: px(56),
        click_func: () => this.setTempHour(this.state.tempHour + 1),
      })
    )

    // Colon separator
    this.track(
      createWidget(widget.TEXT, {
        x: px(196),
        y: px(y),
        w: px(40),
        h: px(88),
        text: ':',
        text_size: px(52),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
      })
    )

    // Minute Display Button (tap cycles +5)
    this.state.minWidget = this.track(
      createWidget(widget.BUTTON, {
        x: px(242),
        y: px(y),
        w: px(144),
        h: px(88),
        radius: px(18),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: pad(this.state.tempMinute),
        text_size: px(56),
        click_func: () => this.setTempMinute(this.state.tempMinute + 5),
      })
    )
    y += 88 + 10

    // Hour Down Button (-)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(46),
        y: px(y),
        w: px(144),
        h: px(62),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '-',
        text_size: px(36),
        click_func: () => this.setTempHour(this.state.tempHour - 1),
      })
    )

    // Minute Down Button (-)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(242),
        y: px(y),
        w: px(144),
        h: px(62),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '-',
        text_size: px(36),
        click_func: () => this.setTempMinute(this.state.tempMinute - 1),
      })
    )
    y += 62 + 20

    // Quick minute presets (:00, :15, :30, :45)
    const presets = [
      { label: ':00', val: 0 },
      { label: ':15', val: 15 },
      { label: ':30', val: 30 },
      { label: ':45', val: 45 },
    ]
    const preW = 90
    const preGap = 10
    presets.forEach((p, i) => {
      this.track(
        createWidget(widget.BUTTON, {
          x: px(21 + i * (preW + preGap)),
          y: px(y),
          w: px(preW),
          h: px(48),
          radius: px(14),
          normal_color: COLOR.surface,
          press_color: COLOR.primaryDim,
          text: p.label,
          text_size: px(24),
          click_func: () => this.setTempMinute(p.val),
        })
      )
    })
    y += 48 + 24

    // Cancel Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(24),
        y: px(y),
        w: px(184),
        h: px(64),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: 'Cancel',
        text_size: px(28),
        click_func: () => {
          this.state.mode = 'settings'
          this.render()
        },
      })
    )

    // Confirm Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(224),
        y: px(y),
        w: px(184),
        h: px(64),
        radius: px(20),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Confirm',
        text_size: px(28),
        click_func: () => {
          this.state.alarm.hour = this.state.tempHour
          this.state.alarm.minute = this.state.tempMinute
          this.state.mode = 'settings'
          this.render()
        },
      })
    )
    y += 64 + 18

    // Bottom scroll padding spacer using FILL_RECT
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(y),
        w: px(DESIGN_WIDTH),
        h: px(120),
        color: COLOR.background,
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
    const h = 50
    this.track(
      createWidget(widget.TEXT, {
        x: px(18),
        y: px(y),
        w: px(310),
        h: px(h),
        text: labelText,
        text_size: px(26),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )
    this.track(
      createWidget(widget.SLIDE_SWITCH, {
        x: px(340),
        y: px(y + 5),
        w: px(70),
        h: px(40),
        select_bg: 'switch_on.png',
        un_select_bg: 'switch_off.png',
        slide_src: 'switch_knob.png',
        slide_select_x: px(34),
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

  cycleSnooze() {
    const alarm = this.state.alarm
    if (!alarm.snoozeMinutes) alarm.snoozeMinutes = DEFAULT_SNOOZE_MINUTES
    const idx = SNOOZE_OPTIONS.indexOf(alarm.snoozeMinutes)
    alarm.snoozeMinutes = SNOOZE_OPTIONS[(idx + 1) % SNOOZE_OPTIONS.length]
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

  renderCaptchaMenu() {
    const alarm = this.state.alarm
    if (!alarm.captcha) {
      alarm.captcha = { type: 'zombie', steps: 30, timeoutSec: 180 }
    }
    const currentStrategy = getCaptcha(alarm.captcha.type)
    const available = getAvailableCaptchas()

    const isRound = isRoundScreen()
    let y = isRound ? 84 : 56
    y += this.renderHeader(y, 'CAPTCHA Menu', () => {
      this.state.mode = 'settings'
      this.render()
    })
    y += 20

    // Method selection buttons for all registered CAPTCHA strategies
    const btnW = 184
    const totalW = available.length * btnW + (available.length - 1) * 12
    const startX = Math.floor((DESIGN_WIDTH - totalW) / 2)
    available.forEach((strat, i) => {
      const isSelected = currentStrategy.id === strat.id
      this.track(
        createWidget(widget.BUTTON, {
          x: px(startX + i * (btnW + 12)),
          y: px(y),
          w: px(btnW),
          h: px(60),
          radius: px(18),
          normal_color: isSelected ? COLOR.primary : COLOR.surface,
          press_color: COLOR.primaryDim,
          text: strat.label,
          text_size: strat.label.length > 8 ? px(22) : px(26),
          click_func: () => {
            alarm.captcha.type = strat.id
            this.render()
          },
        })
      )
    })
    y += 60 + 20

    // Delegate rendering specific configuration controls to the active strategy
    if (currentStrategy && currentStrategy.renderSettings) {
      const nextY = currentStrategy.renderSettings(this, alarm.captcha, () => this.render(), y)
      if (typeof nextY === 'number') {
        y = nextY
      } else {
        y += 280
      }
    }

    // Done button at bottom
    const doneBounds = getCenteredBounds(y, 64, 384)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(doneBounds.x),
        y: px(y),
        w: px(doneBounds.w),
        h: px(64),
        radius: px(20),
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
    y += 64 + 18

    // Bottom scroll padding spacer using FILL_RECT
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(y),
        w: px(DESIGN_WIDTH),
        h: px(150),
        color: COLOR.background,
      })
    )
  },

  renderSmartWakeMenu() {
    const alarm = this.state.alarm

    const isRound = isRoundScreen()
    let y = isRound ? 84 : 56
    y += this.renderHeader(y, 'Wake Mode', () => {
      this.state.mode = 'settings'
      this.render()
    })
    y += 20

    // Smart Wake toggle switch
    y += this.renderSwitchRow(y, 'Smart Wake', alarm.smart, (checked) => {
      this.setSmart(checked)
    })
    y += 20

    if (alarm.smart) {
      // Section label
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(32),
          text: 'Wake window before alarm:',
          text_size: px(24),
          color: COLOR.textDim,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
        })
      )
      y += 32 + 14

      // Window option buttons: [10 min] [20 min] [30 min]
      const optW = 120
      const optGap = 12
      const startX = Math.floor((DESIGN_WIDTH - (3 * optW + 2 * optGap)) / 2)

      SMART_WINDOWS.forEach((win, i) => {
        const isSelected = alarm.smartWindow === win
        this.track(
          createWidget(widget.BUTTON, {
            x: px(startX + i * (optW + optGap)),
            y: px(y),
            w: px(optW),
            h: px(62),
            radius: px(18),
            normal_color: isSelected ? COLOR.primary : COLOR.surface,
            press_color: isSelected ? COLOR.primaryDim : COLOR.surfaceAlt,
            text: `${win} min`,
            text_size: px(24),
            click_func: () => {
              alarm.smartWindow = win
              this.render()
            },
          })
        )
      })
      y += 62 + 20

      // Explanatory description
      const descH = 160
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(descH),
          text: `Monitors light sleep within ${alarm.smartWindow} min before alarm time to wake you up gently at the optimal moment.`,
          text_size: px(22),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.TOP,
          text_style: text_style.WRAP,
        })
      )
      y += descH + 24
    } else {
      // Off state explanation - generous height and top-aligned so it never gets clipped
      const textH = 240
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(textH),
          text: 'Smart Wake is disabled.\n\nAlarm will ring exactly at the scheduled time.',
          text_size: px(24),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.TOP,
          text_style: text_style.WRAP,
        })
      )
      y += textH + 28
    }

    // Done button at bottom
    const doneBounds = getCenteredBounds(y, 64, 384)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(doneBounds.x),
        y: px(y),
        w: px(doneBounds.w),
        h: px(64),
        radius: px(20),
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
    y += 64 + 18

    // Bottom scroll padding spacer using FILL_RECT
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(y),
        w: px(DESIGN_WIDTH),
        h: px(150),
        color: COLOR.background,
      })
    )
  },

  renderSnoozeMenu() {
    const alarm = this.state.alarm
    const isSnoozeOn = alarm.snooze !== false

    const isRound = isRoundScreen()
    let y = isRound ? 84 : 56
    y += this.renderHeader(y, 'Snooze', () => {
      this.state.mode = 'settings'
      this.render()
    })
    y += 20

    // Snooze toggle switch
    y += this.renderSwitchRow(y, 'Enable Snooze', isSnoozeOn, (checked) => {
      alarm.snooze = checked
      this.render()
    })
    y += 20

    if (isSnoozeOn) {
      const currentMin = alarm.snoozeMinutes || DEFAULT_SNOOZE_MINUTES

      // Section label
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(32),
          text: 'Snooze duration:',
          text_size: px(24),
          color: COLOR.textDim,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
        })
      )
      y += 32 + 14

      // Duration option buttons: [5m] [10m] [15m] [20m]
      const optW = 90
      const optGap = 10
      const startX = Math.floor((DESIGN_WIDTH - (4 * optW + 3 * optGap)) / 2)

      SNOOZE_OPTIONS.forEach((min, i) => {
        const isSelected = currentMin === min
        this.track(
          createWidget(widget.BUTTON, {
            x: px(startX + i * (optW + optGap)),
            y: px(y),
            w: px(optW),
            h: px(60),
            radius: px(18),
            normal_color: isSelected ? COLOR.primary : COLOR.surface,
            press_color: isSelected ? COLOR.primaryDim : COLOR.surfaceAlt,
            text: `${min} min`,
            text_size: px(22),
            click_func: () => {
              alarm.snoozeMinutes = min
              this.render()
            },
          })
        )
      })
      y += 60 + 20

      // Explanatory description
      const descH = 160
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(descH),
          text: `Allows postponing alarm for ${currentMin} minutes when ringing. Snooze button will appear on the ringing screen.`,
          text_size: px(22),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.TOP,
          text_style: text_style.WRAP,
        })
      )
      y += descH + 24
    } else {
      // Off state explanation - generous height and top-aligned so it never gets clipped
      const textH = 240
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(y),
          w: px(384),
          h: px(textH),
          text: 'Snooze is disabled.\n\nAlarm can only be dismissed when ringing — no snooze button will be shown.',
          text_size: px(24),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.TOP,
          text_style: text_style.WRAP,
        })
      )
      y += textH + 28
    }

    // Done button at bottom
    const doneBounds = getCenteredBounds(y, 64, 384)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(doneBounds.x),
        y: px(y),
        w: px(doneBounds.w),
        h: px(64),
        radius: px(20),
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
    y += 64 + 18

    // Bottom scroll padding spacer using FILL_RECT
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(y),
        w: px(DESIGN_WIDTH),
        h: px(150),
        color: COLOR.background,
      })
    )
  },

  renderSettings() {
    const alarm = this.state.alarm
    if (!alarm.captcha) {
      alarm.captcha = {
        type: 'zombie',
        steps: 30,
        timeoutSec: 180,
      }
    }

    const isRound = isRoundScreen()
    let y = isRound ? 84 : 56
    y += this.renderHeader(y, this.state.isNew ? 'New Alarm' : 'Edit Alarm', () => back())
    y += 18

    this.track(
      createWidget(widget.BUTTON, {
        x: px(18),
        y: px(y),
        w: px(396),
        h: px(88),
        radius: px(22),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: formatTime(alarm.hour, alarm.minute),
        text_size: px(56),
        click_func: () => {
          this.state.tempHour = alarm.hour
          this.state.tempMinute = alarm.minute
          this.state.mode = 'time'
          this.render()
        },
      })
    )
    y += 88 + 18

    y += this.renderSwitchRow(y, 'Alarm enabled', alarm.enabled, (checked) =>
      this.setEnabled(checked)
    )
    y += 18

    const dayW = 52
    const dayGap = 6
    WEEKDAYS.forEach((day, i) => {
      const active = (alarm.days & (1 << i)) !== 0
      this.track(
        createWidget(widget.BUTTON, {
          x: px(16 + i * (dayW + dayGap)),
          y: px(y),
          w: px(dayW),
          h: px(54),
          radius: px(14),
          normal_color: active ? COLOR.primary : COLOR.surface,
          press_color: COLOR.primaryDim,
          text: day.label,
          text_size: px(24),
          click_func: () => this.toggleDay(i),
        })
      )
    })
    y += 54 + 20

    // Wake Mode edit window button
    const wakeLabel = alarm.smart
      ? `Wake Mode: Smart (${alarm.smartWindow}m)`
      : 'Wake Mode: Standard (Off)'
    this.track(
      createWidget(widget.BUTTON, {
        x: px(18),
        y: px(y),
        w: px(396),
        h: px(60),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: wakeLabel,
        text_size: px(24),
        click_func: () => {
          this.state.mode = 'smart'
          this.render()
        },
      })
    )
    y += 60 + 14

    // Snooze edit window button
    const isSnoozeOn = alarm.snooze !== false
    const snoozeMin = alarm.snoozeMinutes || DEFAULT_SNOOZE_MINUTES
    const snoozeLabel = isSnoozeOn
      ? `Snooze: ${snoozeMin} min`
      : 'Snooze: Off'
    this.track(
      createWidget(widget.BUTTON, {
        x: px(18),
        y: px(y),
        w: px(396),
        h: px(60),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: snoozeLabel,
        text_size: px(24),
        click_func: () => {
          this.state.mode = 'snooze'
          this.render()
        },
      })
    )
    y += 60 + 14

    // CAPTCHA settings button
    const currentStrategy = getCaptcha(alarm.captcha.type)
    const captchaLabel =
      currentStrategy.id === 'none'
        ? 'CAPTCHA: None'
        : `CAPTCHA: ${currentStrategy.label} (${currentStrategy.getSummary(alarm.captcha)})`

    this.track(
      createWidget(widget.BUTTON, {
        x: px(18),
        y: px(y),
        w: px(396),
        h: px(60),
        radius: px(18),
        normal_color: COLOR.surface,
        press_color: COLOR.border,
        text: captchaLabel,
        text_size: px(24),
        click_func: () => {
          this.state.mode = 'captcha'
          this.render()
        },
      })
    )
    y += 60 + 20

    // Save button
    const saveBounds = getCenteredBounds(y, 64, 384)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(saveBounds.x),
        y: px(y),
        w: px(saveBounds.w),
        h: px(64),
        radius: px(20),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: 'Save',
        text_size: px(28),
        click_func: () => this.saveAndExit(),
      })
    )
    y += 64 + 18

    // Delete Alarm button at bottom (for existing alarms)
    if (!this.state.isNew) {
      const delBounds = getCenteredBounds(y, 60, 384)
      this.track(
        createWidget(widget.BUTTON, {
          x: px(delBounds.x),
          y: px(y),
          w: px(delBounds.w),
          h: px(60),
          radius: px(20),
          normal_color: COLOR.surface,
          press_color: COLOR.danger,
          text: 'Delete Alarm',
          color: COLOR.danger,
          text_size: px(26),
          click_func: () => this.deleteAndExit(),
        })
      )
      y += 60 + 20
    }

    // Bottom scroll padding spacer using FILL_RECT so Zepp OS layout engine registers full scrollable height
    this.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(y),
        w: px(DESIGN_WIDTH),
        h: px(160),
        color: COLOR.background,
      })
    )
  },

  onDestroy() {
    this.clear()
  },
})
