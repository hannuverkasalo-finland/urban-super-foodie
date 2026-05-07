import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  visible: boolean;
  onUseCityPicker: () => void;
  onRetryGranted: () => void;
}

export default function PermissionPrompt({
  visible,
  onUseCityPicker,
  onRetryGranted,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>Find places around you</Text>
          <Text style={styles.body}>
            Urban Super Foodie uses your location to curate the best places to eat,
            drink, and explore right where you are. You can pick a city manually
            instead.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Open Settings"
              onPress={() => {
                Linking.openSettings();
                onRetryGranted();
              }}
            />
            <Button
              label="Pick a city instead"
              variant="ghost"
              onPress={onUseCityPicker}
            />
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  card: {
    width: '100%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.l,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { fontSize: 44, marginBottom: spacing.s },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.l,
    lineHeight: 22,
  },
  actions: { gap: spacing.s },
});
