import { createWidget, widget, align, text_style } from '@zos/ui'
import { push } from '@zos/router'
import { px } from '@zos/utils'
import { getAlarms } from '../alarm'
import { COLOR, formatTime, daysSummary, WidgetTracker } from '../ui'

const MAX_VISIBLE_ROWS = 3
const ROW_H = 68
const ROW_GAP = 10
const LIST_TOP = 84

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

    this.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(20),
        w: px(260),
        h: px(50),
        text: 'Smart Alarm',
        text_size: px(34),
        color: COLOR.text,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )

    // Diagnostics entry button in header
    this.track(
      createWidget(widget.BUTTON, {
        x: px(296),
        y: px(24),
        w: px(112),
        h: px(40),
        radius: px(20),
        normal_color: COLOR.surface,
        press_color: COLOR.surfaceAlt,
        text: 'Diag',
        text_size: px(18),
        color: COLOR.primary,
        click_func: () => {
          push({ url: 'page/diag.page' })
        },
      })
    )

    // Floating Action Button (+) in the bottom right corner
    this.track(
      createWidget(widget.BUTTON, {
        x: px(296),
        y: px(360),
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

    const alarms = getAlarms()
      .slice()
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

    if (alarms.length === 0) {
      this.track(
        createWidget(widget.TEXT, {
          x: px(40),
          y: px(200),
          w: px(352),
          h: px(120),
          text: 'No alarms yet.\nTap + to add one.',
          text_size: px(28),
          color: COLOR.textDim,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.WRAP,
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
          w: px(400),
          h: px(ROW_H),
          radius: px(16),
          normal_color: alarm.enabled ? COLOR.surfaceAlt : COLOR.surface,
          press_color: COLOR.border,
          text: `${formatTime(alarm.hour, alarm.minute)}   ${subtitle}${
            alarm.enabled ? '' : '  (off)'
          }`,
          text_size: px(26),
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
