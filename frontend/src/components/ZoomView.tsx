import React, { useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';
import {
  PinchGestureHandler, PanGestureHandler, State,
} from 'react-native-gesture-handler';

/* Pinch-to-zoom wrapper for a whole screen/tab. Two-finger pinch scales the
   children (1x–maxScale); once zoomed, a one-finger drag pans. Pinching back
   to ~1x resets. The pan handler is disabled while not zoomed so it never
   steals horizontal swipes from a pager underneath. Legacy gesture-handler
   API + RN Animated — no reanimated dependency. */

export default function ZoomView({
  children,
  onZoomChange,
  maxScale = 3,
  style,
}: {
  children: React.ReactNode;
  onZoomChange?: (zoomed: boolean) => void;
  maxScale?: number;
  style?: any;
}) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const lastScale = useRef(1);

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const lastX = useRef(0);
  const lastY = useRef(0);

  const [zoomed, setZoomed] = React.useState(false);
  const report = (z: boolean) => { setZoomed(z); onZoomChange?.(z); };

  const onPinch = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPan = Animated.event(
    [{ nativeEvent: { translationX: tx, translationY: ty } }],
    { useNativeDriver: true },
  );

  const reset = () => {
    lastScale.current = 1; lastX.current = 0; lastY.current = 0;
    pinchScale.setValue(1);
    tx.setOffset(0); tx.setValue(0);
    ty.setOffset(0); ty.setValue(0);
    Animated.parallel([
      Animated.spring(baseScale, { toValue: 1, useNativeDriver: true, bounciness: 3 }),
      Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 3 }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 3 }),
    ]).start();
    report(false);
  };

  const onPinchState = (e: any) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.max(1, Math.min(maxScale, lastScale.current * e.nativeEvent.scale));
      lastScale.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      if (next <= 1.02) reset();
      else report(true);
    }
  };

  const onPanState = (e: any) => {
    if (e.nativeEvent.oldState === State.ACTIVE && lastScale.current > 1.02) {
      lastX.current += e.nativeEvent.translationX;
      lastY.current += e.nativeEvent.translationY;
      tx.setOffset(lastX.current); tx.setValue(0);
      ty.setOffset(lastY.current); ty.setValue(0);
    }
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      simultaneousHandlers={panRef}
      onGestureEvent={onPinch}
      onHandlerStateChange={onPinchState}
    >
      <Animated.View style={[styles.fill, style]}>
        <PanGestureHandler
          ref={panRef}
          enabled={zoomed}
          minPointers={1}
          maxPointers={1}
          avgTouches
          simultaneousHandlers={pinchRef}
          onGestureEvent={onPan}
          onHandlerStateChange={onPanState}
        >
          <Animated.View
            style={[styles.fill, { transform: [{ scale }, { translateX: tx }, { translateY: ty }] }]}
          >
            {children}
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </PinchGestureHandler>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, overflow: 'hidden' } });
