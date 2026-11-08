import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { tapFeedback } from '@/lib/haptics';
import { pickSignaturePhoto } from '../documents';
import {
  DEFAULT_COLOUR,
  SIGNATURE_COLOURS,
  loadSavedSignatures,
  preparePhoto,
  rememberSignature,
  strokePath,
  type SavedSignature,
  type SignatureInk,
  type SignaturePayload,
  type Stroke,
} from '../signature';

/**
 * Making a signature.
 *
 * Full screen, because a signature is handwriting and handwriting needs room.
 * Two ways in — draw it, or photograph the one already on your ID — and both
 * end in the same place: a signature the editor can place on a page.
 *
 * The ink stays as strokes while it is being made, so a wrong stroke can be
 * undone instead of starting over.
 */

type Props = {
  visible: boolean;
  /** Rendered inside someone else's modal rather than opening its own. */
  inline?: boolean;
  /** The signature to start from, so "Change" opens what you had. */
  initial: SignaturePayload | null;
  onCancel: () => void;
  onDone: (ink: SignatureInk) => void;
};

export function SignatureSheet({ visible, inline = false, initial, onCancel, onDone }: Props) {
  const theme = useTheme();

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  const [photo, setPhoto] = useState<{ file: string; aspect: number } | null>(null);
  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);

  // Reopening starts from what the tool already holds, not from blank.
  useEffect(() => {
    if (!visible) return;

    setProblem(null);
    setBusy(false);

    if (initial?.kind === 'strokes') {
      setStrokes(initial.strokes);
      setColour(initial.colour);
      setPhoto(null);
    } else if (initial?.kind === 'photo') {
      setStrokes([]);
      setPhoto({ file: initial.file, aspect: initial.aspect });
    } else {
      setStrokes([]);
      setPhoto(null);
    }

    void loadSavedSignatures().then(setSaved);
  }, [visible, initial]);

  const hasInk = strokes.some((stroke) => stroke.length > 1);
  const ready = hasInk || photo !== null;

  async function usePhoto() {
    setProblem(null);
    const picked = await pickSignaturePhoto();
    if (!picked) return;

    setBusy(true);
    try {
      const prepared = await preparePhoto(picked.uri);
      if (!prepared) {
        setProblem('That picture could not be read. A JPG or PNG works best.');
        return;
      }

      setPhoto({
        file: prepared.uri,
        aspect: prepared.height / Math.max(1, prepared.width),
      });
      setStrokes([]);
    } finally {
      setBusy(false);
    }
  }

  function done() {
    if (!ready) return;

    const ink: SignatureInk = photo
      ? { kind: 'photo', file: photo.file, aspect: photo.aspect }
      : { kind: 'strokes', strokes, colour };

    if (keep) {
      // Fire and forget: a library that fails to update must not block signing.
      void rememberSignature({ ...ink, placements: [] });
    }

    onDone(ink);
  }

  const body = (
    <>
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space.lg,
            paddingVertical: theme.space.md,
          }}
        >
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={theme.space.md}
          >
            <Text variant="subhead" tone="secondary">
              Cancel
            </Text>
          </Pressable>

          <Text variant="subhead">Your signature</Text>

          <Pressable
            onPress={done}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Use this signature"
            accessibilityState={{ disabled: !ready }}
            hitSlop={theme.space.md}
          >
            <Text variant="subhead" tone={ready ? 'accent' : 'tertiary'}>
              Use
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {photo ? (
            <View
              style={{
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.separator,
                backgroundColor: '#FFFFFF',
                padding: theme.space.lg,
                minHeight: 220,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: photo.file }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityLabel="The signature taken from your photo"
                style={{ width: '100%', height: 190 }}
              />
            </View>
          ) : (
            <Pad
              strokes={strokes}
              colour={colour}
              onChange={setStrokes}
              height={260}
            />
          )}

          {problem ? (
            <Text variant="footnote" tone="danger">
              {problem}
            </Text>
          ) : null}

          {photo ? (
            <View style={{ flexDirection: 'row', gap: theme.space.md }}>
              <Button
                label="Take another"
                variant="secondary"
                size="md"
                icon="image-outline"
                onPress={() => void usePhoto()}
                fullWidth={false}
                style={{ flex: 1 }}
              />
              <Button
                label="Draw instead"
                variant="secondary"
                size="md"
                icon="pencil-outline"
                onPress={() => setPhoto(null)}
                fullWidth={false}
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <>
              <View style={{ gap: theme.space.sm }}>
                <Text variant="caption" tone="tertiary">
                  Ink
                </Text>

                <View style={{ flexDirection: 'row', gap: theme.space.md }}>
                  {SIGNATURE_COLOURS.map((option) => {
                    const active = option.value === colour;

                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          tapFeedback();
                          setColour(option.value);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={option.label}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 2,
                          borderColor: active ? theme.colors.accent : 'transparent',
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: option.value,
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: theme.space.md }}>
                <Button
                  label="Undo"
                  variant="secondary"
                  size="md"
                  icon="arrow-undo-outline"
                  onPress={() => setStrokes((current) => current.slice(0, -1))}
                  disabled={strokes.length === 0}
                  fullWidth={false}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Clear"
                  variant="secondary"
                  size="md"
                  icon="trash-outline"
                  onPress={() => setStrokes([])}
                  disabled={strokes.length === 0}
                  fullWidth={false}
                  style={{ flex: 1 }}
                />
              </View>

              <Pressable
                onPress={() => void usePhoto()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Use a photo of your signature"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.md,
                  padding: theme.space.lg,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.separator,
                  backgroundColor: theme.colors.surface,
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="images-outline" size={22} color={theme.colors.accent} />
                )}
                <View style={{ flex: 1 }}>
                  <Text variant="subhead">Use a photo instead</Text>
                  <Text variant="footnote" tone="tertiary">
                    Signed something on paper? Pick the picture and the paper is cut away.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            </>
          )}

          {saved.length > 0 ? (
            <View style={{ gap: theme.space.sm }}>
              <Text variant="caption" tone="tertiary">
                Saved on this phone
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
                {saved.map((entry) => {
                  const active = photo?.file === entry.uri;

                  return (
                    <Pressable
                      key={entry.uri}
                      onPress={() => {
                        setPhoto({ file: entry.uri, aspect: 0.38 });
                        setStrokes([]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Use this saved signature"
                      style={{
                        width: 120,
                        height: 66,
                        borderRadius: theme.radius.md,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? theme.colors.accent : theme.colors.separator,
                        backgroundColor: '#FFFFFF',
                        padding: theme.space.xs,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Image
                        source={{ uri: entry.uri }}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                        style={{ width: '100%', height: '100%' }}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <Pressable
            onPress={() => setKeep((current) => !current)}
            accessibilityRole="switch"
            accessibilityState={{ checked: keep }}
            accessibilityLabel="Keep this signature on this phone"
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.sm }}
          >
            <Ionicons
              name={keep ? 'checkbox' : 'square-outline'}
              size={20}
              color={keep ? theme.colors.accent : theme.colors.textTertiary}
            />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              Keep it on this phone, so next time is one tap.
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );

  // Two full-screen modals swapped in one frame is a modal Android drops on
  // the floor; one host switching its contents is reliable everywhere.
  if (inline) return body;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>{body}</SafeAreaView>
    </Modal>
  );
}

/* -------------------------------------------------------------------- pad --- */

/**
 * The drawing surface.
 *
 * Built on `PanResponder` rather than a gesture library: a signature is one
 * finger, and a pan responder is one finger's worth of machinery. The responder
 * is rebuilt only when the pad is measured, so a new `onChange` from the parent
 * can never drop a stroke mid-drag.
 */
function Pad({
  strokes,
  colour,
  onChange,
  height = 220,
}: {
  strokes: Stroke[];
  colour: string;
  onChange: (strokes: Stroke[]) => void;
  height?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const active = useRef(false);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A stray touch from the palm must not hand the pad to a scroll view.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (event) => {
          if (width <= 0) return;
          active.current = true;
          const point = {
            x: event.nativeEvent.locationX / width,
            y: event.nativeEvent.locationY / width,
          };
          changeRef.current([...strokesRef.current, [point]]);
        },

        onPanResponderMove: (event) => {
          if (!active.current || width <= 0) return;

          const current = strokesRef.current;
          if (current.length === 0) return;

          const point = {
            x: event.nativeEvent.locationX / width,
            y: event.nativeEvent.locationY / width,
          };

          const next = current.slice();
          next[next.length - 1] = [...next[next.length - 1]!, point];
          changeRef.current(next);
        },

        onPanResponderRelease: () => {
          active.current = false;
        },

        onPanResponderTerminate: () => {
          active.current = false;
        },
      }),
    // Rebuilt only on measure; the callbacks are read through refs.
    [width],
  );

  const empty = strokes.every((stroke) => stroke.length === 0);

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (next !== width) setWidth(next);
      }}
      style={{
        height,
        width: '100%',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {strokes.map((stroke, index) => (
            <Path
              key={`${index}-${stroke.length}`}
              d={strokePath(stroke, width, width)}
              stroke={colour}
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      ) : null}

      {empty ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.xs,
          }}
        >
          <Ionicons name="pencil" size={22} color="#B9B7B0" />
          <Text variant="footnote" style={{ color: '#8A8880' }}>
            Sign here, large and clear
          </Text>
        </View>
      ) : null}

      {/* The ruled line a paper form leaves for a signature. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: theme.space.xl,
          right: theme.space.xl,
          bottom: height * 0.22,
          height: 1,
          backgroundColor: '#D9D6CC',
        }}
      />

      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        {...pan.panHandlers}
      />
    </View>
  );
}
