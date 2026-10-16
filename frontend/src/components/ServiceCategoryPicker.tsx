import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { catMeta, catName, catDesc, subName, svcName, DANA_CATEGORY } from '@/src/i18n/catalog';

export interface Svc { id: string; name: string; category?: string | null; subcategory?: string | null; }

// Shared service selector used by priest registration and profile edit.
// Two-step, guided flow, fully translated (category names, subcategory
// names and descriptions come from the i18n `catalog` namespace):
//   1. Pick one or more MAIN categories (multi-select) — each shown with a
//      Sanskrit glyph and a clear description of what that line of service
//      involves.
//   2. Only the chosen categories expand to reveal their subcategories and
//      individual rituals to tick. "Select all" per category & per
//      subcategory. A search box (scoped to the chosen categories) appears
//      once at least one category is selected.
// Danas stay locked until at least one service from another category is
// ticked, and are cleared again if the last such service is removed.
export default function ServiceCategoryPicker({
  catalog, selected, onChange, order,
}: {
  catalog: Svc[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  order?: string[];
}) {
  const { t } = useTranslation();

  // category -> subcategory ('' = directly under the category) -> services
  const grouped = useMemo(() => {
    const m: Record<string, Record<string, Svc[]>> = {};
    for (const s of catalog) {
      if (!s.category) continue;
      const sub = s.subcategory || '';
      (m[s.category] ||= {});
      (m[s.category][sub] ||= []).push(s);
    }
    return m;
  }, [catalog]);

  const cats = useMemo(() => {
    const keys = Object.keys(grouped);
    if (!order) return keys;
    return order.filter(c => grouped[c]).concat(keys.filter(c => !order.includes(c)));
  }, [grouped, order]);

  const catAllIds = (cat: string) => Object.values(grouped[cat] || {}).flat().map(s => s.id);

  // Which main categories the priest has activated. Until they toggle one, it
  // follows the selection: every category that already has selected services
  // (the profile-edit case) is open.
  const [chosenCats, setActiveCats] = useState<Set<string> | null>(null);
  const activeCats = useMemo(() => {
    if (chosenCats) return chosenCats;
    const init = new Set<string>();
    for (const [c, subs] of Object.entries(grouped)) {
      if (Object.values(subs).flat().some(s => selected.has(s.id))) init.add(c);
    }
    return init;
  }, [chosenCats, grouped, selected]);

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const idsOf = (items: Svc[]) => items.map(s => s.id);
  const countOn = (ids: string[]) => ids.filter(id => selected.has(id)).length;
  const allOn = (ids: string[]) => ids.length > 0 && ids.every(id => selected.has(id));

  const categoryOf = useMemo(() => new Map(catalog.map(s => [s.id, s.category || ''])), [catalog]);
  const hasNonDana = (sel: Set<string>) =>
    Array.from(sel).some(id => { const c = categoryOf.get(id); return !!c && c !== DANA_CATEGORY; });
  const danaUnlocked = hasNonDana(selected);

  // Applies a new selection. Without any non-Dana service left, Dana picks
  // are dropped and the Dana category is closed.
  const commit = (next: Set<string>, nextActive: Set<string> = activeCats) => {
    if (!hasNonDana(next)) {
      catAllIds(DANA_CATEGORY).forEach(id => next.delete(id));
      if (nextActive.has(DANA_CATEGORY)) {
        nextActive = new Set(nextActive);
        nextActive.delete(DANA_CATEGORY);
      }
    }
    onChange(next);
    if (nextActive !== activeCats) setActiveCats(nextActive);
  };

  const toggleService = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    commit(n);
  };
  const bulk = (ids: string[]) => {
    const n = new Set(selected);
    const on = allOn(ids);
    ids.forEach(id => (on ? n.delete(id) : n.add(id)));
    commit(n);
  };
  const toggleMain = (cat: string) => {
    const n = new Set(activeCats);
    if (n.has(cat)) {
      n.delete(cat);
      // Switching a category off also clears any rituals chosen under it,
      // so there are never "orphan" selections in a deselected category.
      const s = new Set(selected);
      catAllIds(cat).forEach(id => s.delete(id));
      commit(s, n);
    } else {
      if (cat === DANA_CATEGORY && !danaUnlocked) return;
      n.add(cat);
      setActiveCats(n);
    }
  };

  const anyActive = activeCats.size > 0;
  const matchSub = (sub: string, items: Svc[]) => {
    if (!q) return items;
    if (subName(t, sub).toLowerCase().includes(q) || sub.toLowerCase().includes(q)) return items;
    return items.filter(s => s.name.toLowerCase().includes(q) || svcName(t, s.name).toLowerCase().includes(q));
  };

  return (
    <View>
      <Text style={styles.lead}>{t('catalog.ui.lead')}</Text>

      {anyActive && (
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.gray400} />
          <TextInput
            testID="service-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t('catalog.ui.searchScoped')}
            placeholderTextColor={colors.gray400}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.gray400} />
            </Pressable>
          ) : null}
        </View>
      )}

      {cats.map(cat => {
        const meta = catMeta(cat);
        const active = activeCats.has(cat);
        const allIds = catAllIds(cat);
        const subs = grouped[cat] || {};
        const chosen = countOn(allIds);
        const locked = cat === DANA_CATEGORY && !active && !danaUnlocked;
        return (
          <View key={cat} style={[styles.card, active && styles.cardOn, locked && styles.cardLocked]}>
            <Pressable onPress={() => toggleMain(cat)} disabled={locked} accessibilityState={{ disabled: locked }}
              style={styles.cardHead} testID={`svc-cat-${meta.slug}`}>
              <View style={[styles.glyphWrap, { backgroundColor: meta.color + '22' }]}>
                <Text style={[styles.glyph, { color: meta.color }]}>{meta.glyph}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{catName(t, cat)}</Text>
                {active
                  ? <Text style={styles.cardMeta}>{t('catalog.ui.ritualsSelected', { n: chosen, total: allIds.length })}</Text>
                  : <Text style={styles.cardMetaDim}>{t('catalog.ui.tapToChoose', { total: allIds.length })}</Text>}
              </View>
              {locked
                ? <Ionicons name="lock-closed" size={18} color={colors.gray400} />
                : (
                  <View style={[styles.check, active && styles.checkOn]}>
                    {active && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                )}
            </Pressable>

            <Text style={styles.blurb}>{catDesc(t, cat)}</Text>
            {locked && <Text style={styles.lockedHint} testID="svc-dana-locked">{t('catalog.ui.danaNeedsOther')}</Text>}

            {active && (
              <View style={styles.body}>
                {chosen === 0 && !q ? (
                  <Text style={styles.pickHint}>{t('catalog.ui.pickOne')}</Text>
                ) : null}

                <Pressable onPress={() => bulk(allIds)} style={styles.selAll}>
                  <Ionicons name={allOn(allIds) ? 'checkbox' : 'square-outline'} size={15} color={colors.orange} />
                  <Text style={styles.selAllText}>{t('catalog.ui.selectAll')}</Text>
                </Pressable>

                {Object.entries(subs).map(([sub, items]) => {
                  const shown = matchSub(sub, items);
                  if (q && !shown.length) return null;
                  const subIds = idsOf(items);
                  return (
                    <View key={sub || '_direct'} style={sub ? styles.subBox : undefined}>
                      {sub ? (
                        <Pressable onPress={() => bulk(subIds)} style={styles.subHead}>
                          <Ionicons name={allOn(subIds) ? 'checkbox' : 'square-outline'} size={14} color={colors.orange} />
                          <Text style={styles.subTitle}>{subName(t, sub)}</Text>
                          <Text style={styles.subCount}>{countOn(subIds)}/{subIds.length}</Text>
                        </Pressable>
                      ) : null}
                      {shown.map(s => {
                        const on = selected.has(s.id);
                        return (
                          <Pressable key={s.id} onPress={() => toggleService(s.id)} style={[styles.row, on && styles.rowOn]}>
                            <View style={[styles.box, on && styles.boxOn]}>
                              {on && <Ionicons name="checkmark" size={12} color="#FFF" />}
                            </View>
                            <Text style={styles.rowText}>{svcName(t, s.name)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: 12 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, backgroundColor: '#FBFBFB', marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.gray800, paddingVertical: 2 },

  card: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, marginBottom: 10, padding: 12, backgroundColor: '#FFF' },
  cardOn: { borderColor: colors.orange, backgroundColor: '#FFFDF9' },
  cardLocked: { backgroundColor: colors.gray50 },
  lockedHint: { fontSize: 11.5, fontWeight: '700', color: colors.amber700, lineHeight: 16, marginTop: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glyphWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 16, fontWeight: '800' },
  cardTitle: { fontSize: 13.5, fontWeight: '800', color: colors.darkRed },
  cardMeta: { fontSize: 11, fontWeight: '700', color: colors.orange, marginTop: 2 },
  cardMetaDim: { fontSize: 11, fontWeight: '600', color: colors.gray400, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },

  blurb: { fontSize: 12, color: colors.gray600, lineHeight: 17, marginTop: 8 },

  body: { marginTop: 8, borderTopWidth: 1, borderColor: colors.gray100, paddingTop: 6 },
  pickHint: { fontSize: 11.5, fontWeight: '700', color: colors.amber700, paddingVertical: 4 },

  selAll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  selAllText: { fontSize: 12, fontWeight: '800', color: colors.orange },

  subBox: { marginTop: 6, borderTopWidth: 1, borderColor: colors.gray100, paddingTop: 6 },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  subTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.4 },
  subCount: { fontSize: 11, fontWeight: '700', color: colors.gray400 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  rowOn: { backgroundColor: '#FFF7ED' },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  rowText: { flex: 1, fontSize: 13, color: colors.gray800 },
});
