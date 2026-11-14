// Platform announcements (ATOS) cut from 「【ATOS放送集】JR東日本 宇都宮線･烏山線･武蔵野線 駅放送集」
// (assets/sounds/station_announce.mp3). Found with speech recognition (Whisper, word timestamps)
// and snapped to the pauses; every clip was checked by transcribing it again.
// kind: approach = 「まもなく○番線に…が参ります」, name = 到着時の駅名, door = 「○番線ドアが閉まります」
// dir: the running direction of our train in the game (down = 宇都宮方面), service / dest of the announced train.
export const STATION_CLIPS = [
  {"id": "ssc_d_app", "kind": "approach", "station": "さいたま新都心", "dir": "down", "service": "local", "dest": "宇都宮", "t0": 0.0, "t1": 12.07},   // なく4番線に普通、宇都宮行きが参ります。危ないですから、黄色い展示ブロックまでお下がりください。
  {"id": "ssc_name", "kind": "name", "station": "さいたま新都心", "dir": null, "service": null, "dest": null, "t0": 12.37, "t1": 21.51},   // 玉新都心、埼玉新都心、ご乗車、ありがとうございます。
  {"id": "ssc_d_door", "kind": "door", "station": "さいたま新都心", "dir": "down", "service": null, "dest": null, "t0": 21.81, "t1": 26.71},   // 4番線、ドアが閉まります。ご注意ください。
  {"id": "omiya_d_koganei_app", "kind": "approach", "station": "大宮", "dir": "down", "service": "local", "dest": "小金井", "t0": 27.01, "t1": 41.78},   // なく、9番線に、宇都宮線直通・苦通・小金井行きがまいります。危ないですから、黄色い展示ブロックまでお下がりください。
  {"id": "omiya_d9_door", "kind": "door", "station": "大宮", "dir": "down", "service": null, "dest": null, "t0": 42.08, "t1": 49.04},   // 9番線の宇都宮線ドアが閉まります。ご注意ください。
  {"id": "omiya_d_koga_app", "kind": "approach", "station": "大宮", "dir": "down", "service": "local", "dest": "古河", "t0": 49.34, "t1": 62.92},   // なく11番線に宇都宮線直通普通小ヶ行きが参ります危ないですから黄色い展示ブロックまでお下がりください
  {"id": "omiya_name", "kind": "name", "station": "大宮", "dir": null, "service": null, "dest": null, "t0": 63.22, "t1": 70.3},   // 宮、大宮ご乗車ありがとうございます
  {"id": "omiya_d11_door", "kind": "door", "station": "大宮", "dir": "down", "service": null, "dest": null, "t0": 70.6, "t1": 77.38},   // 11番線の宇都宮線ドアが閉まります ご注意ください
  {"id": "omiya_u_numazu_app", "kind": "approach", "station": "大宮", "dir": "up", "service": "local", "dest": "沼津", "t0": 77.68, "t1": 90.44},   // なく6番線に上野東京ライン 普通沼津行きがまいります危ないですから黄色い展示ブロック までお下がりください
  {"id": "omiya_u6_door", "kind": "door", "station": "大宮", "dir": "up", "service": null, "dest": null, "t0": 90.74, "t1": 97.7},   // 6番線の上の東京ラインドアが閉まります ご注意ください
  {"id": "omiya_u_hiratsuka_app", "kind": "approach", "station": "大宮", "dir": "up", "service": "rapid", "dest": "平塚", "t0": 98.0, "t1": 110.52},   // なく6番線に湘南新宿ライン快速平塚行きが参ります 危ないですから黄色い展示ブロックまでお下がりください
  {"id": "omiya_u6s_door", "kind": "door", "station": "大宮", "dir": "up", "service": null, "dest": null, "t0": 110.82, "t1": 117.2},   // 6番線の湘南新宿ラインドアが閉まります。ご注意ください。
  {"id": "kuki_d_koganei_app", "kind": "approach", "station": "久喜", "dir": "down", "service": "local", "dest": "小金井", "t0": 117.5, "t1": 130.54},   // なく1番線に普通小金井行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_name1", "kind": "name", "station": "久喜", "dir": null, "service": null, "dest": null, "t0": 130.84, "t1": 137.36},   // ークッキー 御乗車ありがとうございます
  {"id": "kuki_d1_door", "kind": "door", "station": "久喜", "dir": "down", "service": null, "dest": null, "t0": 137.66, "t1": 142.98},   // 1番線ドアが閉まります ご注意ください
  {"id": "kuki_d_utsunomiya_app", "kind": "approach", "station": "久喜", "dir": "down", "service": "local", "dest": "宇都宮", "t0": 143.28, "t1": 154.96},   // なく2番線に普通 宇都宮行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_d_rabbit_app", "kind": "approach", "station": "久喜", "dir": "down", "service": "rapid", "dest": "宇都宮", "t0": 155.26, "t1": 166.94},   // なく2番線に快速ラビット宇都宮行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_d2_door", "kind": "door", "station": "久喜", "dir": "down", "service": null, "dest": null, "t0": 167.24, "t1": 172.56},   // 2番線ドアが閉まりますご注意ください
  {"id": "kuki_u_odawara_app", "kind": "approach", "station": "久喜", "dir": "up", "service": "local", "dest": "小田原", "t0": 172.86, "t1": 190.0},   // なく3番線に上野東京ライン 東海道線直通普通小田原行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_u_kozu_app", "kind": "approach", "station": "久喜", "dir": "up", "service": "local", "dest": "国府津", "t0": 190.3, "t1": 207.02},   // なく3番線に上野東京ライン 東海道線直通普通コーズ行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_u_rabbit_app", "kind": "approach", "station": "久喜", "dir": "up", "service": "rapid", "dest": "上野", "t0": 207.32, "t1": 220.78},   // なく3番線に快速ラビット 上野行きが参ります危ないですから黄色い線までお下がりください
  {"id": "kuki_u_zushi_app", "kind": "approach", "station": "久喜", "dir": "up", "service": "local", "dest": "逗子", "t0": 221.08, "t1": 237.44},   // なく3番線に湘南新宿ライン 横須賀線直通普通、寿司行きが参ります危ないですから、黄色い線までお下がりください。
  {"id": "kuki_name3", "kind": "name", "station": "久喜", "dir": null, "service": null, "dest": null, "t0": 237.74, "t1": 243.8},   // ー、クッキー、ご乗車ありがとうございます。
  {"id": "kuki_u3_door", "kind": "door", "station": "久喜", "dir": "up", "service": null, "dest": null, "t0": 244.1, "t1": 249.14},   // 3番線ドアが閉まります ご注意ください
  {"id": "shinjuku_d_oyama_app", "kind": "approach", "station": "新宿", "dir": "down", "service": "local", "dest": "小山", "t0": 249.44, "t1": 263.16},   // なく4番線に湘南新宿ライン 普通小山行きが参ります危ないですから黄色い展示ブロック までお下がりください
  {"id": "shinjuku_name4", "kind": "name", "station": "新宿", "dir": null, "service": null, "dest": null, "t0": 263.46, "t1": 269.48},   // 宿、新宿。ご乗車、ありがとうございます。
  {"id": "shinjuku_d4_door", "kind": "door", "station": "新宿", "dir": "down", "service": null, "dest": null, "t0": 269.78, "t1": 274.3},   // 4番線、ドアが閉まります。ご注意ください。
  {"id": "shinjuku_u_odawara_app", "kind": "approach", "station": "新宿", "dir": "up", "service": "special", "dest": "小田原", "t0": 274.6, "t1": 291.78},   // なく1番線に湘南新宿ライン 東海道線直通特別快速小田原行きが参ります 危ないですから黄色い展示ブロックまでお下がりくださ
  {"id": "shinjuku_name1", "kind": "name", "station": "新宿", "dir": null, "service": null, "dest": null, "t0": 292.08, "t1": 298.28},   // 宿。新宿。ご乗車ありがとうございます。
  {"id": "shinjuku_u1_door", "kind": "door", "station": "新宿", "dir": "up", "service": null, "dest": null, "t0": 298.58, "t1": 304.94},   // 1番線ドアが閉まります。ご注意ください。
];
