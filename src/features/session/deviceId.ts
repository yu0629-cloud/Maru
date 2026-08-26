import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Device from "expo-device";

const STORAGE_KEY = "maru.device_id";

function randomId() {
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceId() {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const next = randomId();
  await AsyncStorage.setItem(STORAGE_KEY, next);
  return next;
}

export function getDeviceMeta() {
  return {
    deviceName: Device.deviceName ?? Platform.OS,
    platform: Platform.OS,
  };
}
