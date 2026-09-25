import { createWidget, widget, align, text_style } from '@zos/ui'
import { back } from '@zos/router'
import { px } from '@zos/utils'
import { Vibrator, VIBRATOR_SCENE_TIMER } from '@zos/sensor'
import { getLogs, clearLogs, getSystemDiagnosticInfo } from '../alarm'
import { COLOR, WidgetTracker } from '../ui'

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

    // Back Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(24),
        y: px(16),
        w: px(110),
        h: px(40),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '< Wróć',
        text_size: px(20),
        color: COLOR.textDim,
        click_func: () => {
          back()
        },
      })
    )

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(62),
        w: px(384),
        h: px(36),
        text: 'Diagnostyka Budzika',
        text_size: px(28),
        color: COLOR.primary,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // System status banner
    let statusText = ''
    if (sys.mode.available) {
      statusText += `DND: ${sys.mode.dnd ? 'WŁ (!) ' : 'WYŁ '} | Sen: ${sys.mode.sleep ? 'WŁ (!) ' : 'WYŁ '}\n`
    } else {
      statusText += `Tryb snu/DND: [Brak API 3.0]\n`
    }
    statusText += `Timery Zepp OS: ${sys.osAlarmIds.length} [${sys.osAlarmIds.join(', ') || 'brak'}]`

    this.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(104),
        w: px(384),
        h: px(54),
        text: statusText,
        text_size: px(18),
        color: sys.mode.dnd || sys.mode.sleep ? COLOR.danger : COLOR.textDim,
        align_h: align.LEFT,
        align_v: align.TOP,
      })
    )

    // Vibrate Test Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(24),
        y: px(164),
        w: px(200),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.primaryDim,
        press_color: COLOR.primary,
        text: 'Test Wibracji (3s)',
        text_size: px(20),
        color: COLOR.text,
        click_func: () => {
          this.runVibrationTest()
        },
      })
    )

    // Clear Logs Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(234),
        y: px(164),
        w: px(174),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: 'Wyczyść logi',
        text_size: px(18),
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
        x: px(24),
        y: px(218),
        w: px(384),
        h: px(26),
        text: `Ostatnie zdarzenia (${logs.length}):`,
        text_size: px(20),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    // Logs content (last 12 entries reversed)
    const recent = logs.slice(-12).reverse()
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
        x: px(24),
        y: px(248),
        w: px(384),
        h: px(240),
        text: logLines,
        text_size: px(15),
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
