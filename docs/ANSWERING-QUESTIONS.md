# When someone says the app is malware

Copy-paste answers. Use the short one for DMs and group chats, the long one for whoever
keeps pushing. Change the wording to sound like you — it works better in your own voice.

---

## The short one

> It's not malware, but I get why it looks like it. Two things:
>
> **The VirusTotal number.** It's 1 out of 67 — sixty-six scanners including Google,
> Kaspersky and Bitdefender found nothing. That one flag is a heuristic engine guessing,
> because the app asks for Android's **accessibility** permission, which is what banking
> trojans also use. It's also signed with a debug key and isn't on the Play Store, and those
> two things make scanners suspicious by default. But 66 clean engines isn't a guess.
>
> **What it actually does.** The accessibility permission is how any app can know *which
> screen is open in another app*. That's the entire feature — it looks at the screen's
> technical name ("clips_viewer"), and when that matches something you told it to block, it
> covers the screen with a message. It never reads text, never takes screenshots, has no
> internet access while it's doing that, and can't click anything for you.
>
> The code is public: github.com/WaquarShaikh5555/Mee6 — you can read exactly what it does.
> And honestly, if you're not comfortable, don't install it. That's a fine answer.

---

## The longer one

> Fair question, and I'd rather explain than have you take my word for it.
>
> **Why VirusTotal shows a detection**
>
> It's 1 out of 67. That means 66 engines — Google, Kaspersky, Bitdefender, ESET,
> Microsoft, all the big ones — found nothing. The one that flagged it is a small
> heuristic engine, and heuristics are pattern-guessers, not proof. Three things make this
> app look suspicious to them:
>
> 1. It uses Android's **accessibility service**. This is the single biggest red flag a
>    scanner can see, because banking trojans are built on it. But accessibility is also the
>    *only* way any app on Android can know what another app is currently showing. Regain
>    can't exist without it.
> 2. It's **signed with a debug certificate**. That key is public — it ships with every
>    React Native project on earth. Scanners treat that as low-trust by default.
> 3. It's **not on the Play Store**, so it has no reputation for scanners to offset the
>    heuristic with.
>
> **What the permissions actually are**
>
> The app asks for: internet, network state, vibration (haptics), and storage — read and
> write. The storage ones are the ones people notice, and here's the thing: they don't come
> from the app's code. They come from Expo's image and file libraries, which use them to
> cache downloaded images on Android 12 and older. They're capped at Android 12
> (`maxSdkVersion 32`), so on any Android 13 or newer phone they're ignored entirely — and
> the app never asks you to grant them anyway.
>
> Nothing in the app reads your photos, files, camera, microphone, contacts, or location.
> Those permissions aren't even declared.
>
> **What the accessibility service does and doesn't do**
>
> Does: reads the technical names of views on screen, like `clips_viewer`. If that name is
> on your blocked list, it draws a full-screen message over the app. That's it.
>
> Doesn't: read the text of posts or messages, take screenshots, record keystrokes, make
> network requests while enforcing, or perform actions inside other apps. The only thing it
> will ever do for you is open the app's messages or press Back — and only when you tap the
> button.
>
> You can revoke the permission any time in Settings → Accessibility and the app just stops
> blocking. Nothing breaks, nothing stops working.
>
> **You can check it yourself**
>
> - Full source: github.com/WaquarShaikh5555/Mee6
> - The permission list is in the build log of every version, and anyone can unzip the APK
>   and read `AndroidManifest.xml` in about two minutes.
> - The app talks to exactly one service on the internet — Supabase, for the login — and no
>   other server, no analytics, no ads. Nothing about what you look at leaves your phone.
>
> **And the honest part**
>
> Sideloading an app from outside the Play Store is a real risk, generally. You should be
> sceptical of apps that ask for accessibility — *especially* ones you didn't expect to. In
> this case the reason is the feature, and the code is open so it can be checked instead of
> trusted. If you'd rather not, genuinely: don't install it. I'd rather that than you install
> something you're unsure about.

---

## If someone wants the two-minute check

Send them this:

1. **See the permissions yourself.** Download the APK, unzip it, open `AndroidManifest.xml`.
   Everything it can ask for is listed there. There is no camera, microphone, contacts, SMS,
   or location entry.
2. **Read the code.** The Android side is about 400 lines in
   `apps/mobile/modules/regain/android/`. Start with `RegainAccessibilityService.kt` — it's
   the only file that can see another app.
3. **Watch it work.** Open Instagram Reels with Regain on. A full-screen message covers it.
   Malware hides; this is designed to be impossible to miss.

---

## For you, not for them

Things worth knowing before you defend it, so you're not caught out:

- **The `1/67` will follow every build.** It's the accessibility permission and the debug
  signature, not anything in this version. Don't expect a new build to come back clean.
- **The real fix is a proper signing key**, and eventually a Play Store listing. Play
  requires a written declaration and a demo video for accessibility apps — that's a real
  project, not a checkbox, but it's the thing that makes these questions disappear.
- **Don't overpromise.** If someone asks "can it read my DMs?" the answer is no, and you can
  say why: it only reads view names, and message text is never touched. But if someone asks
  "is it as safe as an app from the Play Store?" — it isn't, because nothing reviewed it.
  Saying that plainly makes everything else you say more believable.
- **Never tell someone their concern is stupid.** The concern is correct in general. It's
  just wrong in this specific case, for reasons you can point at.
