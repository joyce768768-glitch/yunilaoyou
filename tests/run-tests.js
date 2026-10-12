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
const siteJs = fs.readFileSync(path.join(ROOT, 'website/assets/site.js'), 'utf8');
const seg1 = html.match(/\/\* ==== 三端数据桥[\s\S]*?const ri2=\(a,b\)=>[^;]+;/);
const seg2 = html.match(/\/\* 三端同步：登录态下[\s\S]*?\}\s*\}catch\(e\)\{\}/);
const segLlm = html.match(/async function llmChat\(messages,opt=\{\}\)\{[\s\S]*?dsAbort=null; \}\s*\}/);
[['三端数据桥', seg1], ['初始合并', seg2], ['llmChat', segLlm]].forEach(([k, v]) => { if (!v) { console.error('源码段提取失败:', k); process.exit(1); } });

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
   [A] 官网数据层（site.js · SITE 对象）
   ============================================================ */
console.log('\n[A] 官网数据层');
let SITE;
globalThis.localStorage = mkStore();
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: mkEl, body: mkEl() };
globalThis.addEventListener = () => {};
globalThis.IntersectionObserver = class { observe() {} unobserve() {} };
new Function(siteJs + `;SITE_K = SITE;`)();
SITE = globalThis.SITE_K;
t('hash 确定性且差异化', () => { ok(SITE.hash('abc') === SITE.hash('abc') && SITE.hash('abc') !== SITE.hash('abd')); });
t('signup 创建用户并写入会话', () => { const u = SITE.signup('小张', 'z@x.com', 'p1'); ok(u.email === 'z@x.com' && SITE.load(SITE.sessK, null) === u.id && SITE.users().length === 1); });
t('重复邮箱注册被拒绝', () => { let th = false; try { SITE.signup('小张2', 'z@x.com', 'p2'); } catch (e) { th = true; } ok(th); });
t('login 成功建立会话', () => { const u = SITE.login('z@x.com', 'p1'); ok(u.nick === '小张' && SITE.load(SITE.sessK, null) === u.id); });
t('密码错误被拒绝', () => { let th = false; try { SITE.login('z@x.com', 'wrong'); } catch (e) { th = true; } ok(th); });
t('未注册邮箱被拒绝', () => { let th = false; try { SITE.login('n@x.com', 'p'); } catch (e) { th = true; } ok(th); });
t('me() 读取当前登录用户', () => { ok(SITE.me() && SITE.me().email === 'z@x.com'); });
t('updateUser 补丁生效并持久化', () => { SITE.updateUser({ points: 500 }); ok(SITE.me().points === 500 && SITE.users()[0].points === 500); });
t('createOrder 写入订单（YL 前缀 · paid）', () => { const o = SITE.createOrder({ plan: '标准月卡', planKey: 'plus', amount: 89 }); const os = SITE.orders(); ok(os.length === 1 && os[0].id.startsWith('YL') && os[0].status === 'paid' && os[0].amount === 89); });
t('logout 清除会话', () => { SITE.logout(); ok(SITE.me() === null); });

/* ============================================================
   [B] 管理后台（admin.js · 鉴权 / 种子 / 渲染 / 操作）
   ============================================================ */
console.log('\n[B] 管理后台');
globalThis.localStorage = mkStore(); globalThis.sessionStorage = mkStore();
const Bels = {};
globalThis.document = { querySelector: () => mkEl(), querySelectorAll: () => [], getElementById: id => (Bels[id] = Bels[id] || mkEl()), createElement: mkEl, body: mkEl() };
globalThis.addEventListener = () => {}; globalThis.matchMedia = () => ({ matches: false });
globalThis.location = { hash: '' }; globalThis.URL.createObjectURL = () => 'blob:x';
new Function(coreJs + '\n' + adminJs + `
;['login','app','lg-user','lg-pwd','lg-err','view','pt','ps'].forEach(id=>$  (id));
const ck=(n,c)=>__ck(n,c);
/* 种子完整性 */
ck('B1 种子数据完整性', (()=>{const us=users(),os=orders(),tk=tokens();return us.length>=10&&os.length>=16&&tk.length===42})());
/* 鉴权五连 */
$('login').hidden=false;$('app').hidden=false;router();
ck('B2 未登录→强制登录页', $('login').hidden===false&&$('app').hidden===true);
$('lg-user').value='admin';$('lg-pwd').value='wrong';tryLogin({preventDefault(){}});
ck('B3 错误密码→报错不进入', $('lg-err').textContent==='账号或密码不正确'&&!sessionStorage.getItem('yln_admin_session'));
$('lg-user').value='';$('lg-pwd').value='';tryLogin({preventDefault(){}});
ck('B4 空表单→提示输入', $('lg-err').textContent==='请输入账号与密码');
$('lg-user').value='admin';$('lg-pwd').value='admin888';tryLogin({preventDefault(){}});
ck('B5 正确登录→进入后台', sessionStorage.getItem('yln_admin_session')==='1'&&$('app').hidden===false);
/* 五页面渲染 */
let allOk=true, err='';
for(const k of Object.keys(routes)){try{const h=routes[k].f();if(h.length<400){allOk=false;err=k+' 渲染过短'}}catch(e){allOk=false;err=k+': '+e.message}}
ck('B6 五页面渲染无错', allOk===true);
/* monthBars 聚合 */
(()=>{const now=new Date();
  const mkO=(amt,mOff)=>({amount:amt,time:new Date(now.getFullYear(),now.getMonth()-mOff,15).getTime(),status:'paid'});
  const hb=monthBars([mkO(89,0),mkO(890,0),mkO(89,1)],'finance');
  return hb.includes('data-v="¥979"')})();
ck('B7 monthBars 月度聚合正确', (()=>{const now=new Date();
  const mkO=(amt,mOff)=>({amount:amt,time:new Date(now.getFullYear(),now.getMonth()-mOff,15).getTime(),status:'paid'});
  return monthBars([mkO(89,0),mkO(890,0),mkO(89,1)],'finance').includes('data-v="¥979"')})());
/* 退款与赠送 */
(()=>{const id=orders()[0].id;refund(id)})();
ck('B8 退款标记生效', orders()[0].status==='refund');
const __before=(()=>{const us=users();const i=us.findIndex(u=>u.id==='seed0');return us[i].points})();
(()=>{gift('seed0')})();
ck('B9 积分赠送生效(+100)', users().find(x=>x.id==='seed0').points===__before+100);
/* 登出 */
logout();
ck('B10 登出→回登录页', !sessionStorage.getItem('yln_admin_session')&&$('login').hidden===false);
`)();

/* ============================================================
   [C] APP 三端同步（index.html 源码段）
   ============================================================ */
console.log('\n[C] APP 三端同步');
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
  ${seg2[0]}
  ck('C3 首登→游客资产合并入账(880+60)', wallet.points===940&&wallet.coupons===10&&wallet.synced==='t@x.com');
  ck('C3b 合并写回官网', JSON.parse(localStorage.getItem('yln_site_users'))[0].points===940);
  /* 拉回 */
  const su3=JSON.parse(localStorage.getItem('yln_site_users'))[0];su3.points=1389;su3.coupons=6;
  localStorage.setItem('yln_site_users',JSON.stringify([su3]));
  ${seg2[0]}
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
(async()=>{ globalThis.__runCP = (async()=>{ try { if (globalThis.__runC) await globalThis.__runC(); } catch (e) { fail++; fails.push('C 组执行'); console.log('  \x1b[31m✗\x1b[0m C 组执行 — ' + e.message); } })(); })();

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

/* ---------- 汇总 ---------- */
setTimeout(() => {
  console.log('\n' + '─'.repeat(44));
  console.log(`结果：\x1b[32m${pass} PASS\x1b[0m / ${fail ? '\x1b[31m' + fail + ' FAIL\x1b[0m' : '0 FAIL'}`);
  if (fails.length) { console.log('失败用例：' + fails.join(' · ')); process.exit(1); }
}, 1500);
