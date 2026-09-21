// Runs the ACTUAL app source files (page/*.js, app.js, alarm/*.js, captcha/*.js, ui/*.js) under
// plain Node, against hand-written mocks of the @zos/* device APIs
// (node_modules/@zos/*) plus minimal Page/App/getApp globals. This is not a
// substitute for running on a real watch or the official simulator (neither
// is available in this environment - see README), but it does exercise the
// app's actual logic end to end: rendering, user interaction callbacks,
// native-timer scheduling, storage persistence, and the smart-wake decision
// path - and fails loudly (non-zero exit) if any of it throws or behaves
// unexpectedly.
//
// Run with: npm test   (needs the --import ./test/register.mjs loader hook
// for extensionless relative imports, see package.json)

import * as uiMock from '@zos/ui'
import * as routerMock from '@zos/router'
import * as alarmMock from '@zos/alarm'
import * as sensorMock from '@zos/sensor'
import { __resetAllMockStorage } from '@zos/storage'
import { WidgetTracker } from '../ui/tracker.js'

let passCount = 0
function ok(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`)
  passCount++
  console.log(`  ok - ${msg}`)
}

function resetAllMocks() {
  uiMock.__mock.reset()
  routerMock.__mock.reset()
  alarmMock.__mock.reset()
  sensorMock.__mock.reset()
  __resetAllMockStorage()
}

// --- global Page/App/getApp, matching the real Zepp OS device runtime ---
const registeredPages = []
let currentApp = null

globalThis.Page = (def) => {
  registeredPages.push(def)
  return def
}
globalThis.App = (def) => {
  currentApp = { _options: { globalData: def.globalData }, _def: def }
  return def
}
globalThis.getApp = () => currentApp

resetAllMocks()

// Import order defines registeredPages[0..2]. Must be dynamic (not static
// top-level import) so it runs *after* the globals above are installed.
await import('../app.js')
await import('../page/index.page.js')
await import('../page/edit.page.js')
await import('../page/ring.page.js')

const appDef = currentApp._def
const [indexPage, editPage, ringPage] = registeredPages

// Helpers to search what the mock UI has rendered:
const byType = (type) => uiMock.__mock.created.find((w) => w._type === type)
const byText = (prefix) =>
  uiMock.__mock.created.find(
    (w) =>
      typeof w._opts.text === 'string' && w._opts.text.startsWith(prefix)
  )
const allByType = (type) => uiMock.__mock.created.filter((w) => w._type === type)
const allButtons = () =>
  uiMock.__mock.created.filter((w) => w._type === 'WIDGET_BUTTON')
const singleLetterButtons = () =>
  uiMock.__mock.created.filter(
    (w) =>
      w._type === 'WIDGET_BUTTON' &&
      typeof w._opts.text === 'string' &&
      w._opts.text.length === 1
  )
const dayButtons = singleLetterButtons

// Every alarm firing is a brand-new mini-program launch on a real watch, so
// page/ring.page.js's `state` object literal is re-evaluated fresh each
// time. This test process instead imports the page module once and reuses
// the same `def`, so each simulated "launch" must reset ring.page's state
// by hand to match that real-world fresh-process behavior.
function freshRingPageState() {
  ringPage.state = {
    alarm: null,
    wake: null,
    ringing: false,
    vibrator: null,
    tracker: new WidgetTracker(),
    captchaFailed: false,
    activeStrategy: null,
    fallbackAlarmId: null,
  }
}

console.log('\n1. alarm/scheduler.js: computeNextTimestamp')
{
  const { computeNextTimestamp } = await import('../alarm/scheduler.js')

  const wed = new Date(2026, 0, 7, 10, 0, 0) // Wed Jan 7 2026, 10:00
  ok(wed.getDay() === 3, 'sanity: Jan 7 2026 is a Wednesday')

  const laterToday = computeNextTimestamp(11, 0, 0, wed)
  ok(laterToday === Math.floor(new Date(2026, 0, 7, 11, 0, 0).getTime() / 1000), 'one-time alarm later today fires today')

  const earlierToday = computeNextTimestamp(9, 0, 0, wed)
  ok(earlierToday === Math.floor(new Date(2026, 0, 8, 9, 0, 0).getTime() / 1000), 'one-time alarm earlier today rolls to tomorrow')

  // bit0=Mon .. bit6=Sun. From Wed, "next Monday" should be +5 days.
  const nextMonday = computeNextTimestamp(8, 0, 0b0000001, wed)
  ok(nextMonday === Math.floor(new Date(2026, 0, 12, 8, 0, 0).getTime() / 1000), 'weekday bitmask finds next matching day (Mon from Wed)')

  // Same day, still in the future -> fires today, not next week.
  const laterTodayMasked = computeNextTimestamp(23, 0, 0b0000100, wed) // bit2 = Wed
  ok(laterTodayMasked === Math.floor(new Date(2026, 0, 7, 23, 0, 0).getTime() / 1000), 'weekday bitmask fires today when today matches and time is still ahead')
}

console.log('\n2. page/index.page.js: empty state')
{
  resetAllMocks()
  indexPage.build()
  ok(byText('No alarms yet.\nTap + to add one.') !== undefined, 'empty alarm list shows the empty-state message')
  ok(byText('+') !== undefined, 'add button is always rendered')
}

console.log('\n3. page/edit.page.js: create a new alarm end to end')
{
  resetAllMocks()
  editPage.onInit('id=0')
  ok(editPage.state.isNew === true, 'onInit with id=0 starts a new draft alarm')

  editPage.build()
  ok(byText('Save') !== undefined, 'settings screen renders a Save button')
  ok(byText('Del') === undefined, 'a new (unsaved) alarm has no Delete button')
  ok(singleLetterButtons().length === 7, 'seven weekday toggle buttons are rendered')
  ok(allByType('WIDGET_SLIDE_SWITCH').length === 2, 'native SLIDE_SWITCH widgets are used for Alarm-enabled and Smart-Wake')

  // Open the custom time picker and complete a selection.
  const timeButton = uiMock.__mock.created.find((w) => /^\d\d:\d\d$/.test(w._opts.text))
  ok(timeButton !== undefined, 'time button shows the current HH:MM')
  timeButton._opts.click_func()
  ok(editPage.state.mode === 'time', 'tapping the time button opens custom time picker')
  ok(byText('Set Time') !== undefined, 'time picker title is rendered')
  ok(byText('Confirm') !== undefined && byText('Cancel') !== undefined, 'Confirm and Cancel buttons are rendered')

  // Set minute using :30 preset and hour to 7
  const preset30 = byText(':30')
  ok(preset30 !== undefined, 'minute preset :30 is rendered')
  preset30._opts.click_func()
  ok(editPage.state.tempMinute === 30, 'clicking preset :30 sets tempMinute to 30')

  editPage.state.tempHour = 7
  byText('Confirm')._opts.click_func()
  ok(editPage.state.mode === 'settings', 'confirming time returns to settings screen')
  ok(editPage.state.alarm.hour === 7 && editPage.state.alarm.minute === 30, 'time selection updates alarm hour and minute')

  // Enable smart-wake via its switch callback
  const switches = allByType('WIDGET_SLIDE_SWITCH')
  const smartSwitch = switches[1]
  smartSwitch._opts.checked_change_func(smartSwitch, true)
  ok(editPage.state.alarm.smart === true, 'toggling smart switch enables smart-wake')

  // Open CAPTCHA menu from the settings screen
  const captchaBtn = uiMock.__mock.created.find(
    (w) => typeof w._opts.text === 'string' && w._opts.text.startsWith('CAPTCHA:')
  )
  ok(captchaBtn !== undefined, 'CAPTCHA settings button is rendered on settings screen')
  captchaBtn._opts.click_func()
  ok(editPage.state.mode === 'captcha', 'tapping CAPTCHA button opens CAPTCHA menu')
  ok(byText('CAPTCHA Menu') !== undefined, 'CAPTCHA Menu title is rendered')
  ok(byText('None') !== undefined && byText('Zombie Walk') !== undefined, 'None and Zombie Walk options are rendered')
  ok(byText('30 steps') !== undefined, 'default 30 steps is displayed')
  ok(byText('+5') !== undefined && byText('-5') !== undefined, '+5 and -5 step buttons are rendered')

  // Test +5 / -5 step increment buttons
  byText('+5')._opts.click_func()
  ok(editPage.state.alarm.captcha.steps === 35, '+5 increases steps to 35')
  byText('-5')._opts.click_func()
  ok(editPage.state.alarm.captcha.steps === 30, '-5 decreases steps back to 30')

  // Test +30s / -30s timeout buttons
  ok(byText('+30s') !== undefined && byText('-30s') !== undefined, '+30s and -30s timeout buttons are rendered')
  byText('+30s')._opts.click_func()
  ok(editPage.state.alarm.captcha.timeoutSec === 210, '+30s increases timeout to 210s')
  byText('-30s')._opts.click_func()
  ok(editPage.state.alarm.captcha.timeoutSec === 180, '-30s decreases timeout back to 180s (3 min)')

  // Tap Done to return to settings
  byText('Done')._opts.click_func()
  ok(editPage.state.mode === 'settings', 'Done navigates back to settings')

  // Pick Monday, Wednesday, Friday (bit0, bit2, bit4 = 0b0010101 = 21)
  const days = dayButtons()
  days[0]._opts.click_func() // Mon
  days[2]._opts.click_func() // Wed
  days[4]._opts.click_func() // Fri

  // Save.
  byText('Save')._opts.click_func()
  ok(routerMock.__mock.calls.some((c) => c.fn === 'back'), 'Save navigates back')
  ok(alarmMock.__mock.active.size === 2, 'saving a repeating Smart-Wake alarm arms exactly 2 native timers (final + check)')

  const { getAlarms } = await import('../alarm/repository.js')
  const saved = getAlarms()
  ok(saved.length === 1, 'exactly one alarm is persisted')
  ok(
    saved[0].hour === 7 &&
      saved[0].minute === 30 &&
      saved[0].smart === true &&
      saved[0].captcha.type === 'zombie' &&
      saved[0].captcha.steps === 30,
    'persisted alarm matches what was edited including CAPTCHA config'
  )
}

console.log('\n4. page/index.page.js: non-empty state')
{
  uiMock.__mock.reset()
  indexPage.build()
  const row = uiMock.__mock.created.find((w) => w._type === 'WIDGET_BUTTON' && String(w._opts.text).startsWith('07:30'))
  ok(row !== undefined, 'the saved alarm shows up as a row in the list')
}

console.log('\n5. page/ring.page.js: alarm fires at exact time and enters Zombie Walk')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]
  const finalIdBefore = alarm.nativeIds.final

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  freshRingPageState()
  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'final' }))
  ok(currentApp._options.globalData.wakeParams.mode === 'final', "app.js onCreate stashes the alarm's param on globalData")

  ringPage.onInit()
  ok(ringPage.state.ringing === true, 'a "final" wake always starts ringing')
  ok(currentApp._options.globalData.wakeParams === null, 'wakeParams is consumed (cleared) so it cannot be replayed')

  ringPage.build()
  ok(byText('Wake up!') !== undefined, 'ringing screen shows the plain wake-up message (not the smart-wake one)')
  ok(byText('Dismiss') !== undefined && byText('Snooze 9m') !== undefined, 'Dismiss and Snooze buttons are rendered')
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'start'), 'ringing starts the vibration motor')

  // Dismissing with Zombie Walk active transitions into the walk challenge
  byText('Dismiss')._opts.click_func()
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'stop'), 'Dismiss stops the vibration motor')
  ok(ringPage.state.activeStrategy !== null && ringPage.state.activeStrategy.id === 'zombie', 'Dismiss enters Zombie Walk challenge mode')
  ok(alarmMock.__mock.active.size === 3, 'Zombie Walk arms a fallback timer for timeout failure')
  ok(byText('ZOMBIE WALK') !== undefined, 'Zombie Walk title is displayed')
  ok(byText('0 / 30') !== undefined, 'initial 0 / 30 steps is displayed')

  // Simulate walking 30 steps via the Step sensor's registered onChange callback
  sensorMock.__mock.steps.current = 130 // started at 100, +30 steps
  sensorMock.__mock.steps.callbacks.forEach((cb) => cb())
  ok(ringPage.state.activeStrategy === null, 'completing steps clears active strategy')
  ok(alarmMock.__mock.active.size === 2, 'completing steps cancels the fallback alarm')
  ok(byText('✓ AWAKE!') !== undefined, 'success screen shows AWAKE!')

  const rearmed = getAlarms()[0]
  ok(rearmed.enabled === true, 'a repeating alarm stays enabled after ringing')
  ok(rearmed.nativeIds.final !== finalIdBefore, 'completing Zombie Walk re-arms a fresh native timer for its next occurrence')
}

console.log('\n5b. page/ring.page.js: Zombie Walk timeout failure triggers loop with current time')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  freshRingPageState()

  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'final' }))
  ringPage.onInit()
  ringPage.build()
  byText('Dismiss')._opts.click_func()
  ok(ringPage.state.activeStrategy !== null && ringPage.state.activeStrategy.id === 'zombie', 'Dismiss enters zombie mode')

  // Simulate time expiring
  ringPage.state.activeStrategy._remainingSeconds = 0
  ringPage.state.activeStrategy._checkProgress()
  ok(ringPage.state.activeStrategy === null, 'failure exits zombie mode')
  ok(ringPage.state.captchaFailed === true, 'captchaFailed flag set')
  ok(
    sensorMock.__mock.vibrations[sensorMock.__mock.vibrations.length - 1].action === 'start',
    'alarm resumes ringing with loud vibration'
  )
  ok(byText('Challenge not finished!\nWake up!') !== undefined, 'generic failure message is displayed on re-ring screen')
}

console.log('\n5c. page/ring.page.js: CAPTCHA None directly exits on Dismiss')
{
  const { getAlarms, upsertAlarm } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]
  alarm.captcha.type = 'none'
  upsertAlarm(alarm)

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  freshRingPageState()

  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'final' }))
  ringPage.onInit()
  ringPage.build()
  byText('Dismiss')._opts.click_func()
  ok(routerMock.__mock.calls.some((c) => c.fn === 'exit'), 'Dismiss directly exits when CAPTCHA is None')

  // Reset back to zombie for subsequent tests
  alarm.captcha.type = 'zombie'
  upsertAlarm(alarm)
}

console.log('\n6. page/ring.page.js: smart-wake check with no signal re-arms silently')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]
  sensorMock.__mock.heartRate = { last: 60, resting: 60 } // no rise -> no early wake

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  alarmMock.__mock.reset()
  const finalTime = Math.floor(Date.now() / 1000) + 600
  freshRingPageState()
  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'smart-check', checksRemaining: 3, finalTime }))
  ringPage.onInit()
  ok(ringPage.state.ringing === false, 'no heart-rate rise means this check does not start ringing')
  ok(alarmMock.__mock.active.size === 1, 'a follow-up check timer is armed for ~2 minutes later')
  ok(routerMock.__mock.calls.some((c) => c.fn === 'exit'), 'a silent check still exits so the screen does not stay on')

  ringPage.build()
  ok(uiMock.__mock.created.length === 0, 'a silent (non-ringing) check renders nothing to the screen')
}

console.log('\n7. page/ring.page.js: smart-wake check WITH a heart-rate rise wakes early')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]
  sensorMock.__mock.heartRate = { last: 78, resting: 60 } // +18 bpm -> above SMART_HR_DELTA

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  sensorMock.__mock.heartRate = { last: 78, resting: 60 }
  const finalTime = Math.floor(Date.now() / 1000) + 600
  freshRingPageState()
  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'smart-check', checksRemaining: 2, finalTime }))
  ringPage.onInit()
  ok(ringPage.state.ringing === true, 'a heart-rate rise during the window triggers ringing early')

  ringPage.build()
  ok(byText('Light sleep detected\nRise and shine') !== undefined, 'the early-wake screen shows the smart-wake message')
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'start'), 'vibration starts for the early wake too')

  byText('Snooze 9m')._opts.click_func()
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'stop'), 'Snooze stops the vibration motor')
  ok(routerMock.__mock.calls.some((c) => c.fn === 'exit'), 'Snooze exits the mini-program')
}

console.log('\n8. delete flow')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  editPage.onInit(`id=${alarm.id}`)
  ok(editPage.state.isNew === false, 'onInit with an existing id loads it for editing')
  editPage.build()
  ok(byText('Del') !== undefined, 'editing an existing alarm shows a Delete button')
  byText('Del')._opts.click_func()
  ok(getAlarms().length === 0, 'Delete removes the alarm from storage')
  ok(alarmMock.__mock.active.size === 0, 'Delete cancels its native timers')
  ok(routerMock.__mock.calls.some((c) => c.fn === 'back'), 'Delete navigates back')
}

console.log('\n9. captcha: Strategy interface & dynamic extensibility')
{
  const { getCaptcha, getAvailableCaptchas, registerCaptcha } = await import('../captcha/registry.js')
  const available = getAvailableCaptchas()
  ok(available.some((c) => c.id === 'none'), "registry includes 'none' strategy")
  ok(available.some((c) => c.id === 'zombie'), "registry includes 'zombie' strategy")

  // Test pluggability: register a custom strategy without touching page code
  const customStrategy = {
    id: 'math',
    label: 'Math Puzzle',
    getDefaultConfig: () => ({ problem: '2+2' }),
    getSummary: () => 'Math',
    renderSettings: () => {},
    start: (ctx) => ctx.onSuccess(),
    cleanup: () => {},
  }
  registerCaptcha(customStrategy)
  ok(getCaptcha('math').label === 'Math Puzzle', 'new custom CAPTCHA strategy is retrievable dynamically')
  ok(getAvailableCaptchas().some((c) => c.id === 'math'), 'custom strategy is included in available captchas')
}

console.log('\n10. ui/skins: RingSkin interface & dynamic extensibility')
{
  const { getSkin, getAvailableSkins, registerSkin, RingSkin } = await import('../ui/skins/index.js')
  const available = getAvailableSkins()
  ok(available.some((s) => s.id === 'classic'), "skin registry includes 'classic' skin")

  class CustomOledSkin extends RingSkin {
    constructor() {
      super('custom_oled', 'Custom OLED')
    }
    renderRing() {}
    renderSuccess() {}
  }
  registerSkin(new CustomOledSkin())
  ok(getSkin('custom_oled').label === 'Custom OLED', 'custom skin adapter is retrievable dynamically')
  ok(getAvailableSkins().some((s) => s.id === 'custom_oled'), 'custom skin is included in available skins')
}

console.log(`\nALL ${passCount} CHECKS PASSED`)
