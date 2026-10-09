import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { colors } from '@/src/theme';
import { pick } from '@/src/lib/panchangam';

/* 2D Sky View — an alt-azimuth "looking up" map. Centre = zenith, rim =
   horizon; azimuth 0 (North) at top, clockwise. Planets below the horizon
   sit dimmed on the rim. */

const PLANET_COLOR: Record<string, string> = {
  sun: '#F6A81C', moon: '#C9C9D6', mars: '#D8542E', mercury: '#7BA05B',
  jupiter: '#E0B24C', venus: '#E8D08B', saturn: '#6E7CA8', rahu: '#5B5B5B', ketu: '#8A6A4A',
};
const ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu'];

export default function SkyMap({
  planets, lang, dirLabels, size = 300,
}: {
  planets: Record<string, { name: any; azimuth: number; altitude: number; above_horizon: boolean }>;
  lang: string;
  dirLabels: { n: string; e: string; s: string; w: string };
  size?: number;
}) {
  const VB = 300, C = VB / 2, R = 128;

  const pos = (az: number, alt: number) => {
    const rr = R * (1 - Math.max(0, Math.min(90, alt)) / 90); // 0 alt -> rim, 90 -> centre
    const a = ((az - 90) * Math.PI) / 180;                    // 0 az at top
    return [C + rr * Math.cos(a), C + rr * Math.sin(a)] as const;
  };

  const items = ORDER.map((k) => (planets?.[k] ? { k, ...planets[k] } : null)).filter(Boolean) as any[];

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Circle cx={C} cy={C} r={R} fill="#141A2E" />
          <Circle cx={C} cy={C} r={R} fill="none" stroke={colors.amber700} strokeWidth={2} />
          <Circle cx={C} cy={C} r={R * 0.66} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          <Circle cx={C} cy={C} r={R * 0.33} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          <Line x1={C} y1={C - R} x2={C} y2={C + R} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <Line x1={C - R} y1={C} x2={C + R} y2={C} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <Circle cx={C} cy={C} r={2.5} fill="#8FA9D8" />
          {items.map((p) => {
            const [x, y] = pos(p.azimuth, p.altitude);
            const on = p.above_horizon;
            return (
              <G key={p.k} opacity={on ? 1 : 0.35}>
                <Circle cx={x} cy={y} r={p.k === 'sun' ? 7 : 5} fill={PLANET_COLOR[p.k] || '#fff'} />
              </G>
            );
          })}
        </Svg>

        {/* labels overlaid so they stay crisp */}
        <Text style={[styles.dir, { top: 2, left: 0, right: 0, textAlign: 'center' }]}>{dirLabels.n}</Text>
        <Text style={[styles.dir, { bottom: 2, left: 0, right: 0, textAlign: 'center' }]}>{dirLabels.s}</Text>
        <Text style={[styles.dir, { left: 2, top: 0, bottom: 0, textAlignVertical: 'center' }]}>{dirLabels.w}</Text>
        <Text style={[styles.dir, { right: 2, top: 0, bottom: 0, textAlign: 'right', textAlignVertical: 'center' }]}>{dirLabels.e}</Text>
        {items.map((p) => {
          const [x, y] = pos(p.azimuth, p.altitude);
          const sc = size / VB;
          return (
            <Text
              key={`l-${p.k}`}
              pointerEvents="none"
              style={{
                position: 'absolute', left: x * sc + 8, top: y * sc - 6,
                fontSize: 9, fontWeight: '700', color: '#EAE3D2',
              }}
              numberOfLines={1}
            >
              {pick(p.name, lang)}
            </Text>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        {items.map((p) => (
          <View key={p.k} style={styles.legItem}>
            <View style={[styles.dot, { backgroundColor: PLANET_COLOR[p.k] || '#fff' }]} />
            <Text style={styles.legText}>{pick(p.name, lang)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dir: { position: 'absolute', fontSize: 11, fontWeight: '800', color: colors.amber700 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legText: { fontSize: 10.5, color: colors.gray700, fontWeight: '600' },
});
