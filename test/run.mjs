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
import * as deviceMock from '@zos/device'
import * as displayMock from '@zos/display'
import * as settingsMock from '@zos/settings'
import * as pageMock from '@zos/page'
import * as interactionMock from '@zos/interaction'
import { __resetAllMockStorage } from '@zos/storage'
import { WidgetTracker } from '../ui/tracker.js'
import { lockExit, unlockExit, isExitLocked } from '../utils/anti-exit.js'

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
  deviceMock.__mock.reset()
  displayMock.__mock.reset()
  settingsMock.__mock.reset()
  pageMock.__mock.reset()
  interactionMock.__mock.reset()
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

// Import order defines registeredPages[0..3]. Must be dynamic (not static
// top-level import) so it runs *after* the globals above are installed.
await import('../app.js')
await import('../page/index.page.js')
await import('../page/edit.page.js')
await import('../page/ring.page.js')
await import('../page/diag.page.js')

const appDef = currentApp._def
const [indexPage, editPage, ringPage, diagPage] = registeredPages

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

// Helper to wait for deferred setTimeout calls (e.g. _checkProgress deferral)
const tick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

// safeExit() tries home() first, so test checks for either home or exit
const calledSafeExit = () =>
  routerMock.__mock.calls.some((c) => c.fn === 'home' || c.fn === 'exit')

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
  ok(allByType('WIDGET_SLIDE_SWITCH').length === 1, 'native SLIDE_SWITCH widget is used for Alarm-enabled')

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

  // Open Wake Mode menu from the settings screen
  const wakeBtn = uiMock.__mock.created.find(
    (w) => typeof w._opts.text === 'string' && w._opts.text.startsWith('Wake Mode:')
  )
  ok(wakeBtn !== undefined, 'Wake Mode button is rendered on settings screen')
  wakeBtn._opts.click_func()
  ok(editPage.state.mode === 'smart', 'tapping Wake Mode opens Wake Mode menu')
  ok(byText('Wake Mode') !== undefined, 'Wake Mode title is rendered')
  const smartSwitch = allByType('WIDGET_SLIDE_SWITCH')[0]
  smartSwitch._opts.checked_change_func(smartSwitch, true)
  ok(editPage.state.alarm.smart === true, 'toggling smart switch enables smart-wake')
  ok(byText('20 min') !== undefined, 'window options are rendered when smart wake is enabled')
  byText('Done')._opts.click_func()
  ok(editPage.state.mode === 'settings', 'Done returns to settings screen')

  // Open Snooze menu from the settings screen
  const snoozeBtn = uiMock.__mock.created.find(
    (w) => typeof w._opts.text === 'string' && w._opts.text.startsWith('Snooze:')
  )
  ok(snoozeBtn !== undefined, 'Snooze button is rendered on settings screen')
  snoozeBtn._opts.click_func()
  ok(editPage.state.mode === 'snooze', 'tapping Snooze opens Snooze menu')
  ok(byText('Snooze') !== undefined, 'Snooze title is rendered')
  ok(byText('10 min') !== undefined, '10 min option is rendered')
  byText('15 min')._opts.click_func()
  ok(editPage.state.alarm.snoozeMinutes === 15, 'selecting 15 min updates snooze duration')

  // Toggle Snooze switch OFF -> duration options are hidden!
  const snoozeSwitch = allByType('WIDGET_SLIDE_SWITCH')[0]
  snoozeSwitch._opts.checked_change_func(snoozeSwitch, false)
  ok(editPage.state.alarm.snooze === false, 'toggling snooze switch off disables snooze')
  ok(byText('15 min') === undefined && byText('10 min') === undefined, 'snooze options are hidden when snooze is off')
  ok(byText('Snooze is disabled.') !== undefined, 'disabled explanation is shown')

  // Toggle Snooze back ON and select 10 min
  snoozeSwitch._opts.checked_change_func(snoozeSwitch, true)
  ok(editPage.state.alarm.snooze === true, 'toggling snooze switch on enables snooze')
  byText('10 min')._opts.click_func()
  ok(editPage.state.alarm.snoozeMinutes === 10, 'selecting 10 min updates snooze duration')

  byText('Done')._opts.click_func()
  ok(editPage.state.mode === 'settings', 'Done returns to settings screen')

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
  ok(byText('Dismiss') !== undefined && byText('Snooze 10m') !== undefined, 'Dismiss and Snooze buttons are rendered')
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'start'), 'ringing starts the vibration motor')
  ok(isExitLocked() === true, 'ringing engages strict anti-exit lock')
  ok(interactionMock.__mock.triggerKey(interactionMock.KEY_BACK) === true, 'clicking hardware key returns true (cancels OS exit)')
  ok(interactionMock.__mock.triggerGesture(interactionMock.GESTURE_RIGHT) === true, 'swiping right returns true (cancels swipe-to-back)')

  // Dismissing with Zombie Walk active transitions into the walk challenge
  byText('Dismiss')._opts.click_func()
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'stop'), 'Dismiss stops the vibration motor')
  ok(ringPage.state.activeStrategy !== null && ringPage.state.activeStrategy.id === 'zombie', 'Dismiss enters Zombie Walk challenge mode')
  ok(interactionMock.__mock.triggerKey(interactionMock.KEY_SELECT) === true, 'hardware button during CAPTCHA challenge is strictly blocked')
  ok(alarmMock.__mock.active.size === 3, 'Zombie Walk arms a fallback timer for timeout failure')
  ok(byText('ZOMBIE WALK') !== undefined, 'Zombie Walk title is displayed')
  ok(byText('0 / 30') !== undefined, 'initial 0 / 30 steps is displayed')

  // Simulate walking 30 steps via the Step sensor's registered onChange callback
  sensorMock.__mock.steps.current = 130 // started at 100, +30 steps
  sensorMock.__mock.steps.callbacks.forEach((cb) => cb())
  await tick() // wait for deferred _checkProgress setTimeout
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
  await tick() // wait for deferred failure setTimeout
  ok(ringPage.state.activeStrategy === null, 'failure exits zombie mode')
  ok(ringPage.state.captchaFailed === true, 'captchaFailed flag set')
  ok(ringPage.state.ringing === true, 'ringing state is preserved on failure')
  ok(routerMock.__mock.calls.length === 0, 'alarm does NOT exit the application on timeout failure')
  ok(ringPage.state.fallbackAlarmId === null, 'fallback native alarm is safely cancelled on in-app failure')
  ok(
    sensorMock.__mock.vibrations[sensorMock.__mock.vibrations.length - 1].action === 'start',
    'alarm resumes ringing with loud vibration'
  )
  ok(byText('Challenge not finished!\nWake up!') !== undefined, 'generic failure message is displayed on re-ring screen')

  // Dismissing again on re-ring screen should start challenge again
  byText('Dismiss')._opts.click_func()
  ok(ringPage.state.activeStrategy !== null && ringPage.state.activeStrategy.id === 'zombie', 'subsequent Dismiss enters zombie mode again')
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
  ok(calledSafeExit(), 'Dismiss directly exits when CAPTCHA is None')

  // Reset back to zombie for subsequent tests
  alarm.captcha.type = 'zombie'
  upsertAlarm(alarm)
}

console.log('\n5d. page/ring.page.js: Cold-start fallback recovers alarm when wake param is missing')
{
  const { getAlarms, upsertAlarm } = await import('../alarm/repository.js')
  const now = new Date()
  const alarm = getAlarms()[0]
  alarm.enabled = true
  alarm.hour = now.getHours()
  alarm.minute = now.getMinutes()
  upsertAlarm(alarm)

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  freshRingPageState()

  // App starts with NO wake params (simulating OS param loss after long deep sleep cold start)
  currentApp._options.globalData.wakeParams = null
  ringPage.onInit(null)

  ok(ringPage.state.alarm !== null, 'cold start fallback successfully finds enabled alarm')
  ok(ringPage.state.alarm.id === alarm.id, 'cold start fallback matched the correct alarm ID')
  ok(ringPage.state.ringing === true, 'cold start fallback immediately initiates ringing')
  ok(!calledSafeExit(), 'cold start fallback prevents false-positive early exit')

  ringPage.build()
  ok(byText('Dismiss') !== undefined, 'ringing screen with Dismiss button is displayed')
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
  ok(calledSafeExit(), 'a silent check still exits so the screen does not stay on')

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

  byText('Snooze 10m')._opts.click_func()
  ok(sensorMock.__mock.vibrations.some((v) => v.action === 'stop'), 'Snooze stops the vibration motor')
  ok(calledSafeExit(), 'Snooze exits the mini-program')
}

console.log('\n7c. page/ring.page.js: snooze disabled (OFF) renders no snooze buttons')
{
  const { getAlarms } = await import('../alarm/repository.js')
  const alarm = getAlarms()[0]
  alarm.snooze = false

  uiMock.__mock.reset()
  routerMock.__mock.reset()
  sensorMock.__mock.reset()
  freshRingPageState()
  appDef.onCreate(JSON.stringify({ id: alarm.id, mode: 'final' }))
  ringPage.onInit()
  ringPage.build()

  ok(byText('Dismiss') !== undefined, 'Dismiss button is rendered')
  const hasSnoozeRing = uiMock.__mock.created.some(
    (w) => typeof w._opts.text === 'string' && w._opts.text.startsWith('Snooze')
  )
  ok(!hasSnoozeRing, 'no Snooze button rendered on ring screen when snooze is OFF')

  // Dismiss into challenge
  byText('Dismiss')._opts.click_func()
  ok(ringPage.state.activeStrategy !== null, 'challenge started')
  const hasSnoozeCaptcha = uiMock.__mock.created.some(
    (w) => typeof w._opts.text === 'string' && w._opts.text.startsWith('Snooze')
  )
  ok(!hasSnoozeCaptcha, 'no Snooze button rendered on captcha screen when snooze is OFF')

  // Restore snooze and cancel fallback timer for subsequent tests
  ringPage.cancelFallbackTimer()
  ringPage.onDestroy()
  alarm.snooze = true
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

  const delBtn = byText('Delete Alarm')
  ok(delBtn !== undefined, 'editing an existing alarm shows Delete Alarm button at the bottom')
  ok(delBtn._opts.y > 450, 'Delete Alarm is positioned at the bottom of the scrollable page')
  const backBtn = byText('< Back')
  ok(backBtn !== undefined, 'safe < Back navigation button is rendered')
  delBtn._opts.click_func()
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

  // Test ProgressiveChallengeStrategy base class
  const { ProgressiveChallengeStrategy } = await import('../captcha/progressive-base.js')
  class HeartRateMockStrategy extends ProgressiveChallengeStrategy {
    constructor() {
      super('heart_rate', 'Heart Rate Surge', {
        title: 'PULSE RUSH',
        subtitle: 'Raise pulse above 110 bpm',
        unitLabel: 'CURRENT BPM',
      })
    }
  }
  const hrStrategy = new HeartRateMockStrategy()
  ok(hrStrategy.challengeTitle === 'PULSE RUSH', 'ProgressiveChallengeStrategy sets title')
  ok(hrStrategy.unitLabel === 'CURRENT BPM', 'ProgressiveChallengeStrategy sets unit label')
  hrStrategy._currentValue = 85
  hrStrategy._targetValue = 110
  ok(hrStrategy.getCounterText() === '85 / 110', 'ProgressiveChallengeStrategy formats counter text')
  ok(Math.round(hrStrategy.getProgress() * 100) === 77, 'ProgressiveChallengeStrategy computes progress percentage')
  ok(!hrStrategy.isSuccess(), 'isSuccess is false when current < target')
  hrStrategy._currentValue = 115
  ok(hrStrategy.isSuccess(), 'isSuccess is true when current >= target')
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

console.log('\n11. ui/layout.js: responsive screen adaptation (Approach A)')
{
  const {
    getDevice,
    isRoundScreen,
    centerX,
    centerY,
    getSafeWidth,
    getCenteredBounds,
    resetDeviceCache,
  } = await import('../ui/layout.js')

  // 1. Square screen behavior (e.g. Amazfit Active 2 Square 390x450 / 432x514)
  resetDeviceCache()
  deviceMock.__mock.screenShape = deviceMock.SCREEN_SHAPE_SQUARE
  ok(!isRoundScreen(), 'isRoundScreen() returns false for square screen shape')
  ok(centerX(384, 432) === 24, 'centerX(384, 432) returns 24')
  ok(centerY(60, 498) === 219, 'centerY(60, 498) returns 219')

  // On square screens, getSafeWidth returns defaultWidth directly
  ok(getSafeWidth(406, 56, 384) === 384, 'getSafeWidth on square screen returns unmodified defaultWidth')
  const squareBounds = getCenteredBounds(406, 56, 384)
  ok(squareBounds.x === 24 && squareBounds.w === 384, 'getCenteredBounds on square screen returns { x: 24, w: 384 }')

  // 2. Round screen behavior (e.g. Amazfit Active 2 Round / GTR 466x466)
  resetDeviceCache()
  deviceMock.__mock.screenShape = deviceMock.SCREEN_SHAPE_ROUND
  ok(isRoundScreen(), 'isRoundScreen() returns true when screenShape is ROUND')

  // Near the center of the circular screen, safe width equals or approaches defaultWidth
  const centerW = getSafeWidth(220, 50, 384)
  ok(centerW === 384, 'getSafeWidth near the vertical center allows full default width')

  // Near top or bottom curved bezel edges, safe width is geometrically constrained
  const bottomW = getSafeWidth(420, 50, 384)
  ok(bottomW < 384, `getSafeWidth near screen bottom is constrained: ${bottomW} < 384`)
  const roundBounds = getCenteredBounds(420, 50, 384)
  ok(roundBounds.w === bottomW, 'getCenteredBounds w matches getSafeWidth')
  ok(roundBounds.x === Math.round((432 - bottomW) / 2), 'getCenteredBounds x is symmetrically centered')

  // Reset mock back to square for other tests
  resetDeviceCache()
  deviceMock.__mock.reset()
}

console.log('\n12. utils/anti-exit.js: Strict Lock hardware button and gesture interception')
{
  interactionMock.__mock.reset()
  unlockExit()
  ok(!isExitLocked(), 'initially exit is not locked')

  // Lock exit
  lockExit()
  ok(isExitLocked(), 'lockExit sets isExitLocked to true')
  ok(interactionMock.__mock.calls.some((c) => c.fn === 'onKey'), 'lockExit registers onKey listener')
  ok(interactionMock.__mock.calls.some((c) => c.fn === 'onGesture'), 'lockExit registers onGesture listener')

  // In strict lock mode, any key click returns true (blocks default exit)
  ok(interactionMock.__mock.triggerKey(interactionMock.KEY_BACK) === true, 'strict lock returns true on KEY_BACK')
  ok(interactionMock.__mock.triggerKey(interactionMock.KEY_SELECT) === true, 'strict lock returns true on KEY_SELECT')
  ok(interactionMock.__mock.triggerKey(interactionMock.KEY_HOME) === true, 'strict lock returns true on KEY_HOME')

  // Swiping right returns true (blocks swipe-to-back)
  ok(interactionMock.__mock.triggerGesture(interactionMock.GESTURE_RIGHT) === true, 'GESTURE_RIGHT returns true (blocks swipe-to-back)')
  // Other gestures (e.g. GESTURE_UP) return false
  ok(interactionMock.__mock.triggerGesture(interactionMock.GESTURE_UP) === false, 'other gestures return false')

  // Custom button handler callback support
  let customClicked = false
  lockExit({
    onButtonPress: (key) => {
      customClicked = true
      return true
    },
  })
  interactionMock.__mock.triggerKey(interactionMock.KEY_SELECT)
  ok(customClicked === true, 'custom onButtonPress callback is executed when registered')

  // unlockExit cleanly deregisters listeners
  unlockExit()
  ok(!isExitLocked(), 'unlockExit resets isExitLocked to false')
  ok(interactionMock.__mock.calls.some((c) => c.fn === 'offKey'), 'unlockExit invokes offKey')
  ok(interactionMock.__mock.calls.some((c) => c.fn === 'offGesture'), 'unlockExit invokes offGesture')
}

console.log('\n13. Resilience & Diagnostics: setWakeUpRelaunch, VIBRATOR_SCENE_TIMER, Blackbox logs & Diag page')
{
  resetAllMocks()
  freshRingPageState()

  // 13a. Verify setWakeUpRelaunch is armed during onInit and build
  const { getAlarms, upsertAlarm } = await import('../alarm/repository.js')
  const { createDraftAlarm } = await import('../alarm/model.js')
  const alarm = createDraftAlarm()
  alarm.id = 1
  alarm.enabled = true
  alarm.captcha = { type: 'none' }
  upsertAlarm(alarm)

  currentApp._options.globalData.wakeParams = { id: alarm.id, mode: 'final' }
  ringPage.onInit(null)
  ok(displayMock.__mock.wakeUpRelaunch === true, 'setWakeUpRelaunch armed on ringPage onInit')

  ringPage.build()
  ok(displayMock.__mock.wakeUpRelaunch === true, 'setWakeUpRelaunch remains armed after build')

  // 13b. Verify VIBRATOR_SCENE_TIMER used
  ok(
    sensorMock.__mock.vibrations.some(
      (v) => v.mode === sensorMock.VIBRATOR_SCENE_TIMER && v.action === 'start'
    ),
    'vibrator started with VIBRATOR_SCENE_TIMER'
  )

  // 13c. Verify safeExit resets wakeUpRelaunch
  const dismissBtn = byText('Dismiss')
  dismissBtn._opts.click_func()
  ok(displayMock.__mock.wakeUpRelaunch === false, 'setWakeUpRelaunch is cleanly reset to false on dismiss/exit')

  // 13d. Verify diagnostics logs
  const { getLogs } = await import('../alarm/diagnostics.js')
  const logs = getLogs()
  ok(logs.length > 0, 'diagnostics logs recorded during alarm lifecycle')
  ok(logs.some((l) => l.tag === 'RING_INIT'), 'RING_INIT event recorded in diagnostics')
  ok(logs.some((l) => l.tag === 'VIBRATE_START'), 'VIBRATE_START event recorded in diagnostics')

  // 13e. Diag / Dev Menu page renders properly with scrolling enabled
  const { APP_VERSION } = await import('../alarm/version.js')
  const { reconcileTimers } = await import('../alarm/scheduler.js')
  uiMock.__mock.reset()
  diagPage.build()
  ok(byText('Dev Menu & Logi') !== undefined, 'diag.page.js renders Dev Menu title')
  ok(
    pageMock.__mock.calls.some((c) => c.fn === 'setScrollMode' && c.options?.mode === pageMock.SCROLL_MODE_FREE),
    'diag.page.js enables SCROLL_MODE_FREE'
  )
  ok(
    uiMock.__mock.created.some(
      (w) => typeof w._opts.text === 'string' && w._opts.text.includes(`v${APP_VERSION}`)
    ),
    'diag.page.js displays APP_VERSION'
  )
  ok(byText('Test Wibracji') !== undefined, 'diag.page.js renders vibration test button')
  ok(byText('Wyczyść logi') !== undefined, 'diag.page.js renders clear logs button')
  ok(byText('🔄 Uzbrój / Odśwież timery') !== undefined, 'diag.page.js renders reconcile timers button')
  ok(byText('⬆ Wróć na górę') !== undefined, 'diag.page.js renders scroll to top button')

  // Test scroll to top button
  const topBtn = byText('⬆ Wróć na górę')
  topBtn._opts.click_func()
  ok(pageMock.__mock.calls.some((c) => c.fn === 'scrollTo' && c.options?.y === 0), 'scroll to top button calls scrollTo(0)')

  // Test vibration button triggers vibrator with VIBRATOR_SCENE_TIMER
  sensorMock.__mock.reset()
  const testVibBtn = byText('Test Wibracji')
  testVibBtn._opts.click_func()
  ok(
    sensorMock.__mock.vibrations.some(
      (v) => v.mode === sensorMock.VIBRATOR_SCENE_TIMER && v.action === 'start'
    ),
    'diag page test button starts VIBRATOR_SCENE_TIMER'
  )

  // Clear logs button empties the list
  const clearLogsBtn = byText('Wyczyść logi')
  clearLogsBtn._opts.click_func()
  ok(getLogs().length === 0, 'clear logs button successfully empties log store')

  // Reconcile timers button re-arms missing alarms
  alarm.enabled = true
  upsertAlarm(alarm)
  alarmMock.__mock.reset() // simulates OS wiping alarms after update
  const reconcileBtn = byText('🔄 Uzbrój / Odśwież timery')
  reconcileBtn._opts.click_func()
  ok(alarmMock.__mock.active.size > 0, 'reconcile timers button successfully re-arms enabled alarms')

  // app.js onCreate also automatically runs reconcileTimers
  alarmMock.__mock.reset()
  appDef.onCreate(null)
  ok(alarmMock.__mock.active.size > 0, 'app.js onCreate automatically reconciles and re-arms missing native timers')

  // Dev Menu button and version badge on index page
  uiMock.__mock.reset()
  indexPage.build()
  const devBtn = byText('⚙ Dev Menu')
  ok(devBtn !== undefined, 'index.page.js displays ⚙ Dev Menu button in header')
  devBtn._opts.click_func()
  ok(
    routerMock.__mock.calls.some(
      (c) => c.fn === 'push' && c.opts && c.opts.url === 'page/diag.page'
    ),
    '⚙ Dev Menu button navigates to page/diag.page'
  )

  const verBadge = byText(`v${APP_VERSION} · Dev Menu`)
  ok(verBadge !== undefined, 'index.page.js displays clickable version footer badge')
}

console.log(`\nALL ${passCount} CHECKS PASSED`)
