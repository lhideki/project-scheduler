---
name: schedule-adjust
description: >-
  Project Scheduler の保存JSON（project_scheduler.html の「書き出し」ファイル、schemaVersion:1）を
  読み書きして、依存関係・進捗率・スプリント・リソースを踏まえたスケジュール調整を行う。
  「このタスクを2週間後ろ倒しして依存タスクを自動調整」「担当者がかぶらないように平準化」
  「着手済みの遅延を踏まえて引き直す」等の依頼で使う。画面操作ではなくJSONファイルを編集する。
---

# Project Scheduler スケジュール調整スキル

Project Scheduler（単一HTMLのWBS/ガントツール）の保存JSONを直接編集して、スケジュールを
調整するためのスキル。CPM再計算・リソース平準化・整合性チェック・変更影響レポートは同梱の
CLI（`cli.mjs`）が担当する。**CLIはJSONファイルを一切書き換えない。** 保存は必ず
「レポート提示 → ユーザーの保存可否判断 → エージェントが書き込み」の順で行う。

## 前提

- **Node 18 以上**が必要（`cli.mjs` の実行に使う。追加の `npm install` は不要）。
- 対象ファイルは Project Scheduler の「書き出し」で生成したJSON（`schemaVersion: 1`）。
  Web アプリと往復する場合は、アプリを `?schedule=<キー>` で開いて同じローカルJSONファイルに
  関連付けておくと、ここで編集した内容がリロードで反映される。関連付けていない場合は
  ユーザーに「アプリの『読み込み』で取り込んでください」と案内する。
- CLI（`cli.mjs`）は **この `SKILL.md` と同じディレクトリ**にある。以下では `CLI` と表記し、
  `node <このディレクトリ>/cli.mjs …` の形で実行する。
  - リポジトリ内で作業する場合の実体は `.claude/skills/schedule-adjust/cli.mjs`。
  - プラグインとして導入した場合は `${CLAUDE_PLUGIN_ROOT}/.claude/skills/schedule-adjust/cli.mjs`。

## JSON データモデル（要点）

完全な仕様は `docs/json-format.md`（リポジトリ内）を参照。調整で触るのは主に `tasks[]`:

| フィールド | 意味 | 調整での扱い |
| --- | --- | --- |
| `startDate` | 開始日の**入力（ヒント）**。YYYY-MM-DD | 通常表示では固定ピンとして尊重される。「自動スケジューリング実行」では無視され CPM 最短で上書きされる |
| `duration` | 工数（人日） | 見積り変更で編集。着手済みでも満額で計算される（残工数の自動分割はしない） |
| `predecessors[]` | 先行タスク `{id, type: FS/SS/FF/SF, lag}` | 依存の追加・変更。依存はリーフタスクに付ける（グループに付けない） |
| `progress` | 進捗率 0〜100 | `> 0`（着手済み）のタスクは常に現在の `startDate` に固定され、自動スケジューリングの対象外になる |
| `sprintIds[]` | 所属スプリント | スプリント開始日が開始日の下限（後ろ倒しのみ）になる |
| `milestone` / `milestoneMode` / `fixedDate` | マイルストーン設定 | `fixed` の固定マイルストーンだけ期日から逆算表示される |

`parentId` で階層を表現。他タスクから `parentId` 参照されているタスクが「グループ」で、
グループは工数・依存・スプリントを持たない。

`calendarExceptions[]`（トップレベル、任意）は非稼働日カレンダーの上書き指定。
`{ date: "YYYY-MM-DD", type: "holiday" | "workday", name?: string }` の配列で、
`holiday`（UIラベル「休日」）= 平日を非稼働日にする、`workday`（UIラベル「稼働日」）= 土日・祝日・
`holiday` 指定でもその日を稼働日にする＝最優先。CLI は「土日 ＋ 日本の祝日 ＋ `calendarExceptions`」を
織り込んで CPM・リソース平準化を計算する。旧形式JSON（キーなし）は空配列扱い。

**実効スケジュール（`schedStart`/`schedFinish`/`critical`/`float`）は常に再計算され、
`tasks[]` には保存されない。** 確定した時点のスケジュールは `versions[]` スナップショットに凍結される。
`levelingOn`（トップレベル、boolean）がリソース平準化トグルの状態。

## CLI リファレンス

出力は常に構造化JSON（stdout）。`ok: false` はCLI自体のエラー（ファイル未読込・JSON壊れ等）。

```
node <CLI> validate <file>
node <CLI> recalc   <file> [--leveling on|off|auto]
node <CLI> plan     <original.json> <edited.json> [--reschedule] [--leveling on|off|auto]
node <CLI> explain  <file> --task <taskId> [--leveling on|off|auto]
```

### `validate <file>`
スキーマ検証＋参照整合性（存在しない親/担当者/スプリント/先行タスク、自己依存、循環依存、
スプリント期間重複、`calendarExceptions` の日付書式・type、同一日の休日＋稼働日の競合）。
`valid`（error が無いか）、`issues[]`（`severity: error|warning`）を返す。

### `recalc <file>`
非破壊。現在のファイルの実効スケジュールを返す（アプリを開いた状態と一致）。
`tasks[]`（`schedStart`/`schedFinish`/`critical`/`float`/`progress`）、`projectEnd`、
`sprintConflicts`、`levelWarnings`、`integrityIssues`。**現状把握・what-if 確認に使う。**

### `plan <original.json> <edited.json>`
**変更影響レポート＋提案JSONを返す。ファイルは書き換えない。**
- `original.json` = 現在のファイル、`edited.json` = ユーザー依頼の編集を適用したコピー。
- 既定（`adjust` モード）: 編集内容だけを反映。既存の `startDate` ピンは残す。
- `--reschedule`: 「自動スケジューリング実行」相当。全リーフの `startDate` を CPM 最短へ書き戻す
  （固定マイルストーン自身は除く）。依存タスクを広くカスケードさせたいときに使う。
- 返り値:
  - `blocked: true` … `edited.json` に整合性エラーあり。`integrityIssues` を見せて修正を促す。
  - `summary` … `projectEnd` の before→after、スケジュールが動くタスク数、
    `newlyCritical`/`noLongerCritical`、`snapshotName`
  - `scheduleChanges[]` … タスクごとの before→after（`schedStart`/`schedFinish`/`critical`/`shiftWorkdays`）
  - `startDateChanges[]` … `--reschedule` 時の `startDate` 書き戻し一覧
  - `sprintConflicts` / `levelWarnings` … before/after
  - `proposed` … 保存すべき完全なプロジェクトJSON。`versions[]` の先頭に「調整前」スナップショットを
    追加済み、`tasks[]` はモードに応じて書き戻し済み、`levelingOn` は指定値。

### `explain <file> --task <taskId>`
1タスクの ES/EF/LS/LF・フロート・クリティカル、拘束している先行タスク、スプリントフロア、
ピン留めの有無と理由を返す。「なぜこの日程になるのか」の説明に使う。

## 標準ワークフロー（保存を伴う調整）

1. **現状把握**: `validate` と `recalc` を実行。整合性エラーがあれば先に解消。
2. **平準化条件の確認**（下記「平準化の扱い」）。
3. **編集**: ユーザー依頼の変更を、元ファイルのコピー（`<file>.edited.json` など作業用パス）に適用する。
   - 元ファイルは変更しない。
4. **プラン生成**: `node <CLI> plan <元ファイル> <editedファイル> [--reschedule] [--leveling …]`
   - `blocked` なら `integrityIssues` を提示して 3 に戻る。
5. **レポート提示**: `summary` / `scheduleChanges` / `sprintConflicts` / `levelWarnings` を
   日本語の表・箇条書きに整形してユーザーに見せる。最低限、次を必ず含める:
   - 依頼した編集の内容
   - 完了予定日（`projectEnd`）の before → after
   - 開始日・終了日が動くタスク（WBS番号／名前／before→after／増減日数）
   - クリティカルパスに入った／外れたタスク
   - 新たに発生するスプリント矛盾・平準化警告
   - 「`versions[]` に『調整前』スナップショット（名前）を1件追加する」旨
6. **保存可否の確認**: `AskUserQuestion` で「この内容で保存しますか？」と尋ねる。
7. **保存**:
   - はい → `plan` の `proposed` を、`Write` ツールで**元のファイルパスへ上書き保存**する
     （2スペースインデントのJSON）。ツール許可プロンプトが最終ゲートになる。
   - いいえ → 何もしない。作業用 `edited.json` は削除してよい。
8. Web アプリに関連付け済みなら「アプリをリロードすると反映されます」、未関連付けなら
   「アプリの『読み込み』で取り込んでください」と伝える。

**このワークフローを飛ばして保存しないこと。** CLI は書き込み機能を持たないので、
`proposed` を `Write` する前に必ずレポート提示と確認を挟む。

## 平準化の扱い

- `plan` / `recalc` の `--leveling` 既定は `auto` = JSON の `levelingOn` に従う。
- 依頼がリソース競合に関係する場合（「担当者がかぶらないように」「◯◯さんの負荷」等）は、
  現在の `levelingOn` をユーザーに伝えて ON にするか確認する。ON にするなら `--leveling on` を渡し、
  `proposed.levelingOn` も `true` になる。
- 依頼がリソースに無関係なら確認は不要。現在値のまま進め、レポートに「平準化 ON/OFF で計算」と一言添える。
- **平準化後の日付は `startDate` に焼き込まれない。** 平準化は毎回再計算される表示で、
  確定させたいスケジュールは `versions[]` スナップショットが担う（`plan` が自動で1件積む）。

## ユースケース別の編集方針

### 「このタスクを N 日/週 後ろ倒しして、依存タスクを自動調整して」
- 対象タスクの `startDate` を後ろへずらす。
- 依存タスクもカスケードさせたい場合は、対象タスクの後続（推移的）の `startDate` を
  クリア（キー削除）して依存関係から流れるようにするか、`plan --reschedule` を使う。
- `--reschedule` は全タスクの余裕を詰めるため影響範囲が広い。まず既定モードで影響を見せ、
  「もっと前倒しで詰めてよいか」を確認してから `--reschedule` を検討する。

### 「担当者の割り当てが重ならないように」
- `--leveling on` で `plan`。`levelWarnings`（固定マイルストーン期日超過）と
  `after` の `projectEnd` を必ず提示。必要なら担当者（`assigneeId`）の再割り当ても提案。

### 「着手済みの遅れを踏まえてスケジュールを引き直して」
- `progress > 0` のタスクは `startDate` に固定される（自動では動かない）。
- 実績に合わせるには、着手済みタスクの `startDate` を実際の開始日へ更新する／
  遅延分を `duration` に上乗せする／未着手タスクの `startDate` を基準日以降へ前進させる、
  のいずれをやるかユーザーに確認してから編集する。
- そのうえで `plan`（必要なら `--reschedule`）で後続への波及を見せる。

### 「年末年始を休みにして」「この土曜は稼働日にして」（非稼働日カレンダー）
- `edited.json` の `calendarExceptions[]` に行を追加する。
  休日は `{ date, type: "holiday", name }`、稼働日は `{ date, type: "workday", name }`。
- 連続期間（年末年始など）は各日を1行ずつ列挙する（土日は元々非稼働なので省いてよい）。
- `plan` で全タスクへの波及（`scheduleChanges`・`projectEnd`）を提示してから保存する。

### 「このマイルストーンを固定にしたら？」（what-if）
- `edited.json` で `milestoneMode: "fixed"` ＋ `fixedDate` を設定し、`plan` で影響を提示。
- 保存せず比較だけで済むことも多い。ユーザーが確定を望むまで `Write` しない。

## 注意

- `project_scheduler.html` は編集しない（ビルド成果物）。触るのは保存JSONのみ。
- `proposed` をそのまま保存すること（`versions[]` スナップショットや `exportedAt` を削らない）。
- 大きな構造変更（タスクの大量追加・階層再編）を伴う場合は、先に `validate` で
  `edited.json` の整合性を確認してから `plan` する。
