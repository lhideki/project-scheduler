# Backlog 同期マッピング（プロジェクトごとに記入）

`backlog-sync` スキルが使う、プロジェクト固有の対応表。ここで決めた内容を
`<保存JSONのパス>.backlog.json`（サイドカー設定ファイル）に反映する。

このファイル自体はテンプレート。実運用では対象プロジェクトごとに値を埋めて、
`<file>.backlog.json` と一緒にリポジトリ外（保存JSONの隣）へ置いてもよい。

---

## 1. 同期先

| 項目 | 値 | 備考 |
| --- | --- | --- |
| Backlog スペース | `example.backlog.com` | **全 `bee` コマンドに `-s <space>` を付ける**（`BACKLOG_SPACE` で export する場合も値の一致を確認） |
| プロジェクトキー | `PSDEMO` | 全 `bee` コマンドに `-p <key>`（`BACKLOG_PROJECT` でも可） |
| 認証 | `bee auth login` 済み | `BACKLOG_API_KEY` でも可 |

## 2. 課題種別（issue type）

`bee issue-type list -s <space> -p <key> --json` の `id` / `name` を確認して対応づける。

| Scheduler の種類 | Backlog 課題種別名 | 種別ID |
| --- | --- | --- |
| リーフタスク（`task`） | タスク | （実行時に解決） |
| WBSグループ（`group`） | タスク | （同上） |
| マイルストーン（`milestone: true`・`milestoneMode` 不問） | マイルストーン | （同上） |

- グループを課題化しない場合は `<file>.backlog.json` の `pushGroups: false`。
- 「マイルストーン」種別が無ければ作るか、`タスク` 種別＋課題名プレフィックスで代替。
- `milestoneMode`（`fixed` / `flexible`）は Scheduler 側の日程計算の挙動を決めるだけで、Backlog 課題種別には影響しない（どちらもマイルストーン種別）。

## 3. ステータス ↔ 進捗率

`bee status list -s <space> -p <key> --json` で ID を確認。

### push（Scheduler → Backlog）: `progress` → ステータス

| `progress` | Backlog ステータス |
| --- | --- |
| 0 | 未対応 |
| 1〜79 | 処理中 |
| 80〜99 | 処理済み |
| 100 | 完了 |

（記事の規約に準拠。`<file>.backlog.json` の `statusByProgress` に `upTo` 昇順で記述）

### pull（Backlog → Scheduler）: ステータス → `progress`

| Backlog ステータス | 取り込む `progress` |
| --- | --- |
| 未対応 | 0 |
| 処理中 | 50 ← **要決定**（着手＝何%扱いにするか） |
| 処理済み | 80 |
| 完了 | 100 |

（`<file>.backlog.json` の `progressByStatus`。カスタムステータスがあれば追記）

## 4. 担当者（resource ↔ Backlog user）

`bee project users -s <space> -p <key> --json` の `id` / `name` / `mailAddress` で突き合わせる。

| Scheduler `resources[].id` | Scheduler 表示名 | Backlog ユーザーID | Backlog 表示名 |
| --- | --- | --- | --- |
| `r-tanaka` | 田中 | `@me` | （自分） |
| `r-sato` | 佐藤 | `197201` | Sato |

- 対応が無い担当者のタスクは「担当者未設定」で作成し、レポートに警告を出す。
- 既存課題の担当者クリアは `bee` 1.1.1 では不可。Scheduler で担当を外しても Backlog 側の担当者は変えず、警告のみ出す。

## 5. 日程

| Backlog | ソース | 備考 |
| --- | --- | --- |
| 開始日 | `recalc` の `schedStart` | |
| 期限日 | `recalc` の `schedFinish` | マイルストーンは `schedStart` と同日 |
| 平準化 | `<file>.backlog.json` の `leveling`（既定 `off`） | `on` にすると再計算のたびに日程が動きうる |

Backlog 側で開始日・期限日を手編集する運用はしない（Scheduler が日程の正）。
pull で取り込むのは進捗のみ。

## 6. 階層フラット化ルール（WBS 3階層以上のとき）

Backlog の親子は1階層まで。以下の方針から選ぶ（既定: A）。

- **A**: 各リーフを「マップ済みの最も近い祖先グループ」の子にする。Backlog が入れ子を
  拒否したら最上位祖先の子にフォールバックし、課題名頭にWBSパス `[親 / 子] 件名` を付ける。
- **B**: グループを課題化せず（`pushGroups: false`）、全リーフをプロジェクト直下の課題にして
  カテゴリー（`--category`）でグルーピングする。

## 7. 特殊ルール（自由記入）

- 例: スプリント → Backlog マイルストーン（version）に対応させる場合はここに記述。
- 例: 特定グループは同期対象外にする、など。
