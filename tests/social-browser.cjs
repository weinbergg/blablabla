/* eslint-disable @typescript-eslint/no-require-imports */
// Use only a disposable database created by tests/support/prepare-browser.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixturePath = process.env.BLABLA_TEST_FIXTURES;
if (!fixturePath) throw new Error('Set BLABLA_TEST_FIXTURES to the isolated fixture JSON');
const f = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const out = path.dirname(fixturePath);
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Browser checks only allow local 127.0.0.1');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,headless:true});try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'blabla_session',value:f.users.a.token,domain:'127.0.0.1',path:'/'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
 await page.goto(base+'/channels/'+f.channel.slug+'/write',{waitUntil:'networkidle',timeout:120000});await page.locator('.tiptap').waitFor({timeout:60000});
 await page.getByLabel('Заголовок публикации').fill('Читать — значит вступать в разговор');
 await page.locator('.tiptap').fill('Мы возвращаемся к хорошей книге не ради готовых ответов. Она помогает точнее задать вопрос и услышать собеседника.');
 await page.getByRole('button',{name:'Книга',exact:true}).click();await page.getByLabel('Найти книгу').fill(f.txt.title.slice(0,22));await page.getByRole('dialog').getByRole('button').filter({hasText:f.txt.title}).first().click();
 await page.waitForTimeout(2200);await page.getByText('Черновик сохранён',{exact:true}).waitFor({timeout:20000});const draftId=new URL(page.url()).searchParams.get('post');assert(draftId);
 await page.reload({waitUntil:'networkidle'});await page.locator('.tiptap').waitFor();assert((await page.locator('.tiptap').innerText()).includes('точнее задать вопрос'));
 const guest=await browser.newContext();assert.equal((await guest.request.get(base+'/api/channels/posts/'+draftId)).status(),404);
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();await page.getByRole('dialog').getByText('Читать — значит вступать в разговор',{exact:true}).waitFor();await page.getByLabel('Закрыть предпросмотр').click();
 await page.getByRole('button',{name:'Опубликовать',exact:true}).click();await page.waitForURL(url=>!url.pathname.endsWith('/write'),{timeout:30000});await page.getByRole('heading',{name:'Читать — значит вступать в разговор',exact:true}).waitFor();
 await page.getByLabel('Комментарий к публикации').fill('Важнее всего — внимание к чужому голосу.');await page.getByRole('button',{name:'Отправить',exact:true}).click();await page.getByText('Важнее всего — внимание к чужому голосу.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Нравится',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Нравится"]')?.getAttribute('aria-pressed')==='true');await page.getByRole('button',{name:'Сохранить публикацию',exact:true}).click();await page.getByRole('button',{name:'Убрать из сохранённого',exact:true}).waitFor();await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:'Убрать из сохранённого',exact:true}).getAttribute('aria-pressed'),'true');
 const publishedUrl=page.url();await page.goto(base+'/channels/'+f.channel.slug+'/write',{waitUntil:'networkidle'});await page.locator('.tiptap').waitFor();assert.equal(await page.getByLabel('Заголовок публикации').inputValue(),'');await page.waitForTimeout(2300);assert.equal((await (await context.request.get(base+'/api/channels/posts/'+draftId)).json()).published,1);await page.goto(publishedUrl,{waitUntil:'networkidle'});
 results.push({test:'editor draft autosave/reload, private draft, preview, publication, comments, likes and saved persistence',ok:true});
 for(const role of ['moderator','editor','admin']){let r=await context.request.post(base+'/api/channels/'+f.channel.id+'/moderators',{data:{userId:f.users.b.id,role}});assert.equal(r.status(),200);const other=await browser.newContext();await other.addCookies([{name:'blabla_session',value:f.users.b.token,domain:'127.0.0.1',path:'/'}]);r=await other.request.patch(base+'/api/channels/posts/'+draftId,{data:{title:'Читать — значит вступать в разговор'}});assert.equal(r.status(),role==='moderator'?403:200);r=await other.request.post(base+'/api/channels/'+f.channel.id+'/moderators',{data:{userId:f.users.c.id,role:'admin'}});assert.equal(r.status(),403);await other.close();}
 await context.request.post(base+'/api/channels/'+f.channel.id+'/moderators',{data:{userId:f.users.b.id,revoke:true}});results.push({test:'server role boundaries and admin appointment protections',ok:true});
 const sizes=[1440,1024,768,390,320];for(const width of sizes){await page.setViewportSize({width,height:1000});for(const route of ['/channels/'+f.channel.slug,'/news','/channels/'+f.channel.slug+'?tab=settings']){await page.goto(base+route,{waitUntil:'networkidle'});const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(dimensions.scroll<=width+1,route+' overflow '+JSON.stringify(dimensions));await page.screenshot({path:out+'/'+(route.includes('settings')?'settings':route==='/news'?'feed':'channel')+'-'+width+'.png',fullPage:true});}}
 results.push({test:'channel/feed/settings horizontal bounds at five viewport widths',ok:true});assert.deepEqual(errors,[]);fs.writeFileSync(out+'/social-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
