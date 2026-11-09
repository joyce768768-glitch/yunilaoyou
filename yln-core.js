/* ============================================================
   与你老友 · yln-core.js 共享核心层
   原则：一套后台逻辑，三端（手机 APP / 官网 / 管理后台）只做展示。
   本文件是唯一的业务逻辑与数据契约：
   ├─ 键名注册表（= 未来数据库建表蓝图）
   ├─ 存储读写（localStorage 不可用时自动降级内存，便于 node 测试）
   ├─ 会员套餐（全端唯一事实源：4 档）
   ├─ 三端数据桥（官网用户 / 钱包写穿 / Token 流水）
   ├─ LLM 通道（DeepSeek，唯一 Key 管理 + 用量回调）
   └─ 女娲管线 v2（唯一 prompt：蒸馏 → 验证 → 思维内核清洗）
   未来接真后端：本文件每个函数对应一个 API endpoint，前端零改动。
   ============================================================ */
const YLN = (() => {

  /* ---- 键名注册表（数据库 schema 蓝图） ---- */
  const K = {
    chars: 'yln_chars',                    /* 用户私有老友（女娲捏的） */
    charsMeta: 'yln_chars_meta',           /* 私有老友同步戳 {updated, synced}（P2 跨端 LWW 合并） */
    roundsMeta: 'yln_rounds_meta',         /* 圆桌同步戳 {updated, synced}（P3 跨端 LWW 合并） */
    prefs: 'yln_prefs',                    /* 用户偏好设置（P4 设备级，服务器为准 + 写穿） */
    adminChars: 'yln_admin_chars',         /* 官方老友（后台发布） */
    adminCharsSeeded: 'yln_admin_chars_seeded',
    adminSeeded: 'yln_admin_seeded',
    authToken: 'yln_auth_token',           /* 本地服务器会话 token（P0 鉴权，Bearer） */
    wallet: 'yln_wallet',                  /* 用户资产：积分/老友券/会员 */
    rounds: 'yln_rounds',                  /* 圆桌会话存档 */
    site: {
      users: 'yln_site_users',             /* 官网注册用户 */
      session: 'yln_site_session',         /* 官网登录态 */
      orders: 'yln_site_orders',           /* 官网订单 */
      tokens: 'yln_token_logs',            /* Token 消耗流水（三端共享） */
      traces: 'yln_nuwa_traces',           /* 女娲管线 Trace（可观测数据源） */
      prompts: 'yln_nuwa_prompts',         /* 管线 Prompt 模板覆盖（管理员热编辑） */
      skills: 'yln_skills'                 /* 角色库（SKILL.md 产物；服务端可达时同步 SQLite） */
    }
  };

  /* ---- 存储读写：localStorage 不可用时降级内存（node 可测） ---- */
  const _mem = {};
  const store = {
    get(k){ try{ if(typeof localStorage==='undefined')return _mem[k]??null; return localStorage.getItem(k) }catch(e){ return _mem[k]??null } },
    set(k,v){ try{ if(typeof localStorage==='undefined'){ _mem[k]=v; return } localStorage.setItem(k,v) }catch(e){ _mem[k]=v } }
  };
  const sessionStore = {
    get(k){ try{ if(typeof sessionStorage==='undefined')return _mem[k]??null; return sessionStorage.getItem(k) }catch(e){ return _mem[k]??null } },
    set(k,v){ try{ if(typeof sessionStorage==='undefined'){ _mem[k]=v; return } if(v)sessionStorage.setItem(k,v);else sessionStorage.removeItem(k) }catch(e){ if(v)_mem[k]=v;else delete _mem[k] } }
  };
  const jload = (k,d) => { try{ const v=JSON.parse(store.get(k)); return v??d }catch(e){ return d } };
  const jsave = (k,v) => store.set(k,JSON.stringify(v));

  /* ---- 会员套餐（全端唯一事实源，与 APP PLANS 同步） ---- */
  const PLANS = [
    { id:'trial', name:'体验装', price:9.9,  points:150,  coupons:0 },
    { id:'lite',  name:'轻量月卡', price:39.9, points:600,  coupons:2 },
    { id:'plus',  name:'标准月卡', price:89,   points:2000, coupons:4, best:true },
    { id:'max',   name:'创作月卡', price:169,  points:8000, coupons:8 }
  ];
  const PLAN_NAME = { free:'免费版', trial:'体验装', lite:'轻量月卡', plus:'标准月卡', max:'创作月卡' };

  /* ---- 官网用户桥（三端同浏览器互通） ---- */
  function siteSession(){ return jload(K.site.session,null) }
  function siteUser(){
    const s = siteSession();
    if(!s)return null;
    const us = jload(K.site.users,[]);
    /* 兼容两种 session 格式：官网 site.js 存裸用户 id 字符串；旧版约定存 {email} 对象 */
    if(typeof s==='string')return us.find(u=>u.id===s)||null;
    if(s.email)return us.find(u=>u.email===s.email)||null;
    if(s.id)return us.find(u=>u.id===s.id)||null;
    return null;
  }
  function siteSaveUser(u){
    const us = jload(K.site.users,[]);
    const i = us.findIndex(x=>x.email===u.email);
    if(i>=0)us[i]=u; else us.push(u);
    jsave(K.site.users,us);
  }

  /* ---- 钱包（用户资产唯一逻辑；P1 起服务器 yln_wallet 表为跨端事实源，updated 戳 LWW 合并） ---- */
  const WALLET_DEFAULT = () => ({plan:'free',points:0,coupons:5,freeSpeaks:3,freeDesk:1,
    ledger:[{t:Date.now(),n:'新人礼包 · 老友券 ×5 + 免费插话 ×3 + 免费建桌 ×1',d:0}],updated:Date.now()});
  function walletLoad(){
    const w = jload(K.wallet,null);
    return (w && typeof w.points==='number' && w.ledger) ? w : null;
  }
  /* 官网账号写穿（钱包变动实时可见于官网/管理后台） */
  function walletSiteWrite(w){
    const su = siteUser();
    if(su){
      su.points=w.points; su.coupons=w.coupons; su.plan=w.plan;
      if(su.plan!=='free')su.planUntil=su.planUntil||w.planUntil||Date.now()+30*864e5;
      siteSaveUser(su);
    }
  }
  function walletSave(w){
    w.updated=Date.now();                /* LWW 戳：每次真实变动才盖章 */
    jsave(K.wallet,w);
    walletSiteWrite(w);
    /* P1 写穿服务器（fire-and-forget；停机静默降级本地，下次 walletPull 按 LWW 追平） */
    if(AUTH.token())AUTH.call('/wallet',{method:'POST',body:JSON.stringify({wallet:w})});
  }
  /* 纯状态记账：增减积分并写流水（UI 渲染由各端自己做） */
  function walletApply(w,n,label){
    w.points+=n;
    w.ledger.unshift({t:Date.now(),n:label,d:n});
    if(w.ledger.length>40)w.ledger.length=40;
    walletSave(w);
    return w;
  }
  /* P1 钱包跨端同步：me() 成功后调用。按 updated 戳 LWS：
     服务器较新 → 采回本地（游客资产未并入时先加和并回推）；
     本地较新（含离线改动）→ 推送覆盖服务器；服务器无记录 → 本地播种。
     无 token / 服务不可达 → null（调用方保持本地现状，不阻塞）。 */
  async function walletPull(accountEmail){
    if(!AUTH.token())return null;
    const d = await AUTH.call('/wallet');
    if(!d || !d.ok)return null;
    const local = walletLoad();
    const srv = d.wallet;                          /* null = 服务器尚无该用户钱包记录 */
    if(!srv){
      if(!local)return null;
      if(local.synced && local.synced!==accountEmail)return null;  /* 他人账号残留钱包，不播种污染新账号 */
      local.synced=accountEmail||local.synced||null;
      walletSave(local);                           /* 盖章+官网写穿+推送：首建服务器钱包 */
      return local;
    }
    const lu=(local&&local.updated)||0, su=srv.updated||0;
    if(lu>su && local){                            /* 本地较新 → 推送（离线改动追平服务器） */
      local.synced=accountEmail||local.synced||null;
      walletSave(local);
      return local;
    }
    /* 服务器较新或持平 → 采用服务器数值 */
    const w = Object.assign({}, local||{}, srv);
    w.updated=su;
    if(srv.plan==='free')w.planUntil=null;
    if(local && !local.synced && lu!==su){         /* 纯游客钱包且非同一次写入 → 游客资产首并 */
      w.points=(srv.points||0)+(local.points||0);
      w.coupons=(srv.coupons||0)+(local.coupons||0);
      if(!(srv.plan&&srv.plan!=='free')&&local.plan&&local.plan!=='free'){w.plan=local.plan;w.planUntil=local.planUntil||null}
      w.ledger=[{t:Date.now(),n:'已同步官网账号 · 游客资产并入',d:0},...(srv.ledger||[]),...(local.ledger||[])].slice(0,40);
      w.synced=accountEmail;                       /* 标记已并入，防下次启动重复加和 */
      walletSave(w);                               /* 加和后变动 → 盖章回推服务器 */
      return w;
    }
    w.synced=accountEmail||(local&&local.synced)||w.synced||null;
    jsave(K.wallet,w);
    walletSiteWrite(w);                            /* 官网/后台数值对齐服务器 */
    return w;
  }

  /* ---- Token 流水（圆桌消耗 → 后台 Token 计算模块） ---- */
  function appendTokenLog(e){
    const logs = jload(K.site.tokens,[]);
    logs.unshift({id:'S'+Date.now().toString().slice(-6),time:Date.now(),...e});
    if(logs.length>200)logs.length=200;
    jsave(K.site.tokens,logs);
  }

  /* ---- 老友存取（官方库 / 私有库统一出入口） ---- */
  const adminChars = () => jload(K.adminChars,[]);
  const saveAdminChars = list => jsave(K.adminChars,list);
  const privateChars = () => jload(K.chars,{});
  const charsMeta = () => jload(K.charsMeta,{updated:0,synced:null});
  /* 私有老友 = 女娲捏的（nuwa_）+ 手动创建（my_）+ 广场领养的（owner）；官方库老友（official）由 /api/chars 下发，不进用户私有同步，防双源打架 */
  const ownChars = obj => { const o={}; Object.entries(obj||{}).forEach(([k,v])=>{ if(v&&v.name&&(String(k).startsWith('nuwa_')||String(k).startsWith('my_')||v.owner)) o[k]=v }); return o };
  /* P2 私有老友写穿服务器（fire-and-forget；停机静默降级本地，下次 privateCharsPull 按 LWW 追平） */
  function savePrivateChars(obj){
    const m = charsMeta();
    m.updated = Date.now();              /* LWW 戳：每次真实变动才盖章 */
    jsave(K.chars,obj);
    jsave(K.charsMeta,m);
    const own = ownChars(obj);
    if(AUTH.token())AUTH.call('/my/chars',{method:'POST',body:JSON.stringify({chars:own,updated:m.updated})});
  }
  /* P2 私有老友跨端同步：me() 成功后调用。按 updated 戳 LWW：
     服务器无记录 → 本地播种；本地较新（离线捏人）→ 推送覆盖；
     服务器较新 → 采回本地；本地游客老友未并入 → 并入账号后回推。
     无 token / 服务不可达 → null（调用方保持本地现状，不阻塞）。 */
  async function privateCharsPull(accountEmail){
    if(!AUTH.token())return null;
    const d = await AUTH.call('/my/chars');
    if(!d || !d.ok)return null;
    const local = privateChars();
    const nLocal = Object.keys(local).length;
    const m = charsMeta();
    const srv = d.chars;                             /* null = 服务器尚无该用户私有老友 */
    const su = d.updated||0, lu = m.updated||0;
    if(!srv){
      if(!nLocal)return null;
      if(m.synced && m.synced!==accountEmail)return null;  /* 他人账号残留老友，不播种污染新账号 */
      m.synced=accountEmail||m.synced||null;
      jsave(K.charsMeta,m);
      AUTH.call('/my/chars',{method:'POST',body:JSON.stringify({chars:ownChars(local),updated:Date.now()})});  /* 首建服务器老友库 */
      return local;
    }
    if(lu>su && nLocal){                             /* 本地较新（离线捏人/改动）→ 推送覆盖服务器 */
      m.synced=accountEmail||m.synced||null;
      m.updated=Date.now();
      jsave(K.charsMeta,m);
      AUTH.call('/my/chars',{method:'POST',body:JSON.stringify({chars:ownChars(local),updated:m.updated})});
      return local;
    }
    if(nLocal && !m.synced && lu!==su){              /* 纯游客老友且非同一次写入 → 游客老友首并入账号 */
      const merged = Object.assign({}, srv, local);  /* id 冲突本地优先（nuwa_ 时间戳 id 实际不冲突） */
      m.updated=Date.now(); m.synced=accountEmail||null;
      jsave(K.chars,merged); jsave(K.charsMeta,m);
      AUTH.call('/my/chars',{method:'POST',body:JSON.stringify({chars:ownChars(merged),updated:m.updated})});
      return merged;
    }
    m.updated=su; m.synced=accountEmail||m.synced||null;
    jsave(K.chars,srv); jsave(K.charsMeta,m);        /* 服务器较新或持平 → 采用服务器（不回推） */
    return srv;
  }

  /* ---- P5 广场直播流（yln_live 表：独立直播流逐条追加，围观者共享同一条消息流） ---- */
  async function liveOpen(meta){ return AUTH.call('/live/open',{method:'POST',body:JSON.stringify(meta)}); }
  async function livePost(liveId,msgs){ return AUTH.call('/live/post',{method:'POST',body:JSON.stringify({liveId,msgs})}); }
  async function liveClose(liveId){ return AUTH.call('/live/close',{method:'POST',body:JSON.stringify({liveId})}); }
  async function liveList(){ const d=await AUTH.call('/live/list'); return d&&d.ok?d.lives:null; }
  async function liveStream(liveId,after){
    const d=await AUTH.call('/live/stream?liveId='+encodeURIComponent(liveId)+'&after='+(after||0));
    return d&&d.ok?d:null;
  }
  /* 演示桌剧本续播：每次打开续播下一轮组（默认 3 轮），服务器为唯一事实源（全端同步） */
  async function demoNext(liveId,rounds){
    const d=await AUTH.call('/live/demo_next?liveId='+encodeURIComponent(liveId)+'&rounds='+(rounds||3));
    return d&&d.ok?d:null;
  }

  /* ---- P3 圆桌会话跨端同步（yln_round 表为唯一事实源，全量数组替换 + LWW） ---- */
  const roundsMeta = () => jload(K.roundsMeta,{updated:0,synced:null});
  /* index.html saveRounds() 唯一写入口：落本地 + 盖章 + 写穿服务器（fire-and-forget；停机静默降级） */
  function saveRoundsCloud(list){
    const m = roundsMeta();
    m.updated = Date.now();              /* LWW 戳：每次真实变动才盖章 */
    jsave(K.rounds,list||[]);
    jsave(K.roundsMeta,m);
    if(AUTH.token())AUTH.call('/my/rounds',{method:'POST',body:JSON.stringify({rounds:list||[],updated:m.updated})});
  }
  /* P3 圆桌拉取合并：me() 成功后调用。按 updated 戳 LWW：
     服务器无记录 → 本地播种；本地较新（离线开桌/收官/改名/删除）→ 推送覆盖；
     服务器较新 → 采回；本地游客圆桌未并入 → 按 id 合并（本地优先）后回推。
     无 token / 服务不可达 → null（调用方保持本地现状，不阻塞）。 */
  async function roundsPull(accountEmail){
    if(!AUTH.token())return null;
    const d = await AUTH.call('/my/rounds');
    if(!d || !d.ok)return null;
    const local = jload(K.rounds,[]);
    const m = roundsMeta();
    const srv = d.rounds;                            /* null = 服务器尚无该用户圆桌记录 */
    const su = d.updated||0, lu = m.updated||0;
    if(!srv){
      if(!local.length)return null;
      if(m.synced && m.synced!==accountEmail)return null;  /* 他人账号残留圆桌，不播种污染新账号 */
      m.synced=accountEmail||m.synced||null;
      jsave(K.roundsMeta,m);
      AUTH.call('/my/rounds',{method:'POST',body:JSON.stringify({rounds:local,updated:Date.now()})});  /* 首建服务器圆桌库 */
      return local;
    }
    if(lu>su && local.length){                       /* 本地较新（离线改动）→ 推送覆盖服务器 */
      m.synced=accountEmail||m.synced||null;
      m.updated=Date.now();
      jsave(K.roundsMeta,m);
      AUTH.call('/my/rounds',{method:'POST',body:JSON.stringify({rounds:local,updated:m.updated})});
      return local;
    }
    if(local.length && !m.synced && lu!==su){        /* 纯游客圆桌且非同一次写入 → 游客圆桌首并入账号 */
      const map={}; srv.forEach(r=>{if(r&&r.id)map[r.id]=r});
      local.forEach(r=>{if(r&&r.id)map[r.id]=r});    /* id 冲突本地优先（正在直播中的本地状态为准） */
      const merged=Object.values(map).sort((a,b)=>(b.ts||0)-(a.ts||0));  /* 新桌在前，与 ROUNDS.unshift 顺序一致 */
      m.updated=Date.now(); m.synced=accountEmail||null;
      jsave(K.rounds,merged); jsave(K.roundsMeta,m);
      AUTH.call('/my/rounds',{method:'POST',body:JSON.stringify({rounds:merged,updated:m.updated})});
      return merged;
    }
    m.updated=su; m.synced=accountEmail||m.synced||null;
    jsave(K.rounds,srv); jsave(K.roundsMeta,m);      /* 服务器较新或持平 → 采用服务器（不回推） */
    return srv;
  }

  /* ---- P4 偏好设置（yln_prefs 表；设备级设置，服务器为准 + 写穿，不做 LWW） ---- */
  function prefsLoad(){ return jload(K.prefs,{}) }
  /* togglePref 唯一写入口：落本地 + 写穿服务器（fire-and-forget；停机静默降级） */
  function prefsSave(p){
    jsave(K.prefs,p||{});
    if(AUTH.token())AUTH.call('/my/prefs',{method:'POST',body:JSON.stringify({prefs:p||{}})});
  }
  /* P4 偏好拉取：me() 成功后调用。服务器有记录 → 以服务器为准覆盖本地（返回 prefs 供 UI 套用）；
     服务器无记录 → 本地播种推送；停机/无 token → null（保持本地现状）。 */
  async function prefsPull(){
    if(!AUTH.token())return null;
    const d = await AUTH.call('/my/prefs');
    if(!d || !d.ok)return null;
    if(!d.prefs){                                    /* 服务器无记录 → 本地播种 */
      const p = prefsLoad();
      if(Object.keys(p).length)AUTH.call('/my/prefs',{method:'POST',body:JSON.stringify({prefs:p})});
      return null;                                   /* 本地无改动时无需 UI 套用 */
    }
    jsave(K.prefs,d.prefs);
    return d.prefs;
  }

  /* ---- LLM 通道（唯一 Key 管理；usage 通过 opt.onUsage 回调） ---- */
  const LLM = {
    url:'https://api.deepseek.com/chat/completions',
    model:'deepseek-chat',
    /* Key 只从本机读取（localStorage 'ds_api_key'），不内置任何密钥——公开仓库安全底线 */
    getKey(){ return (store.get('ds_api_key')||'').trim() }
  };
  async function llm(messages,opt={}){
    const own = !opt.signal;                       /* 调用方未给 signal 时自管超时 */
    const ctrl = own ? new AbortController() : null;
    const to = own ? setTimeout(()=>ctrl.abort(), opt.timeout||45000) : null;
    try{
      const r = await fetch(LLM.url,{
        method:'POST', signal: opt.signal||ctrl.signal,
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+LLM.getKey()},
        body:JSON.stringify({model:LLM.model,messages,temperature:opt.temp??0.85,max_tokens:opt.max??320,stream:false})
      });
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d = await r.json();
      if(d.usage&&opt.onUsage)opt.onUsage({tin:d.usage.prompt_tokens||0,tout:d.usage.completion_tokens||0});
      return (d.choices?.[0]?.message?.content||'').trim();
    } finally { if(to)clearTimeout(to) }
  }

  /* ---- 管线用量累计（nuwaTrace 快照用；单用户串行使用，混计可接受） ---- */
  const _tok={tin:0,tout:0,calls:0};
  const tokWatch=u=>{ if(u){_tok.tin+=u.tin||0;_tok.tout+=u.tout||0} _tok.calls++ };
  function tokReset(){_tok.tin=0;_tok.tout=0;_tok.calls=0}
  function tokSnap(){return {tin:_tok.tin,tout:_tok.tout,calls:_tok.calls}}

  /* ---- Prompt 模板注册表（管理员后台可热编辑；{{var}} 占位，覆盖存 yln_nuwa_prompts） ---- */
  const DEFAULT_PROMPTS={
    /* 六路采集：{{ch}}通道名 {{name}}对象 {{dir}}方向块 {{ask}}聚焦 {{wiki}}维基块 */
    six:'你是女娲六路采集器的「{{ch}}」通道。对象：{{name}}{{dir}}。任务：用你记忆里关于 TA 的真实公开信息，写 2-5 条要点，每条一行、≤30 字。\n要求：\n1. 用自己的话概述，不要逐字引用原文（这是概述任务，不是引用任务）；\n2. 只写你有印象的内容，宁少勿编；把握不足的条目末尾标注「(模糊)」；\n3. 只有当你对 TA 在该通道毫无印象时，才只输出「该通道信息有限」。\n聚焦：{{ask}}{{wiki}}',
    /* 蒸馏：{{name}} {{corpusBlock}}语料块 {{dirBlock}}方向块 {{fbBlock}}回炉扣分点块 */
    distill:'你是女娲造人引擎 v2，对齐真女娲管线（心智模型/决策启发式/表达DNA/诚实边界）。{{corpusBlock}}{{dirBlock}}{{fbBlock}}\n输出 JSON（只输出 JSON）：\n{"title":"身份一句话,12字内","field":"科技/商业/智慧/创作/生涯 之一","tags":["3个,每个≤6字"],"quote":"TA 口吻金句,25字内,第一人称","mind":{"models":[{"n":"心智模型名","d":"一句话:TA 怎么用它看问题"}],"heuristics":["场景→TA 的决策规则"],"dna":["表达特征1","表达特征2","表达特征3"],"blind":"TA 的盲区/反模式一句话","bound":"诚实边界:哪些是推演/语料未覆盖","taboos":["TA 绝不会说的话/做的事1","2"]}}\n要求：models 2-3 个必须真的能当镜片用（拿来分析新问题，不是语录）；heuristics 2-3 条必须可执行；dna 是可辨识的语言指纹（句式/口头禅/节奏）；taboos 2-3 条是 TA 的禁忌与反模式（明确不会说、不会做的选择）。',
    /* 三路验证：{{task}}任务描述 */
    verify:'你是女娲验证官。执行「{{task}}」检验，输出 JSON：{"score":0-100,"note":"一句话结论"}。只输出 JSON。',
    /* 黑盒实答：{{name}} {{mind}}角色设定 */
    probeAnswer:'你现在就是「{{name}}」本人。严格按下面的角色设定说话与决策，不要出戏，绝口不提「设定/档案/角色」这类词。\n【角色设定】\n{{mind}}\n要求：第一人称，口语自然，≤120 字；问题超出你的认知边界时诚实承认不知道，禁止编造。',
    /* 黑盒判卷 */
    probeJudge:'你是黑盒评测判卷官。下面是一个角色的设定与其对 3 道压力测试题的实际回答，请评估回答像不像角色本人：\n1) 语言指纹与表达风格是否吻合；\n2) 是否真的在用 TA 的心智模型与决策规则，而非通用套话；\n3) 是否踩了 TA 的禁忌/反模式，或越过认知边界编造。\n输出 JSON（只输出 JSON）：{"score":0-100,"issues":["扣分点1","扣分点2"]}\n70 分以上=可放行；平庸、套话、出戏、编造都要扣分。',
    /* 聊天人设（圆桌群聊/单聊 system，APP 端 personaSys 委托这里）：{{name}} {{title}} {{models}} {{heur}} {{dna}} {{blind}} {{bound}} */
    chatPersonaMind:'你是「{{name}}」（{{title}}）的 AI 分身，在一个呆萌圆桌 App 里和用户的其他老友群聊。\n你的思维内核（女娲蒸馏）：\n【心智模型】看世界的镜片，每个议题先经过它折射：\n{{models}}\n【决策启发式】场景→规则：\n{{heur}}\n【表达DNA】{{dna}}\n【盲区与反模式】{{blind}}\n【诚实边界】{{bound}}\n要求：1) 发言必须真的用上面的心智模型推理（不是贴语录），让对方能看出你的思考路径；2) 事实优先：用户问到具体的书、作品、人物、事件或数据时，先用你知道的真实内容回应（作者、核心概念、关键细节），再用你的心智模型点评；没把握就直说不确定，严禁编造不存在的书名、数据或引文；3) 中文口语，一般不超过 120 字；4) 呆萌但思想锋利，可以有情绪和笑点；5) 直接输出内容，不要前缀、引号、markdown。',
    /* 聊天人设（语录变体）：{{name}} {{title}} {{quote}} {{tags}} */
    chatPersonaQuote:'你是「{{name}}」（{{title}}）的 AI 分身，在一个呆萌圆桌 App 里和用户的其他老友群聊。\n你的思想内核：「{{quote}}」；关键词：{{tags}}。\n要求：1) 完全用 TA 的口吻、思维方式与招牌风格；2) 事实优先：用户问到具体的书、作品、人物、事件或数据时，先用你知道的真实内容回应（作者、核心概念、关键细节），再用 TA 的招牌视角点评；没把握就直说不确定，严禁编造不存在的书名、数据或引文；3) 中文口语，一般不超过 120 字；4) 呆萌但思想锋利，可以有情绪和笑点；5) 直接输出内容，不要前缀、引号、markdown。',
    /* 插话回应指令：{{user}} 用户昵称 */
    chatAskGroup:'用户（{{user}}）在圆桌里插了话，请直接回应 TA：抓住 TA 话里最核心的点，用你的视角回应；TA 提到具体的书、作品或事实时先给真实内容再点评。不超过 120 字。',
    /* 单聊回应指令：{{user}} */
    chatAskSolo:'用户（{{user}}）是你的老朋友，正在和你单独聊天。请像老朋友聊天一样自然回应 TA：口语化、真诚、有来有回，可以反问或调侃，不要辩论腔；TA 提到具体的书、作品或事实时先给真实内容再聊聊你的看法。一般不超过 120 字。',
    /* 演示桌围观插话回应指令：{{user}} */
    chatAskDemo:'观众（{{user}}）在圆桌里插了话，请直接回应 TA：抓住 TA 话里最核心的点，用你的视角回应；TA 提到具体的书、作品或事实时先给真实内容再点评。不超过 120 字。',
    /* 圆桌纪要管家（收官 3 行要点） */
    chatSummary:'你是圆桌的中立管家，负责输出呆萌但专业的会议纪要。恰好输出 3 行，每行一个要点、不超过 30 字，不要序号、引号和 markdown。'
  };
  const PROMPT_META=[
    {key:'six',label:'六路采集',desc:'六路并行采集通道的系统 Prompt',group:'nuwa'},
    {key:'distill',label:'女娲蒸馏',desc:'五层思维内核蒸馏的主 Prompt（含 taboos 禁忌字段）',group:'nuwa'},
    {key:'verify',label:'三路验证',desc:'跨域复现 / 生成力 / 排他性检验的判分 Prompt',group:'nuwa'},
    {key:'probeAnswer',label:'黑盒实答',desc:'黑盒评测中角色实答压力题的 Prompt',group:'nuwa'},
    {key:'probeJudge',label:'黑盒判卷',desc:'黑盒评测判卷官的评分 Prompt',group:'nuwa'},
    {key:'chatPersonaMind',label:'人设 · 思维内核版',desc:'有女娲思维内核的老友群聊 system Prompt（{{name}} {{title}} {{models}} {{heur}} {{dna}} {{blind}} {{bound}}）',group:'chat',rows:10},
    {key:'chatPersonaQuote',label:'人设 · 语录版',desc:'无思维内核老友（语录+关键词）群聊 system Prompt（{{name}} {{title}} {{quote}} {{tags}}）',group:'chat',rows:7},
    {key:'chatAskGroup',label:'插话指令 · 圆桌',desc:'用户在圆桌插话时 user 消息里的回应指令（{{user}}）',group:'chat',rows:4},
    {key:'chatAskSolo',label:'插话指令 · 单聊',desc:'一对一私聊时 user 消息里的回应指令（{{user}}）',group:'chat',rows:4},
    {key:'chatAskDemo',label:'插话指令 · 演示桌',desc:'广场演示桌观众插话的回应指令（{{user}}）',group:'chat',rows:4},
    {key:'chatSummary',label:'圆桌纪要',desc:'收官时中立管家输出 3 行纪要的 system Prompt',group:'chat',rows:4}
  ];
  const fill=(tpl,vars)=>String(tpl||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>vars&&vars[k]!=null?String(vars[k]):'');
  function getPrompt(key){ const ov=jload(K.site.prompts,{}); return (ov&&ov[key])||DEFAULT_PROMPTS[key]||'' }
  /* P2 Prompt 覆盖写穿服务器（管理员热编辑跨端唯一事实源；fire-and-forget，停机降级本地） */
  function setPrompt(key,val){ if(!DEFAULT_PROMPTS[key])return false; const ov=jload(K.site.prompts,{}); ov[key]=String(val); jsave(K.site.prompts,ov);
    ADMIN_AUTH.call('/nuwa/prompts',{method:'POST',body:JSON.stringify({id:key,text:String(val)})}); return true }
  function resetPrompt(key){ const ov=jload(K.site.prompts,{}); delete ov[key]; jsave(K.site.prompts,ov);
    ADMIN_AUTH.call('/nuwa/prompts',{method:'POST',body:JSON.stringify({id:key,text:''})}) }
  /* P2 Prompt 覆盖跨端拉取：boot 时调用，服务器为准全量替换本地（管理员单点编辑，无 LWW 必要）；不可达保持本地 */
  async function promptsPull(){
    const d = await AUTH.call('/nuwa/prompts');
    if(!d || !d.ok || !d.prompts)return null;
    jsave(K.site.prompts, d.prompts);
    return d.prompts;
  }
  function promptIsCustom(key){ const ov=jload(K.site.prompts,{}); return !!(ov&&ov[key]!=null) }

  /* ---- 圆桌聊天 Prompt 组装（APP 端 personaSys/askLine 的唯一事实源，后台调试台同款） ----
     单老友覆盖优先：c.promptSys（老友管理编辑抽屉里填）> 全局模板（chatPersonaMind/chatPersonaQuote） */
  function personaSysBuild(c){
    if(!c)return '';
    if(c.promptSys&&String(c.promptSys).trim())return String(c.promptSys);
    if(c.mind){
      const m=c.mind;
      const models=(m.models||[]).map((x,i)=>`${i+1}. ${x.n}——${x.d}`).join('\n');
      const heur=(m.heuristics||[]).join('\n');
      return fill(getPrompt('chatPersonaMind'),{
        name:c.name,title:c.title||'',models:models||'（无）',heur:heur||'（无）',
        dna:(m.dna||[]).join('；'),blind:m.blind||'无',bound:m.bound||'无'});
    }
    return fill(getPrompt('chatPersonaQuote'),{
      name:c.name,title:c.title||'',quote:c.quote||'',tags:(c.tags||[]).join('、')});
  }
  /* kind: 'group' 圆桌插话 / 'solo' 一对一私聊 / 'demo' 演示桌观众插话；user=用户昵称 */
  function askLineBuild(kind,user){
    const key=kind==='solo'?'chatAskSolo':kind==='demo'?'chatAskDemo':'chatAskGroup';
    return fill(getPrompt(key),{user:user||'用户'});
  }

  /* ---- 女娲管线 v2（唯一 prompt：两端共用，改这里=改两端；模板走注册表可热编辑） ---- */
  function nuwaSystem(name,dir,corpus,feedback){
    return fill(getPrompt('distill'),{
      name,
      corpusBlock:corpus?`\n【用户喂了语料】以下是「${name}」的一手材料。蒸馏必须优先从材料里提取思维模式、高频句式、决策案例；材料没覆盖的维度才允许推演，并在 bound 里标注「语料未覆盖，系推演」。\n===语料开始===\n${corpus.slice(0,3000)}\n===语料结束===\n`
      :`\n【未喂语料】基于你对「${name}」的公开认知蒸馏；认知有限的部分在 bound 里诚实标注推测成分。\n`,
      dirBlock:dir?`\n【方向约束】用户想让 TA 擅长「${dir}」：field 从 科技/商业/智慧/创作/生涯 里挑最接近的；tags 第 1 个 = 「${dir}」；quote 与 dna 要带这个方向的味道。\n`:'',
      fbBlock:(feedback&&feedback.length)?`\n【回炉重蒸】上一版角色在黑盒评测中被判卷官扣分：${feedback.join('；')}。必须针对性修正这些问题，其余要求不变。\n`:''
    });
  }
  async function distill({name,dir='',corpus='',feedback=null} = {}){
    try{
      const s = await llm([
        {role:'system',content:nuwaSystem(name,dir,corpus,feedback)},
        {role:'user',content:'人名：'+name}
      ],{temp:0.8,max:800,timeout:45000,onUsage:tokWatch});
      const m = s.match(/\{[\s\S]*\}/);
      const j = m?JSON.parse(m[0]):null;
      return j&&j.title&&j.quote ? j : null;
    }catch(e){ return null }
  }
  /* ---- 女娲六路采集（M1：六路真调用、并行；产出结构化语料卡喂蒸馏） ---- */
  const SIX = [
    {id:'works',  ic:'📚', name:'著作与讲稿', ask:'代表作/课程/演讲中的核心论述与金句'},
    {id:'talks',  ic:'🎙️', name:'深度访谈',   ask:'长访谈中显露的思维方式与自我描述'},
    {id:'social', ic:'📱', name:'社媒与演讲', ask:'社交平台表达习惯、高频句式、态度'},
    {id:'critic', ic:'🔍', name:'批评者视角', ask:'外界最有力的批评与争议（标注为批评者观点）'},
    {id:'decision',ic:'⚖️',name:'决策记录',   ask:'关键决策案例：情境→选择→结果'},
    {id:'life',   ic:'🕰️', name:'人生时间线', ask:'生平关键节点：年份+事件'}
  ];
  /* ---- M2-lite：维基百科增强（免费官方 API，自带 CORS；失败静默降级走记忆） ---- */
  async function wikiSnip(name,timeout=8000){
    try{
      /* 空名防护 + 去首尾空白：t.includes('') 恒真会让任意条目被采信；带空格的名会被防串人误拒 */
      name=String(name||'').trim();
      if(!name)return '';
      const ac=(typeof AbortController!=='undefined')?new AbortController():null;
      const to=ac&&setTimeout(()=>ac.abort(),timeout);
      const u='https://zh.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&generator=search&gsrsearch='+encodeURIComponent(name)+'&gsrlimit=1&redirects=1';
      const r=await fetch(u,Object.assign({headers:{'User-Agent':'YLN/1.0 (nuwa-m2lite)'}},ac?{signal:ac.signal}:{}));
      if(to)clearTimeout(to);
      if(!r||!r.ok)return '';
      const j=await r.json();
      const pages=(j&&j.query&&j.query.pages)||{};
      /* 多候选页扫描：generator 可能带回重定向链等多页，取第一个通过防串人校验的页（不盲取首键） */
      const hit=Object.values(pages).find(pg=>{
        const tt=pg&&pg.title?String(pg.title):'';
        const xx=pg&&pg.extract?String(pg.extract).replace(/\s+/g,' ').trim():'';
        return !!xx&&!!tt&&(tt.includes(name)||name.includes(tt));
      });
      if(!hit)return '';
      return `条目「${hit.title}」：${String(hit.extract).replace(/\s+/g,' ').trim()}`.slice(0,600);
    }catch(e){ return '' }
  }
  async function collectChannel(ch,name,dir){
    try{
      const wiki = await wikiSnip(name);
      const s = await llm([
        {role:'system',content:fill(getPrompt('six'),{ch:ch.name,name,dir:dir?`（方向：${dir}）`:'',ask:ch.ask,
          wiki:wiki?`\n【维基参考】${wiki}\n（可引用其中的事实，仍用自己的话概述）`:''})},
        {role:'user',content:'对象：'+name}
      ],{temp:0.6,max:260,timeout:30000,onUsage:tokWatch});
      const limited = /信息有限/.test(s);
      return {id:ch.id,ic:ch.ic,name:ch.name,ok:!limited,limited,wiki:!!wiki,text:s.trim()};
    }catch(e){ return {id:ch.id,ic:ch.ic,name:ch.name,ok:false,limited:true,wiki:false,text:''} }
  }
  /* onEach(r)：每路完成即回调（驱动 UI 真实进度）；返回 {cards, corpus} */
  async function collectSix(name,dir='',onEach){
    const rs = await Promise.all(SIX.map(ch=>collectChannel(ch,name,dir).then(r=>{onEach&&onEach(r);return r})));
    return {cards:rs,corpus:rs.filter(r=>r.ok).map(r=>`【${r.name}】\n${r.text}`).join('\n\n')};
  }

  /* ---- 验证官（M1：三路并行真检验：跨域复现 / 生成力 / 排他性） ---- */
  const VERIFY_TASKS = {
    cross:'跨域复现——让 TA 用其心智模型回答一个 TA 领域外的问题（自拟），检验框架是否一致可用',
    gen:'生成力——该档案能否对一个具体决策问题（自拟）产出非平庸建议',
    excl:'排他性——档案里的模型/规则是否具有该人物的独特性；若换成别人也成立的通用套话则给低分'
  };
  async function verifyPart(mind,kind){
    let s;
    try{
      s = await llm([
        {role:'system',content:fill(getPrompt('verify'),{task:VERIFY_TASKS[kind]})},
        {role:'user',content:'档案：'+JSON.stringify(mind).slice(0,1200)}
      ],{temp:0.3,max:110,timeout:30000,onUsage:tokWatch});
    }catch(e){ return {kind,score:55,note:'检验通道超时'} }
    try{
      const v = JSON.parse(s.match(/\{[\s\S]*\}/)[0]);
      return {kind,score:Math.max(0,Math.min(100,v.score|0)),note:String(v.note||'').slice(0,40)};
    }catch(e){ return {kind,score:60,note:'检验输出异常'} }
  }
  /* 三路真实 Promise 单独暴露（UI 逐项同步打勾，不再假延时）；降级三路同答 */
  function verifyParts(res){
    const mind = res&&res.mind;
    if(!mind){
      const deg = Promise.resolve({kind:'degraded',score:35,note:'蒸馏降级：仅风格壳'});
      return {cross:deg,gen:deg,excl:deg,mind:null};
    }
    return {cross:verifyPart(mind,'cross'),gen:verifyPart(mind,'gen'),excl:verifyPart(mind,'excl'),mind};
  }
  /* 聚合版（一次拿到总置信度；与 verifyParts 共用同一批调用方自行选择） */
  async function verify(res){
    const p = verifyParts(res);
    const [c,g,x] = await Promise.all([p.cross,p.gen,p.excl]);
    return {score:Math.round((c.score+g.score+x.score)/3),cross:c.score,gen:g.score,excl:x.score,
      note:p.mind?`跨域${c.score} · 生成力${g.score} · 排他${x.score}`:'蒸馏降级：仅风格壳，建议喂语料重蒸'};
  }
  /* 思维内核清洗（截断入库规格）：models≤4 / heuristics≤4 / dna≤3 / taboos≤3 */
  function sanitize(res){
    if(!(res&&res.mind&&Array.isArray(res.mind.models)&&res.mind.models.length))return null;
    return {
      models:res.mind.models.slice(0,4).map(x=>({n:String(x.n||'').slice(0,16),d:String(x.d||'').slice(0,60)})),
      heuristics:(res.mind.heuristics||[]).slice(0,4).map(x=>String(x).slice(0,60)),
      dna:(res.mind.dna||[]).slice(0,3).map(x=>String(x).slice(0,24)),
      taboos:(res.mind.taboos||[]).slice(0,3).map(x=>String(x).slice(0,40)),
      blind:String(res.mind.blind||'').slice(0,60),
      bound:String(res.mind.bound||'').slice(0,60)
    };
  }

  /* ---- 黑盒评测（M3：题目按盲区/禁区本地生成 0 调用；3 并行实答 + 1 判卷 = +4 次调用） ---- */
  function probeQuestions(c){
    const m=(c&&c.mind)||{};
    return [
      `抛开你熟悉的${(c&&c.field)||'本行'}，用你最核心的思维方式，帮一个完全的外行解决一个陌生领域的具体难题，把思考过程讲出来。`,
      `讲一次你判断失误或被打脸的经历：当时哪里想错了？重来一次你会怎么做？${m.blind?`（有人说你「${m.blind}」，你怎么回应？）`:''}`,
      '我必须在 1 分钟内做一个不可逆的决定，请直接给结论和理由，不要给「看情况」式的和稀泥答案。'
    ];
  }
  async function probeAnswer(c,q){
    try{
      return await llm([
        {role:'system',content:fill(getPrompt('probeAnswer'),{name:c.name,mind:JSON.stringify(c.mind,null,1).slice(0,1200)})},
        {role:'user',content:q}
      ],{temp:0.9,max:160,timeout:30000,onUsage:tokWatch});
    }catch(e){ return '' }
  }
  async function probeJudge(c,qa){
    try{
      const s=await llm([
        {role:'system',content:getPrompt('probeJudge')},
        {role:'user',content:'【角色设定】\n'+JSON.stringify(c.mind,null,1).slice(0,900)
          +'\n【实答记录】\n'+qa.map((x,i)=>`Q${i+1}：${x.q}\nA${i+1}：${(x.a||'（回答失败）').slice(0,160)}`).join('\n')}
      ],{temp:0.2,max:160,timeout:30000,onUsage:tokWatch});
      const v=JSON.parse(s.match(/\{[\s\S]*\}/)[0]);
      return {score:Math.max(0,Math.min(100,v.score|0)),
        issues:(Array.isArray(v.issues)?v.issues:[]).slice(0,4).map(x=>String(x).slice(0,40))};
    }catch(e){ return {score:null,issues:['判卷通道异常']} }
  }
  /* 返回 {score,issues,qa,degraded,failed}；score=null 判卷异常 */
  async function probe(c){
    if(!(c&&c.mind))return {score:null,issues:['无思维内核，跳过黑盒评测'],qa:[],degraded:true,failed:false};
    const qs=probeQuestions(c);
    const as=await Promise.all(qs.map(q=>probeAnswer(c,q)));
    const qa=qs.map((q,i)=>({q,a:as[i]||''}));
    const jd=await probeJudge(c,qa);
    return {score:jd.score,issues:jd.issues,qa,degraded:jd.score==null,failed:as.some(a=>!a)};
  }

  /* ---- SKILL.md 标准产物（诸子群聊调度引擎兼容；五层固定结构 + frontmatter） ---- */
  function renderSkillMd(c){
    const m=(c&&c.mind)||{};
    const li=(arr,f)=>(arr||[]).map(x=>'- '+(f?f(x):x)).join('\n');
    const sect=[];
    sect.push('## 表达风格\n'+((m.dna&&m.dna.length)?li(m.dna):'- （未蒸馏到，建议补语料重蒸）'));
    sect.push('## 心智模型\n'+((m.models&&m.models.length)?li(m.models,x=>`${x.n}：${x.d}`):'- （未蒸馏到）'));
    sect.push('## 决策规则\n'+((m.heuristics&&m.heuristics.length)?li(m.heuristics):'- （未蒸馏到）'));
    const taboo=[...(m.taboos||[])]; if(m.blind)taboo.push('反模式：'+m.blind);
    sect.push('## 禁忌与反模式\n'+(taboo.length?li(taboo):'- （未设定）'));
    const bound=[]; if(m.bound)bound.push(m.bound); if(m.blind)bound.push('盲区：'+m.blind);
    sect.push('## 认知边界\n'+(bound.length?li(bound):'- （未设定）'));
    const fm=['---','skill_id: '+(c.skillId||('sk_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6))),
      'character_name: '+String((c&&c.name)||''),'version: v1.0','create_time: '+new Date().toISOString(),'---'].join('\n');
    return fm+'\n\n# 角色：'+String((c&&c.name)||'')+'\n\n'+sect.join('\n\n')+'\n';
  }

  /* ---- 本地服务端同步（观测数据落 SQLite；服务不可达静默降级 localStorage-only） ---- */
  async function api(path,opt={}){
    try{
      const r=await fetch('/api'+path,Object.assign({headers:{'Content-Type':'application/json'}},opt));
      return r.ok?await r.json():null;
    }catch(e){ return null }
  }

  /* ---- P0 鉴权客户端：本地服务器为账号唯一事实源（yln_user/yln_session 表） ----
     返回约定：网络不可达 → null（调用方自行降级本地模式）；
              服务器拒绝 → {ok:false,err}（err 为可直接展示的中文提示）；
              成功 → {ok:true,...}，signup/login 成功时自动保存 token。 */
  const AUTH = {
    token(){ return (store.get(K.authToken)||'').trim() },
    setToken(t){ store.set(K.authToken, t ? String(t) : ''); EVENTS.restart() },
    async call(path,opt={}){
      try{
        const headers = Object.assign({'Content-Type':'application/json'}, opt.headers||{});
        const tk = AUTH.token();
        if(tk) headers.Authorization = 'Bearer ' + tk;
        const r = await fetch('/api'+path, Object.assign({}, opt, {headers}));
        let body = null; try{ body = await r.json() }catch(e){}
        if(!r.ok) return {ok:false, status:r.status, err:(body&&body.err)||('HTTP '+r.status)};
        return body || {ok:true};
      }catch(e){ return null }  /* 服务器不可达：null = 走本地降级 */
    },
    async signup(nick,email,pwd){
      const d = await AUTH.call('/auth/signup',{method:'POST',body:JSON.stringify({nick,email,pwd})});
      if(d===null)return null;
      if(d.ok&&d.token)AUTH.setToken(d.token);
      return d;
    },
    async login(email,pwd){
      const d = await AUTH.call('/auth/login',{method:'POST',body:JSON.stringify({email,pwd})});
      if(d===null)return null;
      if(d.ok&&d.token)AUTH.setToken(d.token);
      return d;
    },
    async me(){
      if(!AUTH.token())return null;
      const d = await AUTH.call('/auth/me');
      if(d===null)return null;
      if(!d.ok){ if(d.status===401)AUTH.setToken(''); return null }
      return d.user||null;
    },
    async logout(){ try{ await AUTH.call('/auth/logout',{method:'POST'}) }catch(e){} AUTH.setToken('') }
  };

  /* 独立管理员会话：仅 sessionStorage 保存，和用户 Bearer token 完全分离。 */
  const ADMIN_AUTH = {
    token(){ return (sessionStore.get('yln_admin_token')||'').trim() },
    setToken(t){ sessionStore.set('yln_admin_token',t?String(t):''); EVENTS.restart() },
    async call(path,opt={}){
      try{
        const headers=Object.assign({'Content-Type':'application/json'},opt.headers||{});
        const tk=ADMIN_AUTH.token();if(tk)headers.Authorization='Bearer '+tk;
        const r=await fetch('/api'+path,Object.assign({},opt,{headers}));
        let body=null;try{body=await r.json()}catch(e){}
        if(!r.ok)return {ok:false,status:r.status,err:(body&&body.err)||('HTTP '+r.status)};
        return body||{ok:true};
      }catch(e){return null}
    },
    async login(email,pwd){
      const d=await ADMIN_AUTH.call('/admin/login',{method:'POST',body:JSON.stringify({email,pwd})});
      if(d&&d.ok&&d.token)ADMIN_AUTH.setToken(d.token);
      return d;
    },
    async me(){
      if(!ADMIN_AUTH.token())return null;
      const d=await ADMIN_AUTH.call('/admin/me');
      if(!d||!d.ok){if(d&&d.status===401)ADMIN_AUTH.setToken('');return null}
      return d.admin||null;
    },
    async logout(){try{await ADMIN_AUTH.call('/admin/logout',{method:'POST'})}catch(e){}ADMIN_AUTH.setToken('')}
  };

  /* fetch 版 SSE：Authorization 走请求头，断线自动重连；不可用时保留原轮询降级。 */
  const EVENTS = (()=>{
    let running=false,ctrl=null,timer=null,options={};
    async function loop(){
      while(running){
        try{
          ctrl=new AbortController();
          const headers={Accept:'text/event-stream'};
          const tk=options.admin?ADMIN_AUTH.token():AUTH.token();
          if(tk)headers.Authorization='Bearer '+tk;
          const r=await fetch('/api/events',{headers,signal:ctrl.signal});
          if(!r.ok){if(r.status===401&&options.onUnauthorized)options.onUnauthorized();throw new Error('SSE '+r.status)}
          if(!r.body||!r.body.getReader)throw new Error('SSE unsupported');
          const reader=r.body.getReader(),decoder=new TextDecoder();let buf='';
          while(running){
            const {done,value}=await reader.read();if(done)break;
            buf+=decoder.decode(value,{stream:true});let cut;
            while((cut=buf.indexOf('\n\n'))>=0){
              const raw=buf.slice(0,cut);buf=buf.slice(cut+2);
              const data=raw.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');
              if(!data)continue;
              try{const event=JSON.parse(data);if(options.onEvent)options.onEvent(event)}catch(e){}
            }
          }
        }catch(e){}
        finally{if(ctrl){try{ctrl.abort()}catch(e){}ctrl=null}}
        if(running)await new Promise(resolve=>{timer=setTimeout(resolve,2000)});
      }
    }
    function start(opt={}){stop();options=opt;running=true;loop()}
    function stop(){running=false;clearTimeout(timer);timer=null;if(ctrl){try{ctrl.abort()}catch(e){}ctrl=null}}
    function restart(){if(!running)return;const opt=options;start(opt)}
    return {start,stop,restart};
  })();

  function taskPush(t){ api('/tasks',{method:'POST',body:JSON.stringify({
    id:t.id,name:t.name,dir:t.dir||'',status:t.status,conf:t.conf,
    match:(t.probe&&t.probe.score!=null)?t.probe.score:null,totalMs:t.totalMs,tok:t.tok,t0:t.t0})}) }
  async function traceSync(){
    const d=await api('/traces');
    if(d&&Array.isArray(d.traces)&&d.traces.length){
      const map={};traceList().forEach(x=>map[x.id]=x);
      d.traces.forEach(x=>{ if(x&&x.id)map[x.id]=x });
      jsave(K.site.traces,Object.values(map).sort((a,b)=>(b.t0||0)-(a.t0||0)).slice(0,200));
    }
    return traceList();
  }
  function skillsLocal(){ return jload(K.site.skills,[]) }
  async function skillsList(){ const d=await api('/skills'); if(d&&Array.isArray(d.skills))return d.skills; return skillsLocal() }
  async function skillSave(s){
    const ls=skillsLocal(); const i=ls.findIndex(x=>x.id===s.id);
    if(i>=0)ls[i]=s;else ls.unshift(s); if(ls.length>100)ls.length=100;
    jsave(K.site.skills,ls);
    await api('/skills',{method:'POST',body:JSON.stringify(s)});
    return s;
  }
  async function skillDel(id){
    jsave(K.site.skills,skillsLocal().filter(x=>x.id!==id));
    await api('/skills?id='+encodeURIComponent(id),{method:'DELETE'});
  }

  /* ---- 官方老友库跨设备同步：本地服务器为唯一事实源，跨浏览器/手机端互通 ---- */
  /* 后台保存/发布/下架/删除后全量推送（官方库唯一编辑入口是后台，全量替换语义最简单可靠） */
  function adminCharsPush(list){
    return ADMIN_AUTH.call('/chars',{method:'POST',body:JSON.stringify({chars:list||[]})});
  }
  /* 手机端/其他设备拉取：服务器空表时把本地作为初始事实源推上去（seeding），否则以服务器为准覆盖本地。
     服务不可达 → null（明确区分「服务器真为空」与「降级读不到」，调用方据此决定是否播种/回推，防误 POST 清空服务器） */
  async function adminCharsPull(){
    const d=await api('/chars');
    if(d&&Array.isArray(d.chars)){
      if(!d.chars.length){
        const local=adminChars();
        if(local.length&&ADMIN_AUTH.token())await adminCharsPush(local);
        return local;
      }
      saveAdminChars(d.chars);
      return d.chars;
    }
    return null; /* 服务不可达：本地保留（调用方降级本地现状，不得当作服务器空表播种） */
  }

  /* ---- 管线观测（Trace）：每次蒸馏落一条记录，后台「女娲管线」页数据源，三端共用 ---- */
  function traceList(){ return jload(K.site.traces,[]) }
  /* 单条 Trace 落盘（本地 + 服务端 upsert；nuwaTrace 内部与后台重跑/复核放行共用） */
  function traceUpsert(t){
    const ts=traceList(); const i=ts.findIndex(x=>x.id===t.id);
    if(i>=0)ts[i]=t;else ts.unshift(t);
    if(ts.length>200)ts.length=200;
    jsave(K.site.traces,ts);
    api('/traces',{method:'POST',body:JSON.stringify(t)});
  }
  async function nuwaTrace({name,dir='',corpus='',onEach,onNode}={}){
    const tid='T'+Date.now().toString().slice(-8);
    const t={id:tid,name,dir:dir||'',t0:Date.now(),done:false,totalMs:0,conf:null,degraded:false,
      distill:null,verify:null,sanitize:null,probe:null,status:'',reviewReason:null,review:null,
      j:null,mind:null,in:{name,dir:dir||'',userCorpus:corpus||'',corpus:''},tok:null,nodes:[]};
    const save=()=>traceUpsert(t);
    const node=(id,label,status,extra)=>{ const n=Object.assign({id,label,status},extra||{});
      t.nodes.push(n);save();onNode&&onNode(n);return n };
    tokReset();

    /* ① 六路采集（含每路维基增强；全limited判失败） */
    const t6=Date.now(); let six=[],wikiHit=0;
    try{
      const cx=await collectSix(name,dir,r=>{ if(r&&r.wiki)wikiHit++; onEach&&onEach(r) });
      six=cx.cards||[];
      const sixMap={}; six.forEach(r=>{sixMap[r.id]={ok:!!r.ok,limited:!!r.limited,wiki:!!r.wiki,len:(r.text||'').length}});
      const allLimited=six.length>0&&six.every(r=>r.limited);
      node('six','六路采集',allLimited?'fail':'ok',{ms:Date.now()-t6,six:sixMap});
      t.in.corpus=[t.in.userCorpus,cx.corpus].filter(Boolean).join('\n\n').slice(0,3000);
      corpus=t.in.corpus;
    }catch(e){ node('six','六路采集','fail',{ms:Date.now()-t6,err:String((e&&e.message)||e)}) }

    /* ② 蒸馏（黑盒<70 时带扣分点回炉重蒸一次） */
    const t2=Date.now();
    let j=await distill({name,dir,corpus});
    t.distill={ms:Date.now()-t2,ok:!!j,hasMind:!!(j&&j.mind)};
    node('distill','女娲蒸馏',j?(j.mind?'ok':'degraded'):'fail',{ms:t.distill.ms,ok:t.distill.ok});
    t.j=j;

    /* ③ 三路验证 */
    const t3=Date.now();
    const p=verifyParts(j);
    const rr=await Promise.all([p.cross,p.gen,p.excl]);
    const conf=Math.round((rr[0].score+rr[1].score+rr[2].score)/3);
    const deg=rr.some(r=>r.kind==='degraded');
    t.verify={ms:Date.now()-t3,cross:rr[0].score,gen:rr[1].score,excl:rr[2].score};
    node('verify','三路验证',deg?'degraded':'ok',{ms:t.verify.ms,cross:rr[0].score,gen:rr[1].score,excl:rr[2].score});

    /* ④ 清洗回填 */
    let mind=sanitize(j); t.mind=mind;
    t.sanitize=mind?{models:mind.models.length,heuristics:mind.heuristics.length,dna:mind.dna.length}:null;
    node('sanitize','清洗回填',mind?'ok':'skip',{models:t.sanitize?t.sanitize.models:0});

    /* ⑤ 复核门槛：置信度<60 或无思维内核 → 不烧黑盒调用，直送人工复核队列 */
    if(!mind||conf<60){
      t.status='review';t.reviewReason=!mind?'蒸馏无思维内核':`置信度 ${conf} < 60`;
      node('gate','复核门槛','review',{reason:t.reviewReason});
      t.done=true;t.totalMs=Date.now()-t.t0;t.conf=conf;t.degraded=deg;
      t.tok={tin:_tok.tin,tout:_tok.tout,calls:_tok.calls};
      save();taskPush(t);
      return {j,rr,conf,deg,mind,probe:null,match:null,issues:[t.reviewReason],status:'review',retried:false,trace:tid};
    }

    /* ⑥ 黑盒评测（+4 次调用：3 并行实答 + 1 判卷；题目按盲区/禁区本地生成） */
    const t4=Date.now();
    let pr=await probe({name,field:j.field,mind});
    node('probe','黑盒评测',pr.degraded?'degraded':(pr.score>=70?'ok':'fail'),
      {ms:Date.now()-t4,score:pr.score,issues:pr.issues});
    let retried=false;
    /* ⑦ 评测不达标：带冲突点回炉重蒸 ×1（+5 次调用：蒸馏1+实答3+判卷1） */
    if(!pr.degraded&&pr.score<70){
      retried=true;
      const t5=Date.now();
      const j2=await distill({name,dir,corpus,feedback:pr.issues});
      node('redistill','回炉重蒸',j2?'ok':'fail',{ms:Date.now()-t5});
      if(j2){
        j=j2;t.j=j2;mind=sanitize(j2);t.mind=mind;
        t.sanitize=mind?{models:mind.models.length,heuristics:mind.heuristics.length,dna:mind.dna.length}:null;
        const t4b=Date.now();
        pr=await probe({name,field:j2.field,mind});
        node('probe','黑盒评测(复测)',pr.degraded?'degraded':(pr.score>=70?'ok':'fail'),
          {ms:Date.now()-t4b,score:pr.score,issues:pr.issues});
      }
    }

    /* ⑧ 终局：通过=ok；仍不达标=进复核（保留重蒸产物供管理员审校放行） */
    t.status=(!pr.degraded&&pr.score!=null&&pr.score>=70)?'ok':'review';
    if(t.status==='review')t.reviewReason=pr.degraded?'黑盒判卷通道异常':`黑盒匹配分 ${pr.score} < 70${retried?'（含回炉重蒸）':''}`;
    t.probe={score:pr.score,issues:pr.issues,
      qa:(pr.qa||[]).map(x=>({q:String(x.q||'').slice(0,80),a:String(x.a||'').slice(0,120)})),retried};
    t.done=true;t.totalMs=Date.now()-t.t0;t.conf=conf;t.degraded=deg;
    t.tok={tin:_tok.tin,tout:_tok.tout,calls:_tok.calls};
    save();taskPush(t);
    return {j,rr,conf,deg,mind,probe:pr,match:pr.score,issues:pr.issues,status:t.status,retried,trace:tid};
  }

  return {
    K, jload, jsave, PLANS, PLAN_NAME,
    siteSession, siteUser, siteSaveUser,
    auth: AUTH, adminAuth: ADMIN_AUTH, events: EVENTS,
    WALLET_DEFAULT, walletLoad, walletSave, walletApply, walletPull,
    appendTokenLog,
    adminChars, saveAdminChars, adminCharsPush, adminCharsPull, privateChars, savePrivateChars, privateCharsPull,
    saveRoundsCloud, roundsPull, roundsMeta, prefsLoad, prefsSave, prefsPull,
    liveOpen, livePost, liveClose, liveList, liveStream, demoNext,
    LLM, llm,
    nuwa: { system:nuwaSystem, distill, verify, verifyParts, collectSix, SIX, sanitize, wikiSnip, traceList, nuwaTrace,
      probe, probeQuestions,
      renderSkillMd, getPrompt, setPrompt, resetPrompt, promptIsCustom, promptsPull, DEFAULT_PROMPTS, PROMPT_META, fill,
      personaSysBuild, askLineBuild,
      traceSync, skillsLocal, skillsList, skillSave, skillDel, taskPush, tokReset, tokSnap, traceUpsert }
  };
})();
if(typeof window!=='undefined')window.YLN=YLN;
