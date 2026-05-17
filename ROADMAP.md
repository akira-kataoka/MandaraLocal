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

## 進行中の polish 系（凡例・テーブル・散布図・分析）

### 凡例 / 配色
- Cycle 198: 凡例の小数点桁数指定 (auto / 0..3)
- Cycle 202: 凡例カスタムカラー一括リセット
- Cycle 203: 凡例単独を PNG 保存
- Cycle 207: 凡例単独を SVG 保存（foreignObject + 計算スタイルinline）
- Cycle 211: 凡例の縦/横レイアウト切替
- Cycle 226: 横レイアウトでクラスカウント自動省略

### テーブル
- Cycle 200: テーブル列の表示/非表示ピッカー
- Cycle 201: 列ピッカーで列順並べ替え
- Cycle 208: 数値セル背景ヒートマップ（青→白→赤）
- Cycle 209: 派生列を列ピッカーから削除
- Cycle 215: 散布図ピン点をテーブル行で赤左ボーダー強調
- Cycle 218: 表示中CSV（検索/ソート/列順/列表示反映）
- Cycle 236: ピン左ボーダーが pin color に追従

### 散布図
- Cycle 195: 散布図オーバーレイ一括クリア
- Cycle 197/199: ラベル top-N (Y/X) と N パラメータ化
- Cycle 206: ラベル列指定（地域名以外）
- Cycle 212/214/216: Shift+クリックでピン留め (リング/CSV出力/地図赤輪)
- Cycle 219/220: シェイプ列指定 (5形状) + シェイプ凡例
- Cycle 221/222/223: 系列別回帰線 + 比較表 + CSV出力
- Cycle 224: Simpson's paradox 自動アラート
- Cycle 227: SVG にも n / r / R² サブタイトル
- Cycle 229: ラベル衝突回避モード切替 (auto/corner/overlap)
- Cycle 231: ピン点ラベル赤太字
- Cycle 233/234: 2群限定 — slope 差 t 検定 + Markdown/CSV連携
- Cycle 235: ピン色をユーザー指定
- Cycle 237: 外れ値を一括ピン
- Cycle 238: brush 選択をピン化
- Cycle 239: ピン留め点リストを結果Markdownに
- Cycle 240: ピン情報をシーン共有URLに含める

### ヒストグラム / boxplot
- Cycle 196: 統計線 (μ/M/±σ) に実値ラベル
- Cycle 204: bin別カウントを CSV (lo, hi, count, pct, cum_pct)
- Cycle 205: boxplot 5数要約 CSV (グループ別対応)
- Cycle 210: ヒストグラム累積 (CDF) モード
- Cycle 228: boxplot PNG 保存

### クロス集計
- Cycle 213: 100%積み上げ棒グラフ表示モード
- Cycle 217: 棒グラフ PNG/SVG 保存
- Cycle 232: 結果Markdown に χ² / Cramér's V

### シーン共有 / その他
- Cycle 225: シーン共有 URL の QR 表示
- Cycle 240: シーン共有 URL にピン留めID + ピン色を含める
- Cycle 246: starredFields もシーン snapshot 経由で共有
- Cycle 250: ヘルプ / ショートカット一覧モーダル (?キー)
- Cycle 256/279: APP_VERSION 表示 / Ctrl+Shift+S シーン保存
- Cycle 276/278: シーン保存/削除時に含有件数を confirm 表示
- Cycle 277: シーン一覧 option に 📌N ★M バッジ

### 🚨 緊急修正 + 安定化 (Cycle 298-309)
- Cycle 298: Cycle 287-297 を巻き戻し（JS 初期化エラー対応）
- Cycle 299: 住所/地名検索を datalist で候補リスト選択化
- Cycle 300-302: Service Worker を完全廃止（network-first → 全停止）+ body-flex で地図高さ修正
- Cycle 303: ヘッダドロップダウンメニュー化 + Leaflet invalidateSize 強制
- Cycle 304: **r2 重複宣言の SyntaxError 修正（根本原因）**
- Cycle 305: 都道府県 datalist のコード label 削除
- Cycle 306-308: 町丁目 Voronoi セル表示トグル + 注釈 (近似である旨)
- Cycle 309: 内部 ESM モジュール全てに `?v=` cache busting

### 🎨 UI/UX 大改修 (Cycle 310-319)
- Cycle 310: サイドバー panel をカード化（左ボーダー + 影 + h2 帯）
- Cycle 311: 各 panel に絵文字アイコン + カテゴリ別カラーレール (緑/青/紫)
- Cycle 312: サイドバーに「📥 データ準備 / 🎨 描画設定 / 🔬 分析」のグループ見出し
- Cycle 313: グループ見出しを sticky 化（スクロール中も表示）
- Cycle 314: ダークモードドロップダウン + e-Stat 境界 GeoJSON 案内
- Cycle 315: subtitle 縦書き防止 + +オーバーレイ ボタン強調
- Cycle 316: フォーム要素 :focus-visible リング + ボタン hover/active 反応
- Cycle 317: 「全て閉じる / 全て開く」一括コントロール
- Cycle 318: SEO / OGP メタタグ整備
- Cycle 319: フッター（クレジット + クイックリンク）

### 🔵 ピン留めシステム（Cycle 212-275 集約）
- **6 surface で Shift+クリック / Shift+ヘッダー → ピン留め**
  - 散布図の点 (212) / テーブル行 (251) / 凡例 swatch (252) / ヒスト bar (253) / クロス集計セル (255/258) / 地図地物 (254)
- **5 export 形式**
  - 地図 (216 markPinned) / 散布図リング (212/271) / テーブル行バッジ (215/275) / Markdown 表 (239/272) / CSV (214/273)
- **番号体系**
  - 散布図リング # (271) → 地図 # (274) → Markdown # 列 (272) → CSV # 列 (273) → テーブル #N バッジ (275) で 5surface 完全整合
- **bulk-pin 操作**
  - 外れ値一括ピン (237) / brush→ピン (238) / 凡例クラス一括 (252) / ヒスト bin (253) / ファセット bin (263) / クロス集計セル (255/258)
- **hotkey**
  - Shift+P ピンへズーム (266) / Shift+O 外れ値ピン (267) / Shift+B brush→ピン (268) / Shift+Esc 全解除 (265)
- **アシスト機能**
  - ピン色ユーザー指定 (235/236) / brush bbox 表示 (261) / ピンへズーム (243) / 地図/散布図ピン同期 (215/216) / ピンCSV+Markdownコピー (214/249)

## 取り組み方針

- 各サイクル 1〜2機能を実装、テスト、push
- すべてオープンソース・無料CDN・公開データのみ
- 全機能が GitHub Pages の静的サイトで動く
- ローカル動作可能 (`python scripts/serve.py`)
- 公開URL: https://akira-kataoka.github.io/MandaraNext/
