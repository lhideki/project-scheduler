# Project Scheduler

依存関係・マイルストーン・スプリントを考慮した自動スケジューリング機能を持つ、単一HTMLで動くWBS/ガントチャート型のプロジェクト管理ツールです。サーバーやアカウント登録は不要で、`project_scheduler.html` を1つブラウザで開くだけで使えます。

![WBS/ガント](docs/images/wbs-gantt.png)

![バージョン比較](docs/images/compare-version.png)

![ネットワーク図](docs/images/network.png)

![スプリント定義](docs/images/define-sprint.png)

## 主な機能

- アウトラインでWBSを管理し、稼働日カレンダー(土日・日本の祝日を考慮)に基づくガントチャートを表示します。
- タスクの依存関係をネットワーク図(PERT図)としても表示できます。
- FS/SS/FF/SFの4種類の依存関係と、リード/ラグ(前後にずらす日数)を設定できます。
- マイルストーンは「柔軟(依存関係から順算)」「固定(期日から逆算)」の2モードを切り替えられます。
- CPM(クリティカルパス法)により、フロートとクリティカルパスを自動計算して可視化します。
- 担当者の週次・月次の稼働上限を考慮した自動リソース平準化に対応しています。
- 開始日・終了日・テーマを持つスプリントを定義し、タスク単位(1タスク=複数スプリント可、グループへの紐付けは不可)で割り当てて、ガントチャート上に帯として表示します。
- 自動スケジューリングはスプリントを考慮しつつ、依存関係と固定マイルストーンを常に優先し、矛盾がある場合はアラートで通知します。
- 任意のタイミングでスナップショットを保存し、複数バージョンの比較や過去の状態への復元ができます。
- プロジェクト全体(タスク・担当者・スプリント・バージョン履歴)をJSONファイルとして書き出し・読み込みできます。

## 使い方

1. このリポジトリの `project_scheduler.html` をダウンロードする。
2. ブラウザ(Chrome / Edge / Safari 等)で開く。

これだけで動作します。ビルドやインストールは不要です。

### データの保存について

入力内容は、開いているブラウザの `localStorage` に自動保存されます(変更後 約0.8秒でデバウンス保存)。これは**そのブラウザ・その端末に閉じたローカルな保存**であり、他の端末やブラウザとは共有されません。ブラウザのプライベートモードやサイトデータの削除で消える場合があるため、重要なデータは「書き出し」ボタンからJSONファイルとしてバックアップすることをおすすめします。

### JSON書き出し形式

JSON形式の詳細は `docs/json-format.md` にまとめています。インポートは現行の `schemaVersion: 1` 形式のみ受け付け、旧形式JSONへの後方互換はありません。

## 開発・再ビルド方法

`project_scheduler.html` は、React製のソース(`src/project_scheduler.jsx`)を [esbuild](https://esbuild.github.io/) と [Tailwind CSS](https://tailwindcss.com/) でビルドし、単一のHTMLファイルに埋め込んで生成しています。ソースを修正した場合は、以下の手順で再ビルドしてください。

### 必要環境

- Node.js 18以上

### 手順

```bash
npm install
npm run build
```

`npm run build` は次の3ステップを順に実行し、リポジトリ直下に `project_scheduler.html` を生成(上書き)します。

| コマンド | 内容 |
| --- | --- |
| `npm run build:js` | `src/entry.jsx` を esbuild でバンドル・minify し `dist/bundle.js` を生成 |
| `npm run build:css` | `src/input.css`(Tailwindディレクティブ)から `dist/output.css` を生成 |
| `npm run build:html` | `template.html` の中に `dist/bundle.js` と `dist/output.css` を差し込み `project_scheduler.html` を生成 |

### ディレクトリ構成

```
.
├── src/
│   ├── project_scheduler.jsx  # アプリ本体(編集対象はここ)
│   ├── entry.jsx               # ReactDOM.createRoot でマウントするだけのエントリポイント
│   └── input.css               # Tailwindディレクティブ
├── scripts/
│   └── build-html.mjs          # bundle.js / output.css を template.html に差し込むビルドスクリプト
├── template.html                # 配布用HTMLの雛形(プレースホルダー入り)
├── tailwind.config.js
├── package.json
└── project_scheduler.html       # ビルド済み・配布用の成果物(npm run build で再生成)
```

## 既知の制約

- データはブラウザの `localStorage` に保存されるため、複数人での同時編集や、端末をまたいだ同期には対応していません。共有・引き継ぎにはJSONエクスポート/インポートを利用してください。
- 稼働日カレンダーの祝日計算は日本の祝日をもとにした簡易実装です。

## ライセンス

[MIT License](LICENSE)
