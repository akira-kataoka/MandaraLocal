# GitHub Pages 公開手順（5分）

完全無料・無期限ホスティング。所要時間 5分・追加費用 0円。

## 前提

- GitHub アカウント（無料）
- このリポジトリは `git init` + 初回コミット済み（`commit log` で確認可能）

## 手順

### 1. GitHub で新しいリポジトリを作る

1. https://github.com/new を開く
2. **Repository name**: `MandaraLocal`（任意）
3. **Public** を選択（GitHub Pages の無料枠は Public のみ）
4. **README, .gitignore, license は何も追加しない**（すでにある）
5. 「Create repository」をクリック

### 2. ローカルからリモートに push

GitHub の作成完了画面に表示されるコマンドのうち、**HTTPS 版** をコピーして実行：

```bash
cd "C:/Users/user/OneDrive/ドキュメント/Github/MandaraLocal"
git remote add origin https://github.com/<YOUR-USERNAME>/MandaraLocal.git
git push -u origin main
```

> Windowsなら付属の `publish.bat` をダブルクリック → GitHubユーザー名を聞かれるので入力するだけ。

初回 push 時は GitHub の認証画面（ブラウザ）が開きます。許可するだけ。

### 3. GitHub Pages を有効化

1. GitHub のリポジトリページ → **Settings** タブ
2. 左サイドバー → **Pages**
3. **Source** を **「GitHub Actions」** に切り替え（"Deploy from a branch" ではない）
4. 保存

その時点で `.github/workflows/deploy.yml` が自動的に走ります（リポジトリの **Actions** タブで進捗確認可能）。

### 4. 完了

1〜2分で公開完了。URL は：

```
https://<YOUR-USERNAME>.github.io/MandaraLocal/
```

リポジトリ Settings → Pages 画面の上部に「Your site is live at ...」と表示されます。

## 以降の更新

ローカルで変更 → コミット → push するだけで自動的に再デプロイされます：

```bash
git add -A
git commit -m "変更内容"
git push
```

## トラブル

| 現象 | 対処 |
|---|---|
| `git push` で 403 | GitHub上の repo が Public か確認 |
| Pages が "404" のまま | Actions タブで deploy.yml が成功しているか確認 |
| 認証が通らない | Windowsなら git-credential-manager が自動起動。インストール済み |
| **CSV/GeoJSON が 404** | `start_silent.vbs` を `data/` 内に置かないこと。ルートに置く |

## 容量・制限

GitHub Pages 無料枠：

- リポジトリ容量: 1 GB（このプロジェクトは現状 ≈ 25MB）
- 月間帯域: 100 GB（個人利用なら超過の心配なし）
- 月間ビルド回数: 10 GB（自動デプロイで使用、こちらも実質無制限）

すべて **無料・無期限** です。
