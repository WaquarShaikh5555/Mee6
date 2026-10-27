// Quiet the reanimated/gesture-handler native-module mocks under Jest.
require('react-native-gesture-handler/jestSetup');

// A hand-written stub rather than the package's own mock: loading the real
// module inside a render pulls in the native worklets registry, which does not
// exist under Jest. Nothing in this app animates with Reanimated, so a stub
// that renders plain views is enough.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, Image } = require('react-native');

  const Animated = {
    View,
    Text,
    ScrollView,
    Image,
    createAnimatedComponent: (component) => component,
  };

  const identity = (value) => value;

  const stub = {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => React.createRef(),
    useDerivedValue: (factory) => ({ value: factory() }),
    useAnimatedScrollHandler: () => ({}),
    useAnimatedGestureHandler: () => ({}),
    useAnimatedProps: () => ({}),
    withTiming: identity,
    withSpring: identity,
    withDelay: (_, value) => value,
    withRepeat: identity,
    withSequence: (...values) => values[values.length - 1],
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    makeMutable: (value) => ({ value }),
    isSharedValue: () => false,
    getUseOfValueInStyleWarning: () => '',
    Easing: { linear: identity, ease: identity, inOut: (fn) => fn, bezier: () => identity },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    Layout: { duration: () => ({}) },
  };

  // Anything else the library exposes — layout animations, adapters, hooks
  // added in a future version — becomes a harmless no-op rather than a crash
  // inside a render.
  return new Proxy(stub, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then' || typeof prop !== 'string') return undefined;
      return () => {};
    },
  });
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Icon fonts need a binary asset registry that Jest does not provide.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const makeIcon = (name) => {
    const Icon = ({ name: glyph, ...props }) =>
      React.createElement(Text, { ...props, accessibilityLabel: glyph }, glyph);
    Icon.displayName = name;
    Icon.glyphMap = new Proxy({}, { get: (_target, key) => String(key) });
    return Icon;
  };
  return new Proxy({}, { get: (_target, key) => makeIcon(String(key)) });
});

// Tests describe the app's behaviour, not this machine's configuration. A
// developer with a real `.env` (or a CI job that sets one) must get exactly the
// same results, so the Supabase variables start empty in every suite.
delete process.env.EXPO_PUBLIC_SUPABASE_URL;
delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.EXPO_PUBLIC_API_URL;
