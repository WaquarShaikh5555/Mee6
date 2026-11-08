import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Badge } from '@/ui/Badge';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import type { Bookmark } from '../engine';
import { readBookmarks } from '../engine';
import { describeRangeError, parseRange } from '../ranges';
import {
  describePayload,
  inkBounds,
  isSigned,
  parsePayload,
  payloadJson,
  strokePath,
  strokeWeight,
  type SignatureInk,
  type SignaturePayload,
} from '../signature';
import { describeRotation, type Choice, type ToolOption } from '../catalog';
import { PageThumb } from './PageThumb';
import { SignaturePlacementSheet } from './SignaturePlacementSheet';
import { SignatureSheet } from './SignatureSheet';

/** Every option that is a control has a label; the note does not. */
type LabelledOption = Exclude<ToolOption, { kind: 'note' }>;

export type FieldProps = {
  option: LabelledOption;
  value: string;
  onChange: (value: string) => void;
  pageCount: number;
  /** The chosen document, for controls that read it (bookmarks). */
  uri?: string;
  password?: string;
  disabled?: boolean;
};

/** Renders one catalog option as the right control. */
export function ToolField({ option, ...rest }: Omit<FieldProps, 'option'> & { option: ToolOption }) {
  switch (option.kind) {
    case 'range':
      return <RangeField option={option} {...rest} />;
    case 'choice':
      return <ChoiceField option={option} {...rest} />;
    case 'text':
      return <TextFieldField option={option} {...rest} />;
    case 'number':
      return <NumberField option={option} {...rest} />;
    case 'slider':
      return <SliderField option={option} {...rest} />;
    case 'toggle':
      return <ToggleField option={option} {...rest} />;
    case 'order':
      return <OrderField option={option} {...rest} />;
    case 'bookmarks':
      return <BookmarksField option={option} {...rest} />;
    case 'rotation':
      return <RotationField option={option} {...rest} />;
    case 'colour':
      return <ColourField option={option} {...rest} />;
    case 'signature':
      return <SignatureField option={option} {...rest} />;
    case 'note':
      return <NoteBlock text={option.text} />;
  }
}

/* ------------------------------------------------------------------ range --- */

function RangeField({ option, value, onChange, pageCount }: FieldProps) {
  const result = useMemo(
    () => (pageCount > 0 && value.trim().length > 0 ? parseRange(value, pageCount) : null),
    [value, pageCount],
  );

  const error = result && !result.ok ? describeRangeError(result.error) : null;
  const hint =
    result && result.ok
      ? result.range.everything
        ? `All ${pageCount} pages`
        : `${result.range.pages.length} ${result.range.pages.length === 1 ? 'page' : 'pages'} selected`
      : (option as { hint?: string }).hint;

  return (
    <TextField
      label={option.label}
      value={value}
      onChangeText={onChange}
      placeholder="all"
      autoCapitalize="none"
      autoCorrect={false}
      error={error}
      hint={hint}
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
      accessibilityLabel={option.label}
    />
  );
}

/* ----------------------------------------------------------------- choice --- */

function ChoiceField({ option, value, onChange, uri, password }: FieldProps) {
  const theme = useTheme();
  const choices: Choice[] = (option as { choices: Choice[] }).choices;
  const selected = choices.find((choice) => choice.value === value) ?? choices[0];

  return (
    <View style={{ gap: theme.space.sm }}>
      <Text variant="subhead" tone="secondary">
        {option.label}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        {choices.map((choice) => {
          const active = choice.value === selected?.value;

          return (
            <Pressable
              key={choice.value}
              onPress={() => {
                if (!active) {
                  tapFeedback();
                  onChange(choice.value);
                }
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={choice.label}
              style={({ pressed }) => ({
                minHeight: 38,
                paddingHorizontal: theme.space.lg,
                borderRadius: theme.radius.full,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: active ? theme.colors.accent : theme.colors.border,
                backgroundColor: active
                  ? theme.colors.accent
                  : pressed
                    ? theme.colors.surfaceSunken
                    : theme.colors.surface,
              })}
            >
              <Text variant="subhead" tone={active ? 'onAccent' : 'secondary'}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected?.hint ? (
        <Text variant="footnote" tone="tertiary">
          {selected.hint}
        </Text>
      ) : null}

    </View>
  );
}

/* ------------------------------------------------------------------- text --- */

function TextFieldField({ option, value, onChange }: FieldProps) {
  const field = option as { placeholder?: string; maxLength?: number; secure?: boolean; hint?: string };

  return (
    <TextField
      label={option.label}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      secureTextEntry={field.secure}
      hint={field.hint}
      autoCapitalize={field.secure ? 'none' : 'sentences'}
      autoCorrect={!field.secure}
      accessibilityLabel={option.label}
    />
  );
}

/* ----------------------------------------------------------------- number --- */

function NumberField({ option, value, onChange }: FieldProps) {
  const theme = useTheme();
  const field = option as { min: number; max: number; suffix?: string };
  const current = Number.parseInt(value, 10) || field.min;

  const step = (delta: number) => {
    const next = Math.min(field.max, Math.max(field.min, current + delta));
    tapFeedback();
    onChange(String(next));
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.md,
        minHeight: theme.touchTarget,
      }}
    >
      <Text variant="subhead" tone="secondary">
        {option.label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <StepButton icon="remove" label={`Decrease ${option.label}`} onPress={() => step(-1)} />
        <Text variant="headline" tabular style={{ minWidth: 44, textAlign: 'center' }}>
          {current}
          {field.suffix ?? ''}
        </Text>
        <StepButton icon="add" label={`Increase ${option.label}`} onPress={() => step(1)} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={theme.space.xs}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
      })}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
    </Pressable>
  );
}

/* ----------------------------------------------------------------- slider --- */

function SliderField({ option, value, onChange }: FieldProps) {
  const theme = useTheme();
  const field = option as {
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const numeric = Number.parseFloat(value);
  const current = Number.isFinite(numeric) ? numeric : field.min;

  const commit = (next: number) => {
    const clamped = Math.min(field.max, Math.max(field.min, next));
    const stepped = Math.round(clamped / field.step) * field.step;
    onChange(String(Number(stepped.toFixed(2))));
  };

  const ratio = field.max === field.min ? 0 : (current - field.min) / (field.max - field.min);
  const knobX = Math.max(0, Math.min(trackWidth, ratio * trackWidth));

  return (
    <View style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="subhead" tone="secondary">
          {option.label}
        </Text>
        <Text variant="footnote" tone="tertiary" tabular>
          {field.format(current)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
        <Pressable
          onPress={() => {
            tapFeedback();
            commit(current - field.step);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Less ${option.label.toLowerCase()}`}
          hitSlop={theme.space.sm}
          style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="remove-circle-outline" size={22} color={theme.colors.textTertiary} />
        </Pressable>

        <Pressable
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (trackWidth <= 0) return;
            const share = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
            commit(field.min + share * (field.max - field.min));
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={option.label}
          accessibilityValue={{ text: field.format(current) }}
          style={{ flex: 1, height: 44, justifyContent: 'center' }}
        >
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(ratio * 100)}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.colors.accent,
              }}
            />
          </View>

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.max(0, knobX - 11),
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: theme.colors.accent,
              backgroundColor: theme.colors.surface,
            }}
          />
        </Pressable>

        <Pressable
          onPress={() => {
            tapFeedback();
            commit(current + field.step);
          }}
          accessibilityRole="button"
          accessibilityLabel={`More ${option.label.toLowerCase()}`}
          hitSlop={theme.space.sm}
          style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="add-circle-outline" size={22} color={theme.colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- toggle --- */

function ToggleField({ option, value, onChange }: FieldProps) {
  const theme = useTheme();
  const on = value === 'true';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.lg,
        minHeight: theme.touchTarget,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subhead">{option.label}</Text>
        {(option as { hint?: string }).hint ? (
          <Text variant="footnote" tone="tertiary">
            {(option as { hint?: string }).hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={on}
        onValueChange={(next) => onChange(next ? 'true' : 'false')}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ order --- */

/* ----------------------------------------------------------------- colour --- */

/** Ink for text drawn on a page. Swatches, because a colour is seen, not read. */
function ColourField({ option, value, onChange }: FieldProps) {
  const theme = useTheme();
  const swatches = (option as { swatches: { value: string; label: string }[] }).swatches;
  const selected = swatches.find((swatch) => swatch.value === value) ?? swatches[0];

  return (
    <View style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="subhead" tone="secondary">
          {option.label}
        </Text>
        <Text variant="footnote" tone="tertiary">
          {selected?.label}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.space.md }}>
        {swatches.map((swatch) => {
          const active = swatch.value === selected?.value;

          return (
            <Pressable
              key={swatch.value}
              onPress={() => {
                if (active) return;
                tapFeedback();
                onChange(swatch.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={swatch.label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: active ? theme.colors.accent : 'transparent',
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: swatch.value,
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.12)',
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- rotation --- */

/**
 * Turning a page, with the page.
 *
 * Three chips reading 90 / 180 / 270 are a menu of numbers; nobody thinks in
 * numbers about this. Arrows either side of the page turn it in the direction
 * they point, and the preview turns with them, so what the button will do is
 * visible before it is pressed.
 */
function RotationField({ option, value, onChange, uri, password }: FieldProps) {
  const theme = useTheme();
  const degrees = ((Number(value) % 360) + 360) % 360;

  const turn = (direction: 1 | -1) => {
    tapFeedback();
    onChange(String((degrees + direction * 90 + 360) % 360));
  };

  const arrow = (
    direction: 1 | -1,
    label: string,
    icon: 'arrow-undo' | 'arrow-redo',
  ) => (
    <Pressable
      onPress={() => turn(direction)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Turns the pages ${direction === 1 ? 'clockwise' : 'anticlockwise'} by a quarter turn`}
      hitSlop={theme.space.sm}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: pressed ? theme.colors.accent : theme.colors.border,
        backgroundColor: pressed ? theme.colors.accentSubtle : theme.colors.surface,
      })}
    >
      <Ionicons
        name={`${icon}-outline`}
        size={26}
        color={theme.colors.text}
        style={{ transform: direction === 1 ? undefined : [{ scaleX: -1 }] }}
      />
    </Pressable>
  );

  return (
    <View style={{ gap: theme.space.md }}>
      <Text variant="subhead" tone="secondary">
        {option.label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
        {arrow(-1, 'Turn anticlockwise', 'arrow-undo')}

        <View style={{ flex: 1, alignItems: 'center' }}>
          {uri ? (
            <PageThumb
              uri={uri}
              page={0}
              width={128}
              rotate={degrees}
              password={password}
              label={`Page 1, turned ${describeRotation(degrees)}`}
            />
          ) : (
            <View
              style={{
                width: 128,
                height: 172,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="caption" tone="tertiary" align="center">
                Choose a document
              </Text>
            </View>
          )}
        </View>

        {arrow(1, 'Turn clockwise', 'arrow-redo')}
      </View>

      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text variant="subhead" tabular>
          {degrees === 0 ? 'No turn yet' : describeRotation(degrees)}
        </Text>
        <Text variant="caption" tone="tertiary" align="center">
          {degrees === 0
            ? 'Tap an arrow to turn the page.'
            : 'The page shown is what will be written. Tap an arrow again to keep turning.'}
        </Text>
      </View>
    </View>
  );
}

function OrderField({ option, value, onChange, pageCount }: FieldProps) {
  const theme = useTheme();

  const order = value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((page) => Number.isFinite(page) && page >= 1 && page <= pageCount);

  const toggle = (page: number) => {
    tapFeedback();
    const next = order.includes(page) ? order.filter((entry) => entry !== page) : [...order, page];
    onChange(next.join(','));
  };

  const pages = Array.from({ length: Math.min(pageCount, 400) }, (_, index) => index + 1);

  return (
    <View style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="subhead" tone="secondary">
          {option.label}
        </Text>
        <Text variant="footnote" tone="tertiary" tabular>
          {order.length} {order.length === 1 ? 'page' : 'pages'}
        </Text>
      </View>

      {pageCount === 0 ? (
        <Text variant="footnote" tone="tertiary">
          Choose a document first, then tap the pages in the order you want them.
        </Text>
      ) : (
        <>
          {order.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs }}>
              {order.map((page, index) => (
                <Pressable
                  key={`${page}-${index}`}
                  onPress={() => toggle(page)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove page ${page}, currently number ${index + 1}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: theme.space.sm,
                    paddingVertical: theme.space.xs,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.colors.accentSubtle,
                  }}
                >
                  <Text variant="caption" style={{ color: theme.colors.onAccentSubtle }}>
                    {index + 1}.
                  </Text>
                  <Text variant="footnote" style={{ color: theme.colors.onAccentSubtle }}>
                    p{page}
                  </Text>
                  <Ionicons name="close" size={12} color={theme.colors.onAccentSubtle} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {pages.map((page) => {
              const at = order.indexOf(page);
              const active = at >= 0;

              return (
                <Pressable
                  key={page}
                  onPress={() => toggle(page)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Page ${page}${active ? `, position ${at + 1}` : ''}`}
                  style={{
                    width: 42,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.accent : theme.colors.border,
                    backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                  }}
                >
                  <Text variant="footnote" tone={active ? 'onAccent' : 'secondary'} tabular>
                    {page}
                  </Text>
                  {active ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 3,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.colors.brass,
                      }}
                    >
                      <Text variant="caption" style={{ color: theme.colors.surface, fontSize: 9 }}>
                        {at + 1}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {pageCount > 400 ? (
            <Text variant="footnote" tone="tertiary">
              Showing the first 400 pages. Type the order into “Pages” style ranges for a longer file.
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
            <SmallAction
              label="All in order"
              onPress={() => onChange(pages.join(','))}
            />
            <SmallAction
              label="Reverse"
              onPress={() => onChange([...pages].reverse().join(','))}
            />
            <SmallAction label="Clear" onPress={() => onChange('')} />
          </View>
        </>
      )}
    </View>
  );
}

function SmallAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={theme.space.sm}>
      <Text variant="footnote" tone="accent">
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------- bookmarks --- */

function BookmarksField({ value, onChange, uri, password, pageCount }: FieldProps) {
  const theme = useTheme();
  const [entries, setEntries] = useState<Bookmark[]>(() => parseBookmarks(value));
  const [loading, setLoading] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Push edits upward so the engine always sees the current list.
  const publish = (next: Bookmark[]) => {
    setEntries(next);
    onChange(JSON.stringify(next));
  };

  useEffect(() => {
    if (!uri || pageCount === 0) return;
    if (loadedFor.current === uri) return;
    loadedFor.current = uri;

    let cancelled = false;
    setLoading(true);

    readBookmarks(uri, password)
      .then((existing) => {
        if (cancelled) return;
        // Existing bookmarks are offered, not imposed: they only fill an empty list.
        if (existing.length > 0 && parseBookmarks(value).length === 0) {
          setEntries(existing);
          onChange(JSON.stringify(existing));
        }
      })
      .catch(() => {
        // A document with no outline is the normal case, not an error.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The document is what matters here; running once per file is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, pageCount]);

  const add = () => {
    tapFeedback();
    publish([...entries, { title: '', page: 1 }]);
  };

  return (
    <View style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="subhead" tone="secondary">
          Contents
        </Text>
        {loading ? <Text variant="caption" tone="tertiary">Reading…</Text> : null}
      </View>

      {entries.length === 0 ? (
        <Text variant="footnote" tone="tertiary">
          No entries yet. Add one below, or start from the document&apos;s own outline.
        </Text>
      ) : null}

      {entries.map((entry, index) => (
        <View
          key={index}
          style={{
            gap: theme.space.sm,
            padding: theme.space.md,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.separator,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Text variant="caption" tone="tertiary" tabular>
              {index + 1}
            </Text>
            <TextInput
              value={entry.title}
              onChangeText={(title) => {
                const next = entries.slice();
                next[index] = { ...entry, title };
                publish(next);
              }}
              placeholder="Chapter name"
              placeholderTextColor={theme.colors.textTertiary}
              selectionColor={theme.colors.accent}
              accessibilityLabel={`Bookmark ${index + 1} title`}
              style={{
                flex: 1,
                fontFamily: theme.fontFamily.sans,
                fontSize: theme.typography.body.fontSize,
                color: theme.colors.text,
                paddingVertical: theme.space.sm,
              }}
            />
            <Pressable
              onPress={() => publish(entries.filter((_, at) => at !== index))}
              hitSlop={theme.space.md}
              accessibilityRole="button"
              accessibilityLabel={`Remove bookmark ${index + 1}`}
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Text variant="footnote" tone="tertiary">
              Goes to page
            </Text>
            <StepButton
              icon="remove"
              label="Previous page"
              onPress={() => {
                const next = entries.slice();
                next[index] = { ...entry, page: Math.max(1, entry.page - 1) };
                publish(next);
              }}
            />
            <Text variant="subhead" tabular style={{ minWidth: 28, textAlign: 'center' }}>
              {entry.page}
            </Text>
            <StepButton
              icon="add"
              label="Next page"
              onPress={() => {
                const next = entries.slice();
                next[index] = { ...entry, page: Math.min(Math.max(pageCount, 1), entry.page + 1) };
                publish(next);
              }}
            />
          </View>
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: theme.space.lg }}>
        <SmallAction label="Add a bookmark" onPress={add} />
        {entries.length > 0 ? (
          <SmallAction label="Remove all" onPress={() => publish([])} />
        ) : null}
      </View>
    </View>
  );
}

function parseBookmarks(value: string): Bookmark[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const title = String((entry as { title?: unknown }).title ?? '');
        const page = Number((entry as { page?: unknown }).page ?? 1);
        return { title, page: Number.isFinite(page) && page >= 1 ? Math.round(page) : 1 };
      })
      .filter((entry): entry is Bookmark => entry !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- signature --- */

function SignatureField({ value, onChange, pageCount, uri, password }: FieldProps) {
  const theme = useTheme();
  const [payload, setPayload] = useState<SignaturePayload | null>(() => parsePayload(value));
  // One modal, two stages: the pad, then the page. Two modals at once is what
  // made "Use" appear to do nothing on Android.
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'draw' | 'place'>('draw');

  // The tool screen owns the value; this keeps the local copy honest when the
  // screen clears the options after a run.
  useEffect(() => {
    if ((value ?? '') === '') setPayload(null);
  }, [value]);

  const ink: SignatureInk | null = payload
    ? payload.kind === 'photo'
      ? { kind: 'photo', file: payload.file, aspect: payload.aspect }
      : { kind: 'strokes', strokes: payload.strokes, colour: payload.colour }
    : null;

  const commit = (next: SignaturePayload | null) => {
    setPayload(next);
    onChange(payloadJson(next));
  };

  if (!uri) {
    return (
      <View style={{ gap: theme.space.sm }}>
        <Text variant="subhead" tone="secondary">
          Signature
        </Text>
        <Text variant="footnote" tone="tertiary">
          Choose the document first — the signature is placed on its pages.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="subhead" tone="secondary">
          Signature
        </Text>
        {isSigned(payload) ? <Badge label="Placed" tone="success" /> : null}
      </View>

      {payload && ink ? (
        <Pressable
          onPress={() => {
            setStage('place');
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Change where the signature goes"
          style={{
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.separator,
            backgroundColor: '#FFFFFF',
            padding: theme.space.md,
            height: 96,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InkThumb ink={ink} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => {
          setStage('draw');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={payload ? 'Change the signature' : 'Add your signature'}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          padding: theme.space.lg,
          borderRadius: theme.radius.lg,
          borderWidth: 1.5,
          borderStyle: payload ? 'solid' : 'dashed',
          borderColor: pressed ? theme.colors.accent : theme.colors.border,
          backgroundColor: pressed ? theme.colors.accentSubtle : theme.colors.surface,
        })}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSubtle,
          }}
        >
          <Ionicons
            name={payload ? 'pencil' : 'create-outline'}
            size={20}
            color={theme.colors.onAccentSubtle}
          />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead">{payload ? 'Change the signature' : 'Tap to sign'}</Text>
          <Text variant="footnote" tone="tertiary">
            {payload
              ? 'Draw again, or use a photo of your signature.'
              : 'Opens a pad with ink colours, or a photo of a signature on paper.'}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </Pressable>

      <Text variant="footnote" tone={isSigned(payload) ? 'accent' : 'tertiary'}>
        {isSigned(payload) ? describePayload(payload) : 'No signature placed yet.'}
      </Text>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
          {stage === 'draw' ? (
            <SignatureSheet
              inline
              visible
              initial={payload}
              onCancel={() => setOpen(false)}
              onDone={(next) => {
                commit({ ...next, placements: payload?.placements ?? [] });
                // Straight to placement: a signature nobody placed signs nothing.
                setStage('place');
              }}
            />
          ) : (
            <SignaturePlacementSheet
              inline
              visible
              ink={ink}
              uri={uri}
              password={password}
              pageCount={pageCount}
              initial={payload?.placements ?? []}
              onCancel={() => setOpen(false)}
              onDone={(placements) => {
                if (payload) commit({ ...payload, placements });
                setOpen(false);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** The signature as it was made, drawn to fit the card. */
function InkThumb({ ink }: { ink: SignatureInk }) {
  const bounds = useMemo(
    () => (ink.kind === 'strokes' ? inkBounds(ink.strokes) : { x: 0, y: 0, w: 1, h: ink.aspect }),
    [ink],
  );

  if (ink.kind === 'photo') {
    return (
      <Image
        source={{ uri: ink.file }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityLabel="Your signature"
        style={{ width: '100%', height: '100%' }}
      />
    );
  }

  return (
    <Svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      style={{ width: '100%', height: '100%' }}
    >
      {ink.strokes.map((stroke, index) => (
        <Path
          key={index}
          d={strokePath(stroke, 1, 1)}
          stroke={ink.colour}
          // Proportional to the ink's own width. A fixed number with
          // `non-scaling-stroke` would be measured in pixels, and 0.006 of a
          // pixel is nothing at all — a signature that drew fine and vanished.
          strokeWidth={strokeWeight(bounds.w)}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------------- note --- */

export function NoteBlock({ text }: { text: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.space.sm,
        padding: theme.space.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.infoSubtle,
      }}
    >
      <Ionicons name="information-circle-outline" size={18} color={theme.colors.info} />
      <Text variant="footnote" style={{ flex: 1, color: theme.colors.info }}>
        {text}
      </Text>
    </View>
  );
}
