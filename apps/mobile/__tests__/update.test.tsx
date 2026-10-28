/**
 * The update prompt.
 *
 * Two halves: the arithmetic that decides whether an update exists, and the
 * card that offers it. The interesting assertions are about restraint — the
 * button must refuse to be pressed for five seconds, and "Later" must never be.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/theme/ThemeProvider';
import { UpdateSheet } from '@/update/UpdateSheet';
import type { UpdatePhase } from '@/update/useUpdate';
import { compareVersions, isNewer, parseFeed, sizeFor, type UpdateInfo } from '@/update/version';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

const info: UpdateInfo = {
  version: '0.9.0',
  url: 'https://github.com/example/releases/download/apk/shaikhs.apk',
  size: 63_076_672,
  notes: ['Updates install from inside the app.', 'Signing got a real editor.'],
};

const available: UpdatePhase = { status: 'available', info, installed: '0.8.0' };

describe('versions', () => {
  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('0.9.0', '0.9.0')).toBe(0);
    expect(compareVersions('0.8.9', '0.9.0')).toBe(-1);
    expect(compareVersions('2', '2.0.0')).toBe(0);
    expect(compareVersions('0.9', '0.9.0.1')).toBe(-1);
  });

  it('only offers an update when the feed is strictly newer', () => {
    expect(isNewer('0.9.0', '0.8.0')).toBe(true);
    expect(isNewer('0.8.0', '0.8.0')).toBe(false);
    expect(isNewer('0.7.9', '0.8.0')).toBe(false);
  });

  it('reads a feed, and refuses anything unreadable', () => {
    expect(parseFeed({ version: '0.9.0', url: 'https://x/y.apk', size: 10, notes: ['a'] })).toEqual({
      version: '0.9.0',
      url: 'https://x/y.apk',
      size: 10,
      notes: ['a'],
    });

    // Rubbish: an empty version, a link that is not https, no object at all.
    expect(parseFeed({ version: '', url: 'https://x/y.apk' })).toBeNull();
    expect(parseFeed({ version: '1.0.0', url: 'http://x/y.apk' })).toBeNull();
    expect(parseFeed(null)).toBeNull();
    expect(parseFeed('0.9.0')).toBeNull();
  });

  it('survives a feed with the wrong types in it', () => {
    const parsed = parseFeed({ version: ' 1.2.3 ', url: ' https://x/y.apk ', size: -4, notes: [1, 'ok'] });

    expect(parsed).toEqual({ version: '1.2.3', url: 'https://x/y.apk', size: 0, notes: ['ok'] });
  });

  it('says how big a download is', () => {
    expect(sizeFor(63_076_672)).toBe('60.2 MB');
    expect(sizeFor(900)).toBe('1 KB');
    expect(sizeFor(0)).toBe('');
  });
});

describe('the update card', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens on the version and what changed', async () => {
    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={available}
          onLater={() => {}}
          onUpdate={() => {}}
          onGrant={() => {}}
        />,
      );
    });

    expect(screen.getByText("Shaikh's 0.9.0 is ready")).toBeTruthy();
    expect(screen.getByText(/You have 0\.8\.0/)).toBeTruthy();
    expect(screen.getByText('Updates install from inside the app.')).toBeTruthy();
  });

  it('holds the Update button for five seconds while the card is read', async () => {
    const onUpdate = jest.fn();

    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={available}
          onLater={() => {}}
          onUpdate={onUpdate}
          onGrant={() => {}}
        />,
      );
    });

    expect(screen.getByText('Update in 5s')).toBeTruthy();

    await fireEvent.press(screen.getByText('Update in 5s'));
    expect(onUpdate).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('Update in 3s')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    expect(screen.getByText('Update now')).toBeTruthy();

    await fireEvent.press(screen.getByText('Update now'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('lets someone leave at any moment, including during the countdown', async () => {
    const onLater = jest.fn();

    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={available}
          onLater={onLater}
          onUpdate={() => {}}
          onGrant={() => {}}
        />,
      );
    });

    await fireEvent.press(screen.getByText('Later'));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('shows a real percentage while it downloads', async () => {
    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={{
            status: 'downloading',
            info,
            progress: 0.42,
            received: 26_000_000,
            total: 63_076_672,
          }}
          onLater={() => {}}
          onUpdate={() => {}}
          onGrant={() => {}}
        />,
      );
    });

    expect(screen.getByText('Downloading… 42%')).toBeTruthy();
    expect(screen.getByText(/42% · 24.8 MB of 60.2 MB/)).toBeTruthy();
  });

  it('explains the one-time permission instead of failing', async () => {
    const onGrant = jest.fn();

    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={{ status: 'permission', info, download: 'file:///tmp/app.apk' }}
          onLater={() => {}}
          onUpdate={() => {}}
          onGrant={onGrant}
        />,
      );
    });

    expect(screen.getByText('One setting first')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open the setting'));
    expect(onGrant).toHaveBeenCalled();
  });

  it('says what went wrong, and that nothing changed', async () => {
    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={{ status: 'failed', info, message: 'The download stopped early.' }}
          onLater={() => {}}
          onUpdate={() => {}}
          onGrant={() => {}}
        />,
      );
    });

    expect(screen.getByText('The download stopped early.')).toBeTruthy();
    expect(screen.getByText(/Nothing on the phone has changed/)).toBeTruthy();

    // A failure is not a dead end: the same card offers a second attempt.
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('starts over when the failed download is retried', async () => {
    const onUpdate = jest.fn();

    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={info}
          installed="0.8.0"
          phase={{ status: 'failed', info, message: 'The download stopped early.' }}
          onLater={() => {}}
          onUpdate={onUpdate}
          onGrant={() => {}}
        />,
      );
    });

    await fireEvent.press(screen.getByText('Try again'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('renders nothing at all without a feed', async () => {
    await act(async () => {
      wrap(
        <UpdateSheet
          visible
          info={null}
          installed="0.8.0"
          phase={{ status: 'idle' }}
          onLater={() => {}}
          onUpdate={() => {}}
          onGrant={() => {}}
        />,
      );
    });

    expect(screen.queryByText('Later')).toBeNull();
  });
});
