export const __mock = {
  systemMode: {
    DND: false,
    sleep: false,
    theater: false,
    powerSaving: false,
  },
  reset() {
    this.systemMode = {
      DND: false,
      sleep: false,
      theater: false,
      powerSaving: false,
    }
  },
}

export function getSystemMode() {
  return __mock.systemMode
}
