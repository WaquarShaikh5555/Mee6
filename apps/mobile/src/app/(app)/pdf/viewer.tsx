import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { findText, PdfError, print, probe, renderPage, type RenderedPage, type TextMatch } from '@/pdf/engine';
import { shareFile } from '@/pdf/useToolRun';
import { baseName, formatBytes } from '@/pdf/format';

/**
 * The viewer.
 *
 * One page at a time, rendered by the phone's own PDF engine at twice the
 * screen width so text is crisp rather than merely visible. Swiping moves one
 * page; the pager is a list so a 300-page document still opens instantly.
 *
 * Search runs against the text layer and is drawn as boxes over the rendered
 * page — the same rectangles the engine computed, scaled to the picture.
 */
export default function PdfViewerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const { width } = useWindowDimensions();

  const uri = typeof params.uri === 'string' ? params.uri : '';
  const name = typeof params.name === 'string' ? params.name : 'Document';

  const [pages, setPages] = useState(0);
  const [size, setSize] = useState(0);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [wrongPassword, setWrongPassword] = useState(false);
  const [opening, setOpening] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const [current, setCurrent] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TextMatch[] | null>(null);

  const list = useRef<FlatList<number>>(null);

  useEffect(() => {
    if (!uri) {
      setOpening(false);
      setFailure('There is no file to show.');
      return;
    }

    let cancelled = false;
    setOpening(true);

    probe(uri, password || undefined)
      .then((result) => {
        if (cancelled) return;
        setPages(result.pages);
        setSize(result.sizeBytes);
        setNeedsPassword(false);
        setWrongPassword(false);
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const pdfError = error instanceof PdfError ? error : null;
        if (pdfError?.code === 'password') {
          setNeedsPassword(true);
          setWrongPassword(password.length > 0);
        } else {
          setFailure(pdfError?.message ?? 'This file could not be opened.');
        }
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uri, password]);

  // Search: a short pause after typing, so a page-wide scan runs once.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || pages === 0) {
      setMatches(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      findText(uri, text, password || undefined)
        .then((found) => {
          if (cancelled) return;
          setMatches(found);
          if (found.length > 0) {
            list.current?.scrollToIndex({ index: found[0]!.page, animated: true });
          }
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, uri, pages, password]);

  const boxes = useMemo(
    () =>
      (matches ?? [])
        .filter((match) => match.page === current)
        .flatMap((match) => match.rects ?? []),
    [matches, current],
  );

  const goTo = useCallback(
    (page: number) => {
      const target = Math.max(0, Math.min(pages - 1, page));
      list.current?.scrollToIndex({ index: target, animated: true });
      setCurrent(target);
    },
    [pages],
  );

  const doShare = async () => {
    const ok = await shareFile(uri, name, 'application/pdf');
    if (!ok) setFailure('Sharing is not available on this device.');
  };

  const doPrint = async () => {
    try {
      await print(uri, baseName(name), password || undefined);
    } catch (error) {
      setFailure(error instanceof PdfError ? error.message : 'Printing could not start.');
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.surfaceSunken }}
      edges={['top', 'bottom']}
    >
      {/* -------------------------------------------------------- header --- */}
      <View
        style={{
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
          gap: theme.space.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.separator,
          backgroundColor: theme.colors.canvas,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/pdf'))}
            accessibilityRole="button"
            accessibilityLabel="Close the viewer"
            hitSlop={theme.space.sm}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>

          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="subhead" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="tertiary" tabular>
              {pages > 0 ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : 'Opening…'}
              {size > 0 ? ` · ${formatBytes(size)}` : ''}
            </Text>
          </View>

          <Pressable
            onPress={() => void doPrint()}
            accessibilityRole="button"
            accessibilityLabel="Print"
            hitSlop={theme.space.sm}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="print-outline" size={21} color={theme.colors.text} />
          </Pressable>

          <Pressable
            onPress={() => void doShare()}
            accessibilityRole="button"
            accessibilityLabel="Share"
            hitSlop={theme.space.sm}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="share-outline" size={21} color={theme.colors.text} />
          </Pressable>
        </View>

        {pages > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              minHeight: 42,
              paddingHorizontal: theme.space.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find in document"
              placeholderTextColor={theme.colors.textTertiary}
              selectionColor={theme.colors.accent}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Find in document"
              style={{
                flex: 1,
                fontFamily: theme.fontFamily.sans,
                fontSize: theme.typography.subhead.fontSize,
                color: theme.colors.text,
                paddingVertical: theme.space.sm,
              }}
            />

            {searching ? <ActivityIndicator size="small" color={theme.colors.textTertiary} /> : null}

            {!searching && matches ? (
              <Text variant="caption" tone={matches.length === 0 ? 'warning' : 'secondary'} tabular>
                {matches.length === 0 ? 'none' : `${matches.length}`}
              </Text>
            ) : null}

            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={theme.space.md}
                accessibilityRole="button"
                accessibilityLabel="Clear the search"
              >
                <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ---------------------------------------------------------- body --- */}
      {needsPassword ? (
        <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="This document is locked"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            error={wrongPassword ? 'That password does not open this document.' : null}
            onSubmitEditing={() => setPassword((current) => current.trim())}
          />
          <Text variant="footnote" tone="tertiary">
            Used once, to open this file. It is not stored.
          </Text>
        </View>
      ) : failure ? (
        <View style={{ padding: theme.space.xl, gap: theme.space.md, alignItems: 'center' }}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.colors.danger} />
          <Text variant="body" tone="secondary" align="center">
            {failure}
          </Text>
          <Button label="Close" variant="secondary" size="md" onPress={() => router.back()} />
        </View>
      ) : opening ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text variant="footnote" tone="tertiary">
            Opening the document…
          </Text>
        </View>
      ) : pages === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" tone="tertiary">
            This document has no pages.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={list}
            data={Array.from({ length: pages }, (_, index) => index)}
            keyExtractor={(item) => String(item)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            extraData={current}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onMomentumScrollEnd={(event) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              setCurrent(Math.max(0, Math.min(pages - 1, next)));
            }}
            renderItem={({ item }) => (
              <View style={{ width, flex: 1, paddingVertical: theme.space.md }}>
                <PageImage
                  uri={uri}
                  page={item}
                  width={width}
                  password={password || undefined}
                  boxes={item === current ? boxes : []}
                  onFailure={setFailure}
                />
              </View>
            )}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space.md,
              paddingHorizontal: theme.space.lg,
              paddingVertical: theme.space.sm,
              borderTopWidth: 1,
              borderTopColor: theme.colors.separator,
              backgroundColor: theme.colors.canvas,
            }}
          >
            <Pressable
              onPress={() => goTo(current - 1)}
              disabled={current === 0}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
              style={{ opacity: current === 0 ? 0.3 : 1, padding: theme.space.sm }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </Pressable>

            <Text variant="footnote" tone="secondary" tabular>
              {current + 1} of {pages}
            </Text>

            <Pressable
              onPress={() => goTo(current + 1)}
              disabled={current >= pages - 1}
              accessibilityRole="button"
              accessibilityLabel="Next page"
              style={{ opacity: current >= pages - 1 ? 0.3 : 1, padding: theme.space.sm }}
            >
              <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ page --- */

type PageImageProps = {
  uri: string;
  page: number;
  width: number;
  password?: string;
  boxes: { x: number; y: number; w: number; h: number }[];
  onFailure: (message: string) => void;
};

function PageImage({ uri, page, width, password, boxes, onFailure }: PageImageProps) {
  const theme = useTheme();
  const [rendered, setRendered] = useState<RenderedPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRendered(null);

    // Render at twice the display width: crisp on a 3× screen, without holding
    // a 4000-pixel bitmap per page in memory.
    renderPage(uri, page, Math.round(width * 2), password)
      .then((result) => {
        if (!cancelled) setRendered(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onFailure(error instanceof PdfError ? error.message : 'This page could not be drawn.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uri, page, width, password, onFailure]);

  const aspect = rendered ? rendered.height / rendered.width : 1.294;
  const displayWidth = width - theme.space.lg;
  const displayHeight = displayWidth * aspect;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: displayWidth,
          height: displayHeight,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          ...theme.elevation.raised,
        }}
      >
        {rendered ? (
          <>
            <Image
              source={{ uri: `data:image/png;base64,${rendered.data}` }}
              style={{ width: displayWidth, height: displayHeight }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />

            {boxes.map((box, index) => (
              <View
                key={index}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: box.x * displayWidth,
                  top: box.y * displayHeight,
                  width: Math.max(box.w * displayWidth, 4),
                  height: Math.max(box.h * displayHeight, 6),
                  backgroundColor: theme.colors.warning,
                  opacity: 0.3,
                  borderRadius: 2,
                }}
              />
            ))}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        )}
      </View>
    </View>
  );
}

