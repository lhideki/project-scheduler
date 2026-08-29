# CLAUDE.md

このファイルは、このリポジトリで Claude Code（および他のAIコーディングツール）が作業する際のガイドです。

## プロジェクト概要

依存関係・マイルストーン・スプリントを考慮した自動スケジューリング機能を持つ、単一HTMLで動くWBS/ガントチャート型のプロジェクト管理ツール。React 19 + Tailwind CSS + lucide-react + recharts で書かれたReactアプリを、ビルドして1つの `project_scheduler.html` に埋め込み、サーバーなし・ローカルブラウザで完結する形で配布する（配布形態が単一HTMLというだけで、編集対象のソース自体は複数ファイルに分割されている。詳細は「ソース構成」参照）。
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
| `npm run build:docs` | `PROJECT_JSON_SCHEMA` から `docs/json-format.md` を生成 |
| `npm run build:agent` | `src/agent/cli.js`（と `src/lib/`）を esbuild でバンドルし `.claude/skills/schedule-adjust/cli.mjs` を生成（AIエージェント用Skillのランタイム。非minify） |

`npm run dev:js` で `dist/bundle.dev.js` を watch モードでビルドできる（非minify、デバッグ用）。ただし現状 `template.html` は本番ビルドのプレースホルダー差し込み専用なので、開発中の動作確認は `dist/bundle.dev.js` を手元のHTMLから読み込むか、`npm run build` を都度実行して `project_scheduler.html` をブラウザで開いて確認する。

**重要**: `src/` 配下のソースを編集したら、必ず `npm run build` を実行してからビルド成果物（`project_scheduler.html`・`docs/json-format.md`・`.claude/skills/schedule-adjust/cli.mjs`）の差分も一緒にコミットすること。これらの成果物を手で直接編集しない（次回ビルドで上書きされる）。

## ソース構成

`src/` はReact非依存の純粋ロジック（`lib/`）とReactコンポーネント（`components/`・`App.jsx`）を分けて配置している。これは「動作を変えないための機械的な分割」であり、単一ファイル時代からロジックの中身は変わっていない。

```
src/
  App.jsx              # 状態管理・配線の中心（旧project_scheduler.jsxのApp本体）
  entry.jsx            # createRoot によるマウントのみ
  constants.js          # WBS/ガントのレイアウト定数（ROW_H・DEFAULT_WBS_COLS等）
  storage.js             # window.storage ラッパー（localStorageポリフィル）
  lib/                    # React/DOM非依存の純粋ロジック（ユニットテスト対象）
    calendar.js             # 祝日計算・稼働日カレンダー
    deps.js                  # 依存関係の文字列パーサ（3FS+2 等）
    taskTree.js               # WBSツリー・ヘルパー（isGroupId/buildFlatList等）
    scheduling.js              # CPMエンジン（runCPM）・リソース平準化（levelResources）
    sprints.js                  # スプリント配色・期間重複検出
    exportUtils.js               # JSON/Mermaidエクスポート
    seedData.js                   # サンプルデータ
    *.test.js                     # 上記各モジュールに対応するVitestユニットテスト
  dom/
    pointerDrag.js         # ポインタドラッグ・SVG座標変換・日付スケール（DOM API依存のため lib/ とは別）
  agent/                   # AIエージェント用SkillのCLI（Node実行。src/lib/ を再利用する薄い層）
    engine.js                # src/lib/ から必要な関数を再エクスポートするだけの集約点
    cli.js                    # 引数パース・ファイル読み込み・レポート整形（計算ロジックは持たない）
    cli.test.js               # computeSchedule 等が src/lib/ と一致することを担保するVitestテスト
  components/
    WBSGanttView.jsx、TaskDetailModal.jsx、NetworkView.jsx、ResourceView.jsx、
    SprintsView.jsx、VersionsView.jsx、IconBtn.jsx、Tab.jsx 他             # Reactコンポーネント
```

新しい純粋ロジック（日付計算・依存関係解決・スケジューリング・データ変換など、Reactやブラウザ固有APIに依存しない処理）を追加する場合は `src/lib/` に置き、対応する `*.test.js` を書くこと。DOM/ブラウザAPI（`window`・`document`・ポインタイベント等）に依存するが React 非依存のヘルパーは `src/dom/` に置く。Reactコンポーネントは `src/components/` に1コンポーネント1ファイルで置く。

### AIエージェント用Skill（`.claude/skills/schedule-adjust/`）

保存JSONを読み書きしてスケジュール調整を行うためのSkill。`SKILL.md` はエージェント向け手順書、`cli.mjs` は `npm run build:agent` の生成物。CLI（`validate`/`recalc`/`plan`/`explain`）はスケジュール計算に `src/lib/` を**そのまま**使う（App.jsx の `cpm`/`schedule` useMemo と同じ手順を `src/agent/cli.js` の `computeSchedule` が再現）。CLIの計算結果がアプリとずれないよう、`src/lib/` のスケジューリング仕様を変えたら `src/agent/cli.test.js` が通ることを必ず確認する。**`src/agent/cli.js` にCPM等の計算ロジックを書かない**（`src/lib/` を呼ぶだけ）。CLIは設計上JSONファイルを書き換えない（保存はエージェントが手順に従って行う）。

## アーキテクチャ

### データモデル（すべてトップレベルReact state、`window.storage` に永続化）

- `tasks`: フラット配列。`parentId` によりWBS階層（グループ／リーフタスク）を表現。グループ専用のエンティティは存在せず、共通ヘルパー `isGroupId(tasks, id)` で判定する。
- `resources`: 担当者（週次・月次の稼働上限を持つ）。
- `sprints`: `{id, name, theme, startDate, endDate, order}`。タスク側は `sprintIds`（配列）で複数参照できる（1タスク=複数スプリント可、グループには持たせない）。旧形式の単一 `sprintId` で保存されたデータは読み込み時に `migrateSprintIds()` で自動変換する。
- `versions`: 任意タイミングのスナップショット（`rawTasks`/`rawResources`/`rawSprints` を保持）。
- `levelingOn`: リソース平準化トグルのON/OFF（`boolean`、デフォルト`false`）。`window.storage`（`pm_project`）およびJSONエクスポート/インポートの対象。旧形式JSON（`levelingOn`キーなし）は読み込み時に`false`へフォールバックする。

### スケジューリングロジック（CPM: クリティカルパス法）

- `runCPM(tasks, cal, projectStart, sprints, opts)`: フォワードパス（ES/EF）とバックワードパス（LS/LF）を計算。
  - フォワードパスのES計算では、依存関係から求めた開始日に加え、タスクが所属する（複数可の）スプリントのうち最も早い `startDate` を**下限（フロア）**として適用する（共通ヘルパー `earliestSprintFloor()`、後ろ倒しのみ・前倒しはしない）。
  - 進捗率が入力済み（`progress > 0`、＝着手済み）のタスクは、`opts.respectManualPins` の値に関わらず常に現在の開始日をES算出の起点として固定する（自動スケジューリングの対象外）。
  - 表示スケジュール（`schedStart`/`schedFinish`）は、**固定マイルストーン自身（fixedDateに固定表示する必要があるタスク）だけ**バックワードパス（LS/LF）を使う。それ以外のタスク（固定マイルストーンに辿り着く依存チェーン上のタスクを含む）は、モード・`opts.respectManualPins`・進捗率に関わらず常にフォワードパス（ES/EF）を使う。
  - この設計により、マイルストーンを柔軟⇔固定に切り替えただけ（＝「自動スケジューリング実行」を押す前）では、固定マイルストーン自身の日付が表示されるだけで、それ以外のタスクの表示日程は一切変化しない。以前は依存チェーン上のタスクもバックワードパスを使っており、マイルストーンを固定にした瞬間に手前のタスクの表示日程が後ろ倒しに「引っ張られる」問題があったため、この形に変更した（意図的な設計変更。元に戻さないこと）。
  - `float`/`critical` はES/LSの差から計算するため、上記の表示方式の変更後も従来通り機能する（＝表示日程が動かなくても、クリティカルパスや余裕日数の情報は維持される）。
  - 「自動スケジューリング実行」（`opts.respectManualPins: false` で呼び出す再計算・書き戻し専用パス）も同じ選択ロジックを使うため、固定マイルストーン自身以外は常にES/EF（最短）で書き戻される。「マイルストーンに合わせて後ろ倒しにする」のではなく「条件を満たす直近の日程に詰める」形になる。
- `levelResources(tasks, cpmResult, resources, cal, sprints)`: Serial SGS方式のリソース平準化。`minStart` にCPMと同じスプリントフロアを適用している。進捗率が入力済みのタスクは平準化の対象外とし、現在の開始日に固定する（依存関係・スプリント・リソース競合による調整を行わない）。
- `float = workdaysBetween(ES, LS)`、`critical = float <= 0`。
  - 注意: スプリント開始日を実際の計算済み開始日に近づけて設定すると、そのタスクのESが押し上げられてfloatが縮小し、`critical` 判定が変わることがある（表示上のschedStart/schedFinish自体は変わらない）。これは仕様上の既知の挙動であり、バグではない。
- スプリント矛盾検出（`sprintConflicts` useMemo）: 最終的な表示スケジュールがタスクの所属スプリント期間からはみ出していないかを判定し、はみ出していればヘッダーのアラートアイコン（`AlertTriangle`）経由でダイアログに一覧表示する。複数スプリントが紐付く場合は、それらの期間の和集合（最も早い開始日〜最も遅い終了日）を基準に判定する。既存のリソース平準化警告（`levelWarnings`、固定マイルストーンの期日超過専用）とは別建てのUI。

### UIレイアウト（WBS/ガント画面）

- 左ペイン（WBS表）と右ペイン（ガントチャート）の間にドラッグ可能な仕切りバーがある。`paneLeftWidth` state（`null` = 列幅合計に自動追従、ドラッグで固定値、ダブルクリックでリセット）で管理。
- **重要**: 左ペインを列幅合計より狭くした場合、各列の幅を縮めてはいけない。WBS表の中身全体を `style={{ width: wbsTotalWidth, minWidth: "100%" }}` の内側ラッパーで包み、外側の `overflow-x-auto` コンテナで横スクロールさせる方式にしている（右のガントペインと同じパターン）。このラッパーを外すと、flexboxのデフォルトの縮小挙動により列が潰れる不具合が再発するので注意。

### 永続化・window.storage

`window.storage` は本来ホスト環境（Claudeのアーティファクト実行環境など）が提供するAPI。このリポジトリでは未定義の場合のみ localStorage ベースのポリフィルを用意している（実装・優先順位ロジックは `src/storage.js` 参照）。ホスト側の `window.storage` を上書きしてしまわないよう、この優先順位は変更しないこと。

## コーディング上の注意

- ロジック（`src/lib/`・`src/dom/`）とUIコンポーネント（`src/components/`・`src/App.jsx`）の分離を維持する。CPMロジックやWBSツリー処理などをReactコンポーネントの中に書き戻さないこと。
- ドラッグ操作は `startPointerDrag`（`src/dom/pointerDrag.js`）、グループ判定・ロールアップは `isGroupId`/`rollupSummaries`（`src/lib/taskTree.js`・`src/lib/scheduling.js`）、日付スケール・SVG座標変換は `makeDateScale`/`svgPointFromRef`（`src/dom/pointerDrag.js`）、依存関係ラベルは `formatDepLabel`（`src/lib/deps.js`）の各共通ヘルパーを再利用し、コンポーネント内にローカルに再定義しないこと。
- JSON エクスポート/インポート、バージョンスナップショットは `tasks`/`resources`/`sprints` すべてを含める。新しいトップレベルstateを追加した場合は、両方の入出力パスと `seedData()`（`src/lib/seedData.js`）を更新すること（インポート側は後方互換のため、キーが無ければ空配列にフォールバックする）。
- 依存パッケージのバージョンは `package.json` を正とする。

## ユニットテスト

`src/lib/` 配下の純粋ロジック（CPMエンジン・カレンダー計算・依存関係パーサ・WBSツリー処理・エクスポート処理等）はVitestでユニットテストされている（各モジュールと同じディレクトリの `*.test.js`）。

```bash
npm run test        # 一括実行（CI・コミット前用）
npm run test:watch  # watchモード（開発中）
```

- `src/lib/` に新しい純粋ロジックを追加・変更した場合は、対応する `*.test.js` を必ず追加・更新すること。特に `runCPM`/`levelResources`（`scheduling.js`）はCLAUDE.mdに明文化された仕様（固定マイルストーンのみLS/LFを使う、進捗済みタスクはピン留めする等）の回帰を防ぐ最重要テスト対象なので、挙動を変える変更をした場合は既存テストが仕様変更を正しく反映しているか必ず確認する。
- `src/agent/cli.test.js` は、CLIのスケジュール計算（`computeSchedule`）が `src/lib/` の `runCPM` と一致すること・整合性チェック・バージョンスナップショット構造を担保する。`scheduling.js` の仕様を変えたらここも確認する。
- `src/components/`・`src/App.jsx`（Reactコンポーネント）はユニットテストの対象外。次節の手動確認で担保する。

## コミットメッセージ

- セマンティックコミット形式（`feat:`/`fix:`/`refactor:`/`docs:`/`chore:` 等のprefixを付ける）で書くこと。
- タイトル・本文とも日本語の「ですます調・過去形」（例:「〜しました」「〜変更しました」）で書くこと。「〜する」「〜変更する」のような常体・現在形は使わないこと。

## 動作確認方法

変更後は `npm run test` を実行してユニットテストが全件パスすることを確認したうえで、`npm run build` した `project_scheduler.html` をブラウザ（またはPlaywright）で直接開き、以下を目視・手動確認する。

- コンソールエラーが出ていないこと
- サンプルデータ（`seedData()`）を開いた状態でスプリント矛盾アラート・スプリント期間重複警告が出ないこと
- タスク編集後、リロードしても内容が保持されること（localStorage永続化）
