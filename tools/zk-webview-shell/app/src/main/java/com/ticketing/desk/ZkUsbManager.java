package com.ticketing.desk;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import java.util.Random;

/**
 * USB permission + hotplug for ZKTeco readers (VID 0x1b55).
 * Adapted from zk_finger_10 (MIT) — https://github.com/Mamasodikov/zk_finger_10
 */
public class ZkUsbManager {
    private static final String TAG = "ZkUsbManager";
    private int vid = 0x1b55;
    private int pid = 0;
    private final Context mContext;
    private static final String SOURCE_STRING = "0123456789-_abcdefghigklmnopqrstuvwxyzABCDEFGHIGKLMNOPQRSTUVWXYZ";
    private static final int DEFAULT_LENGTH = 16;
    private String actionUsbPermission;
    private boolean receiverRegistered = false;
    private final ZkUsbManagerListener listener;

    private final BroadcastReceiver usbMgrReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            UsbManager usbManager = (UsbManager) mContext.getSystemService(Context.USB_SERVICE);
            UsbDevice usbDevice = null;
            if (usbManager != null) {
                for (UsbDevice device : usbManager.getDeviceList().values()) {
                    if (device.getVendorId() == vid && device.getProductId() == pid) {
                        usbDevice = device;
                        break;
                    }
                }
            }

            if (actionUsbPermission.equals(action) && usbDevice != null) {
                if (usbDevice.getVendorId() == vid && usbDevice.getProductId() == pid) {
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        listener.onCheckPermission(0);
                    } else {
                        listener.onCheckPermission(-2);
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                UsbDevice device = getParcelableDevice(intent);
                if (device != null && device.getVendorId() == vid && device.getProductId() == pid) {
                    listener.onUSBArrived(device);
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice device = getParcelableDevice(intent);
                if (device != null && device.getVendorId() == vid && device.getProductId() == pid) {
                    listener.onUSBRemoved(device);
                }
            }
        }
    };

    private static UsbDevice getParcelableDevice(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
        }
        return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
    }

    public ZkUsbManager(@NonNull Context context, @NonNull ZkUsbManagerListener listener) {
        if (listener == null) {
            throw new NullPointerException("listener");
        }
        this.mContext = context.getApplicationContext();
        this.listener = listener;
        this.actionUsbPermission = randomString(SOURCE_STRING, DEFAULT_LENGTH);
    }

    private static String randomString(String source, int length) {
        StringBuilder result = new StringBuilder();
        Random random = new Random();
        for (int i = 0; i < length; i++) {
            result.append(source.charAt(random.nextInt(source.length())));
        }
        return result.toString();
    }

    public boolean registerUSBPermissionReceiver() {
        if (receiverRegistered) {
            return false;
        }
        IntentFilter filter = new IntentFilter();
        filter.addAction(actionUsbPermission);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            mContext.registerReceiver(usbMgrReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            mContext.registerReceiver(usbMgrReceiver, filter);
        }
        receiverRegistered = true;
        Log.d(TAG, "USB receiver registered");
        return true;
    }

    public void unRegisterUSBPermissionReceiver() {
        if (!receiverRegistered) {
            return;
        }
        try {
            mContext.unregisterReceiver(usbMgrReceiver);
        } catch (Exception ignored) {
        }
        receiverRegistered = false;
    }

    /** 0 success, -1 device not found, -2 permission denied */
    public void initUSBPermission(int vid, int pid) {
        UsbManager usbManager = (UsbManager) mContext.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            listener.onCheckPermission(-1);
            return;
        }
        UsbDevice usbDevice = null;
        for (UsbDevice device : usbManager.getDeviceList().values()) {
            if (device.getVendorId() == vid && device.getProductId() == pid) {
                usbDevice = device;
                break;
            }
        }
        if (usbDevice == null) {
            listener.onCheckPermission(-1);
            return;
        }
        this.vid = vid;
        this.pid = pid;
        if (!usbManager.hasPermission(usbDevice)) {
            Intent intent = new Intent(actionUsbPermission);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getBroadcast(mContext, 0, intent, flags);
            usbManager.requestPermission(usbDevice, pendingIntent);
        } else {
            listener.onCheckPermission(0);
        }
    }
}
