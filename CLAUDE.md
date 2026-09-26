# CLAUDE.md

このファイルは、このリポジトリで Claude Code（および他のAIコーディングツール）が作業する際のガイドです。

## プロジェクト概要

依存関係・マイルストーン・スプリントを考慮した自動スケジューリング機能を持つ、単一HTMLで動くWBS/ガントチャート型のプロジェクト管理ツール。React 19 + Tailwind CSS + lucide-react + recharts で書かれたReactアプリを、ビルドして1つの `project_scheduler.html` に埋め込み、サーバーなし・ローカルブラウザで完結する形で配布する（配布形態が単一HTMLというだけで、編集対象のソース自体は複数ファイルに分割されている。詳細は「ソース構成」参照）。
- サーバー・アカウント登録なし。データは `window.storage`（localStorageベース）でブラウザにローカル保存する。
- 画面の文言は日本語・英語に対応する（ヘッダーで切り替え。詳細は「多言語対応（i18n）」参照）。

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
| `npm run build:agent` | `src/agent/cli.js`（と `src/lib/`・メッセージカタログ・`intl-messageformat`）を esbuild でバンドルし `.claude/skills/schedule-adjust/cli.mjs` を生成（AIエージェント用Skillのランタイム。非minify。node_modules なしで動く） |
| `npm run build:readme` | `README.en.md` から `README.md` を生成（`src/lib/readme.js`。下記「README」参照） |

`npm run build:pages` は `npm run build` に含まれない。`project_scheduler.html` から Live Demo（GitHub Pages）の3ページを `_site/`（`index.html`＝Default・`ja/index.html`・`en/index.html`。コミットしない）に生成する（`src/lib/localizedPages.js`。下記「多言語対応（i18n）」参照）。hreflang のリンクに使う公開URLは環境変数 `PAGES_BASE_URL`（省略時は `https://lhideki.github.io/project-scheduler/`）。

`npm run dev:js` で `dist/bundle.dev.js` を watch モードでビルドできる（非minify、デバッグ用）。ただし現状 `template.html` は本番ビルドのプレースホルダー差し込み専用なので、開発中の動作確認は `dist/bundle.dev.js` を手元のHTMLから読み込むか、`npm run build` を都度実行して `project_scheduler.html` をブラウザで開いて確認する。

**重要**: `src/` 配下のソースや `README.en.md` を編集したら、必ず `npm run build` を実行してからビルド成果物（`project_scheduler.html`・`docs/json-format.md`・`.claude/skills/schedule-adjust/cli.mjs`・`README.md`）の差分も一緒にコミットすること。これらの成果物を手で直接編集しない（次回ビルドで上書きされる）。Pull Request の CI（`.github/workflows/ci.yml`）は、ビルドし直した成果物がコミット済みのものと一致しなければ失敗する。

### README

| ファイル | 言語 | Live Demo のリンク先 |
| --- | --- | --- |
| `README.md` | 英語（GitHub のリポジトリトップに表示される版）。**`README.en.md` からの生成物**（`npm run build:readme`） | Default（`https://lhideki.github.io/project-scheduler/`） |
| `README.en.md` | 英語（手で編集する） | `/project-scheduler/en/` |
| `README.ja.md` | 日本語（手で編集する） | `/project-scheduler/ja/` |

- `README.md` は直接編集せず、`README.en.md` を編集して `npm run build`（または `npm run build:readme`）で再生成する。違いは先頭の生成物の注記と `[Live Demo](...)` のリンク先だけ（`src/lib/readme.js` の `buildDefaultReadme`）。`src/lib/readme.test.js` が、`README.md` が生成結果と一致すること・3ファイルの冒頭の切り替えリンク（`[Default](README.md) | [English](README.en.md) | [日本語](README.ja.md)`）・各 Live Demo リンクの向き先を確認する。
- 英語と日本語の README は内容をそろえる（片方だけ更新しない）。README 用の画面画像は、英語版が `docs/images/en/`（英語UI）、日本語版が `docs/images/`。日本語のみの外部リンク（機能紹介・実践チュートリアル）は、英語版では「(Japanese)」の注記を付ける。

## ソース構成

`src/` はReact非依存の純粋ロジック（`lib/`）とReactコンポーネント（`components/`・`App.jsx`）を分けて配置している。これは「動作を変えないための機械的な分割」であり、単一ファイル時代からロジックの中身は変わっていない。

```
src/
  App.jsx              # 状態管理・配線の中心（旧project_scheduler.jsxのApp本体）
  entry.jsx            # createRoot によるマウントのみ（I18nProvider で App を包む）
  constants.js          # WBS/ガントのレイアウト定数（ROW_H・DEFAULT_WBS_COLS等）
  storage.js             # window.storage ラッパー（localStorageポリフィル）
  messages/               # UIのメッセージカタログ（next-intl 形式・ICU MessageFormat。ja.json・en.json はキーが一致）
  lib/                    # React/DOM非依存の純粋ロジック（ユニットテスト対象）
    i18n.js                 # 対応言語・名前付き書式（FORMATS）・言語判定・React非依存の翻訳関数（createAppTranslator）・lib のコード＋パラメータを文言にする関数（format*）
    calendar.js             # 祝日計算・稼働日カレンダー
    deps.js                  # 依存関係の文字列パーサ（3FS+2 等）
    taskTree.js               # WBSツリー・ヘルパー（isGroupId/buildFlatList等）
    wbsEditing.js             # WBS表のセル・行のテキスト化と貼り付け（コピー＆ペースト用。WBS_EDITABLE_COLUMNS。書き出しは表示中の言語、貼り付けは両言語の表記を受け付ける）
    history.js                # タスク編集の Undo/Redo 履歴 reducer（taskHistoryReducer、直近100件）
    timeAxis.js               # ガントの日付軸（ズーム段階 DAY_WIDTH_STOPS と日→週→月の目盛り縮約。月名・曜日は返さず、表示側が書式化する）
    scheduling.js              # CPMエンジン（runCPM）・リソース平準化（levelResources）・表示スケジュールの組み立て（buildDisplaySchedule）
    workAllocation.js          # 工数の日別割当（担当者の稼働上限に合わせた分割割当・非割当日の理由・割当上の進捗位置）
    sprints.js                  # スプリント配色・期間重複検出
    dependencyIssues.js         # 依存関係の矛盾検出（循環参照・存在しない先行・開始日との矛盾・固定期日超過。App と CLI で共通）
    exportUtils.js               # JSON入出力（PROJECT_JSON_SCHEMA・buildProjectExport・normalizeImportedProject）・Mermaidガント生成
    jsonSchemaDoc.js             # PROJECT_JSON_SCHEMA から docs/json-format.md を生成（build:docs）
    linkedProject.js              # ?schedule= クエリのパース
    embeddedProject.js             # 共有用HTMLの埋め込みJSONのシリアライズ/パース（"<" のユニコードエスケープ）
    localizedPages.js              # Live Demo の言語別ページ（/ja/・/en/）の生成（言語を固定する <meta>・hreflang）と、言語切り替え時の URL（build:pages）
    readme.js                      # README.en.md から README.md を生成する（build:readme）
    seedData.js                   # サンプルデータ
    *.test.js                     # 上記各モジュールに対応するVitestユニットテスト
  dom/
    pointerDrag.js         # ポインタドラッグ・SVG座標変換・日付スケール（DOM API依存のため lib/ とは別）
    linkedProjectFile.js   # ?schedule= 用のFileSystemFileHandle永続化（IndexedDB）
    embeddedProjectDom.js  # 共有用HTMLの埋め込みデータ読み取り（readEmbeddedProject）とHTML生成（buildSharedHtml）
    localizedPageDom.js    # Live Demo の言語別ページの言語の読み取り・言語切り替え時の URL の置き換え・共有用HTMLからの印の除去
    ganttPngExport.js      # ガント表示範囲のPNGコピー（copyVisibleGanttAsPng）
  agent/                   # AIエージェント用SkillのCLI（Node実行。src/lib/ を再利用する薄い層）
    engine.js                # src/lib/ から必要な関数を再エクスポートするだけの集約点
    cli.js                    # 引数パース・ファイル読み込み・レポート整形（計算ロジックは持たない）
    cli.test.js               # computeSchedule 等が src/lib/ と一致することを担保するVitestテスト
  components/              # Reactコンポーネント（1コンポーネント1ファイル）
    I18nProvider.jsx         # 表示言語の選択・保存（pm_ui_locale）と use-intl の IntlProvider。useI18n（t と日付書式）・useLocaleSetting
    WBSGanttView.jsx         # WBS表＋ガント（ズーム・稲妻線・ツールチップ・PNGコピー用ヘッダー生成を含む）
    GanttDeps.jsx、InazumaLine.jsx   # ガントの依存線・稲妻線（進捗線）
    TaskDetailModal.jsx、DepInput.jsx、SprintMultiSelect.jsx、ColResizeHandle.jsx
    NetworkView.jsx、ResourceView.jsx、SprintsView.jsx、VersionsView.jsx
    CalendarView.jsx、CalendarExceptionsEditor.jsx   # 「カレンダー編集」タブ
    ExportMenu.jsx           # ヘッダーの「書き出し」ドロップダウン
    IconBtn.jsx、Tab.jsx
```

リポジトリ直下の `scripts/` は生成スクリプト（`build-html.mjs`・`build-json-doc.mjs`・`build-agent.mjs`・`build-readme.mjs`・`build-pages.mjs`）。`.github/workflows/pages.yml` は `master` への push 時に `npm ci`→`npm run test`→`npm run build`→`npm run build:pages`（`PAGES_BASE_URL` は `actions/configure-pages` の `base_url`）を実行し、Default・`ja/`・`en/` の3ページを GitHub Pages（Live Demo）へまとめて公開するワークフロー、`.github/workflows/ci.yml` は Pull Request で `npm ci`→`npm run test`→`npm run build`（生成物がコミット済みと一致するかの確認を含む）→`npm run build:pages` を実行するワークフロー（どちらも Node 24）。開発・テストには Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`（20.19以上の20.x、22.12以上の22.x、または24以上。vitest 4 と vite 8 の engines の共通範囲で、21・23は対象外）が必要。Skill の `cli.mjs` は `target: "node18"` でバンドルしているため、実行は Node 18 以上で動く。

新しい純粋ロジック（日付計算・依存関係解決・スケジューリング・データ変換など、Reactやブラウザ固有APIに依存しない処理）を追加する場合は `src/lib/` に置き、対応する `*.test.js` を書くこと。DOM/ブラウザAPI（`window`・`document`・ポインタイベント等）に依存するが React 非依存のヘルパーは `src/dom/` に置く。Reactコンポーネントは `src/components/` に1コンポーネント1ファイルで置く。

### AIエージェント用Skill（`.claude/skills/schedule-adjust/`）

保存JSONを読み書きしてスケジュール調整を行うためのSkill。`SKILL.md` はエージェント向け手順書、`cli.mjs` は `npm run build:agent` の生成物。CLI（`validate`/`recalc`/`plan`/`explain`）はスケジュール計算に `src/lib/` を**そのまま**使う（App.jsx の `cpm`/`schedule` useMemo と同じ手順を `src/agent/cli.js` の `computeSchedule` が再現）。CLIの計算結果がアプリとずれないよう、`src/lib/` のスケジューリング仕様を変えたら `src/agent/cli.test.js` が通ることを必ず確認する。**`src/agent/cli.js` にCPM等の計算ロジックを書かない**（`src/lib/` を呼ぶだけ）。CLIは設計上JSONファイルを書き換えない（保存はエージェントが手順に従って行う）。CLI のレポートは日本語のまま出す（`src/lib/` が返すコード＋パラメータを、`createAppTranslator("ja")` でアプリと同じメッセージカタログから文言にする。出力の形・文言は多言語対応の前と同じで、`src/agent/cli.test.js` が日本語の文言を確認している）。

### Backlog連携用Skill（`.claude/skills/backlog-sync/`）

bee（`@nulab/bee` 1.1 以上、Backlog公式CLI）経由で保存JSONと Backlog 課題を双方向同期する Skill。`SKILL.md` と `references/mapping.md` のみで構成される**プロズだけのSkill**（`npm run build:agent` の生成対象ではない。ランタイムコードを持たない）。スケジュール計算は `schedule-adjust/cli.mjs` の `recalc` に、JSONの編集・保存は `schedule-adjust` の標準ワークフローに、Backlog の課題CRUDは `bee` に委譲する（`backlog-sync` 自体は計算もJSON書き込みもBacklog APIの直叩きもしない）。同期の設定・対応表・IDキャッシュは、保存JSONの隣に置くスキーマ外のサイドカーファイル `<file>.backlog.json` に持つ（**Project Scheduler の JSON スキーマは変更しない**）。この方針により「計算済み終了日をエクスポートJSONへ持たせる」案は不要になっている。

## アーキテクチャ

### データモデル（すべてトップレベルReact state、`window.storage` に永続化）

- `tasks`: フラット配列。`parentId` によりWBS階層（グループ／リーフタスク）を表現。グループ専用のエンティティは存在せず、共通ヘルパー `isGroupId(tasks, id)` で判定する。
- `resources`: 担当者（週次・月次の稼働上限を持つ。上限値 `0`・未設定は「その上限を適用しない」。日次の上限は1人日固定）。
- `sprints`: `{id, name, theme, startDate, endDate, order}`。タスク側は `sprintIds`（配列）で複数参照できる（1タスク=複数スプリント可、グループには持たせない）。旧形式の単一 `sprintId` で保存されたデータは `migrateSprintIds()` で自動変換する（適用しているのは localStorage からの読み込み・共有用HTML（embedded）の初期化・バージョン復元。JSONの「読み込み」と linked の読み込みでは変換しない）。
- `versions`: 任意タイミングのスナップショット（`rawTasks`/`rawResources`/`rawSprints`/`rawCalendarExceptions` を保持。`levelingOn` は含めない）。`pm_versions` に保存する。
- Undo/Redo: `tasks` だけが対象（`useReducer(taskHistoryReducer)`、`src/lib/history.js`、直近100件）。`resources`・`sprints`・`calendarExceptions` の変更は履歴に積まない。初回ロード・linked の読み込みは `resetTasks` で履歴を空にする。キーボードショートカット（Ctrl/Cmd+Z・Shift+Ctrl/Cmd+Z・Ctrl/Cmd+Y）は `window` 全体で受け付ける（ヘッダーのボタン操作直後なども効かせるため。IME変換中は無視する）。ただし `input`/`textarea`/`select`/contenteditable にフォーカスがある間は、ブラウザ標準の Undo を奪わないよう素通りする。タスク編集用の入力欄（WBS表のセル・タスク詳細モーダル）でのショートカットは `WBSGanttView` 側のローカルハンドラ（`stopPropagation` あり）が先に処理する。
- `levelingOn`: リソース平準化トグルのON/OFF（`boolean`、デフォルト`false`）。`window.storage`（`pm_project`）およびJSONエクスポート/インポートの対象。旧形式JSON（`levelingOn`キーなし）は読み込み時に`false`へフォールバックする。
- `calendarExceptions`: 非稼働日カレンダーの例外（`{date, type: "holiday" | "workday", name?}` の配列、デフォルト`[]`）。`type: "holiday"`＝休日（平日を非稼働日化）、`type: "workday"`＝稼働日（土日・祝日・休日指定を稼働日化・**最優先**）。UIの種別ラベルは「休日」「稼働日」（内部値は `holiday`/`workday` のまま）。「カレンダー編集」タブ（`CalendarView` → `CalendarExceptionsEditor`）で編集。`window.storage`（`pm_project`）・JSONエクスポート/インポート・バージョンスナップショット（`rawCalendarExceptions`）の対象。旧形式JSON（キーなし）は`[]`へフォールバック。稼働日判定は `makeCalendar(holidayMap, calendarExceptions)`（`src/lib/calendar.js`）に集約されており、`runCPM`/`levelResources` は `cal` を受け取るだけなので変更不要。`holidayMap`（App・CLI とも `buildHolidayMap(y - 1, y + 6)`）の収録範囲外の年の祝日は、`makeCalendar` が問い合わせ時にその年の分を計算して補う（稼働上限でタスクが長く延長され、範囲より先まで割り当てる場合に祝日へ割り当てないため。`cal.holidayMap` 自体は渡したマップのままで、空のマップなら補わない）。

### 多言語対応（i18n）

- 対応言語は日本語（`ja`、既定）と英語（`en`）。React 側は `use-intl`（next-intl のコア。Next.js 非依存）の `IntlProvider`・`useTranslations`/`useFormatter` を使い、コンポーネントでは `useI18n()`（`src/components/I18nProvider.jsx`。`t` と `fmtDate`/`fmtDateCompact`/`fmtMonthDay`/`fmtWeekday`/`fmtDateTime`）を呼ぶ。
- **メッセージカタログ**: `src/messages/ja.json`・`src/messages/en.json`（next-intl 形式・ICU MessageFormat。ビルド時に両言語ともバンドルする）。画面の文言・ツールチップ・`aria-label`・`title`・プレースホルダー・確認ダイアログ・トーストは、すべてカタログのキーで書く（コンポーネントに日本語・英語の文言を直書きしない）。
  - キーは画面・機能単位の名前空間で分ける（`common.*`・`header.*`・`tabs.*`・`toast.*`・`confirm.*`・`wbs.*`・`gantt.*`・`taskDetail.*`・`dependencyIssues.*`・`sprintConflicts.*`・`levelWarnings.*`・`calendar.*`・`sprints.*`・`resources.*`・`versions.*`・`network.*`・`linked.*`・`embedded.*`・`pngErrors.*`・`mermaid.*`）。名前空間の中は lowerCamelCase。lib のコードをそのまま使う箇所（`dependencyIssues.label.<code>`・`pngErrors.<code>`）はコードをキーにする。
  - `ja.json` と `en.json` のキー・引数名は一致させる（`src/lib/i18n.test.js` が確認する）。キーを追加・変更したら両方を更新する。英語カタログには日本語を入れない（言語名「日本語」を除く）。
  - 日付はメッセージ内の `{x, date, ymd}` か `useI18n` の `fmt*` で書式化する。名前付き書式は `src/lib/i18n.js` の `FORMATS`（`ymd`・`ymdNumeric`〔表の列など幅が限られる箇所〕・`md`・`weekday`・`weekdayNarrow`・`month`・`dateTime`・`dateTimeShort`）で、日本語は多言語対応前の表示（`2026/09/26`・`09/26`・`土`・`9月`・`toLocaleString("ja-JP")`）と同じ結果になる指定にしている。日付（YYYY-MM-DD）は UTC の0時として扱うため、タイムゾーンは UTC（保存日時など時刻を表す `dateTime`・`dateTimeShort` だけは実行環境のタイムゾーン）。
- **`src/lib/` は表示用の文字列を組み立てない**。依存関係の矛盾（`{code, severity, ids, params, ...}`）・スプリント矛盾（`reasons: {code, params}[]`・`sprintNames`）・リソース平準化の警告（`LevelWarning`: `{code, taskId, params}`）・日付軸（月の数字と曜日番号）のように、**コードとパラメータ**を返す。文言にする関数（`formatDependencyIssueMessage`・`dependencyIssueLabel`・`formatSprintConflictReason`・`formatSprintConflictSprintNames`・`formatLevelWarning`）は `src/lib/i18n.js` に集め、App（`useI18n` の `t`）と CLI（`createAppTranslator("ja")`）の両方から使う。`src/dom/` のエラーも `code` を持たせ、UI 側でカタログの文言にする（例: `ganttPngExport.js` → `pngErrors.<code>`）。
  - `src/lib/` は React・`use-intl` に依存しない。`use-intl` の `createTranslator`（`use-intl/core`）はリッチテキスト対応のため `react` を import するので、React 以外の翻訳関数 `createAppTranslator` は、`use-intl` が内部で使う `intl-messageformat` を同じ書式設定で直接使う（`use-intl` の結果と全キーで一致することを `src/lib/i18n.test.js` で確認している）。
  - 表示言語に依存するデータを lib が作る必要がある場合は、翻訳関数を引数で受け取る（例: `taskCellText` の `context.t`。省略時は日本語）。
- **言語の選択**: 初回は `navigator.language` から判定し（`ja*` なら日本語、それ以外は英語。`detectLocale`）、ヘッダーのセレクトで切り替える。起動時の言語は `resolveInitialLocale`（ページで固定した言語 → 保存済みの選択 → ブラウザの言語）で決める。選択は `window.storage` の `pm_ui_locale` に保存し、切り替え時に `<html lang>` も更新する。UIの設定なので **Project JSON のスキーマ（`PROJECT_JSON_SCHEMA`）・エクスポート・バージョンスナップショット・共有用HTMLの埋め込みJSONには含めない**。linked / embedded 起動でも保存する（「起動モード」参照）。`template.html` の `lang="ja"` は起動直後の初期値。
- **翻訳しないもの**: ユーザーが入力したデータ（タスク名・担当者名など）、サンプルデータ（`seedData()`）、日本の祝日名（`calendar.js`。`holidayName` は文言の既定値を持たず、名称未入力の休日指定は空文字を返す。休日かどうかは `null` かどうかで判定する）、`PROJECT_JSON_SCHEMA` の `description`（`docs/json-format.md`）、Skill（CLI のレポート・`SKILL.md`）。新規作成時の既定名（「新規タスク」・「バージョン N」等）は作成時の表示言語で付ける。
- **Live Demo の言語別ページ**（`src/lib/localizedPages.js`・`src/dom/localizedPageDom.js`・`scripts/build-pages.mjs`）: Default（`/project-scheduler/`、上記のとおり自動判定）・`/project-scheduler/ja/`・`/project-scheduler/en/` の3ページ。`ja`/`en` のページは `<meta name="project-scheduler-locale" content="ja">` と `<html lang>` で言語を固定し、保存済みの選択（`pm_ui_locale`）より優先して起動する（開いただけでは `pm_ui_locale` を書き換えない）。3ページとも `<meta charset>` の直後に hreflang 付きの `<link rel="alternate">`（Default は `x-default`）を持つ。言語を固定したページでヘッダーから言語を切り替えると、**その場で表示を切り替えて保存し、`history.replaceState` で URL を切り替え先の言語のページ（hreflang のリンク先。クエリ・ハッシュは引き継ぐ）に置き換える**（再読み込みしないので編集中の状態・Undo 履歴・linked の関連付けを失わない。別オリジンなら URL は変えない）。Default のページでは URL を変えない。3ページは同じオリジンなので `pm_project`・`pm_versions` を共有する（言語を変えても同じプロジェクトが表示される）。配布用の `project_scheduler.html` は言語を固定せず hreflang も持たない。共有用HTMLの書き出し（`buildSharedHtml`）は言語の固定と hreflang を取り除く（開いた人の言語で表示する）。
- WBS表のコピー＆ペースト: 書き出すテキストは表示中の言語（マイルストーンの `固定`/`Fixed` 等）、貼り付けはどちらの言語の表記も受け付ける（表記はカタログから集める。`catalogValues`）。
- 言語を追加する場合は、`src/messages/<locale>.json` を追加し、`src/lib/i18n.js` の `LOCALES`・`MESSAGES`・`buildFormats`・`detectLocale` と、`header.languageName.<locale>`（全カタログ）を更新する。

### スケジューリングロジック（CPM: クリティカルパス法）

- `runCPM(tasks, cal, projectStart, sprints, opts)`: フォワードパス（ES/EF）とバックワードパス（LS/LF）を計算。
  - フォワードパスのES計算では、依存関係から求めた開始日に加え、タスクが所属する（複数可の）スプリントのうち最も早い `startDate` を**下限（フロア）**として適用する（共通ヘルパー `earliestSprintFloor()`、後ろ倒しのみ・前倒しはしない）。
  - 進捗率が入力済み（`progress > 0`、＝着手済み）のタスクは、`opts.respectManualPins` の値に関わらず常に現在の開始日をES算出の起点として固定する（自動スケジューリングの対象外）。
  - 表示スケジュール（`schedStart`/`schedFinish`）は、**固定マイルストーン自身（fixedDateに固定表示する必要があるタスク）だけ**バックワードパス（LS/LF）を使う。それ以外のタスク（固定マイルストーンに辿り着く依存チェーン上のタスクを含む）は、モード・`opts.respectManualPins`・進捗率に関わらず常にフォワードパス（ES/EF）を使う。
  - この設計により、マイルストーンを柔軟⇔固定に切り替えただけ（＝「自動スケジューリング実行」を押す前）では、固定マイルストーン自身の日付が表示されるだけで、それ以外のタスクの表示日程は一切変化しない。以前は依存チェーン上のタスクもバックワードパスを使っており、マイルストーンを固定にした瞬間に手前のタスクの表示日程が後ろ倒しに「引っ張られる」問題があったため、この形に変更した（意図的な設計変更。元に戻さないこと）。
  - `float`/`critical` はES/LSの差から計算するため、上記の表示方式の変更後も従来通り機能する（＝表示日程が動かなくても、クリティカルパスや余裕日数の情報は維持される）。
  - 「自動スケジューリング実行」（`opts.respectManualPins: false` で呼び出す再計算・書き戻し専用パス）も同じ選択ロジックを使うため、固定マイルストーン自身以外は常にES/EF（最短）で書き戻される。「マイルストーンに合わせて後ろ倒しにする」のではなく「条件を満たす直近の日程に詰める」形になる。
  - 書き戻す開始日は共通ヘルパー `autoScheduleStartDates()`（`src/lib/scheduling.js`。App.jsx `runScheduling` と CLI `applyAutoSchedule` の両方から使う）で求める。**リソース平準化がONのときは、CPMの日付ではなく平準化後の配置日を書き戻す**（＝書き戻した `startDate` と平準化ON時の表示スケジュールを一致させる）。平準化ON時にCPMの日付を書き戻すと、その後に着手済み（`progress > 0`）にしたタスクが `levelResources` で `startDate` にピン留めされ、表示だけが平準化前の位置に戻って見える不具合が起きるため（意図的な設計。元に戻さないこと）。
  - 平準化ONではさらに、書き戻した状態の表示（手入力の開始日を固定した `runCPM` ＋ `levelResources`）を計算し、**表示の開始日が書き戻す日付と一致するまで書き戻しを繰り返す**（通常は2回以内で収束）。平準化の処理順（フロート順）は、書き戻し前の CPM（`respectManualPins: false`）と書き戻し後の表示用 CPM とで異なりうるため、担当者の容量を分け合うタスクの割当順が入れ替わり、1回の書き戻しでは表示とずれることがあるため。手入力の開始日は平準化で後ろ倒しのみの下限なので、日付は後ろにしか動かない。上限回数（20回）内に一致を確認できなかった場合は、`computeAutoSchedule` が `converged: false` を返し、App は「自動スケジューリング実行」のトーストで、CLI は `plan --reschedule` の `summary.rescheduleConverged` で知らせる（一致しないまま成功扱いにしない。`autoScheduleStartDates` は `computeAutoSchedule` の開始日だけを返す薄いラッパー）。
  - **平準化OFFのときも、CPMの結果を `startDate` に反映した状態で `levelResources` をリソース無し（`resources=[]`、稼働上限を見ない）で通し、その配置日を書き戻す**（固定マイルストーン自身だけは従来どおりCPMのLSを書き戻す）。CPMのフォワードパスは固定マイルストーンのES（依存関係から求めた最早日）から後続の日程を求めるが、表示・書き戻しされる固定マイルストーン自身の日付はLS（期日由来）なので、余裕のある固定マイルストーン（やそれを含むグループ）の後続タスクが表示上そのマイルストーンより前に開始してしまい、「自動スケジューリング実行」後も依存関係の矛盾が残るため（意図的な設計。元に戻さないこと）。
- `levelResources(tasks, cpmResult, resources, cal, sprints)`: Serial SGS方式のリソース平準化。`minStart` にCPMと同じスプリントフロアを適用している。戻り値は `{ placed, warnings, allocations }`（`allocations` はリーフの日別割当）。
  - **工数は担当者の空き容量に応じて日別に割り当てる**（`allocateWork`、`src/lib/workAllocation.js`）。探索開始日から早い日順に、各稼働日へ「残工数・日次の残り（1人日）・週次の残り・月次の残り」の最小値を割り当てる。途中に割当のない稼働日（非割当日）を挟んでよく、タスク途中の中断は一律に許可する（プロジェクト・タスク単位の設定は持たない）。最初に割り当てた日を開始日、工数を割り当て終えた日を終了日とし、日別割当の合計は工数と一致する。容量は100万分の1人日単位の整数で管理し、日別割当の値も同じ単位の整数から求める（台帳に登録する量と日別割当を一致させるため。JSON・CLI からは0.01人日より細かい工数も入りうる）。
  - 処理順はフロートが小さい順→WBS順で、先に確定したタスクが早い日の容量を使う（直列割当。日ごとに容量を按分する並列方式は採らない）。
  - 非割当日は原因（`daily`＝他タスクで1人日が埋まっている〔埋めているタスクIDも記録〕／`weekly`／`monthly`）付きで `allocation.idle` に記録する。非稼働日（土日・祝日・休日）は `idle` に含めず、カレンダーから求める。
  - 進捗率が入力済み（`progress > 0`）のタスクは、依存関係・スプリント・手入力開始日による調整を行わず現在の開始日に固定し、**工数の全量を開始日から稼働上限内で割り当てる**（他タスクと同じ日に二重に割り当てない）。**処理順は未着手タスクと同じ優先順のまま**とし、着手済みを先に確定させない。先に確定させると、「自動スケジューリング実行」後に着手済みにしただけで割当の順序が変わり、そのタスクや同じ担当者の他タスク（余裕のないタスクを含む）の表示が動くため（意図的な設計。元に戻さないこと）。その代わり、着手済みにした後で優先度の高い未着手タスクが追加・変更されると、着手済みタスクの終了日が延びることがある（開始日は動かない。非割当日として理由を表示する）。
  - 担当者未設定・リソースに存在しない担当者・工数0のタスクは、稼働上限を見ずに開始日からの連続する稼働日に配置する。
  - 探索上限（2,000稼働日）内に割り当てきれない場合は、探索開始日（着手済みは開始日）からの連続配置に戻し、稼働上限超過を `levelWarnings` に通知する（上限を満たす計画として扱わない）。探索終端の日付を確定しない。割当不成立のタスクも負荷に登録し、他タスクの平準化に反映する。
  - FF/SF の依存関係は `candidateFromDep` が連続配置を前提に開始日を逆算するため、延長するタスクでは必要より遅く始まることがある（条件は満たす安全側。依存関係の矛盾検出も同じ基準なので誤警告は出ない）。
  - `levelWarnings` は稼働上限内での割当不成立だけを返す。固定マイルストーンの期日超過は、平準化のON/OFFに関わらず下記の依存関係の矛盾検出（`fixed-milestone-overrun`）で扱う（二重に警告しない）。
- `buildDisplaySchedule(tasks, cpmResult, resources, cal, sprints, { leveling })`: 表示スケジュールの組み立て（App.jsx の `schedule` useMemo と CLI `computeSchedule` で共通）。平準化OFFでは CPM の日程に開始日からの連続配分（`dailyLoads`）の日別割当を、平準化ONでは `levelResources` の配置日と日別割当を各リーフの `allocation` に載せ、グループを再ロールアップする。**ガントの非割当日の網掛け・ツールチップ・進捗の塗り・稲妻線・リソース画面の負荷集計は、この `allocation` だけを参照する**（開始日＋工数から連続配置を計算し直さないこと。延長したタスクで表示がずれるため）。
  - 進捗率は工数に対する割合として、日別割当の累積から位置を求める（`allocationProgressPoint`）。ガントの進捗の塗りと稲妻線の進捗点は同じ位置になる。
  - ガントでは、稼働上限による非割当日を非稼働日（斜線）とは別の模様（格子、`ganttIdleHatch`）で網掛けし、バーのツールチップに区間と理由（週次・月次上限に到達／他タスクに割当済み）、1人日未満しか割り当てられなかった日を表示する。タスクバーはキーボードでフォーカスでき（`tabIndex=0`）、キーボードでフォーカスしたときもツールチップを表示し、同じ内容を `aria-label` に持つ（非割当日の理由をポインタのホバー以外でも確認できるようにするため）。1日の中を部分的に塗り分ける表現は使わない（時間帯を持たないため）。月表示では #29 の非稼働日と同じく網掛けを省略する。
- `float = workdaysBetween(ES, LS)`、`critical = float <= 0`。
  - `float`/`critical` は CPM（担当者を見ない計算）の値のままなので、平準化による延長・後ろ倒しは `critical` に反映されない。
  - 注意: スプリント開始日を実際の計算済み開始日に近づけて設定すると、そのタスクのESが押し上げられてfloatが縮小し、`critical` 判定が変わることがある（表示上のschedStart/schedFinish自体は変わらない）。これは仕様上の既知の挙動であり、バグではない。
- スプリント矛盾検出（`sprintConflicts` useMemo）: 最終的な表示スケジュールがタスクの所属スプリント期間からはみ出していないかを判定し、はみ出していればヘッダーのアラートアイコン（`AlertTriangle`）経由でダイアログに一覧表示する。複数スプリントが紐付く場合は、それらの期間の和集合（最も早い開始日〜最も遅い終了日）を基準に判定する。リソース平準化警告（`levelWarnings`、稼働上限内での配置失敗）とは別建てのUI。
- 依存関係の矛盾検出（`dependencyIssues` useMemo → `detectDependencyIssues(tasks, schedule, cal)`、`src/lib/dependencyIssues.js`）: 次の4種・5コード（循環参照は `dependency-cycle` と自己依存の `self-dependency` の2コード）を判定する。日程の自動修正はしない（開始日の矛盾は「自動スケジューリング実行」で解消する）。CLI の `validate`/`recalc`/`plan`/`explain` も同じ関数を使う（`src/agent/cli.test.js` でアプリと結果が一致することを確認している）。
  - `dependency-cycle`（error）: 循環参照。`runCPM` と同じ解釈（リーフへの依存辺は `effectivePredecessors`、グループには「子→親」の所属辺）でグラフを作り、依存辺を含む強連結成分を1件とする。グループを介した循環（AがグループGに依存し、G配下のBがAに依存）も検出する。循環に含まれるタスクは日程が確定しないため、下の2種の判定から除外する。
  - `self-dependency`（error）: 自分自身を先行タスクにしている（循環参照の最小形。`effectivePredecessors` が自己参照を除くため `findDependencyCycles` では検出できず、エンジンも無視するので別途 `findSelfDependencies` で検出する。UIのラベルは「循環参照（自己依存）」）。
  - `predecessor-missing`（error）: 存在しないIDを先行タスクにしている（エンジンは無視するため、依存関係が効いていない）。
  - `dependency-violation`（warning）: **表示スケジュール**上で、各依存関係の条件を `candidateFromDep`（フォワードパスと同じ計算）で評価し直し、表示中の開始日が必要な日付より前なら矛盾とする。先行がグループなら、そのロールアップ済みの表示日程を使う。着手済み（`progress > 0`）は対象外。平準化ONでは手入力の開始日が下限扱いになるため、原則として出ない。
  - `fixed-milestone-overrun`（warning）: 固定マイルストーンについて、先行タスクから求めた最早日（または表示中の日程）が `fixedDate` より後。平準化ON/OFFに関わらず判定する。
  - UI: WBS表の行（名前欄）に `AlertTriangle`（error は赤・warning は amber、ホバーで内容をツールチップ表示。折りたたみ中のグループは配下の矛盾も示す）、ガントバーに破線の枠線（塗り色は変えない）、ヘッダーの「依存関係の矛盾 N」ボタンから一覧ダイアログ（項目クリックで該当タスクを表示）。

### UIレイアウト（WBS/ガント画面）

- 左ペイン（WBS表）と右ペイン（ガントチャート）の間にドラッグ可能な仕切りバーがある。`paneLeftWidth` state（`null` = 列幅合計に自動追従、ドラッグで固定値、ダブルクリックでリセット）で管理。
- **重要**: 左ペインを列幅合計より狭くした場合、各列の幅を縮めてはいけない。WBS表の中身全体を `style={{ width: wbsTotalWidth, minWidth: "100%" }}` の内側ラッパーで包み、外側の `overflow-x-auto` コンテナで横スクロールさせる方式にしている（右のガントペインと同じパターン）。このラッパーを外すと、flexboxのデフォルトの縮小挙動により列が潰れる不具合が再発するので注意。
- WBS表はセル単位の矢印キー移動と、セル・行単位のコピー＆ペーストに対応する。セル・行とテキストの相互変換は `src/lib/wbsEditing.js`（`taskCellText`/`taskCellPatch`/`taskRowText`/`taskRowPatch`）に集約しており、コンポーネント内で再実装しない。
- ガントの日付軸は `dayWidth`（1日あたりのピクセル幅）を `DAY_WIDTH_STOPS` の段階でズームし、`axisTier(dayWidth)` の粒度（`day`/`week`/`month`）に応じてヘッダーの目盛りを日→週→月に縮約する（`src/lib/timeAxis.js`）。バー・依存線・稲妻線は常に線形スケール（1日 = `dayWidth`）のままで、切り替わるのは目盛りと背景の網掛け・罫線だけ。
- タスクバー内の非稼働日（土日・祝日・休日指定）は斜線（`ganttNonWorkdayHatch`）で網掛けする。`month` 粒度では背景・バーとも日単位の網掛けを省略する。稼働上限による非割当日の網掛け（`ganttIdleHatch`）は下記「スケジューリングロジック」の `buildDisplaySchedule` を参照。
- 稲妻線（進捗線、`InazumaLine`）は表示を切り替えられ、進捗基準日（稲妻線と今日の縦線の基準、既定は本日）を手動で指定できる。予定日程（`schedStart`/`schedFinish`）自体は進捗率で変えない。
- タスクバー・マイルストーンはポインタのホバーでツールチップを出す。通常のタスクバーはキーボードでもフォーカスでき（`tabIndex=0`）、フォーカス時も同じツールチップを出し、同じ内容を `aria-label` に持つ（マイルストーンはホバーのみで、`tabIndex`・`aria-label` は持たない）。ツールチップの位置は実際に描画したサイズと最新のポインタ位置から決め、スクロール時・依存関係リンクや行のドラッグ中は出さない。

### 書き出しメニュー

ヘッダーの「書き出し」ドロップダウン（`ExportMenu`）に、JSON書き出し（`exportProject`）・共有用HTML書き出し（`exportSharedHtml`、下記「起動モード」参照）・Mermaidコピー（`generateMermaidGantt`。表示スケジュールの `schedStart`/`schedFinish` をそのまま使ったガント記法）・PNGとしてコピー（WBS/ガント画面の表示中のみ）をまとめている。

- PNGコピー（`copyVisibleGanttAsPng`、`src/dom/ganttPngExport.js`）は、ガントの「現在見えている範囲」を画像にする。Chrome は `foreignObject` を含む SVG を canvas に描くと tainted 扱いにして `toBlob` を拒否するため、HTML要素で描いている日付ヘッダーは `WBSGanttView` 側で SVG ネイティブ要素だけの断片として組み直し、実DOMのバー・背景SVGと合成する（`foreignObject` を使わないこと）。クリップボードへの画像書き込みに対応していない環境では、PNGファイルのダウンロードに切り替える。

### 起動モード（local / linked / embedded）

App は起動元を概念的に3種類として扱う。`autoSaveDisabled`（= `linkedProjectKey || embeddedProject`）が真のときは `pm_project`/`pm_versions` を **一切 localStorage へ書き込まない**（`App.jsx` の `storageSet` 呼び出しはすべてこのフラグでガードする）。表示言語（`pm_ui_locale`）はプロジェクトのデータではなくUIの設定なので、このガードの対象外とし、どの起動モードでも保存する（`I18nProvider` が保存する）。

- `local`: 通常起動。`window.storage`（localStorage）へ自動保存する。
- `linked`: URL に `?schedule=` がある起動。関連付けた外部JSONを表示し、自動保存しない。最新版の再読込が可能（`src/lib/linkedProject.js`・`src/dom/linkedProjectFile.js`）。
- `embedded`: 「共有用HTML」で書き出されたHTMLでの起動。`<head>` 内の `<script type="application/json" id="project-scheduler-embedded">` に **既存のProject JSON（`schemaVersion:1`）をそのまま埋め込む**（共有HTML専用スキーマは作らない）。`readEmbeddedProject()` が初期 state を組み立て、`initialProject` 経由で state を初期化する（linked のような非同期ロードはせず、フラッシュを避けるため同期的に初期化）。自動保存しないので、リロードすれば書き出し時点の状態に戻る。ヘッダー下に amber のスナップショットバナー（`Camera` アイコン + `exportedAt` 表示）を出す。

「共有用HTML書き出し」（ヘッダーの「書き出し」ドロップダウン〔`ExportMenu`〕の項目 → `exportSharedHtml`）は、`buildSharedHtml()`（`src/dom/embeddedProjectDom.js`）で現在ロード済みのHTMLを `cloneNode` し、`#root` を空にして埋め込み `<script>` を差し込んだ自己完結HTMLをダウンロードさせる。埋め込みJSONは `<script>` 内の `</script>` 混入を防ぐため、`serializeEmbeddedProject` が `<`（U+003C）をすべて JSON のユニコードエスケープ（バックスラッシュ + `u003c`）へ置換する（結果の文字列に `<` は現れない。`JSON.parse` で元に戻る）。埋め込み `<script>` は必ず `<head>` に置く（body内のバンドル `<script>` が起動時に `getElementById` で読むため、それより前に解析されている必要がある）。

### 永続化・window.storage

`window.storage` は本来ホスト環境（Claudeのアーティファクト実行環境など）が提供するAPI。このリポジトリでは未定義の場合のみ localStorage ベースのポリフィルを用意している（実装・優先順位ロジックは `src/storage.js` 参照）。ホスト側の `window.storage` を上書きしてしまわないよう、この優先順位は変更しないこと。

## コーディング上の注意

- ロジック（`src/lib/`・`src/dom/`）とUIコンポーネント（`src/components/`・`src/App.jsx`）の分離を維持する。CPMロジックやWBSツリー処理などをReactコンポーネントの中に書き戻さないこと。
- 画面の文言はメッセージカタログ（`src/messages/*.json`）に書き、`src/lib/` では表示用の文字列を組み立てない（コード＋パラメータを返す）。詳細は「多言語対応（i18n）」。
- ドラッグ操作は `startPointerDrag`（`src/dom/pointerDrag.js`）、グループ判定・ロールアップは `isGroupId`/`rollupSummaries`（`src/lib/taskTree.js`・`src/lib/scheduling.js`）、日付スケール・SVG座標変換は `makeDateScale`/`svgPointFromRef`（`src/dom/pointerDrag.js`）、依存関係ラベルは `formatDepLabel`（`src/lib/deps.js`）の各共通ヘルパーを再利用し、コンポーネント内にローカルに再定義しないこと。
- JSON エクスポート/インポート、バージョンスナップショットは `tasks`/`resources`/`sprints`/`calendarExceptions`（JSONはさらに `versions`/`levelingOn`）を含める。新しいトップレベルstateを追加した場合は、次をすべて更新すること。
  - `PROJECT_JSON_SCHEMA`（`src/lib/exportUtils.js`。`npm run build:docs` で `docs/json-format.md` に反映）と `buildProjectExport`/`normalizeImportedProject`
  - App の読み込み経路（localStorage の初回ロード、linked の `applyLinkedProject`、embedded の `initialProject`、JSON「読み込み」の `handleImportFile`）と `pm_project` の自動保存
  - バージョンスナップショット（`saveVersion` の `rawXxx`）と復元（`restoreVersion`）、`seedData()`（`src/lib/seedData.js`）
  - インポートは `schemaVersion: 1` のみ受け付け、`tasks`/`resources`/`sprints`/`versions` は必須（無ければ読み込み失敗）。後から追加するキーは任意項目にし、キーが無い場合は既定値（`false`・`[]` 等）へフォールバックする。キーがあって型が不正な場合の扱いはキーごとに異なる（`calendarExceptions` は配列でなければ読み込み失敗、`levelingOn` は boolean 以外なら `false` に丸める）。
- 依存パッケージのバージョンは `package.json` を正とする。

## ユニットテスト

`src/lib/` 配下の純粋ロジック（CPMエンジン・カレンダー計算・依存関係パーサ・WBSツリー処理・エクスポート処理等）はVitestでユニットテストされている（各モジュールと同じディレクトリの `*.test.js`）。

```bash
npm run test        # 一括実行（CI・コミット前用）
npm run test:watch  # watchモード（開発中）
```

- `src/lib/` に新しい純粋ロジックを追加・変更した場合は、対応する `*.test.js` を必ず追加・更新すること。特に `runCPM`/`levelResources`（`scheduling.js`）はCLAUDE.mdに明文化された仕様（固定マイルストーンのみLS/LFを使う、進捗済みタスクはピン留めする等）の回帰を防ぐ最重要テスト対象なので、挙動を変える変更をした場合は既存テストが仕様変更を正しく反映しているか必ず確認する。
- `src/lib/i18n.test.js` は、`ja.json` と `en.json` のキー・引数名の一致、全メッセージが両言語で書式化できること（`use-intl` と `createAppTranslator` の結果の一致を含む）、英語カタログに日本語が残っていないこと、日本語の日付書式が従来どおりであることを確認する。
- `src/agent/cli.test.js` は、CLIのスケジュール計算（`computeSchedule`）が `src/lib/` の `runCPM` と一致すること・依存関係の矛盾判定（`validate`）がアプリと一致すること・整合性チェック・バージョンスナップショット構造を担保する。`scheduling.js` の仕様を変えたらここも確認する。
- `src/components/`・`src/App.jsx`（Reactコンポーネント）はユニットテストの対象外。次節の手動確認で担保する。

## コミットメッセージ

- セマンティックコミット形式（`feat:`/`fix:`/`refactor:`/`docs:`/`chore:` 等のprefixを付ける）で書くこと。
- タイトル・本文とも日本語の「ですます調・過去形」（例:「〜しました」「〜変更しました」）で書くこと。「〜する」「〜変更する」のような常体・現在形は使わないこと。

## 動作確認方法

変更後は `npm run test` を実行してユニットテストが全件パスすることを確認したうえで、`npm run build` した `project_scheduler.html` をブラウザ（またはPlaywright）で直接開き、以下を目視・手動確認する。

- コンソールエラーが出ていないこと
- ヘッダーで日本語・英語を切り替えられ、リロード後も選んだ言語が保持されること（英語表示でユーザー入力データ・祝日名以外に日本語が残っていないこと）
- サンプルデータ（`seedData()`）を開いた状態でスプリント矛盾アラート・スプリント期間重複警告・依存関係の矛盾が出ないこと（リソース平準化のON/OFFとも、日本語・英語とも）
- タスク編集後、リロードしても内容が保持されること（localStorage永続化）
- Live Demo の言語別ページに関わる変更をした場合は、`PAGES_BASE_URL=http://localhost:<port>/project-scheduler/ npm run build:pages` で生成した `_site/` を `/project-scheduler/` 配下で配信し、`ja/`・`en/` がブラウザの言語・保存済みの選択に関わらずその言語で開くこと、そのページで言語を切り替えると URL が切り替え先のページに変わること（Default では変わらないこと）
