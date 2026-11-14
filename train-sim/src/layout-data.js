// Station and line data for the track layout: how many platforms and tracks each station has, the
// lines that run beside ours (with their own stations), and where those stations are.
// Platform counts follow the stations' 駅構造 (Japanese Wikipedia, 2026); the 営業キロ place the
// stations that are not on our line between the ones that are.

/** 営業キロ (km) along a corridor, for the stations that only the parallel lines stop at */
export const KM = {
  tokaido: { 東京: 0, 有楽町: 0.8, 新橋: 1.9, 浜松町: 3.1, 田町: 4.6, 高輪ゲートウェイ: 5.9, 品川: 6.8, 大井町: 9.2, 大森: 11.4, 蒲田: 14.4, 川崎: 18.2, 鶴見: 21.7, 新子安: 24.8, 東神奈川: 27.0, 横浜: 28.8, 保土ヶ谷: 31.8, 東戸塚: 36.7, 戸塚: 40.9, 大船: 46.5 },
  tohoku: { 東京: 0, 神田: 1.3, 秋葉原: 2.0, 御徒町: 3.0, 上野: 3.6, 鶯谷: 4.7, 日暮里: 5.8, 赤羽: 13.2, 川口: 15.8, 西川口: 17.8, 蕨: 19.7, 南浦和: 22.5, 浦和: 24.2, 北浦和: 26.0, 与野: 27.6, さいたま新都心: 28.7, 大宮: 30.3 },
  yamanote: { 新宿: 10.6, 新大久保: 11.9, 高田馬場: 13.3, 目白: 14.2, 池袋: 15.4 },
};

/** names on the station signs (stations of the through lines and of the parallel lines) */
export const NAMES = {
  東京: ['とうきょう', 'Tōkyō'], 有楽町: ['ゆうらくちょう', 'Yūrakuchō'], 新橋: ['しんばし', 'Shimbashi'], 浜松町: ['はままつちょう', 'Hamamatsuchō'],
  田町: ['たまち', 'Tamachi'], 高輪ゲートウェイ: ['たかなわげーとうぇい', 'Takanawa Gateway'], 品川: ['しながわ', 'Shinagawa'],
  大井町: ['おおいまち', 'Ōimachi'], 大森: ['おおもり', 'Ōmori'], 蒲田: ['かまた', 'Kamata'], 川崎: ['かわさき', 'Kawasaki'],
  鶴見: ['つるみ', 'Tsurumi'], 新子安: ['しんこやす', 'Shin-Koyasu'], 東神奈川: ['ひがしかながわ', 'Higashi-Kanagawa'], 横浜: ['よこはま', 'Yokohama'],
  保土ヶ谷: ['ほどがや', 'Hodogaya'], 東戸塚: ['ひがしとつか', 'Higashi-Totsuka'], 戸塚: ['とつか', 'Totsuka'], 大船: ['おおふな', 'Ōfuna'],
  藤沢: ['ふじさわ', 'Fujisawa'], 辻堂: ['つじどう', 'Tsujidō'], 茅ヶ崎: ['ちがさき', 'Chigasaki'], 平塚: ['ひらつか', 'Hiratsuka'],
  大磯: ['おおいそ', 'Ōiso'], 二宮: ['にのみや', 'Ninomiya'], 国府津: ['こうづ', 'Kōzu'], 鴨宮: ['かものみや', 'Kamonomiya'], 小田原: ['おだわら', 'Odawara'],
  神田: ['かんだ', 'Kanda'], 秋葉原: ['あきはばら', 'Akihabara'], 御徒町: ['おかちまち', 'Okachimachi'], 鶯谷: ['うぐいすだに', 'Uguisudani'],
  日暮里: ['にっぽり', 'Nippori'], 川口: ['かわぐち', 'Kawaguchi'], 西川口: ['にしかわぐち', 'Nishi-Kawaguchi'], 蕨: ['わらび', 'Warabi'],
  南浦和: ['みなみうらわ', 'Minami-Urawa'], 北浦和: ['きたうらわ', 'Kita-Urawa'], 与野: ['よの', 'Yono'],
  新宿: ['しんじゅく', 'Shinjuku'], 新大久保: ['しんおおくぼ', 'Shin-Ōkubo'], 高田馬場: ['たかだのばば', 'Takadanobaba'], 目白: ['めじろ', 'Mejiro'], 池袋: ['いけぶくろ', 'Ikebukuro'],
};

/**
 * Our line's own tracks and platforms beyond the two running tracks, per station.
 * plus: outwards from the down track (beyond our own side platform at left-door stations),
 * minus: outwards from the up track. T = platform track, S = siding, P = platform.
 * blocks: further groups of tracks on one side (terminal platforms, branch lines); stop: 'south' =
 * the tracks end at buffer stops at the south end.
 */
export const OUR_LAYOUT = {
  // 宇都宮線
  上野: { plus: 'T', minus: 'T', blocks: [{ side: 1, str: 'TPTTPTTP', stop: 'south', name: '地平ホーム' }] },   // 高架 5–8, 地平 13–17
  大宮: { plus: 'TPTTPTTPT' },                 // 5面10線 with the 京浜東北線
  蓮田: { plus: 'T' }, 白岡: { plus: 'T' }, 久喜: { plus: 'T' }, 雀宮: { plus: 'T' },   // 2面3線
  栗橋: { plus: 'TP' },                        // 2面3線
  古河: { plus: 'T', minus: 'T' },             // 2面4線
  小山: { plus: 'T', minus: 'T', blocks: [{ side: 1, str: 'TPTTPT', name: '両毛線・水戸線' }] },
  小金井: { plus: 'TPTSS' },                   // 2面4線 + 留置線 2
  宇都宮: { plus: 'TSTPT' },                   // 3面5線 + 待避線
  // 東海道線
  東京: { plus: 'T', minus: 'T' },             // 7–10番線
  品川: { plus: 'TPTTPT' },
  横浜: { plus: 'TPT' },
  大船: { plus: 'TPTTPT' },
  茅ヶ崎: { plus: 'TPTTPT' },
  平塚: { plus: 'TPT' },
  国府津: { plus: 'TPTTP' },                   // 3面5線 (御殿場線)
  小田原: { plus: 'TPTSS' },
  // 湘南新宿ライン
  新宿: { plus: 'TTPT', minus: 'T' },
  池袋: { plus: 'T', minus: 'T' },
};

/** door side (platform side facing north) of the through-line stations: island platforms are 'right' */
export const PREFIX_DOORS = {
  東京: 'left', 新橋: 'right', 品川: 'right', 川崎: 'right', 横浜: 'right', 戸塚: 'right', 大船: 'right', 藤沢: 'right',
  辻堂: 'right', 茅ヶ崎: 'right', 平塚: 'right', 大磯: 'right', 二宮: 'right', 国府津: 'right', 鴨宮: 'right', 小田原: 'right',
  新宿: 'left', 池袋: 'left',
};

// line looks: colour of the sign band and the trains, platform length in cars
const L = {
  keihin: { kind: 'keihin', name: '京浜東北線', color: '#00b2e5', cars: 10 },
  yamanote: { kind: 'yamanote', name: '山手線', color: '#80c241', cars: 11 },
  joban: { kind: 'joban', name: '常磐線', color: '#00b261', cars: 15 },
  chuo: { kind: 'chuo', name: '中央線', color: '#f15a22', cars: 10 },
  sobu: { kind: 'sobu', name: '中央・総武線', color: '#ffd400', cars: 10 },
  yokosuka: { kind: 'yokosuka', name: '横須賀線', color: '#0067c0', cars: 15 },
  saikyo: { kind: 'saikyo', name: '埼京線', color: '#00ac9a', cars: 10 },
  local: { kind: 'local', name: '宇都宮線・高崎線', color: '#f68b1e', cars: 15 },
  cargo: { kind: 'freight', name: '東海道貨物線', color: '#f68b1e', cars: 15, pass: true },
  tohokuCargo: { kind: 'tohoku-cargo', name: '東北貨物線（湘南新宿ライン）', color: '#e21f26', cars: 15 },
  tokaidoShin: { kind: 'shin-tokaido', name: '東海道新幹線', color: '#0072bc', cars: 16, shinkansen: true },
  tohokuShin: { kind: 'shin-tohoku', name: '東北・上越・北陸新幹線', color: '#00a040', cars: 16, shinkansen: true },
};

/**
 * the parallel lines of a route. at(name) = mid-platform position of a station (ours or one placed
 * from the 営業キロ). Each group is a pair of tracks in a slot on one side (-1 = beyond the up track,
 * +1 = beyond the down track); s0..s1 = where it runs at full width; ends: 'out' (it curves away),
 * 'merge' (it joins our tracks), 'stop' (buffer stops), 'none' (the route ends first).
 * stops: [station, island platforms]
 */
export function lineGroups(line, at, sMin) {
  const keihinSouth = [['横浜', 1], ['東神奈川', 2], ['新子安', 1], ['鶴見', 1], ['川崎', 2], ['蒲田', 2], ['大森', 1], ['大井町', 1],
    ['品川', 2], ['高輪ゲートウェイ', 1], ['田町', 1], ['浜松町', 1], ['新橋', 1], ['有楽町', 1], ['東京', 1], ['神田', 1], ['秋葉原', 1]];
  const yamanoteSouth = [['品川', 1], ['高輪ゲートウェイ', 1], ['田町', 1], ['浜松町', 1], ['新橋', 1], ['有楽町', 1], ['東京', 1], ['神田', 1], ['秋葉原', 1]];
  const uenoArea = [['御徒町', 1], ['上野', 1], ['鶯谷', 1], ['日暮里', 1]];
  const keihinNorth = [['赤羽', 1], ['川口', 1], ['西川口', 1], ['蕨', 1], ['南浦和', 2], ['浦和', 1], ['北浦和', 1], ['与野', 1], ['さいたま新都心', 1], ['大宮', 1]];
  const nippori = at('日暮里') + 300;
  const akabane = at('赤羽');
  // 京浜東北線・山手線・常磐線 north of 上野 (they leave us after 日暮里); 京浜東北線 + 東北貨物線 赤羽〜大宮
  const uenoGroups = (start) => [
    { ...L.keihin, slot: 0, side: -1, s0: start.keihin, s1: nippori, end0: start.end, end1: 'out', stops: [...(start.keihinStops || []), ...uenoArea] },
    { ...L.yamanote, slot: 1, side: -1, s0: start.yamanote, s1: nippori, end0: start.end, end1: 'out', stops: [...(start.yamanoteStops || []), ...uenoArea] },
    { ...L.joban, slot: 2, side: -1, s0: start.joban, s1: nippori, end0: start.end, end1: 'out', stops: [['上野', 2], ['日暮里', 1]] },
  ];
  const northGroups = [
    { ...L.keihin, slot: 0, side: -1, s0: akabane - 700, s1: at('大宮') + 500, end0: 'out', end1: 'out', stops: keihinNorth },
    { ...L.tohokuCargo, slot: 1, side: -1, s0: akabane - 700, s1: at('大宮') + 500, end0: 'out', end1: 'out', stops: [['赤羽', 1], ['浦和', 1]] },
    { ...L.saikyo, slot: 2, side: -1, s0: akabane - 700, s1: akabane + 700, end0: 'out', end1: 'out', stops: [['赤羽', 1]] },
  ];
  if (line === 'utsunomiya') {
    return [...uenoGroups({ keihin: sMin, yamanote: sMin, joban: sMin, end: 'none' }), ...northGroups];
  }
  if (line === 'ueno-tokyo') {
    const tokyo = at('東京');
    return [
      ...uenoGroups({ keihin: at('横浜') - 500, yamanote: at('品川') - 500, joban: at('上野') - 900, end: 'out', keihinStops: keihinSouth, yamanoteStops: yamanoteSouth }),
      { ...L.chuo, slot: 2, side: -1, s0: tokyo - 130, s1: at('神田') + 350, end0: 'stop', end1: 'out', stops: [['東京', 1], ['神田', 1]] },
      { ...L.yokosuka, slot: 1, side: -1, s0: at('大船') - 300, s1: at('横浜') + 7000, end0: 'out', end1: 'out', stops: [['大船', 2], ['戸塚', 1], ['東戸塚', 1], ['保土ヶ谷', 1], ['横浜', 1]] },
      { ...L.cargo, slot: 0, side: -1, s0: sMin, s1: at('戸塚') - 900, end0: 'none', end1: 'out', stops: [['藤沢', 1]] },
      // 新幹線: 東海道 (14–19番線, through 品川) and 東北・上越・北陸 (20–23番線) on the 八重洲 side
      { ...L.tokaidoShin, slot: 0, side: 1, s0: at('品川') - 2800, s1: tokyo + 210, end0: 'out', end1: 'stop', stops: [['品川', 2], ['東京', 3]] },
      { ...L.tohokuShin, slot: 1, side: 1, s0: tokyo - 210, s1: at('秋葉原') + 300, end0: 'stop', end1: 'out', stops: [['東京', 2]] },
      ...northGroups,
    ];
  }
  if (line === 'shonan-shinjuku') {
    const shinjuku = at('新宿');
    return [
      { ...L.yamanote, slot: 0, side: -1, s0: sMin, s1: at('池袋') + 500, end0: 'none', end1: 'out', stops: [['新宿', 2], ['新大久保', 1], ['高田馬場', 1], ['目白', 1], ['池袋', 2]] },
      { ...L.chuo, slot: 1, side: -1, s0: sMin, s1: shinjuku + 450, end0: 'none', end1: 'out', stops: [['新宿', 2]] },
      { ...L.sobu, slot: 2, side: -1, s0: sMin, s1: shinjuku + 450, end0: 'none', end1: 'out', stops: [['新宿', 1]] },
      { ...L.local, slot: 0, side: -1, s0: akabane - 700, s1: at('大宮') - 700, end0: 'out', end1: 'merge', stops: [['赤羽', 1], ['浦和', 1], ['さいたま新都心', 1]] },
      { ...L.keihin, slot: 1, side: -1, s0: akabane - 700, s1: at('大宮') + 500, end0: 'out', end1: 'out', stops: keihinNorth },
      { ...L.saikyo, slot: 0, side: 1, s0: akabane - 700, s1: akabane + 700, end0: 'out', end1: 'out', stops: [['赤羽', 1]] },
    ];
  }
  return [];
}
