# JSON保存形式

<!-- このファイルは scripts/build-json-doc.mjs により自動生成されます。直接編集しないでください。 -->

Project Scheduler の「書き出し」「読み込み」で使うJSON形式です。

## 方針

- 現行の保存形式は `schemaVersion: 1` です
- インポートは現行形式のみ受け付けます
- 異なる schemaVersion の旧形式JSONへの変換は行いません。名前など後から追加された任意項目を含まない schemaVersion: 1 JSONは受け付けます
- `projectName` 対応前のHTML・CLIは未知のトップレベル項目を保持しないため、そこを通して保存・再書き出しすると名前が失われます。旧JSON Schema（additionalProperties: false）でも名前付きJSONは検証に失敗します。名前を保持するには対応版のHTML・CLIを使ってください

## トップレベル構造

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | 必須 | 保存フォーマットのスキーマバージョン |
| `exportedAt` | `string` | 必須 | エクスポート日時（ISO 8601） |
| `projectName` | `string` | 任意 | 表示用のプロジェクト名（任意）。前後の空白を除き、未設定・空白のみは空文字列として保持します。翻訳された既定表示名は保存しません。ID・保存先・ファイル名ではなく、日程バージョンの復元対象外です。 |
| `tasks` | `task[]` | 必須 | タスク一覧 |
| `resources` | `resource[]` | 必須 | 担当者一覧 |
| `sprints` | `sprint[]` | 必須 | スプリント一覧 |
| `versions` | `version[]` | 必須 | 保存済みバージョン一覧 |
| `levelingOn` | `boolean` | 任意 | リソース平準化の有効/無効（旧形式のJSONには存在せず、その場合は false 扱い） |
| `calendarExceptions` | `calendarException[]` | 任意 | 非稼働日カレンダーの例外（休日・稼働日の上書き指定）。旧形式のJSONには存在せず、その場合は空配列扱い。 |

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-26T00:00:00.000Z",
  "projectName": "新製品リリース",
  "tasks": [],
  "resources": [],
  "sprints": [],
  "versions": [],
  "calendarExceptions": []
}
```

## tasks

WBS上のタスクです。階層は parentId で表現します。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | タスクID。内部生成用の@recurrence:接頭辞は使用できません。 |
| `name` | `string` | 必須 | タスク名 |
| `parentId` | `string` \| `null` | 必須 | 親タスクID。ルート直下は null |
| `order` | `number` | 必須 | 同じ親配下での表示順 |
| `startDate` | `string` | 任意 | 開始日（YYYY-MM-DD） |
| `duration` | `number` | 任意 | 工数。マイルストーンは通常0。繰り返しでは各回の工数で、既定期間は切り上げ日数の暦日（最大3,660日）です。 |
| `recurrence` | `recurrence` | 任意 | 繰り返し規則（任意）。通常の末端タスクのみ。 |
| `occurrenceOverrides` | `object` | 任意 | 各回の元の予定日をキーとする修正情報。日程を変えてもキーは不変です。 |
| `assigneeId` | `string` \| `null` | 任意 | 担当者ID |
| `sprintIds` | `string[]` | 任意 | 紐付けるスプリントID一覧 |
| `predecessors` | `dependency[]` | 任意 | 先行タスク一覧 |
| `progress` | `number` | 任意 | 進捗率（0〜100）。繰り返しでは個別進捗がない既存・新規の回の基準値。画面のシリーズ集計値では上書きしません。 |
| `milestone` | `boolean` | 任意 | マイルストーンかどうか |
| `milestoneMode` | `flexible` \| `fixed` | 任意 | 柔軟/固定モード |
| `fixedDate` | `string` | 任意 | 固定マイルストーンの日付（YYYY-MM-DD） |
| `savedDuration` | `number` | 任意 | マイルストーン化前の工数退避値 |
| `notes` | `string` | 任意 | 詳細メモ |
| `diagX` | `number` | 任意 | ネットワーク図の手動X座標 |
| `diagY` | `number` | 任意 | ネットワーク図の手動Y座標 |

## recurrence（繰り返し規則）

通常の末端タスクに設定する繰り返し規則。task.startDateが必須の起点。各回は暦日で固定し、自動スケジューリング・休日補正の対象外です。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `frequency` | `daily` \| `weekly` \| `monthly` | 必須 | 日・週・月単位 |
| `interval` | `integer` | 必須 | 間隔。1=毎回、2=隔日・隔週・隔月 |
| `weekdays` | `integer[]` | 任意 | 週単位の対象曜日（0=日、1=月…6=土）。省略時は開始日の曜日。週の起点は開始日を含む月曜日です。 |
| `monthDay` | `day` \| `start` \| `end` | 任意 | 月単位の日付。day=開始日と同じ日（存在しない月は月末）、start=暦月初、end=暦月末。開始日より前は生成しません。 |
| `endDate` | `string` | 任意 | 繰り返し終了日（その日を含む）。開始日以上で任意。元の予定日を基準に判定します。 |
| `calculationEndDate` | `string` | 任意 | 終了日なしの有限計算期間。省略時は開始日の1周年の前日。現在日付・表示範囲には依存しません。開始日から最大3,660暦日・1シリーズ最大2,000回で打ち切りを警告します。 |

## occurrenceOverrides の値（個別修正）

元の予定日をキーとする個別修正。規則変更で対象外になった修正は保持し、別の回へ付け替えません。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `progress` | `number` | 任意 | この回のみの進捗率（0〜100）。省略時は保存済みtask.progressを引き継ぎます。 |
| `skipped` | `boolean` | 任意 | trueならこの回をスキップし、工数・進捗集計から除外します。進捗・日程・依存関係は保持します。省略時はfalse。 |
| `startDate` | `string` | 任意 | この回のみの固定開始日 |
| `endDate` | `string` | 任意 | この回のみの固定終了日（開始日以上、両端を含む、最大3,660暦日） |
| `predecessors` | `dependency[]` | 任意 | この回の先行タスク。省略時はシリーズ共通、指定時は共通設定を置き換えます。空配列は依存なし。 |

## predecessors の要素

先行タスクを表すオブジェクトです。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | 先行タスクID。繰り返しシリーズの場合、occurrenceDate未指定は有限の計算対象期間全体への依存です。 |
| `occurrenceDate` | `string` | 任意 | 特定回の元の日付（YYYY-MM-DD）。日程修正後もこの識別子を変更しません。 |
| `type` | `FS` \| `SS` \| `FF` \| `SF` | 必須 | 依存関係の種類 |
| `lag` | `number` | 必須 | リード/ラグ日数 |

## resources

担当者リソースです。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | 担当者ID |
| `name` | `string` | 必須 | 表示名 |
| `weeklyCapacity` | `number` | 必須 | 週次稼働上限 |
| `monthlyCapacity` | `number` | 必須 | 月次稼働上限 |

## sprints

スプリント定義です。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | スプリントID |
| `name` | `string` | 必須 | スプリント名 |
| `theme` | `string` | 任意 | テーマ |
| `startDate` | `string` | 必須 | 開始日（YYYY-MM-DD） |
| `endDate` | `string` | 必須 | 終了日（YYYY-MM-DD） |
| `order` | `number` | 必須 | 表示順 |

## versions

比較表示用スナップショットと復元用完全スナップショットを持つ保存済みバージョンです。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | バージョンID |
| `name` | `string` | 必須 | バージョン名 |
| `createdAt` | `number` | 必須 | 保存時刻（Unixミリ秒） |
| `tasks` | `versionTask[]` | 必須 | 比較表示用のタスク配列 |
| `hasWbsInfo` | `boolean` | 必須 | WBS比較用情報を含むか |
| `rawTasks` | `task[]` | 任意 | 復元用の完全な tasks |
| `rawResources` | `resource[]` | 任意 | 復元用の完全な resources |
| `rawSprints` | `sprint[]` | 任意 | 復元用の完全な sprints |
| `rawCalendarExceptions` | `calendarException[]` | 任意 | 復元用の完全な calendarExceptions（この項目が無い古いスナップショットは復元時に空配列扱い） |
| `rawLevelingOn` | `boolean` | 任意 | 保存時のリソース平準化条件。この項目が無い古いスナップショットは元の条件が不明なため、復元時の現在値を維持する（日程の完全な再現は保証しない）。 |
| `hasFullSnapshot` | `boolean` | 必須 | 復元に必要な raw*（rawTasks/rawResources/rawSprints）が揃っているか |

## versions.tasks の要素

バージョン比較表示用のタスクスナップショットです。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | タスクID |
| `name` | `string` | 必須 | タスク名 |
| `level` | `number` | 必須 | WBS階層レベル |
| `wbsNo` | `string` | 必須 | WBS番号 |
| `hasChildren` | `boolean` | 必須 | 子タスクの有無 |
| `occurrences` | `occurrenceSnapshot[]` | 任意 | 繰り返し各回の比較表示用日程（任意） |
| `schedStart` | `string` | 任意 | 計算後開始日（YYYY-MM-DD） |
| `schedFinish` | `string` | 任意 | 計算後終了日（YYYY-MM-DD） |
| `critical` | `boolean` | 必須 | クリティカルかどうか |
| `milestone` | `boolean` | 必須 | マイルストーンかどうか |
| `duration` | `number` \| `null` | 任意 | 保存時点の工数 |
| `assigneeId` | `string` \| `null` | 必須 | 担当者ID |
| `progress` | `number` | 必須 | 進捗率 |

## versions.tasks.occurrences の要素

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `occurrenceDate` | `string` | 必須 | 識別用の元の予定日 |
| `schedStart` | `string` | 必須 | 保存時点の開始日 |
| `schedFinish` | `string` | 必須 | 保存時点の終了日 |
| `progress` | `number` | 任意 | 保存時点の各回の実効進捗率。旧スナップショットでは省略可。 |
| `skipped` | `boolean` | 任意 | 保存時点のスキップ状態。旧スナップショットでは省略可。 |

## calendarExceptions の要素

非稼働日カレンダーの例外です。土日・日本の祝日の計算結果に対する上書き指定です。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `date` | `string` | 必須 | 対象日（YYYY-MM-DD） |
| `type` | `holiday` \| `workday` | 必須 | holiday（休日）: 平日を非稼働日にする / workday（稼働日）: 土日・祝日・休日指定を稼働日にする（最優先） |
| `name` | `string` | 任意 | 表示用ラベル（任意） |

## インポート時の扱い

- JSONとして解釈できない場合は読み込みに失敗します
- `schemaVersion !== 1` の場合は読み込みに失敗します
- 必須トップレベル項目が欠けている場合は読み込みに失敗します
- `projectName` は前後の空白を除き、未設定・空白のみを空文字列へ正規化します。文字列でない値は読み込みに失敗します。既定表示名は翻訳して表示するだけで保存しません
- 名前はID・保存先・ファイル名ではありません。同名を許容し、名前を変更しても `pm_project`・`schedule` の関連付け・実ファイル名は変わりません。日程バージョンを復元しても現在の名前を維持します
- `hasFullSnapshot` は `rawTasks` / `rawResources` / `rawSprints` の有無から再計算します
- `levelingOn` / `calendarExceptions` が無い旧形式JSONは、それぞれ `false` / `[]` として読み込みます
- `calendarExceptions` キーが存在するのに配列でない場合は読み込みに失敗します
