import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PageDots from './PageDots';
import { colors, radius, spacing, typography } from '../theme';
import type { ContentPage } from '../types';

const { width } = Dimensions.get('window');

interface Props {
  pages: ContentPage[];
  fallbackAccent: string;
}

export default function ContentPager({ pages, fallbackAccent }: Props) {
  const [active, setActive] = useState(0);

  function onScroll(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== active) setActive(i);
  }

  if (pages.length === 0) return null;

  const accent = pages[active]?.accentHex ?? fallbackAccent;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {pages.map((page, i) => (
          <Page
            key={i}
            page={page}
            index={i}
            total={pages.length}
            fallbackAccent={fallbackAccent}
          />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        <PageDots count={pages.length} active={active} accent={accent} />
      </View>
    </View>
  );
}

interface PageProps {
  page: ContentPage;
  index: number;
  total: number;
  fallbackAccent: string;
}

function Page({ page, index, total, fallbackAccent }: PageProps) {
  const accent = page.accentHex ?? fallbackAccent;
  return (
    <View style={[styles.page, { width }]}>
      <LinearGradient
        colors={[accent + '40', '#0B0B12']}
        style={styles.gradient}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
        <Text style={[styles.pageMeta, { color: accent }]}>
          {index + 1} / {total}
        </Text>
        <Text style={styles.title}>{page.title}</Text>
        {page.subtitle && (
          <Text style={[styles.subtitle, { color: accent }]}>
            {page.subtitle}
          </Text>
        )}
        <Text style={styles.bodyText}>{page.body}</Text>
        {page.highlights.length > 0 && (
          <View style={styles.highlights}>
            {page.highlights.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.highlight,
                  { borderColor: accent + '88' },
                ]}
              >
                <Text style={[styles.bullet, { color: accent }]}>•</Text>
                <Text style={styles.highlightText}>{h}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  page: { flex: 1 },
  gradient: { ...StyleSheet.absoluteFillObject },
  body: { flex: 1 },
  bodyContent: {
    padding: spacing.l,
    paddingBottom: spacing.xxl,
  },
  pageMeta: {
    ...typography.micro,
    fontWeight: '700',
    marginBottom: spacing.s,
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: { ...typography.h3, marginBottom: spacing.l },
  bodyText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
    marginBottom: spacing.l,
  },
  highlights: { gap: 8, marginTop: spacing.s },
  highlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  bullet: { fontSize: 16, marginRight: 10, fontWeight: '900' },
  highlightText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.l,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
