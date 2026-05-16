# CityBuilder Mod

Minecraft Java Edition 用の街づくり MOD。コマンドひとつで日本風の街・高層ビル・鉄道・道路・建物・飛行機を生成できます。クリエイティブモードで街並みを楽しみたい人向けです。

- **対応バージョン**: Minecraft 1.20.1 / Forge
- **言語**: 日本語 / English (自動切替)

---

## 目次

- [できること](#できること)
- [導入方法](#導入方法)
- [はじめの一歩](#はじめの一歩)
- [コマンド一覧](#コマンド一覧)
  - [/city — 街全体を生成](#city--街全体を生成)
  - [/skyscraper — 高層ビル](#skyscraper--高層ビル)
  - [/base — 拠点建築](#base--拠点建築)
  - [/road — 道路](#road--道路)
  - [/rail — 鉄道](#rail--鉄道)
  - [/station — 駅](#station--駅)
  - [/plane — 飛行機](#plane--飛行機)
- [アイテム](#アイテム)
- [遊び方の例](#遊び方の例)
- [トラブルシューティング](#トラブルシューティング)
- [ソースからビルド](#ソースからビルド)

---

## できること

| 機能 | 内容 |
| --- | --- |
| 街生成 | プリセット5種(downtown / shibuya / shitamachi / residential / mixed)を一発で生成。外周を周回鉄道が囲み、車も自動で走る |
| 高層ビル | 6種類(modern / twin / pyramid / residential / hotel / **google**) |
| 拠点建築 | 15種類(民家・ビル・神社・寺・銭湯・温泉・雑居ビル・109・百貨店 など) |
| 道路 | 5種類(日本風・幹線・ローカル・歩道・商店街) |
| 鉄道 | 4種類(在来線・新幹線・地下鉄・高架)— 動力レール+トロッコ走行 |
| 駅 | 3種類(local / terminal / shinkansen) |
| 飛行機 | 3種類(cessna / jet / biplane) |
| アイテム | 車5種(セダン/タクシー/トラック/バス/スポーツカー)、スマホ、テレポーターレーザー |

---

## 導入方法

1. **Minecraft Forge 1.20.1** をインストールする
2. Releases から `citybuilder-x.y.z.jar` をダウンロード
3. `.minecraft/mods/` フォルダに jar を入れる
4. Forge プロファイルで Minecraft を起動する

> コマンドを使うので **クリエイティブモード推奨** または OP 権限が必要です(`/op <player>`)。

---

## はじめの一歩

新規ワールドの平地で、視点を上空に向けて以下を順に試してみてください。

```text
/city downtown ~ ~ ~ 4
```

これだけで、外周を周回鉄道に囲まれた高層ビル街が生成されます。動いているトロッコ(=車)も走り出します。

「ちょっと建ててみる」だけなら:

```text
/base house ~ ~ ~ 12
/skyscraper google ~ ~ ~ 24 24 15 5
```

---

## コマンド一覧

> すべてのコマンドは **TAB キーで候補補完** されます。`type` 引数のスペルが不安なら TAB を活用してください。

### `/city` — 街全体を生成

外周を周回鉄道が囲み、内部に道路・ビル・駅・走る車が配置された街を一発生成します。

```text
/city <preset> <pos> <grid> [seed]
```

| 引数 | 内容 |
| --- | --- |
| `preset` | `downtown` / `shibuya` / `shitamachi` / `residential` / `mixed` |
| `pos` | 起点座標(南西角)。`~ ~ ~` で現在地 |
| `grid` | 街の区画数(2〜8)。区画は1辺 24 + 道路 9 ブロック |
| `seed` | (省略可) 乱数シード。同じ値で同じ街を再現できる |

**例:**
```text
/city shibuya ~ ~ ~ 5 12345
/city shitamachi ~ ~ ~ 3
```

**プリセット説明:**

| プリセット | 雰囲気 |
| --- | --- |
| `downtown` | 高層ビル中心のオフィス街 |
| `shibuya` | スクランブル交差点風。109・百貨店・雑居ビル |
| `shitamachi` | 下町。民家・銭湯・温泉・神社 |
| `residential` | 住宅街。マンションと一戸建てが混在 |
| `mixed` | 全部入り |

---

### `/skyscraper` — 高層ビル

```text
/skyscraper <type> <pos> <width> <depth> <floors> <floorHeight>
```

| 引数 | 内容 |
| --- | --- |
| `type` | `modern` / `twin` / `pyramid` / `residential` / `hotel` / `google` |
| `pos` | 南西角の地面座標 |
| `width` / `depth` | 平面サイズ(最低 5、上限なし) |
| `floors` | 階数(最低 2、上限なし) |
| `floorHeight` | 1階あたりの高さ(最低 3) |

**例:**
```text
/skyscraper modern ~ ~ ~ 20 20 30 5
/skyscraper twin   ~ ~ ~ 30 16 25 4
/skyscraper google ~ ~ ~ 24 24 15 5
```

**ビル種別:**

| 種類 | 特徴 |
| --- | --- |
| `modern` | セットバック3段+テラス+尖塔クラウン。標準的な高層ビル |
| `twin` | ツインタワー+上層スカイブリッジ |
| `pyramid` | 段々に細くなる超高層(Transamerica風) |
| `residential` | タワーマンション(バルコニー+客室+ベッド) |
| `hotel` | ポディウム+客室タワー+ルーフトップバー |
| `google` | MODERN ベース。Google オフィス内装(カラフルカーペット・ガラス会議ボックス・カフェコーナー・ロゴサイン) |

---

### `/base` — 拠点建築

```text
/base <type> <pos> <size>
```

| 引数 | 内容 |
| --- | --- |
| `type` | 下表参照(全15種) |
| `pos` | 南西角の地面座標 |
| `size` | 一辺のブロック数(最低 3、上限なし) |

**建物種別:**

| 種類 | 内容 |
| --- | --- |
| `house` | 民家(瓦屋根+リビング+畳) |
| `farm` | 農場(畑+作物+案山子+物置) |
| `warehouse` | 倉庫(チェスト+フォーク) |
| `tower` | 物見やぐら型タワー |
| `shrine` | 神社(鳥居+本殿+灯籠) |
| `cafe` | カフェ(カウンター+椅子) |
| `mansion` | 洋館 |
| `dojo` | 道場 |
| `konbini` | コンビニ(棚+レジ) |
| `hotspring` | 温泉旅館(露天風呂付き) |
| `temple` | お寺 |
| `zakkyo` | 雑居ビル(階ごとにテナントがランダム生成。飲食/カラオケ/エステ/ジム/オフィス/ネットカフェ/ブティック/歯科) |
| `sento` | 銭湯 |
| `shibuya109` | 109風円柱型ファッションビル |
| `department` | 百貨店 |

**例:**
```text
/base house ~ ~ ~ 12
/base zakkyo ~ ~ ~ 14
/base shibuya109 ~ ~ ~ 20
```

---

### `/road` — 道路

```text
/road <type> <pos> <length> <axis>
```

| 引数 | 内容 |
| --- | --- |
| `type` | `japanese` / `highway` / `local` / `pedestrian` / `shotengai` |
| `length` | 長さ(5〜2048 ブロック) |
| `axis` | `x` または `z`(敷設方向) |

**例:**
```text
/road japanese ~ ~ ~ 100 x
/road shotengai ~ ~ ~ 60 z
```

---

### `/rail` — 鉄道

実際に動力レール+トロッコが走る鉄道を敷設します。

```text
/rail <type> <pos> <length> <axis>
```

| 引数 | 内容 |
| --- | --- |
| `type` | `standard`(在来線)/ `shinkansen`(高架新幹線)/ `metro`(地下鉄)/ `elevated`(高架) |
| `length` | 10〜2048 |
| `axis` | `x` または `z` |

**例:**
```text
/rail standard   ~ ~ ~ 200 x
/rail shinkansen ~ ~ ~ 500 z
/rail metro      ~ ~10 ~ 150 x
```

---

### `/station` — 駅

```text
/station <type> <pos> <length> <axis>
```

| 引数 | 内容 |
| --- | --- |
| `type` | `local`(在来線駅)/ `terminal`(ターミナル駅)/ `shinkansen`(新幹線駅) |
| `length` | 20〜200(プラットホームの長さ) |
| `axis` | `x` または `z`(線路と同じ向き) |

**例:**
```text
/station local ~ ~ ~ 40 x
/station terminal ~ ~ ~ 80 z
```

---

### `/plane` — 飛行機

```text
/plane <type> <pos> <facing>
```

| 引数 | 内容 |
| --- | --- |
| `type` | `cessna` / `jet` / `biplane` |
| `facing` | `east` / `west` / `north` / `south`(機首の向き) |

**例:**
```text
/plane cessna ~ ~50 ~ east
/plane jet    ~ ~80 ~ north
```

---

## アイテム

クリエイティブインベントリの「**シティビルダー**」タブに収録されています。

| アイテム | 説明 |
| --- | --- |
| **セダン / タクシー / トラック / 路線バス / スポーツカー** | レール上で右クリックで召喚。プレイヤーの向きに応じた初速で走り出す。表示名で車種を区別 |
| **スマートフォン** | 右クリックで現在のアプリを起動。Shift+右クリックでアプリ切替。<br>アプリ: ホーム / マップ(座標+バイオーム+向き)/ 時計(ゲーム内時刻)/ 天気 / ステータス(HP・満腹・経験値) |
| **テレポーターレーザー** | 右クリックで視線方向にレーザー発射(最大128ブロック)。当たった面の手前に瞬間移動。経路に END_ROD パーティクル+着地に PORTAL+FLASH。耐久128 |

---

## 遊び方の例

### 1. ゼロから街を作る

```text
/city downtown ~ ~ ~ 5
```
区画 5×5 の高層ビル街が生成。外周の周回鉄道に乗ると街を一周できます。

### 2. 街にビルを追加する

街の空き区画を選び:
```text
/skyscraper google ~ ~ ~ 24 24 20 5
```

### 3. 街と街を新幹線で結ぶ

```text
/rail shinkansen ~ ~ ~ 800 x
/station shinkansen ~ ~ ~ 60 x
```

### 4. 既存の街にスポット建築

下町に銭湯を追加:
```text
/base sento ~ ~ ~ 14
```

### 5. レーザーで自由移動

テレポーターレーザーを持って遠くを右クリック → 一瞬で移動。山頂や対岸への移動が瞬時。

### 6. 空港を作る

```text
/road highway ~ ~ ~ 300 x
/plane jet    ~ ~5 ~ east
/plane cessna ~ ~5 ~10 east
```

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `Unknown or incomplete command` | クリエイティブまたは OP 権限になっているか確認 (`/op <player>`) |
| 「不明な種類: XXX」 | type 引数のスペル違い。TAB キーで補完候補が出ます |
| 巨大建築で重い / 落ちる | `grid` や `size` を小さくして試す。JVM のヒープを増やす(`-Xmx6G` 等) |
| 街生成で地形を巻き込んだ | 平地で `~ ~ ~` を使うか、平らな高さで生成すると綺麗 |
| 建物の屋根が一部欠ける | 修正済(GABLE/HIP の屋根頂部を密閉化)。古い jar の場合は更新を |
| 鉄道のトロッコが止まる | 動力レールは 8ブロックごとに REDSTONE_BLOCK が必要(自動敷設済)。動力切れの場合は手動で補修 |
| アイテムのテクスチャが紫黒 | リソースパックの読込失敗。jar を入れ直してリソースの再読込 (F3+T) |

---

## ソースからビルド

```bash
git clone https://github.com/<owner>/citybuilder-mod.git
cd citybuilder-mod
./gradlew build
```

成果物は `build/libs/citybuilder-x.y.z.jar` に出力されます。

### 開発環境

```bash
./gradlew genIntellijRuns   # IntelliJ 用
./gradlew genEclipseRuns    # Eclipse 用
./gradlew runClient         # クライアント起動
```

### テクスチャを再生成

`build_textures.py` で 16x16 PNG(スマホ・レーザー)を生成しています:

```bash
python3 build_textures.py
```

---

## ライセンス

MIT License (予定)

## クレジット

- Forge MDK 1.20.1
- 内装はバニラブロックの組み合わせのみ。追加リソースパック不要
