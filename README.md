# MandaraLocal

ローカル & 無料で動く、MANDARA インスパイア の地理情報分析支援ツール（Web版）。
都道府県・市町村データから階級区分図（コロプレス図）・比例シンボル図を作れます。

🌐 **公開デモ**: https://akira-kataoka.github.io/MandaraLocal/

> 参考: 谷 謙二氏 [MANDARA](https://ktgis.net/mandara/) — 本プロジェクトは独立したオープン実装で、ライセンス・ソースコードは無関係です。

---

## 特徴

- **完全ローカル動作可**：自分のPCで完結。データは外部送信されません。
- **完全無料**：すべて無料ライブラリ（CDN）と公開オープンデータ。
- **2つの地域レベル**：
  - 都道府県（47件）
  - 市町村（**1,742件 / 全国対応**）
- **Web展開そのまま**：ビルド不要の素のHTML/CSS/JS構成。GitHub Pages で即公開。
- **MANDARA ライクな操作感**：
  - CSV読み込み（地域名/コード/英語表記いずれもOK）
  - 階級区分図（等値・等量・自然区分Jenks）+ 対数スケール
  - 8種の色パレット選択（YlOrRd, Blues, RdYlBu, Viridis 他）
  - 比例シンボル図（円の大きさで量を表現）
  - 基本統計量パネル
  - PNG / SVG エクスポート（タイトル・凡例つき）
  - ホバーで地域名・値の表示（日本語）

## 起動方法

### Windows

[`start.bat`](start.bat) をダブルクリック → `http://localhost:8765/` がブラウザで自動的に開きます。

### Mac / Linux / 手動

```bash
python3 scripts/serve.py
# または python scripts/serve.py 8000  (ポート指定)
```

> ※ `file://` 直開きはブラウザのCORS制約でCSV/GeoJSONが読めません。必ずローカルサーバー経由で。

## 使い方

1. 左サイドバーの「**分析レベル**」で「都道府県」または「市町村」を選ぶ
2. 「**サンプルデータを読み込む**」をクリック
3. 「対象列」「区分方法」「色パレット」「表現方法」を変更して可視化を調整
4. ヘッダの「**PNG出力**」「**SVG出力**」で書き出し

### 都道府県レベル CSV 形式
```csv
都道府県,人口
東京都,14047594
大阪府,8837685
...
```

1列目: 都道府県名（`東京都`/`東京`/`Tokyo`） or コード（1〜47）

### 市町村レベル CSV 形式
```csv
市区町村,人口
新宿区,349385
府中市,260274
...
```

1列目: 日本語名（`新宿区`）/ 英語名（`Shinjuku`）/ id（`13003`）どれでもマッチ

## Web公開

ビルド不要なので、リポジトリをそのまま静的ホスティングに上げるだけ：

| ホスティング | 月額費用 | メモ |
|---|---|---|
| **GitHub Pages** | **0円** | このリポジトリで実装済み（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)） |
| Cloudflare Pages | 0円 | 帯域無制限 |
| Netlify / Vercel | 0円 | ドラッグ&ドロップでもOK |

**ワンクリック公開**: [`auto_publish.bat`](auto_publish.bat) をダブルクリック → ブラウザで Authorize ボタン1回押すだけで GitHub Pages へ自動デプロイ。

## 技術スタック（全部CDN）

| 役割 | 採用 |
|---|---|
| 地図描画 | [Leaflet](https://leafletjs.com/) 1.9 (1,742市町村はCanvas高速描画) |
| タイル | OpenStreetMap / 国土地理院タイル |
| CSV | [PapaParse](https://www.papaparse.com/) |
| 統計・分類 | [simple-statistics](https://simplestatistics.org/) (Jenks自然区分) |
| 配色 | [chroma.js](https://gka.github.io/chroma.js/) |
| 画像出力 | [html-to-image](https://github.com/bubkoo/html-to-image) |
| ローマ字→カナ | [WanaKana](https://wanakana.com/) |

## データソース（全部CC0/CC-BY）

| データ | 出典 | ライセンス |
|---|---|---|
| 都道府県境界 | [dataofjapan/land](https://github.com/dataofjapan/land) | Public Domain |
| 市町村境界 | [GeoBoundaries ADM2](https://www.geoboundaries.org/) | CC BY 4.0 |
| 日本語マッピング | [Geolonia japanese-addresses](https://github.com/geolonia/japanese-addresses) | CC BY 4.0 |
| サンプル人口データ | 総務省統計局 国勢調査2020年 | 出典明示で再利用可 |

## ディレクトリ構成

```
MandaraLocal/
├── index.html
├── start.bat                  # Windows ワンクリック起動
├── auto_publish.bat           # GitHub Pages ワンクリック公開
├── scripts/
│   ├── serve.py               # ローカルサーバー (threaded)
│   ├── build_municipalities.py        # GeoBoundaries → pref結合
│   ├── build_muni_jp_map.py           # Geolonia → 日本語マッピング
│   ├── install_autostart.bat          # Windows ログイン時に自動起動
│   └── ...
├── css/style.css
├── js/
│   ├── main.js                # アプリ全体の orchestration
│   ├── map.js                 # Leaflet 描画
│   ├── data.js                # CSV パーサ + 地域コード正規化
│   ├── classification.js      # 階級区分 (quantile/equal/Jenks/log)
│   ├── color.js               # カラーパレット
│   ├── legend.js              # 凡例描画
│   ├── stats.js               # 記述統計
│   ├── export.js              # PNG / SVG 出力
│   ├── settings.js            # localStorage 保存
│   └── pref_table.js
└── data/
    ├── japan_prefectures.geojson           # 都道府県境界 (13MB)
    ├── sample_population.csv               # 都道府県サンプル
    ├── sample_tokyo_wards.csv              # 市町村サンプル
    └── cities/
        ├── japan_municipalities.geojson    # 1,742市町村 (5.3MB)
        └── muni_jp_names.json              # ローマ字↔日本語マッピング (97KB)
```

## 次期計画

- [ ] **散布図 / 相関分析パネル**
- [ ] **e-Stat API 連携** (公的統計を直接取込)
- [ ] **時系列再生**（年次データの自動切替）
- [ ] **カートグラム**（変形地図）
- [ ] **政令市の区マッピング補完** (現在カバレッジ84%→100%へ)

## ライセンス

本プロジェクトのコード: MIT
