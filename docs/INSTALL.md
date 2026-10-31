# Installing Shaikh's on a phone

There are two editions, and the difference is one permission.

| Edition | Files | Focus Mode | Installing |
| --- | --- | --- | --- |
| **Full** | `shaikhs-arm64.apk`, `shaikhs-32bit.apk`, `shaikhs.apk` | Yes | Play Protect blocks the browser route — three ways in below |
| **Lite** | `shaikhs-arm64-lite.apk`, `shaikhs-32bit-lite.apk` | No | Installs like any app, no security prompt |

Take the `arm64` file unless the phone is old enough to be 32-bit, in which case
the `32bit` one is for you. Every phone can run the universal `shaikhs.apk`,
which is also the file the app updates itself from.

If you want Focus Mode, you want the full edition. The lite one is not a
substitute — it is what is left when a phone offers no way to install the full
one, and it says so on its own screen.

## Why Play Protect blocks the full app

Focus Mode works through an Android **accessibility service** — the only interface
that lets an app see which screen another app has open, and therefore the only
way to step in before Reels or Shorts load.

Google Play Protect has a rule called **enhanced fraud protection**. When an app
is installed from an *internet-sideloading source* — a browser, a messaging app,
a file manager — and declares **any one** of these four permissions, the install
is blocked automatically:

1. `RECEIVE_SMS`
2. `READ_SMS`
3. `BIND_NOTIFICATIONS`
4. **`Accessibility`** ← this app

There is no "install anyway" button on that dialog. It reads:

> **App blocked to protect your device** — This app can request access to
> sensitive data. This can increase the risk of identity theft or financial fraud.

That is a statement about *declared permissions*, not about this app's behaviour.
Banking-fraud malware abuses accessibility to read one-time passwords off the
screen, so Google refuses everything that declares it, sight unseen. The rule
covers 185 markets, India included, and it is rolled out server-side — which is
why a file that installed comfortably last month can be refused today. In 2025
it blocked 266 million install attempts.

Nothing in this repository can change that while Focus Mode exists: every
section-level blocker on Android needs the same permission and meets the same
wall.

## Three ways in

### 1. Shizuku — installs through Android's own developer channel

**Best option: Play Protect stays on, the phone stays protected, and it is all
done from the phone.** About ten minutes, once.

The trick is the install *route*, not the permission. Google blocks apps that
arrive through a browser; an install performed by ADB — the channel Android
reserves for developers — is not one of those sources. Shizuku runs an ADB
connection on the phone itself using Android's Wireless debugging, and a
Shizuku-aware installer routes the APK through it.

1. Install **Shizuku** from the Play Store (free, open source, by RikkaApps).
2. Settings → About phone → tap **Build number** seven times → "You are now a
   developer".
3. Settings → System → **Developer options** → turn on **USB debugging** and
   **Wireless debugging**. Stay on Wi-Fi.
4. Open **Shizuku** → **Pairing** → the Developer options shortcut → tap
   **Wireless debugging** (the words, not the switch) → **Pair device with
   pairing code** → enter the six digits in Shizuku's notification.
5. Back in Shizuku, tap **Start**. It should say *Shizuku is running*.
6. Install an installer that speaks Shizuku: **InstallerX Revived**
   ([releases](https://github.com/wxxsfxyzm/InstallerX-Revived/releases)) or
   **InstallWithOptions** ([releases](https://github.com/zacharee/InstallWithOptions/releases)).
   These are ordinary apps with no sensitive permissions, so they install
   normally.
7. In that installer, choose **Shizuku** as the install method. In Shizuku →
   **Authorized apps**, switch the installer on.
8. Download `shaikhs-arm64.apk` in Chrome, tap the finished download, and pick
   the Shizuku installer instead of Android's own. It installs with no block.

Shizuku stops when the phone restarts. That is fine — it is only needed for
installs, not for the app to run.

### 2. Turn Play Protect's scanning off for one minute

Quickest, where it works. It is also the least good: the phone is unprotected
while it is off, and on phones in India the enhanced protection sometimes
enforces itself even with the switch off.

1. Play Store → profile picture → **Play Protect** → **gear icon**.
2. Turn off **Scan apps with Play Protect** (and *Improve harmful app detection*,
   if it is listed).
3. Download the APK in Chrome → tap it → **Install**.
4. Turn scanning back on immediately.

If the switch is greyed out, the phone has Android's **Advanced protection**
enabled (Settings → Security & privacy → Advanced protection). It has to be off
while installing, then back on.

### 3. A store listing — the permanent answer

The block only exists for apps that arrive from a browser. A listing in an app
store removes it entirely: no dialog, no switch to remember, on every phone,
forever. It is also the single biggest thing that can be done for ad revenue —
sideloaded APKs see far less filled inventory than store installs.

That means Google Play (one-time 25 USD developer registration), a privacy
policy URL, a data safety form, and a declaration for the accessibility service
in which its use has to be justified. The first stop is **internal testing**: up
to 100 testers install like any Play app, with no warning.

## Once it is installed

- Open the app → **Focus Mode** card → switch it on.
- Android sends you to **Settings → Accessibility**; switch **Focus Mode** on
  there. On Android 13 and later, a sideloaded app needs
  **Settings → Apps → Shaikh's → ⋮ → Allow restricted settings** first, or the
  accessibility switch is greyed out. (That is a separate protection from Play
  Protect, and it is a switch you are meant to be able to flip.)
- Updating from a build where this feature was called *Regain*? Open Focus Mode
  and switch it on once more. Android ties the accessibility grant to the
  service's name, so the renamed service starts switched off; the apps and
  sections you chose come across on their own.

## Do not do this

- **Do not keep the lite edition as a workaround if you want Focus Mode.** It has
  no blocking of any kind.
- **Do not leave Play Protect off.** The app needs three minutes of the switch,
  not a permanently unguarded phone.
- **Do not install a "modded" Play Store or a Play Protect remover.** Those are
  the apps the warning is actually about.

## Updates

Updates arrive from inside the app: it downloads the package built for that
phone's CPU, checks its SHA-256, and hands it to Android's installer. The install
is requested by Shaikh's itself, not by a browser, so the sideloading rule does
not apply to it.

If Android ever refuses that install too, the fix is the same as above: keep the
new APK and install it through Shizuku. Nothing is lost — documents, account and
settings survive every install of a build signed with the same key.
