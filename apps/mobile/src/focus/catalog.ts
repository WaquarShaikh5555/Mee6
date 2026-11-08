/**
 * What Focus Mode knows how to block.
 *
 * Each app is split into the parts that pull you in and the parts that are
 * actually useful. The split is the whole idea: Instagram without the Reels
 * feed is still how your friends reach you, and YouTube without Shorts is
 * still a library.
 *
 * `blockable: true` sections get a switch. The others are listed as "always
 * available" so it is obvious that Focus Mode is not asking you to quit — only to
 * put the slot machine down.
 */

import type { Ionicons } from '@expo/vector-icons';

export type FocusSection = {
  id: string;
  name: string;
  /** One line explaining what turning this off actually does. */
  detail: string;
  /** Whether this section is blocked when Focus Mode is switched on by default. */
  defaultBlocked: boolean;
  /**
   * False for the parts that stay usable: messages, search, long videos.
   * These are shown, not hidden, so the trade-off is visible.
   */
  blockable: boolean;
};

export type FocusApp = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Android package name, used by the native detector. */
  androidPackage: string;
  /** URL scheme, used to tell whether the app is installed on iOS. */
  iosScheme: string;
  /** Shown under the app name on the list of apps. */
  blurb: string;
  sections: FocusSection[];
};

export const FOCUS_APPS: readonly FocusApp[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'logo-instagram',
    androidPackage: 'com.instagram.android',
    iosScheme: 'instagram',
    blurb: 'Reels and Explore sleep. Messages stay awake.',
    sections: [
      {
        id: 'reels',
        name: 'Reels feed',
        detail: 'The endless vertical scroll. A reel sent to you still opens.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'explore',
        name: 'Explore',
        detail: 'The grid that is never finished.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'story-feed',
        name: 'Story tray',
        detail: 'The row of circles at the top of the feed.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'feed',
        name: 'Home feed',
        detail: 'Photos and posts from people you follow.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'direct',
        name: 'Direct messages',
        detail: 'Always available. Nobody gets stranded because of a focus rule.',
        defaultBlocked: false,
        blockable: false,
      },
      {
        id: 'shared-reels',
        name: 'Reels sent to you',
        detail: 'One reel from a friend opens and plays. The scroll below it does not.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'logo-youtube',
    androidPackage: 'com.google.android.youtube',
    iosScheme: 'youtube',
    blurb: 'Long videos stay. Shorts go.',
    sections: [
      {
        id: 'shorts',
        name: 'Shorts',
        detail: 'The vertical feed, including its shelf on the home screen.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'home',
        name: 'Home recommendations',
        detail: 'The personalised wall you open without deciding anything.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'videos',
        name: 'Long videos',
        detail: 'Anything you chose to watch. Always available.',
        defaultBlocked: false,
        blockable: false,
      },
      {
        id: 'search',
        name: 'Search and subscriptions',
        detail: 'Deliberate watching. Always available.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    icon: 'logo-snapchat',
    androidPackage: 'com.snapchat.android',
    iosScheme: 'snapchat',
    blurb: 'The camera sleeps. Your friends do not.',
    sections: [
      {
        id: 'camera',
        name: 'Camera',
        detail: 'Opens the app on the camera, ready to post. The pull to perform.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'spotlight',
        name: 'Spotlight',
        detail: 'The public feed of short videos.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'stories',
        name: 'Stories',
        detail: 'Friends’ stories, one after another.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'chat',
        name: 'Chat',
        detail: 'Always available.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'logo-tiktok',
    androidPackage: 'com.zhiliaoapp.musically',
    iosScheme: 'snssdk1128',
    blurb: 'The For You feed sleeps. Messages and search stay.',
    sections: [
      {
        id: 'for-you',
        name: 'For You feed',
        detail: 'The algorithm’s main stage.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'following',
        name: 'Following feed',
        detail: 'Still a vertical scroll, just from people you chose.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'live',
        name: 'Live',
        detail: 'Endless live rooms.',
        defaultBlocked: false,
        blockable: true,
      },
      {
        id: 'messages',
        name: 'Messages',
        detail: 'Always available.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'logo-discord',
    androidPackage: 'com.discord',
    iosScheme: 'discord',
    blurb: 'Servers close. Direct messages stay open.',
    sections: [
      {
        id: 'servers',
        name: 'Servers',
        detail: 'The unread badges and the channels behind them.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'discovery',
        name: 'Server discovery',
        detail: 'Browsing for new communities to join.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'dms',
        name: 'Direct messages',
        detail: 'Always available.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
  {
    id: 'x',
    name: 'X',
    icon: 'logo-twitter',
    androidPackage: 'com.twitter.android',
    iosScheme: 'twitter',
    blurb: 'The timeline closes. Messages and search stay.',
    sections: [
      {
        id: 'timeline',
        name: 'For You timeline',
        detail: 'The algorithmic feed.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'explore',
        name: 'Explore and trends',
        detail: 'The rabbit hole with a news headline on top.',
        defaultBlocked: true,
        blockable: true,
      },
      {
        id: 'messages',
        name: 'Messages',
        detail: 'Always available.',
        defaultBlocked: false,
        blockable: false,
      },
    ],
  },
] as const;

/** Looks up an app, or `undefined` when the id is not in the catalog. */
export function findApp(appId: string | undefined): FocusApp | undefined {
  if (!appId) return undefined;
  return FOCUS_APPS.find((app) => app.id === appId);
}

/** Looks up one section inside one app. */
export function findSection(app: FocusApp, sectionId: string | undefined): FocusSection | undefined {
  if (!sectionId) return undefined;
  return app.sections.find((section) => section.id === sectionId);
}

/** The sections that can be switched, i.e. everything except "always available". */
export function blockableSections(app: FocusApp): FocusSection[] {
  return app.sections.filter((section) => section.blockable);
}
