import { logEvent } from './alarm/diagnostics'

App({
  globalData: {
    // Populated below when the app is woken by a @zos/alarm timer. The
    // alarm's `param` string is only ever delivered here, to app.js
    // onCreate - never to the target page's own onInit - so page/ring.page
    // reads it back out of globalData instead.
    wakeParams: null,
  },

  onCreate(params) {
    logEvent('APP_CREATE', { params: params || 'empty' })
    if (!params) return
    try {
      const parsed = typeof params === 'string' ? JSON.parse(params) : params
      if (this.globalData) {
        this.globalData.wakeParams = parsed
      }
      if (this._options && this._options.globalData) {
        this._options.globalData.wakeParams = parsed
      }
    } catch (e) {
      if (this.globalData) this.globalData.wakeParams = null
      if (this._options && this._options.globalData) this._options.globalData.wakeParams = null
    }
  },

  onDestroy() {
    logEvent('APP_DESTROY')
  },
})
