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

  renderSettings(page, config, onChange, startY = 180) {
    const textH = 100
    page.track(
      createWidget(widget.TEXT, {
        x: px(24),
        y: px(startY),
        w: px(384),
        h: px(textH),
        text: 'Standard alarm.\nTapping Dismiss turns off alarm immediately.',
        text_size: px(24),
        color: COLOR.textDim,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
      })
    )
    return startY + textH + 20
  }

  start(ctx) {
    if (ctx && ctx.onSuccess) {
      ctx.onSuccess()
    }
  }

  cleanup() {}
}

export const noneCaptcha = new NoneCaptchaStrategy()
