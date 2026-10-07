import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
test('dependency edits and recalculation feedback', async ({ page, context }, testInfo) => {
 test.setTimeout(120000);
 const output = testInfo.outputPath('evidence');
 await mkdir(output, { recursive: true });
 await page.setViewportSize({ width: 1600, height: 950 });
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const leaf=(id,name,order,extra={})=>({id,name,parentId:null,order,duration:2,startDate:'2026-10-06',progress:0,assigneeId:null,sprintIds:[],predecessors:[],...extra});
const base={tasks:[leaf('a','検証用: 設計',0),leaf('b','検証用: 実装',1,{predecessors:[{id:'a',type:'FS',lag:0}]}),leaf('c','検証用: レビュー',2)],resources:[],sprints:[],calendarExceptions:[],levelingOn:false};
const url='http://127.0.0.1:4173/project_scheduler.html';
await page.goto(url);
async function load(data,locale='ja'){
 await page.evaluate(({data,locale})=>{localStorage.clear();localStorage.setItem('pm_project',JSON.stringify(data));localStorage.setItem('pm_ui_locale',JSON.stringify(locale));},{data,locale});
 await page.reload(); await page.locator('[data-wbs-cell="a:name"]').waitFor();
}
const cell=(id,col)=>page.locator(`[data-wbs-cell="${id}:${col}"]`);
const run=()=>page.getByRole('button',{name:'自動スケジューリング実行',exact:true}).click();
const result=()=>page.getByRole('region',{name:'再計算結果',exact:true});
async function expectSavedDeps(id, expected){
 await expect(page.getByTestId('save-status')).toHaveText('このブラウザに保存済み');
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('pm_project')).tasks.find(t=>t.id===id).predecessors,id)).toEqual(expected);
}
await load(base);
await cell('b','predecessors').fill('1SS, 99FS'); await cell('b','predecessors').press('Tab');
assert.equal(await cell('b','predecessors').inputValue(),'1SS, 99FS');
assert.equal(await cell('b','predecessors').getAttribute('aria-invalid'),'true');
assert.match(await page.getByRole('alert').innerText(),/99/);
await expectSavedDeps('b',base.tasks[1].predecessors);
await cell('c','name').fill('検証用: レビュー（他のセルを編集）');
assert.equal(await cell('b','predecessors').inputValue(),'1SS, 99FS');
await page.screenshot({path:`${output}/invalid-dependency-ja.png`});
await cell('b','predecessors').fill('bad');await cell('b','predecessors').press('Tab');
assert.match(await page.getByRole('alert').innerText(),/書式/);
await expectSavedDeps('b',base.tasks[1].predecessors);
await cell('b','predecessors').fill('1SS-1, 3FF+2');await cell('b','predecessors').press('Tab');
assert.equal(await cell('b','predecessors').getAttribute('aria-invalid'),null);
await expectSavedDeps('b',[{id:'a',type:'SS',lag:-1},{id:'c',type:'FF',lag:2}]);
await cell('b','predecessors').fill('');await cell('b','predecessors').press('Tab');
await expectSavedDeps('b',[]);
await cell('b','predecessors').fill('1SF+2');await cell('b','predecessors').press('Tab');
await expectSavedDeps('b',[{id:'a',type:'SF',lag:2}]);
// IME arrows do not move focus or commit intermediate text.
await cell('b','predecessors').focus();
await cell('b','predecessors').dispatchEvent('compositionstart');
await cell('b','predecessors').fill('あ');
await cell('b','predecessors').dispatchEvent('keydown',{key:'ArrowDown',code:'ArrowDown',isComposing:true});
assert.equal(await cell('b','predecessors').evaluate(el=>document.activeElement===el),true);
await cell('b','predecessors').dispatchEvent('compositionend');
await cell('b','predecessors').fill('1FS');await cell('b','predecessors').press('ArrowDown');
assert.equal(await cell('c','predecessors').evaluate(el=>document.activeElement===el),true);
// Native clipboard paste must remain editable, not be partially applied by the grid.
await context.grantPermissions(['clipboard-read','clipboard-write']);
await page.evaluate(()=>navigator.clipboard.writeText('1SS, 99FS'));
await cell('b','predecessors').focus();await cell('b','predecessors').press('Control+A');await page.keyboard.press('Control+V');
await cell('b','predecessors').press('Tab');
assert.equal(await cell('b','predecessors').inputValue(),'1SS, 99FS');
await expectSavedDeps('b',[{id:'a',type:'FS',lag:0}]);
// The invalid draft survives recalculation and never mutates the committed dependency.
await run();assert.equal(await cell('b','predecessors').inputValue(),'1SS, 99FS');
await load(base);
await run();assert.match(await result().innerText(),/開始日を変更したタスク: 1件/);
await expect(page.locator('[data-wbs-column="startDate"].font-bold')).toHaveCount(1);
assert.match(await result().innerText(),/未解決: 0件/);
await page.screenshot({path:`${output}/recalculation-success-ja.png`});
await run();await run();assert.match(await result().innerText(),/開始日を変更したタスク: 0件/);
await expect(page.locator('[data-wbs-column="startDate"].font-bold')).toHaveCount(0);
await cell('c','duration').fill('3');await expect(result()).toHaveCount(0);
await page.getByLabel('リソース平準化を有効にする',{exact:true}).check();await run();
assert.match(await result().innerText(),/リソース平準化 ON/);
await page.getByRole('button',{name:'再計算結果を閉じる'}).click();await expect(result()).toHaveCount(0);
const warnings={...base,tasks:[leaf('a','検証用: 循環A',0,{predecessors:[{id:'b',type:'FS',lag:0}]}),leaf('b','検証用: 循環B',1,{predecessors:[{id:'a',type:'FS',lag:0}]}),leaf('c','検証用: 10日間の作業',2,{duration:10,sprintIds:['s']}),leaf('d','検証用: 固定マイルストーン',3,{duration:0,milestone:true,milestoneMode:'fixed',fixedDate:'2026-10-07',predecessors:[{id:'c',type:'FS',lag:0}]})],sprints:[{id:'s',name:'検証用スプリント',startDate:'2026-10-06',endDate:'2026-10-07',order:0}]};
await load(warnings);await run();assert.match(await result().innerText(),/再計算完了・未解決の制約あり/);assert.match(await result().innerText(),/未解決: 3件/);
await page.getByText('対象タスクと理由を確認',{exact:true}).click();
await expect(result().locator('li')).toHaveCount(3);
await page.screenshot({path:`${output}/unresolved-constraints-ja.png`});
await result().getByRole('button').filter({hasText:'循環A'}).click();
assert.equal(await cell('a','name').isVisible(),true);
await page.getByLabel('表示言語',{exact:true}).selectOption('en');
await page.screenshot({path:`${output}/unresolved-constraints-en.png`});
assert.match(await page.getByRole('region',{name:'Recalculation result',exact:true}).innerText(),/Unresolved issues: 3/);
assert.deepEqual(errors,[]);
console.log('PASS: invalid/mixed input, correction, deletion, FS/SS/FF/SF, IME, keyboard navigation, native paste, unrelated edits, repeat runs, count/highlights, leveling, dismiss, issue details, JA/EN; no page errors.');
});
