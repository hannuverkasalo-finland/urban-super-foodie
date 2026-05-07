import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme';

interface Props {
  rank: number;
  color: string;
  selected?: boolean;
}

export default function MapMarker({ rank, color, selected }: Props) {
  return (
    <View style={[styles.outer, selected && styles.selected]}>
      <View style={[styles.inner, { backgroundColor: color }]}>
        <Text style={styles.rank}>{rank}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  selected: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    transform: [{ scale: 1.15 }],
  },
  inner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  rank: {
    color: '#0B0B12',
    fontWeight: '800',
    fontSize: 12,
  },
});
