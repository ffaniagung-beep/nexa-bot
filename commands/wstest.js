import { sendHtmlApp } from '@rexxhayanasi/elaina-baileys'

const HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>NEXA WS TEST</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#050b13;color:#edf9ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;padding:18px}
    .wrap{max-width:520px;margin:auto}.tag{color:#4eeaff;letter-spacing:.18em;font-size:12px;font-weight:800;margin-bottom:8px}.title{font-size:28px;font-weight:900;margin:0 0 6px}.sub{color:#8ea0b5;font-size:13px;line-height:1.5;margin-bottom:18px}
    .card{background:#0a1420;border:1px solid #193246;border-radius:18px;padding:16px;margin:12px 0}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}.name{font-weight:800;font-size:15px}.status{font-weight:900;font-size:14px}.wait{color:#ffd166}.ok{color:#63f5a6}.bad{color:#ff6b7b}
    .url{margin-top:7px;color:#6f8296;font-size:11px;word-break:break-all}.detail{margin-top:9px;padding-top:9px;border-top:1px solid #142839;color:#a9b7c6;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .meta{margin-top:16px;background:#07101a;border:1px solid #142839;border-radius:14px;padding:12px;color:#91a3b7;font-size:11px;line-height:1.55;word-break:break-word}.foot{color:#6f8296;font-size:11px;text-align:center;margin-top:14px}
  </style>
</head>
<body>
<div class="wrap">
  <div class="tag">NEXA // DIAGNOSTIC</div>
  <h1 class="title">WebSocket Test</h1>
  <div class="sub">Tes murni dari runtime mini-app WhatsApp. Tidak memakai fetch, Supabase, Vercel, atau logic catur.</div>

  <div class="card">
    <div class="row"><div class="name">☁️ Cloudflare Chess</div><div id="cfStatus" class="status wait">CONNECTING…</div></div>
    <div class="url">wss://nexa-chess.nametrill.workers.dev/chess</div>
    <div id="cfDetail" class="detail">Menunggu event WebSocket…</div>
  </div>

  <div class="card">
    <div class="row"><div class="name">🧪 Postman Echo</div><div id="pmStatus" class="status wait">CONNECTING…</div></div>
    <div class="url">wss://ws.postman-echo.com/raw</div>
    <div id="pmDetail" class="detail">Menunggu event WebSocket…</div>
  </div>

  <div id="meta" class="meta"></div>
  <div class="foot">Timeout tiap koneksi: 8 detik • command owner-only & hidden</div>
</div>
<script>
(function(){
  const started = Date.now();
  const $ = (id) => document.getElementById(id);
  function meta(){
    let origin = 'ERR', protocol = 'ERR', href = 'ERR';
    try { origin = String(location.origin); } catch(e) {}
    try { protocol = String(location.protocol); } catch(e) {}
    try { href = String(location.href); } catch(e) {}
    $('meta').textContent = [
      'origin: ' + origin,
      'protocol: ' + protocol,
      'href: ' + href,
      'WebSocket type: ' + typeof WebSocket,
      'online: ' + String(navigator.onLine),
      'ua: ' + String(navigator.userAgent || '')
    ].join('\n');
  }
  meta();

  function test(label, url, prefix, echoPayload){
    const status = $(prefix + 'Status');
    const detail = $(prefix + 'Detail');
    const t0 = Date.now();
    let done = false;
    let ws;

    function finish(kind, text){
      if(done) return;
      done = true;
      clearTimeout(timer);
      status.textContent = kind;
      status.className = 'status ' + (kind === 'OPEN' ? 'ok' : 'bad');
      detail.textContent = text;
    }

    const timer = setTimeout(() => {
      let rs = 'unknown';
      try { rs = String(ws && ws.readyState); } catch(e) {}
      finish('TIMEOUT', 'Tidak mendapat OPEN/ERROR dalam 8 detik. readyState=' + rs + '\n+' + (Date.now()-t0) + 'ms');
      try { ws && ws.close(); } catch(e) {}
    }, 8000);

    try {
      ws = new WebSocket(url);
    } catch(err) {
      finish('THROW', 'new WebSocket() melempar exception:\n' + String(err && (err.stack || err.message) || err));
      return;
    }

    ws.onopen = () => {
      status.textContent = 'OPEN';
      status.className = 'status ok';
      detail.textContent = 'onopen ✅\n+' + (Date.now()-t0) + 'ms\nreadyState=' + ws.readyState;
      if(echoPayload){
        try {
          ws.send(echoPayload);
          detail.textContent += '\nsend() ✅';
        } catch(err) {
          detail.textContent += '\nsend() error: ' + String(err && err.message || err);
        }
      } else {
        setTimeout(() => { try { ws.close(1000, 'diagnostic done'); } catch(e) {} }, 300);
      }
    };

    ws.onmessage = (ev) => {
      detail.textContent += '\nonmessage: ' + String(ev && ev.data).slice(0, 500);
      if(echoPayload){
        setTimeout(() => { try { ws.close(1000, 'diagnostic done'); } catch(e) {} }, 200);
      }
    };

    ws.onerror = (ev) => {
      const rs = (() => { try { return ws.readyState; } catch(e) { return 'unknown'; } })();
      finish('ERROR', 'onerror ❌\n+' + (Date.now()-t0) + 'ms\nreadyState=' + rs + '\neventType=' + String(ev && ev.type || 'error'));
    };

    ws.onclose = (ev) => {
      const line = '\nonclose: code=' + String(ev && ev.code) + ' clean=' + String(ev && ev.wasClean) + ' reason=' + String(ev && ev.reason || '-');
      if(!done && status.textContent !== 'OPEN') {
        finish('CLOSED', 'Socket tertutup sebelum OPEN.' + line + '\n+' + (Date.now()-t0) + 'ms');
      } else {
        clearTimeout(timer);
        done = true;
        detail.textContent += line;
      }
    };
  }

  test('Cloudflare', 'wss://nexa-chess.nametrill.workers.dev/chess', 'cf', null);
  test('Postman', 'wss://ws.postman-echo.com/raw', 'pm', 'nexa-wstest-' + started);
})();
</script>
</body>
</html>`

export default {
  name: 'wstest',
  aliases: [],
  category: 'OWNER',
  ownerOnly: true,
  menuHidden: true,
  description: 'Tes WebSocket mini-app WhatsApp (sementara)',
  usage: '.wstest',

  async run({ sock, msg, jid }) {
    try {
      await sendHtmlApp(
        sock,
        jid,
        HTML,
        {
          title: '⚡ NEXA DIAGNOSTIC',
          label: '🧪 NEXA WS TEST • Owner Only',
          trustedSources: [
            'nexa-chess.nametrill.workers.dev',
            'ws.postman-echo.com'
          ],
          height: 590
        }
      )
    } catch (err) {
      console.error('🧪 WSTEST:', err)
      await sock.sendMessage(
        jid,
        {
          text: `❌ *WSTEST ERROR*\n\n${err?.message || err}`
        },
        { quoted: msg }
      )
    }
  }
}
