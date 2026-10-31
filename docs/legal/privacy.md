# Privacy policy

What Shaikh’s keeps, where it goes, and the parts that never leave your phone.

*Last updated 31 October 2026.*

*Focus Mode was called Regain before version 0.11.0. The name changed; what the feature does, and what it can see, did not.*

## The short version

Shaikh’s has an account, because you asked for one that works across devices. Everything Focus Mode does stays on your phone.

There are no analytics, no advertising, no trackers, and no third-party SDKs watching what you do. Nothing you look at inside Instagram, YouTube, Snapchat or the others is ever read, stored, or sent anywhere.

## What we hold

That is the complete list. There is no profile photo, no phone number, no contacts upload, no location, no device list, and no usage history on our side.

- Your email address — used to sign in and to reset your password.
- Your display name, if you provided one.
- A password hash. Not your password: a one-way hash that cannot be turned back into it. Nobody, including the developer, can read it.
- The dates your account was created and last updated.

## What stays on your phone

Uninstalling the app removes all of it. The only thing that survives is your account itself.

- Which parts of which apps Focus Mode closes.
- How many times Focus Mode stepped in, counted per day.
- The last screen Focus Mode recognised while tuning the detector.
- Your appearance preference (light, dark, or follow the system).
- Your sign-in session, held in the phone’s encrypted storage — the iOS Keychain or Android Keystore, not a plain file.

## What Focus Mode can and cannot see

To close the right screen, Focus Mode has to know which screen is open. Android gives an accessibility service the names of the views on screen — technical identifiers like “clips_viewer” — and nothing else is used.

It never reads the text of a post, a message, a comment, a notification, or a search. It does not take screenshots, does not record keystrokes, and has no ability to change anything inside another app. The only action it can take for you is the one you tap: opening Instagram’s messages, or pressing Back.

Everything Focus Mode decides is decided on the phone. Those decisions are never uploaded.

## Why the accessibility permission is needed

Android does not offer any other way for one app to know what another app is showing. The permission is requested only when you switch Focus Mode on, it can be revoked at any time in Settings → Accessibility, and turning Focus Mode off inside the app stops the service asking to look at anything.

## Who else is involved

Accounts and the profile row are hosted by Supabase, which provides the database and the sign-in service. Your email and account data are processed on their infrastructure, currently in the Asia-Pacific region, under their security and privacy terms.

There is no other processor. The app talks to exactly one service, and only for signing in, updating your name, and changing your password.

## What we never do

- Sell, rent, or share your data with anyone.
- Show advertising or use advertising identifiers.
- Track you across other apps or websites.
- Read your messages, or the content of anything you look at.
- Send your data to a third party for analytics or profiling.

## Keeping it safe

Traffic is encrypted in transit. The database enforces row-level security, so a signed-in account can read and change only its own row and nothing else. The app ships with a publishable key that grants no access by itself; the key that could bypass those rules is never in the app.

Passwords are hashed with bcrypt by the authentication service and are never stored, logged, or transmitted by this app.

No system is perfect. If you believe your account has been compromised, change your password from Settings and contact us.

## How long we keep it

Your account is kept for as long as it exists. Ask us to delete it and the account row and the email attached to it are removed; local data goes when you uninstall the app.

## Your choices

- Correct your name at any time in Settings.
- Change your password at any time; this signs out other devices.
- Ask for a copy of what we hold about you.
- Ask for your account to be deleted.

## Children

Shaikh’s is not intended for children under 13. If you are between 13 and 18, use it with the knowledge of a parent or guardian. If we learn that an account belongs to a child under 13, we will delete it.

## Changes

If this policy changes, the date at the top changes with it, and the change is visible in the app’s public source history. Anything that would meaningfully affect what happens to your data will be announced in the app before it takes effect.

## Contact
