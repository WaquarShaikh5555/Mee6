import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { renderPage } from '../engine';
import { strokePath, type Placement, type SignatureInk, type Stroke } from '../signature';

/**
 * Putting the signature on the page.
 *
 * The page is shown as the reader will see it, and the signature sits on top at
 * the size and angle you give it: drag with one finger, pinch with two to size
 * it, twist to tilt it. Whatever is on screen is what gets written — the same
 * fractions are handed to the engine, which does the arithmetic for the page's
 * own rotation.
 *
 * Placement is per page, so one signature can go on page 1 and page 7 at
 * different spots, the way signing a contract actually works.
 */

type Props = {
  visible: boolean;
  ink: SignatureInk | null;
  uri: string;
  password?: string;
  pageCount: number;
  /** Where to start: what the tool already holds, or a sensible first spot. */
  initial: Placement[];
  onCancel: () => void;
  onDone: (placements: Placement[]) => void;
};

const DEFAULT_WIDTH = 0.34;
/** Where a fresh signature lands: above the middle, clear of the top edge. */
const DEFAULT_Y = 0.22;

export function SignaturePlacementSheet({
  visible,
  ink,
  uri,
  password,
  pageCount,
  initial,
  onCancel,
  onDone,
}: Props) {
  const theme = useTheme();

  const [page, setPage] = useState(1);
  /** Pages the person removed a signature from: do not quietly put it back. */
  const cleared = useRef<Set<number>>(new Set());
  const [placements, setPlacements] = useState<Placement[]>(initial);
  const [pageImage, setPageImage] = useState<{ data: string; width: number; height: number } | null>(
    null,
  );
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Opening starts from what the tool holds, and lands on the first page with
  // a signature on it (or page 1).
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!visible) return;

    setPlacements(initialRef.current);
    setPage(initialRef.current[0]?.page ?? 1);
  }, [visible]);

  // The page under the editor.
  useEffect(() => {
    if (!visible || !uri || pageCount === 0) return;

    let cancelled = false;
    setPageImage(null);

    renderPage(uri, page - 1, 900, password)
      .then((rendered) => {
        if (!cancelled) setPageImage(rendered);
      })
      .catch(() => {
        if (!cancelled) setPageImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, uri, page, pageCount, password]);

  const current = placements.find((placement) => placement.page === page) ?? null;

  const setCurrent = useCallback(
    (next: Placement | null) => {
      setPlacements((existing) => {
        const others = existing.filter((placement) => placement.page !== page);
        return next ? [...others, next].sort((a, b) => a.page - b.page) : others;
      });
    },
    [page],
  );

  // The first placement happens on open, and only then: reacting to the list
  // would put a signature back the moment someone removed it.
  const opened = useRef(false);
  useEffect(() => {
    if (!visible) {
      opened.current = false;
      return;
    }

    if (opened.current) return;
    opened.current = true;

    cleared.current = new Set();

    if (initialRef.current.length === 0) {
      setPlacements([{ page: 1, x: 0.5, y: DEFAULT_Y, w: DEFAULT_WIDTH, rotation: 0 }]);
      setPage(1);
    }
  }, [visible]);

  /**
   * Turning to a page puts the signature on it, the way picking up a page means
   * you are about to sign it. Clearing it on a page is a decision, so that page
   * is remembered as cleared and left alone.
   */
  const goToPage = (next: number) => {
    setPage(next);

    if (cleared.current.has(next)) return;
    if (placements.some((placement) => placement.page === next)) return;

    setPlacements((existing) =>
      [...existing, { page: next, x: 0.5, y: DEFAULT_Y, w: DEFAULT_WIDTH, rotation: 0 }].sort(
        (a, b) => a.page - b.page,
      ),
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space.lg,
            paddingVertical: theme.space.md,
          }}
        >
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={theme.space.md}>
            <Text variant="subhead" tone="secondary">
              Cancel
            </Text>
          </Pressable>

          <Text variant="subhead">Place your signature</Text>

          <Pressable
            onPress={() => onDone(placements)}
            disabled={placements.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Place the signature"
            accessibilityState={{ disabled: placements.length === 0 }}
            hitSlop={theme.space.md}
          >
            <Text variant="subhead" tone={placements.length > 0 ? 'accent' : 'tertiary'}>
              Place
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: theme.space.lg }}>
          <PageStage
            ink={ink}
            image={pageImage}
            placement={current}
            box={box}
            onLayout={setBox}
            onChange={setCurrent}
          />
        </View>

        <View style={{ gap: theme.space.md, padding: theme.space.lg }}>
          <Text variant="caption" tone="tertiary" align="center">
            Drag to move · pinch to size · twist to tilt
          </Text>

          {pageCount > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.xs }}
            >
              {Array.from({ length: Math.min(pageCount, 200) }, (_, index) => index + 1).map((number) => {
                const signed = placements.some((placement) => placement.page === number);
                const active = number === page;

                return (
                  <Pressable
                    key={number}
                    onPress={() => goToPage(number)}
                    accessibilityRole="button"
                    accessibilityLabel={`Page ${number}${signed ? ', signed' : ''}`}
                    accessibilityState={{ selected: active }}
                    style={{
                      minWidth: 40,
                      height: 40,
                      paddingHorizontal: theme.space.sm,
                      borderRadius: theme.radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: active
                        ? theme.colors.accent
                        : signed
                          ? theme.colors.accent
                          : theme.colors.border,
                      backgroundColor: active
                        ? theme.colors.accent
                        : signed
                          ? theme.colors.accentSubtle
                          : theme.colors.surface,
                    }}
                  >
                    <Text
                      variant="footnote"
                      tabular
                      tone={active ? 'onAccent' : signed ? 'accent' : 'secondary'}
                    >
                      {number}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <Button
              label={current ? 'Remove here' : 'Add here'}
              variant="secondary"
              size="md"
              icon={current ? 'trash-outline' : 'add'}
              onPress={() => {
                if (current) cleared.current.add(page);
                else cleared.current.delete(page);

                setCurrent(
                  current ? null : { page, x: 0.5, y: DEFAULT_Y, w: DEFAULT_WIDTH, rotation: 0 },
                );
              }}
              fullWidth={false}
              style={{ flex: 1 }}
            />
            {pageCount > 1 ? (
              <Button
                label="On every page"
                variant="secondary"
                size="md"
                icon="copy-outline"
                onPress={() => {
                  const template = current ?? placements[0];
                  if (!template) return;

                  cleared.current = new Set();
                  setPlacements(
                    Array.from({ length: pageCount }, (_, index) => ({
                      ...template,
                      page: index + 1,
                    })),
                  );
                }}
                fullWidth={false}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ stage --- */

/**
 * The page, and the signature on it.
 *
 * `PanResponder` again, but here two fingers mean something: the distance
 * between them is the size, the angle between them is the tilt. Deltas are
 * applied incrementally, so adding a second finger mid-drag does not jump the
 * signature across the page.
 */
function PageStage({
  ink,
  image,
  placement,
  box,
  onLayout,
  onChange,
}: {
  ink: SignatureInk | null;
  image: { data: string; width: number; height: number } | null;
  placement: Placement | null;
  box: { width: number; height: number };
  onLayout: (box: { width: number; height: number }) => void;
  onChange: (placement: Placement) => void;
}) {
  const theme = useTheme();

  const placementRef = useRef(placement);
  placementRef.current = placement;

  const boxRef = useRef(box);
  boxRef.current = box;

  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const gesture = useRef<{ count: number; x: number; y: number; distance: number; angle: number }>({
    count: 0,
    x: 0,
    y: 0,
    distance: 0,
    angle: 0,
  });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (event) => {
          remember(event.nativeEvent.touches);
        },

        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches;
          const current = placementRef.current;
          if (!current || touches.length === 0) return;

          const previous = gesture.current;
          const size = boxRef.current;
          if (size.width <= 0 || size.height <= 0) return;

          // The fingers changed: take a fresh baseline instead of guessing.
          if (touches.length !== previous.count) {
            remember(touches);
            return;
          }

          if (touches.length >= 2) {
            const [a, b] = [touches[0]!, touches[1]!];
            const distance = Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
            const angle = (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI;

            if (previous.distance > 0) {
              const scale = distance / previous.distance;
              const turned = angle - previous.angle;

              changeRef.current({
                ...current,
                w: clamp(current.w * scale, 0.05, 1),
                rotation: normalise(current.rotation + turned),
              });
            }

            gesture.current = {
              count: touches.length,
              x: midpoint(touches).x,
              y: midpoint(touches).y,
              distance,
              angle,
            };
            return;
          }

          const touch = touches[0]!;
          const dx = (touch.pageX - previous.x) / size.width;
          const dy = (touch.pageY - previous.y) / size.height;

          changeRef.current({
            ...current,
            x: clamp(current.x + dx, 0, 1),
            y: clamp(current.y + dy, 0, 1),
          });

          gesture.current = {
            count: touches.length,
            x: touch.pageX,
            y: touch.pageY,
            distance: 0,
            angle: 0,
          };
        },

        onPanResponderRelease: () => {
          gesture.current = { count: 0, x: 0, y: 0, distance: 0, angle: 0 };
        },

        onPanResponderTerminate: () => {
          gesture.current = { count: 0, x: 0, y: 0, distance: 0, angle: 0 };
        },
      }),
    [],
  );

  function remember(touches: readonly { pageX: number; pageY: number }[]) {
    if (touches.length >= 2) {
      const [a, b] = [touches[0]!, touches[1]!];
      gesture.current = {
        count: touches.length,
        x: midpoint(touches).x,
        y: midpoint(touches).y,
        distance: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY),
        angle: (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI,
      };
    } else {
      const touch = touches[0];
      gesture.current = {
        count: touches.length,
        x: touch?.pageX ?? 0,
        y: touch?.pageY ?? 0,
        distance: 0,
        angle: 0,
      };
    }
  }

  // The page fills the stage, keeping its shape.
  const aspect = image ? image.width / image.height : 0.72;
  const stageWidth = box.width;
  const stageHeight = stageWidth / aspect;
  const fits = stageHeight <= box.height || box.height === 0;
  const pageWidth = fits ? stageWidth : box.height * aspect;
  const pageHeight = fits ? stageHeight : box.height;

  const inkAspect =
    ink?.kind === 'photo' ? Math.max(0.05, ink.aspect) : strokeAspect(ink);

  return (
    <View
      onLayout={(event) =>
        onLayout({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      {pageWidth > 0 ? (
        <View
          {...pan.panHandlers}
          style={{
            width: pageWidth,
            height: pageHeight,
            backgroundColor: '#FFFFFF',
            borderRadius: theme.radius.sm,
            overflow: 'hidden',
          }}
        >
          {image ? (
            <Image
              source={{ uri: `data:image/png;base64,${image.data}` }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="caption" tone="tertiary">
                Loading the page…
              </Text>
            </View>
          )}

          {placement && ink ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: pageWidth * placement.x - (pageWidth * placement.w) / 2,
                top: pageHeight * placement.y - (pageWidth * placement.w * inkAspect) / 2,
                width: pageWidth * placement.w,
                height: pageWidth * placement.w * inkAspect,
                transform: [{ rotate: `${placement.rotation}deg` }],
              }}
            >
              {ink.kind === 'photo' ? (
                <Image
                  source={{ uri: ink.file }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  style={{
                    width: '100%',
                    height: '100%',
                    borderWidth: 1,
                    borderColor: theme.colors.accent,
                  }}
                />
              ) : (
                <InkPreview strokes={ink.strokes} colour={ink.colour} />
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** The drawn signature, scaled into whatever box the placement asks for. */
function InkPreview({ strokes, colour }: { strokes: Stroke[]; colour: string }) {
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const stroke of strokes) {
      for (const point of stroke) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
    return {
      minX,
      minY,
      width: Math.max(0.001, maxX - minX),
      height: Math.max(0.001, maxY - minY),
    };
  }, [strokes]);

  // The SVG is drawn in the ink's own units, then stretched to the box by the
  // viewBox — no maths beyond the bounds above.
  return (
    <Svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      style={{ width: '100%', height: '100%' }}
    >
      {strokes.map((stroke, index) => (
        <Path
          key={index}
          d={strokePath(stroke, 1, 1)}
          stroke={colour}
          strokeWidth={0.008}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </Svg>
  );
}

function strokeAspect(ink: SignatureInk | null): number {
  if (!ink || ink.kind !== 'strokes') return 0.4;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of ink.strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX) || maxX <= minX) return 0.4;
  return Math.max(0.05, (maxY - minY) / (maxX - minX));
}

function midpoint(touches: readonly { pageX: number; pageY: number }[]): { x: number; y: number } {
  const a = touches[0]!;
  const b = touches[1]!;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function normalise(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}
