package com.ticketing.desk;

import android.app.Activity;
import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.util.Base64;
import android.util.Log;

import com.zkteco.android.biometric.FingerprintExceptionListener;
import com.zkteco.android.biometric.core.device.ParameterHelper;
import com.zkteco.android.biometric.core.device.TransportType;
import com.zkteco.android.biometric.core.utils.LogHelper;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintCaptureListener;
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintSensor;
import com.zkteco.android.biometric.module.fingerprintreader.FingprintFactory;
import com.zkteco.android.biometric.module.fingerprintreader.ZKFingerService;
import com.zkteco.android.biometric.module.fingerprintreader.exception.FingerprintException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Minimal ZKFinger USB flow for desk WebView: warm-up on launch, then capture / match for Angular
 * {@code window.HospitalAndroidBiometric}.
 */
public class DeskFingerprintController {
    private static final String TAG = "DeskFingerprint";
    private static final int ZKTECO_VID = 0x1b55;
    /** Live20R, Live10R, ZK9500 (common); extend if your model uses another PID. */
    private static final int[] KNOWN_PIDS = new int[]{0x0120, 0x0124, 0x0101};

    private final Activity activity;
    private final Context appContext;
    private ZkUsbManager zkUsbManager;
    private FingerprintSensor fingerprintSensor;
    private int usbPid = 0;
    private final int deviceIndex = 0;
    private volatile boolean sensorStarted = false;
    private boolean isReseted = false;

    private final LinkedBlockingQueue<String> captureQueue = new LinkedBlockingQueue<>(2);

    private final ZkUsbManagerListener usbListener = new ZkUsbManagerListener() {
        @Override
        public void onCheckPermission(int result) {
            if (result == 0) {
                activity.runOnUiThread(DeskFingerprintController.this::startSensorAfterPermission);
            } else {
                Log.e(TAG, "USB permission failed code=" + result);
            }
        }

        @Override
        public void onUSBArrived(UsbDevice device) {
            if (sensorStarted) {
                activity.runOnUiThread(() -> {
                    stopSensorQuietly();
                    tryOpenUsbAndSensor();
                });
            }
        }

        @Override
        public void onUSBRemoved(UsbDevice device) {
            sensorStarted = false;
        }
    };

    private final FingerprintExceptionListener fingerprintExceptionListener = new FingerprintExceptionListener() {
        @Override
        public void onDeviceException() {
            LogHelper.e("ZKFinger USB exception");
            if (!isReseted && fingerprintSensor != null) {
                try {
                    fingerprintSensor.openAndReboot(deviceIndex);
                } catch (FingerprintException e) {
                    Log.e(TAG, "reboot", e);
                }
                isReseted = true;
            }
        }
    };

    private final FingerprintCaptureListener fingerprintCaptureListener = new FingerprintCaptureListener() {
        @Override
        public void captureOK(byte[] fpImage) {
        }

        @Override
        public void captureError(FingerprintException e) {
        }

        @Override
        public void extractOK(byte[] fpTemplate) {
            String b64 = Base64.encodeToString(fpTemplate, 0, fpTemplate.length, Base64.NO_WRAP);
            try {
                captureQueue.offer(b64, 200, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        @Override
        public void extractError(int i) {
            try {
                captureQueue.offer("", 200, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    };

    public DeskFingerprintController(Activity activity) {
        this.activity = activity;
        this.appContext = activity.getApplicationContext();
    }

    public void onCreateRegisterUsb() {
        zkUsbManager = new ZkUsbManager(appContext, usbListener);
        zkUsbManager.registerUSBPermissionReceiver();
        activity.getWindow().getDecorView().postDelayed(this::tryOpenUsbAndSensor, 400);
    }

    public void onDestroy() {
        stopSensorQuietly();
        if (zkUsbManager != null) {
            zkUsbManager.unRegisterUSBPermissionReceiver();
        }
    }

    public boolean isSensorReady() {
        return sensorStarted;
    }

    private boolean enumSensor() {
        UsbManager usbManager = (UsbManager) appContext.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            return false;
        }
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (device.getVendorId() != ZKTECO_VID) {
                continue;
            }
            int pid = device.getProductId();
            for (int known : KNOWN_PIDS) {
                if (pid == known) {
                    usbPid = pid;
                    return true;
                }
            }
        }
        return false;
    }

    private void tryOpenUsbAndSensor() {
        if (sensorStarted) {
            return;
        }
        if (!enumSensor()) {
            Log.w(TAG, "No ZKTeco USB reader (VID 1b55) detected — check OTG and supported models (Live20R / ZK9500 / etc.).");
            return;
        }
        zkUsbManager.initUSBPermission(ZKTECO_VID, usbPid);
    }

    private void createFingerprintSensor() {
        if (fingerprintSensor != null) {
            FingprintFactory.destroy(fingerprintSensor);
            fingerprintSensor = null;
        }
        LogHelper.setLevel(Log.WARN);
        Map<String, Object> deviceParams = new HashMap<>();
        deviceParams.put(ParameterHelper.PARAM_KEY_VID, ZKTECO_VID);
        deviceParams.put(ParameterHelper.PARAM_KEY_PID, usbPid);
        fingerprintSensor = FingprintFactory.createFingerprintSensor(appContext, TransportType.USB, deviceParams);
    }

    private void startSensorAfterPermission() {
        if (sensorStarted) {
            return;
        }
        try {
            createFingerprintSensor();
            isReseted = false;
            fingerprintSensor.open(deviceIndex);
            fingerprintSensor.setFingerprintCaptureListener(deviceIndex, fingerprintCaptureListener);
            fingerprintSensor.SetFingerprintExceptionListener(fingerprintExceptionListener);
            fingerprintSensor.startCapture(deviceIndex);
            sensorStarted = true;
            Log.i(TAG, "ZKFinger sensor started");
        } catch (FingerprintException e) {
            Log.e(TAG, "start sensor", e);
            try {
                if (fingerprintSensor != null) {
                    fingerprintSensor.openAndReboot(deviceIndex);
                }
            } catch (FingerprintException ex) {
                Log.e(TAG, "reboot", ex);
            }
        }
    }

    private void stopSensorQuietly() {
        if (fingerprintSensor == null || !sensorStarted) {
            return;
        }
        try {
            fingerprintSensor.stopCapture(deviceIndex);
            fingerprintSensor.close(deviceIndex);
        } catch (FingerprintException e) {
            Log.e(TAG, "stop", e);
        }
        sensorStarted = false;
    }

    /**
     * Blocks calling thread until finger scan or timeout. Call from WebView bridge thread (not UI).
     */
    public String captureTemplateBlocking() {
        if (!sensorStarted) {
            activity.runOnUiThread(this::tryOpenUsbAndSensor);
            for (int i = 0; i < 40 && !sensorStarted; i++) {
                sleepMs(250);
            }
        }
        if (!sensorStarted) {
            return "";
        }
        captureQueue.clear();
        try {
            String v = captureQueue.poll(120, TimeUnit.SECONDS);
            return v != null ? v : "";
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "";
        }
    }

    private static void sleepMs(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public String matchTemplatesBlocking(String jsonPayload) {
        try {
            JSONObject root = new JSONObject(jsonPayload);
            JSONArray arr = root.getJSONArray("reference_templates");
            if (arr.length() == 0) {
                return "{\"matched\":false}";
            }
            String liveB64 = captureTemplateBlocking();
            if (liveB64 == null || liveB64.isEmpty()) {
                return "{\"matched\":false}";
            }
            byte[] live = Base64.decode(liveB64, Base64.NO_WRAP);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String refB64 = o.optString("template_base64", "");
                if (refB64.isEmpty()) {
                    continue;
                }
                byte[] ref = Base64.decode(refB64, Base64.NO_WRAP);
                double score = ZKFingerService.verify(live, ref);
                if (score > 70) {
                    return "{\"matched\":true}";
                }
            }
            return "{\"matched\":false}";
        } catch (Exception e) {
            Log.e(TAG, "matchTemplates", e);
            return "{\"matched\":false}";
        }
    }
}
