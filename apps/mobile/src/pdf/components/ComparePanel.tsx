import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import type { PdfTool } from '../catalog';
import { pickerFor, type PickedFile } from '../documents';
import { compare, PdfError, type CompareReport } from '../engine';
import { usePdfDocument } from '../useDocument';
import { ErrorCard } from './ResultCard';
import { FileCard } from './FileCard';

type CompareState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; report: CompareReport }
  | { status: 'error'; error: PdfError };

/**
 * Compare, end to end.
 *
 * Both versions are read on the phone and matched page by page. The report is
 * the deliverable — there is no output file — so the result stays on screen
 * rather than being saved somewhere to find later.
 */
export function ComparePanel({ tool }: { tool: PdfTool }) {
  const theme = useTheme();
  const [first, setFirst] = useState<PickedFile | null>(null);
  const [second, setSecond] = useState<PickedFile | null>(null);
  const [state, setState] = useState<CompareState>({ status: 'idle' });

  const a = usePdfDocument(first);
  const b = usePdfDocument(second);

  const ready =
    Boolean(first && second) &&
    !a.loading &&
    !b.loading &&
    !a.needsPassword &&
    !b.needsPassword &&
    !a.error &&
    !b.error;

  const chooseFirst = async () => {
    const picked = await pickerFor('pdf')();
    if (picked[0]) {
      setFirst(picked[0]);
      setState({ status: 'idle' });
    }
  };

  const chooseSecond = async () => {
    const picked = await pickerFor('pdf')();
    if (picked[0]) {
      setSecond(picked[0]);
      setState({ status: 'idle' });
    }
  };

  const run = async () => {
    if (!first || !second) return;
    setState({ status: 'running' });

    try {
      const report = await compare(first.uri, second.uri, a.password || undefined, b.password || undefined);
      setState({ status: 'done', report });
    } catch (error) {
      setState({
        status: 'error',
        error:
          error instanceof PdfError
            ? error
            : new PdfError('unknown', 'The two documents could not be compared.'),
      });
    }
  };

  return (
    <View style={{ gap: theme.space.lg }}>
      <FileCard
        key={`a-${first?.uri ?? 'none'}`}
        file={first}
        label="Version A"
        pageCount={a.pageCount}
        sizeBytes={a.probe?.sizeBytes ?? first?.size ?? 0}
        loading={a.loading}
        error={a.error}
        needsPassword={a.needsPassword}
        wrongPassword={a.wrongPassword}
        emptyHint="Choose the first version"
        onChoose={chooseFirst}
        onClear={first ? () => setFirst(null) : undefined}
        onSubmitPassword={a.submitPassword}
      />

      <FileCard
        key={`b-${second?.uri ?? 'none'}`}
        file={second}
        label="Version B"
        pageCount={b.pageCount}
        sizeBytes={b.probe?.sizeBytes ?? second?.size ?? 0}
        loading={b.loading}
        error={b.error}
        needsPassword={b.needsPassword}
        wrongPassword={b.wrongPassword}
        emptyHint="Choose the second version"
        onChoose={chooseSecond}
        onClear={second ? () => setSecond(null) : undefined}
        onSubmitPassword={b.submitPassword}
      />

      <Button
        label={state.status === 'running' ? 'Comparing…' : 'Compare versions'}
        icon="git-compare-outline"
        onPress={() => void run()}
        loading={state.status === 'running'}
        disabled={!ready}
      />

      {!ready && !a.error && !b.error ? (
        <Text variant="footnote" tone="tertiary" align="center">
          Choose both documents to compare them.
        </Text>
      ) : null}

      {state.status === 'error' ? (
        <ErrorCard error={state.error} onDismiss={() => setState({ status: 'idle' })} />
      ) : null}

      {state.status === 'done' ? <Report report={state.report} /> : null}

      <Text variant="caption" tone="tertiary">
        Pages are rendered at the same size and compared pixel by pixel. A page with a different
        scan but the same words will read as changed.
      </Text>
    </View>
  );
}

function Report({ report }: { report: CompareReport }) {
  const theme = useTheme();
  const changed = report.differences.filter((difference) => difference.changed > 0.01).length;

  return (
    <Card style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Ionicons
          name={changed === 0 ? 'checkmark-circle' : 'git-compare-outline'}
          size={20}
          color={changed === 0 ? theme.colors.success : theme.colors.accent}
        />
        <Text variant="headline" style={{ flex: 1 }}>
          {changed === 0
            ? 'The pages match'
            : `${changed} of ${report.differences.length} pages differ`}
        </Text>
      </View>

      <Text variant="footnote" tone="tertiary" tabular>
        {report.pagesA} pages in A · {report.pagesB} pages in B
      </Text>

      <View style={{ gap: theme.space.sm }}>
        {report.differences.map((difference) => {
          const missing = difference.changed >= 1;
          const percent = Math.round(Math.min(1, difference.changed) * 100);

          return (
            <View
              key={difference.page}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Text variant="footnote" tone="tertiary" tabular style={{ width: 54 }}>
                Page {difference.page}
              </Text>

              <View
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.surfaceSunken,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.max(percent, missing ? 100 : 0)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: missing
                      ? theme.colors.textTertiary
                      : percent > 1
                        ? theme.colors.warning
                        : theme.colors.success,
                  }}
                />
              </View>

              <Text
                variant="caption"
                tone={missing ? 'tertiary' : percent > 1 ? 'warning' : 'success'}
                style={{ width: 76, textAlign: 'right' }}
              >
                {missing ? 'not in both' : percent > 1 ? `${percent}% changed` : 'same'}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
