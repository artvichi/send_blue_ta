import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'sbta.theme';

function read(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private windows and blocked site data both throw; the default is fine.
  }
  return 'system';
}

/** `system` removes the attribute so the OS media query takes over again. */
function apply(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

/**
 * Theme preference, persisted per browser.
 *
 * Three states rather than two: following the OS is a real choice, and a user
 * who never touches this should keep tracking their system setting.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(read);

  useEffect(() => {
    apply(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  }, []);

  return { preference, setPreference, cycle };
}

/** Applied before React mounts so the first paint is not the wrong theme. */
export function applyStoredTheme(): void {
  apply(read());
}
