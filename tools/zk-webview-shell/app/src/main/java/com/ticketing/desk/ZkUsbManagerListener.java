package com.ticketing.desk;

import android.hardware.usb.UsbDevice;

public interface ZkUsbManagerListener {
    void onCheckPermission(int result);

    void onUSBArrived(UsbDevice device);

    void onUSBRemoved(UsbDevice device);
}
