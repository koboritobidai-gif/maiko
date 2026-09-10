// uysot uses Google reCAPTCHA v3 (invisible, score-based) on sign-in.
// This is the site's PUBLIC site key — reCAPTCHA site keys are meant to be
// embedded in client code. The key is domain-scoped by Google; if this app's
// origin is not registered for the key, execution/verification may fail — in
// which case the user falls back to token sign-in.
export const RECAPTCHA_SITE_KEY = '6LdQVBssAAAAAP4-vd6SeUzjqqR_q_wFPUJzsSIa';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let loadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve();
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('reCAPTCHA の読み込みに失敗しました'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export async function getRecaptchaToken(action = 'login'): Promise<string> {
  await loadScript();
  const g = window.grecaptcha;
  if (!g) throw new Error('reCAPTCHA を初期化できませんでした');
  await new Promise<void>((res) => g.ready(() => res()));
  return g.execute(RECAPTCHA_SITE_KEY, { action });
}
