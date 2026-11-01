/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only smoke. Starts/stops only its own two children; never contacts the VPS.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname,'..');
const { root } = JSON.parse(fs.readFileSync(path.join(repo,'data/implementation-checks/test-environment-browser.json')));
require('../deploy/test/paths.cjs').testRoot(root);
if (!root.includes('/blabla-test-browser-')) throw Error('Disposable local browser instance required');
const out = path.join(repo,'data/implementation-checks/test-environment-browser'); fs.mkdirSync(out,{recursive:true,mode:0o700});
const credentials = JSON.parse(fs.readFileSync(path.join(root,'data/test-credentials.json')));
const marker = JSON.parse(fs.readFileSync(path.join(root,'data/test-instance.json')));
const control = new Database(path.join(repo,'data/app.db'),{readonly:true,fileMustExist:true});
const controlHash = () => createHash('sha256').update(JSON.stringify(['users','annotations','comments','channel_posts','channel_comments','site_settings'].map(table => control.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))).digest('hex');
const before = controlHash();
const db = new Database(path.join(root,'data/app.db'),{readonly:true,fileMustExist:true});
const logs = fs.openSync(path.join(out,'runtime.log'),'w',0o600);
const children = [];
const base = 'http://127.0.0.1:3301';
const pause = ms => new Promise(r=>setTimeout(r,ms));
let browser;
(async () => {
  // Local dependency reuse skips npm ci's postinstall; reproduce its PDF worker copy.
  fs.copyFileSync(path.join(repo,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(root,'public/pdf.worker.min.mjs'));
  // Refuse occupied ports rather than accidentally testing another instance.
  for (const port of [3001,3301]) {
    const occupied = await fetch(`http://127.0.0.1:${port}`).then(()=>true,()=>false);
    assert(!occupied,`Port ${port} is occupied`);
  }
  for (const script of ['runtime.cjs','gate.cjs']) children.push(spawn(process.execPath,[path.join(repo,'deploy/test',script)],{cwd:root,env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR},stdio:['ignore',logs,logs]}));
  for (let i=0;i<100;i++) { if (await fetch(base).then(r=>r.status===401,()=>false)) break; await pause(200); }
  assert.equal((await fetch(base+'/uploads/book.pdf')).status,401);
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,headless:true});
  const pages = {};
  const errors = [];
  const api = (page,route,method='GET',data) => page.evaluate(async ({route,method,data}) => { const r=await fetch(route,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json().catch(()=>null)}; },{route,method,data});
  for (const c of credentials) {
    const context = await browser.newContext({httpCredentials:{username:c.gateUser,password:c.gatePassword},viewport:{width:1440,height:1000}});
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); pages[c.role]=page;
    for (let i=0;i<100;i++) { if (await fetch('http://127.0.0.1:3001/login').then(r=>r.status===200,()=>false)) break; await pause(200); }
    await page.goto(base+'/login');
    const login = await api(page,'/api/auth/login','POST',{email:c.email,password:c.password}); assert.equal(login.status,200);
    await page.goto(base+'/channels/reading-lab');
  }
  const admin = pages.admin, editor = pages.booster, reader = pages.member;
  assert.equal((await api(reader,'/api/admin/features')).status,403);
  const flags = await api(admin,'/api/admin/features'); assert.equal(flags.status,200);
  const modified = { ...flags.body, modes:{...flags.body.modes,experimental:'admins'} };
  assert.equal((await api(admin,'/api/admin/features','PUT',modified)).status,200);
  const txt = marker.books.find(b=>b.file.endsWith('.txt'));
  const ownerNotes = await api(editor,`/api/documents/${txt.id}/annotations`), publicNotes = await api(reader,`/api/documents/${txt.id}/annotations`);
  assert(ownerNotes.body.items.some(n=>n.visibility==='private')); assert(publicNotes.body.items.every(n=>n.visibility==='public'));
  const note = await api(editor,'/api/annotations','POST',{documentId:txt.id,page:1,x:120,y:130,body:'Isolation smoke: new note',visibility:'public',allowDiscussion:true}); assert.equal(note.status,201);
  assert.equal((await api(reader,'/api/comments','POST',{documentId:txt.id,annotationId:note.body.id,body:'Isolation smoke: reply'})).status,201);
  const channel = db.prepare("SELECT id FROM channels WHERE slug='reading-lab'").get();
  const post = await api(editor,`/api/channels/${channel.id}/posts`,'POST',{title:'Isolation smoke: publication',body:'Новая запись существует только в тестовой базе.',published:true}); assert.equal(post.status,201);
  assert.equal((await api(reader,`/api/channels/${channel.id}/comments`,'POST',{postId:post.body.id,body:'Isolation smoke: channel reply'})).status,201);
  const publication = db.prepare("SELECT slug FROM channel_posts WHERE id=?").get(post.body.id);
  await reader.goto(base+'/channels/reading-lab/'+publication.slug); await reader.getByText('Isolation smoke: channel reply',{exact:true}).waitFor();
  for (const book of marker.books) {
    await editor.goto(base+'/documents/'+book.id+'?page=1');
    const selector = book.file.endsWith('.pdf') ? '.textLayer span' : book.file.endsWith('.epub') ? '.epub-container iframe' : '[data-txt-page="1"] pre';
    await editor.locator(selector).first().waitFor({timeout:60000});
    if (book.file.endsWith('.epub')) assert((await editor.frameLocator('.epub-container iframe').first().locator('body').innerText()).length>10);
  }
  for (const width of [1440,1024,768,390,320]) {
    await reader.setViewportSize({width,height:1000}); await reader.goto(base+'/channels/reading-lab');
    await reader.evaluate(()=>document.fonts.ready); await pause(250);
    // Includes cached 204 responses: optional artwork must resolve to a real
    // image or the book fallback, even when the response precedes hydration.
    await reader.waitForFunction(()=>[...document.querySelectorAll('img[src*="/cover"]')]
      .filter(img=>{const r=img.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;})
      .every(img=>img.complete&&img.naturalWidth>0&&getComputedStyle(img).opacity==='1'),null,{timeout:15000});
    assert(await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if ([1440,320].includes(width)) await reader.screenshot({path:path.join(out,`channel-${width}.png`)});
  }
  assert.equal((await api(admin,'/api/admin/features','PUT',flags.body)).status,200);
  assert.equal(controlHash(),before,'Main local database must not change');
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  assert.equal(errors.length,0,errors.join('\n'));
  const result = {passed:true,instanceId:marker.instanceId,roles:3,books:3,widths:[1440,1024,768,390,320],mainLocalDatabaseUnchanged:true,productionChecked:false,gateAndApplicationLogin:true,writes:['annotation','comment','publication','channelComment','featureFlags']};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if (browser) await browser.close();
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child=>child.exitCode!==null?null:new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});})));
  db.close();control.close();fs.closeSync(logs);
});
