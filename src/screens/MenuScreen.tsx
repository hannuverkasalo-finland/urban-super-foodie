import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
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
import LoadingState from '../components/LoadingState';
import { useLocationStore } from '../store/locationStore';
import { useMenuStore } from '../store/menuStore';
import { useUserStore } from '../store/userStore';
import { colors, radius, shadow, spacing, typography } from '../theme';

function inferMediaType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

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

  async function analyze(uri: string) {
    setLocalPreview(uri);
    setStatus('loading');
    setError(null);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mediaType = inferMediaType(uri);
      const cityName = city?.name ?? 'Unknown';
      const countryName = city?.country ?? '';
      const result = await analyzeMenu(
        base64,
        mediaType,
        cityName,
        countryName,
        prefs,
        uri
      );
      setCurrent(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      Alert.alert('Menu analysis failed', msg.slice(0, 300));
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission denied');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      await analyze(result.assets[0].uri);
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library permission denied');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      selectionLimit: 1,
    });
    if (!result.canceled && result.assets[0]) {
      await analyze(result.assets[0].uri);
    }
  }

  function reset() {
    clear();
    setLocalPreview(null);
  }

  // ===== Renders =====

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Menu</Text>
          <Text style={styles.subtitle}>
            Reading & translating with Claude vision…
          </Text>
        </View>
        {localPreview && (
          <Image source={{ uri: localPreview }} style={styles.previewLarge} />
        )}
        <LoadingState message="Analysing the menu…" />
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
              Hold steady — clear text reads more accurately.
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

  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.l,
    marginBottom: spacing.l,
    backgroundColor: colors.bgCard,
  },
  previewLarge: {
    width: '90%',
    height: 220,
    alignSelf: 'center',
    borderRadius: radius.l,
    marginTop: spacing.m,
    backgroundColor: colors.bgCard,
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
