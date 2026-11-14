# Android Week Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Android widget that shows the signed-in Planner user's pending tasks for this week.

**Architecture:** A Java Android companion app signs in through the existing API and stores its session cookie in Android's app-private cookie store. A native AppWidgetProvider fetches the account and tasks, filters them locally, and renders a compact week list.

**Tech Stack:** Android SDK 35, Android Gradle Plugin 8.7.3, Java 17, JUnit 4, existing Hono API.

**Spec:** `docs/superpowers/specs/2026-11-13-android-week-widget-design.md`

## Global Constraints

- Preserve account ownership. Never cache or render tasks after sign-out, session expiry, or failed refresh.
- Use the current local Monday-to-Sunday week, like the Planner.
- Keep the existing website and server routes unchanged.
- Build a personal debug APK. Do not commit signing keys or APKs.

## Task 1: Android project and week filtering

- [x] Add the Android project structure and Gradle wrapper.
- [x] Write JUnit tests for week boundaries, incomplete and archived filters, and date/order sorting.
- [x] Run the tests and confirm they fail before implementation.
- [x] Implement the pure Java week filter.
- [x] Run the unit tests.

## Task 2: Sign-in and widget

- [x] Add the native sign-in screen and session-cookie API client.
- [x] Add the AppWidgetProvider, widget layout, periodic and manual refresh, and website tap action.
- [x] Build the debug APK and inspect the Android manifest and package output.

## Task 3: Delivery

- [x] Document installation and sign-in in README and DEPLOY.
- [x] Run `npm run verify` and Android unit tests/build.
- [ ] Commit one feature change and push it.
- [ ] Deploy the pushed revision with `./deploy.sh`.
- [ ] Create a reviewable pull request and report the revision, checks, and APK path.
