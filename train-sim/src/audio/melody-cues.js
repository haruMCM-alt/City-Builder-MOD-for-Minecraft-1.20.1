// Clip table for the departure-melody recording
// 「JR宇都宮線 発車メロディ集」 by 武蔵野快速 (16:09, https://www.youtube.com/watch?v=2vYpq3ri4tY)
//
// The video is ordered by MELODY (東京 → 宇都宮, every melody twice, then 4 retired ones
// once); the melody name and the stations / platforms that use it are shown on screen.
// Those captions were read from the video's storyboard frames and matched to the clips
// by time, and each station's platform direction comes from the のりば tables on
// Wikipedia (e.g. 赤羽 3 上り / 4 下り, 浦和 3 上り / 4 下り, 大宮 9 下り / 3・4 上り,
// 蓮田 1 下り / 2・3 上り, 古河 1・2 下り / 3・4 上り, 小山 9・10 下り / 12・13 上り,
// 小金井 1・2 下り / 3・4 上り, 上野始発は地平 14・15 番線中心).
// Clips were split at the silences between recordings (only the first of each pair).
export const MELODY_EXPECTED_DURATION = 969.3;

export const MELODY_CLIPS = [
  { no: 1, start: 13.62, end: 26.36, name: 'JRE-IKST-027-01', where: '東京7・上野5・浦和4・さいたま新都心(下り)・大宮9・土呂(下り)' },
  { no: 2, start: 41.6, end: 50.62, name: 'JRE-IKST-013-02', where: '東京8・上野6' },
  { no: 3, start: 62.11, end: 74.56, name: 'JRE-IKST-027-02', where: '上野7・浦和3・さいたま新都心(上り)・大宮4・土呂(上り)' },
  { no: 4, start: 89.33, end: 98.93, name: 'JRE-IKST-020-01', where: '上野8' },
  { no: 5, start: 112.46, end: 125.61, name: 'JRE-IKST-027-03', where: '上野13' },
  { no: 6, start: 142.55, end: 157.36, name: 'ベルA', where: '上野14・15' },
  { no: 7, start: 159.7, end: 177.85, name: 'あゝ上野駅', where: '上野16・17' },
  { no: 8, start: 198.75, end: 210.19, name: '線路の彼方', where: '尾久(下り)' },
  { no: 9, start: 225.53, end: 234.87, name: 'あざみ野V2', where: '尾久(上り)' },
  { no: 10, start: 246.97, end: 257.0, name: 'すすきの高原V1', where: '赤羽3（上り）' },
  { no: 11, start: 269.25, end: 279.16, name: '高原', where: '赤羽4（下り）' },
  { no: 12, start: 291.12, end: 302.72, name: '俺たちの明日', where: '赤羽5（湘南新宿ライン南行）' },
  { no: 13, start: 316.71, end: 325.75, name: '今宵の月のように', where: '赤羽6（湘南新宿ライン北行）' },
  { no: 14, start: 338.05, end: 346.81, name: 'JRE-IKST-018-02', where: '浦和5・大宮3' },
  { no: 15, start: 357.5, end: 367.25, name: 'JRE-IKST-018-01', where: '浦和6・大宮11' },
  { no: 16, start: 380.73, end: 390.17, name: 'メロディー', where: '東大宮(上り)' },
  { no: 17, start: 402.81, end: 412.49, name: 'シンコペーション', where: '東大宮(下り)・野木/間々田(上り)・小金井3・雀宮(上り)' },
  { no: 18, start: 426.47, end: 437.3, name: '雅楽谷の森 ～蓮田のタカラ～ Ver.B', where: '蓮田2・3（上り）' },
  { no: 19, start: 450.62, end: 465.84, name: '雅楽谷の森 ～蓮田のタカラ～ Ver.A', where: '蓮田1（下り）' },
  { no: 20, start: 484.55, end: 498.86, name: 'すみれの花咲く頃', where: '白岡・新白岡(上り)' },
  { no: 21, start: 516.45, end: 526.82, name: 'アマリリス', where: '白岡〜久喜(下り)' },
  { no: 22, start: 539.7, end: 559.4, name: '牧場の朝', where: '久喜(上り)' },
  { no: 23, start: 581.73, end: 592.52, name: 'Water Crown', where: '東鷲宮・栗橋(上り)・小山12・自治医大(上り)・石橋(下り)' },
  { no: 24, start: 607.82, end: 624.64, name: 'Gota del Vient', where: '東鷲宮・栗橋(下り)・小山13・自治医大(下り)・石橋(上り)' },
  { no: 25, start: 644.61, end: 653.22, name: '遠い青空V1', where: '古河3・4（上り）' },
  { no: 26, start: 665.93, end: 677.37, name: '木々の目覚めV1', where: '古河1・2（下り）' },
  { no: 27, start: 692.13, end: 701.61, name: 'see you again', where: '野木・間々田・雀宮(下り)' },
  { no: 28, start: 713.31, end: 732.34, name: 'Verde Rayo（旧音弱調）', where: '小山9（下り・一部）' },
  { no: 29, start: 753.71, end: 765.34, name: 'Cielo estrellado（半音低い）', where: '小山10（下り）' },
  { no: 30, start: 781.12, end: 789.55, name: 'くるみあそび', where: '小金井4' },
  { no: 31, start: 800.89, end: 810.0, name: '朝の静けさ', where: '小金井1（下り）' },
  { no: 32, start: 821.72, end: 831.83, name: 'mellow time', where: '小金井2（下り）' },
  { no: 33, start: 846.31, end: 861.81, name: 'カリフォルニア・シャワー 上りVer.', where: '宇都宮(上り)' },
  { no: 34, start: 881.13, end: 896.95, name: 'カリフォルニア・シャワー 下りVer.', where: '宇都宮(下り)' },
  { no: 35, start: 915.19, end: 924.2, retired: true, name: '輝く街並み', where: '旧 上野8' },
  { no: 36, start: 925.64, end: 938.2, retired: true, name: 'スプリングボックス', where: '旧 浦和3' },
  { no: 37, start: 939.65, end: 949.86, retired: true, name: 'すすきの高原V2', where: '旧 浦和4' },
  { no: 38, start: 951.52, end: 962.9, retired: true, name: '美しき丘', where: '旧 さいたま新都心(下り)' },
];

/** station name → clip played before departing toward 宇都宮 (下り) */
export const DEFAULT_ASSIGN = {
  東京: 1, 上野: 6, 尾久: 8, 赤羽: 11, 浦和: 1, さいたま新都心: 1, 大宮: 1, 土呂: 1, 東大宮: 17,
  蓮田: 19, 白岡: 21, 新白岡: 21, 久喜: 21, 東鷲宮: 24, 栗橋: 24, 古河: 26, 野木: 27, 間々田: 27,
  小山: 29, 小金井: 31, 自治医大: 24, 石橋: 23, 雀宮: 27, 宇都宮: 34,
};

/** station name → clip played before departing toward 上野 (上り) */
export const DEFAULT_ASSIGN_UP = {
  東京: 2, 上野: 3, 尾久: 9, 赤羽: 10, 浦和: 3, さいたま新都心: 3, 大宮: 3, 土呂: 3, 東大宮: 16,
  蓮田: 18, 白岡: 20, 新白岡: 20, 久喜: 22, 東鷲宮: 23, 栗橋: 23, 古河: 25, 野木: 17, 間々田: 17,
  小山: 23, 小金井: 17, 自治医大: 23, 石橋: 24, 雀宮: 17, 宇都宮: 33,
};
