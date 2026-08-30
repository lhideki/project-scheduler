# JSON保存形式

<!-- このファイルは scripts/build-json-doc.mjs により自動生成されます。直接編集しないでください。 -->

Project Scheduler の「書き出し」「読み込み」で使うJSON形式です。

## 方針

- 現行の保存形式は `schemaVersion: 1` です
- インポートは現行形式のみ受け付けます
- 旧形式JSONへの後方互換はありません

## トップレベル構造

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | 必須 | 保存フォーマットのスキーマバージョン |
| `exportedAt` | `string` | 必須 | エクスポート日時（ISO 8601） |
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
| `id` | `string` | 必須 | タスクID |
| `name` | `string` | 必須 | タスク名 |
| `parentId` | `string` \| `null` | 必須 | 親タスクID。ルート直下は null |
| `order` | `number` | 必須 | 同じ親配下での表示順 |
| `startDate` | `string` | 任意 | 開始日（YYYY-MM-DD） |
| `duration` | `number` | 任意 | 工数。マイルストーンは通常 0 |
| `assigneeId` | `string` \| `null` | 任意 | 担当者ID |
| `sprintIds` | `string[]` | 任意 | 紐付けるスプリントID一覧 |
| `predecessors` | `dependency[]` | 任意 | 先行タスク一覧 |
| `progress` | `number` | 任意 | 進捗率（0〜100） |
| `milestone` | `boolean` | 任意 | マイルストーンかどうか |
| `milestoneMode` | `flexible` \| `fixed` | 任意 | 柔軟/固定モード |
| `fixedDate` | `string` | 任意 | 固定マイルストーンの日付（YYYY-MM-DD） |
| `savedDuration` | `number` | 任意 | マイルストーン化前の工数退避値 |
| `notes` | `string` | 任意 | 詳細メモ |
| `diagX` | `number` | 任意 | ネットワーク図の手動X座標 |
| `diagY` | `number` | 任意 | ネットワーク図の手動Y座標 |

## predecessors の要素

先行タスクを表すオブジェクトです。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | 必須 | 先行タスクID |
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
| `schedStart` | `string` | 任意 | 計算後開始日（YYYY-MM-DD） |
| `schedFinish` | `string` | 任意 | 計算後終了日（YYYY-MM-DD） |
| `critical` | `boolean` | 必須 | クリティカルかどうか |
| `milestone` | `boolean` | 必須 | マイルストーンかどうか |
| `duration` | `number` \| `null` | 任意 | 保存時点の工数 |
| `assigneeId` | `string` \| `null` | 必須 | 担当者ID |
| `progress` | `number` | 必須 | 進捗率 |

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
- `hasFullSnapshot` は `rawTasks` / `rawResources` / `rawSprints` の有無から再計算します
- `levelingOn` / `calendarExceptions` が無い旧形式JSONは、それぞれ `false` / `[]` として読み込みます
- `calendarExceptions` キーが存在するのに配列でない場合は読み込みに失敗します
