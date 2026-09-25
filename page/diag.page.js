import { createWidget, widget, align, text_style } from '@zos/ui'
import { back } from '@zos/router'
import { px } from '@zos/utils'
import { getDeviceInfo } from '@zos/device'
import { Vibrator, VIBRATOR_SCENE_TIMER } from '@zos/sensor'
import {
  getLogs,
  clearLogs,
  getSystemDiagnosticInfo,
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

  build() {
    this.render()
  },

  onShow() {
    this.render()
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

    // Back Button (top left)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(14),
        w: px(100),
        h: px(38),
        radius: px(19),
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

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(56),
        w: px(358),
        h: px(34),
        text: 'Dev Menu & Logi',
        text_size: px(26),
        color: COLOR.primary,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // Version & Device Info Banner
    const roundLabel = isRoundScreen() ? 'Round' : 'Square'
    const verText = `Wersja: v${APP_VERSION} (b${APP_BUILD_CODE}) | ${APP_BUILD_DATE}\nEkran: ${dev.width || 390}x${dev.height || 450} (${roundLabel})`
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(94),
        w: px(358),
        h: px(44),
        text: verText,
        text_size: px(16),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.TOP,
      })
    )

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
        y: px(142),
        w: px(358),
        h: px(44),
        text: statusText,
        text_size: px(16),
        color: sys.mode.dnd || sys.mode.sleep ? COLOR.danger : COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.TOP,
      })
    )

    // Buttons side-by-side (fitting 390px safely)
    // Test Vibrator
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(192),
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

    // Clear Logs
    this.track(
      createWidget(widget.BUTTON, {
        x: px(198),
        y: px(192),
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

    // Recent Logs Header
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(242),
        w: px(358),
        h: px(26),
        text: `Ostatnie zdarzenia (${logs.length}):`,
        text_size: px(19),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // Logs content (last 15 entries reversed)
    const recent = logs.slice(-15).reverse()
    let logLines = ''
    if (recent.length === 0) {
      logLines = 'Brak zarejestrowanych zdarzeń.\nUstaw budzik, by sprawdzić logi.'
    } else {
      logLines = recent
        .map((e) => `[${e.t}] ${e.tag} ${e.d}`)
        .join('\n')
    }

    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(272),
        w: px(358),
        h: px(200),
        text: logLines,
        text_size: px(14),
        color: COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.TOP,
        text_style: text_style.WRAP,
      })
    )
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
