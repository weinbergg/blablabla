/* eslint-disable @typescript-eslint/no-require-imports */
// Requires a separately launched app using the database from prepare-browser.cjs.
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Browser regression tests only allow local 127.0.0.1');
if (!process.env.BLABLA_TEST_FIXTURES) throw new Error('Set BLABLA_TEST_FIXTURES to an isolated fixture JSON');
const artifactDir = require('path').dirname(process.env.BLABLA_TEST_FIXTURES);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const ts=require('typescript');
const assert=require('node:assert/strict');
const {mouseSelect}=require('./support/reader-gestures.cjs');
const fixtures=JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES,'utf8'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.addCookies([{name:'blabla_session',value:fixtures.users.a.token,domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage();const results=[];
 await page.route('**/api/lookup?**',r=>r.fulfill({json:{lemma:'test',definitions:[],parses:[],glossaryHits:[]}}));
 const src=ts.transpileModule(fs.readFileSync(require('path').resolve(__dirname,'../lib/reader-selection.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 await page.setContent('<div id="reader" style="position:relative;margin:40px;width:500px;height:400px"><p id="text">A selectable text passage.</p><div data-annotation-ui><p id="comment">Comment is not book text</p></div><iframe srcdoc="<p>First EPUB frame</p>"></iframe><iframe srcdoc="<p>Second EPUB frame</p>"></iframe></div><p id="outside">Outside the reader</p>');
 await page.addScriptTag({content:'window.readerSelection = (() => {const exports = {};'+src+'; return exports;})()'});
 results.push(await page.evaluate(()=>{
  const container=document.querySelector('#reader');
  function choose(el){const doc=el.ownerDocument;const r=doc.createRange();r.selectNodeContents(el);const s=doc.defaultView.getSelection();s.removeAllRanges();s.addRange(r);}
  choose(document.querySelector('#text'));const text=window.readerSelection.captureSelectionAnchor(container);
  if(text?.text!=='A selectable text passage.')throw Error('plain capture');
  choose(document.querySelector('#comment'));if(window.readerSelection.captureSelectionAnchor(container))throw Error('comment scope leaked');
  choose(document.querySelector('#outside'));if(window.readerSelection.captureSelectionAnchor(container))throw Error('outside scope leaked');
  const docs=[...document.querySelectorAll('iframe')].map(f=>f.contentDocument);choose(docs[1].querySelector('p'));
  const epub=window.readerSelection.captureSelectionAnchor(container,docs);
  if(epub?.text!=='Second EPUB frame')throw Error('second frame selection failed');
  if(epub.rects.some(r=>r.x<0||r.y<0||r.x+r.w>1000.01||r.y+r.h>1000.01))throw Error('invalid normalized bounds');
  return {test:'DOM selection scope, second iframe and normalized rects',ok:true};
 }));
 for(const format of (process.env.BLABLA_READER_FORMATS?.split(',') || ['txt','pdf','epub'])){
  await page.goto(base+'/documents/'+fixtures[format].id+'?page=1',{waitUntil:'networkidle',timeout:120000});
  await page.getByRole('button',{name:/Добавить пометку/}).first().waitFor({timeout:60000});
  let frame=page, selector=format==='txt'?'[data-txt-page="1"] pre':'.textLayer span';
  if(format==='epub'){
    await page.locator('iframe').first().waitFor({timeout:60000});
    for(let i=0;i<30;i++){frame=await (await page.locator('.epub-container iframe').first().elementHandle())?.contentFrame();if(frame&&await frame.locator('body').count())break;await page.waitForTimeout(200);}
    selector='body';
  }
  await frame.locator(selector).first().waitFor({timeout:60000});
  await frame.locator(selector).first().scrollIntoViewIfNeeded();
  // Actual pointer selection; the DOM-only unit scope checks above remain separate.
  if(format==='epub')await page.locator('.epub-container').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const {selected}=await mouseSelect(page,frame,format==='pdf'?'.textLayer':selector,{slow:true,onHold:async()=>assert.equal(await page.locator('[data-reader-selection-ui]').count(),0,'menu must wait for pointer release')});
  assert(selected.trim().length>3,format+' native selection');
  await page.locator('[data-reader-selection-ui]').waitFor({timeout:10000});
  assert((await page.locator('[data-reader-selection-ui]').innerText()).includes(selected.trim()),format+' lookup text');
  await page.getByRole('button',{name:'Пометка к фрагменту',exact:true}).click();
  await page.getByRole('button',{name:/Отменить добавление пометки/}).first().waitFor();
  await page.waitForTimeout(300);
  if(format==='txt')await page.locator('[data-txt-page="1"]').click({position:{x:140,y:100}});
  else if(format==='pdf')await page.locator('.textLayer').first().click({position:{x:140,y:100}});
  else { const box=await page.locator('.epub-container').boundingBox(); await page.mouse.click(box.x+140,box.y+100); }
  const draft=page.locator('[data-annotation-ui]').filter({hasText:'Новая пометка'});
  await draft.waitFor({timeout:10000});
  assert((await draft.innerText()).includes(selected.trim()),format+' draft retained anchor');
  await draft.locator('textarea').fill('Reader regression check '+format);
  await page.route('**/api/annotations', r => r.fulfill({status:500,json:{error:'Проверочный отказ сохранения'}}));
  await draft.getByRole('button',{name:'Сохранить',exact:true}).click();
  await draft.getByRole('alert').waitFor();
  assert.equal(await draft.locator('textarea').inputValue(),'Reader regression check '+format);
  assert(await draft.getByRole('button',{name:'Сохранить',exact:true}).isEnabled());
  await page.unroute('**/api/annotations');
  const req=page.waitForRequest(r=>r.url().endsWith('/api/annotations')&&r.method()==='POST');
  const res=page.waitForResponse(r=>r.url().endsWith('/api/annotations')&&r.request().method()==='POST');
  await draft.getByRole('button',{name:'Сохранить',exact:true}).click();
  const body=(await req).postDataJSON();assert.equal(body.anchorText,selected.trim(),format+' saved quote');assert(body.anchorRects.length>0);
  const response=await res;assert(response.ok(),format+' save returned '+response.status());
  const saved=await response.json();
  await page.goto(base+'/documents/'+fixtures[format].id+'?page='+body.page+'#annotation-'+saved.id,{waitUntil:'networkidle'});
  const pin=page.locator('#annotation-'+saved.id);
  const opened=pin.locator('[data-annotation-ui]');
  await opened.waitFor({timeout:30000});
  assert((await opened.innerText()).includes(selected.trim()),format+' reloaded source quote');
  await opened.getByRole('button',{name:'Изменить',exact:true}).click();
  await opened.locator('textarea').fill('Reader regression check '+format+' edited');
  const updated=page.waitForResponse(r=>r.url().endsWith('/api/annotations/'+saved.id)&&r.request().method()==='PUT');
  await opened.getByRole('button',{name:'Сохранить',exact:true}).click();
  assert((await updated).ok(),format+' edit persisted');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#annotation-'+saved.id+' [data-annotation-ui]').waitFor({timeout:30000});
  assert((await page.locator('#annotation-'+saved.id).innerText()).includes('Reader regression check '+format+' edited'));
  results.push({test:format+' failed save retained draft, reload deep link and edit persisted',ok:true});
  results.push({test:format+' selection → placement → saved anchor',ok:true});console.log(format+' saved anchor OK');
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.waitForTimeout(700);const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);assert(scrollWidth<=width,format+' overflow '+width+' / '+scrollWidth);const bounds=await page.locator('#annotation-'+saved.id+' [data-annotation-ui]').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width,format+' popup horizontal bounds');await page.screenshot({path:require('path').join(artifactDir,format+'-popup-'+width+'.png')});results.push({test:format+' width '+width,ok:true});}
  await page.setViewportSize({width:1366,height:900});
  await context.request.delete(base+'/api/annotations/'+saved.id);
 }
 fs.writeFileSync(require('path').join(artifactDir,'reader-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
