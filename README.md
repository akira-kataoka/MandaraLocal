# MandaraLocal

ローカル & 無料で動く、MANDARA インスパイア の地理情報分析支援ツール（Web版）。
ブラウザだけで、都道府県データから階級区分図（コロプレス図）を作れます。

> 参考: 谷 謙二氏 [MANDARA](https://ktgis.net/mandara/) — 本プロジェクトは独立したオープン実装で、ライセンス・ソースコードは無関係です。

---

## 特徴

- **完全ローカル動作**：自分のPCで完結。データは外部送信されません。
- **コストゼロ**：すべて無料ライブラリ（CDN）と公開オープンデータ。
- **Web展開そのまま**：ビルド不要の素のHTML/CSS/JS構成。GitHub Pages / Netlify / Cloudflare Pages にzipアップロードで動きます。
- **MANDARA ライクな操作感**：
  - CSV読み込み（都道府県名 or 都道府県コード）
  - 階級区分図（等値・等量・自然区分Jenks）
  - 色パレット選択（YlOrRd, Blues, RdYlBu, Viridis 他）
  - 基本統計量パネル
  - PNG / SVG エクスポート
  - ホバーで都道府県名・値の表示

## 起動方法

### Windows

ダブルクリック：

```
start.bat
```

`http://localhost:8765` がブラウザで自動的に開きます。

### Mac / Linux / 手動

```bash
python3 scripts/serve.py
# または python scripts/serve.py 8000  (ポート指定)
```

> ※ `file://` 直開きはブラウザのCORS制約でCSV/GeoJSONが読めません。必ずローカルサーバー経由で。

## 使い方

1. ブラウザで `http://localhost:8765` を開く
2. 左サイドバーの「**サンプルデータを読み込む**」をクリック
3. 「対象列」を切り替えて、人口・人口密度・高齢化率 などを地図化
4. 区分方法・階級数・色パレットを変更して可視化を調整
5. ヘッダの「**PNG出力**」「**SVG出力**」で書き出し

### 独自CSVの形式

```csv
都道府県,指標A,指標B
北海道,1234,56.7
青森県,890,12.3
...
```

- **1列目**：都道府県名（「東京都」「東京」「Tokyo」のいずれもOK）または ISO 3166-2 都道府県コード（1〜47）
- **2列目以降**：数値データ列。複数列OK。空欄や「-」「NA」は欠損として扱われます。

## Web公開（無料）

ビルド不要なので、リポジトリ全体を以下のいずれかにアップするだけ：

| ホスティング | 月額費用 | メモ |
|---|---|---|
| GitHub Pages | 0円 | リポジトリ Settings → Pages → main / root |
| Cloudflare Pages | 0円 | 帯域無制限 |
| Netlify | 0円 | ドラッグ&ドロップでもOK |
| Vercel | 0円 | 同上 |

> 13MB のGeoJSONを配信するので、初回ロードは1〜3秒程度かかります。
> 将来的に [TopoJSON 化](#次期計画) で 1〜2MB に圧縮可能。

## 技術スタック

| 役割 | 採用 | コスト |
|---|---|---|
| 地図描画 | [Leaflet](https://leafletjs.com/) | 無料・OSS |
| タイル | OpenStreetMap / 国土地理院タイル | 無料・公開 |
| CSV | [PapaParse](https://www.papaparse.com/) | 無料・OSS |
| 統計 | [simple-statistics](https://simplestatistics.org/) | 無料・OSS |
| 配色 | [chroma.js](https://gka.github.io/chroma.js/) | 無料・OSS |
| 画像出力 | [html-to-image](https://github.com/bubkoo/html-to-image) | 無料・OSS |
| 境界データ | [dataofjapan/land](https://github.com/dataofjapan/land) (Public Domain) | 無料 |

すべてCDN経由（`unpkg`）で取得。インストール不要。

## ディレクトリ構成

```
MandaraLocal/
├── index.html
├── start.bat           # Windows ワンクリック起動
├── scripts/serve.py    # ローカルサーバー
├── css/style.css
├── js/
│   ├── main.js
│   ├── map.js          # Leaflet 地図 + GeoJSON 描画
│   ├── data.js         # CSV パーサ + 地域コード正規化
│   ├── classification.js # 階級区分 (quantile/equal/Jenks)
│   ├── color.js        # カラーパレット
│   ├── legend.js       # 凡例描画
│   ├── stats.js        # 記述統計
│   ├── export.js       # PNG / SVG 出力
│   └── pref_table.js   # 都道府県コード/名称テーブル
└── data/
    ├── japan_prefectures.geojson  # 都道府県境界 (13MB)
    └── sample_population.csv       # 2020年国勢調査サンプル
```

## 次期計画

- [ ] **市町村レベル**の境界対応（国土数値情報 N03）
- [ ] **TopoJSON化** で初回読み込み高速化（13MB → 1〜2MB）
- [ ] **比例シンボル図**（円・四角の大きさで量を表現）
- [ ] **ドット分布図**
- [ ] **カートグラム**（変形地図）
- [ ] **時系列再生**（年次データの自動切替）
- [ ] **e-Stat API 直接取り込み**
- [ ] **複数列の相関分析・散布図**
- [ ] **PWA化**（オフライン完全動作）

## ライセンス

本プロジェクトのコード: MIT

同梱データ:
- `data/japan_prefectures.geojson` — [dataofjapan/land](https://github.com/dataofjapan/land) (Public Domain CC0)
- `data/sample_population.csv` — 総務省統計局 2020年国勢調査より作成（出典明示で再配布可）
