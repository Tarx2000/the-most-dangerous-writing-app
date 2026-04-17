import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/styles/theme';

const MAX_RETRIES = 3;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    if (this.state.retryCount >= MAX_RETRIES) return;
    this.setState(prev => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const exhausted = this.state.retryCount >= MAX_RETRIES;

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </Text>
            {exhausted ? (
              <Text style={styles.exhaustedText}>
                Please restart the app to recover.
              </Text>
            ) : (
              <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 20,
  },
  button: {
    backgroundColor: theme.colors.primaryAction,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
  },
  buttonText: {
    color: theme.colors.primaryActionText,
    fontSize: 16,
    fontWeight: '600',
  },
  exhaustedText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});

/**
 * Higher-order component that wraps a screen component with an ErrorBoundary.
 * Use with React Navigation screens:
 *   <Stack.Screen name="Home" component={withErrorBoundary(HomeScreen)} />
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}