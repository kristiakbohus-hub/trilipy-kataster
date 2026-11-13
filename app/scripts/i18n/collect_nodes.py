import base64, json, os, socket, struct, subprocess, sys, tempfile, time, urllib.request, re, collections
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
JS = r"""(()=>{const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(w.nextNode()){const n=w.currentNode;const p=n.parentElement;if(!p)continue;const tg=p.tagName;if(tg==='SCRIPT'||tg==='STYLE')continue;
const t=(n.nodeValue||'').trim();if(t)out.push(t);}return JSON.stringify(out);})()"""
class WS:
    def __init__(s, url):
        m = re.match(r"ws://([^/:]+):(\d+)(/.*)", url); host, port, path = m.group(1), int(m.group(2)), m.group(3)
        s.s = socket.create_connection((host, port)); key = base64.b64encode(os.urandom(16)).decode()
        s.s.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        buf = b""
        while b"\r\n\r\n" not in buf: buf += s.s.recv(4096)
        s.buf = buf.split(b"\r\n\r\n", 1)[1]
    def send(s, txt):
        d = txt.encode(); mk = os.urandom(4); h = bytes([0x81]); n = len(d)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n)
        s.s.sendall(h + mk + bytes(b ^ mk[i % 4] for i, b in enumerate(d)))
    def _n(s, k):
        while len(s.buf) < k: s.buf += s.s.recv(1 << 20)
        r, s.buf = s.buf[:k], s.buf[k:]; return r
    def recv(s):
        msg = b""
        while True:
            b0, b1 = s._n(2); n = b1 & 0x7F
            if n == 126: n = struct.unpack(">H", s._n(2))[0]
            elif n == 127: n = struct.unpack(">Q", s._n(8))[0]
            msg += s._n(n)
            if b0 & 0x80: return msg.decode("utf-8", "replace")
def nodes(url, wait=40):
    prof = tempfile.mkdtemp(); port = 9333
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={prof}", f"--remote-debugging-port={port}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read()); break
            except Exception: time.sleep(0.3)
        ws = WS([t for t in tabs if t.get("type") == "page"][0]["webSocketDebuggerUrl"]); i = [0]
        def call(m, **pr):
            i[0] += 1; ws.send(json.dumps({"id": i[0], "method": m, "params": pr}))
            while True:
                r = json.loads(ws.recv())
                if r.get("id") == i[0]: return r
        call("Page.navigate", url=url); time.sleep(wait)
        r = call("Runtime.evaluate", expression=JS, returnByValue=True)
        return json.loads(r["result"]["result"]["value"])
    finally:
        p.kill()
if __name__ == "__main__":
    DIA = re.compile(r"[áäčďéíĺľňóôŕšťúýžÁČĎÉÍĽŇÓŠŤÚÝŽ]")
    SKW = re.compile(r"\b(je|sa|pre|alebo|nie|pri|zo|ako|aj|len|bez|ktor\w*|treba|tento|tieto|stavb\w*|pozem\w*|obce|obec|mesto|rok|rokov|ani|ich|tak|teda|zmluv\w*|vlastn\w*|dom|byt|cesta|voda|plyn|na|od|do|podla|mes|dni)\b", re.I)
    cnt = collections.Counter(); allc = 0
    for u in sys.argv[1:]:
        ns = nodes(u); allc += len(ns); k = 0
        for t in ns:
            if DIA.search(t) or SKW.search(t): cnt[t] += 1; k += 1
        print(u, len(ns), "sk", k, flush=True)
    json.dump(cnt.most_common(), open("sk_nodes2.json", "w"), ensure_ascii=False, indent=0)
    print("unique", len(cnt), "of", allc)
