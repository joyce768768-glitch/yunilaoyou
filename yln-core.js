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
    adminChars: 'yln_admin_chars',         /* 官方老友（后台发布） */
    adminCharsSeeded: 'yln_admin_chars_seeded',
    adminSeeded: 'yln_admin_seeded',
    wallet: 'yln_wallet',                  /* 用户资产：积分/老友券/会员 */
    rounds: 'yln_rounds',                  /* 圆桌会话存档 */
    site: {
      users: 'yln_site_users',             /* 官网注册用户 */
      session: 'yln_site_session',         /* 官网登录态 */
      orders: 'yln_site_orders',           /* 官网订单 */
      tokens: 'yln_token_logs'             /* Token 消耗流水（三端共享） */
    }
  };

  /* ---- 存储读写：localStorage 不可用时降级内存（node 可测） ---- */
  const _mem = {};
  const store = {
    get(k){ try{ if(typeof localStorage==='undefined')return _mem[k]??null; return localStorage.getItem(k) }catch(e){ return _mem[k]??null } },
    set(k,v){ try{ if(typeof localStorage==='undefined'){ _mem[k]=v; return } localStorage.setItem(k,v) }catch(e){ _mem[k]=v } }
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

  /* ---- 钱包（用户资产唯一逻辑，登录态写穿官网账号） ---- */
  const WALLET_DEFAULT = () => ({plan:'free',points:0,coupons:5,freeSpeaks:3,freeDesk:1,
    ledger:[{t:Date.now(),n:'新人礼包 · 老友券 ×5 + 免费插话 ×3 + 免费建桌 ×1',d:0}]});
  function walletLoad(){
    const w = jload(K.wallet,null);
    return (w && typeof w.points==='number' && w.ledger) ? w : null;
  }
  function walletSave(w){
    jsave(K.wallet,w);
    const su = siteUser();               /* 写穿：后台实时可见 */
    if(su){
      su.points=w.points; su.coupons=w.coupons; su.plan=w.plan;
      if(su.plan!=='free')su.planUntil=su.planUntil||Date.now()+30*864e5;
      siteSaveUser(su);
    }
  }
  /* 纯状态记账：增减积分并写流水（UI 渲染由各端自己做） */
  function walletApply(w,n,label){
    w.points+=n;
    w.ledger.unshift({t:Date.now(),n:label,d:n});
    if(w.ledger.length>40)w.ledger.length=40;
    walletSave(w);
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
  const savePrivateChars = obj => jsave(K.chars,obj);

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
        body:JSON.stringify({model:LLM.model,messages,temperature:opt.temp??1.0,max_tokens:opt.max??160,stream:false})
      });
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d = await r.json();
      if(d.usage&&opt.onUsage)opt.onUsage({tin:d.usage.prompt_tokens||0,tout:d.usage.completion_tokens||0});
      return (d.choices?.[0]?.message?.content||'').trim();
    } finally { if(to)clearTimeout(to) }
  }

  /* ---- 女娲管线 v2（唯一 prompt：两端共用，改这里=改两端） ---- */
  function nuwaSystem(name,dir,corpus){
    return `你是女娲造人引擎 v2，对齐真女娲管线（心智模型/决策启发式/表达DNA/诚实边界）。`+
      (corpus?`\n【用户喂了语料】以下是「${name}」的一手材料。蒸馏必须优先从材料里提取思维模式、高频句式、决策案例；材料没覆盖的维度才允许推演，并在 bound 里标注「语料未覆盖，系推演」。\n===语料开始===\n${corpus.slice(0,3000)}\n===语料结束===\n`
      :`\n【未喂语料】基于你对「${name}」的公开认知蒸馏；认知有限的部分在 bound 里诚实标注推测成分。\n`)+
      (dir?`\n【方向约束】用户想让 TA 擅长「${dir}」：field 从 科技/商业/智慧/创作/生涯 里挑最接近的；tags 第 1 个 = 「${dir}」；quote 与 dna 要带这个方向的味道。\n`:'')+
      `\n输出 JSON（只输出 JSON）：\n{"title":"身份一句话,12字内","field":"科技/商业/智慧/创作/生涯 之一","tags":["3个,每个≤6字"],"quote":"TA 口吻金句,25字内,第一人称","mind":{"models":[{"n":"心智模型名","d":"一句话:TA 怎么用它看问题"}],"heuristics":["场景→TA 的决策规则"],"dna":["表达特征1","表达特征2","表达特征3"],"blind":"TA 的盲区/反模式一句话","bound":"诚实边界:哪些是推演/语料未覆盖"}}\n要求：models 2-3 个必须真的能当镜片用（拿来分析新问题，不是语录）；heuristics 2-3 条必须可执行；dna 是可辨识的语言指纹（句式/口头禅/节奏）。`;
  }
  async function distill({name,dir='',corpus=''} = {}){
    try{
      const s = await llm([
        {role:'system',content:nuwaSystem(name,dir,corpus)},
        {role:'user',content:'人名：'+name}
      ],{temp:0.8,max:700,timeout:45000});
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
        {role:'system',content:`你是女娲六路采集器的「${ch.name}」通道。对象：${name}${dir?`（方向：${dir}）`:''}。任务：用你记忆里关于 TA 的真实公开信息，写 2-5 条要点，每条一行、≤30 字。\n要求：\n1. 用自己的话概述，不要逐字引用原文（这是概述任务，不是引用任务）；\n2. 只写你有印象的内容，宁少勿编；把握不足的条目末尾标注「(模糊)」；\n3. 只有当你对 TA 在该通道毫无印象时，才只输出「该通道信息有限」。\n聚焦：${ch.ask}`+(wiki?`\n【维基参考】${wiki}\n（可引用其中的事实，仍用自己的话概述）`:'')},
        {role:'user',content:'对象：'+name}
      ],{temp:0.6,max:260,timeout:30000});
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
        {role:'system',content:`你是女娲验证官。执行「${VERIFY_TASKS[kind]}」检验，输出 JSON：{"score":0-100,"note":"一句话结论"}。只输出 JSON。`},
        {role:'user',content:'档案：'+JSON.stringify(mind).slice(0,1200)}
      ],{temp:0.3,max:110,timeout:30000});
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
  /* 思维内核清洗（截断入库规格）：models≤4 / heuristics≤4 / dna≤3 */
  function sanitize(res){
    if(!(res&&res.mind&&Array.isArray(res.mind.models)&&res.mind.models.length))return null;
    return {
      models:res.mind.models.slice(0,4).map(x=>({n:String(x.n||'').slice(0,16),d:String(x.d||'').slice(0,60)})),
      heuristics:(res.mind.heuristics||[]).slice(0,4).map(x=>String(x).slice(0,60)),
      dna:(res.mind.dna||[]).slice(0,3).map(x=>String(x).slice(0,24)),
      blind:String(res.mind.blind||'').slice(0,60),
      bound:String(res.mind.bound||'').slice(0,60)
    };
  }

  return {
    K, jload, jsave, PLANS, PLAN_NAME,
    siteSession, siteUser, siteSaveUser,
    WALLET_DEFAULT, walletLoad, walletSave, walletApply,
    appendTokenLog,
    adminChars, saveAdminChars, privateChars, savePrivateChars,
    LLM, llm,
    nuwa: { system:nuwaSystem, distill, verify, verifyParts, collectSix, SIX, sanitize, wikiSnip }
  };
})();
if(typeof window!=='undefined')window.YLN=YLN;
