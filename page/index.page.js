import { createWidget, widget, align, text_style } from '@zos/ui'
import { push } from '@zos/router'
import { px } from '@zos/utils'
import { getAlarms, APP_VERSION } from '../alarm'
import { COLOR, formatTime, daysSummary, WidgetTracker } from '../ui'

const MAX_VISIBLE_ROWS = 3
const ROW_H = 68
const ROW_GAP = 10
const LIST_TOP = 76

Page({
  state: {
    tracker: new WidgetTracker(),
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

    // Title
    this.track(
      createWidget(widget.TEXT, {
        x: px(16),
        y: px(16),
        w: px(196),
        h: px(44),
        text: 'Smart Alarm',
        text_size: px(28),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )

    // Dev Menu entry button in header (fits within 372px on 390px display)
    this.track(
      createWidget(widget.BUTTON, {
        x: px(216),
        y: px(16),
        w: px(156),
        h: px(40),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: '⚙ Dev Menu',
        text_size: px(18),
        color: COLOR.primary,
        click_func: () => {
          push({ url: 'page/diag.page' })
        },
      })
    )

    // Floating Action Button (+) in bottom right
    this.track(
      createWidget(widget.BUTTON, {
        x: px(286),
        y: px(356),
        w: px(88),
        h: px(88),
        radius: px(44),
        normal_color: COLOR.primary,
        press_color: COLOR.primaryDim,
        text: '+',
        text_size: px(48),
        click_func: () => {
          push({ url: 'page/edit.page', params: 'id=0' })
        },
      })
    )

    // Version & Dev badge at bottom left
    this.track(
      createWidget(widget.BUTTON, {
        x: px(16),
        y: px(392),
        w: px(254),
        h: px(38),
        radius: px(19),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: `v${APP_VERSION} · Dev Menu`,
        text_size: px(16),
        color: COLOR.textDim,
        click_func: () => {
          push({ url: 'page/diag.page' })
        },
      })
    )

    const alarms = getAlarms()
      .slice()
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

    if (alarms.length === 0) {
      this.track(
        createWidget(widget.TEXT, {
          x: px(24),
          y: px(140),
          w: px(342),
          h: px(90),
          text: 'No alarms yet.\nTap + to add one.',
          text_size: px(26),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.WRAP,
        })
      )

      this.track(
        createWidget(widget.BUTTON, {
          x: px(24),
          y: px(240),
          w: px(342),
          h: px(48),
          radius: px(24),
          normal_color: COLOR.surface,
          press_color: COLOR.surfaceAlt,
          text: `⚙ Dev Menu & Logs (v${APP_VERSION})`,
          text_size: px(18),
          color: COLOR.primary,
          click_func: () => {
            push({ url: 'page/diag.page' })
          },
        })
      )
      return
    }

    alarms.slice(0, MAX_VISIBLE_ROWS).forEach((alarm, i) => {
      const y = LIST_TOP + i * (ROW_H + ROW_GAP)
      const subtitle = alarm.smart
        ? `${daysSummary(alarm.days)} · Smart`
        : daysSummary(alarm.days)

      this.track(
        createWidget(widget.BUTTON, {
          x: px(16),
          y: px(y),
          w: px(358),
          h: px(ROW_H),
          radius: px(16),
          normal_color: alarm.enabled ? COLOR.surfaceAlt : COLOR.surface,
          press_color: COLOR.border,
          text: `${formatTime(alarm.hour, alarm.minute)}   ${subtitle}${
            alarm.enabled ? '' : '  (off)'
          }`,
          text_size: px(24),
          click_func: () => {
            push({ url: 'page/edit.page', params: `id=${alarm.id}` })
          },
        })
      )
    })
  },

  onDestroy() {
    this.state.tracker.destroy()
  },
})
