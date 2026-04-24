import { Injectable } from '@angular/core';

declare global {
  interface Window {
    /**
     * Android WebView host: `addJavascriptInterface(new BiometricBridge(), "HospitalAndroidBiometric")`
     * and `@JavascriptInterface public String captureTemplate()` etc.
     */
    HospitalAndroidBiometric?: {
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
 * Fingerprint on **Android tablet**: the host WebView injects `window.HospitalAndroidBiometric`
 * (ZKFinger / USB reader runs in native code). Browsers cannot read the reader directly.
 */
@Injectable({ providedIn: 'root' })
export class FingerprintReaderService {
  /** True when the Android host exposed the native capture API. */
  isConfigured(): boolean {
    return typeof window !== 'undefined' && typeof window.HospitalAndroidBiometric?.captureTemplate === 'function';
  }

  private native(): NonNullable<Window['HospitalAndroidBiometric']> {
    const b = typeof window !== 'undefined' ? window.HospitalAndroidBiometric : undefined;
    if (!b?.captureTemplate) {
      throw new Error(
        'No fingerprint reader on this device. Open the registration desk app in the hospital Android tablet WebView that provides HospitalAndroidBiometric.captureTemplate().',
      );
    }
    return b;
  }

  /** Ask native code to capture one finger (vendor template as base64). */
  async captureTemplate(): Promise<{ template_base64: string }> {
    const raw = this.native().captureTemplate();
    const template_base64 = typeof raw === 'string' ? raw.trim() : String(raw);
    if (!template_base64) throw new Error('captureTemplate returned an empty string');
    return { template_base64 };
  }

  /**
   * Ask native code to capture live and match against stored templates (SDK-side compare).
   */
  async matchTemplates(reference_templates: FingerprintReferenceTemplate[]): Promise<{ matched: boolean }> {
    const b = this.native();
    if (typeof b.matchTemplates !== 'function') {
      throw new Error('HospitalAndroidBiometric.matchTemplates is not implemented on this host.');
    }
    const payload = JSON.stringify({ reference_templates });
    const raw = b.matchTemplates(payload);
    const text = typeof raw === 'string' ? raw.trim() : String(raw);
    const j = JSON.parse(text) as { matched?: boolean; Matched?: boolean };
    const m = j.matched ?? j.Matched;
    if (typeof m !== 'boolean') throw new Error('matchTemplates must return JSON with boolean "matched"');
    return { matched: m };
  }
}
