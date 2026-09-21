export const SCROLL_MODE_FREE = 0
export const SCROLL_MODE_SWIPER = 1
export const SCROLL_MODE_SWIPER_HORIZONTAL = 2

export const __mock = {
  scrollMode: SCROLL_MODE_FREE,
  calls: [],
  reset() {
    this.scrollMode = SCROLL_MODE_FREE
    this.calls = []
  },
}

export function setScrollMode(options) {
  __mock.calls.push({ fn: 'setScrollMode', options })
  if (options && options.mode !== undefined) {
    __mock.scrollMode = options.mode
  }
}

export function scrollTo(options) {
  __mock.calls.push({ fn: 'scrollTo', options })
}

export function getScrollTop() {
  return 0
}
