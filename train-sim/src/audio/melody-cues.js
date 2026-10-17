// Clip table for the departure-melody recording
// 「JR宇都宮線 発車メロディ集」 by 武蔵野快速 (16:09, https://www.youtube.com/watch?v=2vYpq3ri4tY)
//
// The recording runs 東京 → 宇都宮, each station 上り then 下り, every melody twice,
// then 4 melodies that went out of use (played once). Clips were split at the
// silences between recordings and de-duplicated (only the first of each pair is
// listed). The video names each melody only on screen, so the station each clip
// belongs to is NOT known from the audio: DEFAULT_ASSIGN below is a best guess by
// position in the recording. Players can re-assign clips per station in the menu
// (選んだ割り当てはブラウザに保存されます).
export const MELODY_EXPECTED_DURATION = 969.3;

export const MELODY_CLIPS = [
  { no: 1, start: 13.62, end: 26.36 },
  { no: 2, start: 41.6, end: 50.62 },
  { no: 3, start: 62.11, end: 74.56 },
  { no: 4, start: 89.33, end: 98.93 },
  { no: 5, start: 112.46, end: 125.61 },
  { no: 6, start: 142.55, end: 157.36 },
  { no: 7, start: 159.7, end: 177.85 },
  { no: 8, start: 198.75, end: 210.19 },
  { no: 9, start: 225.53, end: 234.87 },
  { no: 10, start: 246.97, end: 257.0 },
  { no: 11, start: 269.25, end: 279.16 },
  { no: 12, start: 291.12, end: 302.72 },
  { no: 13, start: 316.71, end: 325.75 },
  { no: 14, start: 338.05, end: 346.81 },
  { no: 15, start: 357.5, end: 367.25 },
  { no: 16, start: 380.73, end: 390.17 },
  { no: 17, start: 402.81, end: 412.49 },
  { no: 18, start: 426.47, end: 437.3 },
  { no: 19, start: 450.62, end: 465.84 },
  { no: 20, start: 484.55, end: 498.86 },
  { no: 21, start: 516.45, end: 526.82 },
  { no: 22, start: 539.7, end: 559.4 },
  { no: 23, start: 581.73, end: 592.52 },
  { no: 24, start: 607.82, end: 624.64 },
  { no: 25, start: 644.61, end: 653.22 },
  { no: 26, start: 665.93, end: 677.37 },
  { no: 27, start: 692.13, end: 701.61 },
  { no: 28, start: 713.31, end: 732.34 },
  { no: 29, start: 753.71, end: 765.34 },
  { no: 30, start: 781.12, end: 789.55 },
  { no: 31, start: 800.89, end: 810.0 },
  { no: 32, start: 821.72, end: 831.83 },
  { no: 33, start: 846.31, end: 861.81 },
  { no: 34, start: 881.13, end: 896.95 },
  { no: 35, start: 915.19, end: 924.2, retired: true },
  { no: 36, start: 925.64, end: 938.2, retired: true },
  { no: 37, start: 939.65, end: 949.86, retired: true },
  { no: 38, start: 951.52, end: 962.9, retired: true },
];

/** station name → clip number played before departing (宇都宮方面) */
export const DEFAULT_ASSIGN = {"東京": 1, "上野": 2, "尾久": 4, "赤羽": 5, "浦和": 7, "さいたま新都心": 8, "大宮": 9, "土呂": 11, "東大宮": 12, "蓮田": 14, "白岡": 15, "新白岡": 17, "久喜": 18, "東鷲宮": 19, "栗橋": 21, "古河": 22, "野木": 24, "間々田": 25, "小山": 26, "小金井": 28, "自治医大": 29, "石橋": 31, "雀宮": 32, "宇都宮": 34};
