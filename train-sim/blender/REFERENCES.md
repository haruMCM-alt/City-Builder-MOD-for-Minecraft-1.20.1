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

## モデルの作り方（build_models.py / cars.py）

- 車体は実車の断面（E231・E233 は裾絞り＋側面のふくらみがある 2,950 mm 幅の拡幅車体）を前後に押し出した閉じたソリッド
- 運転台の前面は同じ断面を内側へオフセットしながら前へ送る「ロフト」で、角の丸みを付けて作成
- 窓・ドアの溝・ドア窓はブーリアンで実際にへこませ、奥にガラスを入れている
- 帯（湘南色）や白い FRP 部分は面ごとのマテリアルなので、側面のふくらみや前面の丸みにぴったり沿う
- 前面の灯具・行先表示・ワイパー・JR ロゴ（テキストオブジェクト）、スカート、密着連結器、台車（側梁・軸箱・空気ばね・主電動機）、AU726 冷房装置、PS33 / PS16 パンタグラフ
