# ライフプランシミュレーター

家族のライフプランをシミュレーションするPWAアプリです。

## デプロイ手順（Vercel）

### ステップ1: GitHubにアップロード

1. https://github.com にアクセスしてログイン
2. 右上の「＋」→「New repository」をクリック
3. Repository name: `lifeplan-app`
4. 「Create repository」をクリック
5. 表示されたページの「uploading an existing file」をクリック
6. このフォルダの全ファイルをドラッグ＆ドロップ
7. 「Commit changes」をクリック

### ステップ2: Vercelにデプロイ

1. https://vercel.com にアクセス
2. 「Sign Up」→「Continue with GitHub」でログイン
3. 「Add New Project」をクリック
4. `lifeplan-app` を選んで「Import」
5. Framework Preset: **Vite** を選択
6. 「Deploy」をクリック
7. 1〜2分で完了！URLが発行されます

### ステップ3: スマホのホーム画面に追加

**iPhone（Safari）:**
1. 発行されたURLをSafariで開く
2. 下部の共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」をタップ

**Android（Chrome）:**
1. 発行されたURLをChromeで開く
2. 「ホーム画面に追加」のバナーが出るのでタップ
3. または右上メニュー→「アプリをインストール」

## 技術スタック
- React 18
- Vite 4
- Recharts
- vite-plugin-pwa（PWA対応）
