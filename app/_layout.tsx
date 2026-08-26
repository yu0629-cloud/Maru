import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthSessionBootstrap } from "@/src/features/auth/AuthBootstrap";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <AuthSessionBootstrap />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
