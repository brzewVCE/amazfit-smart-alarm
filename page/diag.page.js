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
  formatLogsForQr,
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
    pageIdx: 0,
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
        w: px(96),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '< Back',
        text_size: px(18),
        color: COLOR.textDim,
        click_func: () => {
          back()
        },
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(120),
        y: px(y),
        w: px(254),
        h: px(44),
        text: 'Dev Menu & Logs',
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
    const verText = `Version: v${APP_VERSION} (b${APP_BUILD_CODE}) | ${APP_BUILD_DATE}\nScreen: ${dev.width || 390}x${dev.height || 450} (${roundLabel})`
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
      statusText += `DND: ${sys.mode.dnd ? 'ON (!)' : 'OFF'} | Sleep: ${sys.mode.sleep ? 'ON (!)' : 'OFF'}\n`
    } else {
      statusText += `Sleep/DND mode: [Standard API]\n`
    }
    statusText += `Zepp OS Timers: ${sys.osAlarmIds.length} [${sys.osAlarmIds.join(', ') || 'none'}]`

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
        text: 'Test Vibrator',
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
        text: 'Clear Logs',
        text_size: px(17),
        color: COLOR.textDim,
        click_func: () => {
          clearLogs()
          this.state.pageIdx = 0
          this.render()
        },
      })
    )

    y += 48

    // Actions Row 2: Reconcile Timers button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(44),
        radius: px(22),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '🔄 Reconcile Timers',
        text_size: px(18),
        color: COLOR.primary,
        click_func: () => {
          reconcileTimers()
          this.render()
        },
      })
    )

    y += 52

    // Log Export Header
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(28),
        text: `Log Export (${logs.length} events):`,
        text_size: px(19),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    y += 32

    if (logs.length === 0) {
      this.track(
        createWidget(widget.TEXT, {
          x: px(16),
          y: px(y),
          w: px(358),
          h: px(60),
          text: 'No diagnostic events recorded yet.\nSet an alarm to generate logs.',
          text_size: px(15),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.TOP,
          text_style: text_style.WRAP,
        })
      )
      y += 70
    } else {
      const qrData = formatLogsForQr(logs, sys, this.state.pageIdx, 15)
      const qrSize = Math.min(260, (dev.width || 390) - 60)
      const qrX = Math.floor(((dev.width || 390) - qrSize) / 2)
      const bgPad = 10

      this.track(
        createWidget(widget.QRCODE, {
          content: qrData.content,
          x: px(qrX),
          y: px(y + bgPad),
          w: px(qrSize),
          h: px(qrSize),
          bg_x: px(qrX - bgPad),
          bg_y: px(y),
          bg_w: px(qrSize + bgPad * 2),
          bg_h: px(qrSize + bgPad * 2),
          bg_radius: px(12),
        })
      )

      y += qrSize + bgPad * 2 + 14

      if (qrData.totalPages > 1) {
        // Pagination Controls
        const btnW = 104
        const pageW = (dev.width || 390) - 32 - btnW * 2

        this.track(
          createWidget(widget.BUTTON, {
            x: px(16),
            y: px(y),
            w: px(btnW),
            h: px(40),
            radius: px(20),
            normal_color: this.state.pageIdx > 0 ? COLOR.surface : COLOR.surfaceAlt,
            press_color: COLOR.surfaceAlt,
            text: '< Newer',
            text_size: px(16),
            color: this.state.pageIdx > 0 ? COLOR.primary : COLOR.textDim,
            click_func: () => {
              if (this.state.pageIdx > 0) {
                this.state.pageIdx--
                this.render()
              }
            },
          })
        )

        this.track(
          createWidget(widget.TEXT, {
            x: px(16 + btnW),
            y: px(y),
            w: px(pageW),
            h: px(40),
            text: `Page ${qrData.pageIdx + 1}/${qrData.totalPages}`,
            text_size: px(16),
            color: COLOR.text,
            align_h: align.CENTER_H,
            align_v: align.CENTER_V,
          })
        )

        this.track(
          createWidget(widget.BUTTON, {
            x: px(16 + btnW + pageW),
            y: px(y),
            w: px(btnW),
            h: px(40),
            radius: px(20),
            normal_color: this.state.pageIdx < qrData.totalPages - 1 ? COLOR.surface : COLOR.surfaceAlt,
            press_color: COLOR.surfaceAlt,
            text: 'Older >',
            text_size: px(16),
            color: this.state.pageIdx < qrData.totalPages - 1 ? COLOR.primary : COLOR.textDim,
            click_func: () => {
              if (this.state.pageIdx < qrData.totalPages - 1) {
                this.state.pageIdx++
                this.render()
              }
            },
          })
        )

        y += 48
      }

      this.track(
        createWidget(widget.TEXT, {
          x: px(16),
          y: px(y),
          w: px(358),
          h: px(24),
          text: 'Scan with phone camera or Google Lens',
          text_size: px(14),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
        })
      )

      y += 34
    }

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
        text: '⬆ Back to Top',
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
