/**
 * Unified authentication and token storage utilities for Saturn.
 */

export const SATURN_TOKEN_KEY = 'saturn_token';
export const LEGACY_TOKEN_KEY = 'token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const local = localStorage.getItem(SATURN_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    if (local) return local;
  } catch {
    // localStorage restricted or inaccessible
  }
  try {
    const match = document.cookie.match(/(?:^|; )saturn_token=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // ignore
  }
  return null;
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SATURN_TOKEN_KEY, token);
  } catch {
    // ignore
  }
  try {
    document.cookie = `saturn_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SATURN_TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = 'saturn_token=; path=/; max-age=0';
  } catch {
    // ignore
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
