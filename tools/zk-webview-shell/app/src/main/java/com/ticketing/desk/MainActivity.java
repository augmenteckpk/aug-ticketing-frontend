package com.ticketing.desk;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Loads the Angular desk URL and exposes {@link HospitalAndroidBiometric} for ZKFinger USB (OTG).
 */
public class MainActivity extends AppCompatActivity {

    private DeskFingerprintController fingerprintController;
    private WebView webView;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);

        fingerprintController = new DeskFingerprintController(this);
        fingerprintController.onCreateRegisterUsb();

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                return false;
            }
        });

        webView.addJavascriptInterface(
                new HospitalAndroidBiometric(fingerprintController),
                "HospitalAndroidBiometric");

        webView.loadUrl(BuildConfig.DESK_URL);
    }

    @Override
    protected void onDestroy() {
        if (fingerprintController != null) {
            fingerprintController.onDestroy();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
