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
    viewMode: 'menu', // 'menu' | 'qr'
  },

  onInit() {
    this.enableScrolling()
  },

  build() {
    this.enableScrolling()
    this.render()
  },

  onShow() {
    // Page already built and rendered, prevent redundant re-renders
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
    if (this.state.viewMode === 'qr') {
      this.renderQrView()
    } else {
      this.renderMenu()
    }
  },

  renderMenu() {
    const sys = getSystemDiagnosticInfo()
    const logs = getLogs()
    let dev = { width: 390, height: 450 }
    try {
      dev = getDeviceInfo() || dev
    } catch (e) {}

    const isRound = isRoundScreen()
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

    // Actions Row 3: Dedicated Export Logs QR Button
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(46),
        radius: px(23),
        normal_color: COLOR.primaryDim,
        press_color: COLOR.primary,
        text: `📱 Export Logs (QR Code) [${logs.length}]`,
        text_size: px(18),
        color: COLOR.text,
        click_func: () => {
          this.state.viewMode = 'qr'
          this.state.pageIdx = 0
          this.render()
        },
      })
    )

    y += 54

    // Info Text under button
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(y),
        w: px(358),
        h: px(44),
        text: logs.length === 0
          ? 'No events recorded yet.\nSet an alarm to inspect logs.'
          : `${logs.length} events recorded.\nTap green button above to view scan QR.`,
        text_size: px(15),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.TOP,
        text_style: text_style.WRAP,
      })
    )

    y += 56

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

    y += 60
  },

  renderQrView() {
    const sys = getSystemDiagnosticInfo()
    const logs = getLogs()
    let dev = { width: 390, height: 450 }
    try {
      dev = getDeviceInfo() || dev
    } catch (e) {}

    const isRound = isRoundScreen()
    const topY = isRound ? 72 : 52

    // Header: Back to Menu and Title
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(topY),
        w: px(96),
        h: px(40),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '< Back',
        text_size: px(18),
        color: COLOR.textDim,
        click_func: () => {
          this.state.viewMode = 'menu'
          this.render()
        },
      })
    )

    this.track(
      createWidget(widget.TEXT, {
        x: px(120),
        y: px(topY),
        w: px(254),
        h: px(40),
        text: 'Export Logs',
        text_size: px(22),
        color: COLOR.primary,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
      })
    )

    if (logs.length === 0) {
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(180),
          w: px(342),
          h: px(80),
          text: 'No diagnostic events recorded yet.\nSet an alarm to generate logs.',
          text_size: px(17),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.WRAP,
        })
      )
      return
    }

    // Format QR data with 6 events per page (compact & safe <= 120 bytes)
    const qrData = formatLogsForQr(logs, sys, this.state.pageIdx, 6)
    const qrSize = 210
    const qrX = Math.floor(((dev.width || 390) - qrSize) / 2)
    const qrY = topY + 50
    const bgPad = 12

    // Explicitly aligned background coordinates to prevent misalignment
    this.track(
      createWidget(widget.QRCODE, {
        content: qrData.content,
        x: px(qrX),
        y: px(qrY),
        w: px(qrSize),
        h: px(qrSize),
        bg_x: px(qrX - bgPad),
        bg_y: px(qrY - bgPad),
        bg_w: px(qrSize + bgPad * 2),
        bg_h: px(qrSize + bgPad * 2),
      })
    )

    const controlsY = qrY + qrSize + bgPad + 12

    if (qrData.totalPages > 1) {
      const btnW = 104
      const pageW = (dev.width || 390) - 32 - btnW * 2

      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(controlsY),
          w: px(btnW),
          h: px(38),
          radius: px(19),
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
          y: px(controlsY),
          w: px(pageW),
          h: px(38),
          text: `${qrData.pageIdx + 1} / ${qrData.totalPages}`,
          text_size: px(16),
          color: COLOR.text,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
        })
      )

      this.track(
        createWidget(widget.BUTTON, {
          x: px(16 + btnW + pageW),
          y: px(controlsY),
          w: px(btnW),
          h: px(38),
          radius: px(19),
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
    }

    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(controlsY + (qrData.totalPages > 1 ? 44 : 8)),
        w: px(358),
        h: px(24),
        text: `Point camera to scan (${logs.length} events)`,
        text_size: px(14),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
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
