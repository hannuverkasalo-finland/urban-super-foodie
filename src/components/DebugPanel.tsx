import { useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { reverseGeocode, findPlace, geocodeCity } from '../api/googlePlaces';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import { useContentStore } from '../store/contentStore';
import { useDebugLog } from '../store/debugLog';
import { cityKeyFor, prefetchCity } from '../services/prefetchService';
import { colors, radius, spacing, typography } from '../theme';
import Button from './Button';

const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL = process.env.EXPO_PUBLIC_CLAUDE_MODEL ?? '';

function maskKey(k: string): string {
  if (!k) return '⚠️ EMPTY (length 0)';
  if (k.length < 12) return `⚠️ short: ${k} (length ${k.length})`;
  return `${k.slice(0, 6)}…${k.slice(-4)} (length ${k.length})`;
}

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function DebugPanel({ visible, onClose }: Props) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const profile = useUserStore((s) => s.profile);
  const preferences = useUserStore((s) => s.preferences);
  const location = useLocationStore();
  const cityCache = useContentStore((s) => s.cityCache);
  const cityStatus = useContentStore((s) => s.status);
  const cityErrors = useContentStore((s) => s.errors);
  const invalidateCity = useContentStore((s) => s.invalidate);
  const debugEntries = useDebugLog((s) => s.entries);
  const clearLog = useDebugLog((s) => s.clear);

  async function timed(
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>
  ): Promise<TestResult> {
    const t0 = Date.now();
    try {
      const r = await fn();
      return { name, ...r, durationMs: Date.now() - t0 };
    } catch (err) {
      return {
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
    }
  }

  async function runAll() {
    setBusy(true);
    setBusyAction('Network tests');
    setResults([]);
    const tests: TestResult[] = [];

    tests.push(
      await timed('1. Plain HTTPS fetch (httpbin)', async () => {
        const res = await fetch('https://httpbin.org/get');
        const text = (await res.text()).slice(0, 80);
        return {
          ok: res.ok,
          detail: `HTTP ${res.status} · ${text.replace(/\n/g, ' ')}`,
        };
      })
    );

    tests.push(
      await timed('2. Google Geocoding API (forward)', async () => {
        const r = await geocodeCity('Tokyo');
        return r
          ? { ok: true, detail: `Tokyo → ${r.city}, ${r.country}` }
          : { ok: false, detail: 'returned null' };
      })
    );

    tests.push(
      await timed('3. Google Geocoding API (reverse, Bergamo)', async () => {
        const r = await reverseGeocode(45.6661, 9.7020);
        return r
          ? { ok: true, detail: `${r.city}, ${r.country}` }
          : { ok: false, detail: 'returned null' };
      })
    );

    tests.push(
      await timed('4. Google Places find (Da Vittorio Bergamo)', async () => {
        const r = await findPlace('Da Vittorio', 'Bergamo, Italy');
        return r
          ? {
              ok: true,
              detail: `${r.name} · rating=${r.rating} · ${r.userRatingsTotal ?? '?'} reviews`,
            }
          : { ok: false, detail: 'returned null' };
      })
    );

    tests.push(
      await timed('5. Anthropic API ping', async () => {
        if (!ANTHROPIC_KEY) {
          return { ok: false, detail: 'EXPO_PUBLIC_ANTHROPIC_API_KEY is empty' };
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL || 'claude-sonnet-4-6',
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Say "ok" once.' }],
          }),
        });
        const text = (await res.text()).slice(0, 200);
        return {
          ok: res.ok,
          detail: `HTTP ${res.status} · ${text.replace(/\s+/g, ' ').slice(0, 160)}`,
        };
      })
    );

    setResults(tests);
    setBusy(false);
    setBusyAction(null);
  }

  async function forcePrefetch() {
    if (!location.city) return;
    setBusy(true);
    setBusyAction('Force prefetch (~30-90s)');
    try {
      await prefetchCity(
        location.city.name,
        location.city.country,
        preferences,
        { force: true }
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  function clearAllCacheNow() {
    Object.keys(cityCache).forEach((k) => invalidateCity(k));
  }

  const cacheKeys = Object.keys(cityCache);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Diagnostics</Text>
          <Button label="Close" variant="ghost" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <View style={styles.box}>
            <DebugRow k="Platform" v={`${Platform.OS} ${Platform.Version}`} />
            <DebugRow k="GOOGLE_MAPS_KEY" v={maskKey(GMAPS_KEY)} />
            <DebugRow k="ANTHROPIC_API_KEY" v={maskKey(ANTHROPIC_KEY)} />
            <DebugRow k="CLAUDE_MODEL" v={CLAUDE_MODEL || '⚠️ empty'} />
          </View>

          <Text style={styles.sectionTitle}>State</Text>
          <View style={styles.box}>
            <DebugRow
              k="profile.photoUri"
              v={profile.photoUri ?? '(null)'}
              wrap
            />
            <DebugRow k="profile.nickname" v={profile.nickname || '(empty)'} />
            <DebugRow k="permission" v={location.permission} />
            <DebugRow
              k="coords"
              v={
                location.coords
                  ? `${location.coords.lat.toFixed(4)}, ${location.coords.lng.toFixed(4)}`
                  : '(none)'
              }
            />
            <DebugRow
              k="city"
              v={
                location.city
                  ? `${location.city.name}, ${location.city.country}`
                  : '(none)'
              }
            />
            <DebugRow
              k="location.lastError"
              v={location.lastError ?? '(none)'}
              wrap
            />
          </View>

          <Text style={styles.sectionTitle}>Cache contents</Text>
          <View style={styles.box}>
            {cacheKeys.length === 0 && (
              <Text style={styles.val}>(no cities cached yet)</Text>
            )}
            {cacheKeys.map((k) => {
              const c = cityCache[k];
              const stat = cityStatus[k] ?? '(idle)';
              const err = cityErrors[k];
              return (
                <View key={k} style={styles.row}>
                  <Text style={styles.key}>
                    {k} · status={stat}
                  </Text>
                  <Text style={styles.val} selectable>
                    eat={c.eatPlaces.length} · drink={c.drinkPlaces.length} · do=
                    {c.doPlaces.length} · craft={c.craftPages.length} · info=
                    {c.infoPages.length}
                  </Text>
                  <Text style={styles.val} selectable>
                    fetched {Math.round((Date.now() - c.fetchedAt) / 1000)}s ago
                  </Text>
                  {err && (
                    <Text style={[styles.val, { color: colors.danger }]} selectable>
                      err: {err}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsRow}>
            <Button
              label={busyAction ?? 'Run network tests'}
              onPress={runAll}
              disabled={busy}
            />
            <Button
              label="Force prefetch this city"
              variant="ghost"
              onPress={forcePrefetch}
              disabled={busy || !location.city}
            />
            <Button
              label="Clear cache"
              variant="ghost"
              onPress={clearAllCacheNow}
              disabled={busy}
            />
          </View>

          {results.length > 0 && (
            <View style={[styles.box, { marginTop: spacing.s }]}>
              {results.map((r, i) => (
                <View key={i} style={styles.testRow}>
                  <Text style={styles.testName}>
                    {r.ok ? '✅' : '❌'} {r.name} · {r.durationMs}ms
                  </Text>
                  <Text style={styles.testDetail} selectable>
                    {r.detail}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.logHeader}>
            <Text style={styles.sectionTitle}>Recent log ({debugEntries.length})</Text>
            <Button label="Clear log" variant="ghost" onPress={clearLog} />
          </View>
          <View style={styles.box}>
            {debugEntries.length === 0 && (
              <Text style={styles.val}>(no entries)</Text>
            )}
            {debugEntries.slice(0, 50).map((e, i) => {
              const ts = new Date(e.ts).toLocaleTimeString();
              const colorStyle =
                e.level === 'error'
                  ? { color: colors.danger }
                  : e.level === 'warn'
                  ? { color: colors.warning }
                  : { color: colors.text };
              return (
                <View key={i} style={styles.logRow}>
                  <Text style={[styles.logLine, colorStyle]} selectable>
                    {ts} [{e.tag}] {e.message}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function DebugRow({ k, v, wrap }: { k: string; v: string; wrap?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text
        style={styles.val}
        numberOfLines={wrap ? undefined : 1}
        selectable
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 50 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
  },
  h1: { ...typography.h1, color: colors.text },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, gap: spacing.m },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textMuted,
    marginTop: spacing.m,
  },
  box: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.m,
    gap: 8,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  key: { ...typography.micro, color: colors.textMuted, marginBottom: 2 },
  val: {
    ...typography.small,
    color: colors.text,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 12,
  },
  actionsRow: { gap: spacing.s, marginTop: 4 },
  testRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  testName: { ...typography.bodyBold, color: colors.text, marginBottom: 4 },
  testDetail: {
    ...typography.small,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 11,
    lineHeight: 16,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.m,
  },
  logRow: { marginBottom: 4 },
  logLine: {
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    fontSize: 11,
    lineHeight: 15,
  },
});
