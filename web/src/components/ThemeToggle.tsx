'use client';

import { useTheme } from './ThemeProvider';

interface Props {
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'pill';
}

export function ThemeToggle({ size = 'md', variant = 'ghost' }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  const dim = size === 'sm' ? 28 : 36;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`${isDark ? 'Light' : 'Dark'} theme`}
      className="grid place-items-center rounded-full cursor-pointer hover:opacity-80 transition-opacity"
      style={{
        width: dim,
        height: dim,
        background: variant === 'pill' ? 'var(--surface-2)' : 'transparent',
        border: variant === 'pill' ? '1px solid var(--border)' : '1px solid transparent',
        color: 'var(--ink-2)',
      }}
    >
      {isDark ? (
        // Sun — light theme is what you'd switch TO from dark
        <svg
          width={size === 'sm' ? 14 : 16}
          height={size === 'sm' ? 14 : 16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg
          width={size === 'sm' ? 14 : 16}
          height={size === 'sm' ? 14 : 16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
