import { beforeEach, describe, expect, it } from "vitest";
import {
  GA_MEASUREMENT_ID,
  setTelemetryConsent,
  telemetryConsent,
  telemetryEnabled,
} from "../src/telemetry";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("telemetry consent", () => {
  beforeEach(() => {
    // module is stateless apart from the passed storage
  });

  it("starts undecided (null) with no stored choice", () => {
    expect(telemetryConsent(fakeStorage())).toBeNull();
    expect(telemetryEnabled(fakeStorage())).toBe(false);
  });

  it("persists an explicit opt-in", () => {
    const storage = fakeStorage();
    setTelemetryConsent(true, storage);
    expect(telemetryConsent(storage)).toBe(true);
    expect(telemetryEnabled(storage)).toBe(true);
  });

  it("persists an explicit opt-out", () => {
    const storage = fakeStorage();
    setTelemetryConsent(false, storage);
    expect(telemetryConsent(storage)).toBe(false);
    expect(telemetryEnabled(storage)).toBe(false);
  });

  it("reads stored values back", () => {
    expect(telemetryConsent(fakeStorage({ "folio-telemetry": "on" }))).toBe(true);
    expect(telemetryConsent(fakeStorage({ "folio-telemetry": "off" }))).toBe(false);
    expect(telemetryConsent(fakeStorage({ "folio-telemetry": "garbage" }))).toBeNull();
  });

  it("has a real GA4 measurement ID configured", () => {
    // Guards against accidentally shipping analytics to the placeholder or
    // an unconfigured property.
    expect(GA_MEASUREMENT_ID).toMatch(/^G-[0-9A-Z]+$/);
    expect(GA_MEASUREMENT_ID).not.toBe("G-XXXXXXXXXX");
  });
});
