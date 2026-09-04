---
name: backlog-sync
description: >-
  Project Scheduler の保存JSON（project_scheduler.html の「書き出し」ファイル、schemaVersion:1）と
  Backlog の課題を bee（Backlog公式CLI）経由で双方向同期する。
  「このスケジュールをBacklogに課題として登録して」「Backlogの進捗をJSONに取り込んで引き直して」
  「Schedulerで動いた日程をBacklogの開始日・期限日に反映して」等の依頼で使う。
---

# Project Scheduler ↔ Backlog 同期スキル

Project Scheduler（単一HTMLのWBS/ガントツール）の保存JSONと Backlog プロジェクトの課題を、
`bee` 経由で双方向に同期するためのスキル。

**このスキルは計算もJSON書き込みもしない接着層**である。役割分担は次のとおり。

| 処理 | 担当 |
| --- | --- |
| CPM再計算・リソース平準化・整合性チェック | `schedule-adjust` の CLI（`cli.mjs recalc`）に委譲 |
| Scheduler JSON の編集・保存 | `schedule-adjust` の標準ワークフローに合流（`plan` → レポート → 確認 → `Write`） |
| Backlog の課題 CRUD | `bee` に委譲（このスキルはコマンドを組み立てて実行するだけ） |
| フィールド対応・状態変換・ID解決・同期差分の算出 | このスキル（`SKILL.md` ＋ `references/mapping.md` ＋ サイドカー設定ファイル） |

## 前提

- **`bee`（`@nulab/bee`）がインストール・認証済みであること。** 未導入なら
  `npm i -g @nulab/bee`、未認証なら `bee auth login` をユーザーに案内する。
  `bee auth status` で確認できる。
- **Node.js 18 以上**（`schedule-adjust` の `cli.mjs` 実行に使う）。
- 対象ファイルは Project Scheduler の「書き出し」で生成したJSON（`schemaVersion: 1`）。
- `schedule-adjust` スキルが同じプラグイン内に同梱されている
  （このスキルは `../schedule-adjust/cli.mjs` を呼ぶ。プラグイン導入時は
  `${CLAUDE_PLUGIN_ROOT}/.claude/skills/schedule-adjust/cli.mjs`）。以下 `SCHED_CLI` と表記する。
- **Backlog への書き込みは外部・不可逆。** 必ず「差分レポート提示 → `AskUserQuestion` で承認 → `bee` 実行」
  の順で行う。課題の削除は自動化しない（孤児は一覧提示のみ）。

## サイドカー設定ファイル `<file>.backlog.json`

同期の設定と対応表を、保存JSONと同じ場所に置く **スキーマ外のサイドカーファイル**
`<保存JSONのパス>.backlog.json` で管理する（Project Scheduler の JSON スキーマは変更しない）。

```json
{
  "space": "example.backlog.com",
  "projectKey": "PSDEMO",
  "issueType": { "task": "タスク", "group": "タスク", "milestone": "マイルストーン" },
  "priorityDefault": "normal",
  "statusByProgress": [
    { "upTo": 0,   "status": "未対応" },
    { "upTo": 79,  "status": "処理中" },
    { "upTo": 99,  "status": "処理済み" },
    { "upTo": 100, "status": "完了" }
  ],
  "progressByStatus": { "未対応": 0, "処理中": 50, "処理済み": 80, "完了": 100 },
  "users": { "r-tanaka": "@me", "r-sato": "197201" },
  "leveling": "off",
  "pushGroups": true,
  "issues": { "g1": "PSDEMO-11", "t1": "PSDEMO-12" },
  "syncedAt": "2026-09-04T09:00:00.000Z"
}
```

| キー | 意味 |
| --- | --- |
| `space` / `projectKey` | 同期先の Backlog スペースとプロジェクトキー。`bee` へ `-s` / `-p` で渡す |
| `issueType` | Scheduler の種類（`task` / `group` / `milestone`）→ Backlog 課題種別**名**。実行時に `bee issue-type list --json` で ID へ解決する |
| `priorityDefault` | 新規作成時の優先度（`high` / `normal` / `low`） |
| `statusByProgress` | `progress`（0〜100）→ Backlog ステータス**名**。`upTo` 昇順で最初に一致した区分を使う。push で使用 |
| `progressByStatus` | Backlog ステータス**名** → `progress` 値。pull で使用。「処理中」を何%として取り込むかはユーザーに確認して決める |
| `users` | Scheduler の `resources[].id` → Backlog ユーザーID（`@me` も可）。実行時に `bee project users --json` で突き合わせ確認 |
| `leveling` | push する日程が CPM（`off`）か平準化後（`on`）か。既定 `off`（平準化日程は再計算のたびに動きBacklogが荒れるため） |
| `pushGroups` | WBSグループを親課題として作るか（`true` 推奨。`false` ならリーフのみ登録） |
| `issues` | **同期キャッシュ**。Scheduler `task.id` → Backlog 課題キー。一次情報は課題説明欄のマーカー（下記）で、このキャッシュは速度用。壊れても復元できる |
| `syncedAt` | 最終同期時刻（ISO 8601） |

設定ファイルが無ければ、`space` / `projectKey` / 種別 / ステータス対応をユーザーに聞いて新規作成する。
`bee issue-type list -p <key> --json` と `bee status list -p <key> --json` の出力を見せて選ばせるとよい。

## ID対応の考え方

- **一次情報**: Backlog 課題の説明欄末尾に埋め込む HTML コメントマーカー `<!-- ps:<task.id> -->`。
  課題本文を編集しても残る。push で新規作成・更新するたびにこの行を必ず含める。
- **キャッシュ**: `<file>.backlog.json` の `issues`。push/pull の前に、必要なら
  `bee issue list -p <key> -k "ps:" --json`（または全件取得）で説明欄マーカーを走査して再構築できる。
- キャッシュとマーカーが食い違ったら**マーカーを正**とし、キャッシュを更新してユーザーに報告する。

## bee コマンド早見表

出力は `--json [fields]` で構造化取得する（`-y` で確認プロンプトを省略）。

```
bee auth status
bee project users   -p <key> --json                 # ユーザーID解決
bee issue-type list -p <key> --json                 # 種別ID解決
bee status list     -p <key> --json                 # ステータスID解決
bee issue list      -p <key> --json -L 100 --offset <n> [-k ps:]  # 既存課題の取得（ページング）
bee issue view      <issueKey> --json               # 1件の現在値・数値ID
bee issue create    -p <key> --type <id> --priority <name> -t <title> \
                    -d <desc> [--assignee <id>] [--parent-issue <id>] \
                    [--start-date <YYYY-MM-DD>] [--due-date <YYYY-MM-DD>] -y --json issueKey
bee issue edit      <issueKey> [-t <title>] [-d <desc>] [--status <id>] \
                    [--assignee <id>] [--start-date <date>] [--due-date <date>] \
                    [--parent-issue <id>] -y --json
bee issue comment   <issueKey> -b <text> -y         # 変更理由を残す場合
```

注意:
- **非対話で使う。** `bee issue create` は必須項目（`-p` / `--type` / `--priority` / `-t`）が
  欠けると対話プロンプトで停止する。作成時は常に4つとも渡す。`-y` は確認省略であって
  必須項目の補完はしない。
- `bee issue create` に `--status` は無い。新規は必ず「未対応」で作られるので、`progress > 0` の
  タスクは作成後に `bee issue edit --status <id>` を続けて実行する。
- 作成結果は `--json issueKey` で受け取り、返った課題キーを `<file>.backlog.json` の `issues` に記録する。
- `--assignee` はユーザーID（数値）か `@me` のみ。名前は不可。必ず `users` マップ経由で解決する。
- `--type` / `--status` / `--parent-issue` は数値ID。`issueType` / `statusByProgress` の名前、
  および親課題キー（`PSDEMO-11`）は実行時に `bee … list --json` / `bee issue view <key> --json id`
  で数値IDへ解決する。
- `bee issue list` の既定件数は20。全件走査するときは `-L 100` ＋ `--offset` でページングする。

## Backlog 側の制約（重要）

- **親子は1階層のみ。** 子課題はさらに子を持てない。WBSが3階層以上の場合、
  各リーフは「マップ済みの最も近い祖先グループ」の子にする。Backlog が入れ子を拒否したら、
  マップ済みの**最上位**祖先グループの子として作り、課題名の頭にWBSパス
  （例: `[設計 / API] 認証エンドポイント`）を付けて階層を示す。方針をユーザーに一度確認する。
- **Backlog の「マイルストーン」はプロジェクト単位のリリース枠**（`bee milestone`）で、課題ではない。
  Scheduler のマイルストーンタスクは「マイルストーン種別の課題（期限日 = 開始日）」として登録する。
  `issueType.milestone` で種別名を指定する。
- 課題の**削除はしない**。Scheduler から消えたタスクに対応する課題は「孤児」として一覧提示し、
  ユーザーが Backlog 側で手動対応する（またはコメントで「Schedulerから削除済み」と残す）。

## マッピング規約

要点は下表。プロジェクト固有の対応（種別名・ステータス名・ユーザー・特殊ルール）は
`references/mapping.md` に記録し、`<file>.backlog.json` に反映する。

| Backlog | Scheduler 側のソース |
| --- | --- |
| 件名 | `recalc` の `name`（階層フラット化時はWBSパスを前置） |
| 説明 | `tasks[].notes` ＋ 改行 ＋ `<!-- ps:<id> -->` マーカー |
| 種別 | 固定マイルストーン → `issueType.milestone` / グループ → `issueType.group` / それ以外 → `issueType.task` |
| 親課題 | `parentId`（Backlog制約に従って最も近いマップ済み祖先へ寄せる） |
| 開始日 | `recalc` の `schedStart` |
| 期限日 | `recalc` の `schedFinish`（マイルストーンは `schedStart` と同日） |
| 担当者 | `assigneeId` → `users` マップ → Backlog ユーザーID（未対応の担当者は未設定＋警告） |
| ステータス | `progress` → `statusByProgress`（push）／ `progressByStatus` → `progress`（pull） |

`critical` / `float` は既定では同期しない（必要ならユーザー合意のうえで説明欄やコメントに付記）。

## ワークフローA: Scheduler → Backlog（push）

1. **前提確認**: `bee auth status` を確認。`<file>.backlog.json` を読む（無ければ作る）。
2. **整合性チェック**: `node <SCHED_CLI> validate <file>`。`error` があれば先に
   `schedule-adjust` で解消してもらう（このスキルは中断）。
3. **スケジュール取得**: `node <SCHED_CLI> recalc <file> --leveling <leveling値>`。
   `tasks[]`（`id`/`name`/`isGroup`/`milestone`/`milestoneMode`/`assigneeId`/`progress`/
   `schedStart`/`schedFinish`）と `projectEnd` を得る。
4. **ID解決**: `bee project users --json` / `bee issue-type list --json` / `bee status list --json`
   で名前→ID表を作る。`users` マップに無い担当者、`issueType` に無い種別があれば警告して確認。
5. **既存課題の突き合わせ**: `issues` キャッシュ＋（必要なら）`bee issue list -p <key> --json` の
   説明欄マーカーで、各タスクを「新規／更新（差分あり）／変更なし／孤児」に分類する。
   - `pushGroups: false` ならグループは対象外。
6. **差分レポート提示**: 日本語の表で次を必ず見せる。
   - 新規作成する課題（件名・種別・親・開始日・期限日・担当・初期ステータス）
   - 更新する課題（課題キー・変わるフィールドの before → after）
   - 変更なしの件数
   - 孤児課題（課題キー・件名）※削除はしない旨も明記
   - `projectEnd`（＝Backlog上の最終期限になる想定日）
   - `recalc` の `sprintConflicts` / `levelWarnings` に該当があれば併記
7. **承認**: `AskUserQuestion` で「この内容で Backlog に反映しますか？」。
8. **実行**（承認後のみ）:
   - 親を持つ課題より先に、親になるグループ課題を作成する（トポロジカル順）。
   - 新規: `bee issue create … -y --json issueKey` → 返った課題キーを控える →
     `progress > 0` なら続けて `bee issue edit <key> --status <id> -y`。
   - 更新: `bee issue edit <key> …変わるフィールドのみ… -y`。
   - すべて `-d`（説明）に `<!-- ps:<id> -->` マーカーを含める。
   - 失敗した課題は記録し、続行できるものは続行。最後にまとめて報告。
9. **キャッシュ更新**: `<file>.backlog.json` の `issues` と `syncedAt` を更新して `Write`。
10. **報告**: 作成N件／更新M件／失敗K件／孤児L件。Backlog のプロジェクトURLを添える。

## ワークフローB: Backlog → Scheduler（pull）

Backlog 側で動くのは基本的に**進捗（ステータス）**だけ。日程は Scheduler が正。

1. **前提確認**: `bee auth status`、`<file>.backlog.json` を読む。
2. **課題取得**: `bee issue list -p <key> --json`（必要に応じてページング）。
   各課題の説明欄マーカー `<!-- ps:<id> -->` で Scheduler タスクに対応づける。
3. **進捗の変換**: 課題ステータス名 → `progressByStatus` → `progress` 値。
   「処理中」を何%で取り込むかは、ユーザーに一度確認して `progressByStatus` に固定する。
   - 着手済みの**実開始日**も取り込む場合のみ、課題の開始日を `startDate` に反映する（要確認）。
4. **編集ファイル作成**: `<file>` をコピーした作業ファイル（例 `<file>.edited.json`）を作り、
   対応するタスクの `progress`（と合意した場合 `startDate`）だけ書き換える。
   **`schedFinish` など計算結果は書き戻さない。**
5. **ここから `schedule-adjust` の標準ワークフローに合流**:
   `node <SCHED_CLI> plan <file> <file>.edited.json` → レポート提示 → `AskUserQuestion` →
   承認後 `proposed` を元パスへ `Write`。
6. **報告**: 進捗を更新したタスク一覧、`projectEnd` の before → after、
   新たに発生したスプリント矛盾・平準化警告、追加された「調整前」スナップショット名。
7. アプリへの反映方法（`?schedule=` 関連付け済みならリロード、未関連付けなら「読み込み」）を案内。

## 双方向で食い違ったとき

同じタスクが Scheduler 側でも Backlog 側でも変わっている場合は**自動マージしない**。
該当タスクを一覧にして、どちらを優先するかユーザーに個別確認する。

## 注意

- `project_scheduler.html` と `docs/json-format.md` は触らない（ビルド成果物）。
- `<file>.backlog.json` は Project Scheduler の JSON スキーマ外。アプリのインポート対象ではない。
- `bee` の `-y` は確認プロンプトの省略であって、**このスキルの承認ステップの省略ではない**。
  `AskUserQuestion` での承認を必ず先に取る。
- スペース／プロジェクトキーは `SKILL.md` に埋め込まない。`<file>.backlog.json` か
  実行時のユーザー入力、または環境変数（`BACKLOG_SPACE` / `BACKLOG_PROJECT` / `BACKLOG_API_KEY`）で渡す。
