import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { renderPage } from '../engine';

/**
 * One page of a document, as a picture.
 *
 * This is the difference between "a file was chosen" and "this is the file".
 * Every screen that shows a document slots one of these in: the picker card,
 * the rotate preview, the gallery of results.
 *
 * Rendered pages are cached by document, page and width — the viewer asks for
 * the same page repeatedly while scrolling, and rendering is the expensive part.
 */

type Rendered = { data: string; width: number; height: number };

const CACHE = new Map<string, Rendered>();
const MAX_CACHE = 24;

function keyFor(uri: string, page: number, width: number, password?: string): string {
  // The password itself never enters the key; only whether one was supplied.
  return `${uri}#${page}#${width}#${password ? 1 : 0}`;
}

function remember(key: string, value: Rendered): void {
  CACHE.set(key, value);
  while (CACHE.size > MAX_CACHE) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
}

export function PageThumb({
  uri,
  page = 0,
  width = 72,
  password,
  rotate = 0,
  onPress,
  label,
}: {
  uri: string;
  /** Zero-based. */
  page?: number;
  width?: number;
  password?: string;
  /** Degrees clockwise, so the rotate preview can show the real result. */
  rotate?: number;
  onPress?: () => void;
  label?: string;
}) {
  const theme = useTheme();
  const key = keyFor(uri, page, width, password);

  const [rendered, setRendered] = useState<Rendered | null>(() => CACHE.get(key) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const cached = CACHE.get(key);
    if (cached) {
      setRendered(cached);
      setFailed(false);
      return;
    }

    setRendered(null);
    setFailed(false);

    renderPage(uri, page, Math.max(160, Math.round(width * 2.5)), password)
      .then((result) => {
        if (cancelled) return;
        remember(key, result);
        setRendered(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [key, uri, page, width, password]);

  const upright = rendered
    ? Math.round((rendered.height / Math.max(1, rendered.width)) * width)
    : Math.round(width * 1.35);

  // A quarter turn swaps the box, so the rotated page still fits inside it
  // rather than being clipped on the corners.
  const turned = Math.abs(rotate) % 180 !== 0;
  const boxWidth = turned ? upright : width;
  const boxHeight = turned ? width : upright;

  const picture = rendered ? (
    <Image
      source={{ uri: `data:image/png;base64,${rendered.data}` }}
      accessibilityIgnoresInvertColors
      accessible
      accessibilityLabel={label ?? `Page ${page + 1}`}
      style={{
        width: turned ? boxHeight : boxWidth,
        height: turned ? boxWidth : boxHeight,
        transform: rotate ? [{ rotate: `${rotate}deg` }] : undefined,
      }}
      resizeMode="contain"
    />
  ) : failed ? (
    <Ionicons name="document-outline" size={Math.min(24, width / 2)} color={theme.colors.textTertiary} />
  ) : (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: theme.colors.textTertiary,
        opacity: 0.5,
      }}
    />
  );

  const body = (
    <View
      style={{
        width: boxWidth,
        height: boxHeight,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        borderWidth: 1,
        borderColor: theme.colors.separator,
      }}
    >
      {picture}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={label ?? `Preview page ${page + 1}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
