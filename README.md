# amazfit-smart-alarm

A Smart Alarm mini-program for the **Amazfit Bip Max**, built on **Zepp OS**
using the officially recommended `@zeppos/zeus-cli` toolchain and the modern
`@zos/*` module API.

## What it does

- Create, edit and delete alarms with a native `TIME_PICKER`, an optional
  repeat pattern (any subset of Mon–Sun, or a one-off "once" alarm), and a
  native `SLIDE_SWITCH` on/off toggle.
- **Smart Wake**: instead of always ringing at the exact minute, an alarm can
  define a wake *window* (10 / 20 / 30 minutes) before the target time.
  During that window the watch periodically checks the wearer's heart rate
  against their resting heart rate; a noticeable rise (a light-sleep /
  waking signal) triggers the alarm early and gently. If no such signal is
  seen, the alarm falls back to ringing at the exact set time regardless.
- **Zombie Walk (Wake Challenge / CAPTCHA)**: Ensures cognitive and physical
  arousal before silencing the alarm. When ringing, the user must walk a configured
  number of steps (e.g. 10–50 steps) tracked via real-time pedometer sensors (`@zos/sensor.Step`).
- **Anti-Exit Defenses**: Prevents groggy users from dismissing the alarm by
  accidentally pressing the physical side button or swiping back (`onKey` and
  `onGesture` guards with watchdog relaunch fallbacks).
- Ringing screen with **Snooze** (9 minutes) and **Dismiss**, using a
  repeating call-style vibration until acknowledged.
- **Dev Menu & Diagnostics**: Dedicated developer settings screen accessible
  from the main screen (`⚙` button or version footer) showing installed version,
  active OS timers, timer self-healing (`reconcileTimers`), vibration test, and multi-page
  **QR Code log export** to easily scan flight-recorder diagnostic events directly with a smartphone.
- Alarms persist across reboots (native OS timers created with
  `store: true`) and are stored on-device with `@zos/storage`.

## Important: Zepp OS Sleep Mode & DND Behavior

> [!IMPORTANT]
> **Native Sleep Mode / Do Not Disturb (DND):**
> On Zepp OS, the watch's native **Sleep Mode** (*Tryb uśpienia / snu*) and Do Not Disturb (DND) actively silence vibrations and suppress 3rd-party mini-program wake alarms.
>
> If the watch is in native Sleep Mode when an alarm is scheduled to ring:
> - The OS will **suppress the wake-up / ring screen** and silence motor vibrations.
> - **Requirement:** For alarms to ring and vibrate reliably, **native Sleep Mode must be disabled or scheduled to turn off before your alarm time** in your watch's system settings.

## Project layout

```
app.json                 # Zepp OS manifest (target: bip_max, Active 2 Square / Round, Rome, Milan)
app.js                   # App lifecycle - captures wake payload, auto-reconciles timers
page/
  index.page.js          # Alarm list, Dev Menu button, version footer, "add" entry point
  edit.page.js           # Create/edit alarm (time picker, repeat days, smart wake, zombie walk)
  ring.page.js           # Full-screen ringing UI, CAPTCHA controller, silent smart-wake checks
  diag.page.js           # Dev Menu: timer status, self-healing, QR code flight recorder export
alarm/
  model.js               # Alarm entity definition and factory
  repository.js          # @zos/storage CRUD persistence
  scheduler.js           # @zos/alarm scheduling and timer reconciliation
  smart-wake.js          # Heart rate light-sleep delta analysis
  diagnostics.js         # Flight recorder event ring buffer and safe QR formatting
  version.js             # Semantic version metadata
captcha/
  registry.js            # Challenge strategy registry (e.g. Zombie Walk)
  strategies/            # Concrete CAPTCHA implementations (Step sensor)
ui/                      # UI helpers, time pickers, device dimensions
assets/                  # Icons and slide switch artwork
```

## Native widgets used

The UI is built entirely from `@zos/ui` widgets - no custom canvas drawing:
`TIME_PICKER` (full-screen time selection), `SLIDE_SWITCH` (alarm on/off,
Smart Wake on/off), `BUTTON` (all taps/navigation, including the weekday
multi-select row), `TEXT`, `FILL_RECT`, and `QRCODE` (in a dedicated view for safe diagnostics export).

## How alarms are scheduled

Everything is built on the documented `@zos/alarm` API (`set`/`cancel`,
API_LEVEL 3.0+), used as **one-shot timers that reschedule themselves**
rather than relying on the module's own repeat/week-day fields, so the
weekday bitmask, "once" alarms and the smart-wake window can all share one
simple mechanism:

1. Saving an alarm computes the next matching timestamp
   (`alarm/scheduler.js#computeNextTimestamp`) and arms a **final** timer at
   that exact time with `url: 'page/ring.page'`.
2. If Smart Wake is on, a second **check** timer is armed at
   `target - window`. Each time it fires it opens `ring.page` "invisibly"
   (see below), reads `HeartRate.getLast()` vs `HeartRate.getResting()`,
   and either starts ringing immediately or re-arms itself ~2 minutes later
   until the window runs out - at which point the final timer takes over.
3. `@zos/alarm`'s `param` string is only ever delivered to **app.js**
   `onCreate`, not to the woken page's own `onInit` - so `app.js` stashes it
   on `globalData.wakeParams` and `ring.page.js` reads it from there.
4. On dismiss, a repeating alarm is simply re-armed for its next
   occurrence; a one-time alarm is disabled. Snooze re-arms the final timer
   `SNOOZE_MINUTES` later.
5. **Self-Healing Reconciliation**: If native timers are lost (e.g. following OS upgrades or third-party interference), launching the app triggers `scheduler.reconcileTimers()` to automatically verify and restore missing OS timers for all active alarms.

This keeps the whole feature inside documented, stable APIs instead of
relying on any single "smart alarm" primitive (Zepp OS doesn't have one).

## Known limitations / follow-ups

- Native Zepp OS Sleep Mode must be turned off or scheduled to finish before alarm time (see note above).
- The alarm list renders up to 5 rows directly (no scrolling list widget
  yet) - plenty for typical use, but worth swapping for `SCROLL_LIST` if you
  need more.
- A smart-wake check very briefly wakes the screen every ~2 minutes during
  the window even when it doesn't trigger a ring, since `@zos/alarm` timers
  launch through a page. This is expected behavior, not a bug.
- `app.json`'s `appId` (`1124567`) is the ID assigned in the Zepp developer
  console for this app.
- `assets/bip_max/icon.png` and the `switch_*.png` slide-switch art are
  small generated placeholders; swap in real artwork before release.
- Targets multiple Zepp OS devices (Amazfit Bip Max, Active 2 Square / romew, Active 2 Round / milanw, Rome, Milan). Add more entries under `targets` in `app.json` as needed.

## Building and running

Install the Zepp OS CLI (see
[Zepp OS npm tooling docs](https://docs.zepp.com/docs/guides/tools/npm/officially-recommended/)):

```bash
npm install -g @zeppos/zeus-cli
zeus login
zeus doctor       # sanity-check your toolchain
```

From the project root:

```bash
zeus dev          # start the dev server
zeus preview      # QR-pair the Zepp app / simulator for live preview
zeus build        # produce a distributable .zab package
```

This has been verified end-to-end with `zeus build` (zeus-cli 1.9.3): it
rollup-bundles the 4 JS files, resizes/converts all PNGs (icon + slide-switch
art) with PNG2TGA, compiles every page to QuickJS bytecode, and packages a
`dist/*.zab` whose embedded `app.json` and `manifest.json` correctly report
`screenResolution: "432x514"` / `deviceSource: 11206915` for the `bip_max`
target.

`zeus dev`/`zeus preview` were **not** exercised here - both need `zeus
login` first, which opens `<LOGIN_URL>?...&project_redirect_uri=http://
localhost:<port>/login/callback` in a browser and waits for *that same
machine's* localhost callback server to receive the OAuth redirect. There's
no browser/display in this environment, and the login can't be completed on
a different machine either, since the callback is bound to whichever
machine's `zeus login` opened it. `zeus preview` additionally needs the
official (GUI, downloadable) Zepp OS Simulator app running and listening on
`127.0.0.1:7650` (`zeus status` reports `simulator connect status:
disconnected` otherwise). None of that is a code issue - run `zeus login`
and `zeus preview`/`zeus dev` yourself once you have the Simulator installed
and are logged into a Zepp developer account.

**Offline/CI note:** `zeus build` needs `~/.zepp/.zeus_devices`, a cache of
Zepp's device catalog it otherwise fetches from `upload-cdn.zepp.com`. If
that host isn't reachable, seed the cache yourself before building - see the
device object shape zeus-cli and its bundled `@zeppos/zpm` both expect in
`config/device.js` and the `Be()` parser inside `@zeppos/zpm`'s bundle; a
single entry for `deviceSource: 11206915` with `value.code`, numeric
`value.productId`/`value.productVersion`, `value.shape`, `value.chip`,
`value.screen.{size,previewSize,iconSize}`, `value.os.{version,apiLevel,
apiLevelLimitMin}` and `value.pixelDensity` satisfies both. Also note
`@zeppos/zeus-cli`'s `package.json` declares a `_moduleAliases` mapping
(via the `module-alias` package) that only resolves correctly when
`module-alias` itself lives in `zeus-cli`'s own `node_modules` - if your
package manager hoists it to the workspace root, add the same
`_moduleAliases` entry to this project's `package.json` (already done here)
so `zeppos-app-utils` still resolves.

## Testing

```bash
npm test
```

There's no way to run the real Zepp OS runtime (or the GUI simulator) inside
a plain Node/CI process, so `test/run.mjs` instead imports the actual
`app.js`/`page/*.js`/`utils/*.js` source files - unmodified - into plain
Node, against small hand-written mocks of the device APIs
(`test/mocks/@zos/*`) and a `Page`/`App`/`getApp` global shim, wired up via
a Node loader hook (`test/resolve-hook.mjs`, registered through
`test/register.mjs`) that redirects `@zos/*` imports to those mocks and
resolves the extensionless relative imports Zepp's own rollup-based bundler
allows but Node's ESM resolver doesn't.

It's 176 checks driving the app end to end at the logic/interaction level:
`computeNextTimestamp`'s date math, rendering the alarm list (empty and
populated), the whole create-alarm flow through `edit.page.js` (opening and
completing the native `TIME_PICKER`, toggling a weekday button, flipping the
`SLIDE_SWITCH` widgets, Save), Zombie Walk step challenges and sensor integration,
Anti-Exit locking, Dev Menu interaction, safe QR-code log export payloads,
an alarm firing and being dismissed or snoozed, both smart-wake branches
(heart-rate rise vs. no rise) with the resulting native-timer arm/cancel calls,
and timer self-healing. It will not catch device-specific rendering/layout issues -
only the official simulator or a real watch can - but it does catch logic
regressions and crashes across the whole codebase on every change, with no external
dependencies.

## Community Inspiration & Benchmarks

- **AlarmZone (Zepp OS App ID: 1100448)**:
  - Reddit announcement & discussion: [I built a better alarm app for Zepp OS, I promise you won't sleep through it](https://www.reddit.com/r/amazfit/comments/1rgq7hi/i_built_a_better_alarm_app_for_zepp_os_i_promise/) by developer `u/MarcDoria`
  - Follow-up user feedback thread: [I promised you'd wake up: 200+ of you are actively waking up with AlarmZone](https://www.reddit.com/r/amazfit/comments/1rmx7jj/i_promised_youd_wake_up_200_of_you_are_actively/)
  - **Key inspirations & takeaways**:
    - **Anti-Exit Defenses**: Preventing groggy users from dismissing alarms by simply pressing the watch's physical crown/side button or swiping back. Achieved on Zepp OS via `@zos/interaction` (`onKey` and `onGesture` returning `true` to block OS navigation) coupled with persistent watchdog fallback alarms (`@zos/alarm`).
    - **Interactive Wake Challenges (CAPTCHAs)**: Math equations, shake-to-wake, and step counting challenges to ensure cognitive arousal before silencing the alarm.
    - **Community-driven ergonomics**: High-contrast, sleepy-friendly UI, dedicated vibration patterns, and customizable snooze intervals.

## Roadmap & Upcoming Features

- [ ] **Quick Access Watch Widget / Shortcut Card (Karta skrótów / Widget)**:
  - Add native Zepp OS secondary widget page (`widget` / `secondary-widget` in `app.json`), accessible by swiping sideways from the main watch face.
  - Provides a quick glance at the next upcoming alarm and its toggle state without opening the full application.
  - 1-tap deep link directly into the alarm app.
- [ ] **Next Alarm Countdown Indicator ("Za ile następny alarm")**:
  - Dynamic countdown calculating exact remaining time until the next active alarm (e.g., *"Next alarm in 7h 24m"* / *"Następny alarm za 7 godz. 24 min."*).
  - Displayed prominently on the main alarm list header (`page/index.page.js`).
  - Integrated directly into the home screen Quick Access Widget.
- [ ] **UI Visual Refresh & Dedicated Icon Pack (Odświeżenie UI i ikonki)**:
  - Replace temporary glyphs and placeholders with custom high-definition icon assets.
  - Dedicated iconography for alarm states, repeating days, Smart Wake (sleep wave), Snooze, and CAPTCHA challenge status (Zombie Walk, Steps, etc.).
  - Polished micro-interactions and high-contrast styling optimized for AMOLED watch displays (both rectangular and circular).

## References

- Zepp OS API reference & guides: https://docs.zepp.com/docs/intro/version/
- Sample apps: https://github.com/zepp-health/zeppos-samples
- Amazfit Bip 6 practical notes (device family background):
  https://github.com/masimoneext-sketch/amazfit-bip6-watchface-guide
- AlarmZone Community Thread: https://www.reddit.com/r/amazfit/comments/1rgq7hi/i_built_a_better_alarm_app_for_zepp_os_i_promise/
