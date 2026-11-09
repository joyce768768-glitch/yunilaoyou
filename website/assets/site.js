/* ============================================================
   与你老友 · 官网共享逻辑
   注册 / 登录 / 会话 / 订单
   P0 起：账号以本地服务器为唯一事实源（服务器可达时写穿 SQLite，
   token 存 yln_auth_token）；服务器不可达自动降级纯 localStorage。
   钱包字段（points/coupons/plan）仍归本地，跨端同步属 P1。
   ============================================================ */
const SITE = {
  usersK:'yln_site_users', sessK:'yln_site_session', ordersK:'yln_site_orders',

  /* ---- 存储工具 ---- */
  load(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch(e){ return d } },
  save(k, v){ localStorage.setItem(k, JSON.stringify(v)) },

  /* ---- 简易摘要（本地密码缓存 ph 用，非生产级加密；服务器侧为 PBKDF2 加盐哈希） ---- */
  hash(str){
    let h = 5381;
    for(let i=0;i<str.length;i++) h = ((h<<5)+h+str.charCodeAt(i))>>>0;
    return 'h'+h.toString(36)+str.length;
  },

  /* ---- 鉴权桥：yln-core.js 未加载时为 null → 纯本地模式 ---- */
  auth(){ return (typeof YLN!=='undefined'&&YLN&&YLN.auth)?YLN.auth:null },

  /* ---- 纯本地注册 / 登录（服务器不可达时的降级路径，保持原有语义） ---- */
  _localSignup(nick, email, pwd){
    const users = this.users();
    if(users.some(u=>u.email===email)) throw '该邮箱已注册，直接登录即可';
    const u = {id:'u'+Date.now().toString(36), nick, email, ph:this.hash(pwd), created:Date.now(), plan:null, planUntil:null};
    users.push(u); this.save(this.usersK, users);
    this.save(this.sessK, u.id);
    return u;
  },
  _localLogin(email, pwd){
    const u = this.users().find(u=>u.email===email);
    if(!u) throw '邮箱尚未注册';
    if(u.ph !== this.hash(pwd)) throw '密码不正确，再想想？';
    this.save(this.sessK, u.id);
    return u;
  },

  /* ---- 用户与会话（async：服务器写穿优先，本地记录与服务器同 id） ---- */
  users(){ return this.load(this.usersK, []) },
  async signup(nick, email, pwd){
    const users = this.users();
    if(users.some(u=>u.email===email)) throw '该邮箱已注册，直接登录即可'; /* 本地先行，维持既有提示 */
    const A = this.auth();
    if(A){
      const srv = await A.signup(nick, email, pwd);
      if(srv === null) return this._localSignup(nick, email, pwd); /* 服务不可达：纯本地 */
      if(!srv.ok) throw srv.err;                                   /* 服务器权威（重复/校验失败） */
      const su = srv.user;
      const u = {id:su.id, nick, email, ph:this.hash(pwd), created:su.created||Date.now(),
        plan:su.plan||null, planUntil:su.planUntil||null, points:0, coupons:0};
      users.push(u); this.save(this.usersK, users);
      this.save(this.sessK, u.id);
      return u;
    }
    return this._localSignup(nick, email, pwd);
  },
  async login(email, pwd){
    const A = this.auth();
    if(A){
      const srv = await A.login(email, pwd);
      if(srv === null) return this._localLogin(email, pwd);        /* 服务不可达：纯本地 */
      if(srv.ok){
        const su = srv.user, users = this.users();
        /* 身份以服务器为准；已存在的本地记录只对齐身份字段，钱包字段一律不动（P1 再同步） */
        let u = users.find(x=>x.id===su.id) || users.find(x=>x.email===email);
        if(u){ u.id=su.id; u.nick=su.nick||u.nick; u.ph=this.hash(pwd); }
        else{
          u = {id:su.id, nick:su.nick, email, ph:this.hash(pwd), created:su.created||Date.now(),
            plan:su.plan||null, planUntil:su.planUntil||null, points:0, coupons:0};
          users.push(u);
        }
        this.save(this.usersK, users);
        this.save(this.sessK, u.id);
        return u;
      }
      /* 服务器明确拒绝：可能是停机期间本地注册的漂移账号 → 回退本地验证，成功则补种服务器 */
      const hasLocal = this.users().some(u=>u.email===email);
      try{
        const u = this._localLogin(email, pwd);
        this.auth().signup(u.nick, email, pwd).catch(()=>{});      /* 漂移补种（服务器已注册则静默忽略） */
        return u;
      }catch(e){ throw hasLocal ? e : srv.err }                    /* 本地无此号 → 采信服务器错误 */
    }
    return this._localLogin(email, pwd);
  },
  logout(){
    const A = this.auth(); if(A) A.logout().catch(()=>{});         /* 撤销服务器会话（fire-and-forget） */
    localStorage.removeItem(this.sessK); toast('已退出登录，常回来看看 👋');
  },
  me(){ const id = this.load(this.sessK, null); return this.users().find(u=>u.id===id) || null },
  updateUser(patch){ const u=this.me(); if(!u) return; Object.assign(u,patch); const us=this.users(); const i=us.findIndex(x=>x.id===u.id); us[i]=u; this.save(this.usersK,us) },

  /* ---- 订单 ---- */
  orders(){ return this.load(this.ordersK, []) },
  createOrder(o){
    const orders = this.orders();
    const rec = {id:'YL'+Date.now().toString().slice(-9), status:'paid', time:Date.now(), ...o};
    orders.unshift(rec); this.save(this.ordersK, orders);
    return rec;
  },

  /* ---- 导航登录态 ---- */
  renderAuth(){
    const slot = document.getElementById('auth-slot'); if(!slot) return;
    const u = this.me();
    if(u){
      const vip = u.plan && u.planUntil > Date.now();
      slot.innerHTML = `<div class="user-chip" onclick="location.href='orders.html'" title="进入订单中心">
        <span class="uc-ava">${(u.nick||'友')[0].toUpperCase()}</span>
        <b>${u.nick}</b>${vip?'<i>会员</i>':''}
      </div>`;
    }else{
      slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="membership.html?tab=login">登录</a>
        <a class="btn btn-primary btn-sm" href="membership.html?tab=signup">免费注册</a>`;
    }
  }
};

/* ---- toast ---- */
let _toastT;
function toast(msg, dur=2400){
  let el = document.querySelector('.toast');
  if(!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el) }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(()=>el.classList.remove('on'), dur);
}

/* ---- 导航初始化 ---- */
function initNav(){
  const nav = document.querySelector('.nav');
  addEventListener('scroll', ()=>nav.classList.toggle('scrolled', scrollY>8), {passive:true});
  // 下载下拉
  const dd = document.getElementById('dd-download');
  if(dd){
    dd.querySelector('button').addEventListener('click', e=>{ e.stopPropagation(); dd.classList.toggle('open') });
    document.addEventListener('click', ()=>dd.classList.remove('open'));
  }
  // 移动菜单
  const burger = document.getElementById('burger'), mm = document.getElementById('mm');
  if(burger && mm) burger.addEventListener('click', ()=>mm.classList.toggle('open'));
  if(mm) mm.querySelectorAll('a').forEach(a=>a.addEventListener('click', ()=>mm.classList.remove('open')));
  SITE.renderAuth();
}

/* ---- 滚动显现 ---- */
function initReveal(){
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('vis'); io.unobserve(e.target) } }), {threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
}

/* ---- 格式化 ---- */
function fmtMoney(n){ return '¥' + (n%1===0 ? n : n.toFixed(2)) }
function fmtTime(t){
  const d = new Date(t), p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
