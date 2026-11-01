/* eslint-disable @typescript-eslint/no-require-imports */
// Use only a disposable database created by tests/support/prepare-browser.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { mouseSelect } = require('./support/reader-gestures.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixturePath = process.env.BLABLA_TEST_FIXTURES;
if (!fixturePath) throw new Error('Set BLABLA_TEST_FIXTURES to the isolated fixture JSON');
const f = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const out = path.dirname(fixturePath);
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Browser checks only allow local 127.0.0.1');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,headless:true});try{
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'blabla_session',value:f.users.a.token,domain:'127.0.0.1',path:'/'}]);const p=await context.newPage();p.setDefaultTimeout(90000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/lookup?**',r=>r.fulfill({json:{lemma:'',definitions:[],parses:[],glossaryHits:[]}}));const results=[];
for(const format of ['txt','pdf','epub']){
 await p.goto(base+'/documents/'+f[format].id+'?page=1',{waitUntil:'domcontentloaded',timeout:120000});let frame=p;let selector=format==='txt'?'[data-txt-page="1"] pre':'.textLayer span';
 if(format==='epub'){await p.locator('.epub-container iframe').first().waitFor();frame=await(await p.locator('.epub-container iframe').first().elementHandle()).contentFrame();selector='body';}
 await frame.locator(selector).first().waitFor();await p.locator(format==='epub'?'.epub-container':selector).first().scrollIntoViewIfNeeded();
 await p.getByRole('button',{name:/Добавить пометку/}).first().waitFor();
 await p.waitForTimeout(500);
 const selected=(await mouseSelect(p,frame,selector,{slow:true})).selected.trim();assert(selected);
 await p.locator('[data-reader-selection-ui]').waitFor({timeout:5000}).catch(async e=>{await p.screenshot({path:out+'/anchor-native-failure.png',fullPage:true});console.log(format,selected,await p.locator('.reader-stage').innerText());throw e;});
 await p.getByRole('button',{name:'Цитировать в канале',exact:true}).click({timeout:5000}).catch(async e=>{await p.screenshot({path:out+'/anchor-native-failure.png',fullPage:true});console.log(format,selected,await p.locator('[data-reader-selection-ui]').innerText(),await(await context.request.get(base+'/api/features')).json());throw e;});await p.getByLabel('Комментарий к цитате').fill('К этому фрагменту хочется вернуться и обсудить его вместе.');await p.locator('[data-reader-selection-ui]').getByRole('button').filter({hasText:'На полях прочитанного'}).click();await p.waitForURL(u=>u.pathname.endsWith('/write'),{timeout:120000});await p.getByLabel('Заголовок публикации').fill('Заметка на полях — '+format.toUpperCase());await p.getByRole('button',{name:'Опубликовать',exact:true}).click();await p.waitForURL(u=>!u.pathname.endsWith('/write'),{timeout:120000});
 const source=p.locator('a[href*="#quote="]').first();await source.waitFor();const href=await source.getAttribute('href');const anchor=JSON.parse(decodeURIComponent(href.split('#quote=')[1]));assert.equal(anchor.exact,selected);assert(anchor.textVersion.startsWith('sha256:'));if(format==='epub')assert(anchor.cfi,'EPUB must carry CFI');
 await p.goto(base+href,{waitUntil:'domcontentloaded',timeout:120000});await p.locator('[data-anchor-status]').filter({hasText:'Цитата найдена в тексте.'}).waitFor({timeout:120000});await p.screenshot({path:out+'/anchor-'+format+'.png',fullPage:true});
 if(format==='txt'){const bad={...anchor,exact:'A deliberately missing exact quotation, 958294.'};await p.goto(base+'/documents/'+f.txt.id+'#quote='+encodeURIComponent(JSON.stringify(bad)),{waitUntil:'domcontentloaded'});await p.locator('[data-anchor-status]').filter({hasText:'Точное место цитаты не найдено'}).waitFor();}
 results.push({format,ok:true,checks:['selection','comment','channel publication','versioned source','exact text location']});console.log(format+' anchor passed');
}
assert.deepEqual(errors,[]);fs.writeFileSync(out+'/anchors-results.json',JSON.stringify(results,null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
