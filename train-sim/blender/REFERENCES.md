# モデリング資料（参考写真）

車両モデルは以下の Wikimedia Commons の写真を見ながら、寸法・形状・塗装を合わせて作り直しました。
写真そのものはこのリポジトリに含めていません（参照のみ）。

| 形式 | 写真 | ライセンス |
|---|---|---|
| E231系1000番台 前面 | [E231系1000番台.jpg](https://commons.wikimedia.org/wiki/File:E231系1000番台.jpg) | CC BY-SA 4.0 |
| E231系1000番台 前面・側面 | [JRE Series-E231 U541.jpg](https://commons.wikimedia.org/wiki/File:JRE_Series-E231_U541.jpg) | CC BY-SA 4.0 |
| クハE231 側面 | [E231-1000 Series Kuha E231-8016 of JR East.jpg](https://commons.wikimedia.org/wiki/File:E231-1000_Series_Kuha_E231-8016_of_JR_East.jpg) | CC BY-SA 4.0 |
| モハE231・E230 側面 | [E231-1000 Series Moha E231･E230-1026 of JR East.jpg](https://commons.wikimedia.org/wiki/File:E231-1000_Series_Moha_E231%EF%BD%A5E230-1026_of_JR_East.jpg) | CC BY-SA 4.0 |
| 屋根上 | [JRE E231-1000 upper part.PNG](https://commons.wikimedia.org/wiki/File:JRE_E231-1000_upper_part.PNG) | Public domain |
| サロE231 / サロE230 | [E231 saro231kei.JPG](https://commons.wikimedia.org/wiki/File:E231_saro231kei.JPG), [E231saro230kei.JPG](https://commons.wikimedia.org/wiki/File:E231saro230kei.JPG) | Public domain |
| E233系3000番台 前面 | [JRUtsunomiya Line E233kei 3000bandai.JPG](https://commons.wikimedia.org/wiki/File:JRUtsunomiya_Line_E233kei_3000bandai.JPG) | CC BY-SA 3.0 |
| 211系3000番台 | [JNR 211-3000.JPG](https://commons.wikimedia.org/wiki/File:JNR_211-3000.JPG), [JR East 211 Series at Akabane Station.JPG](https://commons.wikimedia.org/wiki/File:JR_East_211_Series_at_Akabane_Station.JPG) | CC BY-SA 4.0 / CC0 |
| 115系 湘南色 | [JNR 115 Shonan-color Joetsu line.jpg](https://commons.wikimedia.org/wiki/File:JNR_115_Shonan-color_Joetsu_line.jpg), [115 sideview shonan.png](https://commons.wikimedia.org/wiki/File:115_sideview_shonan.png) | Commons 各ページ参照 |

## 前面・車体の採寸（v4）

前面の形と塗り分けは、ほぼ正面から撮った写真（望遠）を車体幅 2,950 mm・連結器高さ 880 mm・屋根高さで校正して mm 単位で採寸し、
採寸結果を元写真に重ねて一致を確認したうえでモデル化しています。側面は側面写真（ラインスキャン系の側面展開写真など）から
ドア・窓・帯の位置を採寸しています。採寸値は `blender/faces.py`（前面）と `blender/cars.py`（側面・断面）にあり、出典ごとのメモは下記の通りです。

| 形式 | 主な資料 | 採寸の要点 |
|---|---|---|
| E231系1000番台 | Wikimedia Commons の正面・3/4 写真（各ページのライセンスに従う）、itreni.net・4gousya.net / trainsideview の側面写真（参照のみ）、Wikipedia 日本語版 | 垂直な箱形の前面（屋根へ R≈200）、角 R≈120、上辺がわずかにアーチ状の黒い一体パネル、上部の HID 前照灯、オレンジの下に緑の帯、灯具ユニット（内側前照灯・外側尾灯）、台形の切り欠きのあるスカート、側面 4 扉の位置・窓 2,015 mm、帯の高さ、上部の緑帯 3,083–3,238 mm、グリーン車の 2 階建て部分 |
| E233系3000番台 | Wikimedia Commons の正面・側面写真、Flickr の写真（参照のみ） | 前面はほぼ垂直で窓だけ約 200 mm 後傾、グレーのひさし（下辺アーチ）、内側が傾いた白い柱、全灯具が上部、帯 1,410–1,772 mm（扉の上も通る）、銀色の下部と折れ線、2 枚のスカート板、グリーン車の窓配置 |
| 211系3000番台 | JR東日本の公開写真、tetsudo.com、KATO 製品写真・編成図、asahi-net の個人サイト、Wikimedia Commons（参照のみ） | 平らな白い FRP 前面、幅 930 mm のステンレス貫通扉部、屋根に沿って上辺が下がる前面窓、帯に載る灯具（内側前照灯・外側尾灯）、側面の細い帯と上部のオレンジ線、窓割り |
| 115系 湘南色 | Wikimedia Commons の正面・3/4 写真、itreni.net の側面写真（参照のみ）、Wikipedia 日本語版 | 傾斜のない 3 枚窓（側面へ回り込む隅窓）、オレンジ帯 1,711–3,142 mm、貫通扉の U 字のオレンジ、緑のおでこと屋根キャップ、シールドビーム前照灯・タイフォンカバー・尾灯の位置、2-1-2 の窓割り |

写真そのものはリポジトリに含めていません。著作権のある写真（itreni.net、4gousya.net、Flickr、各個人サイトなど）は、寸法を読み取る参考にだけ使い、
テクスチャとして使ったりトレースしたりはしていません。前面のテクスチャは採寸値から手続き的に描いたものです。

## モデルの作り方（build_models.py / cars.py）

- 車体は実車の断面（E231・E233 は裾絞り＋側面のふくらみがある 2,950 mm 幅の拡幅車体）を前後に押し出した閉じたソリッド
- 運転台の前面は、採寸した側面形状（高さごとの後退量）・平面の曲がり・角の丸みから作る曲面で、塗り分け・窓・帯・継ぎ目は
  採寸値（mm）から描いたテクスチャ（`blender/frontpaint.py`、1 ピクセル 2 mm）を正面投影で貼っている。灯具・ワイパー・スカート・表示器は立体部品
- 窓・ドアの溝・ドア窓はブーリアンで実際にへこませ、奥にガラスを入れている
- 帯（湘南色）や白い FRP 部分は面ごとのマテリアルなので、側面のふくらみや前面の丸みにぴったり沿う
- 前面の灯具・行先表示・ワイパー・JR ロゴ（テキストオブジェクト）、スカート、密着連結器、台車（側梁・軸箱・空気ばね・主電動機）、AU726 冷房装置、PS33 / PS16 パンタグラフ
