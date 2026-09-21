export const SCREEN_SHAPE_SQUARE = 0
export const SCREEN_SHAPE_ROUND = 1

export const __mock = {
  width: 390,
  height: 450,
  screenShape: SCREEN_SHAPE_SQUARE,
  deviceSource: 10223875,
  reset() {
    this.width = 390
    this.height = 450
    this.screenShape = SCREEN_SHAPE_SQUARE
    this.deviceSource = 10223875
  },
}

export function getDeviceInfo() {
  return {
    width: __mock.width,
    height: __mock.height,
    screenShape: __mock.screenShape,
    deviceSource: __mock.deviceSource,
  }
}
