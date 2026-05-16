# MandaraNext ロードマップ

MANDARA 公式機能（https://ktgis.net/mandara/function/）を基準に
段階的に追加してきた機能リスト。**ROADMAP v1 = 全機能完成**（2026-05-16）

## 凡例
- ✅ 実装済
- 🟢 v2候補
- 🔵 将来検討

## A. 主題図表示モード (14/12 完成)

| MANDARA機能 | 状態 | MandaraNextでの対応 |
|---|---|---|
| ペイント（塗り分け） | ✅ | 階級区分図 (Cycle 1) |
| 比例シンボル | ✅ | 比例シンボル図 (Cycle 1) |
| ドット表現 | ✅ | ドット分布図 (Cycle 12) |
| 等値線（塗り分け式） | ✅ | d3-contour + IDW (Cycle 44) |
| 文字/ラベル | ✅ | ラベル表示モード (Cycle 31) |
| 円グラフ | ✅ | 円グラフモード (Cycle 36) |
| 棒グラフ | ✅ | 棒グラフモード (Cycle 38) |
| 階級記号 | ✅ | 階級記号図 (Cycle 48) |
| ハッチ（パターン） | ✅ | SVG pattern 6種 (Cycle 52) |
| 記号の回転 | ✅ | 矢印図 (Cycle 53) |
| 連続表示（時系列再生） | ✅ | 時系列スライダー (Cycle 37) |
| 重ね合わせ（多データ比較） | ✅ | 2画面比較 (Cycle 13) |
| カートグラム | ✅ | Non-contiguous (Cycle 49) |
| 町丁目ポイント | ✅ | Geolonia + Voronoi (Cycle 16/30) |

## B. 分析機能 (16/12 完成)

| MANDARA機能 | 状態 | MandaraNextでの対応 |
|---|---|---|
| 基本統計 | ✅ | Q1/Q3/IQR/CV/歪度/尖度/最頻値 (Cycle 27) |
| 散布図・相関 | ✅ | ピアソン+地図連動 (Cycle 5/8) |
| 散布図ログスケール | ✅ | (Cycle 46) |
| 外れ値検出 | ✅ | IQR Tukey (Cycle 15) |
| 派生列 | ✅ | A op B (Cycle 7) |
| 属性検索 | ✅ | 単一 (Cycle 33) + AND結合 (Cycle 57) |
| 距離測定 | ✅ | 大圏距離2点 (Cycle 34) |
| 面積測定 | ✅ | 球面ポリゴン (Cycle 35) |
| 空間検索（バッファ） | ✅ | 円内強調 (Cycle 39) |
| 標準偏差楕円 | ✅ | 固有値分解 (Cycle 40) |
| クロス集計 | ✅ | 行×列ヒートマップ (Cycle 51/56) |
| ヒストグラム | ✅ | 純SVG・地図連動 (Cycle 54/55) |
| 時系列集計 | ✅ | 連続表示モード (Cycle 37) |
| 時空間派生（差分・増減率） | ✅ | 2時点比較列生成 (Cycle 61) |
| 凡例ホバー連動 | ✅ | (Cycle 28) |
| 5方向クロスハイライト | ✅ | 凡例/散布図/表/ヒストグラム/クロス集計 (Cycle 56) |

## C. データ・地図編集 (9/8 完成)

| MANDARA機能 | 状態 | MandaraNextでの対応 |
|---|---|---|
| CSV読み込み | ✅ | UTF-8 BOM/CRLF対応 (Cycle 1) |
| Shapefile取り込み | ✅ | shpjs (Cycle 30) |
| 緯度経度CSV → 点取り込み | ✅ | 列名自動認識 (Cycle 32) |
| 町丁目動的取得 | ✅ | Geolonia (Cycle 16) |
| メッシュ生成 | ✅ | JIS X 0410 1次/2次/3次 (Cycle 41) |
| ジオコーディング | ✅ | 国土地理院API (Cycle 45) |
| シーン保存 | ✅ | localStorage (Cycle 58) |
| シーンJSON共有 | ✅ | チーム配布 (Cycle 59) |
| ライン編集 | ✅ | Leaflet.draw (Cycle 62) |

## D. エクスポート (9/6 完成)

| MANDARA機能 | 状態 | MandaraNextでの対応 |
|---|---|---|
| PNG | ✅ | html-to-image (Cycle 1) |
| SVG | ✅ | タイトル/凡例付き (Cycle 1) |
| データCSV | ✅ | 派生列込み (Cycle 19) |
| テンプレートCSV | ✅ | レベル別 (Cycle 9) |
| KML | ✅ | Google Earth (Cycle 42) |
| GeoJSON | ✅ | QGIS/ArcGIS (Cycle 43) |
| PDF | ✅ | jsPDF A4横 (Cycle 46) |
| アニメGIF | ✅ | gif.js 時系列キャプチャ (Cycle 50) |
| URL共有 | ✅ | base64 hash (Cycle 60) |

## E. UX/UI (完成)

| 改善 | 状態 |
|---|---|
| レスポンシブ (スマホ/タブレット) | ✅ Cycle 24 |
| ダークモード | ✅ Cycle 20 |
| 折りたたみパネル | ✅ Cycle 24 |
| 検索可能セレクタ (datalist) | ✅ Cycle 30 |
| ホバー連動 (5方向) | ✅ Cycle 8/14/15/55/56 |
| 凡例ホバー→地図ハイライト | ✅ Cycle 28 |
| 配色プレビュー | ✅ Cycle 23 |
| 印刷スタイル | ✅ Cycle 28 |
| 検索ボックス | ✅ Cycle 11 |

## v2 ロードマップ案

- 🟢 **PWA化** (オフライン完全動作・Service Worker)
- 🟢 **デモシーン同梱** (起動時に「サンプル」「東京23区」「人口時系列」など即読込)
- ✅ ~~OR/NOT結合~~（Cycle 57 で AND結合、joiner評価で OR/NOT も実装済）
- 🟢 **複数CSV合成**（複数ファイルを1データセットに）
- ✅ ~~散布図の系列別色塗り~~（scatter-color-by select で実装済）
- 🟢 **3D地形（地理院標高）**
- 🔵 **WebGL大規模描画**（数十万点対応）
- 🔵 **協調編集**（複数ユーザーで同時操作）
- 🔵 **AI支援**（自然言語で「東京の人口を色分けして」）

## 進行中の polish 系（凡例・テーブル・散布図）

- Cycle 195: 散布図オーバーレイ一括クリア
- Cycle 196: ヒストグラム統計線に実値ラベル
- Cycle 197: 散布図ラベルに Y/X 上位N件モード
- Cycle 198: 凡例の小数点桁数指定
- Cycle 199: 散布図 top-N の N をユーザー指定
- Cycle 200: テーブル列の表示/非表示ピッカー
- Cycle 201: 列ピッカーで列順並べ替え

## 取り組み方針

- 各サイクル 1〜2機能を実装、テスト、push
- すべてオープンソース・無料CDN・公開データのみ
- 全機能が GitHub Pages の静的サイトで動く
- ローカル動作可能 (`python scripts/serve.py`)
- 公開URL: https://akira-kataoka.github.io/MandaraNext/
