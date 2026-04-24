package com.ticketing.desk;

import android.webkit.JavascriptInterface;

import androidx.annotation.Keep;

/**
 * Injected as {@code window.HospitalAndroidBiometric} — matches Angular {@code FingerprintReaderService}.
 */
@Keep
public class HospitalAndroidBiometric {
    private final DeskFingerprintController controller;

    public HospitalAndroidBiometric(DeskFingerprintController controller) {
        this.controller = controller;
    }

    @JavascriptInterface
    public String captureTemplate() {
        try {
            return controller.captureTemplateBlocking();
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String matchTemplates(String jsonPayload) {
        try {
            return controller.matchTemplatesBlocking(jsonPayload);
        } catch (Exception e) {
            return "{\"matched\":false}";
        }
    }
}
