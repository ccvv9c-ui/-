/**
 * Safe Service Worker Registration Utility
 * Prevents "Failed to register a ServiceWorker: The script resource is behind a redirect, which is disallowed"
 * when running inside proxied preview iframes (e.g., ais-dev-*.run.app) where unauthenticated SW script fetches
 * are redirected by the proxy.
 */

export interface ServiceWorkerEnvCheckInput {
  hasServiceWorkerSupport: boolean;
  isCrossOriginIframe: boolean;
  hostname: string;
  protocol: string;
}

/**
 * Pure check determining whether the current browser context allows safe Service Worker registration
 * without triggering proxy redirect errors.
 */
export function canRegisterServiceWorkerInEnv(
  env: ServiceWorkerEnvCheckInput
): boolean {
  if (!env.hasServiceWorkerSupport) {
    return false;
  }

  // Only HTTPS or localhost supports Service Workers
  const isLocalhost =
    env.hostname === 'localhost' ||
    env.hostname === '127.0.0.1' ||
    env.hostname === '[::1]';
  if (env.protocol !== 'https:' && !isLocalhost) {
    return false;
  }

  // In cross-origin iframes or AI Studio Cloud Run proxy hosts (ais-dev-* / ais-pre-*),
  // browser fetches for Service Worker scripts do not include third-party auth cookies
  // and receive a 302 redirect, which the ServiceWorker spec disallows.
  if (env.isCrossOriginIframe) {
    return false;
  }

  if (/^(ais-dev|ais-pre)-/i.test(env.hostname) || /\.run\.app$/i.test(env.hostname)) {
    return false;
  }

  return true;
}

/**
 * Safely registers the PWA Service Worker only after verifying the environment and confirming
 * via a manual-redirect pre-flight fetch that the script resource is not behind a redirect.
 */
export async function registerServiceWorkerSafely(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch {
    isIframe = true;
  }

  const allowed = canRegisterServiceWorkerInEnv({
    hasServiceWorkerSupport: 'serviceWorker' in navigator,
    isCrossOriginIframe: isIframe,
    hostname: window.location.hostname || '',
    protocol: window.location.protocol || '',
  });

  if (!allowed) {
    return false;
  }

  const isDev = Boolean((import.meta as any).env?.DEV);
  const swUrl = isDev ? '/dev-sw.js?dev-sw' : '/sw.js';

  try {
    // Pre-flight check with redirect: 'manual' to guarantee the SW script is never behind a redirect
    const response = await fetch(swUrl, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (
      response.type === 'opaqueredirect' ||
      response.redirected ||
      response.status !== 200 ||
      (!contentType.includes('javascript') && !contentType.includes('ecmascript'))
    ) {
      return false;
    }

    await navigator.serviceWorker.register(swUrl, {
      scope: '/',
      type: isDev ? 'module' : 'classic',
    });
    return true;
  } catch {
    // Silently ignore registration errors in restricted environments
    return false;
  }
}
