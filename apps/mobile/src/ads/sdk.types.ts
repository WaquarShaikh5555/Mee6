/**
 * The shape of the ad SDK, as a type only.
 *
 * `typeof import(...)` is erased at build time, so this file never pulls the
 * package into a bundle — which matters, because the package imports a
 * native-only React Native module that cannot exist on the web.
 */
export type AdsModule = typeof import('react-native-google-mobile-ads');
