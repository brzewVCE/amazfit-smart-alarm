import { createWidget, widget, align, text_style } from '@zos/ui'
import { px } from '@zos/utils'
import { COLOR, DESIGN_WIDTH, DESIGN_HEIGHT } from '../theme'
import { RingSkin } from './base'

/**
 * Classic Ring Skin adapter: standard high-contrast, clean layout for Zepp OS.
 */
export class ClassicRingSkin extends RingSkin {
  constructor() {
    super('classic', 'Classic Zepp')
  }

  renderRing(ctx, { timeStr, message, isWarning, snoozeMinutes, onSnooze, onDismiss }) {
    const { tracker } = ctx

    // Background
    tracker.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(DESIGN_WIDTH),
        h: px(DESIGN_HEIGHT),
        color: COLOR.background,
      })
    )

    // Real-time clock display
    tracker.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(140),
        w: px(392),
        h: px(100),
        text: timeStr,
        text_size: px(80),
        color: COLOR.text,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
      })
    )

    // Wake / Status message
    tracker.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(250),
        w: px(392),
        h: px(65),
        text: message,
        text_size: px(28),
        color: isWarning ? COLOR.danger : COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )

    // Snooze action button
    tracker.track(
      createWidget(widget.BUTTON, {
        x: px(40),
        y: px(370),
        w: px(160),
        h: px(90),
        radius: px(20),
        normal_color: COLOR.surfaceAlt,
        press_color: COLOR.border,
        text: `Snooze ${snoozeMinutes}m`,
        text_size: px(22),
        click_func: onSnooze,
      })
    )

    // Dismiss action button
    tracker.track(
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
        click_func: onDismiss,
      })
    )
  }

  renderSuccess(ctx, { message = 'Great job!\nAlarm dismissed.' } = {}) {
    const { tracker } = ctx

    tracker.track(
      createWidget(widget.FILL_RECT, {
        x: px(0),
        y: px(0),
        w: px(DESIGN_WIDTH),
        h: px(DESIGN_HEIGHT),
        color: COLOR.background,
      })
    )

    tracker.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(200),
        w: px(392),
        h: px(100),
        text: message,
        text_size: px(32),
        color: COLOR.primary,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )
  }
}
