# Project Scheduler

> A local-first WBS/Gantt planning sandbox with dependency-aware scheduling, CPM, resource leveling, milestones, and sprints. It runs from a single HTML file.

依存関係・マイルストーン・スプリント・担当者の稼働上限を考慮して日程を自動計算できる、ローカル完結のWBS / ガント計画ツールです。サーバーやアカウント登録は不要で、`project_scheduler.html`をブラウザで開くだけで使えます。

[Live Demo](https://lhideki.github.io/project-scheduler/) | [配布用HTML](project_scheduler.html) | [機能紹介](https://www.inoue-kobo.com/webservice/project-scheduler/) | [実践チュートリアル](https://www.inoue-kobo.com/webservice/tutorial-project-scheduler/) | [JSON形式](docs/json-format.md)

![WBS / ガント](docs/images/wbs-gantt.png)

## このツールの位置付け

Project Schedulerは、JiraやBacklogなどの共同管理ツールを置き換えるものではありません。タスクを登録する前や計画を変更するときに、依存関係、固定期日、担当者の競合を踏まえた日程案を手元で試算するための計画シミュレーターです。

- 見積もりや依存関係を変更し、後続タスクへの影響を自動計算できます。
- クリティカルパスと余裕日数を確認し、遅延の影響が大きいタスクを把握できます。
- 担当者の稼働上限を考慮し、同時期の割り当て過多を調整できます。
- 入力内容を外部サービスへ登録せず、通常のブラウザ内に保存できます。

## 3分で試す

1. [Live Demo](https://lhideki.github.io/project-scheduler/)を開きます。
2. 最初から表示されるサンプルWBSで「基本設計」の工数を`6`から`10`へ変更します。
3. 画面右上の「自動スケジューリング実行」を押します。
4. 後続タスクの日程、完了予定日、クリティカルパスが変化することを確認します。

ビルドやインストールは不要です。オフラインで利用する場合は、[project_scheduler.html](project_scheduler.html)を開き、GitHub画面右上の「Download raw file」からダウンロードしてブラウザで開きます。

別の端末やLive Demoとダウンロード版の間で計画を移す場合は、画面上部の「書き出し」でJSONファイルを保存し、移行先で「読み込み」を実行します。

## 主な機能

- アウトライン形式でWBSを編集し、稼働日カレンダー(土日・日本の祝日を考慮)に基づくガントチャートを表示します。
- 矢印キーによるセル移動、セル・行単位のコピー＆ペースト、Undo / Redoに対応しています。
- FS / SS / FF / SFの4種類の依存関係と、リード / ラグ(前後にずらす日数)を設定できます。
- CPM(クリティカルパス法)により、フロートとクリティカルパスを自動計算して可視化します。
- マイルストーンは「柔軟(依存関係から順算)」「固定(期日から逆算)」の2モードを切り替えられます。
- 担当者の週次・月次の稼働上限を考慮した自動リソース平準化に対応しています。
- 開始日・終了日・テーマを持つスプリントを定義し、1タスクへ複数のスプリントを割り当てられます。
- スプリント期間と計算後の日程に矛盾がある場合は、アラートで確認できます。
- タスクの依存関係をネットワーク図(PERT図)で確認し、Mermaid形式でもコピーできます。
- 任意のタイミングでスナップショットを保存し、複数バージョンの比較や過去の状態への復元ができます。
- プロジェクト全体(タスク・担当者・スプリント・バージョン履歴)をJSONファイルとして書き出し・読み込みできます。

<details>
<summary>その他の画面を見る</summary>

### バージョン比較

![バージョン比較](docs/images/compare-version.png)

### ネットワーク図

![ネットワーク図](docs/images/network.png)

### スプリント定義

![スプリント定義](docs/images/define-sprint.png)

</details>

## データの保存

通常のブラウザで開いた場合、入力内容はそのブラウザの`localStorage`へ自動保存されます(変更後、約0.8秒で保存)。データはブラウザと端末に閉じており、他の端末やブラウザとは自動共有されません。

ブラウザのプライベートモードやサイトデータの削除によって消える場合があるため、重要なデータは「書き出し」から定期的にJSONファイルへバックアップしてください。

## JSON書き出し形式

JSON形式のフィールド、型、必須項目は[JSON形式ドキュメント](docs/json-format.md)にまとめています。この文書はコード内のJSON Schemaから自動生成されます。

インポートは現行の`schemaVersion: 1`形式のみ受け付けます。旧形式JSONへの後方互換はありません。

## 開発・再ビルド

`project_scheduler.html`は、`src/entry.jsx`を起点にReact製のソースを[esbuild](https://esbuild.github.io/)でバンドルし、[Tailwind CSS](https://tailwindcss.com/)のスタイルとともに1つのHTMLへ埋め込んだビルド成果物です。手で直接編集せず、ソースを変更した後に再生成してください。

`master`ブランチへpushすると、GitHub Actionsがテストとビルドを実行し、生成したHTMLをGitHub Pagesの[Live Demo](https://lhideki.github.io/project-scheduler/)へ公開します。

### 必要環境

- Node.js 18以上

### セットアップと確認

```bash
npm install
npm run test
npm run build
```

`npm run build`は次の4ステップを順に実行します。

| コマンド | 内容 |
| --- | --- |
| `npm run build:js` | `src/entry.jsx`をバンドル・minifyし、`dist/bundle.js`を生成します。 |
| `npm run build:css` | `src/input.css`から`dist/output.css`を生成します。 |
| `npm run build:html` | JavaScriptとCSSを`template.html`へ差し込み、`project_scheduler.html`を生成します。 |
| `npm run build:docs` | コード内のJSON Schemaから`docs/json-format.md`を生成します。 |

### 主なディレクトリ

```text
.
├── src/
│   ├── App.jsx              # 状態管理と画面全体の組み立て
│   ├── components/          # WBS / ガントなどのUIコンポーネント
│   ├── lib/                 # CPM、カレンダー、依存関係、JSON入出力などのロジックとテスト
│   ├── dom/                 # ポインタードラッグなどのDOMヘルパー
│   ├── entry.jsx            # Reactアプリのエントリポイント
│   ├── input.css            # Tailwind CSSの入力ファイル
│   └── storage.js           # window.storageとlocalStorageの接続
├── scripts/                 # HTMLとJSON文書の生成スクリプト
├── docs/                    # JSON文書とREADME用画像
├── template.html            # 配布用HTMLの雛形
└── project_scheduler.html   # ビルド済みの配布物
```

## 既知の制約

- 複数人での同時編集や、端末をまたいだ自動同期には対応していません。共有・引き継ぎにはJSONエクスポート / インポートを利用してください。
- 稼働日カレンダーの祝日計算は、日本の祝日をもとにした簡易実装です。

## フィードバック

不具合や改善案は[GitHub Issues](https://github.com/lhideki/project-scheduler/issues)へお寄せください。役に立った場合は、リポジトリへのStarで応援していただけると励みになります。

## ライセンス

[MIT License](LICENSE)
