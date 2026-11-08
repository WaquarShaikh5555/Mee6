import { Image } from 'react-native';

/**
 * The monogram: a hexagon broken into two interlocking pieces, teal above and
 * brass below, with the gap between them drawing the S.
 *
 * One component so the mark is never re-scaled by hand or re-drawn in another
 * style. The source image is 512 px at 4× — enough for the largest use, small
 * enough not to bloat the bundle.
 */
const MARK = require('../../assets/images/logo-mark.png');

const SIZES = {
  sm: 22,
  md: 34,
  lg: 56,
  xl: 88,
} as const;

export function BrandMark({
  size = 'md',
  accessibilityLabel,
}: {
  size?: keyof typeof SIZES;
  accessibilityLabel?: string;
}) {
  const dimension = SIZES[size];

  return (
    <Image
      source={MARK}
      style={{ width: dimension, height: dimension }}
      resizeMode="contain"
      accessibilityRole={accessibilityLabel ? 'image' : 'none'}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
    />
  );
}
