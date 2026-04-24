import { Injectable } from '@angular/core';

declare global {
  interface Window {
    /**
     * Android WebView host: `addJavascriptInterface(new BiometricBridge(), "HospitalAndroidBiometric")`
     * and `@JavascriptInterface public String captureTemplate()` etc.
     */
    HospitalAndroidBiometric?: {
      /** JSON: `{ ok, template_base64?, quality?, message? }` from desk app; legacy plain base64 still supported. */
      captureTemplate(): string;
      matchTemplates(jsonPayload: string): string;
    };
  }
}

export type FingerprintReferenceTemplate = {
  finger_index: string;
  template_base64: string;
};

/**
 * Fingerprint on **Android tablet**: a native host (WebView shell) injects `window.HospitalAndroidBiometric`
 * and talks to ZKFinger over USB OTG. Stock mobile browsers cannot access that USB stack.
 */
@Injectable({ providedIn: 'root' })
export class FingerprintReaderService {
  /** True when the Android host exposed the native capture API. */
  isConfigured(): boolean {
    return typeof window !== 'undefined' && typeof window.HospitalAndroidBiometric?.captureTemplate === 'function';
  }

  /** Android Chrome/Firefox (not embedded WebView) — no ZK USB bridge. */
  isAndroidStandaloneBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (!/Android/i.test(ua)) return false;
    // Android System WebView / embedded browsers often include "; wv)" in the UA.
    if (/\bwv\)/i.test(ua)) return false;
    return /Chrome\/|Firefox\//i.test(ua);
  }

  /**
   * User-facing explanation when `HospitalAndroidBiometric` is missing (e.g. opened Angular in Chrome).
   */
  bridgeMissingMessage(): string {
    if (this.isAndroidStandaloneBrowser()) {
      return (
        'Chrome on Android cannot use the ZK USB thumb reader. Build the Ticketing Desk app in finger-driver/ticketing-desk-reader ' +
        '(npm run syncZkfinger && npm run assembleRelease in finger-driver/) and open this desk URL there.'
      );
    }
    return (
      'No thumb reader bridge (HospitalAndroidBiometric). Use the Ticketing Desk WebView app — finger-driver/ticketing-desk-reader (see finger-driver/README.txt).'
    );
  }

  private native(): NonNullable<Window['HospitalAndroidBiometric']> {
    const b = typeof window !== 'undefined' ? window.HospitalAndroidBiometric : undefined;
    if (!b?.captureTemplate) {
      throw new Error(this.bridgeMissingMessage());
    }
    return b;
  }

  /**
   * Ask native code to capture one thumb (vendor template as base64).
   * Desk APK returns JSON with quality; older hosts may return raw base64 only.
   */
  async captureTemplate(): Promise<{ template_base64: string; quality?: number }> {
    const rawNative = this.native().captureTemplate();
    const trimmed = typeof rawNative === 'string' ? rawNative.trim() : String(rawNative).trim();
    if (!trimmed) {
      throw new Error('Thumb scan returned nothing. Try again on the reader.');
    }
    if (trimmed.startsWith('{')) {
      const j = JSON.parse(trimmed) as {
        ok?: boolean;
        template_base64?: string;
        quality?: number;
        message?: string;
      };
      if (!j.ok) {
        const code = j.message ?? 'failed';
        if (code === 'low_quality') {
          throw new Error(
            `Thumb placement or image quality was too low (score ${j.quality ?? '—'}). Press the thumb flat on the reader and try again.`,
          );
        }
        if (code === 'sensor_not_ready') {
          throw new Error('Thumb reader is not ready. Check USB, then reopen the desk app.');
        }
        throw new Error('Thumb scan did not complete. Try again.');
      }
      const template_base64 = (j.template_base64 ?? '').trim();
      if (!template_base64) {
        throw new Error('Thumb scan did not return a template. Try again.');
      }
      return { template_base64, quality: j.quality };
    }
    return { template_base64: trimmed };
  }

  /**
   * Capture live on reader and match against stored templates (SDK-side). Verify uses **right thumb** templates only.
   */
  async matchTemplates(
    reference_templates: FingerprintReferenceTemplate[],
  ): Promise<{ matched: boolean; reason?: string }> {
    const b = this.native();
    if (typeof b.matchTemplates !== 'function') {
      throw new Error('HospitalAndroidBiometric.matchTemplates is not implemented on this host.');
    }
    const rights = reference_templates.filter((t) => t.finger_index === 'right_thumb');
    const payload = JSON.stringify({ reference_templates: rights });
    const raw = b.matchTemplates(payload);
    const text = typeof raw === 'string' ? raw.trim() : String(raw);
    const j = JSON.parse(text) as { matched?: boolean; Matched?: boolean; reason?: string };
    const m = j.matched ?? j.Matched;
    if (typeof m !== 'boolean') {
      throw new Error('matchTemplates must return JSON with boolean "matched"');
    }
    return { matched: m, reason: typeof j.reason === 'string' ? j.reason : undefined };
  }
}
