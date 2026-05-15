import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeMenu } from '../api/claude';
import Button from '../components/Button';
import StatusBanner from '../components/StatusBanner';
import { useMenuStore } from '../store/menuStore';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import { dlog, dwarn } from '../store/debugLog';
import {
  clearProgress,
  MENU_PROGRESS_KEY,
  publishProgress,
} from '../store/progressStore';
import { colors, radius, shadow, spacing, typography } from '../theme';

// Anthropic vision: 5MB per-image cap. We resize aggressively + JPEG-compress
// to ~150-250 KB so the upload finishes fast on mobile and the OS doesn't
// kill us mid-flight. quality 0.4 here is BEFORE manipulator re-compression
// (which uses 0.7) — picker quality only affects the raw camera/library
// source bitmap size that lands in JS, not the eventual payload.
const PICKER_QUALITY = 0.4;
const MENU_MAX_WIDTH = 1568;
const MENU_JPEG_QUALITY = 0.7;
const MENU_TIMEOUT_MS = 90_000;

type MenuStage = 'idle' | 'picking' | 'resizing' | 'uploading' | 'parsing' | 'done';

const STAGE_LABELS: Record<MenuStage, string> = {
  idle: '',
  picking: 'Opening picker…',
  resizing: 'Resizing & compressing image…',
  uploading: 'Uploading to Claude vision (this can take up to a minute)…',
  parsing: 'Reading & translating menu, picking your recommendations…',
  done: 'Done.',
};

export default function MenuScreen() {
  const city = useLocationStore((s) => s.city);
  const prefs = useUserStore((s) => s.preferences);
  const menu = useMenuStore((s) => s.current);
  const status = useMenuStore((s) => s.status);
  const error = useMenuStore((s) => s.error);
  const setStatus = useMenuStore((s) => s.setStatus);
  const setCurrent = useMenuStore((s) => s.setCurrent);
  const setError = useMenuStore((s) => s.setError);
  const clear = useMenuStore((s) => s.clear);

  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<MenuStage>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  // Elapsed-time ticker — runs only while loading.
  useEffect(() => {
    if (status !== 'loading') {
      setElapsedSec(0);
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Abort the in-flight analyze when leaving the screen / unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function reportStage(s: MenuStage, extra?: string) {
    setStage(s);
    const label = extra ? `${STAGE_LABELS[s]} ${extra}` : STAGE_LABELS[s];
    if (s !== 'idle' && s !== 'done') {
      publishProgress(MENU_PROGRESS_KEY, label);
    }
  }

  async function analyze(uri: string) {
    setLocalPreview(uri);
    setStatus('loading');
    setError(null);
    reportStage('resizing');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      dlog('menu', `analyze start uri=${uri.slice(-80)}`);

      const t0 = Date.now();
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MENU_MAX_WIDTH } }],
        {
          compress: MENU_JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      if (!manipulated.base64) {
        throw new Error('ImageManipulator returned no base64');
      }
      dlog(
        'menu',
        `resized in ${Date.now() - t0}ms · ${manipulated.width}x${manipulated.height} · ${manipulated.base64.length} chars base64`
      );

      if (controller.signal.aborted) {
        throw new Error('Cancelled');
      }

      const cityName = city?.name ?? 'Unknown';
      const countryName = city?.country ?? '';
      const sizeKb = Math.round((manipulated.base64.length * 3) / 4 / 1024);
      reportStage('uploading', `(~${sizeKb} KB to send)`);
      dlog(
        'menu',
        `analyzeMenu start (city=${cityName}, ~${sizeKb}KB encoded)`
      );

      const t1 = Date.now();
      const result = await analyzeMenu(
        manipulated.base64,
        'image/jpeg',
        cityName,
        countryName,
        prefs,
        manipulated.uri,
        { signal: controller.signal, timeoutMs: MENU_TIMEOUT_MS }
      );

      reportStage('parsing');
      dlog(
        'menu',
        `analyzeMenu done in ${Date.now() - t1}ms: ${result.sections.length} sections, ${result.recommendations.length} recs`
      );

      setCurrent(result);
      reportStage('done');
      clearProgress(MENU_PROGRESS_KEY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dwarn('menu', `failed: ${msg}`);
      setError(msg);
      clearProgress(MENU_PROGRESS_KEY);
      // Show alert. Even if user navigated away, the error is also stored in
      // the menu store and shown on the empty screen via the error box.
      Alert.alert(
        'Menu analysis failed',
        msg.slice(0, 500) + '\n\nTry a clearer photo, or a smaller portion of the menu.'
      );
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStatus('idle');
    setError(null);
    setLocalPreview(null);
    clearProgress(MENU_PROGRESS_KEY);
  }

  async function pickFromCamera() {
    try {
      reportStage('picking');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission denied');
        reportStage('idle');
        return;
      }
      // Aggressively reduce memory pressure on Android. exif:false strips
      // metadata, quality 0.4 shrinks the raw camera bitmap, and we don't
      // ask for editing (which spawns a second activity = more OOM risk).
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: PICKER_QUALITY,
        exif: false,
      });
      if (result.canceled) {
        reportStage('idle');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('No photo captured', 'Try again.');
        reportStage('idle');
        return;
      }
      await analyze(asset.uri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dwarn('menu', `camera pick failed: ${msg}`);
      setError(msg);
      Alert.alert('Camera failed', msg.slice(0, 400));
      reportStage('idle');
    }
  }

  async function pickFromLibrary() {
    try {
      reportStage('picking');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo library permission denied');
        reportStage('idle');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: PICKER_QUALITY,
        selectionLimit: 1,
        exif: false,
      });
      if (result.canceled) {
        reportStage('idle');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('No photo selected', 'Try again.');
        reportStage('idle');
        return;
      }
      await analyze(asset.uri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dwarn('menu', `library pick failed: ${msg}`);
      setError(msg);
      Alert.alert('Library pick failed', msg.slice(0, 400));
      reportStage('idle');
    }
  }

  function reset() {
    clear();
    setLocalPreview(null);
    setStage('idle');
    clearProgress(MENU_PROGRESS_KEY);
  }

  // ===== Renders =====

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Menu</Text>
            <Text style={styles.subtitle}>
              {STAGE_LABELS[stage] || 'Analysing the menu…'}
            </Text>
          </View>
        </View>

        <StatusBanner scopeKey={MENU_PROGRESS_KEY} accent={colors.menu} />

        {localPreview && (
          <View style={styles.previewLargeWrap}>
            <Image
              source={{ uri: localPreview }}
              style={styles.previewLarge}
              resizeMode="cover"
            />
            <View style={styles.timerOverlay}>
              <Text style={styles.timerText}>
                {elapsedSec}s · {stage}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.loadingFooter}>
          <View style={styles.stageBar}>
            <View
              style={[
                styles.stageStep,
                stageReached(stage, 'resizing') && styles.stageStepDone,
              ]}
            />
            <View
              style={[
                styles.stageStep,
                stageReached(stage, 'uploading') && styles.stageStepDone,
              ]}
            />
            <View
              style={[
                styles.stageStep,
                stageReached(stage, 'parsing') && styles.stageStepDone,
              ]}
            />
            <View
              style={[
                styles.stageStep,
                stageReached(stage, 'done') && styles.stageStepDone,
              ]}
            />
          </View>
          <Text style={styles.loadingHint}>
            {stage === 'uploading'
              ? 'Large menus can take 30-60s. You can leave this tab — we keep working.'
              : 'Reading the menu image. Hold tight.'}
          </Text>
          <Button label="Cancel" variant="ghost" onPress={cancel} />
        </View>
      </SafeAreaView>
    );
  }

  if (!menu) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={styles.introWrap}>
          <Text style={styles.title}>Menu</Text>
          <Text style={styles.intro}>
            Snap a photo of any menu — food, wine list, cocktail card. We'll
            translate it to English and pick what suits you, prioritising local
            specialties.
          </Text>
          <View style={styles.cardEmpty}>
            <Text style={styles.iconBig}>🍽️📸</Text>
            <Text style={styles.cardEmptyTitle}>Snap your menu</Text>
            <Text style={styles.cardEmptyBody}>
              Hold steady — clear text reads more accurately. Tip: take the
              photo close enough that text is sharp.
            </Text>
            <View style={styles.actions}>
              <Button label="Take a photo" onPress={pickFromCamera} />
              <Button
                label="Choose from library"
                variant="ghost"
                onPress={pickFromLibrary}
              />
            </View>
          </View>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Last error</Text>
              <Text style={styles.errorBody} selectable>
                {error}
              </Text>
              <Text style={styles.errorHint}>
                Quick fixes to try: take a closer / clearer photo · drop one
                section of the menu at a time · check internet · retry.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Menu</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {menu.menuTitle} · {menu.languageDetected}
          </Text>
        </View>
        <Pressable style={styles.resetButton} onPress={reset}>
          <Text style={styles.resetText}>New photo</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {menu.photoUri && (
          <Image source={{ uri: menu.photoUri }} style={styles.preview} />
        )}

        {menu.recommendations.length > 0 && (
          <View style={styles.recBlock}>
            <Text style={styles.sectionTitle}>For you</Text>
            <Text style={styles.sectionSub}>
              Picked from this menu, weighted to your tastes
            </Text>
            <View style={{ gap: 10, marginTop: 10 }}>
              {menu.recommendations.map((r, i) => (
                <View key={i} style={styles.recCard}>
                  <Text style={styles.recIndex}>#{i + 1}</Text>
                  <Text style={styles.recName}>{r.itemName}</Text>
                  <Text style={styles.recWhy}>{r.whyForYou}</Text>
                  {r.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {r.tags.map((t) => (
                        <View key={t} style={styles.tag}>
                          <Text style={styles.tagText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {menu.sections.length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>Full menu — English</Text>
            <Text style={styles.sectionSub}>
              {menu.sections.reduce((n, s) => n + s.items.length, 0)} items ·
              translated by Claude
            </Text>
            {menu.sections.map((sec, si) => (
              <View key={si} style={styles.section}>
                <Text style={styles.sectionHead}>
                  {sec.name}
                  {sec.originalName && sec.originalName !== sec.name ? (
                    <Text style={styles.sectionHeadOriginal}>
                      {'  '}· {sec.originalName}
                    </Text>
                  ) : null}
                </Text>
                {sec.items.map((item, ii) => (
                  <View key={ii} style={styles.item}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.itemEnglish}>{item.englishName}</Text>
                      {item.originalName &&
                        item.originalName !== item.englishName && (
                          <Text style={styles.itemOriginal}>
                            {item.originalName}
                          </Text>
                        )}
                      {item.description ? (
                        <Text style={styles.itemDesc}>{item.description}</Text>
                      ) : null}
                    </View>
                    {item.price ? (
                      <Text style={styles.itemPrice}>{item.price}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function stageReached(current: MenuStage, target: MenuStage): boolean {
  const order: MenuStage[] = ['idle', 'picking', 'resizing', 'uploading', 'parsing', 'done'];
  return order.indexOf(current) >= order.indexOf(target);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted },
  resetButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgChip,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: spacing.s,
  },
  resetText: { ...typography.small, color: colors.text },

  introWrap: {
    padding: spacing.l,
    paddingBottom: spacing.xxl,
    gap: spacing.m,
  },
  intro: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.m,
  },
  cardEmpty: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  iconBig: { fontSize: 56, marginBottom: spacing.s },
  cardEmptyTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 6,
  },
  cardEmptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  actions: { gap: spacing.s, width: '100%' },

  errorBox: {
    backgroundColor: 'rgba(120,20,40,0.25)',
    borderRadius: radius.m,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorTitle: { ...typography.bodyBold, color: colors.danger, marginBottom: 4 },
  errorBody: { ...typography.small, color: colors.text },
  errorHint: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 18,
  },

  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.l,
    marginBottom: spacing.l,
    backgroundColor: colors.bgCard,
  },
  previewLargeWrap: {
    width: '90%',
    alignSelf: 'center',
    marginTop: spacing.m,
    marginBottom: spacing.l,
    position: 'relative',
  },
  previewLarge: {
    width: '100%',
    height: 260,
    borderRadius: radius.l,
    backgroundColor: colors.bgCard,
  },
  timerOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.pill,
  },
  timerText: {
    ...typography.micro,
    color: colors.text,
    fontWeight: '700',
  },
  loadingFooter: {
    paddingHorizontal: spacing.l,
    gap: spacing.m,
  },
  stageBar: {
    flexDirection: 'row',
    gap: 6,
  },
  stageStep: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgChip,
  },
  stageStepDone: {
    backgroundColor: colors.menu,
  },
  loadingHint: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 19,
    textAlign: 'center',
  },

  recBlock: { marginTop: spacing.s },
  sectionTitle: { ...typography.h2, color: colors.text },
  sectionSub: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },

  recCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.menu + '55',
    ...shadow.soft,
  },
  recIndex: {
    ...typography.micro,
    color: colors.menu,
    fontWeight: '800',
    marginBottom: 4,
  },
  recName: { ...typography.h3, color: colors.text, marginBottom: 4 },
  recWhy: {
    ...typography.body,
    color: colors.text,
    lineHeight: 21,
    marginBottom: 8,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.menu + '22',
    borderRadius: radius.pill,
  },
  tagText: { ...typography.micro, color: colors.menu },

  section: {
    marginTop: spacing.l,
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    padding: spacing.m,
  },
  sectionHead: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.s,
  },
  sectionHeadOriginal: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '400',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemEnglish: {
    ...typography.bodyBold,
    color: colors.text,
  },
  itemOriginal: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemDesc: {
    ...typography.small,
    color: colors.text,
    marginTop: 4,
    lineHeight: 18,
  },
  itemPrice: {
    ...typography.bodyBold,
    color: colors.menu,
  },
});
