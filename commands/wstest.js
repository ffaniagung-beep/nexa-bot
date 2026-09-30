import { sendHtmlApp } from '@rexxhayanasi/elaina-baileys'

const HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>NEXA NETWORK TEST</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#050b13;color:#edf9ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;padding:18px}
    .wrap{max-width:520px;margin:auto}.tag{color:#4eeaff;letter-spacing:.18em;font-size:12px;font-weight:800;margin-bottom:8px}.title{font-size:28px;font-weight:900;margin:0 0 6px}.sub{color:#8ea0b5;font-size:13px;line-height:1.5;margin-bottom:18px}
    .card{background:#0a1420;border:1px solid #193246;border-radius:18px;padding:16px;margin:12px 0}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}.name{font-weight:800;font-size:15px}.status{font-weight:900;font-size:14px;text-align:right}.wait{color:#ffd166}.ok{color:#63f5a6}.warn{color:#ffd166}.bad{color:#ff6b7b}
    .url{margin-top:7px;color:#6f8296;font-size:11px;word-break:break-all}.detail{margin-top:9px;padding-top:9px;border-top:1px solid #142839;color:#a9b7c6;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
    .meta{margin-top:16px;background:#07101a;border:1px solid #142839;border-radius:14px;padding:12px;color:#91a3b7;font-size:11px;line-height:1.55;word-break:break-word}.foot{color:#6f8296;font-size:11px;text-align:center;margin-top:14px}
  </style>
</head>
<body>
<div class="wrap">
  <div class="tag">NEXA // DIAGNOSTIC</div>
  <h1 class="title">Network Runtime Test</h1>
  <div class="sub">Tes langsung dari mini-app WhatsApp: 2 WebSocket + WebRTC/ICE-STUN. Tidak memakai fetch, Supabase, Vercel, atau logic catur.</div>

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

  <div class="card">
    <div class="row"><div class="name">🛰️ WebRTC / STUN</div><div id="rtcStatus" class="status wait">TESTING…</div></div>
    <div class="url">STUN: Cloudflare + Google • hanya ICE gathering, tanpa mic/camera</div>
    <div id="rtcDetail" class="detail">Membuat RTCPeerConnection + DataChannel…</div>
  </div>

  <div id="meta" class="meta"></div>
  <div class="foot">WS timeout 8 dtk • ICE timeout 10 dtk • owner-only & hidden</div>
</div>
<script>
(function(){
  const started = Date.now();
  const $ = (id) => document.getElementById(id);

  function setStatus(id, text, cls){
    const el = $(id);
    el.textContent = text;
    el.className = 'status ' + cls;
  }

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
      'RTCPeerConnection type: ' + typeof RTCPeerConnection,
      'online: ' + String(navigator.onLine),
      'ua: ' + String(navigator.userAgent || '')
    ].join('\n');
  }
  meta();

  function testWebSocket(url, prefix, echoPayload){
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

  async function testWebRTC(){
    const detail = $('rtcDetail');
    const t0 = Date.now();

    if(typeof RTCPeerConnection !== 'function'){
      setStatus('rtcStatus', 'UNSUPPORTED', 'bad');
      detail.textContent = 'RTCPeerConnection tidak tersedia di runtime ini.';
      return;
    }

    let pc;
    let dc;
    let finished = false;
    const counts = { host:0, srflx:0, relay:0, prflx:0, unknown:0 };
    let total = 0;

    function summary(extra){
      return [
        'ICE candidates total=' + total,
        'host=' + counts.host + '  srflx=' + counts.srflx + '  relay=' + counts.relay + '  prflx=' + counts.prflx,
        'iceGatheringState=' + (pc ? pc.iceGatheringState : 'n/a'),
        'iceConnectionState=' + (pc ? pc.iceConnectionState : 'n/a'),
        extra || ''
      ].filter(Boolean).join('\n');
    }

    function closePc(){
      try { dc && dc.close(); } catch(e) {}
      try { pc && pc.close(); } catch(e) {}
    }

    function finish(kind, cls, extra){
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      setStatus('rtcStatus', kind, cls);
      detail.textContent = summary(extra + '\n+' + (Date.now()-t0) + 'ms');
      setTimeout(closePc, 250);
    }

    const timer = setTimeout(() => {
      if(counts.srflx > 0 || counts.relay > 0){
        finish('STUN OK', 'ok', 'Timeout tercapai, tapi kandidat public/relay sudah didapat ✅');
      } else if(total > 0){
        finish('WEBRTC ONLY', 'warn', 'Ada kandidat lokal, tapi belum ada srflx/relay dari STUN.');
      } else {
        finish('TIMEOUT', 'bad', 'Tidak ada ICE candidate dalam 10 detik.');
      }
    }, 10000);

    try {
      pc = new RTCPeerConnection({
        iceServers: [{
          urls: [
            'stun:stun.cloudflare.com:3478',
            'stun:stun.l.google.com:19302'
          ]
        }]
      });

      dc = pc.createDataChannel('nexa-diag');

      pc.onicecandidate = (ev) => {
        if(ev && ev.candidate){
          total++;
          let type = 'unknown';
          try {
            type = ev.candidate.type || ((String(ev.candidate.candidate).match(/ typ ([a-z]+)/i) || [])[1]) || 'unknown';
          } catch(e) {}
          if(!(type in counts)) type = 'unknown';
          counts[type]++;
          detail.textContent = summary('Gathering ICE…');
        } else {
          if(counts.srflx > 0 || counts.relay > 0){
            finish('STUN OK', 'ok', 'ICE gathering selesai dan mendapat kandidat public/relay ✅');
          } else if(total > 0){
            finish('WEBRTC ONLY', 'warn', 'ICE gathering selesai. WebRTC hidup, tapi STUN tidak menghasilkan srflx/relay.');
          } else {
            finish('NO CANDIDATE', 'bad', 'ICE gathering selesai tanpa kandidat.');
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        detail.textContent = summary('Gathering state berubah…');
      };

      pc.onicecandidateerror = (ev) => {
        const code = ev && ev.errorCode != null ? ev.errorCode : '?';
        const text = ev && ev.errorText ? String(ev.errorText) : 'unknown';
        detail.textContent = summary('icecandidateerror: code=' + code + ' text=' + text);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      detail.textContent = summary('Offer + setLocalDescription ✅\nMenunggu ICE candidate…');
    } catch(err) {
      finish('ERROR', 'bad', 'WebRTC exception: ' + String(err && (err.stack || err.message) || err));
    }
  }

  testWebSocket('wss://nexa-chess.nametrill.workers.dev/chess', 'cf', null);
  testWebSocket('wss://ws.postman-echo.com/raw', 'pm', 'nexa-wstest-' + started);
  testWebRTC();
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
  description: 'Tes network runtime mini-app WhatsApp (sementara)',
  usage: '.wstest',

  async run({ sock, msg, jid }) {
    try {
      await sendHtmlApp(
        sock,
        jid,
        HTML,
        {
          title: '⚡ NEXA DIAGNOSTIC',
          label: '🧪 NEXA NETWORK TEST • Owner Only',
          trustedSources: [
            'nexa-chess.nametrill.workers.dev',
            'ws.postman-echo.com',
            'stun.cloudflare.com',
            'stun.l.google.com'
          ],
          height: 720
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
