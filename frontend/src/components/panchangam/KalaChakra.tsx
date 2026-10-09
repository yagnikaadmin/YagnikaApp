import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle, Path, Defs, RadialGradient, LinearGradient, Stop, G,
} from 'react-native-svg';
import { AUSPICIOUS_KALAS, KalaEntry, pick } from '@/src/lib/panchangam';

/* Ornate Kala Chakra — SVG rings/wedges + an RN overlay for every label and
   the hub, so text stays crisp on Android and the clock re-renders every
   second. `refDate` is the day being viewed; the hub clock is live when that
   day is today, otherwise it shows that date with a static dash. */

const VB = 320;                 // svg viewBox units
const C = VB / 2;               // centre
const R_HUB = 58;
const R_IN = 62;
const R_OUT = 134;
const R_RIM_OUT = 152;
const R_LABEL = 99;             // label ring (viewBox units)

const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

const wedgePath = (ri: number, ro: number, a0: number, a1: number) => {
  const [x0o, y0o] = polar(ro, a0);
  const [x1o, y1o] = polar(ro, a1);
  const [x0i, y0i] = polar(ri, a0);
  const [x1i, y1i] = polar(ri, a1);
  return `M ${x0o} ${y0o} A ${ro} ${ro} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ri} ${ri} 0 0 0 ${x0i} ${y0i} Z`;
};

export default function KalaChakra({
  kalas, refDate, activeId, lang, size = 320,
}: {
  kalas: KalaEntry[];
  refDate: Date;          // the day being viewed
  activeId?: string | null;
  lang: string;
  size?: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = new Date();
  const isToday =
    refDate.getFullYear() === today.getFullYear() &&
    refDate.getMonth() === today.getMonth() &&
    refDate.getDate() === today.getDate();

  const clock = isToday
    ? now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' })
    : '— : —';
  const dateStr = refDate
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    .toUpperCase();

  const n = kalas.length || 8;
  const step = 360 / n;
  const scale = size / VB;
  const px = (v: number) => v * scale;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <Defs>
          <RadialGradient id="kc-rim" cx="50%" cy="50%" r="50%">
            <Stop offset="82%" stopColor="#7A5218" />
            <Stop offset="88%" stopColor="#E8C063" />
            <Stop offset="93%" stopColor="#B9862F" />
            <Stop offset="100%" stopColor="#6E4A15" />
          </RadialGradient>
          <LinearGradient id="kc-good" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1E8046" />
            <Stop offset="100%" stopColor="#0C4C2A" />
          </LinearGradient>
          <LinearGradient id="kc-bad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#6E1C1C" />
            <Stop offset="100%" stopColor="#3A0C0C" />
          </LinearGradient>
          <RadialGradient id="kc-hub" cx="50%" cy="40%" r="65%">
            <Stop offset="0%" stopColor="#F0D089" />
            <Stop offset="55%" stopColor="#C79436" />
            <Stop offset="100%" stopColor="#7E561A" />
          </RadialGradient>
        </Defs>

        {/* rim */}
        <Circle cx={C} cy={C} r={R_RIM_OUT} fill="url(#kc-rim)" />
        <Circle cx={C} cy={C} r={R_OUT + 2} fill="none" stroke="#5A3B12" strokeWidth={1.5} />
        <Circle cx={C} cy={C} r={R_RIM_OUT - 1} fill="none" stroke="#F2D999" strokeWidth={1} opacity={0.5} />

        {/* wedges */}
        {kalas.map((k, i) => {
          const a0 = i * step - step / 2;
          const a1 = i * step + step / 2;
          const good = AUSPICIOUS_KALAS.has(k.id);
          const on = k.id === activeId;
          return (
            <G key={k.id}>
              <Path
                d={wedgePath(R_IN, R_OUT, a0, a1)}
                fill={good ? 'url(#kc-good)' : 'url(#kc-bad)'}
                opacity={activeId && !on ? 0.82 : 1}
              />
              {/* faint decorative arc inside the wedge */}
              <Path
                d={wedgePath(R_IN + 10, R_IN + 11, a0 + 3, a1 - 3)}
                fill="none"
                stroke={good ? '#8FD9AE' : '#D79B9B'}
                strokeWidth={0.75}
                opacity={0.35}
              />
              {on ? (
                <Path
                  d={wedgePath(R_IN, R_OUT, a0, a1)}
                  fill="none"
                  stroke="#FFE08A"
                  strokeWidth={3}
                />
              ) : null}
            </G>
          );
        })}

        {/* gold dividers */}
        {kalas.map((_, i) => {
          const a = i * step - step / 2;
          const [xi, yi] = polar(R_IN, a);
          const [xo, yo] = polar(R_OUT, a);
          return <Path key={`d${i}`} d={`M ${xi} ${yi} L ${xo} ${yo}`} stroke="#E7C878" strokeWidth={1.25} opacity={0.7} />;
        })}

        {/* hub */}
        <Circle cx={C} cy={C} r={R_HUB} fill="url(#kc-hub)" />
        <Circle cx={C} cy={C} r={R_HUB} fill="none" stroke="#6E4A15" strokeWidth={2} />
        <Circle cx={C} cy={C} r={R_HUB - 6} fill="none" stroke="#F6E3AE" strokeWidth={1} opacity={0.6} />
      </Svg>

      {/* --- overlay: wedge labels --- */}
      {kalas.map((k, i) => {
        const [lx, ly] = polar(R_LABEL, i * step);
        const good = AUSPICIOUS_KALAS.has(k.id);
        const periods = (k.time && k.time !== '---') ? k.time.split(' / ') : [];
        const W = 78;
        return (
          <View
            key={`lbl-${k.id}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: W,
              left: px(lx) - W / 2,
              top: px(ly) - 16,
              alignItems: 'center',
            }}
          >
            <Text style={[styles.lblName, { color: good ? '#EAF7EE' : '#F7E4E1' }]} numberOfLines={2}>
              {pick(k.name, lang).toUpperCase()}
            </Text>
            {periods.map((p, j) => (
              <Text key={j} style={styles.lblTime} numberOfLines={1}>{p.trim()}</Text>
            ))}
          </View>
        );
      })}

      {/* --- overlay: hub --- */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: px(R_HUB * 2),
          height: px(R_HUB * 2),
          left: px(C - R_HUB),
          top: px(C - R_HUB),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={styles.hubTime}>{clock}</Text>
        <Text style={styles.hubDate}>{dateStr}</Text>
        <Ionicons name="sunny" size={13} color="#FFF3D6" style={{ marginTop: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lblName: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  lblTime: { fontSize: 6.5, color: '#F3E6D9', textAlign: 'center', marginTop: 0.5 },
  hubTime: { fontSize: 17, fontWeight: '800', color: '#FFF7E6', fontVariant: ['tabular-nums'] },
  hubDate: { fontSize: 7.5, fontWeight: '700', color: 'rgba(255,247,230,0.85)', letterSpacing: 1, marginTop: 1 },
});
