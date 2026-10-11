# Recurring tasks / 繰り返しタスク

## English

A recurring task is one WBS/Gantt row with a separate, fixed-date bar for each occurrence. Open a regular leaf task's details, choose **Add recurrence**, set the rule, and save it. A group or milestone cannot repeat. Use **Edit recurrence** to change the origin or rule; the WBS start-date cell is read-only for a series.

### Converting existing tasks

An existing regular leaf task can become recurring even when it has dependencies or is complete. Its ID, effort, assignee, predecessors and progress are retained; 100% progress is inherited by every occurrence, not reset. A leaf inside a group is supported. A task with children cannot repeat, and a milestone must first be changed to a regular task. A task without a start date can open the editor, but a valid start date is required before saving.

To return to a regular task, clear **Repeat this task** and save. This removes the rule while retaining the current task fields and dormant occurrence overrides; it does not restore a pre-conversion schedule. Dependencies targeting a specific occurrence are also retained, so they are reported as missing until that occurrence is restored or the reference is repaired.

### Rules and calculation period

- The start date is required and anchors the rule. The recurrence end date is optional and inclusive, evaluated against the original occurrence date.
- Daily, weekly, and monthly intervals accept integers from 1 to 365. An interval of 2 gives alternate days, alternate weeks, or alternate months.
- Weekly rules allow multiple weekdays. Interval weeks start on the Monday of the origin's week; dates before the origin are omitted.
- Monthly rules support the origin's day of month, calendar month start, and calendar month end. Missing day numbers clamp to that month's end without changing later months: January 31 → February 28/29 → March 31.
- Without an end date, **Calculate through** defines a finite period. Its default is one calendar year from the origin, inclusive (a February 29 origin runs through February 28 the following year). It is saved in the rule when edited in the UI; omitted values in JSON use the same deterministic default. An explicit recurrence end date takes precedence over this field.
- Neither today's date nor scrolling/zooming the Gantt changes the calculation period or any occurrence's identity/date. To calculate farther ahead, edit the rule's calculation period explicitly.
- Safety limits are 2,000 occurrences per series and 3,660 calendar days from the origin. The UI/CLI warn when a requested period is truncated; they do not claim that the entire requested series was calculated. Each individual occurrence's span is also limited to 3,660 calendar days, and its start may move at most 3,660 days before or after its original date.

### Individual dates and stable identity

Select an occurrence bar or a row in the detail panel's occurrence list. Edit its start/end dates, then **Save occurrence**. Cancel, closing the panel, and incomplete input do not save that draft. **Reset occurrence** removes just that occurrence's override.

The original generated date is the occurrence's permanent identity, even if it moves into another month or outside the calculation period. Rules and `occurrenceOverrides` are stored separately. Changing a rule retains overrides keyed by their original date; an override whose original date no longer matches stays dormant, is counted in the detail panel, and is never attached to a different occurrence. Restoring the matching rule reactivates it. Disabling recurrence also retains overrides.

### Dependencies and fixed dates

- A regular dependency on a series uses that series' entire **finite calculated range**. Changing the calculation period can therefore change that aggregate dependency's boundary.
- To reference one occurrence, enter `WBS@YYYY-MM-DDFS`, for example `2@2026-12-31FS+1`. The date is its **original** date, not its overridden date. FS/SS/FF/SF and working-day lead/lag remain available.
- Series predecessors apply to every occurrence. An occurrence can replace its predecessors independently; an explicit empty array means no predecessors for that occurrence.
- Recurring dates never move or stretch during automatic scheduling, resource leveling, holiday correction, sprint constraints, or dependency resolution. Dependency violations and cycles are reported. If a specific referenced occurrence falls outside a changed rule/calculation period, the reference is retained and flagged so it can be repaired; saved data can still be reopened.
- Weekends/holidays remain calendar dates. No automatic postponement is applied.

### Effort and resources

Each occurrence inherits the series' effort, assignee, progress, and sprint settings. The default inclusive span is `max(1, ceil(duration))` calendar days. A start-only override preserves that default span; an explicit end date controls the span independently of effort.

Effort is distributed uniformly across the fixed span, including weekends/holidays. Fixed occurrences reserve resource capacity before movable tasks. They stay in place even when capacity is exceeded; load conflicts are shown as warnings. A longer date span does not create extra effort. The progress line omits recurring rows because their envelope includes gaps; individual bars still show shared progress. Per-occurrence effort/assignee/progress editing and automatic holiday shifting are outside this initial version.

### CLI inspection

`node .claude/skills/schedule-adjust/cli.mjs explain project.json --task review --occurrence 2026-12-31` explains one original occurrence, including its moved dates and effective predecessors. Omit `--occurrence` to inspect the finite series envelope and its occurrence list. `recalc` lists each occurrence and `plan` reports changes to an inner occurrence even when the series envelope is unchanged.

### Persistence

The optional `recurrence`, `occurrenceOverrides`, and dependency `occurrenceDate` fields keep `schemaVersion: 1`. Existing ordinary-task files remain supported. JSON, local restoration, shared HTML, Undo/Redo, version snapshots, and CLI plans preserve the raw rules/overrides. Generated occurrences are calculated, not saved as duplicate WBS tasks. Use a recurrence-aware HTML/CLI to edit these plans; older releases do not calculate their rules.

## 日本語

通常の末端タスクの詳細から「繰り返しを追加」で設定します。WBS・ガントは1シリーズ1行で、各回を独立した固定日程のバーとして表示します。グループ・マイルストーンには設定できません。シリーズの開始日・規則は詳細の「繰り返しを編集」から変更します。

### 既存タスクの変換・解除

子タスクのない通常タスクなら、依存関係がある場合や完了済みでも変換できます。グループ配下の末端タスクも対象です。ID・工数・担当者・依存・進捗を保持し、完了100%も各回へ引き継ぎます。親グループは変換できず、マイルストーンは先に通常タスクへ変更する必要があります。開始日がなくても設定画面は開けますが、保存には有効な開始日が必要です。

通常タスクへ戻すには「このタスクを繰り返す」のチェックを外して保存します。規則を解除し、現在のタスク情報と休止した個別修正を保持します。変換前の日程への自動復元ではありません。他タスクから特定回への依存も保持するため、その回を再生成するか参照を修正するまでは参照先なしの警告になります。

### 規則と計算期間

- 開始日が必須の起点です。終了日は任意で、その日を含みます。終了判定には各回の元の予定日を使います。
- 日・週・月単位で1〜365の間隔を設定できます。2なら隔日・隔週・隔月です。
- 週は開始日を含む週の月曜日を区切りとし、曜日を複数指定できます。開始日より前の回は生成しません。
- 月は開始日と同じ日・暦月初・暦月末に対応します。存在しない日付はその月の末日に丸め、翌月にずらしません（1/31→2/28または2/29→3/31）。
- 終了日なしでは「計算対象の終了日」まで計算します。初期値は開始日から1年の範囲（2/29開始は翌年2/28まで）。UIの保存時に規則へ保存し、JSONで省略した場合も同じ決定的な初期値を使います。繰り返し終了日がある場合はそちらを優先します。
- 本日の日付、スクロール、ズームでは計算期間・各回の識別子・日程は変わりません。先の期間を計算する場合は規則の計算期間を明示的に変更します。
- 安全上限は1シリーズ2,000回、開始日から3,660暦日です。対象期間を打ち切った場合はUI・CLIで警告し、全期間を計算したようには扱いません。1回の日程幅も最大3,660暦日で、元の予定日から開始日を移動できる幅は前後3,660日までです。

### 各回の編集・依存関係

バーまたは詳細の各回一覧から開始・終了日を変更し、「この回を保存」で確定します。キャンセル・パネルを閉じる操作・不完全な入力では保存しません。「この回の修正を解除」はその回だけを規則に戻します。

各回の識別子は変更前の元の予定日です。規則と個別修正を分けて保持し、規則変更で対象外になった修正は休止状態で残します。別の回への付け替えは行いません。元の日付を含む規則に戻すと再適用され、繰り返しを無効にしても修正は保持します。

- シリーズ全体への依存は有限の計算対象期間全体を参照します。計算期間を変更すると、その集約された依存境界も変わる場合があります。
- 特定回は `2@2026-12-31FS+1` のように、WBS番号と元の予定日を指定します。移動後の日付ではありません。FS/SS/FF/SF・稼働日単位のリード/ラグに対応します。
- シリーズの先行タスクは各回へ適用します。各回で個別の先行タスクへ置き換えることもでき、明示的な空配列はその回だけ依存なしです。
- 自動スケジューリング・平準化・休日・スプリント・依存関係で各回の日程を移動・延長しません。矛盾・循環・規則変更で参照先の回がなくなった場合は警告し、参照と保存データは保持します。

### 工数・保存

各回はシリーズの工数・担当者・進捗・スプリントを共有します。既定の日程幅は工数を切り上げた暦日数（最小1日）。開始日だけの修正は既定幅を維持し、終了日を指定した場合はその固定幅を使います。工数は土日祝日を含む固定期間に均等配分し、日程幅を伸ばしても工数は増えません。固定回の負荷を先に確保し、容量超過は移動せず警告します。期間の隙間を進捗として誤表示しないため、稲妻線では繰り返し行を除外し、各バーに共通進捗を表示します。各回別の工数・担当者・進捗や休日の自動順延は初期対応に含みません。

保存形式は引き続き `schemaVersion: 1` で、新しい項目は任意です。既存の通常タスクを読み込めます。JSON・ブラウザ保存・共有HTML・Undo/Redo・バージョン復元・CLIの提案に規則と修正を保持し、生成回を重複したWBSタスクとして保存しません。繰り返し対応前のHTML・CLIでは規則を計算できないため、対応版を使ってください。

CLIは `explain project.json --task review --occurrence 2026-12-31` で元の日付を指定して各回を確認できます。`--occurrence` を省くとシリーズ全体と各回一覧、`recalc` は各回の日程、`plan` はシリーズの開始・終了が変わらない内側の回の変更も報告します。

## JSON example / 設定例

```json
{
  "id": "review",
  "name": "隔月レビュー",
  "parentId": null,
  "order": 0,
  "startDate": "2026-10-31",
  "duration": 1,
  "recurrence": {
    "frequency": "monthly",
    "interval": 2,
    "monthDay": "end",
    "endDate": "2027-04-30"
  },
  "occurrenceOverrides": {
    "2026-12-31": { "startDate": "2027-01-05", "endDate": "2027-01-05" }
  }
}
```

The moved occurrence is still referenced by / 移動後も依存は元の日付を指定します:

```json
{ "id": "review", "occurrenceDate": "2026-12-31", "type": "FS", "lag": 0 }
```
