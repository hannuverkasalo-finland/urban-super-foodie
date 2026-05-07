import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from './Button';
import { geocodeCity } from '../api/googlePlaces';
import { useLocationStore } from '../store/locationStore';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  'Tokyo, Japan',
  'Paris, France',
  'New York, USA',
  'Lisbon, Portugal',
  'Copenhagen, Denmark',
  'Mexico City, Mexico',
  'Bangkok, Thailand',
  'Barcelona, Spain',
];

export default function CityPickerModal({ visible, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await geocodeCity(value);
      if (!result) {
        setError('We could not find that city. Try another name.');
        return;
      }
      useLocationStore.getState().setCity({
        name: result.city,
        country: result.country,
        lat: result.lat,
        lng: result.lng,
      });
      useLocationStore.getState().setCoords({
        lat: result.lat,
        lng: result.lng,
      });
      setQuery('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Choose a city</Text>
          <Text style={styles.subtitle}>
            Search for any city worldwide.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tokyo"
            placeholderTextColor={colors.textDim}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={() => pick(query)}
          />
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((c) => (
              <Pressable
                key={c}
                onPress={() => pick(c)}
                style={({ pressed }) => [
                  styles.suggest,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.suggestText}>{c}</Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button
              label={busy ? 'Searching…' : 'Use this city'}
              onPress={() => pick(query)}
              disabled={busy || !query.trim()}
            />
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.m,
  },
  input: {
    backgroundColor: colors.bgChip,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.m,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.m,
  },
  suggest: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.bgChip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestText: { ...typography.small, color: colors.text },
  error: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.s,
  },
  actions: { gap: spacing.s },
});
