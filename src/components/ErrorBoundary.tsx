import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { colors, radius, spacing, typography } from '../theme';

interface State {
  error: Error | null;
  info: string | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[USF] caught', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something cracked.</Text>
          <Text style={styles.subtitle}>
            The app caught a runtime error. Share this with Claude to fix it.
          </Text>
          <View style={styles.box}>
            <Text style={styles.label}>Error</Text>
            <Text style={styles.body}>
              {this.state.error.name}: {this.state.error.message}
            </Text>
          </View>
          {this.state.error.stack && (
            <View style={styles.box}>
              <Text style={styles.label}>Stack</Text>
              <Text style={styles.code}>{this.state.error.stack}</Text>
            </View>
          )}
          {this.state.info && (
            <View style={styles.box}>
              <Text style={styles.label}>Component stack</Text>
              <Text style={styles.code}>{this.state.info}</Text>
            </View>
          )}
          <Button label="Try again" onPress={this.reset} />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  content: { padding: spacing.l, paddingBottom: spacing.xxl, gap: spacing.m },
  title: { ...typography.h1, color: colors.danger },
  subtitle: { ...typography.body, color: colors.textMuted },
  box: {
    padding: spacing.m,
    borderRadius: radius.m,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { ...typography.micro, color: colors.textMuted, marginBottom: 6 },
  body: { ...typography.body, color: colors.text },
  code: {
    ...typography.small,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
