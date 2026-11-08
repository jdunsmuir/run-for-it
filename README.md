# Run For It

A tiny motivation app: log kilometres you've run, spend them on rewards. No backend, no accounts,
no ads — everything is stored locally on your phone with AsyncStorage.

- Each reward (fitness class, coffee, meal out) costs **5 km**.
- Your balance can go **negative** (debt) — rewards are never blocked.
- Every **Sunday at 12:00 noon (Europe/London time)**, anything above 5 km is wiped; up to 5 km
  rolls over. Debt is never wiped. This works correctly even if the app wasn't open at the exact
  reset time, and even across the March/October clock changes.

Run totals and stats live in Strava — this app is just the "treat yourself" layer on top.

## Project structure

```
App.tsx                 Single-screen UI: balance, add-run form, reward buttons, history
src/
  constants.ts           Reward cost, rollover cap, reset weekday/time, timezone
  balance.ts              Pure functions: computeBalanceKm(), nextResetBoundary(), roundKm()
  useEventLog.ts          AsyncStorage-backed hook: events, addEvent, deleteEvent, undoLast
__tests__/
  balance.test.ts         Unit tests for the balance/reset logic
```

The event log (`{ type: 'run' | 'class' | 'coffee' | 'meal', km, timestamp }`) is the only thing
stored. The balance is never stored directly — it's always *derived* by replaying the log and
applying the weekly cap at every Sunday-12:00 boundary between the first event and now, so
deleting or undoing an entry just means recomputing from one fewer event.

## Running it on your phone (Expo Go)

1. Install Node.js if you don't have it, then install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npx expo start
   ```
3. Install **Expo Go** from the App Store / Play Store on your phone.
4. Scan the QR code shown in the terminal (or browser) with your phone:
   - **iOS**: scan it with the Camera app, then tap the notification.
   - **Android**: scan it from inside the Expo Go app.
5. The app opens in Expo Go. Your phone and computer need to be on the same Wi-Fi network. If
   that's not possible, run `npx expo start --tunnel` instead (slower, but works across networks).

Changes you make to the code hot-reload automatically while `expo start` is running.

(A browser preview also works for a quick look without a phone: `npx expo start --web`. Note the
delete-confirmation dialog doesn't render in a browser — `Alert.alert` is a no-op on web in
React Native — but it works normally in Expo Go.)

## Installing it as a standalone app (no laptop needed)

Expo Go needs your laptop's dev server running every time you open the app. To install it as a
normal, permanent app on your phone instead (Android only — iOS needs a paid Apple Developer
account for this), use **EAS Build**:

1. Create a free account at [expo.dev](https://expo.dev), then log in from a terminal (one-time,
   interactive):
   ```bash
   npx eas-cli login
   ```
2. Build an installable APK in Expo's cloud:
   ```bash
   npx eas-cli build --platform android --profile preview
   ```
   This takes a few minutes and ends with a download link. Open that link on your phone and
   install the APK directly (Android will ask you to allow installs from this source once).
3. From then on, the app is a normal icon on your phone — no laptop, no dev server.

### Updating it later

Because this app has no custom native code, almost every future change (UI tweaks, new features,
bug fixes) can be pushed as an **over-the-air update** instead of a full rebuild:

```bash
npx eas-cli update --branch preview --message "describe the change"
```

Run that once from your laptop after making changes; the installed app picks it up automatically
next time it's opened with internet access. A full rebuild (step 2 above) is only needed again if
you add native code, change the app icon/package id, or add Android permissions — none of which
this app currently does.

## Running the tests

```bash
npm test
```

This runs the Jest suite in `__tests__/balance.test.ts`, which covers the balance/reset logic:
decimals, going into debt, debt surviving a reset, a surplus being capped at a reset, exactly 5 km,
multiple missed weeks, events right before/after the Sunday 12:00 boundary, the March and October
UK clock changes, and recomputing after deleting or undoing an event.

## Assumptions made

A few minor calls were made rather than blocking on them:

- **DST handling**: uses the `date-fns-tz` library against the `Europe/London` IANA timezone
  (via the JS `Intl` API) rather than hand-rolled offset math, so the correct UTC instant for
  "Sunday 12:00 noon London time" is always used, including on the clock-change weekends
  themselves.
- **Reward confirmation**: a short banner under the balance (auto-dismisses after ~2.5s) rather
  than a native alert dialog, to stay one-handed and unobtrusive. If a reward pushes you into
  debt, the banner says so.
- **Delete confirmation**: uses a native confirm dialog (`Alert.alert`) so a stray tap can't wipe
  an entry; "Undo last" has no confirmation since it's meant to be a quick fix for a typo.
- **History order/labels**: most recent first; displayed timestamps use your phone's local time
  and locale (only the weekly reset boundary itself is pinned to Europe/London).
- **Light/dark mode**: follows the phone's system setting automatically (`userInterfaceStyle:
  "automatic"` in `app.json`).
