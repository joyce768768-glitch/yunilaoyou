#!/usr/bin/env python3
"""与你老友 · 局域网开发服务器（零依赖）
在标准 http.server 基础上：
1. 所有响应带 Cache-Control: no-store，杜绝浏览器缓存旧版页面；
2. 内置 SQLite 观测库（stdlib sqlite3）+ REST API：
   - /api/health            GET   健康检查
   - /api/traces            GET   女娲管线 Trace 列表 / POST upsert 单条
   - /api/tasks             GET   蒸馏任务列表 / POST upsert 单条
   - /api/skills            GET   角色库列表 / POST upsert / DELETE ?id=
   - /api/chars             GET   官方老友库全量 / POST 全量替换（后台为唯一事实源，手机端拉取同步）
   - /api/auth/signup       POST  注册（PBKDF2 加盐哈希，签发 Bearer token）
   - /api/auth/login        POST  登录（签发 Bearer token）
   - /api/auth/me           GET   会话校验（Authorization: Bearer）
   - /api/auth/logout       POST  撤销会话（幂等）
   - /api/wallet            GET/POST  用户钱包（Bearer；P1 跨端资产唯一事实源，LWW 合并）
   - /api/admin/wallet      GET?uid= / POST  后台调整任意用户钱包（patch 合并 + 流水备注，仅限局域网）
   - /api/my/chars          GET/POST  用户私有老友（Bearer；P2 跨端唯一事实源，全量替换 + LWW 合并）
   - /api/my/rounds         GET/POST  用户圆桌会话（Bearer；P3 跨端唯一事实源，全量数组替换 + LWW 合并，含实录）
   - /api/my/prefs          GET/POST  用户偏好设置（Bearer；P4 设备级设置，服务器为准 + 写穿）
   - /api/nuwa/prompts      GET/POST  女娲管线 Prompt 模板覆盖（管理员热编辑跨端唯一事实源；text 为空=删除覆盖）
   静态文件照常服务（index.html / website/ / tests/ ...）。
用法：python3 yln-server.py（端口 8823，日志到 stderr，可重定向到 /tmp/yln-server.log）
"""
import http.server
import functools
import hashlib
import hmac
import json
import os
import queue
import secrets
import sqlite3
import threading
import time
from urllib.parse import urlparse, parse_qs

PORT = 8823
SERVER_VERSION = '1.0.0'  # 服务化契约版本，/api/health 返回
DB_FILE = 'yln.db'
ADMIN_EMAIL = os.environ.get('YLN_ADMIN_EMAIL', '').strip().lower()
ADMIN_PASSWORD = os.environ.get('YLN_ADMIN_PASSWORD', '')


class EventHub:
    """进程内 SSE 分发：公共事件全员可见，用户/后台事件严格按会话隔离。"""
    def __init__(self):
        self._lock = threading.Lock()
        self._clients = []

    def subscribe(self, uid=None, admin=False):
        client = {'queue': queue.Queue(maxsize=100), 'uid': uid, 'admin': admin}
        with self._lock:
            self._clients.append(client)
        return client

    def unsubscribe(self, client):
        with self._lock:
            if client in self._clients:
                self._clients.remove(client)

    def publish(self, topic, uid=None):
        event = {'type': topic, 'ts': int(time.time() * 1000)}
        with self._lock:
            clients = list(self._clients)
        for client in clients:
            if uid is not None and client['uid'] != uid:
                continue
            if topic == 'admin' and not client['admin']:
                continue
            try:
                client['queue'].put_nowait(event)
            except queue.Full:
                try:
                    client['queue'].get_nowait()
                    client['queue'].put_nowait(event)
                except queue.Empty:
                    pass


EVENTS = EventHub()

# ---------- 广场演示桌剧本（唯一事实源） ----------
# 广场每张演示桌 = 服务器 yln_live 里唯一一条直播流（live_id=sqN），手机端与 Web 后台只是同一份数据的两个视图：
# 启动/懒加载时 seed 播种（msgs 置空），客户端每次打开调 /api/live/demo_next 续播「下一轮组」（默认 3 轮 × 每轮全员 1 条），
# 剧本放完循环；插话经 /api/live/post 入流，全端同步。此前演示桌聊天记录存手机 localStorage（yln_sq_chat）导致后台无法同步，已废弃。
DEMO_SCRIPTS = {
    'sq1': {
        'host': '阿茶', 'watch': 23, 'mode': '深度圆桌', 'region': '江浙', 'status': 'live',
        'topic': '该不该为了男朋友留在一座城市？',
        'chars': [{'id': 'zhangxuefeng', 'short': '张雪峰', 'field': '生涯', 'tint': '#FFEEE8'},
                  {'id': 'naval', 'short': '纳瓦尔', 'field': '智慧', 'tint': '#E8F8F3'},
                  {'id': 'zhangyiming', 'short': '张一鸣', 'field': '商业', 'tint': '#FFF4E3'}],
        'rounds': [
            ['留不留下先看两件事：你的行业在这里有没有就业密度，以及这段关系有没有婚育时间表。没有时间表的爱情，搬迁成本全是你自己扛。',
             '先别问城市，问自己：留在这里，你的个人杠杆是变强还是变弱？一段让你牺牲成长速度的关系，本身就是一份昂贵的合同。',
             '我会拆成两个变量：感情确定性 × 机会成本。确定性高，搬；不确定，先异地十八个月，用数据说话，别用情绪投票。'],
            ['@纳瓦尔 异地恋撑过十八个月的，十个里剩不到三个。你不算感情账，感情账最贵。你那套杠杆逻辑，在分手费面前全是纸。',
             '@张雪峰 恰恰相反。为关系放弃坐标的人，日后会把这份牺牲记在对方账上——这才是感情里最贵的利息。先让自己不亏，才能长期不欠。',
             '两位说的其实是同一件事：把情绪问题工程化。给这段关系设一个复盘节点，三个月一次，两人对齐进度，不达标就止损，像管项目一样管感情。'],
            ['说得轻巧，复盘会开得下去吗？我问你，丈母娘的复盘会是三个月一次吗？感情不是项目，是没有结项日期的项目。',
             '所以更要选对城市：选那个能让你们俩的收入都涨的地方。两个人都往上走，感情才有容错率；一个停滞一个上升，才是真正的异地。',
             '补充一个数据视角：同城见面的边际幸福感递减很快，而职业窗口期错过不再来。窗口期内先全力工作，关系的密度靠质量不靠通勤。'],
            ['我的建议很土但有用：先拿 offer 再谈坐标，谁手里的机会硬，就往谁那边靠。爱情要跟，但别空着手去跟。',
             '记住，你能带走的不是城市，是你的技能、判断力和信誉。这三样在任何城市都值钱，感情也一样——能迁移的关系才是好关系。',
             '总结一下：设节点、对齐目标、定期复盘。为爱留下没问题，但要留得清醒——知道自己放弃了什么，也知道自己要换来什么。'],
        ],
    },
    'sq2': {
        'host': 'Kevin 在创业', 'watch': 156, 'mode': '快问快答', 'region': '广东', 'status': 'live',
        'topic': 'AI 时代还要不要学编程？',
        'chars': [{'id': 'karpathy', 'short': 'Karpathy', 'field': '科技', 'tint': '#EFF1FF'},
                  {'id': 'liucixin', 'short': '大刘', 'field': '创作', 'tint': '#EDF0FE'},
                  {'id': 'zhangyiming', 'short': '张一鸣', 'field': '商业', 'tint': '#FFF4E3'}],
        'rounds': [
            ['要学，但学的目的变了。以前学编程是为了当码农，现在是为了看懂机器在做什么。不懂代码的人，连 AI 犯的错都看不出来。',
             '在科幻作家的眼里，这是一个文明会不会把思考外包出去的问题。会开车的人坐在自动驾驶车里，和不会开车的人坐在里面，是两种命运。',
             '学，但别按旧大纲学。语法可以交给 AI，你要学的是问题拆解和系统设计——这才是 AI 短期内替代不了的部分。'],
            ['@大刘 说得对。AI 是新的电力，但电力时代最赚钱的不是发电厂，是看懂电路的工程师。Prompt 写得再花，不如读懂一份报错栈。',
             '@Karpathy 补一个创业视角：我们招人早就不考背代码了，考的是给 AI 布置任务的能力。会描述问题的人，产出是别人的三倍。',
             '所以答案其实很古典：工具越强，使用工具的判断力越稀缺。石器时代结束，不是因为没有石头了。'],
            ['给个可执行的：每周让 AI 帮你写一个小工具，你负责验收和修改。三个月后你对系统的理解，会超过读十本教程。',
             '别把自己练成最后一代程序员，要练成第一代 AI 架构师。岗位名称会消失，问题不会消失。',
             '留一个问题给大家：当机器什么都会写的时候，你想让机器写什么？这个问题，只有学过思考的人才答得上来。'],
            ['收个尾：别问 AI 会不会取代程序员，问你自己会不会成为那个指挥 AI 的人。',
             '给岁月以文明，给技术以方向。学编程的本质，是保留人类对机器的解释权。',
             '行动建议：今晚就把你工作流里最重复的一步，试着交给 AI 做一遍。做一遍胜过看十篇分析。'],
        ],
    },
    'sq3': {
        'host': '深夜emo选手', 'watch': 1024, 'mode': '吐槽大会', 'region': '京津', 'status': 'done',
        'topic': '30 岁还单身，是我有问题吗？',
        'chars': [{'id': 'confucius', 'short': '孔子', 'field': '智慧', 'tint': '#FCF6E3'},
                  {'id': 'naval', 'short': '纳瓦尔', 'field': '智慧', 'tint': '#E8F8F3'},
                  {'id': 'moyan', 'short': '莫言', 'field': '创作', 'tint': '#FDEEF4'}],
        'rounds': [
            ['三十而立，立的从来不是婚姻，是立身之本。你自己没立起来，拉个人搭伙也立不住。',
             '单身不是缺陷，是自由现金流。婚姻是并购，并购失败的成本远高于暂不并购。别因为估值低就急着卖自己。',
             '我们村的光棍比我写过的小说还精彩。单身不可怕，可怕的是把单身活成一种委屈，逢人就要解释一遍。'],
            ['@纳瓦尔 你这话在理但太凉薄。人不独亲其亲，孤独是可以选择的，但养老送终的问题也得现实面对。',
             '@孔子 所以解决方案不是为养老而结婚，是为养老而攒资产。用婚姻解决养老，等于用合并报表掩盖现金流问题。',
             '二位一个讲理一个讲钱，我讲个故事：村里最幸福的，是那个五十岁没嫁、后来自己开了豆腐坊的婶子。日子是过出来的，不是找出来的。'],
            ['收个尾：不患无偶，患所以立。把自己活明白了，对的人出现时你才接得住。',
             '幸福是一种能力，不是一种状态。单身时学不会幸福的人，结了婚也学不会。',
             '三十岁算什么，人生这本小说，精彩章节都在后面。散了吧，该相亲相亲，该吃火锅吃火锅。'],
            ['都别丧，三十岁单身在春秋算晚婚，在我这儿顶多算待价而沽。子见南子我都不慌，你慌什么。',
             '对，把单身期的复利做足：健身、赚钱、读书。三年后你不是「终于脱单」，是「重新定价」。',
             '我把今天这桌话记下了，下回写成小说：主角三十四岁才遇见真爱，前面都在攒故事。'],
        ],
    },
    'sq4': {
        'host': '火锅底料研究员', 'watch': 87, 'mode': '深度圆桌', 'region': '川渝', 'status': 'live',
        'topic': '开火锅店该不该合伙？',
        'chars': [{'id': 'duan', 'short': '段永平', 'field': '商业', 'tint': '#FAF1E5'},
                  {'id': 'munger', 'short': '芒格', 'field': '商业', 'tint': '#F9EEFF'},
                  {'id': 'wangyangming', 'short': '王阳明', 'field': '智慧', 'tint': '#F2EFFF'}],
        'rounds': [
            ['合伙不是问题，人选才是。本分的人合伙是加法，不本分的人合伙是减法。先看这人吃火锅时抢不抢最后一片毛肚。',
             '反过来想：什么情况下合伙一定完蛋？钱没算清、权没分清、退出机制没写。这三样全没有，神仙组合也会散伙。',
             '事上磨练。合伙开店是最快的修行：账本面前见人心，后厨里面见格局。躲开合伙，等于躲开修行的道场。'],
            ['@芒格 补一条：能力是否互补不重要，价值观一致才重要。一个想赚快钱一个想慢慢做品牌，第一天就注定要离。',
             '@段永平 知行合一的角度看，嘴上说本分没用，要看他此前做过的每一件小事。言行不一的人，签什么协议都没用。',
             '所以尽调要做得像选股一样：查他过往的合伙史，问前合伙人，看他怎么谈钱。谈钱伤感情？不谈钱才伤。'],
            ['我的经验：丑话说在前面的合伙，反而走得远。股权、分工、谁管钱、亏损谁兜，一顿火锅的时间讲清楚。',
             '再送一句：小生意别搞五五开。必须有人说了算，另一个人有真实的一票否决权。对称的权力结构是不稳定的。',
             '心上有账，事上才有度。合伙前把最坏的情况摊开讲，讲完还能坐在一起吃火锅的，就合伙。'],
        ],
    },
    'sq5': {
        'host': '湾仔讲古佬', 'watch': 214, 'mode': '深度圆桌', 'region': '港澳', 'status': 'live',
        'topic': '茶餐厅二代该不该接班？',
        'chars': [{'id': 'zhangyiming', 'short': '张一鸣', 'field': '商业', 'tint': '#FFF4E3'},
                  {'id': 'buffett', 'short': '巴菲特', 'field': '商业', 'tint': '#EAF9EF'},
                  {'id': 'laotzu', 'short': '老子', 'field': '智慧', 'tint': '#E9F5FB'}],
        'rounds': [
            ['接不接班是伪命题，真命题是：这家茶餐厅在新的竞争里还有没有增长曲线。有，接班是上杠杆；没有，接班是接盘。',
             '我只做我看得懂的生意，也只接我看得懂的班。二代先回答：你比职业经理人强在哪？如果答案是「我爸是我爸」，那不算。',
             '治大国若烹小鲜，治茶餐厅亦然。火候未到就翻锅，鲜味全散。父辈还在，何必急着掌勺？'],
            ['@老子 但餐饮的窗口期不等人。奶茶店三年洗牌一次，老火慢煨等得起，市场等不起。我建议设立三个月的影子接班：跟着做，用数据证明自己。',
             '@张一鸣 这个我同意，正是我说的让子女从小额生意练手。别一上来接整个盘子，先接一个店，做亏了算学费，做赚了再谈接班。',
             '二位讲的是进，我讲的是守。想休息的创始人也该有告老还乡的自由。硬撑着不放手，反而是对儿女最大的掣肘。'],
            ['所以路径清晰了：先进店打工三个月，再承包一个门店一年，最后谈整体接班。每一步都有退出机制。',
             '补充：接班的本质是接一套系统。把菜单、供应链、熟客名单写成手册的那一刻，这家店才真正属于你。',
             '功成事遂，百姓皆谓我自然。最好的接班，是街坊感觉味道没变，而你知道一切都已焕新。'],
            ['最后提醒：接班不是继承偏爱，是接住责任。租金、人工、食材涨价曲线，都得装进你自己的脑子里。',
             '只有退潮的时候，才知道谁在裸泳。接手后的一年内别大改菜单，先学会在退潮期把店守住。',
             '知人者智，自知者明。接得住就接，接不住就让贤，强扭的接班，苦的是三代人。'],
        ],
    },
    'sq6': {
        'host': '珠江夜跑的Ken', 'watch': 45, 'mode': '快问快答', 'region': '广东', 'status': 'live',
        'topic': '百万年薪该不该回国发展？',
        'chars': [{'id': 'naval', 'short': '纳瓦尔', 'field': '智慧', 'tint': '#E8F8F3'},
                  {'id': 'karpathy', 'short': 'Karpathy', 'field': '科技', 'tint': '#EFF1FF'},
                  {'id': 'zhangxuefeng', 'short': '张雪峰', 'field': '生涯', 'tint': '#FFEEE8'}],
        'rounds': [
            ['别问该不该，问杠杆在哪。硅谷给你的是薪资杠杆，国内给你的可能是股权和市场规模杠杆。哪个能让你睡后收入增长，去哪个。',
             '技术判断：你在哪个生态能碰到最顶尖的问题，就去哪。问题决定成长速度，年薪只是成长的副产品。',
             '我说点实际的：回国不是回国，是回国卷。百万年薪在国内对应的是大厂 P8 往上，先看看你的赛道国内还有没有位置。'],
            ['@张雪峰 卷不卷取决于你是分蛋糕还是做蛋糕。带着技术回来做增量的人，卷不到你。',
             '补充：AI 这波浪潮，两地的问题质量都很高，但团队密度不同。选那个让你每天能跟高手吵架的地方。',
             '但家庭账也要算：父母年纪、配偶工作、孩子学籍。百万年薪听着风光，落地时候一家三口的安置费才是大头。'],
            ['总结：用十年后的自己视角选，别用下一份工资单选。',
             '我的答案是：去那个你晚上睡不着、因为兴奋而不是焦虑的地方。',
             '我的答案是：先请两周探亲假回去面试一圈，拿到 offer 再决定。选择权在手，才叫选择。'],
            ['补一句：别拿「国内的月亮圆」做决定，拿具体 offer 的含金量做决定。',
             '技术人的国家队在变强，回不回国，先看你解决的问题重不重要。',
             '真话最难听但最有用：工资高不高是次要，活得舒不舒服是主要。身体和家人才是本钱。'],
        ],
    },
    'sq7': {
        'host': '西湖边的 product 经理', 'watch': 68, 'mode': '深度圆桌', 'region': '江浙', 'status': 'live',
        'topic': 'AI 产品该不该免费引流？',
        'chars': [{'id': 'musk', 'short': '马斯克', 'field': '科技', 'tint': '#FFEDE6'},
                  {'id': 'naval', 'short': '纳瓦尔', 'field': '智慧', 'tint': '#E8F8F3'},
                  {'id': 'moyan', 'short': '莫言', 'field': '创作', 'tint': '#FDEEF4'}],
        'rounds': [
            ['免费不是策略，是物理。当边际成本趋近于零，价格必然趋向于零。你要做的不是收费，是找到涨价的那一层。',
             '免费的是获客成本。算清楚 LTV 再谈免费：免费用户的终身价值覆盖不了推理成本，免费就是慢性自杀。',
             '我这个外行讲个故事：集市上先送一碗汤的摊子生意最好，但只送汤不卖肉的，最后都饿死了。'],
            ['@纳瓦尔 对，所以分层：底层模型免费引流，上层智能和集成收费。就像道路免费，收费站设在出口。',
             '@马斯克 同意，但补充：免费层必须设用量护栏，否则你的免费用户会是你最贵的负债。2% 的用户能烧掉 98% 的算力。',
             '所以送汤也要限碗。人心是这样的：白来的不珍惜，涨价了才觉得是好东西。'],
            ['最后说一句：免费的终极目的不是流量，是数据飞轮。用得越多，产品越聪明，护城河越深。',
             '记住公式：免费引流可以，但 CAC < LTV 这条线不能破。破了，烧的不是钱，是你的时间。',
             '那我就收个尾：让用户欠你一点情，比让他欠你一点钱更值钱。故事讲得好，免费也能变成口碑的引子。'],
            ['举个手边的例子：星链在灾区免费开放，品牌资产的价值远超那点流量费。免费要用在刀刃上。',
             '品牌免费、产品收费，这是两本账，别混着算。混着算的公司，最后两头都收不回来。',
             '讲故事的人都知道：先让人白听一段，后面卖书才有底气。可白听的那段，也得是真功夫。'],
        ],
    },
}


def seed_demo():
    """演示桌播种（启动时 + /api/live/list 懒触发，幂等）：yln_live 缺哪张补哪张，msgs 置空等客户端打开时按轮续播"""
    conn = db()
    try:
        now = int(time.time() * 1000)
        for lid, s in DEMO_SCRIPTS.items():
            if conn.execute('SELECT 1 FROM yln_live WHERE live_id=?', (lid,)).fetchone():
                continue
            meta = {
                'liveId': lid, 'title': s['topic'], 'topic': s['topic'],
                'ownerNick': s['host'], 'host': s['host'], 'watch': s['watch'],
                'mode': s['mode'], 'region': s['region'], 'source': 'demo',
                'chars': s['chars'], 'status': s['status'], 'public': True,
                'messages': [], 'released': 0, 'created': now, 'updated': now,
            }
            upsert(conn, 'yln_live', ['live_id'], ['json', 'updated'],
                   {'live_id': lid, 'owner': 'demo', 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
    finally:
        conn.close()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS distill_task (
    id TEXT PRIMARY KEY,
    name TEXT, dir TEXT, status TEXT,
    conf INTEGER, match INTEGER,
    total_ms INTEGER, tok TEXT, t0 INTEGER,
    json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS skill_library (
    id TEXT PRIMARY KEY,
    name TEXT, skill_md TEXT,
    json TEXT, created INTEGER, updated INTEGER
);
CREATE TABLE IF NOT EXISTS node_log (
    id TEXT PRIMARY KEY,
    task_id TEXT, json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS admin_char (
    id TEXT PRIMARY KEY,
    name TEXT, json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_user (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nick TEXT, pwd_hash TEXT,
    plan TEXT, plan_until INTEGER,
    created INTEGER
);
CREATE TABLE IF NOT EXISTS yln_session (
    token TEXT PRIMARY KEY,
    user_id TEXT, created INTEGER
);
CREATE TABLE IF NOT EXISTS yln_admin (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    pwd_hash TEXT, created INTEGER
);
CREATE TABLE IF NOT EXISTS yln_admin_session (
    token TEXT PRIMARY KEY,
    admin_id TEXT, created INTEGER
);
CREATE TABLE IF NOT EXISTS yln_wallet (
    user_id TEXT PRIMARY KEY,
    json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_user_char (
    user_id TEXT PRIMARY KEY,
    json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_nuwa_prompt (
    id TEXT PRIMARY KEY,
    text TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_round (
    user_id TEXT PRIMARY KEY,
    json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_prefs (
    user_id TEXT PRIMARY KEY,
    json TEXT, updated INTEGER
);
CREATE TABLE IF NOT EXISTS yln_live (
    live_id TEXT PRIMARY KEY,
    owner TEXT,
    json TEXT, updated INTEGER
);
"""


def db():
    """每请求独立连接（LAN 单用户场景，零依赖最稳）"""
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def _hash_pwd(pwd, salt=None):
    """PBKDF2-SHA256 加盐哈希；存储格式 pbkdf2$salt_hex$hash_hex"""
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', pwd.encode('utf-8'), bytes.fromhex(salt), 60000)
    return f'pbkdf2${salt}${h.hex()}'


def _check_pwd(pwd, stored):
    """恒定时间比较，防时序侧信道"""
    try:
        _, salt, _ = str(stored).split('$')
    except Exception:
        return False
    return hmac.compare_digest(_hash_pwd(pwd, salt), str(stored))


def _pub_user(row):
    """对外用户形状（id/nick/email/plan/planUntil/created；绝不含密码哈希）"""
    return {'id': row[0], 'nick': row[2] or '', 'email': row[1],
            'plan': row[4] or None, 'planUntil': row[5] or None, 'created': row[6] or 0}


def init_db():
    conn = db()
    try:
        conn.executescript(_SCHEMA)
        if ADMIN_EMAIL and ADMIN_PASSWORD:
            conn.execute(
                "INSERT INTO yln_admin (id,email,pwd_hash,created) VALUES ('admin',?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET email=excluded.email,pwd_hash=excluded.pwd_hash",
                (ADMIN_EMAIL, _hash_pwd(ADMIN_PASSWORD), int(time.time() * 1000)))
        conn.commit()
    finally:
        conn.close()


def upsert(conn, table, key_cols, cols, data):
    """通用 upsert：key_cols 主键列，cols 数据列（从 data dict 取）"""
    keys = [str(data.get(k)) for k in key_cols]
    vals = [data.get(c) for c in cols]
    sql = (f"INSERT INTO {table} ({','.join(key_cols + cols)}) "
           f"VALUES ({','.join('?' * (len(key_cols) + len(cols)))}) "
           f"ON CONFLICT({','.join(key_cols)}) DO UPDATE SET "
           + ','.join(f'{c}=excluded.{c}' for c in cols))
    conn.execute(sql, keys + vals)
    conn.commit()


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """所有响应带 no-store：静态站点改代码后刷新即生效；/api/* 走 SQLite"""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 安静模式：LAN 长跑不刷日志

    # ---------- API 工具 ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return {}

    def _token(self):
        h = self.headers.get('Authorization') or ''
        return h[7:] if h.startswith('Bearer ') else ''

    def _auth(self):
        """解析用户 Bearer token → user_id / None（session 表可撤销）。"""
        token = self._token()
        if not token:
            return None
        conn = db()
        try:
            row = conn.execute('SELECT user_id FROM yln_session WHERE token=?', (token,)).fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    def _admin_auth(self):
        token = self._token()
        if not token:
            return None
        conn = db()
        try:
            row = conn.execute('SELECT admin_id FROM yln_admin_session WHERE token=?', (token,)).fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    def _require_admin(self):
        if self._admin_auth():
            return True
        self._json({'ok': False, 'err': '管理员未登录'}, 401)
        return False

    def _events(self):
        """SSE 只从 Authorization 取身份，禁止 URL token 泄漏；断线由客户端重连。"""
        admin = self._admin_auth()
        uid = None if admin else self._auth()
        if self._token() and not admin and not uid:
            return self._json({'ok': False, 'err': '会话已失效'}, 401)
        client = EVENTS.subscribe(uid=uid, admin=bool(admin))
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            self.wfile.write(b': connected\nretry: 2000\n\n')
            self.wfile.flush()
            while True:
                try:
                    event = client['queue'].get(timeout=15)
                    payload = json.dumps(event, ensure_ascii=False)
                    self.wfile.write(('event: update\ndata: ' + payload + '\n\n').encode('utf-8'))
                except queue.Empty:
                    self.wfile.write(b': heartbeat\n\n')
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            EVENTS.unsubscribe(client)
            self.close_connection = True

    # ---------- API 路由 ----------
    def _api(self, path, qs):
        now = int(time.time() * 1000)
        q = qs if qs is not None else {}
        if path == '/api/events':
            if self.command != 'GET':
                return self._json({'ok': False, 'err': 'method not allowed'}, 405)
            return self._events()
        if path == '/api/admin/login':
            if self.command != 'POST':
                return self._json({'ok': False, 'err': 'method not allowed'}, 405)
            d = self._body()
            email = str(d.get('email') or '').strip().lower()
            pwd = str(d.get('pwd') or '')
            conn = db()
            try:
                row = conn.execute('SELECT id,email,pwd_hash FROM yln_admin WHERE email=?', (email,)).fetchone()
                if not row or not _check_pwd(pwd, row[2]):
                    return self._json({'ok': False, 'err': '管理员邮箱或密码不正确'}, 401)
                token = secrets.token_hex(32)
                conn.execute('INSERT INTO yln_admin_session (token,admin_id,created) VALUES (?,?,?)',
                             (token, row[0], now))
                conn.commit()
                return self._json({'ok': True, 'token': token, 'admin': {'id': row[0], 'email': row[1]}})
            finally:
                conn.close()
        if path.startswith('/api/admin/') and not self._require_admin():
            return None
        if path == '/api/health':
            # 健康检查（服务化契约见 content-agent contracts/yunilaoyou.contract.md）
            # 兼容旧字段 ok/ts，新增 version/deps
            db_ok = False
            try:
                c = db()
                c.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='yln_nuwa_prompt'").fetchone()
                db_ok = True
                c.close()
            except Exception:
                pass
            return self._json({'ok': True, 'version': SERVER_VERSION, 'ts': now, 'deps': {'db': db_ok}})
        if path == '/api/traces':
            if self.command == 'GET':
                conn = db()
                try:
                    rows = conn.execute('SELECT id, json FROM node_log ORDER BY updated DESC LIMIT 200').fetchall()
                finally:
                    conn.close()
                return self._json({'traces': [json.loads(r[1]) for r in rows if r[1]]})
            if self.command == 'POST':
                d = self._body()
                if not d.get('id'):
                    return self._json({'ok': False, 'err': 'missing id'}, 400)
                conn = db()
                try:
                    upsert(conn, 'node_log', ['id'], ['task_id', 'json', 'updated'],
                           {'id': d['id'], 'task_id': d.get('id'), 'json': json.dumps(d, ensure_ascii=False), 'updated': now})
                    # distill_task 同步落地（观测主表）
                    upsert(conn, 'distill_task', ['id'],
                           ['name', 'dir', 'status', 'conf', 'match', 'total_ms', 'tok', 't0', 'json', 'updated'],
                           {'id': d['id'], 'name': d.get('name'), 'dir': d.get('dir'), 'status': d.get('status'),
                            'conf': d.get('conf'), 'match': (d.get('probe') or {}).get('score'),
                            'total_ms': d.get('totalMs'), 'tok': json.dumps(d.get('tok')), 't0': d.get('t0'),
                            'json': json.dumps(d, ensure_ascii=False), 'updated': now})
                finally:
                    conn.close()
                EVENTS.publish('admin')
                return self._json({'ok': True})
        if path == '/api/tasks':
            if self.command == 'GET':
                conn = db()
                try:
                    rows = conn.execute('SELECT id, json FROM distill_task ORDER BY t0 DESC LIMIT 500').fetchall()
                finally:
                    conn.close()
                return self._json({'tasks': [json.loads(r[1]) for r in rows if r[1]]})
            if self.command == 'POST':
                d = self._body()
                if not d.get('id'):
                    return self._json({'ok': False, 'err': 'missing id'}, 400)
                conn = db()
                try:
                    upsert(conn, 'distill_task', ['id'],
                           ['name', 'dir', 'status', 'conf', 'match', 'total_ms', 'tok', 't0', 'json', 'updated'],
                           {'id': d['id'], 'name': d.get('name'), 'dir': d.get('dir'), 'status': d.get('status'),
                            'conf': d.get('conf'), 'match': d.get('match'),
                            'total_ms': d.get('totalMs'), 'tok': json.dumps(d.get('tok')), 't0': d.get('t0'),
                            'json': json.dumps(d, ensure_ascii=False), 'updated': now})
                finally:
                    conn.close()
                EVENTS.publish('admin')
                return self._json({'ok': True})
        if path == '/api/skills':
            if self.command == 'GET':
                conn = db()
                try:
                    rows = conn.execute('SELECT id, json FROM skill_library ORDER BY created DESC LIMIT 500').fetchall()
                finally:
                    conn.close()
                return self._json({'skills': [json.loads(r[1]) for r in rows if r[1]]})
            if self.command == 'POST':
                d = self._body()
                if not d.get('id'):
                    return self._json({'ok': False, 'err': 'missing id'}, 400)
                conn = db()
                try:
                    upsert(conn, 'skill_library', ['id'],
                           ['name', 'skill_md', 'json', 'created', 'updated'],
                           {'id': d['id'], 'name': d.get('name'), 'skill_md': d.get('skillMd', ''),
                            'json': json.dumps(d, ensure_ascii=False),
                            'created': d.get('created') or now, 'updated': now})
                finally:
                    conn.close()
                EVENTS.publish('admin')
                return self._json({'ok': True})
            if self.command == 'DELETE':
                sid = (qs.get('id') or [''])[0]
                if not sid:
                    return self._json({'ok': False, 'err': 'missing id'}, 400)
                conn = db()
                try:
                    conn.execute('DELETE FROM skill_library WHERE id=?', (sid,))
                    conn.commit()
                finally:
                    conn.close()
                EVENTS.publish('admin')
                return self._json({'ok': True})
        if path == '/api/chars':
            if self.command == 'GET':
                conn = db()
                try:
                    rows = conn.execute('SELECT json FROM admin_char ORDER BY rowid').fetchall()
                finally:
                    conn.close()
                return self._json({'chars': [json.loads(r[0]) for r in rows if r[0]]})
            if self.command == 'POST':
                if not self._require_admin():
                    return None
                d = self._body()
                chars = d.get('chars')
                if not isinstance(chars, list):
                    return self._json({'ok': False, 'err': 'chars array required'}, 400)
                conn = db()
                try:
                    conn.execute('BEGIN')
                    conn.execute('DELETE FROM admin_char')
                    conn.executemany(
                        'INSERT OR REPLACE INTO admin_char (id, name, json, updated) VALUES (?, ?, ?, ?)',
                        [(str(c.get('id')), str(c.get('name') or ''),
                          json.dumps(c, ensure_ascii=False), now) for c in chars if c.get('id')])
                    conn.commit()
                finally:
                    conn.close()
                EVENTS.publish('chars')
                EVENTS.publish('admin')
                return self._json({'ok': True, 'count': len(chars)})
        # ---------- P0 鉴权：账号与会话（yln_user / yln_session，Bearer token 可撤销） ----------
        if path == '/api/auth/signup':
            if self.command != 'POST':
                return self._json({'ok': False, 'err': 'method not allowed'}, 405)
            d = self._body()
            email = str(d.get('email') or '').strip().lower()
            nick = str(d.get('nick') or '').strip()
            pwd = str(d.get('pwd') or '')
            if '@' not in email:
                return self._json({'ok': False, 'err': '邮箱格式不对，检查一下？'}, 400)
            if not nick:
                return self._json({'ok': False, 'err': '给自己起个称呼吧'}, 400)
            if len(pwd) < 4:
                return self._json({'ok': False, 'err': '密码至少 4 位'}, 400)
            conn = db()
            try:
                if conn.execute('SELECT 1 FROM yln_user WHERE email=?', (email,)).fetchone():
                    return self._json({'ok': False, 'err': '该邮箱已注册，直接登录即可'}, 400)
                uid = 'u' + secrets.token_hex(8)
                conn.execute('INSERT INTO yln_user (id,email,nick,pwd_hash,plan,plan_until,created) VALUES (?,?,?,?,?,?,?)',
                             (uid, email, nick, _hash_pwd(pwd), None, 0, now))
                token = secrets.token_hex(32)
                conn.execute('INSERT INTO yln_session (token,user_id,created) VALUES (?,?,?)', (token, uid, now))
                conn.commit()
                row = conn.execute('SELECT id,email,nick,pwd_hash,plan,plan_until,created FROM yln_user WHERE id=?',
                                   (uid,)).fetchone()
            finally:
                conn.close()
            return self._json({'ok': True, 'token': token, 'user': _pub_user(row)})
        if path == '/api/auth/login':
            if self.command != 'POST':
                return self._json({'ok': False, 'err': 'method not allowed'}, 405)
            d = self._body()
            email = str(d.get('email') or '').strip().lower()
            pwd = str(d.get('pwd') or '')
            conn = db()
            try:
                row = conn.execute('SELECT id,email,nick,pwd_hash,plan,plan_until,created FROM yln_user WHERE email=?',
                                   (email,)).fetchone()
                if not row:
                    return self._json({'ok': False, 'err': '邮箱尚未注册'}, 400)
                if not _check_pwd(pwd, row[3]):
                    return self._json({'ok': False, 'err': '密码不正确，再想想？'}, 400)
                token = secrets.token_hex(32)
                conn.execute('INSERT INTO yln_session (token,user_id,created) VALUES (?,?,?)', (token, row[0], now))
                conn.commit()
            finally:
                conn.close()
            return self._json({'ok': True, 'token': token, 'user': _pub_user(row)})
        if path == '/api/auth/me':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '未登录'}, 401)
            conn = db()
            try:
                row = conn.execute('SELECT id,email,nick,pwd_hash,plan,plan_until,created FROM yln_user WHERE id=?',
                                   (uid,)).fetchone()
            finally:
                conn.close()
            if not row:
                return self._json({'ok': False, 'err': '账号不存在'}, 401)
            return self._json({'ok': True, 'user': _pub_user(row)})
        if path == '/api/auth/logout':
            h = self.headers.get('Authorization') or ''
            if h.startswith('Bearer '):
                conn = db()
                try:
                    conn.execute('DELETE FROM yln_session WHERE token=?', (h[7:],))
                    conn.commit()
                finally:
                    conn.close()
            return self._json({'ok': True})  # 幂等：无有效 token 也返回成功，保证客户端退出必成
        # ---------- P1 钱包：yln_wallet 表为跨端资产唯一事实源（updated 时间戳 LWW 合并） ----------
        if path == '/api/wallet':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '未登录'}, 401)
            if self.command == 'GET':
                conn = db()
                try:
                    row = conn.execute('SELECT json FROM yln_wallet WHERE user_id=?', (uid,)).fetchone()
                finally:
                    conn.close()
                return self._json({'ok': True, 'wallet': json.loads(row[0]) if row and row[0] else None})
            if self.command == 'POST':
                d = self._body()
                w = d.get('wallet')
                if not isinstance(w, dict) or not isinstance(w.get('points'), (int, float)):
                    return self._json({'ok': False, 'err': 'wallet object required'}, 400)
                conn = db()
                try:
                    upsert(conn, 'yln_wallet', ['user_id'], ['json', 'updated'],
                           {'user_id': uid, 'json': json.dumps(w, ensure_ascii=False),
                            'updated': int(w.get('updated') or now)})
                    # plan/plan_until 镜像到 yln_user，保证 /api/auth/me 返回的档位与钱包一致
                    plan = w.get('plan')
                    if plan:
                        row2 = conn.execute('SELECT plan_until FROM yln_user WHERE id=?', (uid,)).fetchone()
                        pu = w.get('planUntil')
                        if plan == 'free':
                            pu = 0
                        elif not pu:
                            pu = (row2[0] if row2 else 0) or 0
                        conn.execute('UPDATE yln_user SET plan=?, plan_until=? WHERE id=?', (plan, pu, uid))
                        conn.commit()
                finally:
                    conn.close()
                EVENTS.publish('wallet', uid=uid)
                EVENTS.publish('admin')
                return self._json({'ok': True})
        # ---------- P2 私有老友：yln_user_char 表为跨端老友唯一事实源（updated 时间戳 LWW 合并，全量替换） ----------
        if path == '/api/my/chars':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '未登录'}, 401)
            if self.command == 'GET':
                conn = db()
                try:
                    row = conn.execute('SELECT json, updated FROM yln_user_char WHERE user_id=?', (uid,)).fetchone()
                finally:
                    conn.close()
                return self._json({'ok': True,
                                   'chars': json.loads(row[0]) if row and row[0] else None,
                                   'updated': row[1] if row else 0})
            if self.command == 'POST':
                d = self._body()
                c = d.get('chars')
                if not isinstance(c, dict):
                    return self._json({'ok': False, 'err': 'chars object required'}, 400)
                conn = db()
                try:
                    upsert(conn, 'yln_user_char', ['user_id'], ['json', 'updated'],
                           {'user_id': uid, 'json': json.dumps(c, ensure_ascii=False),
                            'updated': int(d.get('updated') or now)})
                finally:
                    conn.close()
                EVENTS.publish('my_chars', uid=uid)
                EVENTS.publish('admin')
                return self._json({'ok': True})
        # ---------- P3 圆桌会话：yln_round 表为跨端圆桌唯一事实源（updated 时间戳 LWW 合并，全量数组替换，含实录 cache） ----------
        if path == '/api/my/rounds':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '未登录'}, 401)
            if self.command == 'GET':
                conn = db()
                try:
                    row = conn.execute('SELECT json, updated FROM yln_round WHERE user_id=?', (uid,)).fetchone()
                finally:
                    conn.close()
                return self._json({'ok': True,
                                   'rounds': json.loads(row[0]) if row and row[0] else None,
                                   'updated': row[1] if row else 0})
            if self.command == 'POST':
                d = self._body()
                rs = d.get('rounds')
                if not isinstance(rs, list):
                    return self._json({'ok': False, 'err': 'rounds array required'}, 400)
                conn = db()
                try:
                    upsert(conn, 'yln_round', ['user_id'], ['json', 'updated'],
                           {'user_id': uid, 'json': json.dumps(rs, ensure_ascii=False),
                            'updated': int(d.get('updated') or now)})
                finally:
                    conn.close()
                EVENTS.publish('rounds', uid=uid)
                EVENTS.publish('admin')
                return self._json({'ok': True})
        # ---------- P4 偏好设置：yln_prefs 表（设备级设置，服务器为准 + 写穿，不做 LWW） ----------
        if path == '/api/my/prefs':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '未登录'}, 401)
            if self.command == 'GET':
                conn = db()
                try:
                    row = conn.execute('SELECT json FROM yln_prefs WHERE user_id=?', (uid,)).fetchone()
                finally:
                    conn.close()
                return self._json({'ok': True, 'prefs': json.loads(row[0]) if row and row[0] else None})
            if self.command == 'POST':
                d = self._body()
                p = d.get('prefs')
                if not isinstance(p, dict):
                    return self._json({'ok': False, 'err': 'prefs object required'}, 400)
                conn = db()
                try:
                    upsert(conn, 'yln_prefs', ['user_id'], ['json', 'updated'],
                           {'user_id': uid, 'json': json.dumps(p, ensure_ascii=False), 'updated': now})
                finally:
                    conn.close()
                EVENTS.publish('prefs', uid=uid)
                return self._json({'ok': True})
        # ---------- P5 广场直播流：yln_live 表（独立直播流，逐条追加，围观者共享同一条消息流） ----------
        if path == '/api/live/open':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '开播需要先登录'}, 401)
            d = self._body()
            lid = str(d.get('liveId') or '')
            if not lid:
                return self._json({'ok': False, 'err': 'missing liveId'}, 400)
            meta = {
                'liveId': lid,
                'title': str(d.get('title') or d.get('topic') or '公开圆桌'),
                'topic': str(d.get('topic') or ''),
                'ownerNick': str(d.get('ownerNick') or '主播'),
                'chars': d.get('chars') or [],
                'status': 'live', 'public': True,
                'messages': [], 'created': now, 'updated': now,
            }
            conn = db()
            try:
                row = conn.execute('SELECT owner,json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
                if row:
                    old = json.loads(row[1])
                    if row[0] != uid or old.get('source') == 'demo':
                        return self._json({'ok': False, 'err': '无权接管该直播'}, 403)
                upsert(conn, 'yln_live', ['live_id'], ['owner', 'json', 'updated'],
                       {'live_id': lid, 'owner': uid, 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
            finally:
                conn.close()
            EVENTS.publish('live')
            EVENTS.publish('admin')
            return self._json({'ok': True})
        if path == '/api/live/post':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '插话需要先登录'}, 401)
            d = self._body()
            lid = str(d.get('liveId') or '')
            msgs = d.get('msgs')
            if not lid or not isinstance(msgs, list):
                return self._json({'ok': False, 'err': 'liveId + msgs required'}, 400)
            conn = db()
            try:
                row = conn.execute('SELECT owner,json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
                if not row:
                    return self._json({'ok': False, 'err': 'live not found'}, 404)
                if row[0] != uid:
                    return self._json({'ok': False, 'err': '仅主播可操作自己的直播'}, 403)
                meta = json.loads(row[1])
                if meta.get('status') != 'live':
                    return self._json({'ok': False, 'err': 'live closed'}, 409)
                meta.setdefault('messages', []).extend(msgs)
                meta['updated'] = now
                upsert(conn, 'yln_live', ['live_id'], ['json', 'updated'],
                       {'live_id': lid, 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
                total = len(meta['messages'])
            finally:
                conn.close()
            EVENTS.publish('live')
            EVENTS.publish('admin')
            return self._json({'ok': True, 'total': total})
        if path == '/api/live/close':
            uid = self._auth()
            if not uid:
                return self._json({'ok': False, 'err': '关播需要先登录'}, 401)
            d = self._body()
            lid = str(d.get('liveId') or '')
            if not lid:
                return self._json({'ok': False, 'err': 'missing liveId'}, 400)
            conn = db()
            try:
                row = conn.execute('SELECT owner,json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
                if not row:
                    return self._json({'ok': False, 'err': 'live not found'}, 404)
                if row[0] != uid:
                    return self._json({'ok': False, 'err': '仅主播可关闭自己的直播'}, 403)
                meta = json.loads(row[1])
                meta['status'] = 'done'
                meta['updated'] = now
                upsert(conn, 'yln_live', ['live_id'], ['json', 'updated'],
                       {'live_id': lid, 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
            finally:
                conn.close()
            EVENTS.publish('live')
            EVENTS.publish('admin')
            return self._json({'ok': True})
        # ---------- P5 广场直播流：公开读（局域网信任，围观无需 token）；直播+收官流都返回，手机端广场归档区同步 ----------
        if path == '/api/live/list':
            seed_demo()   # 懒播种：演示桌缺哪张补哪张（幂等），确保广场 LIVE 区/归档区始终有服务器剧本桌
            conn = db()
            try:
                rows = conn.execute('SELECT json FROM yln_live ORDER BY updated DESC').fetchall()
            finally:
                conn.close()
            lives = []
            for (r,) in rows:
                m = json.loads(r)
                if m.get('public'):
                    lives.append({'liveId': m['liveId'], 'title': m.get('title') or '', 'topic': m.get('topic') or '',
                                  'ownerNick': m.get('ownerNick') or '主播', 'chars': m.get('chars') or [],
                                  'count': len(m.get('messages') or []), 'status': m.get('status'),
                                  'source': m.get('source') or '', 'mode': m.get('mode') or '',
                                  'region': m.get('region') or '', 'watch': m.get('watch') or 0,
                                  'updated': m.get('updated') or 0})
            return self._json({'ok': True, 'lives': lives})
        if path == '/api/live/stream':
            lid = (q.get('liveId') or [''])[0]
            after = int((q.get('after') or ['0'])[0] or 0)
            if not lid:
                return self._json({'ok': False, 'err': 'missing liveId'}, 400)
            conn = db()
            try:
                row = conn.execute('SELECT json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
            finally:
                conn.close()
            if not row:
                return self._json({'ok': False, 'err': 'live not found'}, 404)
            m = json.loads(row[0])
            if not m.get('public'):
                return self._json({'ok': False, 'err': 'live not found'}, 404)
            msgs = m.get('messages') or []
            return self._json({'ok': True, 'status': m.get('status'), 'title': m.get('title') or '',
                               'topic': m.get('topic') or '', 'chars': m.get('chars') or [],
                               'source': m.get('source') or '',
                               'total': len(msgs), 'msgs': msgs[after:] if after <= len(msgs) else []})
        # ---------- 演示桌剧本续播：每次打开续播「下一轮组」（默认 3 轮 × 每轮全员 1 条），剧本放完循环 ----------
        if path == '/api/live/demo_next':
            lid = (q.get('liveId') or [''])[0]
            try:
                rounds = max(1, int((q.get('rounds') or ['3'])[0] or 3))
            except Exception:
                rounds = 3
            if not lid:
                return self._json({'ok': False, 'err': 'missing liveId'}, 400)
            conn = db()
            try:
                row = conn.execute('SELECT json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
                if not row:
                    return self._json({'ok': False, 'err': 'live not found'}, 404)
                meta = json.loads(row[0])
                if meta.get('source') != 'demo':
                    return self._json({'ok': False, 'err': 'not a demo stream'}, 400)
                if meta.get('status') != 'live':
                    return self._json({'ok': False, 'err': 'live closed'}, 409)
                script = DEMO_SCRIPTS.get(lid)
                if not script:
                    return self._json({'ok': False, 'err': 'no script'}, 404)
                rel = meta.get('released') or 0
                all_rounds = script['rounds']
                msgs = []
                for k in range(rounds):
                    idx = (rel + k) % len(all_rounds)
                    for i, t in enumerate(all_rounds[idx]):
                        msgs.append({'type': 'msg', 'who': script['chars'][i]['id'], 'text': t, 'ts': now + k * 10 + i})
                meta.setdefault('messages', []).extend(msgs)
                meta['released'] = rel + rounds
                meta['updated'] = now
                upsert(conn, 'yln_live', ['live_id'], ['json', 'updated'],
                       {'live_id': lid, 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
                total = len(meta['messages'])
            finally:
                conn.close()
            EVENTS.publish('live')
            EVENTS.publish('admin')
            return self._json({'ok': True, 'added': msgs, 'total': total})
        # ---------- 管理员会话 ----------
        if path == '/api/admin/me':
            aid = self._admin_auth()
            conn = db()
            try:
                row = conn.execute('SELECT id,email FROM yln_admin WHERE id=?', (aid,)).fetchone()
            finally:
                conn.close()
            if not row:
                return self._json({'ok': False, 'err': '管理员不存在'}, 401)
            return self._json({'ok': True, 'admin': {'id': row[0], 'email': row[1]}})
        if path == '/api/admin/logout':
            conn = db()
            try:
                conn.execute('DELETE FROM yln_admin_session WHERE token=?', (self._token(),))
                conn.commit()
            finally:
                conn.close()
            return self._json({'ok': True})
        # ---------- 隐私级用户详情：仅独立管理员会话可查，不再使用共享硬编码口令 ----------
        if path == '/api/admin/user/privacy':
            uid = (q.get('uid') or [''])[0]
            if not uid:
                return self._json({'ok': False, 'err': 'missing uid'}, 400)
            conn = db()
            try:
                def one_json(sql, args):
                    r = conn.execute(sql, args).fetchone()
                    return json.loads(r[0]) if r and r[0] else None
                r = conn.execute('SELECT id,email,nick,plan,plan_until,created FROM yln_user WHERE id=?', (uid,)).fetchone()
                prof = ({'id': r[0], 'email': r[1], 'nick': r[2], 'plan': r[3], 'plan_until': r[4], 'created': r[5]} if r else None)
                wal = one_json('SELECT json FROM yln_wallet WHERE user_id=?', (uid,))
                rounds = one_json('SELECT json FROM yln_round WHERE user_id=?', (uid,)) or []
                chars = one_json('SELECT json FROM yln_user_char WHERE user_id=?', (uid,)) or []
                return self._json({'ok': True, 'profile': prof, 'wallet': wal, 'rounds': rounds, 'chars': chars})
            finally:
                conn.close()
        # ---------- 广场直播管理：全量流（含已收官）+ 强制关播 ----------
        if path == '/api/admin/live':
            conn = db()
            try:
                rows = conn.execute('SELECT live_id, json, updated FROM yln_live ORDER BY updated DESC').fetchall()
            finally:
                conn.close()
            lives = []
            for (lid, r, up) in rows:
                m = json.loads(r)
                lives.append({'liveId': lid, 'title': m.get('title') or '', 'topic': m.get('topic') or '',
                              'ownerNick': m.get('ownerNick') or '', 'status': m.get('status'), 'forced': bool(m.get('forced')),
                              'source': m.get('source') or '',
                              'count': len(m.get('messages') or []), 'created': m.get('created'), 'updated': m.get('updated') or up})
            return self._json({'ok': True, 'lives': lives})
        if path == '/api/admin/live/close':
            d = self._body()
            lid = str(d.get('liveId') or '')
            if not lid:
                return self._json({'ok': False, 'err': 'missing liveId'}, 400)
            conn = db()
            try:
                row = conn.execute('SELECT json FROM yln_live WHERE live_id=?', (lid,)).fetchone()
                if not row:
                    return self._json({'ok': False, 'err': 'live not found'}, 404)
                meta = json.loads(row[0])
                meta['status'] = 'done'
                meta['forced'] = True
                meta['updated'] = now
                upsert(conn, 'yln_live', ['live_id'], ['json', 'updated'],
                       {'live_id': lid, 'owner': '', 'json': json.dumps(meta, ensure_ascii=False), 'updated': now})
            finally:
                conn.close()
            EVENTS.publish('live')
            EVENTS.publish('admin')
            return self._json({'ok': True})
        # ---------- P2 女娲 Prompt 热编辑：yln_nuwa_prompt 表为跨端唯一事实源（单条 upsert，text 空=删覆盖） ----------
        if path == '/api/nuwa/prompts':
            if self.command == 'GET':
                conn = db()
                try:
                    rows = conn.execute('SELECT id, text FROM yln_nuwa_prompt').fetchall()
                finally:
                    conn.close()
                return self._json({'ok': True, 'prompts': {r[0]: r[1] for r in rows if r[1] is not None}})
            if self.command == 'POST':
                if not self._require_admin():
                    return None
                d = self._body()
                pid = str(d.get('id') or '')
                if not pid:
                    return self._json({'ok': False, 'err': 'missing id'}, 400)
                text = d.get('text')
                conn = db()
                try:
                    if text is None or text == '':
                        conn.execute('DELETE FROM yln_nuwa_prompt WHERE id=?', (pid,))
                    else:
                        upsert(conn, 'yln_nuwa_prompt', ['id'], ['text', 'updated'],
                               {'id': pid, 'text': str(text), 'updated': now})
                    conn.commit()
                finally:
                    conn.close()
                EVENTS.publish('prompts')
                EVENTS.publish('admin')
                return self._json({'ok': True})
        if path == '/api/admin/wallet':
            if self.command == 'GET':
                uid = (qs.get('uid') or [''])[0]
                if not uid:
                    return self._json({'ok': False, 'err': 'missing uid'}, 400)
                conn = db()
                try:
                    row = conn.execute('SELECT json FROM yln_wallet WHERE user_id=?', (uid,)).fetchone()
                finally:
                    conn.close()
                return self._json({'ok': True, 'wallet': json.loads(row[0]) if row and row[0] else None})
            if self.command == 'POST':
                d = self._body()
                uid = str(d.get('uid') or '')
                patch = d.get('patch')
                if not uid or not isinstance(patch, dict):
                    return self._json({'ok': False, 'err': 'uid 与 patch 必填'}, 400)
                conn = db()
                try:
                    if not conn.execute('SELECT 1 FROM yln_user WHERE id=?', (uid,)).fetchone():
                        return self._json({'ok': False, 'err': '该用户未同步到服务器（本地游客号无法远程调整）'}, 404)
                    row = conn.execute('SELECT json FROM yln_wallet WHERE user_id=?', (uid,)).fetchone()
                    w = json.loads(row[0]) if row and row[0] else {'plan': 'free', 'points': 0, 'coupons': 5,
                                                                  'freeSpeaks': 3, 'freeDesk': 1, 'ledger': []}
                    for k in ('plan', 'planUntil', 'points', 'coupons', 'freeSpeaks', 'freeDesk'):
                        if k in patch:
                            w[k] = patch[k]
                    if d.get('note'):
                        w.setdefault('ledger', [])
                        w['ledger'].insert(0, {'t': now, 'n': str(d['note'])[:60], 'd': d.get('delta') or 0})
                        w['ledger'] = w['ledger'][:40]
                    w['updated'] = now
                    upsert(conn, 'yln_wallet', ['user_id'], ['json', 'updated'],
                           {'user_id': uid, 'json': json.dumps(w, ensure_ascii=False), 'updated': now})
                    plan = w.get('plan')
                    if plan:
                        pu = w.get('planUntil') or 0
                        conn.execute('UPDATE yln_user SET plan=?, plan_until=? WHERE id=?', (plan, pu, uid))
                        conn.commit()
                finally:
                    conn.close()
                EVENTS.publish('wallet', uid=uid)
                EVENTS.publish('admin')
                return self._json({'ok': True, 'wallet': w})
        return self._json({'ok': False, 'err': 'not found'}, 404)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith('/api/'):
            return self._api(u.path, parse_qs(u.query))
        super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path.startswith('/api/'):
            return self._api(u.path, parse_qs(u.query))
        self._json({'ok': False, 'err': 'not found'}, 404)

    def do_DELETE(self):
        u = urlparse(self.path)
        if u.path.startswith('/api/'):
            return self._api(u.path, parse_qs(u.query))
        self._json({'ok': False, 'err': 'not found'}, 404)


if __name__ == '__main__':
    init_db()
    seed_demo()   # 启动即播种演示桌（幂等），保证广场 LIVE 区/归档区与 Web 后台始终有数据可同步
    print(f'YLN dev server: http://0.0.0.0:{PORT} (Cache-Control: no-store, SQLite: {DB_FILE})', flush=True)
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), functools.partial(NoCacheHandler, directory='.'))
    server.daemon_threads = True
    try:
        server.serve_forever()
    finally:
        server.server_close()
