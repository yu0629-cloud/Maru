import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type Props = {
  active: boolean;
  compact?: boolean;
};

/** 解析中にプリントをなぞっているように見せるスキャン線。操作は妨げない */
export function ScanSweep({ active, compact = false }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;
    if (!active || height <= 0) {
      progress.setValue(0);
      return;
    }

    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: compact ? 900 : 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [active, compact, height, progress]);

  if (!active) return null;

  const trail = compact ? 28 : 56;
  const line = compact ? 2 : 3;
  const travel = Math.max(height - line, 0);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        if (next > 0 && next !== height) setHeight(next);
      }}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(196, 71, 56, 0.12)" }]} />
      {height > 0 ? (
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: trail,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-trail, travel],
                }),
              },
            ],
          }}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(255, 255, 255, 0.16)" }} />
          <View
            style={{
              height: line,
              backgroundColor: "#F4E7E4",
              shadowColor: "#C44738",
              shadowOpacity: 0.9,
              shadowRadius: compact ? 4 : 8,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
