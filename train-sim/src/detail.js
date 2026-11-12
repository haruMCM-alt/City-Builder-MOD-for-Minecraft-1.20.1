// Fine-grained settings (the sliders in the menu). Values are fractions: 1 = the normal amount.
// They are read when a run starts (the world, the traffic and the trains are built from them);
// the volumes also apply at once.

export const DETAIL_SPEC = [
  { group: '列車', items: [
    { key: 'oncoming', label: '対向列車（同じ路線）', min: 0, max: 2, def: 1 },
    { key: 'traffic', label: '並走する他線の列車', min: 0, max: 2, def: 1 },
    { key: 'freight', label: '貨物列車', min: 0, max: 2, def: 1 },
    { key: 'shinkansen', label: '新幹線', min: 0, max: 2, def: 1 },
    { key: 'parked', label: '駅に止まっている電車', min: 0, max: 1, def: 1 },
    { key: 'passengers', label: '車内の乗客', min: 0, max: 2, def: 1 },
  ] },
  { group: '沿線', items: [
    { key: 'people', label: '駅の人', min: 0, max: 2, def: 1 },
    { key: 'buildings', label: '建物', min: 0, max: 1, def: 1 },
    { key: 'trees', label: '木', min: 0, max: 1, def: 1 },
    { key: 'cars', label: '自動車', min: 0, max: 2, def: 1 },
    { key: 'poles', label: '電柱と電線', min: 0, max: 1, def: 1, step: 1 },
    { key: 'viewDist', label: '描画距離', min: 0.5, max: 1.5, def: 1 },
  ] },
  { group: '音量', items: [
    { key: 'volMaster', label: '全体', min: 0, max: 1.5, def: 1 },
    { key: 'volAnn', label: '車内放送', min: 0, max: 1.5, def: 1 },
    { key: 'volMelody', label: '発車メロディ', min: 0, max: 1.5, def: 1 },
    { key: 'volHorn', label: '警笛', min: 0, max: 1.5, def: 1 },
  ] },
];

export const DETAIL = {};
for (const g of DETAIL_SPEC) for (const it of g.items) DETAIL[it.key] = it.def;

/** a stable pseudo-random number in [0, 1) for a place (so thinning keeps the same objects) */
export function hash01(a, b = 0, c = 0) {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** keep a fraction f of objects (deterministically by place); f >= 1 keeps all */
export function keep(f, a, b = 0, c = 0) {
  return f >= 1 || hash01(a, b, c) < f;
}
