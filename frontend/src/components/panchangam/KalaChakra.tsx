import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { AUSPICIOUS_KALAS, KalaEntry, pick } from '@/src/lib/panchangam';

/* Kala Chakra — a port of the Yagnika web app's wheel
   (panchangam_application/templates/homepage_updated.html, same styles as the
   live yagnika.in build): a dark maroon disc with a gold border and brass
   ring, the kalas as upright labels on eight evenly spaced spokes (green =
   auspicious, red = inauspicious), and a hub showing the day being viewed
   (with the live clock when that day is today). The kala
   running right now (`activeId`) gets the web's highlight: black box, gold
   border and glow, 1.15× larger. The enlargement is done with font size, not
   a scale transform, and the box is opaque: scaling glowing text over a
   translucent box made the highlighted label look blurred on Android.

   Geometry follows the web CSS: the spoke wheel is 95% of the disc, each
   label's top sits 10% of the wheel's width in from its edge, labels are at
   most 30% of the wheel wide, and the hub is 30% of the disc. Text scales
   with the wheel like the web's container font-size (capped at 10.8px). */

const GOLD = '#d4af37';
const BRIGHT_GOLD = '#ffd700';
const BORDER = 4;   // web: clamp(4px, 1vw, 8px) — 4px at phone widths

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

// "Rahu Kalam" -> "Rahu\nKalam"; longer names break after the first word (web behaviour).
const splitName = (name: string) => {
  const parts = name.split(' ');
  return parts.length >= 2 ? `${parts[0]}\n${parts.slice(1).join(' ')}` : name;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');
// Formatted by hand (Hermes has no reliable Intl data): "09:05 PM", "OCT 16".
const clockText = (d: Date) => {
  const h = d.getHours() % 12 || 12;
  return `${pad2(h)}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};
const dateText = (d: Date) => `${MONTHS[d.getMonth()]} ${pad2(d.getDate())}`.toUpperCase();

export default function KalaChakra({
  kalas, refDate, activeId, lang, size = 320,
}: {
  kalas: KalaEntry[];
  refDate: Date;              // the day being viewed
  activeId?: string | null;   // the kala running now
  lang: string;
  size?: number;
}) {
  const { t } = useTranslation();
  // The hub shows the day being viewed, so it changes with the calendar; the
  // live clock only runs when that day is today.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // Measured label heights, so each label is centred on its spoke exactly
  // like the web's top-aligned spoke content.
  const [heights, setHeights] = useState<Record<string, number>>({});

  const inner = size - BORDER * 2;        // content box inside the gold border
  const wheel = inner * 0.95;             // .outer-wheel
  const hub = inner * 0.3;                // .inner-wheel
  const c = size / 2;
  const fs = Math.min(size * 0.024, 10.8); // container font-size
  const n = kalas.length || 8;
  const isToday =
    refDate.getFullYear() === now.getFullYear() &&
    refDate.getMonth() === now.getMonth() &&
    refDate.getDate() === now.getDate();

  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="kc-disc" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#2a0804" />
            <Stop offset="70%" stopColor="#150301" />
            <Stop offset="100%" stopColor="#050100" />
          </RadialGradient>
          {/* web: inset 0 0 25px #000 */}
          <RadialGradient id="kc-inset" cx="50%" cy="50%" r="50%">
            <Stop offset="84%" stopColor="#000" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000" stopOpacity={0.9} />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={size / 2} fill="url(#kc-disc)" />
        <Circle cx={c} cy={c} r={inner / 2} fill="url(#kc-inset)" />
        {/* .outer-brass-ring */}
        <Circle cx={c} cy={c} r={(inner * 0.96) / 2 - 1} fill="none" stroke={GOLD} strokeOpacity={0.5} strokeWidth={2} />
        {/* gold border */}
        <Circle cx={c} cy={c} r={size / 2 - BORDER / 2} fill="none" stroke={GOLD} strokeWidth={BORDER} />
      </Svg>

      {/* spokes: upright labels */}
      {kalas.map((k, i) => {
        const good = AUSPICIOUS_KALAS.has(k.id);
        const on = k.id === activeId;
        const h = heights[k.id] ?? fs * 4.5;
        const lf = on ? fs * 1.15 : fs;   // label font size (web: scale(1.15) when active)
        const [x, y] = polar(c, c, wheel * 0.4 - h / 2, i * (360 / n));
        const periods = k.time && k.time !== '---' ? k.time.split(' / ').map((p) => p.trim()) : ['---'];
        return (
          <View
            key={k.id}
            pointerEvents="none"
            style={{ position: 'absolute', width: wheel * 0.3, left: x - (wheel * 0.3) / 2, top: y - h / 2, alignItems: 'center' }}
          >
            <View
              testID={`kala-spoke-${k.id}`}
              onLayout={(e) => {
                const hh = Math.round(e.nativeEvent.layout.height);
                if (heights[k.id] !== hh) setHeights((prev) => ({ ...prev, [k.id]: hh }));
              }}
              style={on ? styles.activeBox : undefined}
            >
              <Text
                style={[
                  styles.title,
                  { fontSize: lf, lineHeight: lf * 1.1 },
                  good ? styles.titleGood : styles.titleBad,
                ]}
              >
                {splitName(pick(k.name, lang)).toUpperCase()}
              </Text>
              {periods.map((p, j) => (
                <Text
                  key={j}
                  style={[
                    styles.time,
                    { fontSize: lf * 0.833, lineHeight: lf * 0.833 * 1.3 },
                    { color: good ? '#d4f8e8' : '#ffd1d1' },
                  ]}
                >
                  {p}
                </Text>
              ))}
            </View>
          </View>
        );
      })}

      {/* hub (.inner-wheel) */}
      <View
        pointerEvents="none"
        style={[styles.hub, { width: hub, height: hub, borderRadius: hub / 2, left: c - hub / 2, top: c - hub / 2 }]}
      >
        <Svg width={hub} height={hub} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="kc-hub" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#3a0d04" />
              <Stop offset="60%" stopColor="#1a0501" />
              <Stop offset="100%" stopColor="#050100" />
            </RadialGradient>
          </Defs>
          <Circle cx={hub / 2} cy={hub / 2} r={hub / 2} fill="url(#kc-hub)" />
        </Svg>
        <Text style={styles.clock}>{isToday ? clockText(now) : '— : —'}</Text>
        <Text style={styles.hubLabel} testID="kala-hub-date">{dateText(refDate)}</Text>
        <Text style={styles.hubLabel} numberOfLines={1}>{t('panchangam.kalaChakra')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // web: box-shadow 0 15px 50px rgba(0,0,0,.95), 0 0 30px rgba(212,175,55,.3)
  disc: { boxShadow: '0 15px 50px rgba(0,0,0,0.95), 0 0 30px rgba(212,175,55,0.3)' },

  title: { fontWeight: '700', letterSpacing: 0.3, marginBottom: 3, textAlign: 'center' },
  titleGood: { color: '#5cdb95', textShadowColor: 'rgba(0,255,100,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  titleBad: { color: '#ff6b6b', textShadowColor: 'rgba(255,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  time: { fontWeight: '700', letterSpacing: 0.2, opacity: 0.95, textAlign: 'center' },

  // web: .time-spoke.active-kala .upright-content
  activeBox: {
    backgroundColor: '#0a0201', borderWidth: 2, borderColor: BRIGHT_GOLD, borderRadius: 8,
    padding: 5, boxShadow: `0 0 15px ${BRIGHT_GOLD}`,
  },

  hub: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 3, borderColor: BRIGHT_GOLD, padding: 12,
    boxShadow: '0 0 25px rgba(0,0,0,0.95), inset 0 0 15px #b8860b',
  },
  clock: {
    fontSize: 12, color: '#fff', fontWeight: '700', letterSpacing: 0.5, marginBottom: 4, textAlign: 'center',
    textShadowColor: 'rgba(255,215,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
  hubLabel: { fontSize: 7, color: GOLD, fontWeight: '500', letterSpacing: 1, marginTop: 1, textTransform: 'uppercase', textAlign: 'center' },
});
