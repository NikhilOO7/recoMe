import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  confirmWipe: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null, confirmWipe: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, confirmWipe: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RecoMe] Uncaught error in UI:', error);
    console.error('[RecoMe] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  /** Soft reset — clears only UI/cache state, preserves user data (blocks, likes, memory) */
  handleSoftReset = () => {
    const UI_KEYS = [
      'recome_theme',
      'recome_first_action_done',
      'recome_last_synthesis',
      'recome_achievements',
    ];
    chrome.storage.local
      .remove(UI_KEYS)
      .then(() => window.location.reload())
      .catch(() => window.location.reload());
  };

  /** Nuclear option — clears ALL data. Requires confirmation. */
  handleClearAndRestart = () => {
    if (!this.state.confirmWipe) {
      this.setState({ confirmWipe: true });
      return;
    }
    chrome.storage.local
      .clear()
      .then(() => {
        chrome.storage.sync
          .clear()
          .then(() => window.location.reload())
          .catch(() => window.location.reload());
      })
      .catch(() => window.location.reload());
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={styles.container}>
        <div style={styles.logoRow}>
          <img src="icons/recome_logo_48.png" alt="RecoMe" style={styles.logo} />
          <span style={styles.logoText}>RecoMe</span>
        </div>

        <h2 style={styles.heading}>Something went wrong</h2>
        <p style={styles.message}>
          The extension hit an unexpected error. You can try again, or clear all stored data as a
          last resort.
        </p>

        {this.state.error && <pre style={styles.errorDetail}>{this.state.error.message}</pre>}

        <button style={styles.primaryBtn} onClick={this.handleRetry}>
          Try Again
        </button>
        <button style={styles.secondaryBtn} onClick={this.handleSoftReset}>
          Soft Reset (keep data)
        </button>
        <button
          style={{
            ...styles.secondaryBtn,
            marginTop: '6px',
            color: '#ef4444',
            borderColor: '#ef4444',
          }}
          onClick={this.handleClearAndRestart}
        >
          {this.state.confirmWipe ? 'Confirm — erase everything' : 'Clear All Data'}
        </button>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    minHeight: '300px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: '#1a1a2e',
    backgroundColor: '#f8f9fb',
    textAlign: 'center',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
  },
  logo: {
    width: '32px',
    height: '32px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#6c63ff',
  },
  heading: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 8px',
  },
  message: {
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#555',
    margin: '0 0 16px',
    maxWidth: '280px',
  },
  errorDetail: {
    fontSize: '11px',
    background: '#fee',
    color: '#a00',
    borderRadius: '6px',
    padding: '8px 12px',
    maxWidth: '280px',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: '16px',
  },
  primaryBtn: {
    padding: '8px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#6c63ff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '10px',
  },
  secondaryBtn: {
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#6c63ff',
    backgroundColor: 'transparent',
    border: '1px solid #6c63ff',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};
