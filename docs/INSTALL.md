# Installing Shaikh's on a phone

There are two editions, and the difference is one permission.

| Edition | Files | Focus Mode | Installing |
| --- | --- | --- | --- |
| **Full** | `shaikhs-arm64.apk`, `shaikhs-32bit.apk`, `shaikhs.apk` | Yes | Google Play Protect blocks it until scanning is switched off once — see below |
| **Lite** | `shaikhs-arm64-lite.apk`, `shaikhs-32bit-lite.apk` | No | Installs like any app, no security prompt |

Take the `arm64` file unless the phone is old enough to be 32-bit, in which case
the `32bit` one is for you. Every phone can run the universal `shaikhs.apk`,
which is also the file the app updates itself from.

## Why Play Protect blocks the full app

Focus Mode works through an Android **accessibility service** — the only interface
that lets an app see which screen another app has open, and therefore the only
way to step in before Reels or Shorts load.

Since 2024 Google Play Protect has a rule called *enhanced fraud protection*:
any app installed from an internet-sideloading source (a browser, a messaging
app, a file manager) that declares an accessibility service, a notification
listener, or SMS permissions is **blocked automatically**, with no "install
anyway" button. The dialog reads:

> **App blocked to protect your device** — This app can request access to
> sensitive data. This can increase the risk of identity theft or financial fraud.

That is a statement about declared permissions, not about this app's behaviour.
Banking-fraud malware abuses accessibility to read OTPs off the screen, so Google
blocks everything that declares it. The rule is rolled out server-side, which is
why the same file that installed a month ago can be refused today.

## Installing the full app anyway

1. Open **Google Play Store** → tap your **profile picture** → **Play Protect**.
2. Tap the **gear icon** (top right).
3. Turn off **Scan apps with Play Protect** (and *Improve harmful app detection*,
   if it is there and blocks you).
4. Install `shaikhs-arm64.apk` from Chrome → the file downloads → tap it →
   **Install**.
5. Turn **Scan apps with Play Protect** back on.

If the toggle is greyed out, the phone has Android's **Advanced protection**
switched on (Settings → Security & privacy → Advanced protection). Turn it off
while installing, then back on.

## Installing the lite edition

Nothing to switch off: download `shaikhs-arm64-lite.apk` in Chrome, tap the
finished download, **Install**. The APK declares no accessibility service, so
Play Protect has nothing to object to.

Everything except Focus Mode is in it: accounts, PDF Arena's twenty-one tools, and
the in-app updater. Focus Mode's screen says plainly that this edition leaves it
out, and the release notes say how to get the full app.

## Once installed

Updates arrive from inside the app, not through a browser or a file manager, so
the Play Protect sideloading rule does not apply to them: the app downloads the
package built for that phone's CPU, checks its SHA-256, and hands it to Android's
installer. Android always shows its own confirmation — that one tap cannot be
skipped by any ordinary app.

Both editions are signed with the same key, so switching between them is a normal
update, and documents, account and settings survive it.
