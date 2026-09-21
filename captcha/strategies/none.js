import { createWidget, widget, align, text_style } from '@zos/ui'
import { px } from '@zos/utils'
import { COLOR } from '../../ui'
import { CaptchaStrategy } from '../base'

/**
 * Null / No-op CAPTCHA adapter: allows immediate alarm dismissal without challenges.
 */
export class NoneCaptchaStrategy extends CaptchaStrategy {
  constructor() {
    super('none', 'None')
  }

  getDefaultConfig() {
    return { type: 'none' }
  }

  getSummary() {
    return 'None'
  }

  renderSettings(page) {
    page.track(
      createWidget(widget.TEXT, {
        x: px(20),
        y: px(160),
        w: px(392),
        h: px(60),
        text: 'Standard alarm.\nTapping Dismiss turns off alarm immediately.',
        text_size: px(22),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )
  }

  start(ctx) {
    if (ctx && ctx.onSuccess) {
      ctx.onSuccess()
    }
  }

  cleanup() {}
}

export const noneCaptcha = new NoneCaptchaStrategy()
