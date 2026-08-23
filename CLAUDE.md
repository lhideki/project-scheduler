# CLAUDE.md

このファイルは、このリポジトリで Claude Code（および他のAIコーディングツール）が作業する際のガイドです。

## プロジェクト概要

依存関係・マイルストーン・スプリントを考慮した自動スケジューリング機能を持つ、単一HTMLで動くWBS/ガントチャート型のプロジェクト管理ツール。React 19 + Tailwind CSS + lucide-react + recharts で書かれた単一ファイルのReactアプリを、ビルドして1つの `project_scheduler.html` に埋め込み、サーバーなし・ローカルブラウザで完結する形で配布する。

- 編集対象のソースは `src/project_scheduler.jsx`（App本体、全コンポーネント、CPMロジック、状態管理を含む）。
- サーバー・アカウント登録なし。データは `window.storage`（localStorageベース）でブラウザにローカル保存する。

## ビルドコマンド

```bash
npm install       # 初回のみ
npm run build     # project_scheduler.html を生成（リポジトリ直下に上書き出力）
```

`npm run build` は以下を順に実行する。

| コマンド | 内容 |
| --- | --- |
| `npm run build:js` | `src/entry.jsx` を esbuild でバンドル・minify し `dist/bundle.js` を生成 |
| `npm run build:css` | `src/input.css`（Tailwindディレクティブ）から `dist/output.css` を生成 |
| `npm run build:html` | `template.html` に `dist/bundle.js` と `dist/output.css` を差し込み `project_scheduler.html` を生成 |

`npm run dev:js` で `dist/bundle.dev.js` を watch モードでビルドできる（非minify、デバッグ用）。ただし現状 `template.html` は本番ビルドのプレースホルダー差し込み専用なので、開発中の動作確認は `dist/bundle.dev.js` を手元のHTMLから読み込むか、`npm run build` を都度実行して `project_scheduler.html` をブラウザで開いて確認する。

**重要**: ソース（`src/project_scheduler.jsx`）を編集したら、必ず `npm run build` を実行してから `project_scheduler.html` の差分も一緒にコミットすること。`project_scheduler.html` を手で直接編集しない（ビルド成果物のため、次回ビルドで上書きされる）。

## アーキテクチャ

### データモデル（すべてトップレベルReact state、`window.storage` に永続化）

- `tasks`: フラット配列。`parentId` によりWBS階層（グループ／リーフタスク）を表現。グループ専用のエンティティは存在せず、共通ヘルパー `isGroupId(tasks, id)` で判定する。
- `resources`: 担当者（週次・月次の稼働上限を持つ）。
- `sprints`: `{id, name, theme, startDate, endDate, order}`。タスク側は `sprintId` で単一参照（1タスク=1スプリント、グループには持たせない）。
- `versions`: 任意タイミングのスナップショット（`rawTasks`/`rawResources`/`rawSprints` を保持）。

### スケジューリングロジック（CPM: クリティカルパス法）

- `runCPM(tasks, cal, projectStart, sprints, opts)`: フォワードパス（ES/EF）とバックワードパス（LS/LF）を計算。
  - フォワードパスのES計算では、依存関係から求めた開始日に加え、タスクが所属するスプリントの `startDate` を**下限（フロア）**として適用する（後ろ倒しのみ・前倒しはしない）。
  - 進捗率が入力済み（`progress > 0`、＝着手済み）のタスクは、`opts.respectManualPins` の値に関わらず常に現在の開始日をES算出の起点として固定する（自動スケジューリングの対象外）。
  - 表示スケジュール（`schedStart`/`schedFinish`）は、**固定マイルストーン自身（fixedDateに固定表示する必要があるタスク）だけ**バックワードパス（LS/LF）を使う。それ以外のタスク（固定マイルストーンに辿り着く依存チェーン上のタスクを含む）は、モード・`opts.respectManualPins`・進捗率に関わらず常にフォワードパス（ES/EF）を使う。
  - この設計により、マイルストーンを柔軟⇔固定に切り替えただけ（＝「自動スケジューリング実行」を押す前）では、固定マイルストーン自身の日付が表示されるだけで、それ以外のタスクの表示日程は一切変化しない。以前は依存チェーン上のタスクもバックワードパスを使っており、マイルストーンを固定にした瞬間に手前のタスクの表示日程が後ろ倒しに「引っ張られる」問題があったため、この形に変更した（意図的な設計変更。元に戻さないこと）。
  - `float`/`critical` はES/LSの差から計算するため、上記の表示方式の変更後も従来通り機能する（＝表示日程が動かなくても、クリティカルパスや余裕日数の情報は維持される）。
  - 「自動スケジューリング実行」（`opts.respectManualPins: false` で呼び出す再計算・書き戻し専用パス）も同じ選択ロジックを使うため、固定マイルストーン自身以外は常にES/EF（最短）で書き戻される。「マイルストーンに合わせて後ろ倒しにする」のではなく「条件を満たす直近の日程に詰める」形になる。
- `levelResources(tasks, cpmResult, resources, cal, sprints)`: Serial SGS方式のリソース平準化。`minStart` にCPMと同じスプリントフロアを適用している。進捗率が入力済みのタスクは平準化の対象外とし、現在の開始日に固定する（依存関係・スプリント・リソース競合による調整を行わない）。
- `float = workdaysBetween(ES, LS)`、`critical = float <= 0`。
  - 注意: スプリント開始日を実際の計算済み開始日に近づけて設定すると、そのタスクのESが押し上げられてfloatが縮小し、`critical` 判定が変わることがある（表示上のschedStart/schedFinish自体は変わらない）。これは仕様上の既知の挙動であり、バグではない。
- スプリント矛盾検出（`sprintConflicts` useMemo）: 最終的な表示スケジュールがタスクの所属スプリント期間からはみ出していないかを判定し、はみ出していればヘッダーのアラートアイコン（`AlertTriangle`）経由でダイアログに一覧表示する。既存のリソース平準化警告（`levelWarnings`、固定マイルストーンの期日超過専用）とは別建てのUI。

### UIレイアウト（WBS/ガント画面）

- 左ペイン（WBS表）と右ペイン（ガントチャート）の間にドラッグ可能な仕切りバーがある。`paneLeftWidth` state（`null` = 列幅合計に自動追従、ドラッグで固定値、ダブルクリックでリセット）で管理。
- **重要**: 左ペインを列幅合計より狭くした場合、各列の幅を縮めてはいけない。WBS表の中身全体を `style={{ width: wbsTotalWidth, minWidth: "100%" }}` の内側ラッパーで包み、外側の `overflow-x-auto` コンテナで横スクロールさせる方式にしている（右のガントペインと同じパターン）。このラッパーを外すと、flexboxのデフォルトの縮小挙動により列が潰れる不具合が再発するので注意。

### 永続化・window.storage

`window.storage` は本来ホスト環境（Claudeのアーティファクト実行環境など）が提供するAPI。このリポジトリでは未定義の場合のみ localStorage ベースのポリフィルを用意している（実装・優先順位ロジックは `src/project_scheduler.jsx` の「window.storageラッパー」セクション参照）。ホスト側の `window.storage` を上書きしてしまわないよう、この優先順位は変更しないこと。

## コーディング上の注意

- `src/project_scheduler.jsx` は単一ファイル構成を維持する（別ファイルへの分割は現状想定していない）。
- ドラッグ操作は `startPointerDrag`、グループ判定・ロールアップ・日付スケール・SVG座標変換・依存関係ラベルは `isGroupId`/`rollupSummaries`/`makeDateScale`/`svgPointFromRef`/`formatDepLabel` の各共通ヘルパーを再利用し、ローカルに再定義しないこと。
- JSON エクスポート/インポート、バージョンスナップショットは `tasks`/`resources`/`sprints` すべてを含める。新しいトップレベルstateを追加した場合は、両方の入出力パスと `seedData()` を更新すること（インポート側は後方互換のため、キーが無ければ空配列にフォールバックする）。
- 依存パッケージのバージョンは `package.json` を正とする。

## 動作確認方法

自動テストは未整備。変更後は `npm run build` した `project_scheduler.html` をブラウザ（またはPlaywright）で直接開き、以下を目視・手動確認する。

- コンソールエラーが出ていないこと
- サンプルデータ（`seedData()`）を開いた状態でスプリント矛盾アラート・スプリント期間重複警告が出ないこと
- タスク編集後、リロードしても内容が保持されること（localStorage永続化）
