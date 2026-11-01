/* eslint-disable @typescript-eslint/no-require-imports */
// Smoke an initialized, compiled disposable instance. Works on Linux without a browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const root = require('../deploy/test/paths.cjs').testRoot(process.cwd());
const marker = JSON.parse(fs.readFileSync(path.join(root,'data/test-instance.json')));
const accounts = JSON.parse(fs.readFileSync(path.join(root,'data/test-credentials.json')));
const Database = require('better-sqlite3');
const db = new Database(path.join(root,'data/app.db'),{readonly:true,fileMustExist:true});
const children = [], base = 'http://127.0.0.1:3301';
const log = fs.openSync(path.join(root,'data/logs/runtime-smoke.log'),'w',0o600);
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(url,status) {
  for (let i=0;i<150;i++) {
    if (children.some(c=>c.exitCode!==null)) throw Error('Test process exited; see private runtime-smoke.log');
    if (await fetch(url,{signal:AbortSignal.timeout(2000)}).then(r=>r.status===status,()=>false)) return;
    await pause(200);
  }
  throw Error('Timed out waiting for test server');
}
(async()=>{
  for (const port of [3001,3301]) assert(!await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)}).then(()=>true,()=>false),`Port ${port} occupied`);
  // Only the local cross-platform harness needs QEMU's address layout at exec.
  // runtime.cjs still sanitizes the application's env; native VPS does not use it.
  const executionEnv = {PATH:process.env.PATH,TMPDIR:process.env.TMPDIR};
  if (process.env.QEMU_GUEST_BASE) executionEnv.QEMU_GUEST_BASE = process.env.QEMU_GUEST_BASE;
  for (const [file,heap] of [['runtime.cjs',384],['gate.cjs',64]]) children.push(spawn(process.execPath,[`--max-old-space-size=${heap}`,path.join(root,'deploy/test',file)],{cwd:root,env:executionEnv,stdio:['ignore',log,log]}));
  await waitFor(base,401); await waitFor('http://127.0.0.1:3001/login',200);
  for (const route of ['/','/api/features','/uploads/book.pdf','/pdf.worker.min.mjs']) assert.equal((await fetch(base+route)).status,401);
  const sessions = {};
  for (const account of accounts) {
    const headers = {Authorization:'Basic '+Buffer.from(`${account.gateUser}:${account.gatePassword}`).toString('base64'),'Content-Type':'application/json'};
    const login = await fetch(base+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({email:account.email,password:account.password})});
    assert.equal(login.status,200); assert.equal((await login.json()).role,account.role);
    const cookie = login.headers.get('set-cookie'); assert.match(cookie,/blabla_session=/); assert.match(cookie,/secure/i);
    sessions[account.role] = {...headers,Cookie:cookie.split(';')[0]};
  }
  const api = async (role,url,method='GET',body) => {
    const response = await fetch(base+url,{method,headers:sessions[role],body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:await response.json().catch(()=>null)};
  };
  assert.equal((await api('member','/api/admin/features')).status,403);
  const flags = await api('admin','/api/admin/features'); assert.equal(flags.status,200);
  assert.equal((await api('admin','/api/admin/features','PUT',{...flags.body,modes:{...flags.body.modes,experimental:'admins'}})).status,200);
  assert.equal((await api('admin','/api/admin/features','PUT',flags.body)).status,200);
  for (const book of marker.books) {
    const page = await fetch(base+'/documents/'+book.id,{headers:sessions.booster}); assert.equal(page.status,200);
    const html = await page.text();
    const url = html.match(new RegExp(`/api/files/${book.id}\\?t=[A-Za-z0-9_.%\\-]+`))?.[0];
    assert(url,'Reader must have a signed file URL');
    const file = await fetch(base+url,{headers:sessions.booster}); assert.equal(file.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),book.sha256);
    const part = await fetch(base+url,{headers:{...sessions.booster,Range:'bytes=0-15'}}); assert.equal(part.status,206); assert.equal((await part.arrayBuffer()).byteLength,16);
    const owner = await api('booster',`/api/documents/${book.id}/annotations`), stranger = await api('member',`/api/documents/${book.id}/annotations`);
    assert(owner.body.items.some(n=>n.visibility==='private')); assert(stranger.body.items.every(n=>n.visibility==='public'));
  }
  const worker = await fetch(base+'/pdf.worker.min.mjs',{headers:sessions.booster}); assert.equal(worker.status,200); assert((await worker.arrayBuffer()).byteLength>100000);
  const book = marker.books[0], label = 'Runtime smoke '+Date.now();
  const note = await api('booster','/api/annotations','POST',{documentId:book.id,page:1,x:100,y:100,body:label,visibility:'public',allowDiscussion:true}); assert.equal(note.status,201);
  assert.equal((await api('member','/api/comments','POST',{documentId:book.id,annotationId:note.body.id,body:label})).status,201);
  const channel = db.prepare("SELECT id FROM channels WHERE slug='reading-lab'").get();
  const post = await api('booster',`/api/channels/${channel.id}/posts`,'POST',{title:label,body:label,published:true}); assert.equal(post.status,201);
  assert.equal((await api('member',`/api/channels/${channel.id}/comments`,'POST',{postId:post.body.id,body:label})).status,201);
  for (const route of ['/api/billing/checkout','/api/admin/billing/test-charge','/api/events/checkout','/api/cron/billing']) assert.equal((await fetch(base+route,{method:'POST',headers:sessions.admin})).status,403);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok'); assert.deepEqual(db.pragma('foreign_key_check'),[]);
  const memory = children.map(c=>{try{return {pid:c.pid,peakRssKiB:Number(fs.readFileSync(`/proc/${c.pid}/status`,'utf8').match(/^VmHWM:\s+(\d+)/m)[1])};}catch{return {pid:c.pid,peakRssKiB:null};}});
  const result = {passed:true,node:process.version,platform:process.platform,arch:process.arch,books:3,roles:3,protectedFilesAndRange:true,writes:['note','comment','post','reply','flags'],memory,productionChecked:false};
  fs.writeFileSync(path.join(root,'data/runtime-smoke.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child=>child.exitCode!==null?null:new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});})));
  db.close(); fs.closeSync(log);
});
