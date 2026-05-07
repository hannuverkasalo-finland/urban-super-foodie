import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  count: number;
  active: number;
  accent?: string;
}

export default function PageDots({ count, active, accent }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === active
              ? [styles.dotActive, accent ? { backgroundColor: accent } : null]
              : null,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.text,
  },
});
