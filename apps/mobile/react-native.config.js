/**
 * Autolinking exceptions.
 *
 * `react-native-google-mobile-ads` is installed but **not linked into the
 * Android build** while we chase a launch crash that appeared in the same
 * version that introduced it. Everything else stays linked.
 *
 * Why exclude it here instead of uninstalling:
 *
 *  - Metro still resolves the package, so `src/ads/sdk.ts` keeps its single
 *    `require` inside a try/catch. Uninstalling would make Metro fail to
 *    resolve that require at bundle time — a build error, not a caught
 *    exception.
 *  - The native side is what we want gone: no TurboModule, no Fabric
 *    component, no `MobileAdsInitProvider` starting at process launch.
 *  - `adsAvailable()` then reports "no ads", the unlock card disappears and
 *    every PDF tool is free — the graceful path the code already has for the
 *    web preview and for Expo Go.
 *
 * Putting ads back is deleting the `platforms` key below. The test that pins
 * the app id to `app.json` stays asleep while the module is unlinked, so it
 * cannot go stale in the meantime.
 */

module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
