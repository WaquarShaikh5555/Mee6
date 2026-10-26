import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import type { PdfTool, PdfToolId } from '@/pdf/catalog';
import { defaultsFor, findTool } from '@/pdf/catalog';
import { pickerFor, type PickedFile } from '@/pdf/documents';
import { isEmptySignature, parseSignature } from '@/pdf/signature';
import { describeRangeError, parseRange } from '@/pdf/ranges';
import { mimeFor, outputNameFor } from '@/pdf/format';
import { usePdfDocument } from '@/pdf/useDocument';
import { shareFile, useToolRun } from '@/pdf/useToolRun';
import { deleteOutput, type PdfResult } from '@/pdf/engine';
import { ComparePanel } from '@/pdf/components/ComparePanel';
import { ErrorCard, ResultCard } from '@/pdf/components/ResultCard';
import { FileCard } from '@/pdf/components/FileCard';
import { PageThumb } from '@/pdf/components/PageThumb';
import { ToolField } from '@/pdf/components/ToolControls';

/** The verb on the button. A tool screen should read as an action. */
const ACTIONS: Record<PdfToolId, string> = {
  merge: 'Merge documents',
  split: 'Split the pages',
  delete: 'Delete those pages',
  rearrange: 'Build in this order',
  rotate: 'Rotate the pages',
  sign: 'Sign the document',
  watermark: 'Add the watermark',
  'page-numbers': 'Number the pages',
  bookmarks: 'Save the bookmarks',
  compress: 'Compress the file',
  grayscale: 'Make it grayscale',
  repair: 'Repair the file',
  compare: 'Compare versions',
  protect: 'Lock the file',
  unlock: 'Remove the password',
  metadata: 'Write the details',
  pdf2img: 'Make images',
  img2pdf: 'Build the PDF',
  pdf2zip: 'Make one file per page',
  'extract-images': 'Extract the images',
  pdf2text: 'Save the text',
};

export default function PdfToolScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ toolId?: string }>();
  const tool = useMemo(() => findTool(String(params.toolId ?? '')), [params.toolId]);

  if (!tool) {
    return (
      <Screen>
        <ScreenHeader title="PDF Arena" />
        <Card style={{ gap: theme.space.sm, marginTop: theme.space.xl }}>
          <Text variant="headline">There is no tool here</Text>
          <Text variant="footnote" tone="tertiary">
            The link may be out of date. Open PDF Arena and choose a tool from the list.
          </Text>
          <Button
            label="Open PDF Arena"
            variant="secondary"
            size="md"
            onPress={() => router.replace('/pdf')}
          />
        </Card>
      </Screen>
    );
  }

  if (tool.id === 'compare') {
    return (
      <Screen>
        <ScreenHeader title="PDF Arena" subtitle={tool.name} />
        <View style={{ gap: theme.space.sm, paddingTop: theme.space.lg, paddingBottom: theme.space.xl }}>
          <Text variant="display" serif>
            {tool.name}
          </Text>
          <Text variant="body" tone="secondary">
            {tool.detail}
          </Text>
        </View>
        <ComparePanel tool={tool} />
      </Screen>
    );
  }

  return <ProcessingToolScreen tool={tool} />;
}

function ProcessingToolScreen({ tool }: { tool: PdfTool }) {
  const theme = useTheme();
  const router = useRouter();

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [options, setOptions] = useState<Record<string, string>>(() => defaultsFor(tool));
  const [shared, setShared] = useState<string | null>(null);
  // Images are not PDFs: probing one would report a failure that is not one.
  const doc = usePdfDocument(tool.input === 'images' ? null : (files[0] ?? null));
  const { state, run, reset } = useToolRun();

  const multiple = tool.input === 'pdfs';
  const images = tool.input === 'images';

  const preview = useCallback(() => {
    const file = files[0];
    if (!file) return;

    router.push({
      pathname: '/pdf/viewer',
      params: { uri: file.uri, name: file.name, password: doc.password || undefined },
    });
  }, [files, doc.password, router]);

  const choose = useCallback(async () => {
    const picked = await pickerFor(tool.input)();
    if (picked.length === 0) return;

    setFiles((current) => (multiple ? dedupe([...current, ...picked]) : picked.slice(0, 1)));
    setShared(null);
  }, [multiple, tool.input]);

  const setOption = useCallback((id: string, value: string) => {
    setOptions((current) => ({ ...current, [id]: value }));
  }, []);

  // Unlocking needs the password twice in principle — once to open the file and
  // once to name it — but never twice in practice: the file's own password is
  // the one the tool wants.
  useEffect(() => {
    if (tool.id !== 'unlock') return;
    if (!doc.password || options.password) return;
    setOption('password', doc.password);
  }, [doc.password, options.password, setOption, tool.id]);

  const blocker = useMemo(
    () => whatIsMissing(tool, files, doc, options),
    [tool, files, doc, options],
  );

  const extension =
    tool.id === 'split' && options.mode === 'separate' ? 'zip' : tool.output.extension;
  const outputName = outputNameFor(files[0]?.name ?? 'document', tool.output.suffix, extension);

  const runNow = () => {
    setShared(null);
    void run({
      toolId: tool.id,
      inputUris: files.map((file) => file.uri),
      password: doc.password.length > 0 ? doc.password : undefined,
      options,
      outputName,
    });
  };

  const share = async (result: PdfResult) => {
    try {
      const ok = await shareFile(result.outputUri, result.outputName, mimeFor(result.outputName));
      if (!ok) {
        setShared('Sharing is not available on this device. Open the file instead.');
      }
    } catch {
      setShared('The share sheet could not open. The file is saved in the app.');
    }
  };

  const done = state.status === 'done';
  const running = state.status === 'running';

  return (
    <Screen
      footer={
        done ? undefined : (
          <View style={{ gap: theme.space.sm }}>
            {blocker ? (
              <Text variant="footnote" tone="tertiary" align="center" accessibilityLiveRegion="polite">
                {blocker}
              </Text>
            ) : null}
            <Button
              label={running ? 'Working…' : ACTIONS[tool.id]}
              icon={running ? undefined : 'play'}
              onPress={runNow}
              loading={running}
              disabled={Boolean(blocker)}
              accessibilityHint={blocker ?? undefined}
            />
          </View>
        )
      }
    >
      <ScreenHeader title="PDF Arena" subtitle={tool.name} />

      <View style={{ gap: theme.space.sm, paddingTop: theme.space.lg, paddingBottom: theme.space.xl }}>
        <Text variant="display" serif>
          {tool.name}
        </Text>
        <Text variant="body" tone="secondary">
          {tool.detail}
        </Text>
      </View>

      {done ? (
        <>
          <ResultCard
            result={state.result}
            tookMs={state.tookMs}
            beforeBytes={files[0]?.size || doc.probe?.sizeBytes || 0}
            onShare={() => void share(state.result)}
            onOpen={() =>
              router.push({
                pathname: '/pdf/viewer',
                params: { uri: state.result.outputUri, name: state.result.outputName },
              })
            }
            onDone={reset}
            onDelete={() => {
              // A gallery result is many files; every one of them goes.
              void Promise.all(
                state.result.outputUris.map((uri) => deleteOutput(uri).catch(() => {})),
              ).finally(reset);
            }}
          />

          {shared ? (
            <Text variant="footnote" tone="warning" style={{ paddingTop: theme.space.md }}>
              {shared}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ gap: theme.space.md }}>
            {files.length === 0 ? (
              <FileCard
                file={null}
                emptyHint={images ? 'Choose photos from this phone' : 'Choose a PDF from this phone'}
                icon={images ? 'images-outline' : 'document-text-outline'}
                onChoose={() => void choose()}
              />
            ) : (
              files.map((file, index) => (
                <FileCard
                  key={`${file.uri}-${index}`}
                  file={file}
                  label={multiple ? `Document ${index + 1}` : images ? 'Images' : 'Document'}
                  pageCount={index === 0 ? doc.pageCount : 0}
                  sizeBytes={index === 0 ? (doc.probe?.sizeBytes ?? file.size) : file.size}
                  loading={index === 0 && doc.loading}
                  error={index === 0 ? doc.error : null}
                  needsPassword={index === 0 && doc.needsPassword}
                  wrongPassword={index === 0 && doc.wrongPassword}
                  onChoose={() => void choose()}
                  onClear={() => setFiles((current) => current.filter((_, at) => at !== index))}
                  onSubmitPassword={doc.submitPassword}
                  onPreview={index === 0 && !images && doc.pageCount > 0 ? preview : undefined}
                  thumbnail={
                    index === 0 && !images && doc.pageCount > 0 ? (
                      <PageThumb
                        uri={file.uri}
                        width={46}
                        password={doc.password || undefined}
                        onPress={preview}
                        label={`Preview ${file.name}`}
                      />
                    ) : undefined
                  }
                />
              ))
            )}

            {images && files.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                {files.slice(0, 8).map((file) => (
                  <Image
                    key={file.uri}
                    source={{ uri: file.uri }}
                    accessibilityIgnoresInvertColors
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.surfaceSunken,
                    }}
                  />
                ))}
                {files.length > 8 ? (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: theme.radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.surfaceSunken,
                    }}
                  >
                    <Text variant="footnote" tone="secondary">
                      +{files.length - 8}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {files.length > 0 ? (
              <Pressable
                onPress={() => void choose()}
                accessibilityRole="button"
                accessibilityLabel={multiple ? 'Add another document' : 'Choose another file'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.colors.accent} />
                <Text variant="footnote" tone="accent">
                  {multiple ? 'Add another document' : 'Choose a different file'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {doc.needsPassword ? null : (
            <Card style={{ marginTop: theme.space.lg, gap: theme.space.xl }}>
              {tool.options.length === 0 ? (
                <View style={{ gap: theme.space.xs }}>
                  <Text variant="headline">No settings</Text>
                  <Text variant="footnote" tone="tertiary">
                    This tool does one thing. The defaults are the whole story.
                  </Text>
                </View>
              ) : (
                tool.options.map((option, index) => (
                  <ToolField
                    key={option.kind === 'note' ? `note-${index}` : option.id}
                    option={option}
                    value={option.kind === 'note' ? '' : (options[option.id] ?? '')}
                    onChange={(value) => {
                      if (option.kind !== 'note') setOption(option.id, value);
                    }}
                    pageCount={doc.pageCount}
                    uri={files[0]?.uri}
                    password={doc.password || undefined}
                  />
                ))
              )}
            </Card>
          )}

          {state.status === 'error' ? (
            <View style={{ paddingTop: theme.space.lg }}>
              <ErrorCard
                error={state.error}
                onDismiss={reset}
                onRepair={() => router.replace('/pdf/repair')}
              />
            </View>
          ) : null}
        </>
      )}

      <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.xs }}>
        <Text variant="caption" tone="tertiary">
          The original is never changed — this writes a new file.
        </Text>
        <Text variant="caption" tone="tertiary">
          Everything happens on this phone. Nothing is uploaded.
        </Text>
      </View>
    </Screen>
  );
}

/** The one sentence that explains why the button is not ready yet. */
function whatIsMissing(
  tool: PdfTool,
  files: PickedFile[],
  doc: ReturnType<typeof usePdfDocument>,
  options: Record<string, string>,
): string | null {
  if (tool.input === 'pdfs' && files.length < 2) return 'Choose at least two documents to merge.';
  if (tool.input === 'images' && files.length === 0) return 'Choose at least one image.';
  if (tool.input !== 'images' && files.length === 0) return 'Choose a document to begin.';

  if (tool.input !== 'images' && files.length > 0) {
    if (doc.loading) return 'Reading the document…';
    if (doc.error) return 'That document could not be read.';
    if (doc.needsPassword) return 'Enter the document password above.';
  }

  if (tool.id === 'unlock') {
    if (doc.probe && !doc.probe.encrypted) return 'This document is not locked.';
    if (!options.password) return 'Enter the password this file was locked with.';
  }

  if (tool.id === 'protect' && (options.password ?? '').length < 4) {
    return 'Choose a password of at least 4 characters.';
  }

  for (const option of tool.options) {
    if (option.kind === 'range' && doc.pageCount > 0) {
      const value = (options[option.id] ?? '').trim();
      if (value.length === 0) continue;

      const parsed = parseRange(value, doc.pageCount);
      if (!parsed.ok) return describeRangeError(parsed.error);
    }

    if (option.kind === 'order' && (options[option.id] ?? '').length === 0) {
      return 'Tap the pages in the order you want them.';
    }

    if (option.kind === 'signature' && isEmptySignature(parseSignature(options.signature))) {
      return 'Draw your signature first.';
    }

    if (option.kind === 'text' && option.id === 'text' && tool.id === 'watermark') {
      if ((options.text ?? '').trim().length === 0) return 'Write the watermark text.';
    }
  }

  return null;
}

function dedupe(files: PickedFile[]): PickedFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.uri)) return false;
    seen.add(file.uri);
    return true;
  });
}
