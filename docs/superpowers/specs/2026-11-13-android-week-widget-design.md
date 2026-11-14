# Android week widget design

## Intent

Show the signed-in user's pending tasks for the current Monday-to-Sunday week on an Android home screen. The user signs in as `musel`. A widget tap opens the Planner site.

## Approach

Use a small Android companion app and a native App Widget. Android does not expose a home screen widget provider to the installed PWA. A Trusted Web Activity would still need native widget code and would not share browser cookies with that code. A standalone companion app keeps the existing website and API intact.

## Behavior

- The app has a native sign-in form for the existing Planner account. The password is sent only to `https://timer.musel.dev/api/auth/login`. The app keeps the returned HTTP-only session cookie in Android's app-private cookie store. It does not store the password.
- The widget calls `/api/auth/me` and `/api/tasks` with that cookie. The server's existing ownership check supplies only that user's tasks. The widget shows the returned account name so a wrong account is visible.
- The widget shows incomplete, non-archived tasks dated in the current local Monday-to-Sunday week, ordered by date and task order. Inbox tasks are excluded, as in the Planner week count.
- The widget refreshes on sign-in, when Android requests a periodic update, and on a manual refresh tap. If sign-in expires or the request fails, it hides prior task text.
- The widget opens the Planner website when tapped. The companion app has sign-out and Open Planner controls. Browser and companion app sessions are separate, so the user signs in to each as needed.

## Limits

- Android requires an APK installation to add a true home screen widget. Adding the PWA to the home screen still installs only its icon.
- Android schedules periodic widget updates no more often than every 30 minutes. Manual refresh can run sooner.
- The app uses Android 8.0 or newer (`minSdk 26`). The APK can be built locally with the Android SDK and Gradle. A debug APK is suitable for personal installation; it is not a Play Store release.
- No server schema or production account data changes are needed.
