/* eslint-disable @typescript-eslint/no-require-imports */
// Requires a separately launched app using the database from prepare-browser.cjs.
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Browser regression tests only allow local 127.0.0.1');
if (!process.env.BLABLA_TEST_FIXTURES) throw new Error('Set BLABLA_TEST_FIXTURES to an isolated fixture JSON');
const artifactDir = require('path').dirname(process.env.BLABLA_TEST_FIXTURES);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'), assert=require('node:assert/strict');
const D=require('better-sqlite3');
const fixtures=JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES,'utf8'));
const results=[];
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,headless:true});try{
const contexts={};for(const label of ['a','b','c']){contexts[label]=await browser.newContext({viewport:{width:1366,height:900}});await contexts[label].addCookies([{name:'blabla_session',value:fixtures.users[label].token,domain:'127.0.0.1',path:'/'}]);}
const p=await contexts.a.newPage();await p.route('**/api/lookup?**',r=>r.fulfill({json:{lemma:'',definitions:[],parses:[],glossaryHits:[]}}));
await p.goto(base+'/documents/'+fixtures.txt.id,{waitUntil:'networkidle'});
const form=p.locator('#discussion-compose'), input=form.locator('textarea');const message='Audit browser comment '+Date.now();
await input.fill(message);await p.route('**/api/comments',r=>r.fulfill({status:500,json:{error:'Проверочный сбой'}}));await form.getByRole('button',{name:'Отправить',exact:true}).click();await p.getByRole('alert').filter({hasText:'Проверочный сбой'}).waitFor();assert.equal(await input.inputValue(),message);assert(await input.isEnabled());
await p.reload({waitUntil:'networkidle'});assert.equal(await input.inputValue(),message);await p.unroute('**/api/comments');
await p.route('**/api/comments',r=>r.abort('failed'));await form.getByRole('button',{name:'Отправить',exact:true}).click();await p.getByRole('alert').filter({hasText:'Не удалось связаться'}).waitFor();assert.equal(await input.inputValue(),message);assert(await input.isEnabled());await p.unroute('**/api/comments');
const saved=p.waitForResponse(r=>r.url().endsWith('/api/comments')&&r.request().method()==='POST');await form.getByRole('button',{name:'Отправить',exact:true}).click();const savedResponse=await saved;assert.equal(savedResponse.status(),201);const {id}=await savedResponse.json();await p.locator('#comment-'+id).waitFor();assert.equal(await input.inputValue(),'');await p.reload({waitUntil:'networkidle'});await p.locator('#comment-'+id).waitFor();
const chat=p.locator('#comment-'+id);await chat.getByRole('button',{name:'Изменить',exact:true}).click();await chat.locator('textarea').fill(message+' edited');await chat.getByRole('button',{name:'Сохранить',exact:true}).click();await p.waitForFunction(text=>document.body.textContent.includes(text),message+' edited');
await chat.getByRole('button',{name:'Ответить',exact:true}).click();await p.getByPlaceholder('Ответить…',{exact:true}).fill('Audit browser reply '+id);const replyResponse=p.waitForResponse(r=>r.url().endsWith('/api/comments')&&r.request().method()==='POST');await p.getByRole('button',{name:'Отправить ответ',exact:true}).click();assert.equal((await replyResponse).status(),201);
await p.reload({waitUntil:'networkidle'});await chat.getByRole('button',{name:/^лист /}).click();
results.push({test:'comments HTTP/network failure, draft reload, save, edit, reply, reload and page link',ok:true});console.log('comments workflow OK');
const foreign=await contexts.c.request.patch(base+'/api/comments/'+id,{data:{body:'Unauthorized edit'}});assert.equal(foreign.status(),403);
const a=contexts.a.request;let resp=await a.post(base+'/api/channels',{data:{title:'Audit isolated channel',description:'Temporary test database only'}});assert([200,201].includes(resp.status()));const channel=await resp.json();const db=new D(fixtures.databasePath || require('path').join(artifactDir,'test.db'),{readonly:true});const cid=db.prepare('select id from channels where slug=?').get(channel.slug).id;db.close();
resp=await a.post(base+'/api/channels/'+cid+'/posts',{data:{title:'Audit source quote',body:'A saved book quotation with a link to its source.',documentId:fixtures.txt.id}});assert.equal(resp.status(),201);const post=await resp.json();
resp=await a.post(base+'/api/channels/'+cid+'/moderators',{data:{name:fixtures.users.b.name || 'Audit b'}});assert.equal(resp.status(),200);assert.equal((await resp.json()).userId,fixtures.users.b.id);
assert.equal((await contexts.b.request.patch(base+'/api/channels/posts/'+post.id,{data:{title:'Edited by delegated editor'}})).status(),200);
assert.equal((await contexts.c.request.patch(base+'/api/channels/posts/'+post.id,{data:{title:'Unauthorized'}})).status(),403);
await p.goto(base+'/channels/'+channel.slug,{waitUntil:'networkidle'});assert((await p.locator('body').innerText()).includes('Edited by delegated editor'));await p.reload({waitUntil:'networkidle'});assert((await p.locator('body').innerText()).includes('Edited by delegated editor'));
await a.post(base+'/api/channels/'+cid+'/moderators',{data:{revoke:true,userId:fixtures.users.b.id}});assert.equal((await contexts.b.request.patch(base+'/api/channels/posts/'+post.id,{data:{title:'Revoked'}})).status(),403);
results.push({test:'existing channel creation, linked book post, persisted edit and delegated/foreign/revoked permissions',ok:true});console.log('channel workflow OK');
const secret='Audit private discussion '+Date.now();resp=await a.post(base+'/api/annotations',{data:{documentId:fixtures.txt.id,page:1,x:500,y:500,body:'Privacy test',visibility:'public',allowDiscussion:true}});assert.equal(resp.status(),201);const ann=await resp.json();resp=await a.post(base+'/api/comments',{data:{documentId:fixtures.txt.id,annotationId:ann.id,body:secret}});assert.equal(resp.status(),201);assert.equal((await a.put(base+'/api/annotations/'+ann.id,{data:{visibility:'private'}})).status(),200);const guest=await browser.newContext();const html=await (await guest.request.get(base+'/documents/'+fixtures.txt.id)).text();assert(!html.includes(secret));assert((await (await a.get(base+'/documents/'+fixtures.txt.id)).text()).includes(secret));await guest.close();
results.push({test:'public-to-private annotation removes discussion from guest server payload',ok:true});console.log('privacy workflow OK');
resp=await a.post(base+'/api/annotations',{data:{documentId:fixtures.pdf.id,page:1,x:400,y:400,body:'Audit export note',visibility:'private'}});assert.equal(resp.status(),201);const exportNote=await resp.json();
await p.goto(base+'/documents/'+fixtures.pdf.id,{waitUntil:'networkidle'});const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'С пометками',exact:true}).click();const download=await downloadPromise;const expected=fixtures.pdf.title.replace(/(?:\.(?:pdf|epub|txt|zip|djvu|fb2|mobi|docx?|rtf))+$/i,'')+' (с пометками).pdf';assert.equal(download.suggestedFilename(),expected);await download.saveAs(require('path').join(artifactDir,'annotated-export.pdf'));const bytes=fs.readFileSync(require('path').join(artifactDir,'annotated-export.pdf'));assert(bytes.subarray(0,5).toString()==='%PDF-');
const {PDFDocument}=require('pdf-lib');const exported=await PDFDocument.load(bytes);assert(exported.getPageCount()>0);results.push({test:'real annotated PDF download, Unicode title filename and parseable PDF',ok:true,pages:exported.getPageCount()});console.log('export workflow OK');await a.delete(base+'/api/annotations/'+exportNote.id);
fs.writeFileSync(require('path').join(artifactDir,'workflow-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
