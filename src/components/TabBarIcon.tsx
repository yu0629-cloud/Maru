import { memo } from "react";
import { View } from "react-native";

const ICONS = ["home", "camera", "review", "carte", "settings"] as const;
export type TabBarIconName = (typeof ICONS)[number];

export const TabBarIcon = memo(function TabBarIcon({
  name,
  color,
  size,
  focused,
}: {
  name: TabBarIconName;
  color: string;
  size: number;
  focused: boolean;
}) {
  const stroke = Math.max(1.6, size * 0.08);
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {name === "home" ? <HomeIcon color={color} size={size} stroke={stroke} filled={focused} /> : null}
      {name === "camera" ? <CameraIcon color={color} size={size} stroke={stroke} filled={focused} /> : null}
      {name === "review" ? <BookIcon color={color} size={size} stroke={stroke} filled={focused} /> : null}
      {name === "carte" ? <ClipboardIcon color={color} size={size} stroke={stroke} filled={focused} /> : null}
      {name === "settings" ? <SettingsIcon color={color} size={size} stroke={stroke} filled={focused} /> : null}
    </View>
  );
});

function HomeIcon({
  color,
  size,
  stroke,
  filled,
}: {
  color: string;
  size: number;
  stroke: number;
  filled: boolean;
}) {
  const w = size * 0.72;
  const roofH = size * 0.32;
  const bodyW = size * 0.46;
  const bodyH = size * 0.34;
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: w / 2,
          borderRightWidth: w / 2,
          borderBottomWidth: roofH,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          marginTop: -stroke,
          backgroundColor: filled ? color : "transparent",
          borderWidth: stroke,
          borderColor: color,
          borderTopWidth: 0,
        }}
      />
    </View>
  );
}

function CameraIcon({
  color,
  size,
  stroke,
  filled,
}: {
  color: string;
  size: number;
  stroke: number;
  filled: boolean;
}) {
  const bodyW = size * 0.78;
  const bodyH = size * 0.52;
  const lens = size * 0.26;
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: size * 0.22,
          height: size * 0.1,
          backgroundColor: color,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }}
      />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: 5,
          backgroundColor: filled ? color : "transparent",
          borderWidth: stroke,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            backgroundColor: filled ? "#F7F4EE" : "transparent",
            borderWidth: stroke,
            borderColor: filled ? "#F7F4EE" : color,
          }}
        />
      </View>
    </View>
  );
}

function BookIcon({
  color,
  size,
  stroke,
  filled,
}: {
  color: string;
  size: number;
  stroke: number;
  filled: boolean;
}) {
  const pageW = size * 0.3;
  const pageH = size * 0.62;
  const page = {
    width: pageW,
    height: pageH,
    borderWidth: stroke,
    borderColor: color,
    backgroundColor: filled ? color : "transparent",
  };
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ ...page, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderRightWidth: stroke / 2 }} />
      <View style={{ ...page, borderTopRightRadius: 3, borderBottomRightRadius: 3, borderLeftWidth: stroke / 2 }} />
    </View>
  );
}

function ClipboardIcon({
  color,
  size,
  stroke,
  filled,
}: {
  color: string;
  size: number;
  stroke: number;
  filled: boolean;
}) {
  const clipW = size * 0.34;
  const clipH = size * 0.14;
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: clipW,
          height: clipH,
          borderRadius: 3,
          backgroundColor: color,
          zIndex: 1,
        }}
      />
      <View
        style={{
          width: size * 0.58,
          height: size * 0.62,
          marginTop: -clipH / 2,
          borderRadius: 4,
          backgroundColor: filled ? color : "transparent",
          borderWidth: stroke,
          borderColor: color,
          paddingTop: clipH * 0.7,
          alignItems: "center",
          gap: size * 0.08,
        }}
      >
        <View
          style={{
            width: size * 0.32,
            height: stroke,
            backgroundColor: filled ? "#F7F4EE" : color,
            borderRadius: 1,
          }}
        />
        <View
          style={{
            width: size * 0.26,
            height: stroke,
            backgroundColor: filled ? "#F7F4EE" : color,
            borderRadius: 1,
          }}
        />
      </View>
    </View>
  );
}

function SettingsIcon({
  color,
  size,
  stroke,
  filled,
}: {
  color: string;
  size: number;
  stroke: number;
  filled: boolean;
}) {
  const rowW = size * 0.7;
  const knob = size * 0.16;
  return (
    <View style={{ height: size * 0.7, justifyContent: "space-between" }}>
      {[0.28, 0.58, 0.42].map((offset, index) => (
        <View key={index} style={{ width: rowW, height: stroke * 1.4, justifyContent: "center" }}>
          <View style={{ height: stroke, backgroundColor: color, borderRadius: 99 }} />
          <View
            style={{
              position: "absolute",
              left: rowW * offset - knob / 2,
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              backgroundColor: filled ? color : "#F7F4EE",
              borderWidth: stroke,
              borderColor: color,
            }}
          />
        </View>
      ))}
    </View>
  );
}
