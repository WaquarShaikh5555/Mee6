import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import {
  adminAvailable,
  AdminError,
  describeAction,
  fetchOverview,
  listUsers,
  recentActions,
  setAccess,
  type AdminAction,
  type AdminOverview,
  type AdminUser,
  type AuditEntry,
} from '@/admin/service';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { FadeIn, STAGGER_MS } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { tapFeedback } from '@/lib/haptics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "just now", "3 h ago", "12 Oct" — never a raw timestamp. */
function lastSeen(iso: string | null): string {
  if (!iso) return 'Never opened';

  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Never opened';

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 2) return 'Here now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return shortDate(iso);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
}

function proIsLive(user: AdminUser): boolean {
  return user.proUntil !== null && Date.parse(user.proUntil) > Date.now();
}

/**
 * The owner console.
 *
 * It is deliberately a screen in the app rather than a dashboard somewhere on
 * the web: the person who owns this app only has a phone. It shows the whole
 * account list, what each account may do, and every change made from here.
 *
 * Nothing on this screen is the source of authority. Each button calls a
 * Postgres function that re-checks the caller is an admin and refuses the
 * changes that would lock the owner out; this file only decides what to show.
 */
export default function PeopleScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const allowed = user?.isAdmin === true && adminAvailable();

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  // The sheet keeps its own copy so a successful action can update it without
  // the list flickering underneath.
  const [sheetUser, setSheetUser] = useState<AdminUser | null>(null);

  const requestId = useRef(0);
  // Which search string the list currently reflects. The debounce effect uses
  // it to avoid firing a second identical request on mount.
  const loadedQuery = useRef<string | null>(null);

  const load = useMemo(
    () =>
      async (search: string, quiet = false) => {
        if (!allowed) {
          setLoading(false);
          return;
        }

        const id = ++requestId.current;
        loadedQuery.current = search;
        if (!quiet) setLoading(true);

        try {
          const [nextUsers, nextOverview, nextAudit] = await Promise.all([
            listUsers(search),
            fetchOverview(),
            recentActions(12),
          ]);

          // A slower, older request must not overwrite a newer answer.
          if (id !== requestId.current) return;

          setUsers(nextUsers);
          setOverview(nextOverview);
          setAudit(nextAudit);
          setProblem(null);
        } catch (caught) {
          if (id !== requestId.current) return;
          setProblem(
            caught instanceof AdminError
              ? caught.message
              : 'Could not load the account list. Check your connection.',
          );
        } finally {
          if (id === requestId.current) setLoading(false);
        }
      },
    [allowed],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  // Typing filters on the server, debounced, so a large account list does not
  // come down the wire on every keystroke.
  useEffect(() => {
    if (loadedQuery.current === query) return;

    const timer = setTimeout(() => {
      void load(query, true);
    }, 280);

    return () => clearTimeout(timer);
  }, [query, load]);

  function confirmThen(title: string, body: string, run: () => void, destructive = false) {
    if (Platform.OS === 'web') {
      run();
      return;
    }

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: destructive ? 'Yes, do it' : 'Confirm',
        style: destructive ? 'destructive' : 'default',
        onPress: run,
      },
    ]);
  }

  async function perform(action: AdminAction) {
    const target = sheetUser;
    if (!target || busy) return;

    setBusy(true);
    setProblem(null);
    setNotice(null);

    try {
      const updated = await setAccess(target.id, action);
      tapFeedback();

      setSheetUser(updated);
      setUsers((current) => current.map((row) => (row.id === updated.id ? updated : row)));

      const line =
        action === 'grant_pro'
          ? `${updated.displayName} now has Pro until ${shortDate(updated.proUntil)}.`
          : action === 'revoke_pro'
            ? `Pro removed from ${updated.displayName}.`
            : action === 'block'
              ? `${updated.displayName} is paused and will be signed out next time the app opens.`
              : action === 'unblock'
                ? `${updated.displayName} can sign in again.`
                : action === 'make_admin'
                  ? `${updated.displayName} is now an owner and can open this screen.`
                  : `${updated.displayName} is no longer an owner.`;

      setNotice(line);
      await load(query, true);
    } catch (caught) {
      setProblem(
        caught instanceof AdminError
          ? caught.message
          : 'The change did not go through. Nothing was altered.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <Screen>
        <ScreenHeader title="Owner" />
        <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.md }}>
          <Card style={{ gap: theme.space.sm }}>
            <Text variant="headline">Owners only</Text>
            <Text variant="footnote" tone="tertiary">
              {adminAvailable()
                ? 'This screen manages every account. Only an owner can open it.'
                : 'The account console needs the real backend. This build is running on the on-device preview, so there is nobody to manage.'}
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  const selfId = user?.id;

  return (
    <Screen scroll={false} gutter="none">
      <View style={{ paddingHorizontal: theme.space.lg, flex: 1 }}>
        <ScreenHeader
          title="Owner"
          right={
            <Pressable
              onPress={() => void load(query)}
              hitSlop={theme.space.md}
              accessibilityRole="button"
              accessibilityLabel="Refresh the account list"
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: theme.radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
              })}
            >
              <Ionicons name="refresh" size={19} color={theme.colors.text} />
            </Pressable>
          }
        />

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: theme.space['2xl'] }}
        >
          <FadeIn offset={8}>
            <View style={{ gap: theme.space.xs, paddingTop: theme.space.sm }}>
              <Text variant="display" serif>
                People
              </Text>
              <Text variant="body" tone="secondary">
                Everyone with an account, what they can open, and what has changed. The database
                enforces all of it.
              </Text>
            </View>
          </FadeIn>

          {overview ? (
            <FadeIn offset={10} delay={STAGGER_MS}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.space.sm,
                  paddingTop: theme.space.lg,
                }}
              >
                <Stat label="Accounts" value={overview.total} tone="accent" />
                <Stat label="Pro" value={overview.pro} tone="brass" />
                <Stat label="Paused" value={overview.blocked} tone="danger" />
                <Stat label="Owners" value={overview.admins} tone="plum" />
                <Stat label="Seen this week" value={overview.seen7d} tone="lagoon" />
              </View>
            </FadeIn>
          ) : null}

          <FadeIn offset={10} delay={STAGGER_MS * 2}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.sm,
                paddingHorizontal: theme.space.lg,
                marginTop: theme.space.lg,
                minHeight: theme.touchTarget,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Name or email"
                placeholderTextColor={theme.colors.textTertiary}
                selectionColor={theme.colors.accent}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search accounts"
                style={{
                  flex: 1,
                  fontFamily: theme.fontFamily.sans,
                  fontSize: theme.typography.body.fontSize,
                  color: theme.colors.text,
                  paddingVertical: theme.space.md,
                }}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={theme.space.md}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the search"
                >
                  <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          </FadeIn>

          {notice ? (
            <View
              style={{
                marginTop: theme.space.md,
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.sageSubtle,
              }}
            >
              <Text variant="footnote" tone="onSageSubtle">
                {notice}
              </Text>
            </View>
          ) : null}

          {problem ? (
            <View
              style={{
                marginTop: theme.space.md,
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.dangerSubtle,
              }}
            >
              <Text variant="footnote" tone="danger">
                {problem}
              </Text>
            </View>
          ) : null}

          <View style={{ paddingTop: theme.space.lg }}>
            {loading ? (
              <View style={{ paddingVertical: theme.space['2xl'], alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.accent} />
              </View>
            ) : users.length === 0 ? (
              <Card style={{ gap: theme.space.sm }}>
                <Text variant="headline">
                  {query.trim().length > 0 ? 'No account matches that' : 'No accounts yet'}
                </Text>
                <Text variant="footnote" tone="tertiary">
                  {query.trim().length > 0
                    ? 'Try part of the name, or the start of the email address.'
                    : 'When somebody signs up in the app, they appear here.'}
                </Text>
              </Card>
            ) : (
              <Card padded={false} style={{ overflow: 'hidden' }}>
                {users.map((row, index) => (
                  <View key={row.id}>
                    {index > 0 ? <Divider inset={16 + 44 + 12} /> : null}
                    <PersonRow
                      person={row}
                      isSelf={row.id === selfId}
                      onPress={() => {
                        tapFeedback();
                        setSelected(row);
                        setSheetUser(row);
                      }}
                    />
                  </View>
                ))}
              </Card>
            )}
          </View>

          <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.sm }}>
            <Text variant="title3">Recent changes</Text>
            {audit.length === 0 ? (
              <Text variant="footnote" tone="tertiary">
                Nothing has been changed from this console yet. Every action taken here is
                recorded with who did it and when.
              </Text>
            ) : (
              <Card padded={false} style={{ overflow: 'hidden' }}>
                {audit.map((entry, index) => (
                  <View key={entry.id}>
                    {index > 0 ? <Divider inset={theme.space.lg} /> : null}
                    <View style={{ padding: theme.space.lg, gap: 2 }}>
                      <Text variant="subhead">
                        {entry.targetEmail ?? 'An account'} — {describeAction(entry.action)}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {shortDate(entry.createdAt)} · by {entry.actorEmail ?? 'an owner'}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>
        </ScrollView>
      </View>

      <PersonSheet
        person={sheetUser}
        visible={selected !== null}
        busy={busy}
        isSelf={sheetUser?.id === selfId}
        onClose={() => {
          setSelected(null);
          setSheetUser(null);
        }}
        onAction={(action) => {
          const target = sheetUser;
          if (!target) return;

          const destruct = action === 'block' || action === 'remove_admin' || action === 'revoke_pro';

          const copy: Record<AdminAction, [string, string]> = {
            grant_pro: ['Give 30 days of Pro?', `${target.displayName} will not see the Pro gate for 30 days.`],
            revoke_pro: ['Remove Pro?', `${target.displayName} will see the Pro gate again from the next launch.`],
            block: ['Pause this account?', `${target.displayName} will be signed out and cannot sign back in until you restore it. Their documents stay on their phone.`],
            unblock: ['Restore this account?', `${target.displayName} will be able to sign in again.`],
            make_admin: ['Make an owner?', `${target.displayName} will be able to open this screen and change every account, including yours.`],
            remove_admin: ['Remove owner access?', `${target.displayName} will lose this screen but keep their account.`],
          };

          const [title, body] = copy[action];
          confirmThen(title, body, () => void perform(action), destruct);
        }}
      />
    </Screen>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'accent' | 'brass' | 'danger' | 'plum' | 'lagoon';
}) {
  const theme = useTheme();
  const colors = {
    accent: { wash: theme.colors.accentSubtle, ink: theme.colors.onAccentSubtle },
    brass: { wash: theme.colors.brassSubtle, ink: theme.colors.onBrassSubtle },
    danger: { wash: theme.colors.dangerSubtle, ink: theme.colors.danger },
    plum: { wash: theme.colors.plumSubtle, ink: theme.colors.onPlumSubtle },
    lagoon: { wash: theme.colors.lagoonSubtle, ink: theme.colors.onLagoonSubtle },
  }[tone];

  return (
    <View
      style={{
        paddingHorizontal: theme.space.md,
        paddingVertical: theme.space.sm,
        borderRadius: theme.radius.md,
        backgroundColor: colors.wash,
        minWidth: 92,
        gap: 1,
      }}
    >
      <Text variant="title3" style={{ color: colors.ink }}>
        {String(value)}
      </Text>
      <Text variant="caption" style={{ color: colors.ink }}>
        {label}
      </Text>
    </View>
  );
}

function PersonRow({
  person,
  isSelf,
  onPress,
}: {
  person: AdminUser;
  isSelf: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const pro = proIsLive(person);

  const avatar = person.isBlocked
    ? { wash: theme.colors.dangerSubtle, ink: theme.colors.danger }
    : person.isAdmin
      ? { wash: theme.colors.accentSubtle, ink: theme.colors.onAccentSubtle }
      : { wash: theme.colors.surfaceSunken, ink: theme.colors.textSecondary };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}${person.email ? `, ${person.email}` : ''}. Manage this account.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        padding: theme.space.lg,
        backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: avatar.wash,
        }}
      >
        <Text variant="subhead" style={{ color: avatar.ink, fontWeight: '600' }}>
          {initials(person.displayName)}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {person.displayName}
            {isSelf ? ' (you)' : ''}
          </Text>
          {person.isAdmin ? <Badge label="OWNER" tone="accent" /> : null}
          {person.isBlocked ? <Badge label="PAUSED" tone="danger" /> : null}
        </View>

        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {person.email ?? 'No email on file'} · {lastSeen(person.lastSeenAt)}
        </Text>

        {pro ? (
          <Text variant="caption" tone="brass">
            Pro until {shortDate(person.proUntil)}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

function PersonSheet({
  person,
  visible,
  busy,
  isSelf,
  onClose,
  onAction,
}: {
  person: AdminUser | null;
  visible: boolean;
  busy: boolean;
  isSelf: boolean;
  onClose: () => void;
  onAction: (action: AdminAction) => void;
}) {
  const theme = useTheme();
  if (!person) return null;

  const pro = proIsLive(person);

  const actions: { action: AdminAction; label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'default' | 'danger' }[] = [
    pro
      ? { action: 'revoke_pro', label: 'Remove Pro', icon: 'close-circle-outline', tone: 'danger' }
      : { action: 'grant_pro', label: 'Give 30 days of Pro', icon: 'sparkles-outline', tone: 'default' },
    person.isBlocked
      ? { action: 'unblock', label: 'Restore access', icon: 'play-circle-outline', tone: 'default' }
      : { action: 'block', label: 'Pause this account', icon: 'pause-circle-outline', tone: 'danger' },
    person.isAdmin
      ? { action: 'remove_admin', label: 'Remove owner access', icon: 'shield-outline', tone: 'danger' }
      : { action: 'make_admin', label: 'Make an owner', icon: 'shield-checkmark-outline', tone: 'default' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        accessibilityLabel="Close"
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.colors.canvas,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            padding: theme.space.xl,
            paddingBottom: theme.space['2xl'],
            gap: theme.space.lg,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
              }}
            />
          </View>

          <View style={{ gap: 2 }}>
            <Text variant="title2">{person.displayName}</Text>
            <Text variant="footnote" tone="tertiary">
              {person.email ?? 'No email on file'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {person.isAdmin ? <Badge label="Owner" tone="accent" /> : <Badge label="Member" />}
            {person.isBlocked ? <Badge label="Paused" tone="danger" /> : null}
            {pro ? <Badge label={`Pro · ${shortDate(person.proUntil)}`} tone="brass" /> : null}
          </View>

          <View style={{ gap: theme.space.xs }}>
            <Text variant="caption" tone="tertiary">
              Last opened the app: {lastSeen(person.lastSeenAt)}
            </Text>
            <Text variant="caption" tone="tertiary">
              Account created: {shortDate(person.createdAt)}
            </Text>
          </View>

          {isSelf ? (
            <Text variant="caption" tone="tertiary">
              This is your account. You cannot pause it, remove your own Pro, or remove your own
              owner access — that is the rule that keeps this screen reachable.
            </Text>
          ) : null}

          <View style={{ gap: theme.space.sm }}>
            {actions.map((entry) => {
              const blockedBySelfRule =
                isSelf &&
                (entry.action === 'block' || entry.action === 'remove_admin' || entry.action === 'revoke_pro');

              return (
                <Pressable
                  key={entry.action}
                  onPress={() => onAction(entry.action)}
                  disabled={busy || blockedBySelfRule}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || blockedBySelfRule }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.md,
                    paddingVertical: theme.space.md,
                    paddingHorizontal: theme.space.lg,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.separator,
                    backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
                    opacity: blockedBySelfRule ? 0.4 : 1,
                  })}
                >
                  <Ionicons
                    name={entry.icon}
                    size={19}
                    color={entry.tone === 'danger' ? theme.colors.danger : theme.colors.text}
                  />
                  <Text
                    variant="body"
                    tone={entry.tone === 'danger' ? 'danger' : 'primary'}
                    style={{ flex: 1 }}
                  >
                    {entry.label}
                  </Text>
                  {busy ? <ActivityIndicator size="small" color={theme.colors.textTertiary} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Button label="Done" variant="secondary" onPress={onClose} disabled={busy} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
