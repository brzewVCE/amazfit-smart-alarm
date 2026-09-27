import { createWidget, widget, align, text_style } from '@zos/ui'
import { back } from '@zos/router'
import { px } from '@zos/utils'
import { getDeviceInfo } from '@zos/device'
import { Vibrator, VIBRATOR_SCENE_TIMER } from '@zos/sensor'
import { setScrollMode, scrollTo, SCROLL_MODE_FREE } from '@zos/page'
import {
  getLogs,
  clearLogs,
  getSystemDiagnosticInfo,
  reconcileTimers,
  APP_VERSION,
  APP_BUILD_CODE,
  APP_BUILD_DATE,
} from '../alarm'
import { COLOR, WidgetTracker, isRoundScreen } from '../ui'

Page({
  state: {
    tracker: new WidgetTracker(),
    testVibrator: null,
    testTimer: null,
  },

  onInit() {
    this.enableScrolling()
  },

  build() {
    this.enableScrolling()
    this.render()
  },

  onShow() {
    this.enableScrolling()
    this.render()
  },

  enableScrolling() {
    try {
      setScrollMode({
        mode: SCROLL_MODE_FREE,
        options: {
          modeParams: {
            bounce: true,
          },
        },
      })
    } catch (e) {
      try {
        setScrollMode({ mode: SCROLL_MODE_FREE })
      } catch (e2) {}
    }
  },

  clear() {
    this.state.tracker.clear()
  },

  track(w) {
    return this.state.tracker.track(w)
  },

  render() {
    this.clear()

    const sys = getSystemDiagnosticInfo()
    const logs = getLogs()
    let dev = { width: 390, height: 450 }
    try {
      dev = getDeviceInfo() || dev
    } catch (e) {}

    const isRound = isRoundScreen()
    // Start safely below the Zepp OS native status bar (50-60px on square, 84px on round)
    let y = isRound ? 84 : 64

    // Top Header: Back Button and Page Title on the same row
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(100),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '< Wróć',
        text_size: px(18),
        color: COLOR.textDim,
        click_func: () => {
          back()
        },
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(126),
        y: px(y),
        w: px(248),
        h: px(44),
        text: 'Dev Menu & Logi',
        text_size: px(23),
        color: COLOR.primary,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )

    y += 54

    // Version & Device Info Banner
    const roundLabel = isRound ? 'Round' : 'Square'
    const verText = `Wersja: v${APP_VERSION} (b${APP_BUILD_CODE}) | ${APP_BUILD_DATE}\nEkran: ${dev.width || 390}x${dev.height || 450} (${roundLabel})`
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(46),
        text: verText,
        text_size: px(16),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.TOP,
      })
    )

    y += 50

    // System Status Banner (DND / Sleep / Timers)
    let statusText = ''
    if (sys.mode.available) {
      statusText += `DND: ${sys.mode.dnd ? 'WŁ (!)' : 'WYŁ'} | Sen: ${sys.mode.sleep ? 'WŁ (!)' : 'WYŁ'}\n`
    } else {
      statusText += `Tryb snu/DND: [Standard API]\n`
    }
    statusText += `Timery Zepp OS: ${sys.osAlarmIds.length} [${sys.osAlarmIds.join(', ') || 'brak'}]`

    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(46),
        text: statusText,
        text_size: px(16),
        color: sys.mode.dnd || sys.mode.sleep ? COLOR.danger : COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.TOP,
      })
    )

    y += 50

    // Actions Row 1: Test Vibrator & Clear Logs
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(174),
        h: px(42),
        radius: px(21),
        normal_color: COLOR.primaryDim,
        press_color: COLOR.primary,
        text: 'Test Wibracji',
        text_size: px(18),
        color: COLOR.text,
        click_func: () => {
          this.runVibrationTest()
        },
      })
    )

    this.track(
      createWidget(widget.BUTTON, {
        x: px(198),
        y: px(y),
        w: px(176),
        h: px(42),
        radius: px(21),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: 'Wyczyść logi',
        text_size: px(17),
        color: COLOR.textDim,
        click_func: () => {
          clearLogs()
          this.render()
        },
      })
    )

    y += 48

    // Actions Row 2: Re-arm / Reconcile Timers button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '🔄 Uzbrój / Odśwież timery',
        text_size: px(18),
        color: COLOR.primary,
        click_func: () => {
          reconcileTimers()
          this.render()
        },
      })
    )

    y += 52

    // Recent Logs Header
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(28),
        text: `Ostatnie zdarzenia (${logs.length}):`,
        text_size: px(19),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    y += 32

    // Logs content (last 30 entries reversed)
    const recent = logs.slice(-30).reverse()
    let logLines = ''
    if (recent.length === 0) {
      logLines = 'Brak zarejestrowanych zdarzeń.\nUstaw budzik, by sprawdzić logi.'
    } else {
      logLines = recent
        .map((e) => `[${e.t}] ${e.tag}\n${e.d ? '  ' + e.d : ''}`)
        .join('\n\n')
    }

    // Dynamic height based on number of items so text never truncates
    const logH = Math.max(200, Math.min(1800, recent.length * 48 + 40))

    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(logH),
        text: logLines,
        text_size: px(15),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.TOP,
        text_style: text_style.WRAP,
      })
    )

    y += logH + 16

    // Scroll to Top button at the end of the scrollable page
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(46),
        radius: px(23),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '⬆ Wróć na górę',
        text_size: px(18),
        color: COLOR.primary,
        click_func: () => {
          try {
            scrollTo({ y: 0 })
          } catch (e) {}
        },
      })
    )

    // Extra bottom spacer for bounce overscroll
    y += 60
  },

  runVibrationTest() {
    try {
      if (this.state.testTimer) {
        clearTimeout(this.state.testTimer)
        this.state.testTimer = null
      }
      if (!this.state.testVibrator) {
        this.state.testVibrator = new Vibrator()
      }
      const v = this.state.testVibrator
      const scene = VIBRATOR_SCENE_TIMER || 'VIBRATOR_SCENE_TIMER'
      try {
        v.setMode({ mode: scene })
      } catch (e) {
        try {
          v.setMode(scene)
        } catch (e2) {}
      }
      try {
        v.start({ mode: scene })
      } catch (e) {
        try {
          v.start()
        } catch (e2) {}
      }
      this.state.testTimer = setTimeout(() => {
        try {
          v.stop()
        } catch (e) {}
      }, 3000)
    } catch (e) {}
  },

  onDestroy() {
    if (this.state.testTimer) {
      clearTimeout(this.state.testTimer)
      this.state.testTimer = null
    }
    if (this.state.testVibrator) {
      try {
        this.state.testVibrator.stop()
      } catch (e) {}
      this.state.testVibrator = null
    }
    this.clear()
  },
})
