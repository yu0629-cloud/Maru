import { useRef, useState, type ReactNode } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Transform = { scale: number; x: number; y: number };

function pinchDistance(touches: Array<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

export function ZoomableView({
  children,
  onInteractionChange,
}: {
  children: ReactNode;
  onInteractionChange?: (active: boolean) => void;
}) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const layout = useRef({ width: 1, height: 1 });
  const current = useRef(transform);
  current.current = transform;
  const start = useRef({ scale: 1, x: 0, y: 0, dist: 1 });
  const interacting = useRef(false);

  const setActive = (active: boolean) => {
    if (interacting.current === active) return;
    interacting.current = active;
    onInteractionChange?.(active);
  };

  const clampPan = (scale: number, x: number, y: number): Transform => {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const maxX = (layout.current.width * (nextScale - 1)) / 2;
    const maxY = (layout.current.height * (nextScale - 1)) / 2;
    return {
      scale: nextScale,
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (event, gesture) =>
        event.nativeEvent.touches.length >= 2 ||
        (current.current.scale > 1.02 && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6)),
      onPanResponderGrant: (event) => {
        const touches = event.nativeEvent.touches;
        start.current = {
          scale: current.current.scale,
          x: current.current.x,
          y: current.current.y,
          dist: Math.max(pinchDistance(touches), 1),
        };
        if (touches.length >= 2 || current.current.scale > 1.02) setActive(true);
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = Math.max(pinchDistance(touches), 1);
          const nextScale = start.current.scale * (dist / start.current.dist);
          setTransform(clampPan(nextScale, start.current.x, start.current.y));
          return;
        }
        if (current.current.scale > 1.02) {
          setTransform(clampPan(current.current.scale, start.current.x + gesture.dx, start.current.y + gesture.dy));
        }
      },
      onPanResponderRelease: () => {
        if (current.current.scale <= 1.02) {
          setTransform({ scale: 1, x: 0, y: 0 });
          setActive(false);
          return;
        }
        setActive(true);
      },
      onPanResponderTerminate: () => {
        if (current.current.scale <= 1.02) setActive(false);
      },
    }),
  ).current;

  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        layout.current = event.nativeEvent.layout;
      }}
      {...responder.panHandlers}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.fill,
          {
            transform: [
              { translateX: transform.x },
              { translateY: transform.y },
              { scale: transform.scale },
            ],
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
