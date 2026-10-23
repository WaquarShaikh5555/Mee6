/**
 * The two documents the app is required to show.
 *
 * Kept as data rather than JSX so the same text can be rendered in the app, and
 * read in the repository (`docs/legal/*.md`), without the two drifting apart.
 *
 * Plain language on purpose: a privacy policy someone cannot understand is not
 * informed consent. Every claim here is a description of what the code actually
 * does — if the code changes, this changes.
 */

export type LegalSection = {
  heading: string;
  /** Paragraphs of ordinary text. */
  body?: string[];
  /** Short points, rendered with a bullet. */
  points?: string[];
};

export type LegalDocument = {
  id: 'privacy' | 'terms';
  title: string;
  /** One line under the title, setting expectations. */
  summary: string;
  updated: string;
  sections: LegalSection[];
};

export const CONTACT_URL = 'https://github.com/WaquarShaikh5555/Mee6/issues';

export const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy policy',
  summary: 'What Shaikh’s keeps, where it goes, and the parts that never leave your phone.',
  updated: '23 October 2026',
  sections: [
    {
      heading: 'The short version',
      body: [
        'Shaikh’s has an account, because you asked for one that works across devices. Everything Regain does stays on your phone.',
        'There are no analytics, no advertising, no trackers, and no third-party SDKs watching what you do. Nothing you look at inside Instagram, YouTube, Snapchat or the others is ever read, stored, or sent anywhere.',
      ],
    },
    {
      heading: 'What we hold',
      points: [
        'Your email address — used to sign in and to reset your password.',
        'Your display name, if you provided one.',
        'A password hash. Not your password: a one-way hash that cannot be turned back into it. Nobody, including the developer, can read it.',
        'The dates your account was created and last updated.',
      ],
      body: [
        'That is the complete list. There is no profile photo, no phone number, no contacts upload, no location, no device list, and no usage history on our side.',
      ],
    },
    {
      heading: 'What stays on your phone',
      points: [
        'Which parts of which apps Regain closes.',
        'How many times Regain stepped in, counted per day.',
        'The last screen Regain recognised while tuning the detector.',
        'Your appearance preference (light, dark, or follow the system).',
        'Your sign-in session, held in the phone’s encrypted storage — the iOS Keychain or Android Keystore, not a plain file.',
      ],
      body: [
        'Uninstalling the app removes all of it. The only thing that survives is your account itself.',
      ],
    },
    {
      heading: 'What Regain can and cannot see',
      body: [
        'To close the right screen, Regain has to know which screen is open. Android gives an accessibility service the names of the views on screen — technical identifiers like “clips_viewer” — and nothing else is used.',
        'It never reads the text of a post, a message, a comment, a notification, or a search. It does not take screenshots, does not record keystrokes, and has no ability to change anything inside another app. The only action it can take for you is the one you tap: opening Instagram’s messages, or pressing Back.',
        'Everything Regain decides is decided on the phone. Those decisions are never uploaded.',
      ],
    },
    {
      heading: 'Why the accessibility permission is needed',
      body: [
        'Android does not offer any other way for one app to know what another app is showing. The permission is requested only when you switch Regain on, it can be revoked at any time in Settings → Accessibility, and turning Regain off inside the app stops the service asking to look at anything.',
      ],
    },
    {
      heading: 'Who else is involved',
      body: [
        'Accounts and the profile row are hosted by Supabase, which provides the database and the sign-in service. Your email and account data are processed on their infrastructure, currently in the Asia-Pacific region, under their security and privacy terms.',
        'There is no other processor. The app talks to exactly one service, and only for signing in, updating your name, and changing your password.',
      ],
    },
    {
      heading: 'What we never do',
      points: [
        'Sell, rent, or share your data with anyone.',
        'Show advertising or use advertising identifiers.',
        'Track you across other apps or websites.',
        'Read your messages, or the content of anything you look at.',
        'Send your data to a third party for analytics or profiling.',
      ],
    },
    {
      heading: 'Keeping it safe',
      body: [
        'Traffic is encrypted in transit. The database enforces row-level security, so a signed-in account can read and change only its own row and nothing else. The app ships with a publishable key that grants no access by itself; the key that could bypass those rules is never in the app.',
        'Passwords are hashed with bcrypt by the authentication service and are never stored, logged, or transmitted by this app.',
        'No system is perfect. If you believe your account has been compromised, change your password from Settings and contact us.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Your account is kept for as long as it exists. Ask us to delete it and the account row and the email attached to it are removed; local data goes when you uninstall the app.',
      ],
    },
    {
      heading: 'Your choices',
      points: [
        'Correct your name at any time in Settings.',
        'Change your password at any time; this signs out other devices.',
        'Ask for a copy of what we hold about you.',
        'Ask for your account to be deleted.',
      ],
      body: [`Every request can be made through ${CONTACT_URL} and is answered within 30 days.`],
    },
    {
      heading: 'Children',
      body: [
        'Shaikh’s is not intended for children under 13. If you are between 13 and 18, use it with the knowledge of a parent or guardian. If we learn that an account belongs to a child under 13, we will delete it.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'If this policy changes, the date at the top changes with it, and the change is visible in the app’s public source history. Anything that would meaningfully affect what happens to your data will be announced in the app before it takes effect.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions, requests, or a concern: ${CONTACT_URL}.`],
    },
  ],
};

export const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Terms of use',
  summary: 'The agreement between you and Shaikh’s, in plain language.',
  updated: '23 October 2026',
  sections: [
    {
      heading: 'Agreeing to these terms',
      body: [
        'By creating an account or using Shaikh’s, you agree to these terms and to the privacy policy. If you do not agree, please do not use the app.',
      ],
    },
    {
      heading: 'What Shaikh’s is',
      body: [
        'Shaikh’s is a personal tool for reducing compulsive use of social apps. Regain closes the endless parts of an app — the Reels feed, Shorts, Spotlight — while leaving messages and anything sent to you working.',
        'It is not a medical device, not therapy, and not a treatment for addiction. It cannot diagnose anything and it does not replace professional help. If these apps are costing you more than they give you, talking to someone is worth more than any setting.',
      ],
    },
    {
      heading: 'What it cannot promise',
      body: [
        'Blocking depends on recognising a screen inside another company’s app. Those apps change constantly. Regain is built to fail in the safe direction — if it does not recognise a screen, it does nothing — but that also means a new version of Instagram can quietly stop it working until the detector is updated.',
        'The app is provided as it is. There is no guarantee that a particular surface will be blocked, on a particular phone, on a particular day.',
      ],
    },
    {
      heading: 'Your account',
      points: [
        'Give an email address you control and a password you do not use anywhere else.',
        'You are responsible for activity on your account.',
        'One person, one account. Do not share credentials.',
        'Tell us if you believe someone else has access.',
      ],
    },
    {
      heading: 'Using the app fairly',
      points: [
        'Do not attempt to break, overload, or reverse-engineer the service other than as the law allows.',
        'Do not use the app to harass anyone or to break the law.',
        'Do not attempt to reach other people’s accounts or data.',
      ],
      body: ['Accounts used this way can be suspended or removed.'],
    },
    {
      heading: 'The accessibility permission',
      body: [
        'Regain asks for Android’s accessibility permission, which is powerful and is granted by you, not by us. It is used only to recognise the screens you have asked to close and to show the reminder over them. You can revoke it at any time in your phone’s settings; the app keeps working, it simply stops blocking.',
      ],
    },
    {
      heading: 'What is yours, what is ours',
      body: [
        'Your data is yours. The app’s design, code, and name belong to their author, and you are given a personal, non-transferable licence to use the app. You may not redistribute or sell it.',
      ],
    },
    {
      heading: 'Availability and changes',
      body: [
        'The app is provided free of charge and may change, be suspended, or be discontinued. Features may be added or removed. Where a change materially reduces what you get, we will say so in the app first.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        'To the extent the law allows, the author is not liable for indirect or consequential loss arising from use of the app, including time spent on an app that Regain failed to block. Nothing in these terms limits liability that cannot lawfully be limited.',
      ],
    },
    {
      heading: 'Ending it',
      body: [
        'You can stop using Shaikh’s at any time and ask for your account to be deleted. Accounts that break these terms may be closed.',
      ],
    },
    {
      heading: 'Which law applies',
      body: [
        'These terms are governed by the laws of India. Disputes are subject to the courts of Pune, Maharashtra.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these terms: ${CONTACT_URL}.`],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  privacy: PRIVACY,
  terms: TERMS,
};
