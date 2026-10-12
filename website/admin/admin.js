/* ============================================================
   与你老友 · 管理后台逻辑
   数据层：直读官网 localStorage（yln_site_users / yln_site_orders），
   种子数据补齐演示用户 / 订单 / token 流水。未来接后端只换本层。
   ============================================================ */
const K={users:'yln_site_users',orders:'yln_site_orders',tokens:'yln_token_logs',seeded:'yln_admin_seeded',chars:'yln_admin_chars',charsSeeded:'yln_admin_chars_seeded'};
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

/* ---- 模型价目（¥ / 1M tokens，演示价） ---- */
const MODELS=[
  {id:'deepseek-v3',name:'DeepSeek V3',pin:2,pout:8},
  {id:'kimi-k2',name:'Kimi K2',pin:4,pout:16},
  {id:'glm-4-air',name:'GLM-4 Air',pin:1,pout:4},
];
const modelOf=id=>MODELS.find(m=>m.id===id)||MODELS[0];
/* 积分定价：标准月卡 ¥89 = 2000 积分 → 1 积分 ≈ ¥0.0445 */
const PTS_VALUE=89/2000;
/* 全端统一档位名（唯一实现在 yln-core.js） */
const PLAN_NAME=YLN.PLAN_NAME;

/* ---- 确定性伪随机（种子固定，刷新不变） ---- */
let _s=20260101;
const rnd=()=>((_s=(_s*1103515245+12345)>>>0)/4294967296);
const ri=(a,b)=>Math.floor(rnd()*(b-a+1))+a;
const pick=a=>a[Math.floor(rnd()*a.length)];

/* ---- 种子数据 ---- */
const SEED_USERS=[
  ['林晚照','wan.zhao@example.com','max'],['陈默','chenmo@example.com','plus'],
  ['苏黎','suli@example.com','plus'],['陆知远','zhiyuan@example.com','free'],
  ['顾星河','xinghe@example.com','lite'],['白鹿','bailu@example.com','trial'],
  ['江眠','jiangmian@example.com','free'],['沈亦舟','yizhou@example.com','plus'],
  ['温叙','wenxu@example.com','free'],['贺兰舟','helan@example.com','max'],
];
const TOPICS=['该不该裸辞创业？','要不要接受北京 offer？','产品该不该涨价？','30 岁转行还来得及吗','该买房还是继续租房','创业合伙人不合适怎么退','要不要给孩子报奥数班','副业该选内容还是电商'];
const NICKS=SEED_USERS.map(u=>u[0]);
/* 官方老友种子：发布后手机端老友库可见 */
const SEED_CHARS=[
  {id:'adm_se01',name:'彼得·德鲁克',short:'德鲁克',title:'现代管理学之父',emoji:'📐',c1:'#B8C9F5',c2:'#5B7BD5',tint:'#EAF0FB',deep:'#3D5EA8',field:'智慧',quote:'管理是把事情做对，领导是做对的事情。',tags:['官方精选','目标管理'],published:true,created:Date.now()-40*864e5},
  {id:'adm_se02',name:'可可·香奈儿',short:'香奈儿',title:'时尚界的革命者',emoji:'🖤',c1:'#E8E0F0',c2:'#9C8AB8',tint:'#F3EFF8',deep:'#6B5A8C',field:'创作',quote:'时尚易逝，风格永存。',tags:['官方精选','审美'],published:true,created:Date.now()-12*864e5},
  {id:'adm_se03',name:'卡尔·荣格',short:'荣格',title:'分析心理学创始人',emoji:'🌀',c1:'#C4E5D8',c2:'#5FA98C',tint:'#EBF6F1',deep:'#2F7A5F',field:'情感',quote:'向外看的人做着梦，向内看的人保持清醒。',tags:['官方精选','潜意识'],published:false,created:Date.now()-2*864e5},
];

function seed(){
  /* 官方老友补种：独立标记（老用户存档已有 users/orders 种子标记，也要能种上老友） */
  if(!load(K.charsSeeded,false)){
    const chars0=load(K.chars,[]);
    SEED_CHARS.forEach(c=>{if(!chars0.some(x=>x.id===c.id))chars0.push(c)});
    save(K.chars,chars0);save(K.charsSeeded,true);
  }
  if(load(K.seeded,false))return;
  /* 演示用户 */
  const users=load(K.users,[]);
  const now=Date.now(),D=864e5;
  SEED_USERS.forEach((u,i)=>{
    if(users.some(x=>x.email===u[1]))return;
    const p=u[2];
    const couponBase={trial:0,lite:2,plus:4,max:8}[p]??0;
    users.push({id:'seed'+i,nick:u[0],email:u[1],ph:'demo',created:now-ri(15,240)*D,
      plan:p,planUntil:p==='free'?null:now+ri(10,300)*D,
      points:p==='free'?ri(0,30):ri(120,2600),coupons:couponBase?ri(Math.max(0,couponBase-2),couponBase+6):ri(0,5)});
  });
  save(K.users,users);
  /* 演示订单（挂在演示用户名下，跨 6 个月，含退款） */
  const orders=load(K.orders,[]);
  const mk=(i,key,plan,amt,m,pts,ago,meth,status)=>orders.push({id:'YLS'+String(1000+i),plan,planKey:key,amount:amt,months:m,pts,
    method:meth,status,time:now-ago*D,nick:users[i%users.length]?.nick||'演示用户',email:users[i%users.length]?.email||'-',demo:true});
  let si=0;
  mk(si++,'plus','标准月卡',89,1,2000,158,'alipay','paid');
  mk(si++,'max','创作月卡',169,1,8000,131,'wechat','paid');
  mk(si++,'lite','轻量月卡',39.9,1,600,122,'alipay','paid');
  mk(si++,'plus','标准月卡',89,1,2000,97,'card','paid');
  mk(si++,'lite','轻量月卡',39.9,1,600,84,'alipay','refund');
  mk(si++,'max','创作月卡',169,1,8000,73,'wechat','paid');
  mk(si++,'trial','体验装',9.9,1,150,66,'alipay','paid');
  mk(si++,'plus','标准月卡',89,1,2000,52,'card','paid');
  mk(si++,'plus','标准月卡',89,1,2000,45,'alipay','paid');
  mk(si++,'trial','体验装',9.9,1,150,33,'wechat','refund');
  mk(si++,'max','创作月卡',169,1,8000,28,'alipay','paid');
  mk(si++,'plus','标准月卡',89,1,2000,21,'alipay','paid');
  mk(si++,'lite','轻量月卡',39.9,1,600,15,'card','paid');
  mk(si++,'plus','标准月卡',89,1,2000,9,'alipay','paid');
  mk(si++,'plus','标准月卡',89,1,2000,5,'wechat','paid');
  mk(si++,'trial','体验装',9.9,1,150,2,'alipay','paid');
  save(K.orders,orders);
  /* token 流水（近 30 天圆桌会话） */
  const logs=[];
  for(let i=0;i<42;i++){
    const mdl=pick(MODELS), roles=ri(2,5), rounds=ri(2,4);
    const tin=roles*rounds*ri(2800,6200), tout=roles*rounds*ri(320,860);
    const cost=+(tin/1e6*mdl.pin+tout/1e6*mdl.pout).toFixed(3);
    logs.push({id:'S'+String(2400+i),topic:pick(TOPICS),nick:pick(NICKS),roles,rounds,model:mdl.id,
      tin,tout,cost,pts:roles*rounds*2,status:rnd()>.12?'done':'closed',time:now-ri(0,29)*D-ri(0,86400)*1000});
  }
  logs.sort((a,b)=>b.time-a.time);
  save(K.tokens,logs);
  save(K.seeded,true);
}
seed();

const users=()=>load(K.users,[]);
const orders=()=>load(K.orders,[]);
const tokens=()=>load(K.tokens,[]);

/* ---- 管理员鉴权（演示级：固定账号 + sessionStorage 会话，关标签页即失效） ---- */
const ADMIN_AUTH={user:'admin',pwd:'admin888'},AUTH_KEY='yln_admin_session';
const isAuthed=()=>{try{return sessionStorage.getItem(AUTH_KEY)==='1'}catch(e){return false}};
function showLogin(){$('login').hidden=false;$('app').hidden=true}
function enterApp(){$('login').hidden=true;$('app').hidden=false;location.hash||='#/dashboard';router()}
function tryLogin(e){
  e.preventDefault();
  const u=$('lg-user').value.trim(),p=$('lg-pwd').value,err=$('lg-err'),card=document.querySelector('.login-card');
  err.classList.remove('on');
  if(u===ADMIN_AUTH.user&&p===ADMIN_AUTH.pwd){
    try{sessionStorage.setItem(AUTH_KEY,'1')}catch(x){}
    enterApp();toast('欢迎回来，管理员 ✦');
  }else{
    err.textContent=!u||!p?'请输入账号与密码':'账号或密码不正确';
    err.classList.add('on');
    if(card){card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake')}
  }
}
function logout(){
  try{sessionStorage.removeItem(AUTH_KEY)}catch(x){}
  showLogin();$('lg-pwd').value='';$('lg-err').classList.remove('on');
  toast('已退出登录');
}

/* ---- 工具 ---- */
const $=id=>document.getElementById(id);
const fmtMoney=n=>'¥'+(Math.abs(n)%1===0?Math.round(n):(+n).toFixed(2));
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n));
const fmtT=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
const fmtDT=t=>{const d=new Date(t),p=n=>String(n).padStart(2,'0');return `${fmtT(t)} ${p(d.getHours())}:${p(d.getMinutes())}`};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let toastT;
function toast(m){let el=document.querySelector('.toast');if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el)}el.textContent=m;el.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('on'),2400)}
const AVA_C=['#6C5CE7','#F25C82','#F0B24C','#2BBE94','#4AA8E8','#C86BFF','#FA7550','#5647D6'];
const ava=(nick,sz)=>`<span class="uava" style="background:${AVA_C[(nick||'').charCodeAt(0)%AVA_C.length]};${sz?`width:${sz}px;height:${sz}px;font-size:${sz*.4}px`:''}">${esc((nick||'友')[0].toUpperCase())}</span>`;
const PAL=['#8478FF','#2BBE94','#FBB03B','#FA7550','#4AA8E8'];

/* ---- SVG 图表 ---- */
function barChart(items,{alt=false,sumLabel=true}={}){
  const max=Math.max(...items.map(x=>x.v),1);
  const total=items.reduce((s,x)=>s+x.v,0);
  return `<div class="bars">${items.map(x=>`
    <div class="bar-g"><div class="col ${x.v?'':alt?'zero':''} ${alt&&x.v?'alt':''}" data-v="${x.label?fmtMoney(x.v):fmtN(x.v)}" style="height:${x.v?Math.max(6,Math.round(x.v/max*84)):3}%"></div><span class="lb">${x.k}</span></div>`).join('')}</div>
    ${sumLabel?`<p style="font-size:11px;color:var(--ink-3);margin-top:10px;text-align:right">合计 <b style="color:var(--primary-deep)">${items[0]&&items[0].label?fmtMoney(total):fmtN(total)}</b></p>`:''}`;
}
function donut(parts,centerTop,centerSub){
  const total=parts.reduce((s,p)=>s+p.v,0)||1;
  const C=2*Math.PI*58;let acc=0;
  const arcs=parts.map((p,i)=>{const seg=C*p.v/total;
    const a=`<circle cx="75" cy="75" r="58" fill="none" stroke="${PAL[i%5]}" stroke-width="17" stroke-dasharray="${seg} ${C-0}" stroke-dashoffset="${-acc}" stroke-linecap="butt"/>`;
    acc+=seg;return a}).join('');
  return `<div class="ring"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="58" fill="none" stroke="#F0EBE0" stroke-width="17"/>${arcs}</svg>
    <div class="cval"><b>${centerTop}</b><span>${centerSub}</span></div></div>
    <div class="legend">${parts.map((p,i)=>`<div class="li"><i style="background:${PAL[i%5]}"></i>${p.k}<b>${p.v} 笔 · ${Math.round(p.v/total*100)}%</b></div>`).join('')}</div>`;
}
function monthBars(list,mode){ /* mode: 'finance' 按金额 | 'token' 按成本 */
  const now=new Date(),arr=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    arr.push({k:`${d.getMonth()+1}月`,v:0,label:mode==='finance'})}
  list.forEach(o=>{const d=new Date(o.time||o.t0||Date.now());
    for(let i=0;i<6;i++){const dd=new Date(now.getFullYear(),now.getMonth()-i,1);
      if(d.getFullYear()===dd.getFullYear()&&d.getMonth()===dd.getMonth()){arr[5-i].v+=mode==='finance'?o.amount:o.cost;break}}});
  return barChart(arr,{alt:mode==='token',sumLabel:true});
}

/* ============ 页面：总览 ============ */
function pDashboard(){
  const us=users(),os=orders(),tk=tokens();
  const paid=os.filter(o=>o.status==='paid');
  const revenue=paid.reduce((s,o)=>s+o.amount,0);
  const mRevenue=paid.filter(o=>new Date(o.time).getMonth()===new Date().getMonth()&&new Date(o.time).getFullYear()===new Date().getFullYear()).reduce((s,o)=>s+o.amount,0);
  const tcost=tk.reduce((s,t)=>s+t.cost,0);
  const vip=us.filter(u=>u.plan&&u.plan!=='free'&&u.planUntil>Date.now()).length;
  return `
  <div class="kpis">
    ${kpi('👥','注册用户',us.length,'人','var(--primary-soft)','较昨日 +'+ri(1,5))}
    ${kpi('💰','累计营收',fmtMoney(revenue),'','var(--sun-soft)',`本月 ${fmtMoney(mRevenue)}`)}
    ${kpi('📦','订单总数',os.length,'笔','var(--mint-soft)',`退款 ${os.filter(o=>o.status==='refund').length} 笔`)}
    ${kpi('👑','付费会员',vip,'人','var(--coral-soft)',`转化率 ${us.length?Math.round(vip/us.length*100):0}%`)}
    ${kpi('⚡','Token 消耗',fmtN(tk.reduce((s,t)=>s+t.tin+t.tout,0)),'','var(--sky-soft)',`成本 ${fmtMoney(tcost)}`)}
  </div>
  <div class="grid2">
    <div class="card"><div class="hd"><b>近 6 个月营收</b><span>单位 · 元</span></div>${monthBars(paid,'finance')}</div>
    <div class="card"><div class="hd"><b>支付方式</b><span>全部订单</span></div>${donutPay(os)}</div>
  </div>
  <div class="card"><div class="hd"><b>最新订单</b><a class="btn btn-xs" href="#/orders">查看全部 →</a></div>${orderTable(os.slice(0,6),true)}</div>`;
}
function kpi(ic,label,v,unit,bg,sub){return `<div class="card kpi"><span class="lb"><span class="dic" style="background:${bg}">${ic}</span>${label}</span><p class="v">${v}<small>${unit}</small></p><p class="sub">${sub}</p><span class="deco" style="background:var(--primary)"></span></div>`}
function donutPay(os){
  const by={};os.forEach(o=>{by[o.method]=(by[o.method]||0)+1});
  const names={alipay:'支付宝',wechat:'微信支付',card:'银行卡'};
  const parts=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([m,n])=>({k:names[m]||m,v:n}));
  return donut(parts,os.length+' 笔','全部订单');
}

/* ============ 页面：用户 ============ */
let uFilter='all',uQuery='';
function pUsers(){
  return `
  <div class="card">
    <div class="hd"><b>用户列表</b><span id="u-count"></span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div class="filters" id="u-filters">
        <button data-f="all">全部</button><button data-f="vip">付费会员</button><button data-f="free">免费用户</button>
      </div>
      <div class="search">🔍<input id="u-q" placeholder="搜索昵称 / 邮箱"></div>
    </div>
    <div id="u-table"></div>
  </div>`;
}
function renderUsers(){
  let list=users();
  if(uFilter==='vip')list=list.filter(u=>u.plan&&u.plan!=='free'&&u.planUntil>Date.now());
  if(uFilter==='free')list=list.filter(u=>!(u.plan&&u.plan!=='free'&&u.planUntil>Date.now()));
  if(uQuery)list=list.filter(u=>(u.nick||'').includes(uQuery)||(u.email||'').includes(uQuery));
  $('u-count').textContent=`共 ${list.length} 位用户`;
  $('u-table').innerHTML=list.length?`<table class="tbl"><thead><tr>
    <th>用户</th><th>会员状态</th><th>积分</th><th>老友券</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
    ${list.map(u=>{
      const vip=u.plan&&u.plan!=='free'&&u.planUntil>Date.now();
      return `<tr>
      <td><div class="ucell">${ava(u.nick)}<div><b>${esc(u.nick)}</b><span>${esc(u.email)}</span></div></div></td>
      <td><span class="st ${vip?'vip':'free'}">${vip?(PLAN_NAME[u.plan]||u.plan):'免费用户'}</span></td>
      <td class="num">${u.points||0}</td><td class="num">🎟 ${u.coupons??0}</td>
      <td class="mut">${fmtT(u.created||Date.now())}</td>
      <td><button class="btn btn-xs" onclick="openUser('${u.id}')">详情</button>
          <button class="btn btn-xs" onclick="gift('${u.id}')">送积分</button></td>
    </tr>`}).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">🪑</div><p>没有匹配的用户</p></div>`;
  $('u-q').value=uQuery;
}
let curUser=null;
function openUser(id){
  curUser=users().find(u=>u.id===id);if(!curUser)return;
  const my=orders().filter(o=>o.email===curUser.email);
  const myTk=tokens().filter(t=>t.nick===curUser.nick);
  const vip=curUser.plan&&curUser.plan!=='free'&&curUser.planUntil>Date.now();
  $('d-body').innerHTML=`
    <div class="duser">${ava(curUser.nick,56)}<div><b style="font-size:16px">${esc(curUser.nick)}</b>
      <p style="font-size:12px;color:var(--ink-3);margin-top:3px">${esc(curUser.email)}</p>
      <p style="margin-top:7px"><span class="st ${vip?'vip':'free'}">${vip?(PLAN_NAME[curUser.plan]||curUser.plan):'免费用户'}</span></p></div></div>
    <p class="dsec">账户数据</p>
    <div class="drow"><span>剩余积分</span><b>${curUser.points||0}</b></div>
    <div class="drow"><span>老友券</span><b>${curUser.coupons??0} 张</b></div>
    <div class="drow"><span>注册时间</span><b>${fmtT(curUser.created||Date.now())}</b></div>
    <div class="drow"><span>累计消费</span><b>${fmtMoney(my.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0))}</b></div>
    <p class="dsec">订单记录（${my.length}）</p>
    ${my.length?my.slice(0,8).map(o=>`<div class="drow"><span>${o.plan} · ${fmtT(o.time)}</span><b>${fmtMoney(o.amount)} <span class="st ${o.status}" style="margin-left:6px">${o.status==='paid'?'成功':'退款'}</span></b></div>`).join(''):'<p style="font-size:12px;color:var(--ink-3)">暂无订单</p>'}
    <p class="dsec">Token 消耗（${myTk.length} 场圆桌）</p>
    <div class="drow"><span>累计 tokens</span><b>${fmtN(myTk.reduce((s,t)=>s+t.tin+t.tout,0))}</b></div>
    <div class="drow"><span>折算成本</span><b>${fmtMoney(myTk.reduce((s,t)=>s+t.cost,0))}</b></div>
    <div class="dacts"><button class="btn btn-primary btn-sm" onclick="gift('${curUser.id}')">✦ 赠送 100 积分</button>
      <button class="btn btn-ghost btn-sm" onclick="gift('${curUser.id}','coupon')">赠送老友券 ×5</button></div>
    <p class="dsec">会员调整</p>
    <div class="dacts">${['trial','lite','plus','max','free'].map(k=>`<button class="btn btn-xs ${curUser.plan===k?'btn-primary':'btn-ghost'}" onclick="setPlan('${curUser.id}','${k}')">${PLAN_NAME[k]}</button>`).join('')}</div>
    <p style="font-size:11px;color:var(--ink-3);margin-top:8px">选择付费档位即开通一年期会员，选「免费版」取消会员；APP 端同浏览器实时生效</p>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
/* 后台改动若命中当前登录用户，镜像写穿到 APP 钱包（yln_wallet），保证后台→APP 回流 */
function syncWallet(uid,patch){
  let su=null;try{su=YLN.siteUser()}catch(e){}
  if(!su||su.id!==uid)return;
  const w=YLN.walletLoad();if(!w)return;
  Object.assign(w,patch);
  YLN.walletSave(w);   /* walletSave 内部会再写穿回 site user，两侧保持一致 */
}
function gift(id,type){
  const us=users(),i=us.findIndex(u=>u.id===id);if(i<0)return;
  if(type==='coupon'){us[i].coupons=(us[i].coupons||0)+5;toast(`已向 ${us[i].nick} 赠送老友券 ×5 🎟`)}
  else{us[i].points=(us[i].points||0)+100;toast(`已向 ${us[i].nick} 赠送 100 积分 ✦`)}
  save(K.users,us);
  syncWallet(id,type==='coupon'?{coupons:us[i].coupons}:{points:us[i].points});
  router();openUser(id);
}
function setPlan(id,key){
  const us=users(),i=us.findIndex(u=>u.id===id);if(i<0)return;
  us[i].plan=key;
  us[i].planUntil=key==='free'?null:Date.now()+365*864e5;
  save(K.users,us);
  syncWallet(id,{plan:key,planUntil:us[i].planUntil});
  router();openUser(id);
  toast(`已将 ${us[i].nick} 调整为「${PLAN_NAME[key]}」${key==='free'?'':' · 有效期一年'}`);
}

/* ============ 页面：订单 ============ */
let oFilter='all',oQuery='';
function pOrders(){
  return `
  <div class="card">
    <div class="hd"><b>全部订单</b><span id="o-count"></span></div>
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div class="filters" id="o-filters">
        <button data-f="all">全部</button><button data-f="trial">体验装</button><button data-f="lite">轻量</button><button data-f="plus">标准</button><button data-f="max">创作</button>
        <button data-f="paid">支付成功</button><button data-f="refund">已退款</button>
      </div>
      <div class="search">🔍<input id="o-q" placeholder="搜索订单号 / 用户"></div>
    </div>
    <div id="o-table"></div>
  </div>`;
}
function renderOrders(){
  let list=orders();
  if(['trial','lite','plus','max'].includes(oFilter))list=list.filter(o=>o.planKey===oFilter);
  if(['paid','refund'].includes(oFilter))list=list.filter(o=>o.status===oFilter);
  if(oQuery)list=list.filter(o=>(o.id||'').includes(oQuery)||((o.nick||'')+(o.email||'')).includes(oQuery));
  $('o-count').textContent=`共 ${list.length} 笔 · 营收 ${fmtMoney(list.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0))}`;
  $('o-table').innerHTML=orderTable(list);
}
function orderTable(list,mini){
  if(!list.length)return `<div class="empty"><div class="em">📦</div><p>没有匹配的订单</p></div>`;
  const mm={alipay:'🅰 支付宝',wechat:'💬 微信支付',card:'💳 银行卡'};
  return `<table class="tbl"><thead><tr><th>订单号</th><th>用户</th><th>套餐</th>${mini?'':'<th>支付方式</th>'}<th>时间</th><th>金额</th><th>状态</th>${mini?'':'<th>操作</th>'}</tr></thead><tbody>
  ${list.map(o=>`<tr>
    <td class="oid">${o.id}</td>
    <td><div class="ucell">${ava(o.nick)}<div><b>${esc(o.nick||'—')}</b></div></div></td>
    <td>${o.plan}${o.pts?`<span class="mut" style="margin-left:5px">+${o.pts}分</span>`:''}</td>
    ${mini?'':`<td class="mut">${mm[o.method]||o.method||'—'}</td>`}
    <td class="mut">${fmtT(o.time)}</td>
    <td class="amt">${fmtMoney(o.amount)}</td>
    <td><span class="st ${o.status}">${o.status==='paid'?'成功':'退款'}</span></td>
    ${mini?'':`<td>${o.status==='paid'?`<button class="btn btn-xs" onclick="refund('${o.id}')">退款</button>`:'<span class="mut">已处理</span>'}</td>`}
  </tr>`).join('')}</tbody></table>`;
}
function refund(id){
  const os=orders(),i=os.findIndex(o=>o.id===id);if(i<0)return;
  os[i].status='refund';save(K.orders,os);toast(`订单 ${id} 已标记退款`);router();
}

/* ============ 页面：财务 ============ */
function pFinance(){
  const os=orders(),paid=os.filter(o=>o.status==='paid');
  const refunds=os.filter(o=>o.status==='refund');
  const revenue=paid.reduce((s,o)=>s+o.amount,0);
  const refundAmt=refunds.reduce((s,o)=>s+o.amount,0);
  const now=new Date();
  const mRevenue=paid.filter(o=>{const d=new Date(o.time);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,o)=>s+o.amount,0);
  const buyers=new Set(paid.map(o=>o.email)).size;
  const byPlan={};paid.forEach(o=>{byPlan[o.plan]=(byPlan[o.plan]||0)+1});
  const parts=Object.entries(byPlan).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({k,v}));
  return `
  <div class="kpis">
    ${kpi('💰','总收入',fmtMoney(revenue),'','var(--sun-soft)',`${paid.length} 笔成功订单`)}
    ${kpi('📅','本月收入',fmtMoney(mRevenue),'','var(--primary-soft)',`占比 ${revenue?Math.round(mRevenue/revenue*100):0}%`)}
    ${kpi('↩️','退款金额',fmtMoney(refundAmt),'','var(--coral-soft)',`退款率 ${os.length?Math.round(refunds.length/os.length*100):0}%`)}
    ${kpi('🧮','ARPU',fmtMoney(buyers?revenue/buyers:0),'','var(--mint-soft)',`${buyers} 位付费用户`)}
  </div>
  <div class="grid2">
    <div class="card"><div class="hd"><b>月度营收</b><span>近 6 个月 · 元</span></div>${monthBars(paid,'finance')}</div>
    <div class="card"><div class="hd"><b>套餐占比</b><span>成功订单</span></div>${parts.length?donut(parts,paid.length+' 笔','成功订单'):'<div class="empty"><div class="em">📭</div><p>暂无数据</p></div>'}</div>
  </div>
  <div class="card"><div class="hd"><b>交易流水</b><button class="btn btn-primary btn-sm" onclick="exportCSV()">⬇ 导出 CSV</button></div>${orderTable(os)}</div>`;
}
function exportCSV(){
  const rows=[['订单号','用户','邮箱','套餐','金额','支付方式','状态','时间']];
  orders().forEach(o=>rows.push([o.id,o.nick,o.email,o.plan,o.amount,o.method,o.status,fmtDT(o.time)]));
  const csv='\ufeff'+rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`与你老友-交易流水-${fmtT(Date.now())}.csv`;a.click();
  toast('CSV 已导出 ⬇');
}

/* ============ 页面：Token 计算 ============ */
function pToken(){
  const tk=tokens();
  const tin=tk.reduce((s,t)=>s+t.tin,0),tout=tk.reduce((s,t)=>s+t.tout,0);
  const cost=tk.reduce((s,t)=>s+t.cost,0);
  const pts=tk.reduce((s,t)=>s+t.pts,0);
  const revenue=pts*PTS_VALUE;
  const margin=revenue-cost;
  return `
  <div class="kpis">
    ${kpi('⚡','总 Tokens',fmtN(tin+tout),'','var(--sky-soft)',`输入 ${fmtN(tin)} · 输出 ${fmtN(tout)}`)}
    ${kpi('🔥','Token 成本',fmtMoney(cost),'','var(--coral-soft)',`${tk.length} 场圆桌`)}
    ${kpi('✦','积分消耗',pts,'分','var(--primary-soft)',`折算收入 ${fmtMoney(revenue)}`)}
    ${kpi('📈','毛利估算',fmtMoney(margin),'','var(--mint-soft)',`毛利率 ${revenue?Math.round(margin/revenue*100):0}%`)}
  </div>
  <div class="grid2">
    <div class="card"><div class="hd"><b>近 30 天 Token 消耗</b><span>按月聚合 · 折算成本（元）</span></div>${monthBars(tk,'token')}</div>
    <div class="card"><div class="hd"><b>模型价目表</b><span>演示单价 · ¥/1M tokens</span></div>
      <table class="tbl"><thead><tr><th>模型</th><th>输入</th><th>输出</th><th>调用占比</th></tr></thead><tbody>
      ${MODELS.map(m=>{const n=tk.filter(t=>t.model===m.id).length;return `<tr>
        <td><b>${m.name}</b><span class="mut" style="display:block;font-size:10.5px">${m.id}</span></td>
        <td class="num">¥${m.pin}</td><td class="num">¥${m.pout}</td>
        <td><span class="st ${n?'paid':'free'}" style="${n?'':'color:var(--ink-3);background:var(--surface-2)'}">${tk.length?Math.round(n/tk.length*100):0}%</span></td></tr>`}).join('')}
      </tbody></table>
      <p style="font-size:11px;color:var(--ink-3);margin-top:12px;line-height:1.8">积分定价：标准月卡 ¥89 = 2000 积分（1 积分 ≈ ¥${PTS_VALUE.toFixed(4)}）。一场私密圆桌按 角色数 × 轮次 × 2 分 计费，成本按各模型单价折算。</p>
    </div>
  </div>
  <div class="card"><div class="hd"><b>圆桌会话 Token 流水</b><span>近 30 天 · ${tk.length} 场</span></div>
    <table class="tbl"><thead><tr><th>会话</th><th>议题</th><th>用户</th><th>规模</th><th>模型</th><th>输入</th><th>输出</th><th>成本</th><th>积分</th></tr></thead><tbody>
    ${tk.slice(0,20).map(t=>{const m=modelOf(t.model);return `<tr>
      <td class="oid">${t.id}</td>
      <td style="max-width:180px"><b style="font-weight:700">${esc(t.topic)}</b></td>
      <td><div class="ucell">${ava(t.nick)}<b>${esc(t.nick)}</b></div></td>
      <td class="mut">${t.roles} 角色 · ${t.rounds} 轮</td>
      <td class="mut">${m.name}</td>
      <td class="num">${fmtN(t.tin)}</td><td class="num">${fmtN(t.tout)}</td>
      <td class="amt">¥${t.cost.toFixed(2)}</td><td class="num">${t.pts} 分</td>
    </tr>`}).join('')}
    </tbody></table></div>`;
}

/* ============ 页面：老友管理 ============ */
const CHAR_FIELDS=['智慧','创作','情感'];
const CHAR_PALETTES=[['#B8C9F5','#5B7BD5','#EAF0FB','#3D5EA8'],['#F5C9D8','#D56B93','#FBEFF3','#B04873'],['#C9E8D8','#5BAF85','#EDF8F2','#2F7A5F'],['#F5E3B8','#D5A75B','#FBF4E6','#A87A2F'],['#D9C9F5','#8F6BD5','#F2EDFB','#6B4AA8'],['#C9E3F5','#5B9BD5','#EDF5FB','#2F72A8']];
const adminChars=()=>YLN.adminChars();
function pChars(){
  const cs=adminChars(),pub=cs.filter(c=>c.published).length;
  return `
  <div class="kpis">
    <div class="kpi"><p class="lb">老友总数</p><p class="v">${cs.length}</p><p class="sub">官方产出 · 含草稿</p></div>
    <div class="kpi"><p class="lb">已发布</p><p class="v">${pub}</p><p class="sub">手机端老友库实时可见</p></div>
    <div class="kpi"><p class="lb">草稿</p><p class="v">${cs.length-pub}</p><p class="sub">仅后台可见</p></div>
  </div>
  <div class="card">
    <div class="hd"><b>官方老友</b><button class="btn btn-primary btn-sm" onclick="charEdit(null)">＋ 新增老友</button></div>
    <div id="c-table"></div>
  </div>`;
}
function renderChars(){
  const cs=adminChars();
  $('c-table').innerHTML=cs.length?`<table class="tbl"><thead><tr>
    <th>老友</th><th>身份</th><th>分类</th><th>标签</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
    ${cs.map(c=>`<tr>
      <td><div class="ucell"><span class="av" style="background:linear-gradient(135deg,${c.c1||'#C9E3F5'},${c.c2||'#5B9BD5'})">${c.emoji||'🙂'}</span><div><b>${esc(c.short)}</b><span>${esc(c.name)}</span></div></div></td>
      <td>${esc(c.title||'')}</td>
      <td>${esc(c.field||'智慧')}</td>
      <td>${(c.tags||[]).map(t=>`<span class="st free" style="margin-right:4px">${esc(t)}</span>`).join('')}</td>
      <td><span class="st ${c.published?'vip':'free'}">${c.published?'已发布':'草稿'}</span></td>
      <td class="mut">${fmtT(c.created||Date.now())}</td>
      <td><button class="btn btn-xs" onclick="charEdit('${c.id}')">编辑</button>
          <button class="btn btn-xs" onclick="charToggle('${c.id}')">${c.published?'下架':'发布'}</button>
          <button class="btn btn-xs" onclick="charDel('${c.id}')">删除</button></td>
    </tr>`).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">🪑</div><p>还没有官方老友</p></div>`;
}
let charEditing=null;
function charEdit(id){
  charEditing=id?adminChars().find(c=>c.id===id):null;
  const c=charEditing||{short:'',name:'',title:'',emoji:'🙂',field:'智慧',quote:'',tags:[],published:false};
  document.querySelector('#drawer .dh b').textContent=charEditing?'编辑老友':'新增官方老友';
  const mind=c.mind||{models:[],heuristics:[],dna:[],blind:'',bound:''};
  $('d-body').innerHTML=`
    <p class="dsec">极简开捏（默认只填这里，其余交给女娲）</p>
    <div class="frow"><label>显示名 *</label><input id="cf-short" value="${esc(c.short)}" placeholder="如：德鲁克"></div>
    <div class="frow"><label>方向（可选）</label><input id="cf-dir" value="${esc(c.dir||'')}" placeholder="如：考研英语 / 诗人 / 商业导师"></div>
    <div class="frow"><label>分类</label><select id="cf-field">${CHAR_FIELDS.map(f=>`<option ${f===c.field?'selected':''}>${f}</option>`).join('')}</select></div>
    <div class="frow"><label>语料（可选）</label><textarea id="cf-corpus" rows="3" placeholder="粘贴 TA 的访谈/文章/课程片段，蒸馏会更真（可留空）">${esc(c.corpus||'')}</textarea></div>
    <div class="dacts"><button class="btn btn-primary btn-sm" id="cf-ai" onclick="charAIFill()">🔥 女娲蒸馏</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDrawer()">取消</button></div>
    <p style="font-size:11.5px;color:var(--ink-3);margin:0 0 4px">蒸馏完成后自动展开高级区，审校无误再保存发布。</p>
    <details class="adv" id="cf-adv" ${charEditing?'open':''}>
      <summary>高级 · 蒸馏产物审校（全部可选）</summary>
      <div class="frow"><label>发布状态</label><select id="cf-pub"><option value="1" ${c.published?'selected':''}>已发布 · 手机端可见</option><option value="0" ${c.published?'':'selected'}>草稿 · 仅后台</option></select></div>
      <div class="frow"><label>全名</label><input id="cf-name" value="${esc(c.name||'')}" placeholder="如：彼得·德鲁克"></div>
      <div class="frow"><label>身份</label><input id="cf-title" value="${esc(c.title||'')}" placeholder="如：现代管理学之父"></div>
      <div class="frow"><label>Emoji</label><input id="cf-emoji" value="${c.emoji||'🙂'}" maxlength="4"></div>
      <div class="frow"><label>一句话</label><input id="cf-quote" value="${esc(c.quote||'')}" placeholder="TA 的招牌金句"></div>
      <div class="frow"><label>标签</label><input id="cf-tags" value="${esc((c.tags||[]).join('，'))}" placeholder="逗号分隔，如：官方精选，目标管理"></div>
      <div class="frow"><label>心智模型</label><textarea id="cf-models" rows="3" placeholder="每行一个：模型名|TA 怎么用它">${esc((mind.models||[]).map(m=>m.n+'|'+m.d).join('\n'))}</textarea></div>
      <div class="frow"><label>决策启发式</label><textarea id="cf-heur" rows="3" placeholder="每行一条：场景→TA 的决策规则">${esc((mind.heuristics||[]).join('\n'))}</textarea></div>
      <div class="frow"><label>表达DNA</label><input id="cf-dna" value="${esc((mind.dna||[]).join('，'))}" placeholder="逗号分隔 3 个语言指纹"></div>
      <div class="frow"><label>盲区</label><input id="cf-blind" value="${esc(mind.blind||'')}" placeholder="TA 的盲区/反模式一句话"></div>
      <div class="frow"><label>诚实边界</label><input id="cf-bound" value="${esc(mind.bound||'')}" placeholder="哪些是推演/语料未覆盖"></div>
      <p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">🎨 头像配色由系统自动分配，保持全站和谐</p>
      <div class="dacts"><button class="btn btn-primary btn-sm" onclick="charSave()">${charEditing?'保存修改':'保存老友'}</button></div>
    </details>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
/* ===== 女娲蒸馏（审校器主按钮：管线唯一实现在 yln-core.js，与手机端同一条 prompt） ===== */
let aiFilling=false;
async function charAIFill(){
  if(aiFilling)return;
  const g=id=>($(id).value||'').trim();
  const short=g('cf-short');
  if(!short){toast('先填显示名，女娲才知道蒸谁');return}
  const btn=$('cf-ai');aiFilling=true;btn.textContent='⏳ 女娲蒸馏中…';btn.disabled=true;
  try{
    const j=await YLN.nuwa.distill({name:short,dir:g('cf-dir'),corpus:g('cf-corpus')});
    if(!j)throw new Error('蒸馏结果为空');
    if(j.title)$('cf-title').value=j.title;
    if(j.quote)$('cf-quote').value=j.quote;
    if(Array.isArray(j.tags)&&j.tags.length)$('cf-tags').value=j.tags.join('，');
    if(!charEditing&&j.field&&CHAR_FIELDS.includes(j.field))$('cf-field').value=j.field;
    if(j.mind){
      $('cf-models').value=(j.mind.models||[]).map(m=>(m.n||'')+'|'+(m.d||'')).join('\n');
      $('cf-heur').value=(j.mind.heuristics||[]).join('\n');
      $('cf-dna').value=(j.mind.dna||[]).join('，');
      $('cf-blind').value=j.mind.blind||'';
      $('cf-bound').value=j.mind.bound||'';
    }
    const adv=$('cf-adv');if(adv)adv.open=true; /* 蒸馏完自动展开，进入审校 */
    toast('🔥 女娲蒸馏完成，已展开高级区供审校');
  }catch(e){toast('女娲蒸馏失败：'+(e.message||'网络异常')+'，可手填后保存')}
  aiFilling=false;btn.textContent='🔥 女娲蒸馏';btn.disabled=false;
}
function parseMind(){
  const g=id=>($(id).value||'').trim();
  const models=g('cf-models')?g('cf-models').split('\n').map(l=>{const[l1,...r]=l.split('|');return l1&&l1.trim()?{n:l1.trim().slice(0,16),d:(r.join('|')||'').trim().slice(0,60)}:null}).filter(Boolean):[];
  const heur=g('cf-heur')?g('cf-heur').split('\n').map(s=>s.trim().slice(0,60)).filter(Boolean):[];
  const dna=g('cf-dna')?g('cf-dna').split(/[,，]/).map(s=>s.trim().slice(0,24)).filter(Boolean):[];
  const mind={models,heuristics:heur,dna,blind:g('cf-blind').slice(0,60),bound:g('cf-bound').slice(0,60)};
  return mind.models.length?mind:null;
}
function charSave(){
  const g=id=>($(id).value||'').trim();
  const short=g('cf-short');
  if(!short){toast('请填写显示名');return}
  const cs=adminChars();
  const mind=parseMind();
  const base={short,name:g('cf-name')||short,title:g('cf-title'),emoji:g('cf-emoji')||'🙂',
    field:g('cf-field'),quote:g('cf-quote')||'「来，我把我的智慧压缩成一句话给你。」',
    tags:g('cf-tags')?g('cf-tags').split(/[,，]/).map(s=>s.trim()).filter(Boolean):[],
    dir:g('cf-dir'),corpus:g('cf-corpus'),mind,
    conf:charEditing&&charEditing.conf?charEditing.conf:(mind?80:35),
    published:g('cf-pub')==='1'};
  if(charEditing){
    const i=cs.findIndex(c=>c.id===charEditing.id);if(i<0)return;
    cs[i]={...cs[i],...base};toast(`「${short}」已更新，手机端${base.published?'同步生效':'已转为草稿'}`);
  }else{
    const pal=CHAR_PALETTES[cs.length%CHAR_PALETTES.length];
    cs.push({id:'adm_'+Date.now().toString(36),...base,c1:pal[0],c2:pal[1],tint:pal[2],deep:pal[3],created:Date.now()});
    toast(`「${short}」已创建${base.published?'并发布到手机端 ✦':'为草稿'}`);
  }
  YLN.saveAdminChars(cs);closeDrawer();router();
}
function charToggle(id){
  const cs=adminChars(),i=cs.findIndex(c=>c.id===id);if(i<0)return;
  cs[i].published=!cs[i].published;YLN.saveAdminChars(cs);
  toast(cs[i].published?`「${cs[i].short}」已发布，手机端老友库实时可见 ✦`:`「${cs[i].short}」已下架为草稿`);
  router();
}
function charDel(id){
  const cs=adminChars(),i=cs.findIndex(c=>c.id===id);if(i<0)return;
  const c=cs[i];
  if(!confirm(`确认删除「${c.short}」？已领养该老友的用户不受影响。`))return;
  cs.splice(i,1);YLN.saveAdminChars(cs);toast(`「${c.short}」已删除`);router();
}

/* ============ 路由 ============ */
const routes={
  dashboard:{t:'数据总览',s:'平台核心指标一览',f:pDashboard},
  users:{t:'用户管理',s:'注册用户 · 会员 · 积分发放',f:pUsers,after:renderUsers},
  orders:{t:'订单管理',s:'全平台订单 · 退款处理',f:pOrders,after:renderOrders},
  finance:{t:'财务管理',s:'营收 · 退款 · 流水导出',f:pFinance},
  token:{t:'Token 计算',s:'模型成本 · 积分对照 · 毛利',f:pToken},
  chars:{t:'老友管理',s:'官方老友 · 发布下架 · 手机端同步',f:pChars,after:renderChars},
};
function router(){
  if(!isAuthed()){showLogin();return}
  const key=(location.hash.replace('#/','')||'dashboard').split('?')[0];
  const r=routes[key]||routes.dashboard;
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.toggle('on',a.dataset.r===key||(key==='dashboard'&&a.dataset.r==='dashboard')));
  $('pt').textContent=r.t;$('ps').textContent=r.s;
  $('view').innerHTML=`<div class="view">${r.f()}</div>`;
  if(r.after)r.after();
  /* 筛选与搜索绑定 */
  const uf=$('u-filters');
  if(uf){uf.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.f===uFilter);
    b.onclick=()=>{uFilter=b.dataset.f;renderUsers()}});}
  const uq=$('u-q');if(uq)uq.oninput=e=>{uQuery=e.target.value.trim();renderUsers()};
  const of_=$('o-filters');
  if(of_){of_.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.f===oFilter);
    b.onclick=()=>{oFilter=b.dataset.f;renderOrders()}});}
  const oq=$('o-q');if(oq)oq.oninput=e=>{oQuery=e.target.value.trim();renderOrders()};
}
addEventListener('hashchange',router);
/* 抽屉关闭 */
function closeDrawer(){$('veil').classList.remove('on');$('drawer').classList.remove('on')}
addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
