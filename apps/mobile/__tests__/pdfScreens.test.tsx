/**
 * PDF Arena screens.
 *
 * The engine is absent here, exactly as it is in Expo Go and the web preview,
 * so these render the real screens against the honest "no engine" path: the
 * catalogue, the tool forms, the signature pad, and the viewer's empty state.
 * The tools' own arithmetic is covered by pdfCore and pdfSignature.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

// `PdfArena` is not registered in a Node test process, which is the same
// situation as Expo Go: the engine reports itself unavailable and the screens
// have to say so rather than crash.

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

import { ThemeProvider } from '@/theme/ThemeProvider';

import PdfArenaScreen from '@/app/(app)/pdf/index';
import { ResultCard } from '@/pdf/components/ResultCard';
import { ToolField } from '@/pdf/components/ToolControls';
import PdfToolScreen from '@/app/(app)/pdf/[toolId]';
import PdfViewerScreen from '@/app/(app)/pdf/viewer';

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockPush.mockClear();
  mockReplace.mockClear();
});

describe('the Arena', () => {
  it('lists every category and tool', async () => {
    await wrap(<PdfArenaScreen />);

    expect(screen.getAllByText('PDF Arena').length).toBeGreaterThan(0);
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Optimise')).toBeTruthy();
    expect(screen.getByText('Secure')).toBeTruthy();
    expect(screen.getByText('Convert')).toBeTruthy();

    expect(screen.getByText('Merge')).toBeTruthy();
    expect(screen.getByText('Watermark')).toBeTruthy();
    expect(screen.getByText('Compress')).toBeTruthy();
    expect(screen.getByText('To text')).toBeTruthy();
  });

  it('says plainly that the preview cannot process files', async () => {
    await wrap(<PdfArenaScreen />);
    expect(screen.getByText(/This preview can show the tools but not process files/)).toBeTruthy();
  });

  it('filters as you type, and can be cleared', async () => {
    await wrap(<PdfArenaScreen />);

    await fireEvent.changeText(screen.getByLabelText('Find a tool'), 'sign');

    expect(screen.queryByText('Merge')).toBeNull();
    expect(screen.getByText('Sign')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Clear the search'));
    expect(screen.getByText('Merge')).toBeTruthy();
  });

  it('offers a way out when a search finds nothing', async () => {
    await wrap(<PdfArenaScreen />);
    await fireEvent.changeText(screen.getByLabelText('Find a tool'), 'zzzzz');

    expect(screen.getByText(/Nothing called/)).toBeTruthy();
  });

  it('opens a tool when its tile is tapped', async () => {
    await wrap(<PdfArenaScreen />);
    await fireEvent.press(screen.getByLabelText('Merge. Several documents into one'));

    expect(mockPush).toHaveBeenCalledWith('/pdf/merge');
  });
});

describe('a tool screen', () => {
  it('asks for a document before it can run', async () => {
    mockParams.toolId = 'rotate';
    await wrap(<PdfToolScreen />);

    expect(screen.getAllByText('Rotate').length).toBeGreaterThan(0);
    expect(screen.getByText('Choose a document to begin.')).toBeTruthy();
    expect(screen.getByText('Choose a PDF from this phone')).toBeTruthy();
  });

  it('says what the watermark defaults to', async () => {
    mockParams.toolId = 'watermark';
    await wrap(<PdfToolScreen />);

    expect(screen.getAllByText('Watermark').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Confidential')).toBeTruthy();
  });

  it('draws a signature pad rather than asking for a photo', async () => {
    mockParams.toolId = 'sign';
    await wrap(<PdfToolScreen />);

    expect(screen.getByText('Sign here with your finger')).toBeTruthy();
    // Nothing can run before a document is chosen, signature or not.
    expect(screen.getByText('Choose a document to begin.')).toBeTruthy();
  });

  it('explains a tool with no settings at all', async () => {
    mockParams.toolId = 'repair';
    await wrap(<PdfToolScreen />);

    expect(screen.getByText('No settings')).toBeTruthy();
  });

  it('shows both version slots for Compare', async () => {
    mockParams.toolId = 'compare';
    await wrap(<PdfToolScreen />);

    expect(screen.getByText('Version A')).toBeTruthy();
    expect(screen.getByText('Version B')).toBeTruthy();
    expect(screen.getByText('Choose both documents to compare them.')).toBeTruthy();
  });

  it('survives an unknown tool id', async () => {
    mockParams.toolId = 'nonsense';
    await wrap(<PdfToolScreen />);

    expect(screen.getByText('There is no tool here')).toBeTruthy();
  });
});

describe('the viewer', () => {
  it('refuses to open nothing, politely', async () => {
    await wrap(<PdfViewerScreen />);

    await waitFor(() => expect(screen.getByText('There is no file to show.')).toBeTruthy());
  });
});

describe('what a tool hands back', () => {
  const base = {
    outputUri: 'file:///data/user/0/app/files/pdf-arena/Notes-images/page-001.png',
    outputName: 'page-001.png',
    sizeBytes: 402_000,
    pages: 3,
    summary: '3 images at 2.0×',
    warnings: [],
  };

  it('shows every picture instead of hiding them in an archive', async () => {
    await wrap(
      <ResultCard
        result={{
          ...base,
          outputUris: [
            'file:///data/user/0/app/files/pdf-arena/Notes-images/page-001.png',
            'file:///data/user/0/app/files/pdf-arena/Notes-images/page-002.png',
            'file:///data/user/0/app/files/pdf-arena/Notes-images/page-003.png',
          ],
          text: null,
        }}
        tookMs={1400}
        onShare={() => {}}
        onDone={() => {}}
      />,
    );

    expect(screen.getByText('3 pictures · tap one to look closer')).toBeTruthy();
  });

  it('shows extracted words in the card, ready to copy', async () => {
    await wrap(
      <ResultCard
        result={{
          ...base,
          outputName: 'Notes.txt',
          outputUris: ['file:///data/user/0/app/files/pdf-arena/Notes.txt'],
          text: 'The quick brown fox jumps over the lazy dog.',
        }}
        tookMs={900}
        onShare={() => {}}
        onDone={() => {}}
      />,
    );

    expect(screen.getByText('The text · long-press to copy')).toBeTruthy();
    expect(screen.getByText(/quick brown fox/)).toBeTruthy();
  });
});

describe('turning a page', () => {
  const rotation = { kind: 'rotation' as const, id: 'angle', label: 'Turn the pages', default: '90' };

  it('offers arrows, not a menu of degrees', async () => {
    const onChange = jest.fn();
    await wrap(
      <ToolField
        option={rotation}
        value="90"
        onChange={onChange}
        pageCount={4}
      />,
    );

    expect(screen.getByLabelText('Turn clockwise')).toBeTruthy();
    expect(screen.getByLabelText('Turn anticlockwise')).toBeTruthy();
    expect(screen.getByText('90° clockwise')).toBeTruthy();
  });

  it('turns a quarter at a time, both ways, and wraps', async () => {
    const onChange = jest.fn();
    await wrap(
      <ToolField option={rotation} value="90" onChange={onChange} pageCount={4} />,
    );

    await fireEvent.press(screen.getByLabelText('Turn clockwise'));
    expect(onChange).toHaveBeenLastCalledWith('180');

    onChange.mockClear();
    await fireEvent.press(screen.getByLabelText('Turn anticlockwise'));
    expect(onChange).toHaveBeenLastCalledWith('0');
  });

  it('wraps round rather than refusing to go further', async () => {
    const onChange = jest.fn();
    await wrap(
      <ToolField option={rotation} value="0" onChange={onChange} pageCount={4} />,
    );

    await fireEvent.press(screen.getByLabelText('Turn anticlockwise'));
    expect(onChange).toHaveBeenLastCalledWith('270');
  });

  it('says plainly when nothing would turn', async () => {
    await wrap(
      <ToolField option={rotation} value="0" onChange={() => {}} pageCount={4} />,
    );

    expect(screen.getByText('No turn yet')).toBeTruthy();
    expect(screen.getByText('Tap an arrow to turn the page.')).toBeTruthy();
  });
});
