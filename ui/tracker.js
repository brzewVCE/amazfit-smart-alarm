import { deleteWidget } from '@zos/ui'

/**
 * Manages widget creation and cleanup lifecycle across views and challenge strategies.
 * Prevents memory leaks by tracking created widgets and disposing them reliably.
 */
export class WidgetTracker {
  constructor() {
    this.widgets = []
  }

  /**
   * Tracks a widget instance and returns it for chaining.
   * @param {Object} w - Zepp OS widget instance
   * @returns {Object}
   */
  track(w) {
    if (w) {
      this.widgets.push(w)
    }
    return w
  }

  /**
   * Deletes all currently tracked widgets and empties the list.
   */
  clear() {
    for (let i = 0; i < this.widgets.length; i++) {
      deleteWidget(this.widgets[i])
    }
    this.widgets = []
  }

  /**
   * Alias for clear() during page teardown.
   */
  destroy() {
    this.clear()
  }
}
