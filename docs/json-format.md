# JSON保存形式

Project Scheduler の「書き出し」「読み込み」で使うJSON形式の説明です。  
このドキュメントは人が読みやすいことを優先しており、実装上の定義は `/home/runner/work/project-scheduler/project-scheduler/src/lib/exportUtils.js` の `PROJECT_JSON_SCHEMA` が正です。

## 方針

- 現行の保存形式は `schemaVersion: 1` です
- インポートは現行形式のみ受け付けます
- 旧形式JSONへの後方互換はありません
- トップレベルには必ず `tasks` / `resources` / `sprints` / `versions` を含めます

## トップレベル構造

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-26T00:00:00.000Z",
  "tasks": [],
  "resources": [],
  "sprints": [],
  "versions": []
}
```

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `schemaVersion` | number | 必須 | 保存形式のバージョン。現在は `1` 固定です。 |
| `exportedAt` | string | 必須 | エクスポート日時。ISO 8601形式です。 |
| `tasks` | array | 必須 | タスク一覧です。 |
| `resources` | array | 必須 | 担当者一覧です。 |
| `sprints` | array | 必須 | スプリント一覧です。 |
| `versions` | array | 必須 | 保存済みバージョン一覧です。 |

## tasks

WBSは階層構造専用のオブジェクトを持たず、`parentId` で親子関係を表します。  
他のタスクから `parentId` で参照されているタスクはグループとして扱われます。

### 必須項目

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | タスクID |
| `name` | string | タスク名 |
| `parentId` | string \| null | 親タスクID。ルート直下は `null` |
| `order` | number | 同じ親配下での表示順 |

### 任意項目

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `startDate` | string | 開始日 (`YYYY-MM-DD`) |
| `duration` | number | 工数。マイルストーンは通常 `0` |
| `assigneeId` | string \| null | 担当者ID |
| `sprintIds` | string[] | 紐付けるスプリントID一覧 |
| `predecessors` | array | 先行タスク一覧 |
| `progress` | number | 進捗率 (`0`〜`100`) |
| `milestone` | boolean | マイルストーンかどうか |
| `milestoneMode` | `"flexible"` \| `"fixed"` | 柔軟/固定モード |
| `fixedDate` | string | 固定マイルストーンの日付 (`YYYY-MM-DD`) |
| `savedDuration` | number | マイルストーン化前の工数退避値 |
| `notes` | string | 詳細メモ |
| `diagX` | number | ネットワーク図の手動X座標 |
| `diagY` | number | ネットワーク図の手動Y座標 |

### predecessors の要素

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | 必須 | 先行タスクID |
| `type` | `"FS"` \| `"SS"` \| `"FF"` \| `"SF"` | 必須 | 依存関係の種類 |
| `lag` | number | 必須 | リード/ラグ日数 |

## resources

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | 必須 | 担当者ID |
| `name` | string | 必須 | 表示名 |
| `weeklyCapacity` | number | 必須 | 週次稼働上限 |
| `monthlyCapacity` | number | 必須 | 月次稼働上限 |

## sprints

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | 必須 | スプリントID |
| `name` | string | 必須 | スプリント名 |
| `theme` | string | 任意 | テーマ |
| `startDate` | string | 必須 | 開始日 (`YYYY-MM-DD`) |
| `endDate` | string | 必須 | 終了日 (`YYYY-MM-DD`) |
| `order` | number | 必須 | 表示順 |

## versions

`versions` は比較表示用のスナップショットと、復元用の完全スナップショットをまとめて持ちます。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | 必須 | バージョンID |
| `name` | string | 必須 | バージョン名 |
| `createdAt` | number | 必須 | 保存時刻（Unixミリ秒） |
| `tasks` | array | 必須 | 比較表示用のタスク配列 |
| `hasWbsInfo` | boolean | 必須 | WBS比較用情報を含むか |
| `rawTasks` | array | 任意 | 復元用の完全な tasks |
| `rawResources` | array | 任意 | 復元用の完全な resources |
| `rawSprints` | array | 任意 | 復元用の完全な sprints |
| `hasFullSnapshot` | boolean | 必須 | 復元に必要な `raw*` が揃っているか |

### versions.tasks の要素

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | string | 必須 | タスクID |
| `name` | string | 必須 | タスク名 |
| `level` | number | 必須 | WBS階層レベル |
| `wbsNo` | string | 必須 | WBS番号 |
| `hasChildren` | boolean | 必須 | 子タスクの有無 |
| `schedStart` | string | 任意 | 計算後開始日 (`YYYY-MM-DD`) |
| `schedFinish` | string | 任意 | 計算後終了日 (`YYYY-MM-DD`) |
| `critical` | boolean | 必須 | クリティカルかどうか |
| `milestone` | boolean | 必須 | マイルストーンかどうか |
| `duration` | number \| null | 任意 | 保存時点の工数 |
| `assigneeId` | string \| null | 必須 | 担当者ID |
| `progress` | number | 必須 | 進捗率 |

## インポート時の扱い

- JSONとして解釈できない場合は読み込みに失敗します
- `schemaVersion !== 1` の場合は読み込みに失敗します
- `exportedAt` / `tasks` / `resources` / `sprints` / `versions` のいずれかが欠けている場合は読み込みに失敗します
- `versions` の各要素については、`rawTasks` / `rawResources` / `rawSprints` が揃っているかどうかから `hasFullSnapshot` を再計算します
