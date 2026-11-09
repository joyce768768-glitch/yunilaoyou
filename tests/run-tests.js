/* ============================================================
   与你老友 · 全端测试集（node 原生运行，零依赖）
   覆盖：官网数据层 / 管理后台 / APP 三端同步
   运行：node tests/run-tests.js
   原理：从源码提取真实逻辑段 + mock 环境执行，保证测的是线上代码
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- 极简 harness ---------- */
let pass = 0, fail = 0; const fails = [];
globalThis.__ck = (name, c) => { if (c) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); } else { fail++; fails.push(name); console.log('  \x1b[31m✗\x1b[0m ' + name); } };
const t = (name, fn) => { try { fn(); pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); } catch (e) { fail++; fails.push(name); console.log('  \x1b[31m✗\x1b[0m ' + name + ' — ' + e.message); } };
const eq = (a, b, msg) => { if (a !== b) throw new Error((msg || '') + ` 期望=${JSON.stringify(b)} 实得=${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || '断言失败'); };

/* ---------- 源码加载与提取 ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const coreJs = fs.readFileSync(path.join(ROOT, 'yln-core.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(ROOT, 'website/admin/admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(ROOT, 'website/admin/admin.html'), 'utf8');
const adminCss = fs.readFileSync(path.join(ROOT, 'website/admin/admin.css'), 'utf8');
const siteJs = fs.readFileSync(path.join(ROOT, 'website/assets/site.js'), 'utf8');
const serverPy = fs.readFileSync(path.join(ROOT, 'yln-server.py'), 'utf8');
const seg1 = html.match(/\/\* ==== 三端数据桥[\s\S]*?const ri2=\(a,b\)=>[^;]+;/);
const seg2 = html.match(/\/\* 三端同步：登录态下[\s\S]*?syncWalletFromSite\(\);/);
const segLlm = html.match(/async function llmChat\(messages,opt=\{\}\)\{[\s\S]*?dsAbort=null; \}\s*\}/);
const segChar = html.match(/function openChar\(id\)\{[\s\S]*?openSheet\('sheet-char'\);\s*\n\}/);
const segPool = html.match(/\/\* 上桌候选池[\s\S]*?function ensureAdopted\(id\)\{[\s\S]*?\n\}/);
const segBoot = html.match(/\/\* 官方老友跨设备同步[\s\S]*?syncOfficialChars\(\)\.catch\(\(\)=>\{\}\);/);
[['三端数据桥', seg1], ['初始合并', seg2], ['llmChat', segLlm], ['openChar', segChar], ['上桌候选池', segPool], ['boot同步', segBoot]].forEach(([k, v]) => { if (!v) { console.error('源码段提取失败:', k); process.exit(1); } });

/* ---------- 通用 mock ---------- */
function mkStore() { const s = {}; return { getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v) }, removeItem: k => { delete s[k] }, _s: s }; }
function mkEl() { return { hidden: false, value: '', textContent: '', innerHTML: '', className: '', style: {}, offsetWidth: 0, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], querySelector: () => null, appendChild() {} }; }

console.log('\n[0] 静态门禁');
t('三份源码 JS 语法编译通过', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(scripts.length >= 1, 'index.html 应含 script');
  scripts.forEach((s, i) => { try { new Function(s); } catch (e) { throw new Error('index.html script#' + i + ': ' + e.message); } });
  try { new Function(coreJs); } catch (e) { throw new Error('yln-core.js: ' + e.message); }
  try { new Function(coreJs + '\n' + adminJs); } catch (e) { throw new Error('admin.js: ' + e.message); }
  try { new Function(siteJs); } catch (e) { throw new Error('site.js: ' + e.message); }
});

/* ============================================================
   [A] 官网数据层（site.js · P0：服务器写穿 + 本地降级，沙箱隔离全局零竞争）
   ============================================================ */
console.log('\n[A] 官网数据层（P0 服务器写穿 · 本地降级）');
globalThis.__runAP = (async () => { try {
  const rok = j => ({ ok: true, json: async () => j });
  const rerr = (status, j) => ({ ok: false, status, json: async () => j });
  const doc = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() };
  const boot = (store, fetchFn) => new Function('document', 'localStorage', 'fetch',
    coreJs + '\n' + siteJs + ';SITE_K = SITE; return { SITE: SITE_K, YLN: YLN };')(doc, store, fetchFn);
  const SRV_USER = { id: 'uSRV1', nick: '小张', email: 'z@x.com', plan: null, planUntil: null, created: 123 };

  /* A1 摘要函数（纯本地，与服务器无关） */
  {
    const env = boot(mkStore(), async () => ({ ok: true, json: async () => ({ ok: true }) }));
    __ck('A1 hash 确定性且差异化', env.SITE.hash('abc') === env.SITE.hash('abc') && env.SITE.hash('abc') !== env.SITE.hash('abd'));
  }

  /* A2 服务器可达：注册写穿（本地记录用服务器 id，token/会话/ph 落地） */
  {
    let calls = [];
    const env = boot(mkStore(), async (url, opt) => { calls.push({ url: String(url), opt: opt || {} });
      if (String(url) === '/api/auth/signup') return rok({ ok: true, token: 'tk_s1', user: SRV_USER });
      return rok({ ok: true }); });
    const u = await env.SITE.signup('小张', 'z@x.com', 'p1');
    __ck('A2 signup 服务器成功→本地记录用服务器 id', u.id === 'uSRV1' && env.SITE.users()[0].id === 'uSRV1');
    __ck('A2b token 落地 + 会话建立（与服务器同 id）', env.YLN.auth.token() === 'tk_s1' && env.SITE.load(env.SITE.sessK, null) === 'uSRV1');
    __ck('A2c 本地密码缓存 ph 落地（离线登录可用）', env.SITE.users()[0].ph === env.SITE.hash('p1'));
    __ck('A2d me() 同步可读（三端桥兼容）', !!env.SITE.me() && env.SITE.me().email === 'z@x.com');
    /* A3 本地重复邮箱拦截（保持既有 UX） */
    let th = false; try { await env.SITE.signup('小张2', 'z@x.com', 'p2'); } catch (e) { th = true; }
    __ck('A3 重复邮箱注册被拒绝', th);
    /* A13/A14 updateUser / createOrder 回归 */
    env.SITE.updateUser({ points: 500 });
    __ck('A13 updateUser 补丁生效并持久化', env.SITE.me().points === 500);
    const o = env.SITE.createOrder({ plan: '标准月卡', planKey: 'plus', amount: 89 });
    __ck('A14 createOrder 写入订单（YL 前缀 · paid）', env.SITE.orders().length === 1 && o.id.startsWith('YL') && o.status === 'paid');
    /* A12 登出：token 清除 + 会话撤销请求 */
    env.SITE.logout();
    await new Promise(r => setTimeout(r, 10));
    __ck('A12 logout 清 token 与本地会话', env.YLN.auth.token() === '' && env.SITE.me() === null);
    __ck('A12b 向服务器发起会话撤销', calls.some(c => c.url === '/api/auth/logout'));
  }

  /* A4 服务器明确拒绝 → 错误透传 */
  {
    const env = boot(mkStore(), async () => rerr(400, { ok: false, err: '该邮箱已注册，直接登录即可' }));
    let msg = ''; try { await env.SITE.signup('小张', 'z@x.com', 'p1'); } catch (e) { msg = e; }
    __ck('A4 服务器拒绝→错误透传', msg === '该邮箱已注册，直接登录即可');
  }

  /* A5 服务不可达 → 纯本地注册降级（不落 token） */
  {
    let n = 0;
    const env = boot(mkStore(), async () => { n++; throw new Error('down'); });
    const u = await env.SITE.signup('小张', 'z@x.com', 'p1');
    __ck('A5 服务不可达→纯本地注册降级', u.id.startsWith('u') && !!env.SITE.me() && n === 1);
    __ck('A5b 降级模式不落 token', env.YLN.auth.token() === '');
  }

  /* A6 跨设备登录：服务器有号、本地无记录 → 桥接建档 */
  {
    const env = boot(mkStore(), async (url) => String(url) === '/api/auth/login'
      ? rok({ ok: true, token: 'tk_l1', user: SRV_USER }) : rok({ ok: true }));
    const u = await env.SITE.login('z@x.com', 'p1');
    __ck('A6 跨设备登录→桥接建档+token', u.id === 'uSRV1' && env.SITE.load(env.SITE.sessK, null) === 'uSRV1' && env.YLN.auth.token() === 'tk_l1');
    __ck('A6b 桥接记录缓存 ph（下次离线可登录）', env.SITE.users()[0].ph === env.SITE.hash('p1'));
  }

  /* A7 已有本地记录 → 身份对齐但钱包字段不动 */
  {
    const store = mkStore();
    store.setItem('yln_site_users', JSON.stringify([{ id: 'uSRV1', nick: '旧昵称', email: 'z@x.com', ph: 'hOld', created: 1, plan: 'plus', planUntil: 999, points: 500, coupons: 6 }]));
    const env = boot(store, async (url) => String(url) === '/api/auth/login'
      ? rok({ ok: true, token: 'tk_l2', user: SRV_USER }) : rok({ ok: true }));
    const u = await env.SITE.login('z@x.com', 'p1');
    const rec = env.SITE.users()[0];
    __ck('A7 身份对齐但钱包字段不动（P1 前）', u.nick === '小张' && rec.points === 500 && rec.coupons === 6 && rec.plan === 'plus');
    __ck('A7b ph 刷新为本次验证口令', rec.ph === env.SITE.hash('p1'));
  }

  /* A8 服务不可达 → 纯本地登录降级 */
  {
    const store = mkStore();
    const env = boot(store, async () => { throw new Error('down'); });
    store.setItem('yln_site_users', JSON.stringify([{ id: 'uLOC1', nick: '小张', email: 'z@x.com', ph: env.SITE.hash('p1'), created: 1 }]));
    const u = await env.SITE.login('z@x.com', 'p1');
    __ck('A8 服务不可达→本地登录降级', u.id === 'uLOC1');
    let th = false; try { await env.SITE.login('z@x.com', 'bad'); } catch (e) { th = true; }
    __ck('A8b 本地错误密码仍被拒', th);
  }

  /* A9 服务器拒绝且本地无此号 → 采信服务器错误 */
  {
    const env = boot(mkStore(), async () => rerr(400, { ok: false, err: '邮箱尚未注册' }));
    let msg = ''; try { await env.SITE.login('n@x.com', 'p'); } catch (e) { msg = e; }
    __ck('A9 本地无号→服务器错误透传', msg === '邮箱尚未注册');
  }

  /* A11 服务器拒绝（密码错）且本地无号 → 服务器错误优先 */
  {
    const env = boot(mkStore(), async () => rerr(400, { ok: false, err: '密码不正确，再想想？' }));
    let msg = ''; try { await env.SITE.login('z@x.com', 'wrong'); } catch (e) { msg = e; }
    __ck('A11 密码错误→服务器错误优先', msg === '密码不正确，再想想？');
  }

  /* A10 漂移账号（停机期本地注册）→ 本地验证通过 + 服务器补种 */
  {
    let calls = [];
    const store = mkStore();
    const env = boot(store, async (url) => { calls.push(String(url));
      if (String(url) === '/api/auth/login') return rerr(400, { ok: false, err: '邮箱尚未注册' });
      if (String(url) === '/api/auth/signup') return rok({ ok: true, token: 'tk_h', user: SRV_USER });
      return rok({ ok: true }); });
    store.setItem('yln_site_users', JSON.stringify([{ id: 'uLOC1', nick: '小张', email: 'z@x.com', ph: env.SITE.hash('p1'), created: 1 }]));
    const u = await env.SITE.login('z@x.com', 'p1');
    __ck('A10 漂移账号→本地验证通过', u.id === 'uLOC1' && env.SITE.load(env.SITE.sessK, null) === 'uLOC1');
    await new Promise(r => setTimeout(r, 10));
    __ck('A10b 向服务器补种漂移账号', calls.includes('/api/auth/signup'));
  }
} catch (e) { fail++; fails.push('A 组执行'); console.log('  \x1b[31m✗\x1b[0m A 组执行 — ' + e.message); } })();

/* ============================================================
   [B] 管理后台（admin.js · 鉴权 / 种子 / 渲染 / 操作）
   ============================================================ */
console.log('\n[B] 管理后台');
globalThis.__runBP = (async () => { try {
if (globalThis.__runAP) await globalThis.__runAP;   /* 等 A 组跑完再接管全局 localStorage */
globalThis.localStorage = mkStore(); globalThis.sessionStorage = mkStore();
const Bels = {};
globalThis.document = { querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: id => (Bels[id] = Bels[id] || mkEl()), createElement: mkEl, body: mkEl() };
globalThis.addEventListener = () => {}; globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { hash: '' }; globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.fetch = async (url,opt={}) => {
  const u=String(url),body=opt.body?JSON.parse(opt.body):{};
  if(u==='/api/admin/login')return {ok:body.email==='admin@yln.local'&&body.pwd==='secret',status:body.pwd==='secret'?200:401,json:async()=>body.email==='admin@yln.local'&&body.pwd==='secret'?{ok:true,token:'adm_test',admin:{id:'admin',email:body.email}}:{ok:false,err:'管理员邮箱或密码不正确'}};
  if(u==='/api/admin/me')return {ok:true,json:async()=>({ok:true,admin:{id:'admin',email:'admin@yln.local'}})};
  if(u==='/api/chars'&&opt.method!=='POST')return {ok:true,json:async()=>({chars:[]})};
  if(u==='/api/nuwa/prompts')return {ok:true,json:async()=>({ok:true,prompts:{}})};
  return {ok:true,json:async()=>({ok:true})};
};
await new Function(coreJs + '\n' + adminJs + `
;return (async()=>{
YLN.events.start=()=>{};YLN.events.stop=()=>{};
['login','app','lg-email','lg-pwd','lg-submit','lg-err','view','pt','ps'].forEach(id=>$  (id));
const ck=(n,c)=>__ck(n,c);
ck('B1 种子数据完整性', (()=>{const us=users(),os=orders(),tk=tokens();return us.length>=10&&os.length>=16&&tk.length===42})());
$('login').hidden=false;$('app').hidden=false;router();
ck('B2 未登录→强制登录页', $('login').hidden===false&&$('app').hidden===true);
$('lg-email').value='admin@yln.local';$('lg-pwd').value='wrong';await tryLogin({preventDefault(){}});
ck('B3 错误管理员密码→报错不进入', $('lg-err').textContent==='管理员邮箱或密码不正确'&&!YLN.adminAuth.token());
ck('B4 登录请求使用独立管理员 API', $('lg-pwd').value==='wrong'&&$('app').hidden===true);
$('lg-pwd').value='secret';await tryLogin({preventDefault(){}});
ck('B5 邮箱密码登录→管理员 token 与后台会话', YLN.adminAuth.token()==='adm_test'&&$('app').hidden===false);
let allOk=true, err='';
for(const k of Object.keys(routes)){try{const h=routes[k].f();if(h.length<400){allOk=false;err=k+' 渲染过短'}}catch(e){allOk=false;err=k+': '+e.message}}
ck('B6 五页面渲染无错', allOk===true);
ck('B7 monthBars 月度聚合正确', (()=>{const now=new Date();
  const mkO=(amt,mOff)=>({amount:amt,time:new Date(now.getFullYear(),now.getMonth()-mOff,15).getTime(),status:'paid'});
  return monthBars([mkO(89,0),mkO(890,0),mkO(89,1)],'finance').includes('data-v="¥979"')})());
(()=>{const id=orders()[0].id;refund(id)})();
ck('B8 退款标记生效', orders()[0].status==='refund');
const __before=(()=>{const us=users();const i=us.findIndex(u=>u.id==='seed0');return us[i].points})();
(()=>{gift('seed0')})();
ck('B9 积分赠送生效(+100)', users().find(x=>x.id==='seed0').points===__before+100);
await logout();
ck('B10 登出→撤销管理员 token 并回登录页', !YLN.adminAuth.token()&&$('login').hidden===false);
})();
`)();
} catch (e) { fail++; fails.push('B 组执行'); console.log('  \x1b[31m✗\x1b[0m B 组执行 — ' + e.message); } })();

/* ============================================================
   [C] APP 三端同步（index.html 源码段）
   ============================================================ */
console.log('\n[C] APP 三端同步');
globalThis.__runCP = (async () => { try {
  if (globalThis.__runBP) await globalThis.__runBP;   /* 等 B 组跑完再接管全局 localStorage/fetch */
  globalThis.localStorage = mkStore();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '测试发言' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }) });
  globalThis.AbortController = class { constructor(){this.signal={}} abort(){} };
new Function(coreJs + `
let activeRound=null, wallet={plan:'free',points:0,coupons:5,ledger:[]};
let dsAbort=null;const DS={url:'mock://ds',getKey:()=>'test-key'};
const getChar=id=>id==='r_acha'?{human:true}:null;
const saveRounds=()=>{};const renderWalletUI=()=>{};
${seg1[0]}
${segLlm[0]}
globalThis.__runC=async()=>{
  const ck=(n,c)=>__ck(n,c);
  /* 游客模式隔离 */
  saveWallet();
  ck('C1 游客模式→不写官网数据', localStorage.getItem('yln_site_users')===null);
  /* 写穿 */
  localStorage.setItem('yln_site_users',JSON.stringify([{id:'u1',nick:'测试员',email:'t@x.com',plan:'free',points:100,coupons:0}]));
  localStorage.setItem('yln_site_session',JSON.stringify({email:'t@x.com'}));
  wallet.points=880;wallet.plan='plus';saveWallet();
  const su=JSON.parse(localStorage.getItem('yln_site_users'))[0];
  ck('C2 APP花积分→写穿官网账号(真实档位)', su.points===880&&su.plan==='plus'&&!!su.planUntil);
  /* 首登合并 */
  wallet={plan:'free',points:60,coupons:5,ledger:[{t:1,n:'新人礼包',d:0}]};
  {${seg2[0]}}
  ck('C3 首登→游客资产合并入账(880+60)', wallet.points===940&&wallet.coupons===10&&wallet.synced==='t@x.com');
  ck('C3b 合并写回官网', JSON.parse(localStorage.getItem('yln_site_users'))[0].points===940);
  /* 拉回 */
  const su3=JSON.parse(localStorage.getItem('yln_site_users'))[0];su3.points=1389;su3.coupons=6;
  localStorage.setItem('yln_site_users',JSON.stringify([su3]));
  {${seg2[0]}}
  ck('C4 已同步→官网数值拉回', wallet.points===1389&&wallet.coupons===6);
  /* llmChat 真实 usage 累计 */
  activeRound=null;
  await llmChat([{role:'user',content:'a'}]);
  activeRound={topic:'t'};
  await llmChat([{role:'user',content:'b'}]);
  await llmChat([{role:'user',content:'c'}]);
  ck('C5 llmChat 累计真实usage(100×2)', activeRound.usage&&activeRound.usage.tin===200&&activeRound.usage.tout===100);
  /* Token 流水 */
  activeRound={usage:{tin:52300,tout:8640},cache:Array.from({length:9},()=>({type:'msg'}))};
  const rec={topic:'该不该裸辞？',chars:['jobs','r_acha','munger'],status:'done'};
  logRoundTokens(rec,false);
  const lg=JSON.parse(localStorage.getItem('yln_token_logs'));
  ck('C6 Token流水写入(真友不计角色)', lg.length===1&&lg[0].tin===52300&&lg[0].roles===2&&lg[0].pts===20&&lg[0].cost>0);
  logRoundTokens(rec,false);
  ck('C7 防重不重复记录', JSON.parse(localStorage.getItem('yln_token_logs')).length===1);
  /* 纯回放不记录 */
  activeRound={cache:null};
  logRoundTokens({topic:'x',chars:['jobs','munger'],status:'live'},false);
  ck('C8 纯回放不产生流水', JSON.parse(localStorage.getItem('yln_token_logs')).length===1);
};
`)();
  if (globalThis.__runC) await globalThis.__runC();
} catch (e) { fail++; fails.push('C 组执行'); console.log('  \x1b[31m✗\x1b[0m C 组执行 — ' + e.message); } })();

/* ============================================================
   [D] 女娲管线 · 六路采集与三路检验（yln-core.js · mock fetch）
   ============================================================ */
console.log('\n[D] 女娲管线（六路采集 / 排他性检验）');
(async()=>{ try {
  if (globalThis.__runCP) await globalThis.__runCP;   /* 等 C 组跑完再接管 fetch */
  const DY = new Function(coreJs + ';return YLN;')();
  const resp = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
  const raw = j => ({ ok: true, json: async () => j });
  let calls = [];
  const mkFetch = fn => { calls = []; globalThis.fetch = async (url, opt) => { calls.push(opt); return fn(calls.length, opt); }; };
  const llmCalls = () => calls.filter(c => c && c.body);
  const MIND = { models: [{ n: 'x', d: 'y' }], heuristics: ['a'], dna: ['b'], blind: 'c', bound: 'd' };

  /* ---- 六路采集 ---- */
  mkFetch(() => resp('1. 条目一\n2. 条目二'));
  const seen = [];
  const r1 = await DY.nuwa.collectSix('德鲁克', '管理', x => seen.push(x));
  __ck('D1 六路并行=6次LLM调用', llmCalls().length === 6);
  __ck('D1b 每路先查维基（6次检索调用）', calls.filter(c => !c || !c.body).length === 6);
  __ck('D1c 人名与方向进每路 prompt', llmCalls().every(c => c.body.includes('德鲁克') && c.body.includes('管理')));
  __ck('D1d onEach 每路回调一次', seen.length === 6);
  __ck('D2 六路全 ok 且 corpus 含各路标题', r1.cards.length === 6 && r1.cards.every(c => c.ok === true) && r1.corpus.includes('【著作与讲稿】') && r1.corpus.includes('【人生时间线】'));

  mkFetch((n, opt) => (opt && opt.body) ? (/深度访谈/.test(opt.body) ? resp('该通道信息有限') : resp('1. 条目')) : raw({ query: { pages: { '1': {} } } }));
  const r3 = await DY.nuwa.collectSix('张三', '', null);
  __ck('D3 有限通道标记 limited 并从 corpus 剔除', r3.cards[1].ok === false && r3.cards[1].limited === true && r3.corpus.includes('【著作与讲稿】') && !r3.corpus.includes('【深度访谈】'));

  globalThis.fetch = async () => { throw new Error('net-down'); };
  const r4 = await DY.nuwa.collectSix('李四', '', null);
  __ck('D4 通道网络异常→六路诚实降级且 corpus 为空', r4.cards.every(c => !c.ok && c.limited) && r4.corpus === '');

  /* ---- 三路检验（跨域 / 生成力 / 排他性） ---- */
  mkFetch(() => resp('{"score":82,"note":"独特"}'));
  const p5 = DY.nuwa.verifyParts({ mind: MIND });
  __ck('D5 verifyParts 返回原 mind 引用', p5.mind === MIND);
  const rs5 = await Promise.all([p5.cross, p5.gen, p5.excl]);
  __ck('D5b 三路=3次独立真调用（非合一）', calls.length === 3);
  __ck('D5c 三路任务词各进各路 prompt', calls[0].body.includes('跨域复现') && calls[1].body.includes('生成力') && calls[2].body.includes('排他性'));
  __ck('D5d 三路分数与结论解析', rs5.every(r => r.score === 82 && r.note === '独特'));

  mkFetch(() => resp('{"score":150,"note":"over"}'));
  __ck('D6 分数钳制 150→100', (await DY.nuwa.verifyParts({ mind: MIND }).excl).score === 100);
  mkFetch(() => resp('{"score":-9,"note":"neg"}'));
  __ck('D6b 负分钳制→0', (await DY.nuwa.verifyParts({ mind: MIND }).excl).score === 0);
  mkFetch(() => resp('这不是JSON'));
  const r6 = await DY.nuwa.verifyParts({ mind: MIND }).excl;
  __ck('D6c 坏输出→60（检验输出异常）', r6.score === 60 && r6.note === '检验输出异常');
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  __ck('D6d HTTP错误→55（检验通道超时）', (await DY.nuwa.verifyParts({ mind: MIND }).gen).score === 55);

  mkFetch(() => resp('{"score":70,"note":"ok"}'));
  const v7 = await DY.nuwa.verify({ mind: MIND });
  __ck('D7 聚合=三路均分且 note 含明细', v7.score === 70 && v7.cross === 70 && v7.gen === 70 && v7.excl === 70 && v7.note.includes('排他70'));
  const before = calls.length;
  const v7b = await DY.nuwa.verify(null);
  __ck('D7b 无 mind→降级35且不发真调用', v7b.score === 35 && /降级/.test(v7b.note) && calls.length === before);

  /* ---- M2-lite 维基增强 ---- */
  mkFetch((n, opt) => (opt && opt.body) ? resp('1. 条目一') : raw({ query: { pages: { '1': { title: '史蒂夫·乔布斯', extract: '乔布斯是美国企业家，苹果公司联合创始人。' } } } }));
  const r8 = await DY.nuwa.collectSix('乔布斯', '', null);
  __ck('D8 维基有料→卡片标记 wiki 且维基文本进采集 prompt', r8.cards.length === 6 && r8.cards.every(c => c.wiki === true) && llmCalls().length === 6 && llmCalls().every(c => c.body.includes('【维基参考】') && c.body.includes('苹果公司联合创始人')));

  mkFetch((n, opt) => (opt && opt.body) ? resp('1. 条目一') : { ok: false, status: 503 });
  const r9 = await DY.nuwa.collectSix('某冷门人物', '', null);
  __ck('D9 维基失败→静默降级走记忆（不注入维基参考）', r9.cards.length === 6 && r9.cards.every(c => c.wiki === false) && llmCalls().length === 6 && llmCalls().every(c => !c.body.includes('维基参考')));

  mkFetch((n, opt) => (opt && opt.body) ? resp('1. 条目一') : raw({ query: { pages: { '1': { title: '刘晓波', extract: '刘晓波是作家与社会活动家。' } } } }));
  const r9b = await DY.nuwa.collectSix('刘晓燕', '', null);
  __ck('D9b 防串人：标题不互相包含→拒采信（刘晓燕≠刘晓波）', r9b.cards.every(c => c.wiki === false) && llmCalls().every(c => !c.body.includes('刘晓波')));

  /* ---- M2-lite wikiSnip 边界（直接单测；短超时避免计时器拖慢套件） ---- */
  const WS = (n, t) => DY.nuwa.wikiSnip(n, t || 1000);

  mkFetch(() => raw({ error: { code: 'illegaltitle' } }));
  __ck('D10 响应无 query.pages（异常JSON结构）→空串', await WS('乔布斯') === '');

  mkFetch(() => raw({ query: { pages: { '-1': { ns: 0, title: '乔布斯', missing: '' } } } }));
  __ck('D11 页面 missing（无 extract）→空串', await WS('乔布斯') === '');

  mkFetch(() => raw({ query: { pages: { '1': { title: '乔布斯', extract: '   \n  ' } } } }));
  __ck('D12 extract 纯空白→空串', await WS('乔布斯') === '');

  mkFetch(() => raw({ query: { pages: { '1': { title: '乔布斯', extract: '美国企业家。' } } } }));
  const w13 = await WS('乔布斯');
  __ck('D13 标题与查询名精确相等→采信且带条目前缀', w13 === '条目「乔布斯」：美国企业家。');

  mkFetch(() => raw({ query: { pages: { '1': { title: '马云', extract: '阿里巴巴创始人。' } } } }));
  __ck('D14 反向包含（查询名包含标题）→采信', (await WS('阿里巴巴马云')) === '条目「马云」：阿里巴巴创始人。');

  mkFetch(() => raw({ query: { pages: { '1': { title: '乔布斯', extract: '句一。  多  空白\n换行' + '长'.repeat(600) } } } }));
  const w15 = await WS('乔布斯');
  __ck('D15 空白归一化+600字截断', w15.length === 600 && !w15.includes('\n') && !w15.includes('  ') && w15.startsWith('条目「乔布斯」：'));

  globalThis.fetch = async () => { throw new Error('conn-reset'); };
  __ck('D16 fetch 直接抛异常→空串', await WS('乔布斯', 150) === '');

  mkFetch(() => raw({ query: { pages: { '1': { title: '乔布斯', extract: '美国企业家。' } } } }));
  const before17 = calls.length;
  __ck('D17 空名→不发请求直接返回空串', await WS('  ') === '' && await WS('') === '' && calls.length === before17);

  globalThis.fetch = (u, o) => new Promise((res, rej) => { if (o && o.signal) o.signal.addEventListener('abort', () => rej(new Error('AbortError'))); });
  __ck('D18 挂起fetch→超时熔断返回空串', await WS('乔布斯', 120) === '');

  mkFetch(() => ({ ok: true, json: async () => { throw new Error('bad json'); } }));
  __ck('D19 json()解析抛异常→空串', await WS('乔布斯', 150) === '');

  /* ---- wikiSnip 边界第二轮（D20-D25） ---- */
  /* 已知局限锁定：子串包含无法区分「小乔布斯」，当前契约=采信；未来若收紧为全等/词条匹配需改此用例 */
  mkFetch(() => raw({ query: { pages: { '1': { title: '小乔布斯', extract: '虚构角色。' } } } }));
  __ck('D20 子串陷阱为已知局限（契约锁定：采信）', (await WS('乔布斯')) === '条目「小乔布斯」：虚构角色。');

  const urls = [];
  globalThis.fetch = async (u, o) => { urls.push(String(u)); return raw({ query: { pages: { '1': { title: '乔布斯', extract: '美国企业家。' } } } }); };
  await WS('史蒂夫·乔布斯');
  __ck('D21 URL 构造：generator=search + origin=* + gsrsearch 编码', urls.length === 1 && urls[0].includes('zh.wikipedia.org/w/api.php') && urls[0].includes('generator=search') && urls[0].includes('origin=*') && urls[0].includes('gsrsearch=%E5%8F%B2%E8%92%82%E5%A4%AB'));

  /* 迭代序 '1'(无关页) 在前：旧盲取首键逻辑会失败，扫描逻辑应取到第 2 页 */
  mkFetch(() => raw({ query: { pages: { '1': { title: '约伯斯 (消歧义)', extract: '消歧义页。' }, '2': { title: '史蒂夫·乔布斯', extract: '美国企业家。' } } } }));
  __ck('D22 多候选页→扫描取第一个通过防串人的页（不盲取首键）', (await WS('乔布斯')) === '条目「史蒂夫·乔布斯」：美国企业家。');

  mkFetch(() => raw({ query: { pages: { '1': { title: '史蒂夫·乔布斯', extract: '美国企业家。' } } } }));
  __ck('D23 查询名带首尾空格→trim 后采信', (await WS('  乔布斯  ')) === '条目「史蒂夫·乔布斯」：美国企业家。');

  globalThis.fetch = async () => undefined;
  __ck('D24 fetch 返回 undefined→空串', await WS('乔布斯', 150) === '');

  mkFetch(() => raw({ query: { pages: 'oops' } }));
  __ck('D25 pages 为脏结构（字符串）→空串不炸', await WS('乔布斯', 150) === '');
} catch (e) { fail++; fails.push('D 组执行'); console.log('  \x1b[31m✗\x1b[0m D 组执行 — ' + e.message); } })();

/* ============================================================
   [F] 女娲 v3 增量：taboos / Prompt 注册表 / 黑盒评测 / SKILL.md / 复核编排 / 双写降级
   ============================================================ */
console.log('\n[F] 女娲 v3 增量（黑盒评测 · 复核编排 · SKILL.md · Prompt 注册表）');
(async()=>{ try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r=>setTimeout(r,250));   /* 等 D 组跑完再接管 fetch */
  const FY = new Function(coreJs + ';return YLN;')();
  const resp = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
  const raw = j => ({ ok: true, json: async () => j });
  let calls = [];
  const mkFetch = fn => { calls = []; globalThis.fetch = async (url, opt) => { calls.push({ url, opt }); return fn(calls.length, String(url||''), opt); }; };
  const llm = () => calls.filter(c => c.opt && c.opt.body && String(c.opt.body).includes('"model"'));
  const DISTILL_JSON = JSON.stringify({ title: '知行合一的实践者', field: '智慧', tags: ['心学', '实践'], quote: '知是行之始。',
    mind: { models: [{ n: '知行合一', d: '认知与行动互为表里' }], heuristics: ['先问本心再问利害'], dna: ['反问式开场'], blind: '急于求成', bound: '语料未覆盖部分系推演', taboos: ['绝不说空话', '绝不推卸责任'] } });
  const GOOD_MIND = { models: [{ n: '知行合一', d: '认知与行动互为表里' }], heuristics: ['先问本心再问利害'], dna: ['反问式开场'], taboos: ['绝不说空话'], blind: '急于求成', bound: '语料未覆盖部分系推演' };
  const wikiOrApi = u => u.startsWith('/api') ? raw({ ok: true, traces: [] }) : raw({ query: { pages: {} } });

  /* F1 Prompt 注册表 */
  mkFetch(() => resp('1. a\n2. b'));
  await FY.nuwa.collectSix('王阳明', '心学', () => {});
  __ck('F1 六路 prompt 走默认注册表', llm().length === 6 && llm().every(c => c.opt.body.includes('六路采集器')));
  __ck('F1b distill 默认模板含 taboos 字段', FY.nuwa.getPrompt('distill').includes('taboos'));
  FY.nuwa.setPrompt('distill', '自定义模板{{name}}');
  __ck('F1c setPrompt 覆盖生效', FY.nuwa.getPrompt('distill') === '自定义模板{{name}}');
  __ck('F1d promptIsCustom 标记', FY.nuwa.promptIsCustom('distill') === true && FY.nuwa.promptIsCustom('six') === false);
  __ck('F1e fill 变量替换（缺变量清空）', FY.nuwa.fill('A{{x}}B{{y}}C', { x: 1 }) === 'A1BC');
  FY.nuwa.resetPrompt('distill');
  __ck('F1f resetPrompt 恢复默认', FY.nuwa.getPrompt('distill').includes('女娲造人引擎'));
  __ck('F1g 未知 key 拒绝覆盖', FY.nuwa.setPrompt('nope', 'x') === false);

  /* F2 taboos 清洗 */
  const sn = FY.nuwa.sanitize({ title: 't', quote: 'q', mind: { models: [{ n: 'a', d: 'b' }], heuristics: ['h'], dna: ['d'], taboos: ['x', 'y', 'z', 'extra'], blind: 'b', bound: 'c' } });
  __ck('F2 sanitize 收敛 taboos≤3', sn && sn.taboos.length === 3 && sn.taboos[0] === 'x');
  const sn2 = FY.nuwa.sanitize({ title: 't', quote: 'q', mind: { models: [{ n: 'a', d: 'b' }] } });
  __ck('F2b 无 taboos 不炸', Array.isArray(sn2.taboos) && sn2.taboos.length === 0);

  /* F3 黑盒 3 题本地生成（0 调用） */
  const qs = FY.nuwa.probeQuestions({ name: '王阳明', field: '智慧', mind: GOOD_MIND });
  __ck('F3 黑盒 3 题本地生成', qs.length === 3 && qs.every(q => typeof q === 'string' && q.length > 5));
  __ck('F3b 盲区进第二题', qs[1].includes('急于求成'));
  __ck('F3c 无 mind 也有 3 题', FY.nuwa.probeQuestions({ name: 'x', mind: null }).length === 3);

  /* F4 probe：3 并行实答 + 1 判卷 = +4 次调用 */
  mkFetch((n, u, opt) => { const b = String(opt && opt.body);
    if (b.includes('判卷官')) return resp(JSON.stringify({ score: 88, issues: ['略有套话'] }));
    return resp('我是本人，直接说结论。'); });
  const pr = await FY.nuwa.probe({ name: '王阳明', field: '智慧', mind: GOOD_MIND });
  __ck('F4 probe 共 4 次 LLM 调用', llm().length === 4);
  __ck('F4b 判卷分与扣分点解析', pr.score === 88 && pr.issues.length === 1 && pr.issues[0] === '略有套话');
  __ck('F4c qa 三条且非降级', pr.qa.length === 3 && !pr.degraded);
  const pr2 = await FY.nuwa.probe({ name: 'x', mind: null });
  __ck('F4d 无 mind→degraded 且 0 调用', pr2.degraded && llm().length === 4);
  mkFetch((n, u, opt) => { const b = String(opt && opt.body);
    if (b.includes('判卷官')) return resp('不是JSON');
    return resp('答'); });
  const pr3 = await FY.nuwa.probe({ name: 'x', field: '', mind: GOOD_MIND });
  __ck('F4e 判卷坏输出→score null 且 degraded', pr3.score === null && pr3.degraded);

  /* F5 renderSkillMd：frontmatter + 五层 */
  const md = FY.nuwa.renderSkillMd({ name: '王阳明', mind: GOOD_MIND });
  __ck('F5 SKILL.md frontmatter 四字段', md.includes('skill_id: sk_') && md.includes('character_name: 王阳明') && md.includes('version: v1.0') && md.includes('create_time: '));
  __ck('F5b 五层章节齐全', ['## 表达风格', '## 心智模型', '## 决策规则', '## 禁忌与反模式', '## 认知边界'].every(s => md.includes(s)));
  __ck('F5c taboos 与盲区归位', md.includes('- 绝不说空话') && md.includes('反模式：急于求成') && md.includes('盲区：急于求成'));
  __ck('F5d 传 skillId 优先', FY.nuwa.renderSkillMd({ name: 'x', mind: GOOD_MIND, skillId: 'sk_custom' }).includes('skill_id: sk_custom'));

  /* F6 nuwaTrace 全编排：14 次调用（6+1+3+4）+ 双写 POST /api/traces */
  let posts = 0;
  mkFetch((n, u, opt) => { const b = String(opt && opt.body);
    if (!b || !b.includes('"model"')) { if (u === '/api/traces') posts++; return wikiOrApi(u); }
    if (b.includes('验证官')) return resp(JSON.stringify({ score: 90, note: '好' }));
    if (b.includes('判卷官')) return resp(JSON.stringify({ score: 88, issues: ['轻微套话'] }));
    return resp(DISTILL_JSON); });
  const out = await FY.nuwa.nuwaTrace({ name: '王阳明', dir: '心学', corpus: '语料测试' });
  __ck('F6 全链 14 次 LLM 调用（6+1+3+4）', llm().length === 14);
  __ck('F6b 返回状态 ok 且黑盒 88', out.status === 'ok' && out.match === 88 && out.conf === 90 && !!out.mind);
  __ck('F6c 双写 POST /api/traces', posts >= 1);
  const tr = FY.nuwa.traceList().find(t => t.name === '王阳明');
  ok(tr, 'Trace 落盘');
  __ck('F6d Trace 节点齐全含黑盒', ['six', 'distill', 'verify', 'sanitize', 'probe'].every(id => tr.nodes.some(x => x.id === id)));
  __ck('F6e Trace in.corpus 含用户语料', tr.in.corpus.includes('语料测试'));
  __ck('F6f Trace probe 存档含 qa', tr.probe && tr.probe.score === 88 && tr.probe.qa.length === 3);
  __ck('F6g token 口径=14 次调用', tr.tok && tr.tok.calls === 14);

  /* F7 复核编排：conf<60 → review，跳过黑盒（10 calls） */
  mkFetch((n, u, opt) => { const b = String(opt && opt.body);
    if (!b || !b.includes('"model"')) return wikiOrApi(u);
    if (b.includes('验证官')) return resp(JSON.stringify({ score: 30, note: '差' }));
    if (b.includes('判卷官')) return resp(JSON.stringify({ score: 50, issues: ['差'] }));
    return resp(DISTILL_JSON); });
  const out2 = await FY.nuwa.nuwaTrace({ name: '低分人' });
  __ck('F7 低置信度→review（10 calls，跳过黑盒）', out2.status === 'review' && llm().length === 10);
  __ck('F7b 复核原因留档', out2.issues[0].includes('置信度') && out2.issues[0].includes('60'));

  /* F8 黑盒不达标 → 回炉重蒸 → 复测通过（19 calls） */
  let judgeN = 0;
  mkFetch((n, u, opt) => { const b = String(opt && opt.body);
    if (!b || !b.includes('"model"')) return wikiOrApi(u);
    if (b.includes('验证官')) return resp(JSON.stringify({ score: 90, note: '好' }));
    if (b.includes('黑盒评测判卷官')) { judgeN++; return resp(JSON.stringify({ score: judgeN > 1 ? 85 : 60, issues: ['套话'] })); }
    return resp(DISTILL_JSON); });
  const out3 = await FY.nuwa.nuwaTrace({ name: '回炉人' });
  __ck('F8 黑盒<70→回炉重蒸（19 calls）', llm().length === 19);
  __ck('F8b 复测通过→ok 且 retried 留痕', out3.status === 'ok' && out3.match === 85 && out3.retried === true);
  const tr3 = FY.nuwa.traceList().find(t => t.name === '回炉人');
  __ck('F8c 回炉节点与复测节点留档', tr3.nodes.some(x => x.id === 'redistill') && tr3.probe.retried === true);

  /* F9 traceSync 合并 / skills 降级 */
  globalThis.fetch = async (url) => { if (String(url).includes('/api/traces')) return { ok: true, json: async () => ({ traces: [{ id: 'T-srv', name: '服务器人', t0: 9999, done: true, status: 'ok' }] }) }; return { ok: false, json: async () => null }; };
  const merged = await FY.nuwa.traceSync();
  __ck('F9 traceSync 拉取服务器并合并', merged.some(t => t.id === 'T-srv'));
  __ck('F9b 本地 trace 保留', merged.some(t => t.name === '回炉人'));
  globalThis.fetch = async () => ({ ok: false, json: async () => null });
  ok(Array.isArray(await FY.nuwa.skillsList()), 'skillsList 可用');
  await FY.nuwa.skillSave({ id: 'sk_l1', name: '本地人', skillMd: '---' });
  __ck('F9c 服务不可达 skill 降级 localStorage', (await FY.nuwa.skillsList()).some(s => s.id === 'sk_l1'));
  await FY.nuwa.skillDel('sk_l1');
  __ck('F9d skillDel 生效', !(await FY.nuwa.skillsList()).some(s => s.id === 'sk_l1'));
} catch (e) { fail++; fails.push('F 组执行'); console.log('  \x1b[31m✗\x1b[0m F 组执行 — ' + e.message); } })();

/* ============================================================
   [G] 修复回归：瀑布图问答样例渲染（admin）+ 详情弹层禁忌/盲区行（APP）
   ============================================================ */
console.log('\n[G] 修复回归（瀑布图 qa 渲染 · 详情弹层禁忌/盲区）');
const GAels = {}, GBels = {};
/* G 组自带全局兜底（B 组已改异步，此组同步执行时全局可能尚未就绪） */
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
if (typeof globalThis.matchMedia !== 'function') globalThis.matchMedia = () => ({ matches: false });
if (!globalThis.location) globalThis.location = { hash: '' };
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:x';
/* G1-G2：nuwaWaterfall 黑盒 qa 三态（document/localStorage 参数遮蔽全局，零污染） */
new Function('document', 'localStorage', 'sessionStorage', coreJs + '\n' + adminJs + `
const ck=(n,c)=>__ck(n,c);
const NODES=[{id:'six',label:'六路采集',status:'ok',ms:12000},{id:'distill',label:'女娲蒸馏',status:'ok',ms:11000,ok:true},
  {id:'verify',label:'三路验证',status:'ok',ms:8500,cross:84,gen:80,excl:82},{id:'sanitize',label:'清洗回填',status:'ok',ms:500,models:2}];
const BASE={name:'演示·商业导师',dir:'商业',t0:Date.now(),done:true,totalMs:42000,conf:82,degraded:false,
  mind:{models:[{n:'漏斗拆解',d:'拆解'}],heuristics:['先算账'],dna:['反问'],taboos:['不说空话'],blind:'线下不熟',bound:'仅公开资料'},
  tok:{tin:24000,tout:6800,calls:14}};
/* G1 带 qa 的 ok Trace：3 条样例 + ↳ 实答 + esc 转义 + 黑盒口径 */
const T1=Object.assign({},BASE,{id:'T1',status:'ok',retried:false,
  probe:{score:86,issues:['个别回答偏泛'],qa:[{q:'如何看待烧钱换增长?<b>',a:'先算单位经济模型。'},{q:'团队怎么招?',a:'漏斗瓶颈在哪人就补在哪。'},{q:'怎么转型?',a:'第二曲线要提前启动。'}],retried:false},
  nodes:NODES.concat([{id:'probe',label:'黑盒评测',status:'ok',ms:10000,score:86,issues:['个别回答偏泛']}])});
const h1=nuwaWaterfall(T1);
ck('G1 瀑布图渲染 3 条问答样例',(h1.match(/Q1 · /g)||[]).length===1&&h1.includes('Q2 · ')&&h1.includes('Q3 · '));
ck('G1b 回答带 ↳ 实答前缀',h1.includes('↳ 先算单位经济模型。'));
ck('G1c qa 内容经 esc 转义（防注入）',h1.includes('&lt;b&gt;')&&!h1.includes('<b>'));
ck('G1d Token 行含「+ 黑盒 4」口径',h1.includes('Token：输入')&&h1.includes('+ 黑盒 4')&&!h1.includes('+ 回炉 5'));
/* G2 qa 空数组：不渲染问答块；gate 节点原因仍显示 */
const T2=Object.assign({},BASE,{id:'T2',status:'review',reviewReason:'置信度 52 < 60',
  probe:{score:52,issues:[],qa:[],retried:false},
  nodes:NODES.concat([{id:'gate',label:'复核门槛',status:'review',ms:0,reason:'置信度 52 < 60'}])});
const h2=nuwaWaterfall(T2);
ck('G2 qa 空→不渲染问答块',!h2.includes('Q1 · '));
ck('G2b 复核门槛节点渲染跳过原因',h2.includes('复核门槛')&&h2.includes('52 &lt; 60'));
/* G2c probe null（复核门槛跳过黑盒）：无问答块、无黑盒口径 */
const h3=nuwaWaterfall(Object.assign({},BASE,{id:'T3',status:'review',probe:null}));
ck('G2c probe null→无问答块无黑盒口径',!h3.includes('↳')&&!h3.includes('+ 黑盒 4'));
`)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: id => (GAels[id] = GAels[id] || mkEl()), createElement: mkEl, body: mkEl() }, mkStore(), mkStore());
/* G3-G5：openChar 详情弹层思维内核行（禁忌/盲区有无两态，旧数据兼容） */
new Function('document', 'localStorage', coreJs + `
const ck=(n,c)=>__ck(n,c);
const CHARS={};const SOURCES=[];const charToDesk=()=>{};const adoptAdmin=()=>{};const adoptPub=()=>{};const openSheet=()=>{};
const FIELD_ICON={};const flatBadge=c=>'';  /* G 组桩环境补角标桩（openChar 内 avatar 角标引用） */
let CHARS_TEST={};const getChar=id=>CHARS_TEST[id];
${segChar[0]}
const mkChar=m=>Object.assign({id:'x',name:'演示·商业导师',title:'操盘手',emoji:'🪑',c1:'#fff',c2:'#000',field:'商业',tags:['增长'],quote:'先算账。'},m);
const src=()=>document.getElementById('cd-src').innerHTML;
/* G3 全量思维内核：禁忌 + 盲区行渲染，原有行无回归 */
CHARS_TEST.c1=mkChar({conf:82,mind:{models:[{n:'漏斗拆解',d:'拆解'}],heuristics:['先算账'],dna:['反问'],taboos:['不说空话','不画饼'],blind:'线下渠道不熟',bound:'仅公开资料'}});
openChar('c1');
ck('G3 详情弹层渲染禁忌行',src().includes('禁忌/反模式')&&src().includes('不说空话 · 不画饼'));
ck('G3b 渲染认知盲区行',src().includes('认知盲区')&&src().includes('线下渠道不熟'));
ck('G3c 原有思维内核行无回归',['心智模型','决策启发式','表达DNA','置信度','诚实边界'].every(s=>src().includes(s)));
ck('G3d 档案标签为思维内核（女娲蒸馏）',document.getElementById('cd-srclabel').textContent==='思维内核（女娲蒸馏）');
/* G4 旧数据无 taboos/blind：不显示空行 */
CHARS_TEST.c2=mkChar({conf:70,mind:{models:[{n:'漏斗',d:'x'}],heuristics:['h'],dna:['d'],blind:'',bound:''}});
openChar('c2');
ck('G4 旧数据无禁忌/盲区→不显示空行',!src().includes('禁忌/反模式')&&!src().includes('认知盲区')&&src().includes('置信度'));
/* G5 taboos 空数组但 blind 有值：只显盲区行 */
CHARS_TEST.c3=mkChar({mind:{models:[],heuristics:[],dna:[],taboos:[],blind:'只剩盲区',bound:''}});
openChar('c3');
ck('G5 taboos 空数组+blind 有值→只显盲区',!src().includes('禁忌/反模式')&&src().includes('认知盲区')&&src().includes('只剩盲区'));
`)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: id => (GBels[id] = GBels[id] || { style: {}, dataset: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } }), createElement: mkEl, body: mkEl() }, mkStore());

/* ============================================================
   [H] 官方老友跨设备同步：push 全量负载 / pull 三态 / boot 刷新 / 开桌候选池
   ============================================================ */
console.log('\n[H] 官方老友同步（push 负载 · pull 三态 · boot 刷新 · 候选池）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 250));
  const HY = new Function(coreJs + ';return YLN;')();
  let calls = [];
  const mkHFetch = fn => { calls = []; globalThis.fetch = async (url, opt) => { calls.push({ url: String(url || ''), opt }); return fn(String(url || ''), opt); }; };
  /* H1 push：管理员 Bearer + POST /api/chars 全量负载 */
  HY.adminAuth.setToken('adm_h');
  mkHFetch(() => ({ ok: true, json: async () => ({ ok: true }) }));
  await HY.adminCharsPush([{ id: 'a1', name: '甲', published: true }, { id: 'a2', name: '乙', published: false }]);
  const pc = calls.find(c => c.url === '/api/chars' && c.opt && c.opt.method === 'POST');
  __ck('H1 push 管理员鉴权 + 全量负载', !!pc && pc.opt.headers.Authorization === 'Bearer adm_h' && JSON.parse(pc.opt.body).chars.length === 2 && JSON.parse(pc.opt.body).chars[0].id === 'a1');
  /* H2 pull：服务器有数据 → 以服务器为准覆盖本地 */
  mkHFetch(() => ({ ok: true, json: async () => ({ chars: [{ id: 'srv1', name: '服务器人', published: true }] }) }));
  HY.saveAdminChars([{ id: 'old1', name: '本地旧人' }]);
  const p2 = await HY.adminCharsPull();
  __ck('H2 pull 服务器为准覆盖本地', p2.length === 1 && p2[0].id === 'srv1' && HY.adminChars()[0].id === 'srv1');
  /* H3 pull：服务器空表 + 本地有数据 → seeding 推送 */
  mkHFetch((u, opt) => ({ ok: true, json: async () => (opt && opt.method === 'POST') ? { ok: true } : { chars: [] } }));
  HY.saveAdminChars([{ id: 'loc1', name: '本地种子', published: true }]);
  const p3 = await HY.adminCharsPull();
  const seedCall = calls.find(c => c.opt && c.opt.method === 'POST');
  __ck('H3 服务器空表→仅管理员 seeding 推送', p3.length === 1 && p3[0].id === 'loc1' && !!seedCall && seedCall.opt.headers.Authorization === 'Bearer adm_h' && JSON.parse(seedCall.opt.body).chars[0].id === 'loc1');
  HY.adminAuth.setToken('');
  mkHFetch((u, opt) => ({ ok: true, json: async () => (opt && opt.method === 'POST') ? { ok: true } : { chars: [] } }));
  await HY.adminCharsPull();
  __ck('H3b 无管理员 token→只读不播种', !calls.some(c => c.opt && c.opt.method === 'POST'));
  HY.adminAuth.setToken('adm_h');
  /* H4 pull：服务不可达 → 返回 null（与服务器空表区分），本地保留不丢 */
  mkHFetch(() => { throw new Error('down'); });
  const p4 = await HY.adminCharsPull();
  __ck('H4 服务不可达→null 且本地保留', p4 === null && HY.adminChars().length === 1 && HY.adminChars()[0].id === 'loc1');
  /* H5-H8 开桌候选池 + 官方老友自动收入（index.html 段） */
  {
    const saveCount = { n: 0 };
    new Function('document', 'localStorage', coreJs + `
    const ck=(n,c)=>__ck(n,c);
    let charOrder=['jobs'];const CHARS={jobs:{short:'乔'}};
    const REALS=[{id:'r1',name:'真友'}];
    let ADMIN_CHARS=[{id:'adm1',name:'官方甲',published:true},{id:'adm2',name:'官方乙',published:false},{id:'adm3',name:'官方丙',published:true}];
    globalThis.__Hsave={n:0};const saveChars=()=>{globalThis.__Hsave.n++};
    ${segPool[0]}
    ck('H5 候选池=我的老友+真友+已发布官方(未发布不进)', JSON.stringify(deskPool())===JSON.stringify(['jobs','r1','adm1','adm3']));
    CHARS.adm1={...ADMIN_CHARS[0],official:true};charOrder.push('adm1');
    ck('H6 已收入副本不重复进池', deskPool().filter(x=>x==='adm1').length===1);
    ensureAdopted('adm3');
    ck('H7 ensureAdopted 收入并打 official 标记', !!CHARS.adm3&&CHARS.adm3.official===true&&charOrder.includes('adm3')&&globalThis.__Hsave.n===1);
    ensureAdopted('r1');ensureAdopted('ghost');
    ck('H8 真友/未知 id 不误收', !CHARS.r1&&!CHARS.ghost&&globalThis.__Hsave.n===1);
    `)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() }, mkStore());
    ok(saveCount.n === 0, '沙箱隔离');
  }
  /* H9 boot 同步段：拉取→刷新已收入副本字段→saveChars→renderFriends */
  {
    globalThis.localStorage = mkStore();
    const bootFetch = async () => ({ ok: true, json: async () => ({ chars: [{ id: 'adm_x', name: '服务器新名', published: true }] }) });
    await new Promise(res => {
      new Function('document', 'localStorage', 'fetch', coreJs + `
      const CHARS={adm_x:{id:'adm_x',official:true,short:'旧名',name:'旧名',title:'t',emoji:'E',c1:'#111',c2:'#222',tint:'#333',deep:'#444',field:'科技',quote:'旧',tags:['a'],conf:50}};
      const REALS=[];const loadAdminChars=()=>{};
      globalThis.__Hb={saved:false,refreshed:false};
      const saveChars=()=>{globalThis.__Hb.saved=true};
      const renderFriends=()=>{globalThis.__Hb.refreshed=true};
      ${segBoot[0]}
      `)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() }, mkStore(), bootFetch);
      setTimeout(res, 300);
    });
    __ck('H9 boot 同步刷新已收入副本并触发渲染', globalThis.__Hb && globalThis.__Hb.saved && globalThis.__Hb.refreshed);
    globalThis.localStorage = mkStore();
  }

  /* H10-H13 APP 官方库只读同步（播种仅管理后台） */
  {
    /* H10 服务器缺内置老友 → APP 不补种，已有副本仍接受后台编辑 */
    const st10 = mkStore();
    let posted = null;
    const bootFetch = async (url, opt) => {
      if (opt && opt.method === 'POST') { posted = JSON.parse(opt.body); return { ok: true, json: async () => ({ ok: true }) }; }
      return { ok: true, json: async () => ({ chars: [{ id: 'builtin_one', name: '后台改过的内置一', published: true }, { id: 'adm_x', name: '官方甲', published: true }] }) };
    };
    await new Promise(res => {
      new Function('document', 'localStorage', 'fetch', coreJs + `
      const CHARS={builtin_one:{id:'builtin_one',short:'内一',name:'内置一',title:'t',emoji:'E',c1:'#111',c2:'#222',tint:'#333',deep:'#444',field:'科技',quote:'q',tags:['a']},builtin_two:{id:'builtin_two',short:'内二',name:'内置二',title:'t2',emoji:'E2',c1:'#555',c2:'#666',tint:'#777',deep:'#888',field:'商业',quote:'q2',tags:['b']}};
      const REALS=[];const loadAdminChars=()=>{};
      globalThis.__Hb2={saved:false};const saveChars=()=>{globalThis.__Hb2.saved=true};
      const renderFriends=()=>{};
      ${segBoot[0]}
      `)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() }, st10, bootFetch);
      setTimeout(res, 300);
    });
    __ck('H10 APP 官方库只读→绝不 POST 播种', !posted);
    __ck('H10b 本地内置副本按服务器刷新（后台编辑下发生效）', globalThis.__Hb2.saved);

    /* H11 服务器已含全部内置 → 幂等只读，无旧播种标记 */
    const st11 = mkStore();
    let posted11 = 0;
    const bootFetch11 = async (url, opt) => {
      if (opt && opt.method === 'POST') { posted11++; return { ok: true, json: async () => ({ ok: true }) }; }
      return { ok: true, json: async () => ({ chars: [{ id: 'builtin_one', published: true }, { id: 'builtin_two', published: true }] }) };
    };
    await new Promise(res => {
      new Function('document', 'localStorage', 'fetch', coreJs + `
      const CHARS={builtin_one:{id:'builtin_one',short:'内一',name:'内置一'},builtin_two:{id:'builtin_two',short:'内二',name:'内置二'}};
      const REALS=[];const loadAdminChars=()=>{};const saveChars=()=>{};const renderFriends=()=>{};
      ${segBoot[0]}
      `)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() }, st11, bootFetch11);
      setTimeout(res, 300);
    });
    __ck('H11 已含全部内置→幂等 0 推送', posted11 === 0
      && !st11.getItem('yln_builtin_seeded'));

    /* H12 服务不可达 → 不播种不写标记（防止降级 GET 后误 POST 清空服务器） */
    const st12 = mkStore();
    let posted12 = 0;
    const bootFetch12 = async (url, opt) => { if (opt && opt.method === 'POST') { posted12++; return { ok: true, json: async () => ({ ok: true }) }; } throw new Error('down'); };
    await new Promise(res => {
      new Function('document', 'localStorage', 'fetch', coreJs + `
      const CHARS={builtin_one:{id:'builtin_one',short:'内一',name:'内置一'}};
      const REALS=[];const loadAdminChars=()=>{};const saveChars=()=>{};const renderFriends=()=>{};
      ${segBoot[0]}
      `)({ querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() }, st12, bootFetch12);
      setTimeout(res, 300);
    });
    __ck('H12 服务不可达→不 POST 且保留本地降级', posted12 === 0
      && !st12.getItem('yln_builtin_seeded'));
  }

  /* H13 后台内置老友删除→下架保护（charDel source=builtin 分支） */
  t('H13 charDel 对内置老友走下架而非物理删除', () => {
    ok(/source==='builtin'/.test(adminJs), 'charDel 应含内置来源分支');
    ok(/内置老友不可删除/.test(adminJs) && /cs\[i\]\.published=false/.test(adminJs), '内置老友删除应改为下架');
  });
} catch (e) { fail++; fails.push('H 组执行'); console.log('  \x1b[31m✗\x1b[0m H 组执行 — ' + e.message); } })();

/* ============================================================
   [I] P0 鉴权客户端（YLN.auth · token 生命周期）
   ============================================================ */
console.log('\n[I] P0 鉴权客户端（token 生命周期）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 100));
  const rok = j => ({ ok: true, json: async () => j });
  const rerr = (status, j) => ({ ok: false, status, json: async () => j });
  let cur = async () => rok({ ok: true });                 /* 当前路由（可按用例切换） */
  let calls = [];
  const disp = async (u, o) => cur(String(u || ''), o || {});
  const IY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
    mkStore(), disp);
  const setRoute = fn => { calls = []; cur = async (u, o) => { calls.push({ url: String(u || ''), opt: o || {} }); return fn(String(u || ''), o || {}); }; };

  /* I1 无 token：me() 直接 null 且不发请求 */
  setRoute(() => rok({ ok: true }));
  __ck('I1 无 token→me() null 且 0 请求', (await IY.auth.me()) === null && calls.length === 0);

  /* I2 signup 成功 → token 落地，后续请求自动带 Bearer */
  setRoute((u) => u === '/api/auth/signup'
    ? rok({ ok: true, token: 'tk_i1', user: { id: 'uI1', nick: '甲', email: 'i@x.com' } }) : rok({ ok: true }));
  const s1 = await IY.auth.signup('甲', 'i@x.com', '1234');
  __ck('I2 signup 成功→token 落地', s1.ok === true && IY.auth.token() === 'tk_i1');
  setRoute(() => rok({ ok: true, user: { id: 'uI1', nick: '甲' } }));
  const mu = await IY.auth.me();
  __ck('I2b me() 返回用户且自动带 Bearer', !!mu && mu.id === 'uI1' && calls[0].opt.headers.Authorization === 'Bearer tk_i1');

  /* I3 me() 401 → token 失效清除 */
  setRoute(() => rerr(401, { ok: false, err: '未登录' }));
  __ck('I3 401→token 清除', (await IY.auth.me()) === null && IY.auth.token() === '');

  /* I4 me() 网络失败 → token 保留、返回 null（下次再试） */
  IY.auth.setToken('tk_keep');
  setRoute(() => { throw new Error('down'); });
  __ck('I4 网络失败→token 保留', (await IY.auth.me()) === null && IY.auth.token() === 'tk_keep');

  /* I5 服务器拒绝 → {ok:false,err} 透传且不动旧 token */
  setRoute(() => rerr(400, { ok: false, err: '密码至少 4 位' }));
  const s5 = await IY.auth.signup('乙', 'j@x.com', '1');
  __ck('I5 拒绝响应透传且不动旧 token', s5 && s5.ok === false && s5.err === '密码至少 4 位' && IY.auth.token() === 'tk_keep');

  /* I6 logout：网络失败也幂等清 token */
  setRoute(() => { throw new Error('down'); });
  await IY.auth.logout();
  __ck('I6 logout 网络失败仍清 token', IY.auth.token() === '');

  /* I7 logout 正常路径 → 发起撤销请求 */
  IY.auth.setToken('tk_bye');
  setRoute(() => rok({ ok: true }));
  await IY.auth.logout();
  __ck('I7 logout 撤销会话请求', IY.auth.token() === '' && calls.some(c => c.url === '/api/auth/logout' && c.opt.method === 'POST'));
} catch (e) { fail++; fails.push('I 组执行'); console.log('  \x1b[31m✗\x1b[0m I 组执行 — ' + e.message); } })();

/* ============================================================
   [J] P1 钱包跨端同步（walletSave 写穿 / walletPull LWW 合并）
   ============================================================ */
console.log('\n[J] P1 钱包跨端同步（写穿 + LWW 合并）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 100));
  const rok = j => ({ ok: true, json: async () => j });
  let cur = async () => rok({ ok: true });
  let calls = [];
  const disp = async (u, o) => cur(String(u || ''), o || {});
  const st = mkStore();
  /* 预置官网登录态（裸 id session + 用户表），供 walletSiteWrite 写穿验证 */
  st.setItem('yln_site_users', JSON.stringify([{ id: 'uJ1', nick: '甲', email: 'j@x.com', points: 0, coupons: 0, plan: null }]));
  st.setItem('yln_site_session', JSON.stringify('uJ1'));
  const JY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
    st, disp);
  const setRoute = fn => { calls = []; cur = async (u, o) => { calls.push({ url: String(u || ''), opt: o || {} }); return fn(String(u || ''), o || {}); }; };
  const postWallet = () => calls.find(c => c.url === '/api/wallet' && c.opt && c.opt.method === 'POST');

  /* J1 无 token：walletSave 仅落本地并盖章，不发服务器请求 */
  setRoute(() => rok({ ok: true }));
  const w0 = { plan: 'free', points: 10, coupons: 5, freeSpeaks: 3, freeDesk: 1, ledger: [] };
  JY.walletSave(w0);
  await new Promise(r => setTimeout(r, 20));
  __ck('J1 无 token→walletSave 仅本地+盖章 0 请求', calls.length === 0 && typeof w0.updated === 'number'
    && JSON.parse(st.getItem('yln_wallet')).points === 10);

  /* J2 有 token：walletSave 自动 POST /api/wallet 且带 Bearer */
  JY.auth.setToken('tk_j1');
  w0.points = 30;
  JY.walletSave(w0);
  await new Promise(r => setTimeout(r, 20));
  const pw = postWallet();
  __ck('J2 有 token→walletSave POST 且带 Bearer', !!pw && pw.opt.headers.Authorization === 'Bearer tk_j1'
    && JSON.parse(pw.opt.body).wallet.points === 30);

  /* J3 walletPull 无 token → null 且 0 请求 */
  JY.auth.setToken('');
  setRoute(() => rok({ ok: true, wallet: null }));
  __ck('J3 无 token→walletPull null 且 0 请求', (await JY.walletPull('j@x.com')) === null && calls.length === 0);

  /* J4 服务不可达 → null，本地不动 */
  JY.auth.setToken('tk_j2');
  setRoute(() => { throw new Error('down'); });
  const before = JY.walletLoad();
  __ck('J4 停机→walletPull null 本地保留', (await JY.walletPull('j@x.com')) === null
    && JY.walletLoad().points === before.points);

  /* J5 服务器较新 → 采回本地 + 官网账号写穿 + 不回推 */
  setRoute(() => rok({ ok: true, wallet: { plan: 'plus', points: 2000, coupons: 4, freeSpeaks: 3, freeDesk: 1, ledger: [], updated: 9999 } }));
  const loc5 = JY.walletLoad(); loc5.points = 100; loc5.synced = 'j@x.com'; loc5.updated = 1111; JY.jsave(JY.K.wallet, loc5);
  const w5 = await JY.walletPull('j@x.com');
  const su5 = JY.siteUser();
  __ck('J5 服务器较新→采回+写穿官网+不回推', !!w5 && w5.points === 2000 && w5.plan === 'plus'
    && !!su5 && su5.points === 2000 && !postWallet());

  /* J6 本地较新（离线改动）→ 推送本地覆盖服务器 */
  setRoute(() => rok({ ok: true, wallet: { plan: 'free', points: 5, coupons: 5, ledger: [], updated: 1111 } }));
  const loc6 = JY.walletLoad(); loc6.points = 77; loc6.updated = 8888; loc6.synced = 'j@x.com'; JY.jsave(JY.K.wallet, loc6);
  const w6 = await JY.walletPull('j@x.com');
  __ck('J6 本地较新→推送本地', !!w6 && w6.points === 77 && !!postWallet()
    && JSON.parse(postWallet().opt.body).wallet.points === 77);

  /* J7 服务器无记录 + 本地有 → 播种推送 */
  setRoute(() => rok({ ok: true, wallet: null }));
  const w7 = await JY.walletPull('j@x.com');
  __ck('J7 服务器无记录→本地播种推送', !!w7 && w7.points === 77 && !!postWallet());

  /* J8 服务器较新 + 本地游客未并入 → 资产加和并回推 */
  setRoute(() => rok({ ok: true, wallet: { plan: 'free', points: 2000, coupons: 4, ledger: [], updated: 9999 } }));
  const loc8 = JY.walletLoad(); delete loc8.synced; loc8.points = 100; loc8.coupons = 5; loc8.updated = 1111; JY.jsave(JY.K.wallet, loc8);
  const w8 = await JY.walletPull('j@x.com');
  __ck('J8 游客资产首并→加和回推', !!w8 && w8.points === 2100 && w8.coupons === 9 && w8.synced === 'j@x.com' && !!postWallet());

  /* J9 服务器较新 + 已并入 → 原样采用不加和（重置本地时间戳，模拟"钱包未被本地动过"） */
  setRoute(() => rok({ ok: true, wallet: { plan: 'free', points: 500, coupons: 2, ledger: [], updated: 9999 } }));
  const loc9 = JY.walletLoad(); loc9.updated = 1111; JY.jsave(JY.K.wallet, loc9);
  const w9 = await JY.walletPull('j@x.com');
  __ck('J9 已并入→原样采用不加和', !!w9 && w9.points === 500 && !postWallet());

  /* J10 服务器无记录 + 本地是他人账号残留钱包 → 不播种（防跨账号资产污染） */
  setRoute(() => rok({ ok: true, wallet: null }));
  const loc10 = JY.walletLoad(); loc10.points = 888; loc10.synced = 'other@x.com'; loc10.updated = 1111; JY.jsave(JY.K.wallet, loc10);
  __ck('J10 他人账号残留→不播种', (await JY.walletPull('j@x.com')) === null && !postWallet());

  /* J11 时间戳相同（同一次写入，同浏览器充值后首拉）→ 原样采用不加和 */
  setRoute(() => rok({ ok: true, wallet: { plan: 'plus', points: 2000, coupons: 4, ledger: [], updated: 5555 } }));
  const loc11 = JY.walletLoad(); delete loc11.synced; loc11.points = 2000; loc11.updated = 5555; JY.jsave(JY.K.wallet, loc11);
  const w11 = await JY.walletPull('j@x.com');
  __ck('J11 同戳同源→采用不加和', !!w11 && w11.points === 2000 && !postWallet() && w11.synced === 'j@x.com');
} catch (e) { fail++; fails.push('J 组执行'); console.log('  \x1b[31m✗\x1b[0m J 组执行 — ' + e.message); } })();

/* ============================================================
   [K] P2 私有老友跨端同步（savePrivateChars 写穿 / privateCharsPull LWW 合并）
   ============================================================ */
console.log('\n[K] P2 私有老友跨端同步（写穿 + LWW 合并）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 100));
  const rok = j => ({ ok: true, json: async () => j });
  let cur = async () => rok({ ok: true });
  let calls = [];
  const disp = async (u, o) => cur(String(u || ''), o || {});
  const st = mkStore();
  const KY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
    st, disp);
  const setRoute = fn => { calls = []; cur = async (u, o) => { calls.push({ url: String(u || ''), opt: o || {} }); return fn(String(u || ''), o || {}); }; };
  const postChars = () => calls.find(c => c.url === '/api/my/chars' && c.opt && c.opt.method === 'POST');
  const getChars = () => JSON.parse(st.getItem('yln_chars') || '{}');
  const getMeta = () => JSON.parse(st.getItem('yln_chars_meta') || '{}');

  /* K1 无 token：savePrivateChars 仅落本地并盖章，不发服务器请求 */
  setRoute(() => rok({ ok: true }));
  KY.savePrivateChars({ nuwa_a: { id: 'nuwa_a', name: '捏的老友' } });
  await new Promise(r => setTimeout(r, 20));
  __ck('K1 无 token→savePrivateChars 仅本地+盖章 0 请求', calls.length === 0
    && getChars().nuwa_a.name === '捏的老友' && typeof getMeta().updated === 'number');

  /* K2 有 token：savePrivateChars 自动 POST 写穿，official 老友被剔除（私有同步只带 nuwa_ 前缀与 owner 老友） */
  KY.auth.setToken('tk_k1');
  KY.savePrivateChars({ nuwa_a: { id: 'nuwa_a', name: '捏的老友' }, jobs: { id: 'jobs', name: '官方', official: true } });
  await new Promise(r => setTimeout(r, 20));
  const pk = postChars();
  const pkBody = pk ? JSON.parse(pk.opt.body) : null;
  __ck('K2 有 token→POST 写穿且 official 被剔除', !!pk && pk.opt.headers.Authorization === 'Bearer tk_k1'
    && !!pkBody.chars.nuwa_a && !pkBody.chars.jobs && pkBody.updated === getMeta().updated);

  /* K3 无 token → privateCharsPull null 且 0 请求 */
  KY.auth.setToken('');
  setRoute(() => rok({ ok: true, chars: null, updated: 0 }));
  __ck('K3 无 token→privateCharsPull null 0 请求', (await KY.privateCharsPull('k@x.com')) === null && calls.length === 0);

  /* K4 停机 → null 本地保留 */
  KY.auth.setToken('tk_k2');
  setRoute(() => { throw new Error('down'); });
  const nm4 = getChars().nuwa_a.name;
  __ck('K4 停机→privateCharsPull null 本地保留', (await KY.privateCharsPull('k@x.com')) === null
    && getChars().nuwa_a.name === nm4);

  /* K5 服务器无记录 + 本地私有老友 → 播种推送（official 不入库） */
  setRoute(() => rok({ ok: true, chars: null, updated: 0 }));
  const r5 = await KY.privateCharsPull('k@x.com');
  const pk5 = postChars();
  __ck('K5 服务器无记录→本地播种推送', !!r5 && !!pk5 && !!JSON.parse(pk5.opt.body).chars.nuwa_a
    && !JSON.parse(pk5.opt.body).chars.jobs && getMeta().synced === 'k@x.com');

  /* K6 服务器无记录 + 本地是他人账号残留 → 不播种（防跨账号污染） */
  KY.jsave('yln_chars', { nuwa_x: { id: 'nuwa_x', name: '别人的' } });
  KY.jsave('yln_chars_meta', { updated: 1111, synced: 'other@x.com' });
  setRoute(() => rok({ ok: true, chars: null, updated: 0 }));
  __ck('K6 他人账号残留→不播种', (await KY.privateCharsPull('k@x.com')) === null && !postChars());

  /* K7 服务器较新 → 采回本地不回推 */
  setRoute(() => rok({ ok: true, chars: { nuwa_srv: { id: 'nuwa_srv', name: '服务器捏的', quote: 'q' } }, updated: 9999 }));
  KY.jsave('yln_chars_meta', { updated: 1111, synced: 'k@x.com' });
  const r7 = await KY.privateCharsPull('k@x.com');
  __ck('K7 服务器较新→采回不回推', !!r7 && r7.nuwa_srv.name === '服务器捏的' && !!getChars().nuwa_srv
    && getMeta().updated === 9999 && !postChars());

  /* K8 本地较新（离线捏人）→ 推送覆盖服务器 */
  setRoute(() => rok({ ok: true, chars: { nuwa_srv: { id: 'nuwa_srv', name: '旧' } }, updated: 1111 }));
  KY.jsave('yln_chars', { nuwa_new: { id: 'nuwa_new', name: '离线捏的' } });
  KY.jsave('yln_chars_meta', { updated: 8888, synced: 'k@x.com' });
  const r8 = await KY.privateCharsPull('k@x.com');
  const pk8 = postChars();
  __ck('K8 本地较新→推送本地', !!r8 && r8.nuwa_new.name === '离线捏的' && !!pk8
    && JSON.parse(pk8.opt.body).chars.nuwa_new.name === '离线捏的');

  /* K9 服务器较新 + 本地游客老友未并入 → 并入账号回推 */
  setRoute(() => rok({ ok: true, chars: { nuwa_srv: { id: 'nuwa_srv', name: '服务器捏的' } }, updated: 9999 }));
  KY.jsave('yln_chars', { nuwa_guest: { id: 'nuwa_guest', name: '游客捏的' } });
  KY.jsave('yln_chars_meta', { updated: 1111, synced: null });
  const r9 = await KY.privateCharsPull('k@x.com');
  const pk9 = postChars();
  __ck('K9 游客老友首并→并入回推', !!r9 && !!r9.nuwa_srv && r9.nuwa_guest.name === '游客捏的'
    && !!pk9 && !!JSON.parse(pk9.opt.body).chars.nuwa_guest && getMeta().synced === 'k@x.com');

  /* K10 服务器较新 + 已并入 → 原样采用不加和 */
  setRoute(() => rok({ ok: true, chars: { nuwa_srv: { id: 'nuwa_srv', name: '服务器捏的' } }, updated: 9999 }));
  KY.jsave('yln_chars', { nuwa_srv: { id: 'nuwa_srv', name: '服务器捏的' } });
  KY.jsave('yln_chars_meta', { updated: 1111, synced: 'k@x.com' });
  const r10 = await KY.privateCharsPull('k@x.com');
  __ck('K10 已并入→原样采用不加和', !!r10 && r10.nuwa_srv.name === '服务器捏的' && !postChars()
    && getMeta().updated === 9999);

  /* K11 setPrompt/resetPrompt 管理员写穿（reset 发空 text=删覆盖） */
  KY.auth.setToken('');KY.adminAuth.setToken('adm_k');
  setRoute(() => rok({ ok: true }));
  KY.nuwa.setPrompt('six', '自定义采集模板');
  KY.nuwa.resetPrompt('six');
  await new Promise(r => setTimeout(r, 20));
  const pp = calls.filter(c => c.url === '/api/nuwa/prompts' && c.opt.method === 'POST');
  __ck('K11 setPrompt/resetPrompt 管理员写穿', pp.length === 2
    && pp.every(c => c.opt.headers.Authorization === 'Bearer adm_k')
    && JSON.parse(pp[0].opt.body).text === '自定义采集模板'
    && JSON.parse(pp[1].opt.body).text === '');
  KY.adminAuth.setToken('');

  /* K12 promptsPull：服务器为准全量替换本地覆盖；停机 null 本地保留 */
  setRoute(() => rok({ ok: true, prompts: { six: '服务器模板' } }));
  const p12 = await KY.nuwa.promptsPull();
  __ck('K12 promptsPull 服务器为准', !!p12 && p12.six === '服务器模板'
    && JSON.parse(st.getItem('yln_nuwa_prompts')).six === '服务器模板');
  setRoute(() => { throw new Error('down'); });
  KY.jsave('yln_nuwa_prompts', { distill: '本地模板' });
  __ck('K12b 停机→promptsPull null 本地保留', (await KY.nuwa.promptsPull()) === null
    && JSON.parse(st.getItem('yln_nuwa_prompts')).distill === '本地模板');
} catch (e) { fail++; fails.push('K 组执行'); console.log('  \x1b[31m✗\x1b[0m K 组执行 — ' + e.message); } })();

/* ============================================================
   [L] P3 圆桌跨端同步（saveRoundsCloud 写穿 / roundsPull LWW 合并）
   ============================================================ */
console.log('\n[L] P3 圆桌跨端同步（写穿 + LWW 合并）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 150));
  const rok = j => ({ ok: true, json: async () => j });
  let cur = async () => rok({ ok: true });
  let calls = [];
  const disp = async (u, o) => cur(String(u || ''), o || {});
  const st = mkStore();
  const LY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
    st, disp);
  const setRoute = fn => { calls = []; cur = async (u, o) => { calls.push({ url: String(u || ''), opt: o || {} }); return fn(String(u || ''), o || {}); }; };
  const postRounds = () => calls.find(c => c.url === '/api/my/rounds' && c.opt && c.opt.method === 'POST');
  const getRounds = () => JSON.parse(st.getItem('yln_rounds') || '[]');
  const getRMeta = () => JSON.parse(st.getItem('yln_rounds_meta') || '{}');
  const R1 = { id: 'r1001', ts: 1001, topic: '要不要裸辞', chars: ['jobs', 'naval'], status: 'done', meta: '10:00 · 8 条发言' };

  /* L1 无 token：saveRoundsCloud 仅落本地并盖章，不发服务器请求 */
  setRoute(() => rok({ ok: true }));
  LY.saveRoundsCloud([R1]);
  await new Promise(r => setTimeout(r, 20));
  __ck('L1 无 token→saveRoundsCloud 仅本地+盖章 0 请求', calls.length === 0
    && getRounds().length === 1 && getRounds()[0].id === 'r1001' && typeof getRMeta().updated === 'number');

  /* L2 有 token：saveRoundsCloud 自动 POST 写穿（Bearer + 全量数组 + updated 戳） */
  LY.auth.setToken('tk_l1');
  LY.saveRoundsCloud([R1, { id: 'r1002', ts: 1002, topic: '第二桌', chars: ['jobs'], status: 'live', meta: 'm' }]);
  await new Promise(r => setTimeout(r, 20));
  const pl = postRounds();
  const plBody = pl ? JSON.parse(pl.opt.body) : null;
  __ck('L2 有 token→POST 写穿全量数组', !!pl && pl.opt.headers.Authorization === 'Bearer tk_l1'
    && Array.isArray(plBody.rounds) && plBody.rounds.length === 2 && plBody.updated === getRMeta().updated);

  /* L3 无 token → roundsPull null 且 0 请求 */
  LY.auth.setToken('');
  setRoute(() => rok({ ok: true, rounds: null, updated: 0 }));
  __ck('L3 无 token→roundsPull null 0 请求', (await LY.roundsPull('l@x.com')) === null && calls.length === 0);

  /* L4 停机 → null 本地保留 */
  LY.auth.setToken('tk_l2');
  setRoute(() => { throw new Error('down'); });
  __ck('L4 停机→roundsPull null 本地保留', (await LY.roundsPull('l@x.com')) === null
    && getRounds().length === 2 && getRounds()[0].id === 'r1001');

  /* L5 服务器无记录 + 本地有圆桌 → 播种推送 */
  setRoute(() => rok({ ok: true, rounds: null, updated: 0 }));
  const r5 = await LY.roundsPull('l@x.com');
  const pl5 = postRounds();
  __ck('L5 服务器无记录→本地播种推送', !!r5 && r5.length === 2 && !!pl5
    && JSON.parse(pl5.opt.body).rounds.length === 2 && getRMeta().synced === 'l@x.com');

  /* L6 服务器无记录 + 本地是他人账号残留 → 不播种（防跨账号污染） */
  LY.jsave('yln_rounds', [{ id: 'r9999', topic: '别人的桌' }]);
  LY.jsave('yln_rounds_meta', { updated: 1111, synced: 'other@x.com' });
  setRoute(() => rok({ ok: true, rounds: null, updated: 0 }));
  __ck('L6 他人账号残留→不播种', (await LY.roundsPull('l@x.com')) === null && !postRounds());

  /* L7 服务器较新 → 采回本地不回推 */
  setRoute(() => rok({ ok: true, rounds: [{ id: 'rSRV', ts: 9000, topic: '服务器开的桌', chars: ['jobs'], status: 'done' }], updated: 9999 }));
  LY.jsave('yln_rounds_meta', { updated: 1111, synced: 'l@x.com' });
  const r7 = await LY.roundsPull('l@x.com');
  __ck('L7 服务器较新→采回不回推', !!r7 && r7.length === 1 && r7[0].id === 'rSRV'
    && getRounds()[0].id === 'rSRV' && getRMeta().updated === 9999 && !postRounds());

  /* L8 本地较新（离线开桌/收官）→ 推送覆盖服务器 */
  setRoute(() => rok({ ok: true, rounds: [{ id: 'rOLD', ts: 1, topic: '旧' }], updated: 1111 }));
  LY.jsave('yln_rounds', [R1, { id: 'rNEW', ts: 8888, topic: '离线开的桌' }]);
  LY.jsave('yln_rounds_meta', { updated: 8888, synced: 'l@x.com' });
  const r8 = await LY.roundsPull('l@x.com');
  const pl8 = postRounds();
  __ck('L8 本地较新→推送本地', !!r8 && r8.length === 2 && r8[0].id === 'r1001' && !!pl8
    && JSON.parse(pl8.opt.body).rounds.some(x => x.id === 'rNEW'));

  /* L9 服务器较新 + 本地游客圆桌未并入 → 按 id 合并（本地优先）回推，新桌在前 */
  setRoute(() => rok({ ok: true, rounds: [{ id: 'rSRV', ts: 9000, topic: '服务器开的桌' }, { id: 'r1001', ts: 1001, topic: '服务器改名过' }], updated: 9999 }));
  LY.jsave('yln_rounds', [{ id: 'rGUEST', ts: 5000, topic: '游客开的桌' }, { id: 'r1001', ts: 1001, topic: '要不要裸辞' }]);
  LY.jsave('yln_rounds_meta', { updated: 1111, synced: null });
  const r9 = await LY.roundsPull('l@x.com');
  const pl9 = postRounds();
  __ck('L9 游客圆桌首并→id 合并回推本地优先', !!r9 && r9.length === 3 && r9[0].ts === 9000
    && r9.find(x => x.id === 'r1001').topic === '要不要裸辞' && !!r9.find(x => x.id === 'rGUEST')
    && !!pl9 && JSON.parse(pl9.opt.body).rounds.length === 3 && getRMeta().synced === 'l@x.com');

  /* L10 已并入 → 原样采用不回推 */
  setRoute(() => rok({ ok: true, rounds: [{ id: 'rSRV', ts: 9000, topic: '服务器开的桌' }], updated: 9999 }));
  LY.jsave('yln_rounds', [{ id: 'rSRV', ts: 9000, topic: '服务器开的桌' }]);
  LY.jsave('yln_rounds_meta', { updated: 1111, synced: 'l@x.com' });
  const r10 = await LY.roundsPull('l@x.com');
  __ck('L10 已并入→原样采用不回推', !!r10 && r10[0].id === 'rSRV' && !postRounds() && getRMeta().updated === 9999);
} catch (e) { fail++; fails.push('L 组执行'); console.log('  \x1b[31m✗\x1b[0m L 组执行 — ' + e.message); } })();

/* ============================================================
   [M] P4 偏好跨端同步（prefsSave 写穿 / prefsPull 服务器为准）
   ============================================================ */
console.log('\n[M] P4 偏好跨端同步（写穿 + 服务器为准）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 200));
  const rok = j => ({ ok: true, json: async () => j });
  let cur = async () => rok({ ok: true });
  let calls = [];
  const disp = async (u, o) => cur(String(u || ''), o || {});
  const st = mkStore();
  const MY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
    st, disp);
  const setRoute = fn => { calls = []; cur = async (u, o) => { calls.push({ url: String(u || ''), opt: o || {} }); return fn(String(u || ''), o || {}); }; };
  const postPrefs = () => calls.find(c => c.url === '/api/my/prefs' && c.opt && c.opt.method === 'POST');

  /* M1 无 token：prefsSave 仅落本地 0 请求 */
  setRoute(() => rok({ ok: true }));
  MY.prefsSave({ remind: false, sound: true });
  await new Promise(r => setTimeout(r, 20));
  __ck('M1 无 token→prefsSave 仅本地 0 请求', calls.length === 0
    && JSON.parse(st.getItem('yln_prefs')).sound === true);

  /* M2 有 token：prefsSave POST 写穿 */
  MY.auth.setToken('tk_m1');
  MY.prefsSave({ remind: false, sound: true, dark: true });
  await new Promise(r => setTimeout(r, 20));
  const pm = postPrefs();
  __ck('M2 有 token→POST 写穿', !!pm && pm.opt.headers.Authorization === 'Bearer tk_m1'
    && JSON.parse(pm.opt.body).prefs.dark === true);

  /* M3 无 token → prefsPull null 0 请求 */
  MY.auth.setToken('');
  setRoute(() => rok({ ok: true, prefs: null }));
  __ck('M3 无 token→prefsPull null 0 请求', (await MY.prefsPull()) === null && calls.length === 0);

  /* M4 停机 → null 本地保留 */
  MY.auth.setToken('tk_m2');
  setRoute(() => { throw new Error('down'); });
  __ck('M4 停机→prefsPull null 本地保留', (await MY.prefsPull()) === null
    && JSON.parse(st.getItem('yln_prefs')).dark === true);

  /* M5 服务器无记录 + 本地有偏好 → 播种推送（返回 null，无需套 UI） */
  setRoute(() => rok({ ok: true, prefs: null }));
  __ck('M5 服务器无记录→本地播种推送返回 null', (await MY.prefsPull()) === null
    && !!postPrefs() && JSON.parse(postPrefs().opt.body).prefs.sound === true);

  /* M6 服务器有记录 → 服务器为准覆盖本地并返回（供 UI 套用） */
  setRoute(() => rok({ ok: true, prefs: { remind: true, sound: false, dark: false } }));
  const p6 = await MY.prefsPull();
  __ck('M6 服务器为准覆盖本地', !!p6 && p6.remind === true && p6.sound === false
    && JSON.parse(st.getItem('yln_prefs')).remind === true);
} catch (e) { fail++; fails.push('M 组执行'); console.log('  \x1b[31m✗\x1b[0m M 组执行 — ' + e.message); } })();

/* ============================================================
   [N] 真人好友管理（后台 human 过滤 / 真人模式保存 / 手机端真友扩展 / 手动创建）
   ============================================================ */
console.log('\n[N] 真人好友管理（后台真人视图 · 手机端真友/手动创建 · 私有同步）');
(async () => { try {
  if (globalThis.__runCP) await globalThis.__runCP;
  await new Promise(r => setTimeout(r, 150));

  /* N1 老友管理过滤真人：AI 视图不混入 human 老友 */
  t('N1 后台老友管理过滤 human 真人', () => {
    ok(/adminChars\(\)\.filter\(c=>!c\.human\)/.test(adminJs), 'renderChars 应排除 human 老友');
  });

  /* N2 真人好友管理视图：注册用户数据源（真人=注册用户，不手工生成）+ 独立路由 */
  t('N2 后台真人好友管理视图与路由', () => {
    ok(/function pRealChars\(\)/.test(adminJs) && /function renderRealChars\(\)/.test(adminJs), '应含真人视图渲染函数');
    ok(/function realFriendOf\(uid\)/.test(adminJs) && /c\.uid===uid\|\|c\.id==='rf_'\+uid/.test(adminJs), '真友档案应与注册用户 uid 稳定映射');
    ok(/realfriends:\{t:'真人好友'/.test(adminJs) && !/t:'真人好友管理'/.test(adminJs), '路由标题应为「真人好友」（无管理字样）');
    ok(!/<th>状态<\/th>[\s\S]{0,200}<th>注册时间<\/th>/.test(adminJs.split('function renderRealChars')[1]||''), '真人好友表格不应有状态列');
    ok(!/charEdit\(null,\{human:true\}\)/.test(adminJs), '真人视图不应再提供手工新增入口（真人=注册用户）');
    ok(/const us=users\(\)/.test(adminJs), '真人视图数据源应为注册用户列表');
  });

  /* N10 注册用户设真友：realFriendSave upsert rf_<uid> + human + 发布推送 */
  t('N10 注册用户设真友 upsert 映射', () => {
    ok(/function realFriendSave\(\)/.test(adminJs), '应含设真友保存函数');
    ok(/const id='rf_'\+rfUid/.test(adminJs), '真友档案 id 应为 rf_<uid> 稳定映射');
    ok(/human:true,uid:rfUid/.test(adminJs), '真友档案应带 human:true 与 uid 关联');
    ok(/function realFriendToggle\(/.test(adminJs) && /function realFriendRemove\(/.test(adminJs), '应含下架/取消真友操作');
    ok(/adminCharsPush\(cs\)/.test(adminJs), '真友变更应推送服务器官方库');
  });

  /* N11 后台登录：服务端邮箱密码 + 独立管理员会话 */
  t('N11 后台管理员邮箱密码登录流程', () => {
    ok(/id="lg-email"/.test(adminHtml) && /id="lg-pwd"/.test(adminHtml), '登录表单应为管理员邮箱+密码');
    ok(!/lg-phone/.test(adminHtml) && !/lg-code/.test(adminHtml), '旧手机号验证码表单应已移除');
    ok(/YLN\.adminAuth\.login\(email,pwd\)/.test(adminJs), '登录应调用真实管理员 API');
    ok(/YLN\.adminAuth\.me\(\)/.test(adminJs) && /YLN\.adminAuth\.logout\(\)/.test(adminJs), '启动应校验会话，退出应撤销会话');
    ok(!/yln_admin_session|smsCode|sendCode/.test(adminJs), '前端假管理员会话与验证码逻辑应移除');
  });

  /* N3 真人模式保存：human:true + rf_ 前缀 + field 真友 */
  t('N3 真人模式保存 human:true + rf_ 前缀', () => {
    ok(/charHumanMode=\!\!\(opts&&opts\.human\)/.test(adminJs), 'charEdit 应支持 human 模式入参');
    ok(/\.\.\.\(charHumanMode\?\{human:true\}:\{\}\)/.test(adminJs), 'charSave 应写 human:true');
    ok(/\(charHumanMode\?'rf_':'adm_'\)/.test(adminJs), '新增 id 应按模式选前缀');
    ok(/field:charHumanMode\?'真友':g\('cf-field'\)/.test(adminJs), '真人 field 固定真友');
  });

  /* N4 真人模式抽屉无女娲蒸馏按钮（真人不进蒸馏管线） */
  t('N4 真人模式不渲染女娲蒸馏按钮', () => {
    const m = adminJs.match(/\$\('d-body'\)\.innerHTML=charHumanMode\?`([\s\S]*?)`:`/);
    ok(!!m, '应存在真人/AI 双分支抽屉模板');
    if (m) {
      ok(!/charAIFill/.test(m[1]), '真人分支不应含女娲蒸馏按钮');
      ok(/不生成 AI 台词/.test(m[1]), '真人分支应说明旁听语义');
    }
  });

  /* N5 手机端真友收集扩展：human 非 REALS 也进真友分类 */
  t('N5 手机端真友分类收集 human 老友', () => {
    ok(/const realIds = \[\.\.\.REALS\.map\(r=>r\.id\),\.\.\.Object\.entries\(CHARS\)\.filter\(\(\[k,c\]\)=>c\.human&&!REALS\.some\(r=>r\.id===k\)\)\.map\(\(\[k\]\)=>k\)\]/.test(html),
      'renderFriends realIds 应含非内置 human 老友');
  });

  /* N6 手机端捏人入口：add-card 直开女娲面板（二选一弹层已下线）+ my_ 前缀持久化 */
  t('N6 捏人入口直开女娲 + my_ 手动创建持久化', () => {
    ok(/onclick="openNuwa\(\)">\s*<span class="plus">[\s\S]{0,400}<b>找女娲捏一位<\/b>/.test(html), '「找女娲捏一位」卡片应直开女娲捏人面板');
    ok(!/id="sheet-add"/.test(html) && !/function openAddChoice/.test(html), '二选一弹层（sheet-add/openAddChoice）应已移除');
    ok(/const id='my_'\+Date\.now\(\)\.toString\(36\)/.test(html), '手动创建 id 应为 my_ 前缀');
    ok(/source:'manual'/.test(html), '手动创建应带 source 标记');
    ok(/human:human\|\|undefined/.test(html), '真人才写 human 字段');
    ok(/k\.startsWith\('nuwa_'\)\|\|k\.startsWith\('my_'\)\|\|v\.owner\|\|v\.official/.test(html), 'saveChars 落盘过滤应含 my_ 前缀（手动创建可持久化）');
  });

  /* N7 详情来源标签：真友身份 / 手动创建档案分支 */
  t('N7 详情来源标签含真友与手动创建分支', () => {
    ok(/c\.source==='manual'\?'手动创建档案'/.test(html), 'srclabel 应含手动创建分支');
    ok(/c\.human\?'真友身份'/.test(html), 'srclabel 应含真友身份分支');
    ok(/: c\.source==='manual'\s*\n\s*\? \[\['✍️','手动创建档案'/.test(html), '详情来源行应含手动创建专属文案');
  });

  /* N8 私有同步含 my_ 手动创建角色（core ownChars 动态） */
  {
    const st8 = mkStore();
    let posted8 = null;
    const NY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
      { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
      st8, async (url, opt) => { if (opt && opt.method === 'POST') { posted8 = JSON.parse(opt.body); return { ok: true, json: async () => ({ ok: true }) }; } return { ok: true, json: async () => ({ ok: true }) }; });
    NY.auth.setToken('tk_n8');
    NY.savePrivateChars({
      my_manual1: { name: '手动老友', short: '手友', source: 'manual' },
      nuwa_x: { name: '女娲捏的' },
      official_x: { name: '官方人', official: true },
      plain_x: { name: '不明来源' }
    });
    await new Promise(r => setTimeout(r, 20));
    const ids8 = posted8 && posted8.chars ? Object.keys(posted8.chars) : [];
    __ck('N8 私有同步收 my_/nuwa_/owner 排除 official', ids8.includes('my_manual1') && ids8.includes('nuwa_x')
      && !ids8.includes('official_x') && !ids8.includes('plain_x'));
  }

  /* N9 真人好友数据模型不变量：后台真人 rf_ 走官方库下发，手机端手动真人 my_ 走私有同步，双源不打架 */
  t('N9 双源边界：rf_ 官方下发 / my_ 私有同步', () => {
    ok(/\(charHumanMode\?'rf_':'adm_'\)/.test(adminJs), '后台真人进官方库（rf_）');
    ok(/const id='my_'\+Date\.now\(\)\.toString\(36\)/.test(html), '手机端手动进私有库（my_）');
    ok(/String\(k\)\.startsWith\('my_'\)/.test(coreJs), 'core ownChars 应收 my_ 前缀');
  });

  /* N12 1v1 单聊：老友页点卡分流 priv 线程复用 + solo 静场 prompt + 会话态重建 + 收官 chip 抑制 */
  t('N12 单聊分流：friendTap + priv 线程 + solo prompt', () => {
    ok(/friendTap\('\$\{id\}'\)/.test(html), '老友卡点击应走 friendTap 分流');
    ok(/event\.stopPropagation\(\);openChar\('\$\{id\}'\)/.test(html), '卡右侧 ⓘ 应开资料页');
    ok(/if\(c\.human\|\|!CHARS\[id\]\)\{openChar\(id\);return\}/.test(html) && /openPrivateChat\(id\)/.test(html), '真人/未收入开资料页，AI 老友直开单聊');
    ok(/ROUNDS\.find\(r=>r\.priv===id\)/.test(html) && /isPublic:false,priv:id/.test(html), '单聊应复用 priv 固定线程且不进广场');
    ok(/cache:rec\.cache,priv:true,solo:rec\.chars\.length===1\}\)/.test(html), 'openChat 应带 solo 标记开单聊（邀人升级群聊后 chars>1 自动按群聊分流）');
  });
  t('N12 单聊体验：solo prompt + 会话态重建 + chip 抑制', () => {
    ok(/这是一对一私聊，不是圆桌辩论。/.test(html) && /askLineBuild\('solo','小Moon'\)/.test(html), 'solo 桌应走老友闲聊 prompt 而非辩论腔（插话指令=core chatAskSolo 模板）');
    ok(/getElementById\('chat-invite'\)\.style\.display='';/.test(html), '单聊/群聊右上角都可邀请老友：单聊邀人即升级群聊');
    ok(/opt\.solo\?'单聊 · 私密 💬'/.test(html), '桌态标签应有单聊专属文案');
    ok(/roomSeq=\[\.\.\.seq\];liveSent=seq\.length;/.test(html) && /roomDialog=seq\.map\(m=>/.test(html), 'playCached 应按实录重建会话态（防跨桌串写/防重推流）');
    ok(/!activeRound\.solo&&!activeRound\.priv&&!seq\.some\(m=>m\.type==='summary'\)/.test(html), '单聊/静场桌/priv 线程不应加「🎓 圆桌收官」chip');
  });
  t('N12c 单聊邀人升级群聊：inviteChar 转换 + 群名跟随 + 头像分流', () => {
    ok(/soloUp=r\.priv&&r\.chars\.length===1/.test(html), '单聊邀人应触发升级群聊');
    ok(/r\.topic==='与'\+getChar\(r\.chars\[0\]\)\.short\+'单聊'\)r\.topic='与'\+r\.chars\.map/.test(html), '升级群聊应自动改群名（自定义名不覆盖）');
    ok(/const priv=\!\!r\.priv&&r\.chars\.length===1/.test(html), '会话列表邀人后应换群聊九宫格头像');
    ok(/chars:rec\.chars,rehearse:false,mode:'单聊'/.test(html), 'openPrivateChat 应传 rec.chars 引用（邀人后 activeRound 与实录同步扩员）');
  });
} catch (e) { fail++; fails.push('N 组执行'); console.log('  \x1b[31m✗\x1b[0m N 组执行 — ' + e.message); } })();

/* ================= 组 O：P5 广场直播流（yln_live 表 + 增量写流 + 围观共享消息流） ================= */
(async () => { try {

  /* O1 服务器接口齐备 */
  t('O1 server 直播流五接口与表', () => {
    ok(/CREATE TABLE IF NOT EXISTS yln_live/.test(serverPy), 'yln_live 表应存在');
    ok(/\/api\/live\/open/.test(serverPy) && /\/api\/live\/post/.test(serverPy), 'open/post 接口应存在');
    ok(/\/api\/live\/list/.test(serverPy) && /\/api\/live\/stream/.test(serverPy) && /\/api\/live\/close/.test(serverPy), 'list/stream/close 接口应存在');
    ok(/meta\.get\('status'\) != 'live'/.test(serverPy), 'post 应拒绝对已关流的追加（409）');
    ok(/msgs\[after:\] if after <= len\(msgs\)/.test(serverPy), 'stream 应支持 after 增量切片');
  });

  /* O2 主播端：开播建流 + chars 快照 + 增量写流 + 收官关流（静态断言） */
  t('O2 主播端挂钩静态断言', () => {
    ok(/function liveStart\(\)/.test(html), 'liveStart 应存在');
    ok(/YLN\.liveOpen\(\{liveId:activeRound\.rid/.test(html), '开播应带 rid 建流');
    ok(/chars:activeRound\.chars\.map/.test(html), '开播应带角色快照');
    ok(/if\(activeRound\.isPublic&&roomSeq\.length>liveSent\)/.test(html), 'syncCache 应按 liveSent 增量推送');
    ok(/YLN\.livePost\(activeRound\.rid,batch\)/.test(html), '增量批次应 POST 直播流');
    ok(/if\(rec\.isPublic\)\{YLN\.liveClose\(rec\.id\)/.test(html), '公开桌收官应关流');
    ok(/setInterval\(pullLiveInbox,4000\)/.test(html), '主播应轮询围观插话');
  });

  /* O3 围观端：spectateLive 渲染服务器流 + 轮询增量 + 快照注入（静态断言） */
  t('O3 围观端静态断言', () => {
    ok(/function spectateLive\(\)/.test(html), 'spectateLive 应存在');
    ok(/activeRound\.liveId&&!activeRound\.rid\)\{await spectateLive\(\);return\}/.test(html), '围观桌应分流到 spectateLive，本地不生成');
    ok(/YLN\.liveStream\(activeRound\.liveId,0\)/.test(html), '围观应全量拉流渲染');
    ok(/SNAP_CHARS\[c\.id\]=c/.test(html), '角色快照应注入 SNAP_CHARS（仅渲染）');
    ok(/getChar\(id\)\{return CHARS\[id\]\|\|SNAP_CHARS\[id\]/.test(html), 'getChar 应兜底快照');
    ok(!/YLN\.livePost\(activeRound\.liveId/.test(html), '围观端不得写直播流（仅 owner 可写）');
    ok(/async function pullSpectatorLive\(\)/.test(html) && /setInterval\(pullSpectatorLive,4000\)/.test(html), 'SSE 与轮询应共用增量拉流入口');
    ok(/if\(inc\.status!=='live'\)/.test(html), '围观端应感知主播收官');
  });

  /* O4 直播流渲染：圆桌页「进行中」真实数据源 + 竞态防护（静态断言） */
  t('O4 直播流数据源静态断言', () => {
    ok(/const lives = await YLN\.liveList\(\)\.catch\(\(\)=>null\)/.test(html), 'renderHomeLive 应拉服务器直播列表');
    ok(/id:'live_'\+l\.liveId/.test(html), '服务器直播应映射为 live_ 卡片');
    ok(!/SQUARES\b/.test(html), '本地演示桌常量应移除（演示桌=服务器流，统一进双通道）');
    ok(/watch:l\.watch\|\|Math\.max\(1,Math\.round\(\(l\.count\|\|0\)\/3\)\+1\)/.test(html), '服务器卡围观数应优先用剧本/元数据');
    ok(/if\(tick!==homeLiveTick\)return/.test(html), '异步渲染应有竞态防护');
    ok(!/corridor/.test(html), '「直播回廊」归档模块应已删除');
    ok(!/renderSquare/.test(html), '旧广场 renderSquare 应删除（直播流并入圆桌页）');
  });

  /* O5 core 客户端方法（动态：livePost 追加 + liveStream after 游标参数） */
  {
    const st5 = mkStore();
    const calls5 = [];
    const OY = new Function('document', 'localStorage', 'fetch', coreJs + ';return YLN;')(
      { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl(), createElement: mkEl, body: mkEl() },
      st5, async (url, opt) => {
        calls5.push({ url: String(url), opt: opt || {} });
        if (String(url).includes('/live/stream')) return { ok: true, json: async () => ({ ok: true, status: 'live', total: 3, msgs: [{ type: 'msg', who: 'a1', html: '<b>hi</b>', text: 'hi' }] }) };
        return { ok: true, json: async () => ({ ok: true, total: 3 }) };
      });
    OY.auth.setToken('tk_o5');
    await OY.livePost('r_test1', [{ type: 'user', text: '围观插话', nick: '路人甲' }]);
    await OY.liveStream('r_test1', 2);
    await new Promise(r => setTimeout(r, 20));
    const postCall = calls5.find(c => c.url.includes('/live/post'));
    const streamCall = calls5.find(c => c.url.includes('/live/stream'));
    __ck('O5a livePost 应 POST liveId+msgs', !!postCall && postCall.opt.body && JSON.parse(postCall.opt.body).liveId === 'r_test1'
      && JSON.parse(postCall.opt.body).msgs[0].nick === '路人甲');
    __ck('O5b liveStream 应带 after 游标', !!streamCall && streamCall.url.includes('after=2') && streamCall.url.includes('liveId=r_test1'));
    __ck('O5c livePost 应带 Bearer token', !!postCall && postCall.opt.headers.Authorization === 'Bearer tk_o5');
  }

  /* O6 围观端不发 LLM：spectate 路径无 llmChat 调用（静态断言，防止围观者本地烧钱生成） */
  t('O6 围观路径零本地生成', () => {
    const specSeg = html.slice(html.indexOf('async function spectateLive()'), html.indexOf('async function playDebate()'));
    ok(!/llmChat/.test(specSeg), 'spectateLive 段内不得调用 llmChat');
    ok(!/roundTask/.test(specSeg), 'spectateLive 段内不得拼辩论任务');
  });

  /* O7 直播同步：list 透出 status + 圆桌页停留期 10s 定时同步（后台↔手机端双端一致） */
  t('O7 直播双端同步静态断言', () => {
    ok(/'status': m\.get\('status'\)/.test(serverPy), '/api/live/list 应透出 status（客户端区分直播中/收官流）');
    ok(/srvLive=lives\.filter\(l=>l\.status==='live'&&isMine\(l\)===false\)/.test(html) || /srvLive=lives\.filter\(l=>l\.status==='live'&&!isMine\(l\)\)/.test(html), '「进行中」应纳入服务器直播流（只取 live，收官流不再出卡）');
    ok(/liveTimer=setInterval\(renderHomeLive,10000\)/.test(html), '圆桌页停留期间应 10s 定时同步直播流');
    ok(/function stopLiveTimer\(\)/.test(html) && /stopLiveTimer\(\);\s*\/\* 离开圆桌页即停直播流同步轮询/.test(html), '切离圆桌页应停同步轮询');
  });

  /* O8 广场演示桌服务器剧本化：每张桌=服务器唯一一条直播流（sqN），手机端只做渲染，聊天记录全端同步 */
  t('O8 演示桌服务器剧本化静态断言', () => {
    ok(!/yln_sq_chat/.test(html), '演示桌本地累积（yln_sq_chat）应删除：服务器为唯一事实源');
    ok(!/SQC|sqId/.test(html), 'SQC/sqId 旧本地方案引用应清空');
    ok(!/const SQUARES/.test(html), '本地 SQUARES 常量应删除（桌 meta 迁至服务器 DEMO_SCRIPTS）');
    ok(/activeRound\.demo=d\.source==='demo'/.test(html), 'spectateLive 应标记演示流（demo）');
    ok(/YLN\.demoNext\(activeRound\.liveId\)/.test(html), '演示桌打开应调 demo_next 续播下一轮组');
    ok(/specTotal\+=nx\.added\.length/.test(html), '续播后应推进游标，防轮询重复渲染');
    ok(/demoNext\(activeRound\.liveId\)/.test(html), '演示桌只能经公开 demo_next 续播');
    ok(!/YLN\.livePost\(activeRound\.liveId/.test(html), '普通围观者不得冒领 demo 或向 demo 写流');
  });

  /* O9 条数唯一事实源：卡片/统计/收官条数全部由实录 cache 计算，杜绝标识条数与真实内容不符 */
  t('O9 条数与实录一致静态断言', () => {
    ok(/const talkCount = seq => \(seq\|\|\[\]\)\.filter\(m=>m\.type==='msg'\|\|m\.type==='user'\)\.length/.test(html), 'talkCount 唯一口径应存在（AI 发言+用户插话，不含轮次条/纪要）');
    ok(/says\+=talkCount\(r\.cache\)/.test(html), '「我的」页发言统计应改由 cache 计算');
    ok(!/exec\(r\.meta/.test(html), '旧「正则解析 meta 条数」逻辑应移除');
    ok(/metaWithCount\(r\)/.test(html), '圆桌卡片与广场卡条数应统一走 metaWithCount 动态拼接');
    ok(/\\d\+\\s\*条发言\//.test(html), '历史 meta 里写死的「N 条发言」应被剥除');
    ok(/userMsgHTML\(m\.text,m\.nick\)/.test(html), '实录回放应还原用户插话昵称（不得丢 nick）');
    ok(/const n = talkCount\(roomSeq\.length\?roomSeq:activeRound\.cache\)/.test(html), '收官条数应取自实录而非 DOM 计数');
    ok(/const n = talkCount\(rec\.cache\)/.test(html), '提前离席条数应取自实录而非 DOM 计数');
    ok(/seedFix=\{r1:SCRIPT,r2:R2_SCRIPT,r3:R3_SCRIPT\}/.test(html), '旧设备种子桌应自动补挂实录并修正假状态');
    ok(/status:'done',cache:SCRIPT,meta:'乔布斯 · 纳瓦尔 · 芒格'/.test(html), '种子桌 r1 应带实录且不再假标 live');
    ok(!/42 条发言|37 条发言|89 条发言/.test(html), '无实录的假条数演示文案应清除');
  });

  /* O10 直播流同步链路：新桌入口必须把 isPublic 传入 activeRound（liveStart/推流/收插话全依赖） */
  t('O10 公开桌开播流参数链静态断言', () => {
    ok(/openChat\(\{topic,chars:rec\.chars,rehearse:true,mode:deskMode,rid:rec\.id,isPublic:rec\.isPublic\}\)/.test(html), 'startRound 建桌必须传 isPublic 进 activeRound，否则公开桌永不建直播流');
    ok(/function liveStart\(\)\{\s*if\(!activeRound\|\|!activeRound\.isPublic\|\|!activeRound\.rid\)return;/.test(html), 'liveStart 建流守卫依赖 activeRound.isPublic');
  });

  /* O11 围观只读，主播桌保留全员插话回应 */
  t('O11 围观只读+主播插话回应静态断言', () => {
    ok(/围观模式仅可观看，直播发言仅主播可操作/.test(html), '围观发言应明确拒绝');
    ok(/chat-inp'\)\.disabled=!!opt\.liveId/.test(html), '围观输入框应禁用');
    ok(!/const closed=activeRound\.srvStatus==='done'/.test(html), '旧围观写流分支应移除');
    ok(/const speakers = activeRound\.chars\.filter\(c=>!getChar\(c\)\.human\)\.slice\(\)\.sort\(\(\)=>Math\.random\(\)-\.5\);/.test(html), '主聊天管线一致：群聊插话后每位老友都发言一次');
  });

  /* O12 server 端：演示桌剧本（DEMO_SCRIPTS/seed_demo/demo_next）——广场同步的服务器唯一事实源 */
  t('O12 server 演示桌剧本静态约束', () => {
    ok(/DEMO_SCRIPTS = \{/.test(serverPy), 'DEMO_SCRIPTS 剧本常量应存在');
    ok(/def seed_demo\(\):/.test(serverPy), 'seed_demo 播种函数应存在');
    ok(/if path == '\/api\/live\/demo_next':/.test(serverPy), 'demo_next 续播接口应存在');
    ok(/'source': 'demo'/.test(serverPy), '演示流应带 source=demo 标记');
    ok(/    seed_demo\(\)   # 懒播种/.test(serverPy), '/api/live/list 应懒播种演示桌（缺哪张补哪张）');
    ok(/    seed_demo\(\)   # 启动即播种/.test(serverPy), '服务器启动应播种演示桌');
    ok(/rel = meta\.get\('released'\) or 0/.test(serverPy) && /\(rel \+ k\) % len\(all_rounds\)/.test(serverPy), '剧本应按 released 游标循环取轮');
    ok(/'source': m\.get\('source'\) or ''/.test(serverPy), 'list/stream/admin 载荷应透出 source（后台徽章/手机端分流）');
  });

  /* O13 会话页：底部导航「广场」改「会话」，微信首页式会话列表（群聊圆桌 + 1v1 单聊）；
     原广场直播流并入圆桌页「进行中」 */
  t('O13 会话页架构静态断言', () => {
    ok(/<span>会话<\/span>/.test(html) && !/<span>广场<\/span>/.test(html), '底部导航 tab 应由「广场」改为「会话」');
    ok(/function renderSessions\(\)/.test(html), 'renderSessions 会话列表渲染应存在');
    ok(/session-list/.test(html), '会话页应有 session-list 容器');
    ok(/function sessPreview\(/.test(html), '会话预览应取实录最后一条');
    ok(!/ss-tag/.test(html), '会话行不应再有「单聊/群聊」ss-tag 徽章（已按需求删除）');
    ok(/priv\?avaHTML\(r\.chars\[0\],46\):gridAvaHTML\(r\.chars,46\)/.test(html), '会话行群聊应用微信群式九宫格头像、单聊单人46px头像（角标由 avaHTML 统一注入）');
    ok(/function avaHTML\(id,size,badge\)/.test(html) && /flatBadge\(c,Number\(ic\)\)/.test(html), '头像唯一渲染口：avaHTML 内置统一领域角标（老友库=数据源，调用点不传 icon）');
    ok(!/avaHTML\([^)]*flatBadge\(/.test(html), '所有调用点不得手动传 flatBadge（禁止散落自定义角标）');
    ok(/flatBadge\(c,23\)/.test(html), '老友详情 92px 大头像角标同步领域SVG（23px 缩放）');
    ok(/\.f-card\{[^}]*box-shadow:var\(--sh-s\);border/.test(html), '老友卡片无灰描边（仅柔影，选中态保留）');
    ok(/<rect x="2\.5" y="4\.5" width="19" height="15" rx="3\.5"\/><circle cx="9" cy="10\.5"/.test(html), '老友卡右侧特征 icon=档案卡图形（v2）');
    ok(/function openChar\(id\)\{\s*const c = getChar\(id\);\s*if\(!c\)return;/.test(html), 'openChar 空防护：getChar 失败静默返回不崩弹层');
    ok(/\.\.\.\(c\.tags\|\|\[\]\)/.test(html), '详情 tags 字段兜底：缺 tags 的老友不崩 spread');
    ok(/\.f-more\{[^}]*width:64px[^}]*background-clip:content-box/.test(html), 'f-more 命中区 64×64（视觉 26px 不变，防触点偏移误入私聊）');
    ok(/function gridAvaHTML\(/.test(html) && /\.gava\.n9\{grid-template-columns:1fr 1fr 1fr/.test(html), '应有九宫格头像渲染函数与 3×3 网格样式（真人格姓氏头像同色底）');
    ok(/if\(c\.human\)return uavaHTML\(c\.short,size\)/.test(html), 'avaHTML 应对真人兜底姓氏头像（与 Web 后台同款）');
    ok(/\.uava\{[^}]*border-radius:50%/.test(html) && /AVA_C=\['var\(--primary\)'/.test(html), '应存在姓氏头像 .uava 样式与主色语义色板（token 化后与后台同源）');
    ok(/ss-row" onclick="openRound\('/.test(html), '会话行点击应统一走 openRound（自动分流群聊/单聊）');
    ok(/「进行中」渲染/.test(html) && !/「直播回廊」/.test(html), '原广场直播流应并入圆桌页「进行中」（直播回廊已删）');
    ok(/if\(btn\.dataset\.tab==='scr-square'\)renderSessions\(\)/.test(html), '切到会话 tab 应渲染会话列表');
  });

  /* O14 插话计费：免费用户先扣 3 条免费额度；额度用尽后与会员一致按条扣积分（单聊/私密 10 · 公开 20），
     积分不足弹会员墙；围观/演示桌分支先于计费门槛 return（免会员墙不变） */
  t('O14 插话积分计费静态断言', () => {
    ok(/const speakFree = !isMember\(\)&&wallet\.freeSpeaks>0/.test(html), '免费用户应先消耗免费插话额度');
    ok(/const speakCost = \(activeRound\.solo\|\|!activeRound\.isPublic\)\?10:20/.test(html), '按条计费：单聊/私密桌 10 分 · 公开桌 20 分');
    ok(/if\(!speakFree&&wallet\.points<speakCost\)\{openPaywall\(isMember\(\)\?'speak_pts':'speak'\);return\}/.test(html), '积分不足应弹会员墙（会员走专属文案）');
    ok(/walletSpend\(speakCost,\(activeRound\.solo\?'单聊':activeRound\.isPublic\?'公开桌':'私密桌'\)\+'插话 · '\+speakCost\+' 积分'\)/.test(html), '会员/额度用尽后插话应真实扣积分并留流水');
    ok(/speak_pts:\{hero:'👛'/.test(html), '会员积分不足应有专属会员墙文案');
    ok(/speakFree\)\{\s*wallet\.freeSpeaks--/.test(html), '免费额度路径应保持 freeSpeaks-- 扣减');
    ok(/if\(activeRound\.liveId&&!activeRound\.rid\)\{[\s\S]*?^\s{4}return;\s*\n\s*\}/m.test(html), '围观/演示桌分支应先于计费门槛返回（免会员墙不变）');
  });
  /* O15 无主题桌自动定主题：用户第一句话即成为圆桌主题（头部标题+实录落盘+直播流标题联动） */
  t('O15 无主题桌首条插话自动定题静态断言', () => {
    ok(/activeRound\.topic==='（无主题）'&&!roomSeq\.some\(m=>m\.type==='user'\)/.test(html), '仅无主题桌且用户尚未发过言时才自动定题（单聊/有主题桌/续聊不受影响）');
    ok(/document\.getElementById\('chat-topic'\)\.textContent=activeRound\.topic/.test(html), '定题后应同步聊天头部标题');
    ok(/rec\.topic=activeRound\.topic;saveRounds\(\)/.test(html), '新主题应落盘实录（会话/最近圆桌标题同步）');
    ok(/const rec=ROUNDS\.find\(r=>r\.id===activeRound\.rid\);\s*\n\s*if\(rec\)\{rec\.topic=activeRound\.topic;saveRounds\(\)\}\s*\n\s*\}\s*\n\s*if\(activeRound\.isPublic&&!roomSeq\.length\)liveStart\(\)/.test(html), '定题应先于开播建流（直播流 title 带真实主题）');
  });

  /* O16 Prompt 管理：聊天人设模板进 core 注册表（后台热编辑页 + 单老友覆盖 + 组装调试台） */
  t('O16 Prompt 管理静态断言', () => {
    /* core：6 个聊天模板键注册 + group 分组 + 组装函数导出 */
    ok(/chatPersonaMind:'你是「\{\{name\}\}」/.test(coreJs) && /chatPersonaQuote:'你是「\{\{name\}\}」/.test(coreJs), '人设 system 双变体应注册为可热编辑模板（{{var}} 占位）');
    ok(/chatAskGroup:'用户（\{\{user\}\}）/.test(coreJs) && /chatAskSolo:'用户（\{\{user\}\}）/.test(coreJs) && /chatAskDemo:'观众（\{\{user\}\}）/.test(coreJs), '三种场景插话指令应注册为模板');
    ok(/chatSummary:'你是圆桌的中立管家/.test(coreJs), '圆桌纪要 Prompt 应注册为模板');
    ok((coreJs.match(/group:'chat'/g) || []).length === 6, '6 个 chat 模板应带 group:\'chat\' 分组（女娲页按分组过滤不混入）');
    ok(/function personaSysBuild\(c\)/.test(coreJs) && /function askLineBuild\(kind,user\)/.test(coreJs), '组装函数 personaSysBuild/askLineBuild 应存在');
    ok(/c\.promptSys&&String\(c\.promptSys\)\.trim\(\)\)return String\(c\.promptSys\)/.test(coreJs), '单老友 promptSys 覆盖应优先于全局模板');
    ok(/personaSysBuild, askLineBuild,/.test(coreJs), '组装函数应从 nuwa 命名空间导出');
    /* 手机端：personaSys 委托 core，硬编码人设串移除 */
    ok(/return YLN\.nuwa\.personaSysBuild\(getChar\(id\)\|\|CHARS\[id\]\)/.test(html), '手机端 personaSys 应委托 core 组装（getChar 兜底演示桌角色）');
    ok(!/你是「\$\{c\.name\}」（\$\{c\.title\}）的 AI 分身/.test(html), '手机端不应再硬编码人设串（唯一事实源=core 模板）');
    ok(/askLineBuild\('solo','小Moon'\)/.test(html) && /askLineBuild\('group','小Moon'\)/.test(html), '单聊与群聊插话应走模板组装');
    ok(/getPrompt\('chatSummary'\)/.test(html), '纪要 system 应走注册表模板');
    ok(/\(n\.promptSys\|\|null\)!==\(c\.promptSys\|\|null\)/.test(html), '内置老友合并应同步 promptSys（允许 null 清除不残留）');
    /* 后台：Prompt 管理页（模板卡 + 单老友覆盖 + 调试台）+ 老友编辑入口 */
    ok(/data-r="prompts"/.test(adminHtml) && /Prompt 管理/.test(adminHtml), '侧栏应有 Prompt 管理导航项');
    ok(/prompts:\{t:'Prompt 管理'/.test(adminJs), 'prompts 路由应注册');
    ok(/PROMPT_META\.filter\(m=>m\.group==='chat'\)/.test(adminJs) && /PROMPT_META\.filter\(m=>m\.group!=='chat'\)/.test(adminJs), '聊天组归 Prompt 管理页，女娲页只显示管线模板');
    ok(/function pPrompts\(/.test(adminJs) && /id="pd-char"/.test(adminJs) && /id="pd-scene"/.test(adminJs) && /id="pd-out"/.test(adminJs), '组装调试台应含角色/场景选择与 messages 预览');
    ok(/async function pdRun\(/.test(adminJs) && /YLN\.llm\(\[\{role:'system',content:sys\},\{role:'user',content:userMsg\}\]/.test(adminJs), '调试台应可真实调用（同一条 core LLM 通道）');
    ok(/function charPromptClear\(/.test(adminJs) && /id="cf-prompt"/.test(adminJs) && /function charPromptPreview\(/.test(adminJs), '老友编辑抽屉应有 Prompt 覆盖入口 + 预览');
    ok(/promptSys:g\('cf-prompt'\)\|\|null/.test(adminJs), '保存老友应落 promptSys 字段');
  });

  /* O17 体验看板 L1：ERD × BOND 双结果 + 诊断层置灰（口径唯一事实源=docs/experience-metrics.md v1.1） */
  t('O17 体验看板静态断言', () => {
    /* 手机端：实录条目必须带时间戳（ERD v1 回归判定的精算基础，历史条目无 t 才走 legacy 剔除） */
    ok(/roomSeq\.push\(\{type:'user',text,t:Date\.now\(\)\}\)/.test(html), '用户插话实录条目应带时间戳 t');
    ok(/roomSeq\.push\(\{type:'msg',who:id,html:h2,text:reply,t:Date\.now\(\)\}\)/.test(html) && /roomSeq\.push\(\{type:'msg',who,html,text,t:Date\.now\(\)\}\)/.test(html), 'AI 回应实录条目（插话/辩论两路）应带时间戳 t');
    /* 后台：路由与导航 */
    ok(/data-r="xpanel"/.test(adminHtml) && /体验看板/.test(adminHtml), '侧栏应有体验看板导航项');
    ok(/xpanel:\{t:'体验看板'/.test(adminJs) && /f:pXpanel,after:renderXpanel/.test(adminJs), 'xpanel 路由应注册（页面+渲染双函数）');
    /* 结果层：ERD v1 口径（10 分钟话语权回归）+ legacy 剔除 + 演示桌红线排除 */
    ok(/const XP_WIN=10\*60\*1000/.test(adminJs), 'ERD v1 回归窗口应为 10 分钟（手册 §1 定稿口径）');
    ok(/function xpERD\(/.test(adminJs) && /function xpBOND\(/.test(adminJs), '双结果计算函数 xpERD/xpBOND 应存在');
    ok(/10 分钟内同桌再插话/.test(adminJs) && /话语权回归，不是挂机时长/.test(adminJs), 'ERD 口径文案应与手册一致（话语权回归）');
    ok(/e\.t==null\)\{legacy\+\+;\}const us=|if\(es\.some\(e=>e\.type==='user'&&e\.t==null\)\)legacy\+\+;/.test(adminJs), '旧条目无时间戳应按条计数提示（不整桌永久剔除）');
    ok(/if\(x\.e\.t==null\)return;/.test(adminJs) && /msgs\.some\(m=>m\.t==null\)\)return;/.test(adminJs), '无时间戳轮次应按条跳过（两端有 t 才参与 v1 精算，老桌新对话自动转入）');
    ok(/xpScript=r=>\/\^sq\\d\+\$\//.test(adminJs), '演示桌剧本流（sqN）应排除于用户侧指标（手册 §9 红线 5）');
    ok(/BOND-01b/.test(adminJs) && /圆桌迁移/.test(adminJs), 'BOND-01b 圆桌迁移子口径应呈现');
    ok(/质量系数暂 1\.0/.test(adminJs), 'ERD 质量系数应显性标注待 L2 加权');
    /* 诊断层：不可算指标置灰 + 引用手册 ID */
    ok(/待 L2 实录抽检判卷/.test(adminJs) && /待 N4 llmChat 计时/.test(adminJs) && /待 N2 漏斗埋点/.test(adminJs), 'F/R/T 诊断卡应置灰标注待接入（L2/N2/N4）');
    ok(/function xpW04\(/.test(adminJs), 'W-04 长度合规（规则可算）应实时计算');
    ok(/docs\/experience-metrics\.md/.test(adminJs), '看板应引用手册为唯一口径事实源');
    ok(/近似口径/.test(adminJs) && /双跑一周/.test(adminJs), 'Re-01 近似口径应显性标注切换计划');
    /* 登录层隐藏守卫：作者样式 .login{display:flex} 会覆盖 UA 的 [hidden]，需全局 important 守卫（E2E 截图暴露的潜伏 bug） */
    ok(/\[hidden\]\{display:none!important\}/.test(adminCss), 'admin.css 应含 [hidden] 全局守卫（防 .login{display:flex} 压过 hidden 属性）');
  });
} catch (e) { fail++; fails.push('O 组执行'); console.log('  \x1b[31m✗\x1b[0m O 组执行 — ' + e.message); } })();

/* ================= 组 P：管理后台隐私专区 + 广场直播管理 ================= */
(async () => { try {
  const adminJs = fs.readFileSync(path.join(ROOT, 'website/admin/admin.js'), 'utf8');

  /* P1 server 端：隐私接口仅独立管理员会话可查 */
  t('P1 server 隐私接口静态约束', () => {
    ok(!/PRIVACY_CODE|000000/.test(serverPy), '共享硬编码隐私口令应移除');
    ok(/path\.startswith\('\/api\/admin\/'\) and not self\._require_admin\(\)/.test(serverPy), '所有后台接口应统一强制管理员鉴权');
    ok(/def _admin_auth\(self\):/.test(serverPy) && /yln_admin_session/.test(serverPy), '管理员会话应独立于普通用户会话');
    ok(/SELECT id,email,nick,plan,plan_until,created FROM yln_user WHERE id=\?/.test(serverPy), 'yln_user 应按主键 id 查询（非 user_id，且该表无 json 列）');
    ok(/SELECT json FROM yln_round WHERE user_id=\?/.test(serverPy), '群聊数据应读 yln_round 表');
    ok(/SELECT json FROM yln_user_char WHERE user_id=\?/.test(serverPy), '自建老友应读 yln_user_char 表');
  });

  /* P2 server 端：直播管理接口（全量列表 + 强制关播标记） */
  t('P2 server 直播管理接口静态约束', () => {
    ok(/\/api\/admin\/live'/.test(serverPy), '全量流列表接口应存在');
    ok(/'forced': bool\(m\.get\('forced'\)\)/.test(serverPy), '列表应透出 forced 标记');
    ok(/meta\['forced'\] = True/.test(serverPy), '强制关播应写入 forced 标记');
    ok(/\/api\/admin\/live\/close'/.test(serverPy), '强制关播接口应存在');
  });

  /* P3 admin.js：隐私专区 UI 与审计（静态断言） */
  t('P3 admin 隐私专区静态断言', () => {
    ok(/id="pv-zone"/.test(adminJs) && !/id="pv-code"/.test(adminJs), '隐私专区容器应存在，共享口令输入应移除');
    ok(/执法级隐私数据/.test(adminJs) && /仅当前管理员会话可查，每次查阅均留痕审计/.test(adminJs), '应明示管理员授权与留痕提示');
    ok(/function unlockPrivacy\(/.test(adminJs) && /adminCall\('\/admin\/user\/privacy\?uid='/.test(adminJs), '查阅应通过管理员会话请求隐私接口');
    ok(/function auditLog\(/.test(adminJs) && /yln_privacy_audit/.test(adminJs), '审计日志应落 localStorage');
    ok(/logs\.unshift\(\{uid,nick/.test(adminJs) && /logs\.slice\(0,200\)/.test(adminJs), '审计应含查阅人与 200 条滚动上限');
    ok(/auditLog\(uid,'查阅隐私数据'\)/.test(adminJs), '解锁成功应写审计');
  });

  /* P4 admin.js：广场直播管理页（路由/定时器/关播留痕） */
  t('P4 admin 广场直播管理静态断言', () => {
    ok(/lives:\{t:'广场直播'/.test(adminJs), 'lives 路由应注册在左侧菜单');
    ok(/id="lv-live-n"/.test(adminJs) && /id="lv-done-n"/.test(adminJs) && /id="lv-msg-n"/.test(adminJs) && /id="lv-forced-n"/.test(adminJs), '四个 KPI 应齐备');
    ok(/livesTimer=setInterval\(renderLives,15000\)/.test(adminJs), '直播列表应 15 秒自动刷新');
    ok(/function stopLivesTimer\(/.test(adminJs) && /stopLivesTimer\(\);\n  if\(key==='lives'\)/.test(adminJs), '切页应停旧定时器防泄漏');
    ok(/async function forceCloseLive\(/.test(adminJs) && /confirm\(/.test(adminJs), '强制关播应有二次确认');
    ok(/auditLog\(null,'强制关播：'/.test(adminJs), '强制关播应写审计留痕');
    ok(/async function viewLive\(/.test(adminJs) && /\/api\/live\/stream\?liveId='/.test(adminJs), '查看应拉直播流内容');
    ok(/l\.forced\?'已强制关播':'已收官'/.test(adminJs), '状态列应区分强制关播与自然收官');
  });

  /* P5 auditLog 纯逻辑动态验证（提取函数源码，注入 localStorage stub 独立执行） */
  {
    const m = adminJs.match(/function auditLog\(uid,action\)\{[\s\S]*?\n\}/);
    const mem = {};
    const stubStore = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
    };
    const usersStub = () => [{ id: 'u_p5', nick: '小P' }];
    const fmtTStub = ts => 'T' + ts;
    const audit = new Function('localStorage', 'users', 'fmtT', m[0] + ';return auditLog;')(stubStore, usersStub, fmtTStub);
    __ck('P5a 首次查询返回"首次查阅"', audit('u_p5', null) === '本次为首次查阅');
    audit('u_p5', '查阅隐私数据');
    const logs = JSON.parse(mem.yln_privacy_audit);
    __ck('P5b 追加记录含 nick 与 action', logs.length === 1 && logs[0].nick === '小P' && logs[0].action === '查阅隐私数据');
    __ck('P5c 追加后查询返回留痕摘要', /T\d+ · 查阅隐私数据/.test(audit('u_p5', null)));
    for (let i = 0; i < 210; i++) audit('u_other' + i, '查阅隐私数据');
    const logs2 = JSON.parse(mem.yln_privacy_audit);
    __ck('P5d 超限滚动保持 200 条且新条目在前', logs2.length === 200 && logs2[0].uid === 'u_other209');
  }

  /* P6 admin.js 语法整体可编译（new Function 只编译不执行，防 VIEWS 对象/函数块插入位置错误复发） */
  t('P6 admin.js 语法完整性', () => {
    let syntaxOk = true;
    try { new Function(adminJs); } catch (e) { syntaxOk = false; }
    ok(syntaxOk, 'admin.js 应可整体编译（无对象字面量/函数块结构错误）');
    ok(/lives:\{t:'广场直播'[\s\S]{0,120}\}\n\};/.test(adminJs), 'lives 条目应是 routes 对象最后一条并正确闭合');
  });

  /* P7 后台查看直播实时化：4s 增量轮询 + 收官感知 + 关抽屉停轮询（与手机端直播群同一条消息流） */
  t('P7 后台直播抽屉实时同步静态断言', () => {
    ok(/liveViewTimer=setInterval/.test(adminJs), '查看直播中的流应增量轮询');
    ok(/\/api\/live\/stream\?liveId='\+encodeURIComponent\(liveViewId\)\+'&after='\+liveViewAfter/.test(adminJs), '轮询应带 after 游标增量拉取');
    ok(/if\(inc\.status!=='live'\)\{[\s\S]{0,80}stopLiveView\(\)/.test(adminJs), '应感知主播收官/强制关播并同步收流');
    ok(/function closeDrawer\(\)\{stopLiveView\(\)/.test(adminJs), '关闭抽屉应停轮询（防定时器泄漏）');
  });
} catch (e) { fail++; fails.push('P 组执行'); console.log('  \x1b[31m✗\x1b[0m P 组执行 — ' + e.message); } })();

/* ================= 组 Q：浏览器 SSE 请求头、事件分发与断线重连 ================= */
console.log('\n[Q] 浏览器 SSE 实时同步');
globalThis.__runQ = (async () => { try {
  const store = mkStore(), session = mkStore();
  const calls = [];
  let mode = 'user';
  const response = event => ({
    ok: true, status: 200,
    body: { getReader: () => {
      let sent = false;
      return { read: async () => {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: new TextEncoder().encode('event: update\ndata: ' + JSON.stringify(event) + '\n\n') };
      } };
    } },
  });
  const fetchMock = async (url, opt) => {
    calls.push({ url: String(url), opt });
    if (mode === 'unauthorized') return { ok: false, status: 401 };
    return response(mode === 'admin' ? { type: 'admin' } : { type: calls.length === 1 ? 'wallet' : 'prefs' });
  };
  const fastTimer = (fn, ms) => setTimeout(fn, ms === 2000 ? 5 : ms);
  const Y = new Function('document', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', coreJs + ';return YLN;')(
    { querySelector: () => null, querySelectorAll: () => [], getElementById: () => mkEl() },
    store, session, fetchMock, fastTimer,
  );
  const received = [];
  Y.auth.setToken('tk_q_user');
  Y.events.start({ onEvent: e => received.push(e.type) });
  await new Promise(r => setTimeout(r, 40));
  Y.events.stop();
  __ck('Q1 SSE Token 仅在 Authorization 请求头，URL 不携带', calls.length >= 2
    && calls.every(c => c.url === '/api/events' && !c.url.includes('tk_q_user'))
    && calls.every(c => c.opt.headers.Authorization === 'Bearer tk_q_user'));
  __ck('Q2 SSE 解析事件且 EOF 后自动重连', calls.length >= 2
    && received.includes('wallet') && received.includes('prefs'));

  calls.length = 0; mode = 'admin';
  const adminEvents = [];
  Y.adminAuth.setToken('adm_q');
  Y.events.start({ admin: true, onEvent: e => adminEvents.push(e.type) });
  await new Promise(r => setTimeout(r, 20));
  Y.events.stop();
  __ck('Q3 管理事件使用独立管理员 Token', calls.length >= 1
    && calls[0].opt.headers.Authorization === 'Bearer adm_q'
    && adminEvents.includes('admin'));

  calls.length = 0; mode = 'unauthorized';
  let unauthorized = 0;
  Y.events.start({ onUnauthorized: () => { unauthorized++ } });
  await new Promise(r => setTimeout(r, 20));
  Y.events.stop();
  __ck('Q4 SSE 401 触发会话失效回调', unauthorized >= 1);
} catch (e) { fail++; fails.push('Q 组执行'); console.log('  \x1b[31m✗\x1b[0m Q 组执行 — ' + e.message); } })();

/* ---------- 汇总 ---------- */
setTimeout(() => {
  console.log('\n' + '─'.repeat(44));
  console.log(`结果：\x1b[32m${pass} PASS\x1b[0m / ${fail ? '\x1b[31m' + fail + ' FAIL\x1b[0m' : '0 FAIL'}`);
  if (fails.length) { console.log('失败用例：' + fails.join(' · ')); process.exit(1); }
}, 3000);
