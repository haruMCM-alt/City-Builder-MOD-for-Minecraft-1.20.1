// Cue points (seconds) into the recording
// 「宇都宮線 普通宇都宮行き 車内放送（上野→宇都宮）」 by ひごくま / Higokuma (22:03)
// https://www.youtube.com/watch?v=RN1OnfJnqWg
//
// Found with speech recognition (Whisper, 30-second windows with word timestamps),
// snapped to pauses in the speech-band energy, then checked by transcribing the first
// and last seconds of every clip.
//
// Keys: intro = waiting at 上野, dep:<i> = after departing toward station i,
// arr:<i> = approaching station i, fin:<i> = conductor's last words before the terminal.
// Station indices follow STATIONS in route.js. 大宮 has no dep: clip because the
// recording goes straight to 「まもなく大宮」 after さいたま新都心.
export const EXPECTED_DURATION = 1323.1;

export const CUES = {
  'intro': [0.0, 12.9], // 上野 発車前（車掌）
  'dep:1': [12.9, 149.2], // 次は 尾久
  'arr:1': [149.2, 190.8], // まもなく 尾久
  'dep:2': [190.8, 200.4], // 次は 赤羽
  'arr:2': [200.4, 228.0], // まもなく 赤羽
  'dep:3': [228.0, 255.0], // 次は 浦和
  'arr:3': [255.0, 307.3], // まもなく 浦和
  'dep:4': [307.3, 360.1], // 次は さいたま新都心
  'arr:4': [360.1, 379.5], // まもなく さいたま新都心
  'arr:5': [379.5, 468.5], // まもなく 大宮
  'dep:6': [468.5, 562.8], // 次は 土呂
  'arr:6': [562.8, 583.2], // まもなく 土呂
  'dep:7': [583.2, 594.0], // 次は 東大宮
  'arr:7': [594.0, 609.3], // まもなく 東大宮
  'dep:8': [609.3, 618.7], // 次は 蓮田
  'arr:8': [618.7, 634.8], // まもなく 蓮田
  'dep:9': [634.8, 643.6], // 次は 白岡
  'arr:9': [643.6, 659.5], // まもなく 白岡
  'dep:10': [659.5, 668.8], // 次は 新白岡
  'arr:10': [668.8, 685.7], // まもなく 新白岡
  'dep:11': [685.7, 695.0], // 次は 久喜
  'arr:11': [695.0, 716.8], // まもなく 久喜
  'dep:12': [716.8, 744.0], // 次は 東鷲宮
  'arr:12': [744.0, 760.6], // まもなく 東鷲宮
  'dep:13': [760.6, 770.0], // 次は 栗橋
  'arr:13': [770.0, 792.0], // まもなく 栗橋
  'dep:14': [792.0, 821.0], // 次は 古河
  'arr:14': [821.0, 834.6], // まもなく 古河
  'dep:15': [834.6, 843.0], // 次は 野木
  'arr:15': [843.0, 856.3], // まもなく 野木
  'dep:16': [856.3, 864.6], // 次は 間々田
  'arr:16': [864.6, 881.0], // まもなく 間々田
  'dep:17': [881.0, 962.0], // 次は 小山
  'arr:17': [962.0, 986.9], // まもなく 小山
  'dep:18': [986.9, 1042.0], // 次は 小金井
  'arr:18': [1042.0, 1056.7], // まもなく 小金井
  'dep:19': [1056.7, 1066.8], // 次は 自治医大
  'arr:19': [1066.8, 1082.8], // まもなく 自治医大
  'dep:20': [1082.8, 1093.0], // 次は 石橋
  'arr:20': [1093.0, 1107.4], // まもなく 石橋
  'dep:21': [1107.4, 1135.5], // 次は 雀宮
  'arr:21': [1135.5, 1154.2], // まもなく 雀宮
  'dep:22': [1154.2, 1247.5], // 次は 宇都宮
  'arr:22': [1247.5, 1269.8], // まもなく 宇都宮
  'fin:22': [1292.2, 1323.1], // 終点到着前（車掌） 宇都宮
};
