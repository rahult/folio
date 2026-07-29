/**
 * Opt-in telemetry via Google Analytics 4. Nothing loads and nothing is
 * sent until the user explicitly enables usage statistics (first-launch
 * consent dialog or View → Usage Statistics). Disabling stops further
 * events immediately; the already-loaded gtag library simply goes idle.
 *
 * GA4 property: "Folio app" (web data stream) — measurement ID below.
 */
export const GA_MEASUREMENT_ID: string = "G-RB09V42B9N";

const STORAGE_KEY = "folio-telemetry";

/** Tri-state consent: null = never asked, true/false = user's choice. */
export function telemetryConsent(storage: Storage = localStorage): boolean | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return null;
}

export function telemetryEnabled(storage: Storage = localStorage): boolean {
  return telemetryConsent(storage) === true;
}

export function setTelemetryConsent(enabled: boolean, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, enabled ? "on" : "off");
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** Inject gtag.js and configure GA (idempotent, consent-gated). */
export function initTelemetry(): void {
  if (initialized || !telemetryEnabled()) return;
  if (GA_MEASUREMENT_ID === "G-XXXXXXXXXX") return; // not configured yet
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Send a custom event (no-op without consent or configuration). */
export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}): void {
  if (!initialized || !window.gtag) return;
  window.gtag("event", name, params);
}
