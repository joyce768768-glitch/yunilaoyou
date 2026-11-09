#!/usr/bin/env python3
"""真实 HTTP/SSE 功能测试：临时 SQLite + 独立端口，不读写项目 yln.db。"""
import http.client
import json
import os
import queue
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADMIN_EMAIL = 'admin@e2e.local'
ADMIN_PASSWORD = 'e2e-secret'
passed = 0
failed = []


def check(name, condition, detail=''):
    global passed
    if condition:
        passed += 1
        print('  PASS ' + name)
    else:
        failed.append(name)
        print('  FAIL ' + name + ((' — ' + str(detail)) if detail else ''))


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Api:
    def __init__(self, port):
        self.base = f'http://127.0.0.1:{port}'
        self.port = port

    def request(self, method, path, body=None, token=None):
        data = None if body is None else json.dumps(body).encode()
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode())


class SseClient:
    def __init__(self, port, token=None, path='/api/events'):
        self.events = queue.Queue()
        self.conn = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
        headers = {'Accept': 'text/event-stream'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        self.conn.request('GET', path, headers=headers)
        self.response = self.conn.getresponse()
        if self.response.status != 200:
            raise RuntimeError('SSE status ' + str(self.response.status))
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()

    def _read(self):
        try:
            while True:
                line = self.response.readline()
                if not line:
                    return
                if line.startswith(b'data: '):
                    self.events.put(json.loads(line[6:].decode()))
        except (OSError, ValueError):
            return

    def next(self, timeout=3):
        return self.events.get(timeout=timeout)

    def none(self, timeout=0.35):
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def close(self):
        try:
            self.response.close()
        finally:
            self.conn.close()


def signup(api, email, nick):
    status, body = api.request('POST', '/api/auth/signup', {
        'email': email, 'nick': nick, 'pwd': 'user-secret'
    })
    check('注册 ' + email, status == 200 and body.get('ok') and body.get('token'), body)
    return body.get('user'), body.get('token')


def main():
    port = free_port()
    with tempfile.TemporaryDirectory(prefix='yln-e2e-') as tmp:
        env = dict(os.environ, YLN_ADMIN_EMAIL=ADMIN_EMAIL, YLN_ADMIN_PASSWORD=ADMIN_PASSWORD)
        api = Api(port)
        # 仅临时副本替换随机端口，数据库仍落在临时工作目录。
        server_file = Path(tmp) / 'server.py'
        source = (ROOT / 'yln-server.py').read_text()
        source = source.replace("PORT = 8823", f"PORT = {port}", 1)
        server_file.write_text(source)
        proc = subprocess.Popen(
            [sys.executable, str(server_file)], cwd=tmp, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        clients = []
        try:
            ready = False
            for _ in range(60):
                if proc.poll() is not None:
                    break
                try:
                    status, body = api.request('GET', '/api/health')
                    if status == 200 and body.get('ok'):
                        ready = True
                        break
                except Exception:
                    time.sleep(0.1)
            check('临时服务启动且健康检查成功', ready)
            if not ready:
                proc.terminate()
                out, err = proc.communicate(timeout=5)
                print(err.decode(errors='replace'))
                return 1

            status, body = api.request('POST', '/api/admin/login', {
                'email': ADMIN_EMAIL, 'pwd': 'wrong'
            })
            check('管理员错误密码返回 401', status == 401 and not body.get('ok'), body)
            status, admin = api.request('POST', '/api/admin/login', {
                'email': ADMIN_EMAIL, 'pwd': ADMIN_PASSWORD
            })
            check('管理员正确登录', status == 200 and admin.get('token'), admin)
            admin_token = admin.get('token')
            status, body = api.request('GET', '/api/admin/me', token=admin_token)
            check('管理员 me 返回初始化邮箱', status == 200 and body.get('admin', {}).get('email') == ADMIN_EMAIL, body)

            for method, path, body in [
                ('GET', '/api/admin/me', None),
                ('GET', '/api/admin/user/privacy?uid=u_x', None),
                ('GET', '/api/admin/live', None),
                ('POST', '/api/admin/live/close', {'liveId': 'sq1'}),
                ('GET', '/api/admin/wallet?uid=u_x', None),
                ('POST', '/api/admin/wallet', {'uid': 'u_x', 'patch': {'points': 1}}),
                ('POST', '/api/admin/logout', None),
            ]:
                status, response = api.request(method, path, body)
                check(f'未登录 {method} {path} 返回 401', status == 401, response)

            user_a, token_a = signup(api, 'a@e2e.local', '用户A')
            user_b, token_b = signup(api, 'b@e2e.local', '用户B')
            status, body = api.request('GET', '/api/admin/me', token=token_a)
            check('普通用户 Token 不可访问管理员 API', status == 401, body)
            status, body = api.request('GET', '/api/auth/me', token=admin_token)
            check('管理员 Token 不可冒充普通用户', status == 401, body)

            for path in ['/api/wallet', '/api/my/chars', '/api/my/rounds', '/api/my/prefs']:
                status, body = api.request('GET', path)
                check(f'未登录读取 {path} 返回 401', status == 401, body)
                status, body = api.request('POST', path, {})
                check(f'未登录写入 {path} 返回 401', status == 401, body)

            status, body = api.request('POST', '/api/wallet', {
                'wallet': {'points': 120, 'plan': 'free', 'updated': 100}
            }, token_a)
            check('用户A写入自己的钱包', status == 200 and body.get('ok'), body)
            for path, key, expected in [
                ('/api/my/chars', 'chars', {'my_a': {'id': 'my_a', 'name': 'A老友'}}),
                ('/api/my/rounds', 'rounds', [{'id': 'ra', 'topic': 'A圆桌'}]),
                ('/api/my/prefs', 'prefs', {'dark': True, 'sound': False}),
            ]:
                status, body = api.request('POST', path, {key: expected}, token_a)
                check(f'用户A写入 {path}', status == 200 and body.get('ok'), body)
                status, body = api.request('GET', path, token=token_b)
                value = body.get(key)
                check(f'用户B读取 {path} 与用户A隔离', status == 200 and value is None, body)
                status, body = api.request('GET', path, token=token_a)
                check(f'用户A读回 {path} 数据一致', status == 200 and body.get(key) == expected, body)
            status, body = api.request('GET', '/api/wallet', token=token_b)
            check('用户B钱包与用户A隔离', status == 200 and body.get('wallet') is None, body)
            status, body = api.request('GET', '/api/wallet', token=token_a)
            check('用户A钱包读回一致', status == 200 and body.get('wallet', {}).get('points') == 120, body)

            status, body = api.request('POST', '/api/chars', {'chars': []}, token_a)
            check('普通用户不可写官方老友', status == 401, body)
            status, body = api.request('POST', '/api/nuwa/prompts', {'id': 'chat.solo', 'text': 'A篡改'}, token_a)
            check('普通用户不可写 Prompt', status == 401, body)
            status, body = api.request('POST', '/api/chars', {
                'chars': [{'id': 'official_e2e', 'name': '官方测试', 'published': True}]
            }, admin_token)
            check('管理员可写官方老友', status == 200 and body.get('ok'), body)
            status, body = api.request('POST', '/api/nuwa/prompts', {
                'id': 'chat.solo', 'text': '管理员模板'
            }, admin_token)
            check('管理员可写 Prompt', status == 200 and body.get('ok'), body)
            status, body = api.request('GET', '/api/nuwa/prompts')
            check('Prompt 写入后可公开读回', status == 200 and body.get('prompts', {}).get('chat.solo') == '管理员模板', body)

            for path, payload in [
                ('/api/live/open', {'liveId': 'live_a', 'topic': 'A直播'}),
                ('/api/live/post', {'liveId': 'live_a', 'msgs': []}),
                ('/api/live/close', {'liveId': 'live_a'}),
            ]:
                status, body = api.request('POST', path, payload)
                check(f'未登录 {path} 返回 401', status == 401, body)
            status, body = api.request('POST', '/api/live/open', {
                'liveId': 'live_a', 'topic': 'A直播', 'ownerNick': '用户A'
            }, token_a)
            check('用户A开播成功', status == 200 and body.get('ok'), body)
            for path, payload in [
                ('/api/live/open', {'liveId': 'live_a'}),
                ('/api/live/post', {'liveId': 'live_a', 'msgs': [{'type': 'user', 'text': 'B冒写'}]}),
                ('/api/live/close', {'liveId': 'live_a'}),
            ]:
                status, body = api.request('POST', path, payload, token_b)
                check(f'非 owner {path} 返回 403', status == 403, body)
            status, body = api.request('POST', '/api/live/post', {
                'liveId': 'live_a', 'msgs': [{'type': 'user', 'text': 'A发言'}]
            }, token_a)
            check('owner 写入直播消息成功', status == 200 and body.get('total') == 1, body)
            status, body = api.request('GET', '/api/live/stream?liveId=live_a&after=0')
            check('公开围观读回同一条消息', status == 200 and body.get('msgs', [{}])[0].get('text') == 'A发言', body)
            status, body = api.request('POST', '/api/live/open', {'liveId': 'sq1'}, token_a)
            check('普通用户不可冒领公共演示桌', status == 403, body)
            status, body = api.request('POST', '/api/live/post', {
                'liveId': 'sq1', 'msgs': [{'type': 'user', 'text': '冒写'}]
            }, token_a)
            check('普通用户不可写公共演示桌消息', status == 403, body)
            status, body = api.request('GET', '/api/live/demo_next?liveId=sq1&rounds=1')
            check('公共演示桌允许 demo_next 续播', status == 200 and body.get('ok') and len(body.get('added', [])) == 3, body)
            status, body = api.request('POST', '/api/admin/live/close', {'liveId': 'live_a'}, admin_token)
            check('管理员可强制关播', status == 200 and body.get('ok'), body)
            status, body = api.request('GET', '/api/admin/live', token=admin_token)
            live_a = next((x for x in body.get('lives', []) if x.get('liveId') == 'live_a'), {})
            check('后台直播列表显示 forced 状态', live_a.get('status') == 'done' and live_a.get('forced') is True, live_a)
            status, body = api.request('POST', '/api/live/post', {
                'liveId': 'live_a', 'msgs': [{'type': 'user', 'text': '关播后'}]
            }, token_a)
            check('关播后 owner 也不能继续写流', status == 409, body)

            public = SseClient(port)
            clients.append(public)
            query_client = SseClient(port, path='/api/events?token=' + token_a)
            clients.append(query_client)
            sse_a = SseClient(port, token_a)
            clients.append(sse_a)
            sse_b = SseClient(port, token_b)
            clients.append(sse_b)
            sse_admin = SseClient(port, admin_token)
            clients.append(sse_admin)
            time.sleep(0.15)

            status, body = api.request('POST', '/api/chars', {
                'chars': [{'id': 'official_sse', 'name': 'SSE官方', 'published': True}]
            }, admin_token)
            check('公共事件写入成功', status == 200)
            for name, client in [('公开连接', public), ('query连接', query_client), ('用户A连接', sse_a), ('用户B连接', sse_b), ('管理员连接', sse_admin)]:
                try:
                    event = client.next()
                    check(name + '收到 chars 公共事件', event.get('type') == 'chars', event)
                except queue.Empty:
                    check(name + '收到 chars 公共事件', False, 'timeout')
            check('公开连接不接收 admin 事件', public.none() is None)
            check('用户A连接不接收 admin 事件', sse_a.none() is None)
            check('用户B连接不接收 admin 事件', sse_b.none() is None)
            event = sse_admin.next()
            check('仅管理员连接接收 admin 事件', event.get('type') == 'admin', event)

            status, body = api.request('POST', '/api/my/prefs', {'prefs': {'dark': False}}, token_a)
            check('用户事件写入成功', status == 200)
            event = sse_a.next()
            check('用户A收到自己的 prefs 事件', event.get('type') == 'prefs', event)
            check('用户B收不到用户A私有事件', sse_b.none() is None)
            check('公开连接收不到用户A私有事件', public.none() is None)
            check('URL query Token 不会获得用户A私有事件', query_client.none() is None)
            check('管理员连接不混入用户私有事件', sse_admin.none() is None)

            status, body = api.request('POST', '/api/admin/logout', token=admin_token)
            check('管理员退出成功', status == 200 and body.get('ok'), body)
            status, body = api.request('GET', '/api/admin/me', token=admin_token)
            check('退出后管理员 Token 已撤销', status == 401, body)
            status, body = api.request('POST', '/api/auth/logout', token=token_a)
            check('用户退出成功', status == 200 and body.get('ok'), body)
            status, body = api.request('GET', '/api/auth/me', token=token_a)
            check('退出后用户 Token 已撤销', status == 401, body)
        finally:
            for client in clients:
                client.close()
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            if proc.returncode not in (0, -15):
                out, err = proc.communicate()
                print(err.decode(errors='replace'))

    print('\n结果: %d PASS / %d FAIL' % (passed, len(failed)))
    if failed:
        print('失败项: ' + ', '.join(failed))
        return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('E2E 执行异常:', repr(exc))
        sys.exit(2)
