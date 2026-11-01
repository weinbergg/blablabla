/* eslint-disable @typescript-eslint/no-require-imports */
// Only a disposable DB from prepare-browser; settings and fixture roles restored in finally.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if(!process.env.BLABLA_TEST_FIXTURES)throw Error('Set BLABLA_TEST_FIXTURES');
const fixturePath=process.env.BLABLA_TEST_FIXTURES,f=JSON.parse(fs.readFileSync(fixturePath,'utf8')),out=path.dirname(fixturePath);
if(path.basename(out).startsWith('blabla-browser-')===false || path.resolve(f.databasePath)!==path.join(path.resolve(out),'test.db'))throw Error('Disposable browser copy required');
const base=process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100';if(new URL(base).hostname!=='127.0.0.1')throw Error('Local only');
(async()=>{const db=new Database(f.databasePath),old=db.prepare("SELECT value FROM site_settings WHERE key='feature_flags'").get();const role=db.prepare('SELECT role FROM users WHERE id=?').get(f.users.c.id).role;db.prepare("UPDATE users SET role='admin' WHERE id=?").run(f.users.c.id);const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true});try{
 const admin=await browser.newContext(),reader=await browser.newContext();for(const [ctx,u]of[[admin,f.users.c],[reader,f.users.a]])await ctx.addCookies([{name:'blabla_session',value:u.token,domain:'127.0.0.1',path:'/'}]);const p=await admin.newPage(),q=await reader.newPage();p.setDefaultTimeout(30000);q.setDefaultTimeout(30000);
 await p.goto(base+'/admin/features');await p.getByLabel('Каналы',{exact:true}).selectOption('off');await p.getByRole('button',{name:'Сохранить доступность'}).click();await p.getByRole('status').filter({hasText:'Настройки сохранены'}).waitFor();
 assert.equal((await reader.request.get(base+'/api/channels/mine')).status(),403);assert.equal((await admin.request.get(base+'/api/channels/mine')).status(),403);
 await q.goto(base+'/channels');await q.getByRole('heading',{name:'Этот раздел пока недоступен'}).waitFor();assert.equal(await q.locator('header').getByRole('link',{name:'Каналы',exact:true}).count(),0);
 await q.goto(base+'/documents/'+f.txt.id);await q.locator('[data-txt-page]').first().waitFor();assert.equal(await q.locator('[data-reader-selection-ui]').getByText('Цитировать в канале').count(),0);
 await p.getByLabel('Каналы',{exact:true}).selectOption('testers');await p.getByLabel('Тестировщики',{exact:true}).fill(f.users.a.id);await p.getByRole('button',{name:'Сохранить доступность'}).click();await p.getByRole('status').filter({hasText:'Настройки сохранены'}).waitFor();assert.equal((await reader.request.get(base+'/api/channels/mine')).status(),200);await q.goto(base+'/channels/'+f.channel.slug);await q.getByRole('heading',{name:f.channel.title,exact:true}).waitFor();
 await p.getByLabel('Комментарии',{exact:true}).selectOption('off');await p.getByRole('button',{name:'Сохранить доступность'}).click();await p.getByRole('status').filter({hasText:'Настройки сохранены'}).waitFor();assert.equal((await reader.request.post(base+'/api/comments',{data:{documentId:f.txt.id,body:'Must not be stored'}})).status(),403);
 async function mode(label, value) { await p.getByLabel(label,{exact:true}).selectOption(value); await p.getByRole('button',{name:'Сохранить доступность'}).click(); await p.getByRole('status').filter({hasText:'Настройки сохранены'}).waitFor(); }
 await mode('Каналы','admins'); assert.equal((await reader.request.get(base+'/api/channels/mine')).status(),403); assert.equal((await admin.request.get(base+'/api/channels/mine')).status(),200);
 await mode('Каналы','on'); assert.equal((await reader.request.get(base+'/api/channels/mine')).status(),200);
 for(const [label,route,api] of [['Новостная лента','/news',null],['Форум','/discuss','/api/forum/topics'],['Читательские комнаты','/seminars','/api/seminars/nonexistent'],['Программы ведущих','/hosts/dashboard',null]]) {
   await mode(label,'off'); await q.goto(base+route); await q.getByRole('heading',{name:'Этот раздел пока недоступен'}).waitFor();
   if(api) assert.equal((await reader.request.get(base+api)).status(),403,label+' API must be gated before lookup');
   await mode(label,'on');
 }
 await mode('Создание каналов','off'); assert.equal((await reader.request.post(base+'/api/channels',{data:{}})).status(),403); await mode('Создание каналов','on');
 await mode('Создание комнат','off'); assert.equal((await reader.request.post(base+'/api/seminars',{data:{}})).status(),403); await mode('Создание комнат','on');
 await mode('Экспериментальные функции','off'); assert.equal((await(await admin.request.get(base+'/api/features')).json()).experimental,false);
 await q.goto(base+'/library'); await q.locator('main').waitFor(); assert.equal(await q.getByRole('heading',{name:'Этот раздел пока недоступен'}).count(),0);
 await q.goto(base+'/login'); assert.equal((await q.title()).includes('404'),false);
 await p.reload(); await p.getByLabel('Экспериментальные функции',{exact:true}).waitFor(); assert.equal(await p.getByLabel('Экспериментальные функции',{exact:true}).inputValue(),'off');
 for(const width of [1440,1024,768,430,390,375,320]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,'flags-'+width+'.png'),fullPage:true});}
 fs.writeFileSync(path.join(out,'features-results.json'),JSON.stringify({ok:true,checks:['admin form','off includes admins','testers/admins/on restored','direct URLs and APIs: channels/feed/forum/rooms/hosts','creation gates','experimental setting persisted','library/auth/admin remain accessible','seven widths']}));console.log('Feature browser checks passed');
 }finally{if(old)db.prepare("UPDATE site_settings SET value=? WHERE key='feature_flags'").run(old.value);else db.prepare("DELETE FROM site_settings WHERE key='feature_flags'").run();db.prepare('UPDATE users SET role=? WHERE id=?').run(role,f.users.c.id);db.close();await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
