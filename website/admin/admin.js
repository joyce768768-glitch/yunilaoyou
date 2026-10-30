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
/* 官方老友库跨设备同步（后台侧）：boot 时以服务器为准对齐；服务器空表则用本地下数据播种 */
YLN.adminCharsPull().then(()=>{ if(isAuthed())router() }).catch(()=>{});
/* 女娲 Prompt 热编辑跨端同步（后台侧）：boot 时以服务器为准对齐本地覆盖 */
YLN.nuwa.promptsPull().catch(()=>{});

const users=()=>load(K.users,[]);
const orders=()=>load(K.orders,[]);
const tokens=()=>load(K.tokens,[]);

/* ---- 管理员鉴权（演示级：手机号+验证码，验证码本端生成自动回填；sessionStorage 会话关标签页即失效） ---- */
const AUTH_KEY='yln_admin_session';
let smsCode='',smsTimer=null;
const isAuthed=()=>{try{return sessionStorage.getItem(AUTH_KEY)==='1'}catch(e){return false}};
function showLogin(){$('login').hidden=false;$('app').hidden=true}
function enterApp(){$('login').hidden=true;$('app').hidden=false;location.hash||='#/dashboard';router()}
function sendCode(){
  const phone=$('lg-phone').value.trim(),err=$('lg-err');
  err.classList.remove('on');
  if(!/^1\d{10}$/.test(phone)){err.textContent='请输入正确的 11 位手机号';err.classList.add('on');return}
  smsCode=String(Math.floor(100000+Math.random()*900000));   /* 演示环境：本端生成并直接回填，免真实短信 */
  $('lg-code').value=smsCode;
  const btn=$('lg-send');let left=60;btn.disabled=true;
  clearInterval(smsTimer);
  smsTimer=setInterval(()=>{btn.textContent=`${--left}s 后重发`;if(left<=0){clearInterval(smsTimer);btn.disabled=false;btn.textContent='获取验证码'}},1000);
  err.textContent='验证码已自动填入（演示环境）';err.classList.add('on');err.style.color='var(--mint)';
  setTimeout(()=>{err.classList.remove('on');err.style.color=''},1800);
}
function tryLogin(e){
  e.preventDefault();
  const phone=$('lg-phone').value.trim(),code=$('lg-code').value.trim(),err=$('lg-err'),card=document.querySelector('.login-card');
  err.classList.remove('on');err.style.color='';
  if(!/^1\d{10}$/.test(phone)){
    err.textContent='请输入正确的 11 位手机号';err.classList.add('on');
    if(card){card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake')}
    return;
  }
  if(!smsCode){err.textContent='请先点击「获取验证码」';err.classList.add('on');return}
  if(code!==smsCode){
    err.textContent='验证码不正确，请重新获取';err.classList.add('on');
    if(card){card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake')}
    return;
  }
  try{sessionStorage.setItem(AUTH_KEY,'1')}catch(x){}
  enterApp();toast('欢迎回来，管理员 ✦');
}
function logout(){
  try{sessionStorage.removeItem(AUTH_KEY)}catch(x){}
  showLogin();
  $('lg-code').value='';smsCode='';clearInterval(smsTimer);
  const btn=$('lg-send');if(btn){btn.disabled=false;btn.textContent='获取验证码'}
  $('lg-err').classList.remove('on');
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
    <p style="font-size:11px;color:var(--ink-3);margin-top:8px">选择付费档位即开通一年期会员，选「免费版」取消会员；APP 端同浏览器实时生效</p>
    <p class="dsec">🔒 隐私专区</p>
    <div id="pv-zone">
      <div style="background:var(--surface-2);border-radius:10px;padding:12px;font-size:12px;line-height:1.7;color:var(--ink-2)">
        <b style="color:var(--ink)">执法级隐私数据</b><br>
        用户的群聊数据（圆桌实录）与自建老友属用户隐私，仅限极少数授权管理员（如执法调证）查阅。<br>
        <span style="color:#E05A4E">每次查阅均需口令并留痕审计。</span>
      </div>
      <div class="dacts" style="margin-top:10px">
        <input id="pv-code" type="password" placeholder="输入隐私口令" style="flex:1" onkeydown="if(event.key==='Enter')unlockPrivacy('${curUser.id}')">
        <button class="btn btn-primary btn-sm" onclick="unlockPrivacy('${curUser.id}')">解锁查阅</button>
      </div>
    </div>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
/* 隐私专区：口令解锁 → 拉取该用户群聊数据与自建老友（服务器逐次校验口令），查阅留痕 */
async function unlockPrivacy(uid){
  const code=($('pv-code')&&$('pv-code').value||'').trim();
  if(!code){toast('请输入隐私口令');return}
  try{
    const r=await fetch('/api/admin/user/privacy?uid='+encodeURIComponent(uid)+'&code='+encodeURIComponent(code));
    const d=await r.json();
    if(!d.ok){toast(d.err==='隐私口令错误'?'口令错误，已记录本次尝试':'拉取失败：'+(d.err||r.status));return}
    auditLog(uid,'查阅隐私数据');
    const rounds=d.rounds||[],chars=d.chars||[];
    const zone=$('pv-zone');
    zone.innerHTML=`
      <div style="background:#FFF4F0;border-radius:10px;padding:10px 12px;font-size:11.5px;color:#B0442E;margin-bottom:10px">
        ⚠️ 你正在查阅用户 <b>${esc(curUser.nick)}</b> 的隐私数据（口令校验通过）。本次查阅已写入审计日志。
      </div>
      <p style="font-size:12.5px;font-weight:700;margin:0 0 6px">群聊数据（${rounds.length}）</p>
      ${rounds.length?rounds.slice(0,20).map(r=>`
        <div style="background:var(--surface-2);border-radius:10px;padding:10px 12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <b style="font-size:12.5px">${esc(r.topic||'（无主题）')}</b>
            <span class="st ${r.status==='live'?'live':'arch'}">${r.status==='live'?'直播中':r.status==='done'?'已收官':'已归档'}</span>
          </div>
          <p style="font-size:11px;color:var(--ink-3);margin:4px 0 0">${(r.chars||[]).map(c=>{const ch=charById(c);return ch?ch.short:c}).join(' · ')||'—'}${r.meta?' ｜ '+esc(r.meta):''}${r.isPublic?' ｜ 🌍 公开':''}</p>
          ${r.cache&&r.cache.length?`<details style="margin-top:6px"><summary style="font-size:11px;color:var(--primary);cursor:pointer">查看实录（${r.cache.length} 条）</summary>
            <div style="max-height:180px;overflow:auto;margin-top:6px;font-size:11px;line-height:1.7;color:var(--ink-2)">
            ${r.cache.slice(0,40).map(m=>`<p style="margin:0 0 3px">${m.type==='user'?'<b>【用户】</b>':m.type==='msg'?`<b>【${esc((charById(m.who)||{}).short||m.who||'?')}】</b>`:m.type==='stage'?'<i>〔'+esc(m.label||'')+'〕</i>':'<i>〔纪要〕</i>'}${esc((m.text||m.html||'').replace(/<[^>]+>/g,'').slice(0,80))}</p>`).join('')}
            </div></details>`:''}
        </div>`).join(''):'<p style="font-size:12px;color:var(--ink-3)">该用户暂无圆桌记录</p>'}
      <p style="font-size:12.5px;font-weight:700;margin:12px 0 6px">自建老友（${chars.length}）</p>
      ${chars.length?chars.slice(0,30).map(c=>`
        <div style="background:var(--surface-2);border-radius:10px;padding:9px 12px;margin-bottom:6px;display:flex;justify-content:space-between;gap:8px;align-items:center">
          <div style="min-width:0"><b style="font-size:12.5px">${esc(c.short||c.name||'?')}</b>
          <p style="font-size:11px;color:var(--ink-3);margin:2px 0 0">${esc(c.field||'—')} · ${esc(c.kl||'')||'无金句'}</p></div>
          <span style="font-size:10.5px;color:var(--ink-3);white-space:nowrap">${c.nuwa_conf!=null?('置信度 '+c.nuwa_conf+'%'):''}</span>
        </div>`).join(''):'<p style="font-size:12px;color:var(--ink-3)">该用户暂无自建老友</p>'}
      <p style="font-size:11px;color:var(--ink-3);margin-top:10px">审计留痕：${auditLog(uid,null)}</p>`;
    toast('已解锁，查阅已留痕');
  }catch(e){toast('服务器不可达，无法查阅隐私数据')}
}
/* 隐私查阅审计日志（localStorage 滚动 200 条）：传 uid+action 追加一条并返回提示文案；仅传 uid 返回最近一条摘要 */
function auditLog(uid,action){
  let logs=[];try{logs=JSON.parse(localStorage.getItem('yln_privacy_audit')||'[]')}catch(e){}
  if(action){
    logs.unshift({uid,nick:(users().find(u=>u.id===uid)||{}).nick||uid,action,at:Date.now()});
    logs=logs.slice(0,200);localStorage.setItem('yln_privacy_audit',JSON.stringify(logs));
    return '已记录';
  }
  const last=logs.find(l=>l.uid===uid);
  return last?`${fmtT(last.at)} · ${last.action}`:'本次为首次查阅';
}
function charById(id){return adminChars().find(c=>c.id===id)||null}
/* 后台改动若命中当前登录用户，镜像写穿到 APP 钱包（yln_wallet），保证后台→APP 回流 */
function syncWallet(uid,patch){
  let su=null;try{su=YLN.siteUser()}catch(e){}
  if(!su||su.id!==uid)return;
  const w=YLN.walletLoad();if(!w)return;
  Object.assign(w,patch);
  YLN.walletSave(w);   /* walletSave 内部会再写穿回 site user，两侧保持一致 */
}
/* P1：后台调整推送到服务器钱包表（yln_wallet，patch 合并+流水备注），APP 端下次 walletPull 拉回 */
function adminWalletPush(uid,patch,note,delta){
  try{
    fetch('/api/admin/wallet',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uid,patch,note,delta:delta||0})})
      .then(r=>r.json()).then(d=>{if(!d||!d.ok)toast('服务器钱包同步失败：'+((d&&d.err)||'服务不可达'))})
      .catch(()=>{});
  }catch(e){}
}
function gift(id,type){
  const us=users(),i=us.findIndex(u=>u.id===id);if(i<0)return;
  if(type==='coupon'){us[i].coupons=(us[i].coupons||0)+5;toast(`已向 ${us[i].nick} 赠送老友券 ×5 🎟`)}
  else{us[i].points=(us[i].points||0)+100;toast(`已向 ${us[i].nick} 赠送 100 积分 ✦`)}
  save(K.users,us);
  if(type==='coupon'){
    syncWallet(id,{coupons:us[i].coupons});
    adminWalletPush(id,{coupons:us[i].coupons},`后台赠送 · 老友券 ×5`,5);
  }else{
    syncWallet(id,{points:us[i].points});
    adminWalletPush(id,{points:us[i].points},`后台赠送 · 积分 +100`,100);
  }
  router();openUser(id);
}
function setPlan(id,key){
  const us=users(),i=us.findIndex(u=>u.id===id);if(i<0)return;
  us[i].plan=key;
  us[i].planUntil=key==='free'?null:Date.now()+365*864e5;
  save(K.users,us);
  syncWallet(id,{plan:key,planUntil:us[i].planUntil});
  adminWalletPush(id,{plan:key,planUntil:us[i].planUntil},`后台调整会员 · ${PLAN_NAME[key]}`,0);
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

/* ============ 页面：女娲管线（观测 · 复核队列 · Prompt 模板 · 角色库） ============ */
const NUWA_SIX_NAME={works:'著作',talks:'访谈',social:'社媒',critic:'批评',decision:'决策',life:'人生'};
const nuwaTraces=()=>YLN.nuwa.traceList();
let nuwaTab='obs',nuwaSynced=false;
/* 健康口径（完整版）：连续失败 / 降级率>30% / 平均置信度<60 / 维基命中率<30% */
function nuwaHealth(){
  const ts=nuwaTraces().filter(t=>t.done);
  const total=ts.length;
  if(!total)return{cls:'ok',text:'管线就绪 · 还没有运行记录，去「老友管理 → 新增老友」蒸一位试试'};
  let consec=0;for(const t of ts){if(t.distill&&!t.distill.ok)consec++;else break}
  if(consec>=2)return{cls:'bad',text:`管线连续失败 ${consec} 次：请检查 DeepSeek Key 与网络（可点蒸馏按钮重新配 Key）`};
  const degRate=ts.filter(t=>t.degraded).length/total;
  const avgConf=Math.round(ts.reduce((s,t)=>s+(t.conf||0),0)/total);
  const wiki=ts.slice(0,10), wikiHit=wiki.reduce((s,t)=>{const n=(t.nodes||[]).find(x=>x.id==='six');
    return s+(n&&n.six?Object.values(n.six).filter(x=>x.wiki).length:0)},0);
  const wikiRate=wikiHit/(wiki.length*6);
  if(degRate>0.3)return{cls:'warn',text:`降级率 ${Math.round(degRate*100)}% 超过 30% 阈值 · 平均置信度 ${avgConf} —— 建议给常蒸对象补一手语料`};
  if(avgConf<60)return{cls:'warn',text:`平均置信度 ${avgConf} 低于 60 红线 —— 检查语料质量与六路命中情况`};
  if(wikiRate<0.3)return{cls:'warn',text:`维基命中率仅 ${Math.round(wikiRate*100)}% —— 多为冷门人物或防串人拦截，蒸馏更依赖模型记忆`};
  return{cls:'ok',text:`平均置信度 ${avgConf} · 降级率 ${Math.round(degRate*100)}% · 维基命中 ${Math.round(wikiRate*100)}% · 共 ${total} 次运行`};
}
function pNuwa(){
  const ts=nuwaTraces();
  const done=ts.filter(x=>x.done);
  const total=done.length;
  const pend=ts.filter(t=>t.status==='review').length;
  const avgConf=total?Math.round(done.reduce((s,t)=>s+(t.conf||0),0)/total):0;
  const probed=done.filter(t=>t.probe&&t.probe.score!=null);
  const avgMatch=probed.length?Math.round(probed.reduce((s,t)=>s+t.probe.score,0)/probed.length):0;
  const tok=done.reduce((s,t)=>s+(t.tok?((t.tok.tin||0)+(t.tok.tout||0)):0),0);
  const degCnt=done.filter(t=>t.degraded).length;
  const h=nuwaHealth();
  const HC={ok:'#2BBE94',warn:'#F0B24C',bad:'#F25C82'};
  const TABS=[['obs','运行观测'],['review',pend?`复核队列 · ${pend}`:'复核队列'],['prompt','Prompt 模板'],['skills','角色库']];
  const tabbar=`<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">${TABS.map(([k,l])=>
    `<button class="btn btn-sm ${nuwaTab===k?'btn-primary':'btn-ghost'}" onclick="nuwaTabSwitch('${k}')">${l}</button>`).join('')}</div>`;
  let body='';
  if(nuwaTab==='obs'){
    body=`
    <div class="card" style="padding:13px 18px;margin-bottom:14px;border-left:4px solid ${HC[h.cls]}">
      <b style="font-size:13.5px">${h.cls==='ok'?'🟢 管线健康':h.cls==='warn'?'🟡 需要关注':'🔴 管线异常'}</b>
      <span style="font-size:12px;color:var(--ink-2);margin-left:10px">${h.text}</span>
    </div>
    <div class="kpis">
      ${kpi('🧪','蒸馏总次数',total,'次','var(--primary-soft)',`降级 ${degCnt} · 失败 ${done.filter(t=>t.distill&&!t.distill.ok).length} · 复核 ${pend}`)}
      ${kpi('🎯','平均置信度',avgConf,'/100','var(--mint-soft)','健康红线 60 · <60 直送复核')}
      ${kpi('🧫','黑盒匹配分',avgMatch,'/100','var(--sky-soft)',probed.length?`已评测 ${probed.length} 次 · 放行线 70`:'黑盒评测：3 实答 + 1 判卷')}
      ${kpi('⚡','管线 Tokens',fmtN(tok),'','var(--coral-soft)',total?`≈ ${fmtN(Math.round(tok/total))} / 次 · 典型 14 次调用`:'基础 10 + 黑盒 4 次调用')}
    </div>
    <div class="card" style="margin-bottom:14px"><div class="hd"><b>六路质量对比</b><span>近 20 次 · 「信息有限」率越低越好 · 维基命中率越高越好</span></div><div id="n-six"></div></div>
    <div class="card"><div class="hd"><b>Trace 运行记录</b><span>点击任意行展开节点瀑布图 · 支持单节点重跑</span></div><div id="n-list"></div></div>`;
  }else if(nuwaTab==='review'){
    body=`<div class="card"><div class="hd"><b>人工复核队列</b><span>置信度 &lt;60 或黑盒两轮 &lt;70 的任务在此审校 · 放行留痕</span></div><div id="n-review"></div></div>`;
  }else if(nuwaTab==='prompt'){
    body=YLN.nuwa.PROMPT_META.filter(m=>m.group!=='chat').map(m=>{
      const custom=YLN.nuwa.promptIsCustom(m.key);
      return `<div class="card" style="margin-bottom:14px"><div class="hd"><b>${m.label}</b><span>${m.desc}${custom?' · <b style="color:var(--primary)">已自定义</b>':''}</span></div>
      <textarea id="np-${m.key}" rows="${m.key==='six'?7:m.key==='distill'?8:5}" style="width:100%;font-size:11.5px;line-height:1.7;font-family:ui-monospace,Menlo,monospace;border:1px solid var(--line,#E5E7EB);border-radius:10px;padding:10px;background:var(--surface-2)">${esc(YLN.nuwa.getPrompt(m.key))}</textarea>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="nuwaPromptSave('${m.key}')">保存覆盖</button>
        <button class="btn btn-ghost btn-sm" onclick="nuwaPromptReset('${m.key}')">恢复默认</button>
        <span style="font-size:11px;color:var(--ink-3)">{{var}} 占位符请保持原样，两端（APP/后台）实时生效</span>
      </div></div>`;
    }).join('');
  }else{
    body=`<div class="card"><div class="hd"><b>角色库（SKILL.md 标准产物）</b><span>兼容诸子群聊调度引擎 · 可下载 / 复制</span></div><div id="n-skills"></div></div>`;
  }
  return tabbar+body;
}
function nuwaTabSwitch(k){nuwaTab=k;router()}
function renderNuwaSix(){
  const el=$('n-six');if(!el)return;
  const ts=nuwaTraces().filter(x=>x.done).slice(0,20);
  if(!ts.length){el.innerHTML='<p style="font-size:12px;color:var(--ink-3);padding:6px 0">暂无数据</p>';return}
  el.innerHTML=['works','talks','social','critic','decision','life'].map(id=>{
    let ok=0,wiki=0;
    ts.forEach(t=>{const n=(t.nodes||[]).find(x=>x.id==='six');const s=n&&n.six&&n.six[id];
      if(s){if(!s.limited)ok++;if(s.wiki)wiki++}});
    const lr=Math.round((1-ok/ts.length)*100),wr=Math.round(wiki/ts.length*100);
    const bar=(v,c)=>`<span style="flex:1;height:8px;background:var(--surface-2);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:${v}%;min-width:${v?2:0}px;background:${c};border-radius:99px"></span></span>`;
    return `<div style="display:flex;align-items:center;gap:10px;margin:9px 0">
      <b style="width:34px;font-size:12px">${NUWA_SIX_NAME[id]}</b>
      ${bar(lr,'#F0B24C')}${bar(wr,'#2BBE94')}
      <span style="width:128px;font-size:11px;color:var(--ink-3)">有限 ${lr}% · 维基 ${wr}%</span></div>`;
  }).join('');
}
const NUWA_STC={ok:'#2BBE94',degraded:'#F0B24C',fail:'#F25C82',review:'#8F6BD5',run:'#9AA3B2',skip:'#9AA3B2'};
function nuwaNodeSet(t,id,label,status,extra){
  const n=Object.assign({id,label,status},extra||{});
  const i=(t.nodes||[]).findIndex(x=>x.id===id);
  if(i>=0)t.nodes[i]=n;else t.nodes.push(n);
}
/* 终局状态机：人工终态（resolved/rejected）不覆盖 */
function nuwaRecompute(t){
  if(t.status==='resolved'||t.status==='rejected')return;
  if(!t.mind||(t.conf==null||t.conf<60)){t.status='review';t.reviewReason=!t.mind?'蒸馏无思维内核':`置信度 ${t.conf} < 60`;return}
  const sc=t.probe&&t.probe.score;
  if(sc==null){t.status='review';t.reviewReason='黑盒判卷通道异常';return}
  if(sc<70){t.status='review';t.reviewReason=`黑盒匹配分 ${sc} < 70`;return}
  t.status='ok';t.reviewReason=null;
}
function nuwaWaterfall(t){
  const total=Math.max(1,t.totalMs);
  const rerunIds=['six','distill','verify','sanitize','probe'];
  const rows=(t.nodes||[]).map(n=>{
    const pct=Math.max(3,Math.min(100,Math.round((n.ms||0)/total*100)));
    const c=NUWA_STC[n.status]||'#9AA3B2';
    const rr=rerunIds.includes(n.id)?`<button class="btn btn-xs" onclick="nuwaRerun('${t.id}','${n.id}')" title="重跑该节点及下游">↻</button>`:'';
    let extra='';
    if(n.id==='six'&&n.six){
      extra='六路：'+Object.keys(n.six).map(k=>{const s=n.six[k];
        return `<span style="display:inline-block;margin:1px 3px;padding:1px 7px;border-radius:99px;font-size:10.5px;background:${s.limited?'#F0B24C1A':'#2BBE941A'};color:${s.limited?'#B4780F':'#1F8A64'}">${NUWA_SIX_NAME[k]}${s.limited?'·有限':''}${s.wiki?'·维基':''}</span>`}).join('');
    }else if(n.id==='verify'){
      extra=`跨域 ${n.cross} · 生成力 ${n.gen} · 排他 ${n.excl} → 置信度 ${t.conf}`;
    }else if(n.id==='distill'){
      extra=n.ok?(n.status==='degraded'?'仅有风格壳，无思维内核':'思维内核完整'):'蒸馏返回空（网络 / Key 异常）';
    }else if(n.id==='sanitize'){
      extra=n.models?`思维内核入库：模型 ${n.models} 条`:'无内核可清洗';
    }else if(n.id==='probe'||n.id==='gate'){
      extra=n.id==='gate'?esc(n.reason||''):`匹配分 <b style="color:${n.score>=70?'#1F8A64':'#F25C82'}">${n.score==null?'—':n.score}</b>/70 线${n.issues&&n.issues.length?' · 扣分点：'+esc(n.issues.join('；')):''}`;
    }else if(n.id==='redistill'){
      extra=n.status==='ok'?'已带扣分点重蒸并复测':'重蒸失败，保留原产物送复核';
    }
    return `<div style="display:flex;align-items:center;gap:10px;margin:7px 0 2px">
      <b style="width:78px;font-size:12px">${esc(n.label)}</b>
      <span style="flex:1;height:9px;background:var(--surface-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;min-width:4px;background:${c};border-radius:99px"></span></span>
      <span style="width:58px;text-align:right;font-size:11px;color:var(--ink-2)">${((n.ms||0)/1000).toFixed(1)}s</span>
      <span style="width:26px">${rr}</span></div>
      ${extra?`<div style="margin:0 0 6px 88px;font-size:11px;color:var(--ink-3);line-height:1.8">${extra}</div>`:''}`;
  }).join('');
  const callNote=t.tok?`六路 6 + 蒸馏 1 + 验证 3${t.probe?' + 黑盒 4':''}${t.probe&&t.probe.retried?' + 回炉 5':''}${t.status==='review'&&t.probe==null?'（复核门槛：跳过黑盒）':''}`:'';
  const acts=t.mind?`<div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn btn-sm btn-primary" onclick="nuwaSkillFromTrace('${t.id}')">📄 生成 SKILL.md 入库</button>
      ${t.status==='review'?`<button class="btn btn-sm" onclick="nuwaReviewOpen('${t.id}')">🛠 复核审校放行</button>`:''}
    </div>`:'';
  const tok=t.tok?`<p style="margin:10px 0 2px;font-size:11px;color:var(--ink-3)">Token：输入 ${fmtN(t.tok.tin||0)} · 输出 ${fmtN(t.tok.tout||0)} · ${t.tok.calls||0} 次模型调用（${callNote}）</p>`:'';
  /* 黑盒评测 3 轮问答样例（实答实录，判卷证据） */
  const qa=(t.probe&&t.probe.qa&&t.probe.qa.length)?`<div style="margin:8px 0 2px;padding:10px 12px;background:var(--surface-2);border-radius:10px">
    ${t.probe.qa.map((x,i)=>`<p style="font-size:11px;line-height:1.8;margin:${i?7:0}px 0"><b style="color:var(--ink-2)">Q${i+1} · ${esc(x.q)}</b><br><span style="color:var(--ink-3)">↳ ${esc(x.a)}</span></p>`).join('')}</div>`:'';
  return `<div style="padding:10px 12px">${rows}${tok}${qa}${acts}</div>`;
}
function renderNuwaList(){
  const el=$('n-list');if(!el)return;
  const ts=nuwaTraces().filter(x=>x.done);
  if(!ts.length){el.innerHTML='<p style="font-size:12px;color:var(--ink-3);padding:6px 0">还没有运行记录 · 去「老友管理 → 新增老友 → 女娲蒸馏」跑一次，这里就会出现完整 Trace</p>';return}
  el.innerHTML=`<table class="tbl"><thead><tr><th>时间</th><th>对象</th><th>置信度</th><th>黑盒</th><th>总耗时</th><th>状态</th><th>Tokens</th></tr></thead><tbody>
  ${ts.slice(0,30).map(t=>{
    const fail=t.distill&&!t.distill.ok;
    const stTxt=t.status==='resolved'?'已放行':t.status==='rejected'?'已忽略':t.status==='review'?'复核中':fail?'失败':t.degraded?'有降级':'健康';
    const stc=t.status==='review'?'#8F6BD5':t.status==='resolved'?'#2BBE94':t.status==='rejected'?'#9AA3B2':fail?'#F25C82':t.degraded?'#F0B24C':'#2BBE94';
    const confc=t.conf>=80?'#1F8A64':t.conf>=60?'#B4780F':'#F25C82';
    const msc=t.probe&&t.probe.score!=null?(t.probe.score>=70?'#1F8A64':'#F25C82'):'#9AA3B2';
    return `<tr style="cursor:pointer" onclick="toggleTrace('${t.id}')">
      <td class="mut">${fmtDT(t.t0)}</td>
      <td><b style="font-weight:700">${esc(t.name)}</b>${t.dir?`<span class="mut" style="font-size:10.5px"> · ${esc(t.dir)}</span>`:''}</td>
      <td><span class="st" style="color:${confc};background:${confc}1A">${t.conf!=null?t.conf:'—'}</span></td>
      <td><span class="st" style="color:${msc};background:${msc}1A">${t.probe&&t.probe.score!=null?t.probe.score:'—'}</span></td>
      <td class="mut">${((t.totalMs||0)/1000).toFixed(1)}s</td>
      <td><span class="st" style="color:${stc};background:${stc}1A">${stTxt}</span></td>
      <td class="mut">${t.tok?fmtN((t.tok.tin||0)+(t.tok.tout||0)):'—'}</td></tr>
      <tr id="tr-${t.id}" hidden><td colspan="7" style="background:var(--surface-2)">${nuwaWaterfall(t)}</td></tr>`;
  }).join('')}</tbody></table>
  ${ts.length>30?`<p style="font-size:11px;color:var(--ink-3);margin-top:8px">展示最近 30 条 · 共 ${ts.length} 条（滚动保留 200 条）</p>`:''}`;
}
function toggleTrace(id){const el=$('tr-'+id);if(el)el.hidden=!el.hidden}
/* ---- 单节点重跑：重跑该节点及其下游（与 nuwaTrace 同一批 core 函数，调用真实发生） ---- */
const NUWA_CHAIN={six:['six','distill','verify','sanitize','probe'],distill:['distill','verify','sanitize','probe'],verify:['verify','probe'],sanitize:['sanitize','probe'],probe:['probe']};
const NUWA_EST={six:14,distill:8,verify:7,sanitize:4,probe:4};
async function nuwaRerun(tid,nid){
  const t=nuwaTraces().find(x=>x.id===tid);if(!t)return;
  const chain=NUWA_CHAIN[nid];
  if(!chain)return;
  const label=(t.nodes.find(n=>n.id===nid)||{}).label||nid;
  if(!confirm(`重跑「${label}」及其下游 ≈ ${NUWA_EST[nid]} 次模型调用，继续？`))return;
  YLN.nuwa.tokReset();
  try{
    for(const step of chain){
      if(step==='six'){
        toast('↻ 重跑六路采集…');
        const t0=Date.now();
        const cx=await YLN.nuwa.collectSix(t.in.name,t.in.dir,null);
        t.in.corpus=[t.in.userCorpus,cx.corpus].filter(Boolean).join('\n\n').slice(0,3000);
        const sixMap={};(cx.cards||[]).forEach(r=>{sixMap[r.id]={ok:!!r.ok,limited:!!r.limited,wiki:!!r.wiki,len:(r.text||'').length}});
        const allLimited=(cx.cards||[]).length>0&&cx.cards.every(r=>r.limited);
        nuwaNodeSet(t,'six','六路采集',allLimited?'fail':'ok',{ms:Date.now()-t0,six:sixMap});
      }else if(step==='distill'){
        toast('↻ 重跑女娲蒸馏…');
        const t0=Date.now();
        const j=await YLN.nuwa.distill({name:t.in.name,dir:t.in.dir,corpus:t.in.corpus});
        t.j=j;t.distill={ms:Date.now()-t0,ok:!!j,hasMind:!!(j&&j.mind)};
        nuwaNodeSet(t,'distill','女娲蒸馏',j?(j.mind?'ok':'degraded'):'fail',{ms:t.distill.ms,ok:!!j});
      }else if(step==='verify'){
        toast('↻ 重跑三路验证…');
        const t0=Date.now();
        const p=YLN.nuwa.verifyParts(t.j);
        const rr=await Promise.all([p.cross,p.gen,p.excl]);
        t.conf=Math.round((rr[0].score+rr[1].score+rr[2].score)/3);
        t.verify={ms:Date.now()-t0,cross:rr[0].score,gen:rr[1].score,excl:rr[2].score};
        nuwaNodeSet(t,'verify','三路验证','ok',{ms:t.verify.ms,cross:rr[0].score,gen:rr[1].score,excl:rr[2].score});
      }else if(step==='sanitize'){
        t.mind=YLN.nuwa.sanitize(t.j);
        t.sanitize=t.mind?{models:t.mind.models.length,heuristics:t.mind.heuristics.length,dna:t.mind.dna.length}:null;
        nuwaNodeSet(t,'sanitize','清洗回填',t.mind?'ok':'skip',{models:t.sanitize?t.sanitize.models:0});
      }else if(step==='probe'){
        if(!t.mind){nuwaNodeSet(t,'probe','黑盒评测','skip',{score:null,issues:['无思维内核']});break}
        toast('↻ 重跑黑盒评测…');
        const t0=Date.now();
        const pr=await YLN.nuwa.probe({name:t.in.name,field:t.j&&t.j.field,mind:t.mind});
        t.probe={score:pr.score,issues:pr.issues,
          qa:(pr.qa||[]).map(x=>({q:String(x.q||'').slice(0,80),a:String(x.a||'').slice(0,120)})),retried:false};
        nuwaNodeSet(t,'probe','黑盒评测',pr.degraded?'degraded':(pr.score>=70?'ok':'fail'),{ms:Date.now()-t0,score:pr.score,issues:pr.issues});
      }
    }
    nuwaRecompute(t);
    t.done=true;t.rerun={at:Date.now(),last:nid};
    YLN.nuwa.traceUpsert(t);
    toast(`↻ 重跑完成 · 状态：${t.status==='ok'?'通过':t.status==='review'?'进入复核':'—'}`);
    router();
  }catch(e){console.error('[nuwa-rerun]',e);toast('重跑失败：'+(e.message||'网络异常'))}
}
/* ---- 复核队列（可编辑字段后放行，留痕） ---- */
function renderNuwaReview(){
  const el=$('n-review');if(!el)return;
  const ts=nuwaTraces();
  const pend=ts.filter(t=>t.status==='review');
  const fin=ts.filter(t=>t.status==='resolved'||t.status==='rejected');
  const row=t=>{
    const msc=t.probe&&t.probe.score!=null?t.probe.score:'—';
    return `<tr>
      <td class="mut">${fmtDT(t.t0)}</td>
      <td><b>${esc(t.name)}</b>${t.dir?`<span class="mut" style="font-size:10.5px"> · ${esc(t.dir)}</span>`:''}</td>
      <td class="mut">${t.conf!=null?t.conf:'—'}</td>
      <td class="mut">${msc}</td>
      <td style="font-size:11.5px;color:#B4780F">${esc(t.reviewReason||'—')}</td>
      <td><button class="btn btn-xs btn-primary" onclick="nuwaReviewOpen('${t.id}')">审校放行</button></td></tr>`;
  };
  el.innerHTML=(pend.length?`<table class="tbl"><thead><tr><th>时间</th><th>对象</th><th>置信度</th><th>黑盒</th><th>进入原因</th><th>操作</th></tr></thead><tbody>${pend.map(row).join('')}</tbody></table>`
    :'<div class="empty"><div class="em">✅</div><p>没有待复核任务 · 置信度 ≥60 且黑盒 ≥70 的任务自动放行</p></div>')
    +(fin.length?`<p style="margin:14px 0 6px;font-size:12px;font-weight:700">处理留痕（${fin.length}）</p><table class="tbl"><thead><tr><th>时间</th><th>对象</th><th>结论</th><th>备注</th><th>处理时间</th></tr></thead><tbody>
      ${fin.map(t=>`<tr><td class="mut">${fmtDT(t.t0)}</td><td>${esc(t.name)}</td>
      <td><span class="st" style="color:${t.status==='resolved'?'#2BBE94':'#9AA3B2'};background:${t.status==='resolved'?'#2BBE941A':'#9AA3B21A'}">${t.status==='resolved'?'放行':'忽略'}</span></td>
      <td class="mut" style="font-size:11px">${esc((t.review&&t.review.note)||'—')}${t.review&&t.review.edited?' · 已人工修改':''}</td>
      <td class="mut">${t.review?fmtDT(t.review.at):'—'}</td></tr>`).join('')}</tbody></table>`:'');
}
function nuwaReviewOpen(tid){
  const t=nuwaTraces().find(x=>x.id===tid);if(!t)return;
  const j=t.j||{};const m=t.mind||{models:[],heuristics:[],dna:[],taboos:[],blind:'',bound:''};
  document.querySelector('#drawer .dh b').textContent=`复核审校 · ${t.name}`;
  $('d-body').innerHTML=`
    <p style="font-size:12px;color:#B4780F;margin:0 0 10px">⚠️ 进入原因：${esc(t.reviewReason||'—')} · 置信度 ${t.conf!=null?t.conf:'—'} · 黑盒 ${t.probe&&t.probe.score!=null?t.probe.score:'—'}</p>
    ${t.probe&&t.probe.issues&&t.probe.issues.length?`<p style="font-size:11.5px;color:var(--ink-2);margin:0 0 10px">判卷扣分点：${esc(t.probe.issues.join('；'))}</p>`:''}
    <div class="frow"><label>身份一句话</label><input id="rv-title" value="${esc(j.title||'')}"></div>
    <div class="frow"><label>分类</label><select id="rv-field">${CHAR_FIELDS.map(f=>`<option ${f===j.field?'selected':''}>${f}</option>`).join('')}</select></div>
    <div class="frow"><label>金句</label><input id="rv-quote" value="${esc(j.quote||'')}"></div>
    <div class="frow"><label>标签</label><input id="rv-tags" value="${esc((j.tags||[]).join('，'))}"></div>
    <div class="frow"><label>心智模型</label><textarea id="rv-models" rows="3">${esc((m.models||[]).map(x=>x.n+'|'+x.d).join('\n'))}</textarea></div>
    <div class="frow"><label>决策启发式</label><textarea id="rv-heur" rows="3">${esc((m.heuristics||[]).join('\n'))}</textarea></div>
    <div class="frow"><label>表达DNA</label><input id="rv-dna" value="${esc((m.dna||[]).join('，'))}"></div>
    <div class="frow"><label>禁忌/反模式</label><textarea id="rv-taboos" rows="2">${esc((m.taboos||[]).join('\n'))}</textarea></div>
    <div class="frow"><label>盲区</label><input id="rv-blind" value="${esc(m.blind||'')}"></div>
    <div class="frow"><label>诚实边界</label><input id="rv-bound" value="${esc(m.bound||'')}"></div>
    <div class="frow"><label>复核备注（留痕）</label><input id="rv-note" placeholder="本次改了什么 / 为什么放行"></div>
    <div class="dacts" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="nuwaResolve('${tid}',true,false)">放行（留痕）</button>
      <button class="btn btn-primary btn-sm" onclick="nuwaResolve('${tid}',true,true)">放行并入库官方老友</button>
      <button class="btn btn-ghost btn-sm" onclick="nuwaResolve('${tid}',false,false)">忽略</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDrawer()">取消</button>
    </div>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
function nuwaResolve(tid,accept,toCharLib){
  const ts=nuwaTraces();const t=ts.find(x=>x.id===tid);if(!t)return;
  const g=id=>($(id).value||'').trim();
  if(accept){
    const j=t.j||{};
    const models=g('rv-models')?g('rv-models').split('\n').map(l=>{const[a,...r]=l.split('|');return a&&a.trim()?{n:a.trim().slice(0,16),d:(r.join('|')||'').trim().slice(0,60)}:null}).filter(Boolean):[];
    const editedJ={title:g('rv-title')||j.title,field:g('rv-field')||j.field,quote:g('rv-quote')||j.quote,
      tags:g('rv-tags')?g('rv-tags').split(/[,，]/).map(s=>s.trim()).filter(Boolean):(j.tags||[]),
      mind:{models,heuristics:g('rv-heur')?g('rv-heur').split('\n').map(s=>s.trim().slice(0,60)).filter(Boolean):[],
        dna:g('rv-dna')?g('rv-dna').split(/[,，]/).map(s=>s.trim().slice(0,24)).filter(Boolean):[],
        taboos:g('rv-taboos')?g('rv-taboos').split('\n').map(s=>s.trim().slice(0,40)).filter(Boolean):[],
        blind:g('rv-blind').slice(0,60),bound:g('rv-bound').slice(0,60)}};
    const mind=YLN.nuwa.sanitize(editedJ);
    if(mind){t.mind=mind;t.j=editedJ;t.sanitize={models:mind.models.length,heuristics:mind.heuristics.length,dna:mind.dna.length}}
    t.status='resolved';
  }else{
    t.status='rejected';
  }
  t.review={at:Date.now(),by:'admin',note:g('rv-note'),edited:accept&&!!g('rv-models')};
  YLN.nuwa.traceUpsert(t);
  if(accept&&toCharLib){
    const j=t.j,cs=YLN.adminChars();
    const pal=CHAR_PALETTES[cs.length%CHAR_PALETTES.length];
    cs.push({id:'adm_'+Date.now().toString(36),short:j.title||t.name,name:t.name,title:j.title||'',emoji:'🪑',
      field:j.field||'智慧',quote:j.quote||'',tags:[...new Set(['复核放行',...(j.tags||[])])].slice(0,4),
      dir:t.dir||'',corpus:'',mind:t.mind,conf:t.conf,published:false,
      c1:pal[0],c2:pal[1],tint:pal[2],deep:pal[3],created:Date.now()});
    YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
    toast(`已放行并入库「${j.title||t.name}」（草稿，可到老友管理发布）`);
  }else{
    toast(accept?'已放行（留痕）':'已忽略（留痕）');
  }
  closeDrawer();router();
}
/* ---- Prompt 模板热编辑 ---- */
function nuwaPromptSave(key){
  if(YLN.nuwa.setPrompt(key,$('np-'+key).value)){toast('Prompt 已保存覆盖 · 两端实时生效');router()}
  else toast('未知模板：'+key);
}
function nuwaPromptReset(key){
  YLN.nuwa.resetPrompt(key);toast('已恢复出厂默认');router();
}
/* ================= Prompt 管理：聊天人设模板热编辑 + 单老友覆盖 + 组装调试台 ================= */
function pPrompts(){
  const metas=YLN.nuwa.PROMPT_META.filter(m=>m.group==='chat');
  const tplCards=metas.map(m=>{
    const custom=YLN.nuwa.promptIsCustom(m.key);
    return `<div class="card" style="margin-bottom:14px"><div class="hd"><b>${m.label}</b><span>${m.desc}${custom?' · <b style="color:var(--primary)">已自定义</b>':''}</span></div>
    <textarea id="np-${m.key}" rows="${m.rows||4}" style="width:100%;font-size:11.5px;line-height:1.7;font-family:ui-monospace,Menlo,monospace;border:1px solid var(--line,#E5E7EB);border-radius:10px;padding:10px;background:var(--surface-2)">${esc(YLN.nuwa.getPrompt(m.key))}</textarea>
    <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="nuwaPromptSave('${m.key}')">保存覆盖</button>
      <button class="btn btn-ghost btn-sm" onclick="nuwaPromptReset('${m.key}')">恢复默认</button>
      <span style="font-size:11px;color:var(--ink-3)">{{var}} 占位符请保持原样 · APP 端下一句话立即生效</span>
    </div></div>`;
  }).join('');
  const ovChars=adminChars().filter(c=>c.promptSys&&String(c.promptSys).trim());
  const aiChars=adminChars().filter(c=>!c.human);
  return `
  <div class="card" style="padding:13px 18px;margin-bottom:14px;border-left:4px solid var(--primary)">
    <b style="font-size:13.5px">聊天 Prompt 体系</b>
    <span style="font-size:12px;color:var(--ink-2);margin-left:10px">人设模板 × 2 变体 + 场景插话指令 × 3 + 纪要 × 1 · 组装优先级：单老友覆盖 &gt; 思维内核版 &gt; 语录版 · 女娲管线模板在「女娲管线 → Prompt 模板」</span>
  </div>
  ${tplCards}
  <div class="card" style="margin-bottom:14px"><div class="hd"><b>单老友 Prompt 覆盖</b><span>编辑入口在「老友管理」抽屉底部 · 覆盖后该老友所有群聊/单聊直接使用这段 system Prompt</span></div>
    ${ovChars.length?`<table class="tbl"><thead><tr><th>老友</th><th>覆盖内容（前 80 字）</th><th>操作</th></tr></thead><tbody>
      ${ovChars.map(c=>`<tr><td><b>${esc(c.short)}</b></td><td class="mut" style="font-size:11.5px">${esc(String(c.promptSys).replace(/\s+/g,' ').slice(0,80))}…</td>
      <td><button class="btn btn-xs" onclick="charEdit('${c.id}')">编辑</button>
      <button class="btn btn-xs" style="color:#E05A4E;border-color:#E05A4E" onclick="charPromptClear('${c.id}')">清除覆盖</button></td></tr>`).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">🧩</div><p>暂无单老友覆盖 · 所有老友都走全局模板</p></div>`}
  </div>
  <div class="card"><div class="hd"><b>组装调试台</b><span>选角色 + 场景 → 预览最终 messages → 真实调用验证效果</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <select id="pd-char" onchange="pdRefresh()" style="min-width:170px">${aiChars.map(c=>`<option value="${c.id}">${esc(c.short)}（${esc(c.field||'')}）</option>`).join('')}</select>
      <select id="pd-scene" onchange="pdRefresh()">
        <option value="group">圆桌插话</option>
        <option value="solo">一对一私聊</option>
        <option value="demo">演示桌观众插话</option>
      </select>
      <input id="pd-user" value="小Moon" placeholder="用户昵称" style="width:110px" oninput="pdRefresh()">
      <input id="pd-topic" value="AI 时代普通人的最大机会在哪里" placeholder="话题（圆桌场景用）" style="flex:1;min-width:170px" oninput="pdRefresh()">
    </div>
    <div id="pd-out"></div>
    <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
      <button class="btn btn-primary btn-sm" id="pd-run" onclick="pdRun()">▶ 真实调用测试</button>
      <span id="pd-status" style="font-size:11.5px;color:var(--ink-3)">直接走本机 DeepSeek Key · 不扣用户积分</span>
    </div>
    <pre id="pd-reply" style="display:none;margin:10px 0 0;padding:12px;background:var(--surface-2);border-radius:10px;font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word"></pre>
  </div>`;
}
function pdChar(){ const el=$('pd-char');return el?adminChars().find(c=>c.id===el.value)||null:null }
/* 与 APP 端 sendUserMsg 同构的 user 消息组装：topicLine + 示例对话占位 + askLine（模板实时读） */
function pdBuildUser(){
  const scene=$('pd-scene').value,user=($('pd-user').value||'').trim()||'用户';
  const topic=($('pd-topic').value||'').trim();
  const topicLine=scene==='solo'?'这是一对一私聊，不是圆桌辩论。'
    :(topic?`圆桌话题：「${topic}」。`:'这是一场自由圆桌，暂无预设主题，请顺着对话自然接话。');
  const c=pdChar();
  const hist=`你：最近总觉得时间不够用，怎么办\n${c?c.short:'TA'}：先把时间切成块，再谈效率`;
  return {user,userMsg:`${topicLine}\n最近的对话：\n${hist}\n\n${YLN.nuwa.askLineBuild(scene,user)}`};
}
function pdRefresh(){
  const el=$('pd-out');if(!el)return;
  const c=pdChar();
  const sys=c?YLN.nuwa.personaSysBuild(c):'（先在「老友管理」创建老友）';
  const {userMsg}=pdBuildUser();
  const ov=c&&c.promptSys&&String(c.promptSys).trim();
  el.innerHTML=`
    <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:4px">SYSTEM · ${esc(c?c.short:'—')}${ov?' · <b style="color:var(--primary)">单老友覆盖生效</b>':(c&&c.mind?' · 思维内核版模板':' · 语录版模板')}</div>
    <pre style="margin:0 0 10px;padding:12px;background:var(--surface-2);border-radius:10px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word">${esc(sys)}</pre>
    <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:4px">USER · 最终发送的消息（示例对话仅作占位）</div>
    <pre style="margin:0;padding:12px;background:var(--surface-2);border-radius:10px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word">${esc(userMsg)}</pre>`;
}
function renderPrompts(){ pdRefresh() }
async function pdRun(){
  const c=pdChar();
  if(!c){toast('先在「老友管理」创建老友');return}
  let hasKey=false;try{hasKey=!!(localStorage.getItem('ds_api_key')||'').trim()}catch(e){}
  if(!hasKey){toast('本浏览器未配置 DeepSeek Key（与手机端同源共享，先去 setkey.html 配置）');return}
  const sys=YLN.nuwa.personaSysBuild(c);
  const {userMsg}=pdBuildUser();
  const btn=$('pd-run'),st=$('pd-status'),rp=$('pd-reply');
  btn.disabled=true;btn.textContent='调用中…';st.textContent='DeepSeek 调用中…';
  rp.style.display='block';rp.textContent='…';
  try{
    const out=await YLN.llm([{role:'system',content:sys},{role:'user',content:userMsg}],{temp:0.85});
    rp.textContent=out||'（空回复）';
    st.textContent=`调用成功 · 返回 ${(out||'').length} 字 · 与 APP 端同一条 core 通道`;
  }catch(e){
    rp.textContent='调用失败：'+(e.message||e);
    st.textContent='调用失败（检查 Key / 网络）';
  }
  btn.disabled=false;btn.textContent='▶ 真实调用测试';
}
function charPromptClear(id){
  const cs=adminChars(),i=cs.findIndex(c=>c.id===id);if(i<0)return;
  if(!confirm(`清除「${cs[i].short}」的单老友 Prompt 覆盖？\n清除后恢复使用全局模板（Prompt 管理页）。`))return;
  delete cs[i].promptSys;YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
  toast('已清除覆盖，恢复全局模板');router();
}
/* ---- 角色库（SKILL.md） ---- */
let _skillsCache=null;
function renderNuwaSkills(){
  const el=$('n-skills');if(!el)return;
  el.innerHTML='<p style="font-size:12px;color:var(--ink-3);padding:6px 0">加载中…</p>';
  YLN.nuwa.skillsList().then(list=>{
    _skillsCache=list||[];
    if(!_skillsCache.length){el.innerHTML='<div class="empty"><div class="em">📄</div><p>角色库还是空的 · 在 Trace 瀑布图里点「生成 SKILL.md 入库」</p></div>';return}
    el.innerHTML=`<table class="tbl"><thead><tr><th>角色</th><th>skill_id</th><th>版本</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
      ${_skillsCache.map(s=>`<tr>
        <td><b>${esc(s.name)}</b></td><td class="mut" style="font-size:11px">${esc(s.id)}</td><td class="mut">${esc(s.version||'v1.0')}</td>
        <td class="mut">${fmtDT(s.created||Date.now())}</td>
        <td><button class="btn btn-xs" onclick="nuwaSkillView('${s.id}')">查看</button>
            <button class="btn btn-xs" onclick="nuwaSkillDownload('${s.id}')">下载</button>
            <button class="btn btn-xs" onclick="nuwaSkillDel('${s.id}')">删除</button></td></tr>`).join('')}</tbody></table>`;
  });
}
function nuwaSkillFromTrace(tid){
  const t=nuwaTraces().find(x=>x.id===tid);if(!t||!t.mind){toast('该 Trace 无思维内核，无法生成');return}
  const s={id:'sk_'+t.id,name:t.name,version:'v1.0',created:Date.now(),
    skillMd:YLN.nuwa.renderSkillMd({name:t.name,mind:t.mind})};
  YLN.nuwa.skillSave(s).then(()=>{toast(`「${t.name}」SKILL.md 已入库角色库`);nuwaTab='skills';router()});
}
function nuwaSkillView(id){
  const s=(_skillsCache||[]).find(x=>x.id===id);if(!s)return;
  document.querySelector('#drawer .dh b').textContent=`SKILL.md · ${s.name}`;
  $('d-body').innerHTML=`
    <pre style="white-space:pre-wrap;font-size:11.5px;line-height:1.8;background:var(--surface-2);border-radius:10px;padding:12px;max-height:60vh;overflow:auto;font-family:ui-monospace,Menlo,monospace">${esc(s.skillMd)}</pre>
    <div class="dacts" style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="nuwaSkillCopy('${s.id}')">复制全文</button>
      <button class="btn btn-ghost btn-sm" onclick="nuwaSkillDownload('${s.id}')">下载 .md</button>
    </div>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
function nuwaSkillCopy(id){
  const s=(_skillsCache||[]).find(x=>x.id===id);if(!s)return;
  (navigator.clipboard?navigator.clipboard.writeText(s.skillMd):Promise.reject()).then(()=>toast('已复制到剪贴板')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=s.skillMd;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('已复制到剪贴板')}catch(e){toast('复制失败，请手动选择')}ta.remove();
  });
}
function nuwaSkillDownload(id){
  const s=(_skillsCache||[]).find(x=>x.id===id);if(!s)return;
  const blob=new Blob([s.skillMd],{type:'text/markdown'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`SKILL-${s.name||s.id}.md`;a.click();URL.revokeObjectURL(a.href);
  toast('已下载 '+a.download);
}
function nuwaSkillDel(id){
  const s=(_skillsCache||[]).find(x=>x.id===id);if(!s)return;
  if(!confirm(`从角色库删除「${s.name}」？`))return;
  YLN.nuwa.skillDel(id).then(()=>{toast('已删除');renderNuwaSkills()});
}
function renderNuwa(){
  /* 首次进入先拉服务端 Trace 合并，完成后重渲整页（否则健康横幅/KPI 停留在同步前空数据） */
  if(!nuwaSynced){nuwaSynced=true;YLN.nuwa.traceSync().then(()=>router()).catch(()=>{})}
  if(nuwaTab==='obs'){renderNuwaSix();renderNuwaList()}
  else if(nuwaTab==='review')renderNuwaReview();
  else if(nuwaTab==='skills')renderNuwaSkills();
}

/* ============ 页面：老友管理 ============ */
const CHAR_FIELDS=['科技','商业','智慧','创作','生涯']; /* 与 yln-core 蒸馏 prompt / 手机端 FIELDS 对齐（原错版含幽灵分类'情感'） */
const CHAR_PALETTES=[['#B8C9F5','#5B7BD5','#EAF0FB','#3D5EA8'],['#F5C9D8','#D56B93','#FBEFF3','#B04873'],['#C9E8D8','#5BAF85','#EDF8F2','#2F7A5F'],['#F5E3B8','#D5A75B','#FBF4E6','#A87A2F'],['#D9C9F5','#8F6BD5','#F2EDFB','#6B4AA8'],['#C9E3F5','#5B9BD5','#EDF5FB','#2F72A8']];
const adminChars=()=>YLN.adminChars();
function pChars(){
  const cs=adminChars(),pub=cs.filter(c=>c.published).length;
  return `
  <div class="kpis">
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--primary-soft)">🪑</span>老友总数</span><p class="v">${cs.length}</p><p class="sub">官方产出 · 含草稿</p><span class="deco" style="background:var(--primary)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--mint-soft)">📣</span>已发布</span><p class="v">${pub}</p><p class="sub">手机端老友库实时可见</p><span class="deco" style="background:var(--mint)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--sun-soft)">📝</span>草稿</span><p class="v">${cs.length-pub}</p><p class="sub">仅后台可见</p><span class="deco" style="background:var(--sun)"></span></div>
  </div>
  <div class="card">
    <div class="hd"><b>官方老友</b><button class="btn btn-primary btn-sm" onclick="charEdit(null)">＋ 新增老友</button></div>
    <div id="c-table"></div>
  </div>`;
}
function renderChars(){
  const cs=adminChars().filter(c=>!c.human);   /* 真人好友归「真人好友管理」菜单，此处只管 AI 老友 */
  $('c-table').innerHTML=cs.length?`<table class="tbl"><thead><tr>
    <th style="min-width:180px">老友</th><th>身份</th><th>分类</th><th>标签</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
    ${cs.map(c=>`<tr>
      <td><div class="ucell"><span class="av" style="background:linear-gradient(135deg,${c.c1||'#C9E3F5'},${c.c2||'#5B9BD5'})">${esc(((c.short||c.name||'友').trim()[0])||'友')}</span><div><b>${esc(c.short)}${c.source==='builtin'?' <span class="st free" style="margin-left:4px;font-size:10px;white-space:nowrap;vertical-align:1px">出厂</span>':''}</b><span>${esc(c.name)}</span></div></div></td>
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
/* ===== 真人好友 = 注册用户（不手工生成；对注册用户数据做二次管理：上架为真友进手机端） ===== */
function realFriendOf(uid){return adminChars().find(c=>c.human&&(c.uid===uid||c.id==='rf_'+uid))}
function pRealChars(){
  const us=users(),rf=us.map(u=>realFriendOf(u.id)).filter(Boolean),pub=rf.filter(c=>c.published).length;
  return `
  <div class="kpis">
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--sky-soft)">👥</span>注册用户</span><p class="v">${us.length}</p><p class="sub">真人好友的唯一来源</p><span class="deco" style="background:var(--sky)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--primary-soft)">🤝</span>已上架真友</span><p class="v">${rf.length}</p><p class="sub">rf_&lt;uid&gt; 与用户稳定映射</p><span class="deco" style="background:var(--primary)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--mint-soft)">✅</span>已发布</span><p class="v">${pub}</p><p class="sub">手机端「真友」分类实时可见</p><span class="deco" style="background:var(--mint)"></span></div>
  </div>
  <div class="card">
    <div class="hd"><b>注册用户 → 真友</b><span id="r-count"></span></div>
    <div id="r-table"></div>
  </div>
  <p class="mut" style="font-size:12px;margin-top:10px">真人好友即注册用户的二次身份：上架后手机端「真友」分类与开桌候选可见，上桌作为旁听成员，不生成 AI 台词；下架/取消即时同步服务器。</p>`;
}
function renderRealChars(){
  const us=users();
  $('r-count').textContent=`共 ${us.length} 位用户`;
  $('r-table').innerHTML=us.length?`<table class="tbl"><thead><tr>
    <th>用户</th><th>真友身份</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
    ${us.map(u=>{
      const c=realFriendOf(u.id);
      return `<tr>
      <td><div class="ucell">${ava(u.nick)}<div><b>${esc(u.nick)}</b><span>${esc(u.email)}</span></div></div></td>
      <td>${c?esc(c.title||'真友'):'<span class="mut">未设置</span>'}${c&&c.dir?`<span class="mut" style="display:block;font-size:11px">${esc(c.dir)}</span>`:''}</td>
      <td class="mut">${fmtT(u.created||Date.now())}</td>
      <td>${!c?`<button class="btn btn-xs btn-primary" onclick="realFriendEdit('${u.id}')">设为真友</button>`
        :`<button class="btn btn-xs" onclick="realFriendEdit('${u.id}')">编辑</button>
          <button class="btn btn-xs" onclick="realFriendToggle('${u.id}')">${c.published?'下架':'发布'}</button>
          <button class="btn btn-xs" onclick="realFriendRemove('${u.id}')">取消真友</button>`}</td>
    </tr>`}).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">🫂</div><p>还没有注册用户 · 真人好友来自官网/手机端注册账号</p></div>`;
}
let rfUid=null;
function realFriendEdit(uid){
  rfUid=uid;const u=users().find(x=>x.id===uid);if(!u)return;
  const had=!!realFriendOf(uid),c=realFriendOf(uid)||{};
  document.querySelector('#drawer .dh b').textContent=had?'编辑真友资料':'设为真友';
  $('d-body').innerHTML=`
    <div class="duser">${ava(u.nick,56)}<div><b style="font-size:16px">${esc(u.nick)}</b>
      <p style="font-size:12px;color:var(--ink-3);margin-top:3px">${esc(u.email)}</p></div></div>
    <p class="dsec">真友资料（昵称沿用注册账号，此处补充身份）</p>
    <div class="frow"><label>真友身份</label><input id="rf-title" value="${esc(c.title||'')}" placeholder="如：真友 · 品牌设计师"></div>
    <div class="frow"><label>方向（可选）</label><input id="rf-dir" value="${esc(c.dir||'')}" placeholder="如：一起健身 / 聊职业发展"></div>
    <div class="frow"><label>发布状态</label><select id="rf-pub"><option value="1" ${c.published?'selected':''}>已发布 · 手机端可见</option><option value="0" ${c.published?'':'selected'}>下架 · 仅后台</option></select></div>
    <div class="dacts"><button class="btn btn-primary btn-sm" onclick="realFriendSave()">${had?'保存修改':'设为真友'}</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDrawer()">取消</button></div>
    <p style="font-size:11.5px;color:var(--ink-3);margin:0">上桌后作为旁听成员，不生成 AI 台词。</p>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
function realFriendSave(){
  const u=users().find(x=>x.id===rfUid);if(!u)return;
  const g=id=>{const el=$(id);return el?(el.value||'').trim():''};
  const cs=adminChars();
  const i=cs.findIndex(c=>c.human&&(c.uid===rfUid||c.id==='rf_'+rfUid));
  const id='rf_'+rfUid;   /* 稳定映射：一个用户一条真友档案 */
  const base={short:u.nick||'真友',name:u.email||u.nick||'真友',title:g('rf-title')||'真友',emoji:'🫂',
    field:'真友',quote:'「 来，面对面聊聊才算真朋友。」',tags:['真人'],
    dir:g('rf-dir'),corpus:'',mind:null,human:true,uid:rfUid,
    published:g('rf-pub')==='1'};
  if(i>=0){cs[i]={...cs[i],...base};toast(`「${base.short}」真友资料已更新，手机端${base.published?'同步生效':'已下架'}`)}
  else{
    const pal=CHAR_PALETTES[cs.length%CHAR_PALETTES.length];
    cs.push({id,...base,c1:pal[0],c2:pal[1],tint:pal[2],deep:pal[3],created:Date.now()});
    toast(`「${base.short}」已设为真友${base.published?'，手机端真友可见 ✦':''}`);
  }
  YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);closeDrawer();router();
}
function realFriendToggle(uid){
  const cs=adminChars(),i=cs.findIndex(c=>c.human&&(c.uid===uid||c.id==='rf_'+uid));if(i<0)return;
  cs[i].published=!cs[i].published;YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
  toast(cs[i].published?`「${cs[i].short}」已发布，手机端真友可见 ✦`:`「${cs[i].short}」已下架`);
  router();
}
function realFriendRemove(uid){
  const cs=adminChars(),i=cs.findIndex(c=>c.human&&(c.uid===uid||c.id==='rf_'+uid));if(i<0)return;
  const c=cs[i];
  if(!confirm(`确定取消「${c.short}」的真友身份？手机端将不再展示`))return;
  cs.splice(i,1);YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
  toast(`「${c.short}」已取消真友身份`);router();
}
let charEditing=null,charHumanMode=false;
function charEdit(id,opts){
  charEditing=id?adminChars().find(c=>c.id===id):null;aiConf=null;
  charHumanMode=!!(opts&&opts.human)||(charEditing&&!!charEditing.human);   /* 新增入口指定 or 编辑已有真人自动进入 */
  const c=charEditing||{short:'',name:'',title:'',emoji:'🙂',field:charHumanMode?'真友':'智慧',quote:'',tags:[],published:false};
  document.querySelector('#drawer .dh b').textContent=charEditing?(charHumanMode?'编辑真人好友':'编辑老友'):(charHumanMode?'新增真人好友':'新增官方老友');
  const mind=c.mind||{models:[],heuristics:[],dna:[],taboos:[],blind:'',bound:''};
  const advCommon=`
      <div class="frow"><label>发布状态</label><select id="cf-pub"><option value="1" ${c.published?'selected':''}>已发布 · 手机端可见</option><option value="0" ${c.published?'':'selected'}>草稿 · 仅后台</option></select></div>
      <div class="frow"><label>全名</label><input id="cf-name" value="${esc(c.name||'')}" placeholder="${charHumanMode?'如：陈晓茶':'如：彼得·德鲁克'}"></div>
      <div class="frow"><label>身份</label><input id="cf-title" value="${esc(c.title||'')}" placeholder="${charHumanMode?'如：真友 · 品牌设计师':'如：现代管理学之父'}"></div>
      <div class="frow"><label>Emoji</label><input id="cf-emoji" value="${c.emoji||'🙂'}" maxlength="4"></div>
      <div class="frow"><label>一句话</label><input id="cf-quote" value="${esc(c.quote||'')}" placeholder="TA 的招牌金句 / 座右铭"></div>
      <div class="frow"><label>标签</label><input id="cf-tags" value="${esc((c.tags||[]).join('，'))}" placeholder="逗号分隔，如：${charHumanMode?'真人,设计师,深夜聊客':'官方精选,目标管理'}"></div>`;
  $('d-body').innerHTML=charHumanMode?`
    <p class="dsec">真人好友（实名 · 上桌旁听，不生成 AI 台词）</p>
    <div class="frow"><label>显示名 *</label><input id="cf-short" value="${esc(c.short)}" placeholder="TA 平时被叫什么，如：阿茶"></div>
    <div class="frow"><label>方向（可选）</label><input id="cf-dir" value="${esc(c.dir||'')}" placeholder="如：品牌设计 / 一起健身 / 旅居大理"></div>
    <div class="frow"><label>背景介绍（可选）</label><textarea id="cf-corpus" rows="3" placeholder="TA 的近况、共同经历、聊天偏好（可留空）">${esc(c.corpus||'')}</textarea></div>
    <div class="dacts"><button class="btn btn-primary btn-sm" onclick="charSave()">${charEditing?'保存修改':'保存真人好友'}</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDrawer()">取消</button></div>
    <p style="font-size:11.5px;color:var(--ink-3);margin:0 0 4px">保存后手机端「真友」分类实时可见，可把 TA 与 AI 老友拉进同一场圆桌。</p>
    <details class="adv" ${charEditing?'open':''}>
      <summary>高级 · 资料补充（全部可选）</summary>
      ${advCommon}
      <p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">🎨 头像配色由系统自动分配，保持全站和谐</p>
      <div class="dacts"><button class="btn btn-primary btn-sm" onclick="charSave()">${charEditing?'保存修改':'保存真人好友'}</button></div>
    </details>`:`
    <p class="dsec">极简开捏（默认只填这里，其余交给女娲）</p>
    <div class="frow"><label>显示名 *</label><input id="cf-short" value="${esc(c.short)}" placeholder="如：德鲁克"></div>
    <div class="frow"><label>方向（可选）</label><input id="cf-dir" value="${esc(c.dir||'')}" placeholder="如：考研英语 / 诗人 / 商业导师"></div>
    <div class="frow"><label>分类</label><select id="cf-field">${CHAR_FIELDS.map(f=>`<option ${f===c.field?'selected':''}>${f}</option>`).join('')}</select></div>
    <div class="frow"><label>语料（可选）</label><textarea id="cf-corpus" rows="3" placeholder="粘贴 TA 的访谈/文章/课程片段，蒸馏会更真（可留空）">${esc(c.corpus||'')}</textarea></div>
    <div class="dacts"><button class="btn btn-primary btn-sm" id="cf-ai" onclick="charAIFill()">🔥 女娲蒸馏</button>
      <button class="btn btn-ghost btn-sm" onclick="closeDrawer()">取消</button></div>
    <p id="cf-conf" style="font-size:11.5px;color:var(--ink-3);margin:0 0 4px">全管线：六路采集 → 蒸馏 → 三路验证（与手机端同一条 core 管线）</p>
    <p style="font-size:11.5px;color:var(--ink-3);margin:0 0 4px">蒸馏完成后自动展开高级区，审校无误再保存发布。</p>
    <details class="adv" id="cf-adv" ${charEditing?'open':''}>
      <summary>高级 · 蒸馏产物审校（全部可选）</summary>
      ${advCommon}
      <div class="frow"><label>心智模型</label><textarea id="cf-models" rows="3" placeholder="每行一个：模型名|TA 怎么用它">${esc((mind.models||[]).map(m=>m.n+'|'+m.d).join('\n'))}</textarea></div>
      <div class="frow"><label>决策启发式</label><textarea id="cf-heur" rows="3" placeholder="每行一条：场景→TA 的决策规则">${esc((mind.heuristics||[]).join('\n'))}</textarea></div>
      <div class="frow"><label>表达DNA</label><input id="cf-dna" value="${esc((mind.dna||[]).join('，'))}" placeholder="逗号分隔 3 个语言指纹"></div>
      <div class="frow"><label>禁忌/反模式</label><textarea id="cf-taboos" rows="2" placeholder="每行一条：TA 绝不会说的话/做的事">${esc((mind.taboos||[]).join('\n'))}</textarea></div>
      <div class="frow"><label>盲区</label><input id="cf-blind" value="${esc(mind.blind||'')}" placeholder="TA 的盲区/反模式一句话"></div>
      <div class="frow"><label>诚实边界</label><input id="cf-bound" value="${esc(mind.bound||'')}" placeholder="哪些是推演/语料未覆盖"></div>
      <div class="frow"><label>Prompt 覆盖</label><div>
        <textarea id="cf-prompt" rows="4" placeholder="留空 = 用全局模板（Prompt 管理页）。填写后该老友所有群聊/单聊直接使用这段 system Prompt">${esc(c.promptSys||'')}</textarea>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn btn-xs" type="button" onclick="charPromptPreview()">预览全局模板组装</button>
          <span style="font-size:11px;color:var(--ink-3)">优先级：此覆盖 &gt; 全局模板 · 实测请到「Prompt 管理」调试台</span>
        </div>
        <pre id="cf-prompt-pv" style="display:none;margin:8px 0 0;padding:12px;background:var(--surface-2);border-radius:10px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word"></pre>
      </div></div>
      <p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">🎨 头像配色由系统自动分配，保持全站和谐</p>
      <div class="dacts"><button class="btn btn-primary btn-sm" onclick="charSave()">${charEditing?'保存修改':'保存老友'}</button></div>
    </details>`;
  $('veil').classList.add('on');$('drawer').classList.add('on');
}
/* ===== 女娲蒸馏（审校器主按钮：与手机端完全同一条全管线：六路采集→蒸馏→三路验证→sanitize） ===== */
let aiFilling=false,aiConf=null;
async function charAIFill(){
  if(aiFilling)return;
  const g=id=>($(id).value||'').trim();
  const short=g('cf-short');
  if(!short){toast('先填显示名，女娲才知道蒸谁');return}
  /* 无 Key 前置拦截：就地弹框配置（setkey.html 与后台地址不同 origin 时不互通，此处直接解决） */
  let hasKey=false;try{hasKey=!!(localStorage.getItem('ds_api_key')||'').trim()}catch(e){}
  if(!hasKey){
    const k=(prompt('本浏览器还没配置 DeepSeek Key（setkey.html 与后台地址不同则不互通）。请粘贴 sk- 开头的密钥，只存本机：')||'').trim();
    if(!k)return;
    if(!k.startsWith('sk-')){toast('Key 格式不对：应以 sk- 开头');return}
    try{localStorage.setItem('ds_api_key',k)}catch(e){}
    toast('Key 已存本机 ✓ 再点一次「女娲蒸馏」');
    return;
  }
  const btn=$('cf-ai'),confEl=$('cf-conf');aiFilling=true;btn.disabled=true;
  const setBtn=t=>btn.textContent=t;
  try{
    /* 全管线观测版：六路采集→蒸馏→三路验证→sanitize 全程自动打点（yln_nuwa_traces） */
    let cDone=0;setBtn('🔎 六路采集 0/6…');
    const out=await YLN.nuwa.nuwaTrace({
      name:short,dir:g('cf-dir'),corpus:g('cf-corpus'),
      onEach:()=>{cDone++;setBtn(`🔎 六路采集 ${cDone}/6…`)},
      onNode:n=>{ if(n.id==='six')setBtn('⏳ 女娲蒸馏中…'); else if(n.id==='distill')setBtn('🛡 三路验证中…'); else if(n.id==='verify')setBtn('🧫 黑盒评测中…'); else if(n.id==='redistill')setBtn('🔥 回炉重蒸中…'); else if(n.id==='probe')setBtn('✨ 收尾中…') }
    });
    const j=out.j;
    if(!j)throw new Error('蒸馏返回为空（可能网络超时），请重试');
    const rr=out.rr,deg=out.deg;aiConf=out.conf;
    /* 回填表单（mind 走 core sanitize，与手机端入库规格一致：models≤4/heur≤4/dna≤3） */
    if(j.title)$('cf-title').value=j.title;
    if(j.quote)$('cf-quote').value=j.quote;
    if(Array.isArray(j.tags)&&j.tags.length)$('cf-tags').value=j.tags.join('，');
    if(!charEditing&&j.field&&CHAR_FIELDS.includes(j.field))$('cf-field').value=j.field;
    const mind=YLN.nuwa.sanitize(j);
    if(mind){
      $('cf-models').value=(mind.models||[]).map(m=>(m.n||'')+'|'+(m.d||'')).join('\n');
      $('cf-heur').value=(mind.heuristics||[]).join('\n');
      $('cf-dna').value=(mind.dna||[]).join('，');
      $('cf-taboos').value=(mind.taboos||[]).join('\n');
      $('cf-blind').value=mind.blind||'';
      $('cf-bound').value=mind.bound||'';
    }
    const adv=$('cf-adv');if(adv)adv.open=true; /* 蒸馏完自动展开，进入审校 */
    const matchTxt=out.match!=null?` · 黑盒 ${out.match}/100${out.retried?'（回炉重蒸后）':''}`:'';
    const rvTxt=out.status==='review'?` · <span style="color:#8F6BD5">已进入复核队列（${esc((out.issues&&out.issues[0])||'')}），可修改后保存或到「女娲管线 → 复核队列」放行</span>`:'';
    if(confEl)confEl.innerHTML=`本次置信度：<b style="color:var(--primary)">${aiConf}</b>/100（跨域${rr[0].score} · 生成力${rr[1].score} · 排他${rr[2].score}）${matchTxt}${deg?' · <span style="color:#F25C82">已降级，建议补语料重蒸</span>':''}${rvTxt}`;
    toast(`🔥 女娲全管线完成 · 置信度 ${aiConf}/100${out.match!=null?` · 黑盒 ${out.match}/100`:''}${deg?'（降级）':''}`);
  }catch(e){console.error('[admin-nuwa]',e);aiConf=null;if(confEl)confEl.textContent='蒸馏失败：'+(e.message||'网络异常');toast('女娲蒸馏失败：'+(e.message||'网络异常')+'，可手填后保存')}
  aiFilling=false;btn.textContent='🔥 女娲蒸馏';btn.disabled=false;
}
/* 老友编辑抽屉：预览「不填覆盖时」全局模板对该角色的组装效果，方便决定要不要覆盖；实际发送内容=覆盖文本本身 */
function charPromptPreview(){
  const g=id=>{const el=$(id);return el?(el.value||'').trim():''};
  const c={name:g('cf-name')||g('cf-short')||'（未填）',title:g('cf-title'),quote:g('cf-quote'),
    tags:g('cf-tags')?g('cf-tags').split(/[,，]/).map(s=>s.trim()).filter(Boolean):[],
    mind:(g('cf-models')||g('cf-heur'))?{
      models:g('cf-models')?g('cf-models').split('\n').map(l=>{const[a,...r]=l.split('|');return a&&a.trim()?{n:a.trim(),d:(r.join('|')||'').trim()}:null}).filter(Boolean):[],
      heuristics:g('cf-heur')?g('cf-heur').split('\n').map(s=>s.trim()).filter(Boolean):[],
      dna:g('cf-dna')?g('cf-dna').split(/[,，]/).map(s=>s.trim()).filter(Boolean):[],
      blind:g('cf-blind'),bound:g('cf-bound')}:null};
  const pv=$('cf-prompt-pv');
  if(pv){pv.style.display='block';pv.textContent=YLN.nuwa.personaSysBuild(c)||'（组装结果为空）'}
}
function parseMind(){
  const g=id=>{const el=$(id);return el?(el.value||'').trim():''};   /* 真人表单无心智字段，元素不存在时安全返回空 */
  const models=g('cf-models')?g('cf-models').split('\n').map(l=>{const[l1,...r]=l.split('|');return l1&&l1.trim()?{n:l1.trim().slice(0,16),d:(r.join('|')||'').trim().slice(0,60)}:null}).filter(Boolean):[];
  const heur=g('cf-heur')?g('cf-heur').split('\n').map(s=>s.trim().slice(0,60)).filter(Boolean):[];
  const dna=g('cf-dna')?g('cf-dna').split(/[,，]/).map(s=>s.trim().slice(0,24)).filter(Boolean):[];
  const taboos=g('cf-taboos')?g('cf-taboos').split('\n').map(s=>s.trim().slice(0,40)).filter(Boolean):[];
  const mind={models,heuristics:heur,dna,taboos,blind:g('cf-blind').slice(0,60),bound:g('cf-bound').slice(0,60)};
  return mind.models.length?mind:null;
}
function charSave(){
  const g=id=>($(id).value||'').trim();
  const short=g('cf-short');
  if(!short){toast('请填写显示名');return}
  const cs=adminChars();
  const mind=parseMind();
  const base={short,name:g('cf-name')||short,title:g('cf-title'),emoji:g('cf-emoji')||'🙂',
    field:charHumanMode?'真友':g('cf-field'),quote:g('cf-quote')||'「来，我把我的智慧压缩成一句话给你。」',
    tags:g('cf-tags')?g('cf-tags').split(/[,，]/).map(s=>s.trim()).filter(Boolean):[],
    dir:g('cf-dir'),corpus:g('cf-corpus'),mind:mind||(charEditing&&charEditing.mind)||null,
    promptSys:g('cf-prompt')||null,
    ...(charHumanMode?{human:true}:{}),
    conf:charEditing&&charEditing.conf?charEditing.conf:(aiConf!=null?aiConf:(mind?80:35)),
    published:g('cf-pub')==='1'};
  if(charEditing){
    const i=cs.findIndex(c=>c.id===charEditing.id);if(i<0)return;
    cs[i]={...cs[i],...base};toast(`「${short}」已更新，手机端${base.published?'同步生效':'已转为草稿'}`);
  }else{
    const pal=CHAR_PALETTES[cs.length%CHAR_PALETTES.length];
    cs.push({id:(charHumanMode?'rf_':'adm_')+Date.now().toString(36),...base,c1:pal[0],c2:pal[1],tint:pal[2],deep:pal[3],created:Date.now()});
    toast(`「${short}」已创建${base.published?'并发布到手机端 ✦':'为草稿'}`);
  }
  YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);closeDrawer();router();
}
function charToggle(id){
  const cs=adminChars(),i=cs.findIndex(c=>c.id===id);if(i<0)return;
  cs[i].published=!cs[i].published;YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
  toast(cs[i].published?`「${cs[i].short}」已发布，手机端老友库实时可见 ✦`:`「${cs[i].short}」已下架为草稿`);
  router();
}
function charDel(id){
  const cs=adminChars(),i=cs.findIndex(c=>c.id===id);if(i<0)return;
  const c=cs[i];
  if(c.source==='builtin'){
    if(!confirm(`「${c.short}」是出厂内置老友，不可删除，确认下架为草稿？`))return;
    cs[i].published=false;YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);
    toast(`「${c.short}」已下架（内置老友不可删除）`);router();return;
  }
  if(!confirm(`确认删除「${c.short}」？已领养该老友的用户不受影响。`))return;
  cs.splice(i,1);YLN.saveAdminChars(cs);YLN.adminCharsPush(cs);toast(`「${c.short}」已删除`);router();
}

/* ================= 体验看板（ERD × BOND）：口径唯一事实源=docs/experience-metrics.md v1.1 ================= */
/* 数据源：同浏览器三端共享 localStorage —— yln_rounds 实录 / yln_site_orders 订单 / yln_wallet 积分流水。
   结果层只放行为结果（ERD/BOND），诊断层待 L2 判卷与 N2/N3/N4 埋点的指标一律置灰，不得假装可算。 */
const XP_WIN=10*60*1000, XP_DAY=864e5;               /* ERD v1 回归窗口：AI 回应完成后 10 分钟 */
function xpLoad(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}}
function xpRounds(){return xpLoad('yln_rounds',[]).filter(r=>r&&Array.isArray(r.cache))}
const xpSolo=r=>!!r.priv;                             /* 单聊桌（rec.priv=老友 id） */
const xpScript=r=>/^sq\d+$/.test(String(r.id||''));   /* 广场演示桌剧本流（手册 §9 红线 5：排除于用户侧指标） */
function xpCharName(id){try{const c=((typeof YLN!=='undefined'&&YLN.adminChars())||[]).find(x=>x.id===id);if(c)return esc(c.short||c.name)}catch(e){}return esc(id)}
/* ERD-01 v1：插话 → AI 回应成功 → 10 分钟内同桌再插话；无时间戳的旧条目按条跳过（不拖累整桌，
   老桌补新对话即自动参与 v1 精算，与手册「随对话积累自动转 v1」注记一致），legacy 仅计数提示 */
function xpERD(){
  const rows=[];let legacy=0;
  xpRounds().forEach(r=>{
    if(xpScript(r)||xpSolo(r))return;
    const es=r.cache;
    if(es.some(e=>e.type==='user'&&e.t==null))legacy++;
    const us=es.map((e,i)=>({e,i})).filter(x=>x.e.type==='user');
    if(!us.length)return;
    let turns=0,eff=0;
    us.forEach((x,xi)=>{
      if(x.e.t==null)return;                           /* 旧插话无时间戳 → 按条跳过 */
      const nxt=us[xi+1],seg=es.slice(x.i+1,nxt?nxt.i:es.length),msgs=seg.filter(e=>e.type==='msg');
      if(!msgs.length)return;                          /* 插话未获 AI 回应 → 不入分母 */
      if(msgs.some(m=>m.t==null))return;               /* 回应无时间戳无法锚定窗口 → 跳过 */
      turns++;
      const replyT=Math.max(...msgs.map(e=>e.t||0));
      if(nxt&&nxt.e.t!=null&&nxt.e.t-replyT<=XP_WIN)eff++;
    });
    if(turns)rows.push({topic:r.topic||'（未命名）',ts:r.ts||0,turns,eff,rate:Math.round(eff/turns*100)});
  });
  rows.sort((a,b)=>b.ts-a.ts);
  const T=rows.reduce((s,x)=>s+x.turns,0),E=rows.reduce((s,x)=>s+x.eff,0);
  /* 近 4 周趋势：按桌 ts 归周（近似粒度；N2 上线后按条目 t 精算） */
  const wk={};
  rows.forEach(x=>{if(!x.ts)return;const d=new Date(x.ts),off=(d.getDay()+6)%7,m=new Date(d.getFullYear(),d.getMonth(),d.getDate()-off),k=m.getTime();
    (wk[k]=wk[k]||{label:`${m.getMonth()+1}/${m.getDate()}`,t:0,e:0});wk[k].t+=x.turns;wk[k].e+=x.eff});
  const trend=Object.keys(wk).map(Number).sort((a,b)=>a-b).slice(-4).map(k=>wk[k]);
  return {rows,turns:T,eff:E,rate:T?Math.round(E/T*100):null,legacy,trend};
}
/* BOND-01：单聊后 7 日内再对话（单聊或同桌）；BOND-01b=回流场景为圆桌的占比（圆桌迁移率） */
function xpBOND(){
  const rs=xpRounds().filter(r=>!xpScript(r));
  const first={};
  rs.forEach(r=>{if(xpSolo(r)&&r.ts){const c=r.priv;if(!first[c]||r.ts<first[c])first[c]=r.ts}});
  const rows=Object.keys(first).map(c=>{
    const later=rs.filter(r=>r.ts>first[c]&&r.ts-first[c]<=7*XP_DAY&&(r.priv===c||(r.chars||[]).includes(c)));
    const rt=later.sort((a,b)=>a.ts-b.ts)[0];
    return {c,ts:first[c],ret:!!rt,scene:rt?(xpSolo(rt)?'单聊':'圆桌'):'—',at:rt?rt.ts:0};
  }).sort((a,b)=>(b.ret-a.ret)||(b.ts-a.ts));
  const ret=rows.filter(x=>x.ret),mig=ret.filter(x=>x.scene==='圆桌');
  return {n:rows.length,ret:ret.length,rate:rows.length?Math.round(ret.length/rows.length*100):null,
    mig:ret.length?Math.round(mig.length/ret.length*100):null,rows};
}
/* T-03 付费漏斗（订单态两段；套餐页浏览事件待 N2 埋点） */
function xpT03(){
  const os=orders(),paid=os.filter(o=>o.status==='paid');
  const rev30=paid.filter(o=>(o.time||0)>=Date.now()-30*XP_DAY).reduce((s,o)=>s+(o.amount||0),0);
  return {n:os.length,paid:paid.length,rate:os.length?Math.round(paid.length/os.length*100):null,rev30};
}
/* Re-01 积分墙挽回（近似口径：流水重放余额 <10 视为触墙；ledger 仅保留 40 条 → 待 N2 精确埋点） */
function xpRe01(){
  const w=xpLoad('yln_wallet',null);
  if(!w||!Array.isArray(w.ledger)||w.ledger.length<3)return null;
  const led=[...w.ledger].sort((a,b)=>(a.t||0)-(b.t||0));
  let bal=(w.points||0)-led.reduce((s,e)=>s+(e.d||0),0);
  const lows=[];
  led.forEach(e=>{bal+=(e.d||0);if((e.d||0)<0&&bal<10)lows.push(e.t||0)});
  if(!lows.length)return {lows:0,rec:0,rate:null};
  const rec=lows.filter(L=>led.some(e=>(e.d||0)>0&&e.t>L.t&&e.t-L.t<=7*XP_DAY)).length;
  return {lows:lows.length,rec,rate:Math.round(rec/lows.length*100)};
}
/* W-04 长度合规率（P1，规则零成本顺手可算）：AI 回应 ≤120 字占比 */
function xpW04(){
  let n=0,ok=0;
  xpRounds().forEach(r=>{if(xpScript(r))return;r.cache.forEach(e=>{if(e.type==='msg'&&e.text){n++;if(e.text.replace(/\s/g,'').length<=120)ok++}})});
  return n?Math.round(ok/n*100):null;
}
function pXpanel(){
  const mute=(id,name,why)=>`<div class="card kpi" style="opacity:.5" title="${why}"><span class="lb"><span class="dic" style="background:var(--primary-softer)">◻</span>${name}</span><p class="v" style="font-size:15px;color:var(--ink-3)">待接入</p><p class="sub">${id} · ${why}</p><span class="deco" style="background:var(--ink-3)"></span></div>`;
  return `<div class="kpis">
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--primary-soft)">🌊</span>ERD 有效圆桌深度</span><p class="v" id="xp-erd">—</p><p class="sub" id="xp-erd-sub">ERD-01 v1 · 10 分钟话语权回归</p><span class="deco" style="background:var(--primary)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--mint-soft)">💞</span>BOND 关系回流</span><p class="v" id="xp-bond">—</p><p class="sub" id="xp-bond-sub">BOND-01 · 单聊 7 日回流 / 圆桌迁移</p><span class="deco" style="background:var(--mint)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--primary-soft)">💳</span>付费完成率</span><p class="v" id="xp-t03">—</p><p class="sub" id="xp-t03-sub">T-03 · 订单 → 支付成功</p><span class="deco" style="background:var(--primary-deep)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--coral-soft)">🧱</span>积分墙挽回</span><p class="v" id="xp-re01">—</p><p class="sub" id="xp-re01-sub">Re-01 近似 · 触墙 7 日内充值</p><span class="deco" style="background:var(--coral)"></span></div>
  </div>
  <div class="card"><div class="hd"><b>诊断层 · 五度五性</b><span>P0 可算即上 · 其余置灰待 L2 判卷 / N2 漏斗 / N4 计时</span></div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${mute('F-02','像 · 保真度','待 L2 实录抽检判卷')}
      ${mute('V-01','真 · 真实度','待 L2 事实题探针')}
      ${mute('W-01','萌 · 温度','待 L2 品牌调性判卷')}
      ${mute('S-01','合 · 协同度','待 L2 观点碰撞判卷')}
      ${mute('R-01','快 · 速度','待 N4 llmChat 计时')}
      ${mute('T-01','成 · 任务成功','待 N2 漏斗埋点')}
      ${mute('P-01','敏 · 性能','待 N4 性能埋点')}
      <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--mint-soft)">📏</span>W-04 长度合规</span><p class="v" id="xp-w04">—</p><p class="sub">AI 回应 ≤120 字占比 · 规则可算</p><span class="deco" style="background:var(--mint)"></span></div>
    </div>
    <p style="margin:10px 2px 0;font-size:11px;color:var(--ink-3)">C-01 一致性 = 本地全量静态断言（node tests/run-tests.js）· 每次改动执行，未通过不发布</p>
  </div>
  <div class="card"><div class="hd"><b>圆桌 ERD 明细</b><span id="xp-erd-note">口径 v1 · 演示桌剧本与单聊已排除</span></div><div id="xp-erd-tbl"></div></div>
  <div class="card"><div class="hd"><b>单聊关系回流明细</b><span>BOND-01 / BOND-01b · 首聊后 7 日窗口</span></div><div id="xp-bond-tbl"></div></div>
  <div class="card"><div class="hd"><b>口径注脚</b><span>docs/experience-metrics.md · v1.1</span></div>
    <p style="margin:6px 2px;font-size:11.5px;line-height:1.9;color:var(--ink-2)">
    · ERD-01 v1：插话 → AI 回应成功 → <b>10 分钟内同桌再插话</b>（话语权回归，不是挂机时长）；切桌/切后台不构成退出<br>
    · 质量系数暂 1.0，待 L2 judge 四维判卷接入后加权；演示桌剧本、单聊桌、未获回应的插话均不入分母<br>
    · 历史实录的无时间戳旧条目按条跳过（不拖累整桌），新对话自动参与 v1 精算；演示桌剧本与单聊不入分母<br>
    · Re-01 为近似口径（ledger 仅保留 40 条流水重放），N2 埋点上线后切精确口径并双跑一周对齐<br>
    · 数据源=本机三端共享 localStorage（yln_rounds / yln_site_orders / yln_wallet）；服务器多用户聚合待 L1.5</p>
  </div>`;
}
function renderXpanel(){
  const e=xpERD();
  $('xp-erd').textContent=e.rate==null?'—':e.rate+'%';
  $('xp-erd-sub').textContent=`ERD-01 v1 · 有效轮 ${e.eff}/${e.turns} · 质量系数暂 1.0`;
  $('xp-erd-note').textContent=e.legacy?`口径 v1 · ${e.legacy} 张桌含无时间戳旧条目（按条跳过，新对话自动参与精算）`:'口径 v1 · 演示桌剧本与单聊已排除';
  $('xp-erd-tbl').innerHTML=e.rows.length?`<table class="tbl"><thead><tr><th>圆桌</th><th>插话轮</th><th>有效轮</th><th>回归率</th><th>状态</th></tr></thead><tbody>
    ${e.rows.map(x=>`<tr><td>${esc(x.topic)}</td><td>${x.turns}</td><td>${x.eff}</td><td><b>${x.rate}%</b></td><td>${x.ts?'v1':'v1 · 含旧条目'}</td></tr>`).join('')}</tbody></table>
    ${e.trend.length>1?`<p style="margin:8px 2px 0;font-size:11px;color:var(--ink-3)">周趋势：${e.trend.map(w=>`${w.label} 周 · 插话 ${w.t} / 有效 ${w.e}`).join(' · ')}</p>`:''}`
    :`<div class="empty"><div class="em">🌊</div><p>暂无圆桌实录 · 去手机端插话后回来刷新</p></div>`;
  const b=xpBOND();
  $('xp-bond').textContent=b.rate==null?'—':b.rate+'%';
  $('xp-bond-sub').textContent=`BOND-01 · 回流 ${b.ret}/${b.n}${b.mig==null?'':` · BOND-01b 圆桌迁移 ${b.mig}%`}`;
  $('xp-bond-tbl').innerHTML=b.n?`<table class="tbl"><thead><tr><th>老友</th><th>首次单聊</th><th>7 日内回流</th><th>回归场景</th></tr></thead><tbody>
    ${b.rows.map(x=>`<tr><td>${xpCharName(x.c)}</td><td>${x.ts?new Date(x.ts).toLocaleDateString():'—'}</td><td>${x.ret?`<b style="color:var(--mint)">✓ ${new Date(x.at).toLocaleDateString()}</b>`:'—'}</td><td>${x.scene}</td></tr>`).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">💞</div><p>暂无单聊记录</p></div>`;
  const o=xpT03();
  $('xp-t03').textContent=o.rate==null?'—':o.rate+'%';
  $('xp-t03-sub').textContent=`T-03 · 支付成功 ${o.paid}/${o.n} · 近 30 天 ¥${o.rev30}`;
  const r01=xpRe01();
  $('xp-re01').textContent=r01?(r01.rate==null?'—':r01.rate+'%'):'样本不足';
  $('xp-re01-sub').textContent=r01?`Re-01 近似 · 触墙 ${r01.lows} 次 · 挽回 ${r01.rec}`:'Re-01 近似口径 · 流水样本不足';
  const w04=xpW04();
  $('xp-w04').textContent=w04==null?'—':w04+'%';
}

/* ============ 路由 ============ */
const routes={
  dashboard:{t:'数据总览',s:'平台核心指标一览',f:pDashboard},
  xpanel:{t:'体验看板',s:'ERD × BOND 双结果 · 五度五性诊断层',f:pXpanel,after:renderXpanel},
  users:{t:'用户管理',s:'注册用户 · 会员 · 积分发放',f:pUsers,after:renderUsers},
  orders:{t:'订单管理',s:'全平台订单 · 退款处理',f:pOrders,after:renderOrders},
  finance:{t:'财务管理',s:'营收 · 退款 · 流水导出',f:pFinance},
  token:{t:'Token 计算',s:'模型成本 · 积分对照 · 毛利',f:pToken},
  nuwa:{t:'女娲管线',s:'运行观测 · 复核队列 · Prompt 模板 · 角色库',f:pNuwa,after:renderNuwa},
  prompts:{t:'Prompt 管理',s:'聊天人设模板热编辑 · 单老友覆盖 · 组装调试台',f:pPrompts,after:renderPrompts},
  chars:{t:'老友管理',s:'官方老友 · 发布下架 · 手机端同步',f:pChars,after:renderChars},
  realfriends:{t:'真人好友',s:'注册用户二次管理 · 上桌旁听 · 手机端真友同步',f:pRealChars,after:renderRealChars},
  lives:{t:'广场直播',s:'直播中的群 · 全量直播流 · 强制关播',f:pLives,after:renderLives}
};

/* ================= 广场直播管理：直播中的群（yln_live 流）全量列表 + 强制关播 ================= */
let livesCache=[];
function pLives(){
  /* 数据卡样式与 Token 计算页对齐（.kpis/.kpi：色块图标 + 大数值 + 副标 + 装饰圆），renderLives 按 id 原位刷新数值 */
  return `<div class="kpis">
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--coral-soft)">🔴</span>直播中</span><p class="v" id="lv-live-n">—</p><p class="sub">全量直播流 · 实时同步</p><span class="deco" style="background:var(--coral)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--mint-soft)">🎓</span>已收官</span><p class="v" id="lv-done-n">—</p><p class="sub">归档回放 · 随时调取</p><span class="deco" style="background:var(--mint)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--sky-soft)">💬</span>累计消息</span><p class="v" id="lv-msg-n">—</p><p class="sub">全部直播流消息总量</p><span class="deco" style="background:var(--sky)"></span></div>
    <div class="card kpi"><span class="lb"><span class="dic" style="background:var(--primary-soft)">⛔</span>被强制关播</span><p class="v" id="lv-forced-n">—</p><p class="sub">管理端强制下线场次</p><span class="deco" style="background:var(--primary)"></span></div>
  </div>
  <div class="card">
    <div class="hd"><b>直播流列表</b><span style="display:flex;gap:8px;align-items:center">
      <span style="font-size:11px;color:var(--ink-3)">每 15 秒自动刷新</span>
      <button class="btn btn-xs" onclick="renderLives()">立即刷新</button></span></div>
    <div id="lv-table"><div class="empty"><div class="em">📡</div><p>正在拉取直播流…</p></div></div>
  </div>`;
}
async function renderLives(){
  try{
    const r=await fetch('/api/admin/live');const d=await r.json();
    if(!d.ok)throw new Error(d.err||r.status);
    livesCache=d.lives||[];
  }catch(e){const t=document.getElementById('lv-table');if(t)t.innerHTML=`<div class="empty"><div class="em">📵</div><p>服务器不可达（${esc(String(e.message||e))}）</p></div>`;return}
  const live=livesCache.filter(l=>l.status==='live');
  const done=livesCache.filter(l=>l.status!=='live');
  const forced=livesCache.filter(l=>l.forced);
  const totalMsg=livesCache.reduce((s,l)=>s+l.count,0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  set('lv-live-n',live.length);set('lv-done-n',done.length);set('lv-msg-n',fmtN(totalMsg));set('lv-forced-n',forced.length);
  const tbl=document.getElementById('lv-table');if(!tbl)return;
  tbl.innerHTML=livesCache.length?`<table class="tbl"><thead><tr>
    <th>直播主题</th><th>主播</th><th>状态</th><th>消息数</th><th>开播时间</th><th>最近活跃</th><th>操作</th></tr></thead><tbody>
    ${livesCache.map(l=>`<tr>
      <td><b>${esc(l.title||'（无标题）')}</b>${l.source==='demo'?'<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;font-size:10px;background:#F0EEFF;color:#4B42C8;vertical-align:middle">演示</span>':''}${l.topic&&l.topic!==l.title?`<span style="display:block;font-size:11px;color:var(--ink-3)">${esc(l.topic)}</span>`:''}</td>
      <td>${esc(l.ownerNick||'—')}</td>
      <td><span class="st ${l.status==='live'?'live':'arch'}">${l.status==='live'?'🔴 直播中':(l.forced?'已强制关播':'已收官')}</span></td>
      <td class="num">${l.count}</td>
      <td class="mut">${fmtT(l.created||l.updated)}</td>
      <td class="mut">${fmtT(l.updated)}</td>
      <td>${l.status==='live'
        ?`<button class="btn btn-xs" onclick="viewLive('${l.liveId}')">查看</button>
           <button class="btn btn-xs" style="color:#E05A4E;border-color:#E05A4E" onclick="forceCloseLive('${l.liveId}')">强制关播</button>`
        :`<button class="btn btn-xs" onclick="viewLive('${l.liveId}')">查看</button>`}</td>
    </tr>`).join('')}</tbody></table>`
    :`<div class="empty"><div class="em">📡</div><p>当前没有任何直播流</p></div>`;
}
async function forceCloseLive(liveId){
  const l=livesCache.find(x=>x.liveId===liveId);if(!l)return;
  if(!confirm(`强制关播「${l.title||liveId}」？\n围观端将立即收到收官提示，主播端轮询同步结束。此操作不可恢复。`))return;
  try{
    const r=await fetch('/api/admin/live/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({liveId})});
    const d=await r.json();
    if(!d.ok){toast('关播失败：'+(d.err||r.status));return}
    auditLog(null,'强制关播：'+(l.title||liveId)+'（主播 '+(l.ownerNick||'—')+'）');
    toast('已强制关播，操作已留痕');renderLives();
  }catch(e){toast('服务器不可达，关播失败')}
}
/* 查看直播流：直播中的流与手机端直播群同一条消息流实时同步（4s 增量轮询），收官后归档回放 */
let liveViewTimer=null,liveViewId=null,liveViewAfter=0,liveViewNames={};
function stopLiveView(){if(liveViewTimer){clearInterval(liveViewTimer);liveViewTimer=null}liveViewId=null;liveViewAfter=0}
function lvMsgHTML(m){
  const tag=m.type==='user'?`<b style="color:var(--primary)">【${esc(m.nick||'用户')}】</b>`
    :m.type==='msg'?`<b>【${esc(liveViewNames[m.who]||m.who||'?')}】</b>`
    :m.type==='stage'?`<i style="color:var(--ink-3)">〔${esc(m.label||'')}〕</i>`:'<i style="color:var(--ink-3)">〔纪要〕</i>';
  return `<p style="margin:0 0 5px;font-size:11.5px;line-height:1.6">${tag}${esc((m.text||m.html||'').replace(/<[^>]+>/g,'').slice(0,140))}</p>`;
}
async function viewLive(liveId){
  stopLiveView();
  try{
    const r=await fetch('/api/live/stream?liveId='+encodeURIComponent(liveId)+'&after=0');
    const d=await r.json();
    if(!d.ok){toast('拉取失败：'+(d.err||r.status));return}
    liveViewNames={};(d.chars||[]).forEach(c=>{liveViewNames[c.id]=c.short});
    document.getElementById('d-body').innerHTML=`
      <div class="duser"><div><b style="font-size:16px">📺 ${esc(d.title||'直播流')}</b>
        <p style="font-size:12px;color:var(--ink-3);margin-top:4px" id="lv-v-meta">${esc(d.topic||'')} ｜ ${d.status==='live'?'🔴 直播中':'已收官'} ｜ 共 ${d.total} 条${d.status==='live'?' · 实时同步中':' · 归档回放'}</p></div></div>
      <div id="lv-v-box" style="max-height:60vh;overflow:auto;margin-top:10px;background:var(--surface-2);border-radius:12px;padding:12px">
        ${d.msgs&&d.msgs.length?d.msgs.map(lvMsgHTML).join(''):'<p style="font-size:12px;color:var(--ink-3)">该流暂无消息</p>'}
      </div>`;
    document.getElementById('veil').classList.add('on');document.getElementById('drawer').classList.add('on');
    const box=document.getElementById('lv-v-box');box.scrollTop=box.scrollHeight;
    if(d.status!=='live')return;
    liveViewId=liveId;liveViewAfter=d.total;
    liveViewTimer=setInterval(async()=>{
      if(!liveViewId){clearInterval(liveViewTimer);liveViewTimer=null;return}
      try{
        const r2=await fetch('/api/live/stream?liveId='+encodeURIComponent(liveViewId)+'&after='+liveViewAfter);
        const inc=await r2.json();if(!inc.ok)return;
        const bx=document.getElementById('lv-v-box');
        if(!bx){stopLiveView();return}
        if(inc.msgs&&inc.msgs.length){
          bx.insertAdjacentHTML('beforeend',inc.msgs.map(lvMsgHTML).join(''));
          liveViewAfter=inc.total;bx.scrollTop=bx.scrollHeight;
          const meta=document.getElementById('lv-v-meta');
          if(meta)meta.textContent=`${inc.topic||''} ｜ 🔴 直播中 ｜ 共 ${inc.total} 条 · 实时同步中`;
        }
        if(inc.status!=='live'){   /* 主播收官/强制关播：同步收流 */
          stopLiveView();
          const meta=document.getElementById('lv-v-meta');
          if(meta)meta.textContent=`${inc.topic||''} ｜ 已收官 ｜ 共 ${inc.total} 条 · 归档回放`;
          bx.insertAdjacentHTML('beforeend','<p style="text-align:center;font-size:11px;color:var(--ink-3);margin:8px 0 0">🎓 本场直播已收官</p>');
        }
      }catch(e){}
    },4000);
  }catch(e){toast('服务器不可达，无法查看直播流')}
}
let livesTimer=null;
function stopLivesTimer(){if(livesTimer){clearInterval(livesTimer);livesTimer=null}}
function router(){
  if(!isAuthed()){showLogin();return}
  const key=(location.hash.replace('#/','')||'dashboard').split('?')[0];
  const r=routes[key]||routes.dashboard;
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.toggle('on',a.dataset.r===key||(key==='dashboard'&&a.dataset.r==='dashboard')));
  $('pt').textContent=r.t;$('ps').textContent=r.s;
  $('view').innerHTML=`<div class="view">${r.f()}</div>`;
  if(r.after)r.after();
  stopLivesTimer();
  if(key==='lives')livesTimer=setInterval(renderLives,15000);   /* 广场直播页 15 秒自动刷新 */
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
function closeDrawer(){stopLiveView();$('veil').classList.remove('on');$('drawer').classList.remove('on')}
addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
