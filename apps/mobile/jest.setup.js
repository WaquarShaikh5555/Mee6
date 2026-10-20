// Quiet the reanimated/gesture-handler native-module mocks under Jest.
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

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
