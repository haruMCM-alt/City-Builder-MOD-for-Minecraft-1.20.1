# Boeing 787-9 — 寸法・性能データと出典 / Specifications & sources

モデル (`blender/b787_geometry.py`) と飛行モデル (`web/js/flightmodel.js`) は以下の数値を基にしています。
公開資料に直接の値が無い項目は、公開値から導いた推定値で「推定」と明記しています。

## 機体寸法 / Dimensions

| 項目 | 値 | モデルでの扱い | 出典 |
|---|---|---|---|
| 全長 Overall length | 62.81 m | 胴体長 62.81 m（機首〜APU排気口） | BA fleet facts, PlaneFYI |
| 全幅 Wingspan | 60.12 m | 半翼幅 30.06 m（レイクド・ウイングチップ含む） | BA fleet facts, PlaneFYI |
| 全高 Height | 17.02 m | 地上〜垂直尾翼端 17.02 m | BA fleet facts, PlaneFYI |
| 胴体外径 Fuselage | 幅 5.77 m × 高 5.97 m | 断面スーパー楕円で同寸 | Boeing 787 ACAP † |
| 客室幅 Cabin width | 5.49 m | — | Simple Flying |
| 翼面積 Wing area | 377 m² | 376.6 m²（平面形から数値積分） | BA fleet facts, Simple Flying |
| 後退角 Sweep (¼ chord) | 32.2° | 前縁 35.4°、¼弦 ≈ 32° | Simple Flying, Lissys analysis |
| アスペクト比 | ≈ 9.6 | 60.12² / 377 = 9.59 | Simple Flying |
| 上反角 Dihedral | ≈ 6° | 6° + 緩やかな上向き湾曲 | Lissys 787-8 geometry |
| 翼根弦長 Root chord | 38.9 ft (11.9 m, 787-8 gross) | 中心線上 12.7 m（推定） | Lissys 787-8 geometry |
| 水平尾翼面積 | 832.5 ft² (77.3 m²) | 78.7 m²、翼幅 19.4 m | Lissys 787-8 geometry |
| 垂直尾翼面積 | 427.5 ft² (39.7 m², 台形基準) | 露出面積 ≈ 50 m²（ドーサルフィン含む推定） | Lissys 787-8 geometry |
| ホイールベース Wheelbase | 25.83 m | 前脚〜主脚 25.83 m | Boeing 787 ACAP（検索結果より） |
| トレッド Main gear track | 9.80 m | 主脚間隔 9.80 m | Boeing 787 ACAP（検索結果より） |
| 主脚タイヤ | 54×21.0R23（-9） | 直径 1.37 m × 幅 0.53 m、4輪ボギー | 推定（-9 仕様） |
| 前脚タイヤ | 40×16R16 | 直径 1.02 m、2輪 | 推定 |
| エンジン | GE GEnx-1B / RR Trent 1000 | GEnx-1B：ファン径 2.82 m (111 in) †、18 枚ワイドコード・ファン、18 枚シェブロン | BA fleet facts（型式）, GE † |
| 窓 Cabin windows | 約 27 × 47 cm | 0.27 × 0.47 m、ピッチ 0.965 m | Boeing † |
| ドア | Type A × 4 対 | 1.07 × 1.93 m | 推定 |

## 重量・性能 / Weights & performance

| 項目 | 値 | 出典 |
|---|---|---|
| 最大離陸重量 MTOW | 254,011 kg | BA fleet facts, PlaneFYI |
| 最大着陸重量 MLW | 192,777 kg | Boeing 787 ACAP † |
| 最大零燃料重量 MZFW | 181,437 kg | Boeing 787 ACAP † |
| 運航空虚重量 OEW | ≈ 128,850 kg | 代表値 † |
| 燃料容量 | 126,372–126,429 L（≈ 101 t） | BA fleet facts |
| 推力 | 64,000–76,000 lbf 級（モデル：74,100 lbf/基） | aircraftinvestigation.info |
| 巡航速度 | Mach 0.85 | BA fleet facts |
| 最大運用マッハ Mmo | 0.90 | aircraftinvestigation.info |
| 実用上昇限度 | 43,000–43,100 ft | aircraftinvestigation.info |
| V2（参考） | ≈ 180 kt（重量・フラップ依存） | aircraftinvestigation.info |
| Vref（参考） | ≈ 143–150 kt @MLW, Flaps 30 | aircraftinvestigation.info, Infinite Flight community |
| 航続距離 | 7,565 nm | BA fleet facts |

飛行モデルの検証（`tests/flight_test.mjs`）:

* 199.8 t・Flaps 5・最大推力で VR ≈ 147 kt、浮揚 ≈ 158 kt、滑走 ≈ 1.3 km
* FL350 で M0.84・N1 75 %・燃料流量 ≈ 2.8 t/h/基（TSFC ≈ 0.57 lb/lbf/h）
* 最大揚抗比 ≈ 20（CD0 = 0.0162、e ≈ 0.85）
* ILS 27 オートランド：接地 −217 fpm、中心線から 1.0 m、進入端から 609 m

## 出典 / Sources

* [British Airways — Boeing 787-9 fleet facts](https://www.britishairways.com/content/information/about-ba/fleet-facts/boeing-787-9)
* [KLM — Boeing 787-9 specifications](https://www.klm.com/information/travel-class-extra-options/aircraft-types/boeing-787-9)
* [PlaneFYI — Boeing 787-9 specs](https://planefyi.com/aircraft/boeing-787-9/)
* [Aviation Geeks — Boeing 787-9](https://www.aviation-geeks.com/aircraft/b789)
* [Boeing — 787 Airplane Characteristics for Airport Planning (ACAP)](https://www.boeing.com/content/dam/boeing/v2/airports/acaps/787_Rev_P.pdf)
* [Simple Flying — The 787's unique wing design](https://simpleflying.com/boeing-787-dreamliner-unique-wing-design-sets-apart-every-other-widebody/)
* [Lissys — Boeing 787-8 Piano sample analysis](https://www.lissys.uk/samp1/index.html)
* [KN Aviation — Boeing 787 specs](https://knaviation.net/boeing-787-specs/)
* [aircraftinvestigation.info — Boeing 787-9 performance](https://aircraftinvestigation.info/airplanes/Boeing_787-9.html)
* [Jettly — 787 takeoff and landing speeds](https://jettly.com/post/takeoff-speed-of-787)
* [Infinite Flight Community — 787-9 approach speed](https://community.infiniteflight.com/t/787-9-approach-speed-glide-slope/76354)

> 注：この環境からは上記サイトの本文を直接取得できなかったため、数値は検索結果の抜粋に基づきます。
> † 印は一般に公表されている値ですが、今回の検索結果では確認できなかった項目です（ACAP 原本での確認を推奨）。
> 空力係数・慣性モーメント・脚ばね定数などは公開値から逆算した推定値です。
> 塗装「CITY BUILDER AIRWAYS / シティビルダー航空」と登録記号 JA787C は架空のものです。
