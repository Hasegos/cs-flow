/**
 * CORS 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt !== undefined && txt !== null) e.textContent = txt;
        return e;
    }

    /* ===================== DOM ===================== */
    var root    = el('div', 'cors-viz');
    var toolbar = el('div', 'cors-viz__toolbar');
    var tbLeft  = el('div', 'cors-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cors-viz__title', 'CORS'));

    var modeWrap = el('div', 'cors-viz__mode');
    var modeDefs = [
        { key: 'simple', label: '단순 요청' },
        { key: 'preflight', label: '사전 요청' },
        { key: 'creds', label: '쿠키 포함 요청' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cors-viz__mode-btn' + (i === 0 ? ' cors-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cors-viz__speed');
    speedWrap.appendChild(el('span', 'cors-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cors-viz__speed-btn' + (i === 0 ? ' cors-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cors-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cors-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cors-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cors-viz__controls');
    var btnPlay  = el('button', 'cors-viz__btn cors-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cors-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cors-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'simple';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;
    var anim    = 1;

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function ln(x1, y1, x2, y2, color, lw, dash) {
        ctx.beginPath();
        ctx.setLineDash(dash || []);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function arrow(x1, y1, x2, y2, color, lw, dash) {
        ln(x1, y1, x2, y2, color, lw, dash);
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function circ(x, y, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 데이터: 참여자와 단계 ===================== */
    var ACTORS = [
        { id: 'C', name: '웹 페이지', sub: 'app 출처', col: 'orange' },
        { id: 'B', name: '브라우저', sub: 'CORS 검사', col: 'purple' },
        { id: 'S', name: 'API 서버', sub: 'api 출처', col: 'teal' }
    ];
    var PAGE = 'https://app.example.com';
    var API = 'https://api.example.com';

    function T(s) { return [s, 'text']; }
    function Y(s) { return [s, 'yellow']; }
    function G(s) { return [s, 'green']; }
    function R(s) { return [s, 'red']; }
    function S(s) { return [s, 'sub']; }

    function st(log, o) {
        var s = { log: log, from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [] };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var SRV_NONE = [R('Access-Control-Allow-Origin 헤더 없음')];
    var SRV_OK = [Y('Access-Control-Allow-Origin: ' + PAGE)];
    var DIFF_ORIGIN = [S('페이지 출처  ' + PAGE), S('요청 대상    ' + API), R('호스트가 달라 다른 출처')];

    var SIMPLE_STEPS = [
        st('app.example.com에서 받은 페이지의 스크립트가 api.example.com의 데이터를 요청합니다. 두 주소는 호스트가 달라 서로 다른 출처(origin)입니다. 브라우저는 기본적으로 다른 출처의 응답을 스크립트가 읽지 못하게 막고(동일 출처 정책), 서버가 허락할 때만 CORS로 풀어 줍니다.', {}),
        st('페이지의 스크립트가 fetch로 다른 출처의 API를 부릅니다. 브라우저는 페이지의 출처와 요청 대상의 출처를 비교합니다. 출처는 스킴, 호스트, 포트 세 가지가 모두 같아야 같습니다.',
            { from: 'C', to: 'B', kind: 'req', label: 'fetch 호출', msg: [T('fetch("' + API + '/data")')], hl: { C: ['요청 코드', 'orange'], B: ['출처 비교', 'purple'] }, cli: DIFF_ORIGIN }),
        st('브라우저가 요청에 Origin 헤더를 붙여 서버로 보냅니다. 이 요청은 단순 요청(GET이고 특별한 헤더가 없음)이라 사전 확인 없이 서버에 곧바로 도착합니다.',
            { from: 'B', to: 'S', kind: 'req', label: 'GET + Origin', msg: [T('GET /data HTTP/1.1'), T('Host: api.example.com'), Y('Origin: ' + PAGE)], hl: { B: ['Origin 추가', 'purple'], S: ['수신', 'teal'] }, cli: DIFF_ORIGIN }),
        st('서버가 응답에 Access-Control-Allow-Origin 헤더를 실어 "이 출처의 페이지에는 응답을 보여 줘도 좋다"고 알립니다.',
            { from: 'S', to: 'B', kind: 'res', label: '200 OK + Allow-Origin', msg: [T('HTTP/1.1 200 OK'), Y('Access-Control-Allow-Origin: ' + PAGE), Y('{ "name": "kim" }')], hl: { S: ['허용 헤더', 'teal'], B: ['응답 수신', 'purple'] }, cli: DIFF_ORIGIN, srv: SRV_OK }),
        st('브라우저가 요청의 Origin과 응답의 Access-Control-Allow-Origin을 비교합니다. 값이 같거나 와일드카드(*)이면 통과입니다.',
            { from: null, to: null, kind: '', label: 'CORS 검사', msg: [Y('Origin: ' + PAGE), Y('Allow-Origin: ' + PAGE)], hl: { B: ['일치', 'green'] }, cli: [G('Origin == Allow-Origin → 허용')], srv: SRV_OK }),
        st('검사를 통과했으므로 브라우저가 응답을 스크립트에 넘겨 줍니다. 스크립트가 데이터를 읽을 수 있습니다.',
            { from: 'B', to: 'C', kind: 'res', label: '응답 전달', msg: [G('스크립트가 응답을 읽을 수 있음'), Y('{ "name": "kim" }')], hl: { B: ['전달', 'green'], C: ['데이터 수신', 'orange'] }, cli: [G('Origin == Allow-Origin → 허용')], srv: SRV_OK }),
        st('이번에는 서버가 CORS 설정을 하지 않아 응답에 Access-Control-Allow-Origin 헤더가 없다고 해 봅시다. 서버는 요청을 정상 처리하고 응답도 보냅니다.',
            { from: 'S', to: 'B', kind: 'res', label: '200 OK (허용 헤더 없음)', msg: [T('HTTP/1.1 200 OK'), R('Access-Control-Allow-Origin 없음'), Y('{ "name": "kim" }')], hl: { S: ['헤더 없음', 'red'], B: ['응답 수신', 'purple'] }, cli: DIFF_ORIGIN, srv: SRV_NONE }),
        st('브라우저가 허락 헤더가 없는 것을 확인하고 응답을 스크립트에 넘기지 않습니다. 콘솔에는 CORS 정책에 막혔다는 오류가 나옵니다. 서버는 이미 요청을 처리했으므로, CORS는 요청이 서버에 가는 것을 막는 장치가 아니라 응답을 읽는 것을 제한하는 장치입니다.',
            { from: 'B', to: 'C', kind: 'err', label: '응답 차단', msg: [R('응답을 스크립트에 넘기지 않음'), R('콘솔: blocked by CORS policy')], hl: { B: ['차단', 'red'], C: ['오류', 'red'] }, cli: [R('Allow-Origin 헤더 없음 → 차단')], srv: SRV_NONE })
    ];

    var PRE_FETCH = [T('fetch("' + API + '/data", {'), Y('  method: "PUT",'), Y('  headers: { "Content-Type": "application/json" } })')];
    var PRE_OK_SRV = [Y('Allow-Origin: ' + PAGE), Y('Allow-Methods: GET, PUT'), Y('Allow-Headers: content-type'), Y('Max-Age: 600')];
    var PRE_JUDGE = [S('PUT은 단순 요청 메서드가 아님'), S('application/json은 단순 요청 값이 아님'), Y('→ 사전 요청(preflight)이 필요')];
    var PRE_STEPS = [
        st('데이터를 바꾸는 PUT 요청이나 JSON 본문 요청은 서버에 부작용을 줄 수 있습니다. 그래서 브라우저가 실제 요청을 보내기 전에 OPTIONS 요청으로 서버가 허락하는지 먼저 묻습니다. 이것이 사전 요청(preflight)입니다.', {}),
        st('스크립트가 Content-Type이 application/json인 PUT 요청을 fetch로 보냅니다.',
            { from: 'C', to: 'B', kind: 'req', label: 'fetch 호출', msg: PRE_FETCH, hl: { C: ['PUT 요청', 'orange'], B: ['조건 검사', 'purple'] } }),
        st('브라우저가 단순 요청 조건을 확인합니다. 메서드가 GET, HEAD, POST가 아니고 Content-Type도 안전한 값이 아니므로 실제 요청 전에 사전 요청을 보내야 합니다.',
            { from: null, to: null, kind: '', label: '사전 요청 필요', msg: PRE_FETCH, hl: { B: ['사전 요청 필요', 'purple'] }, cli: PRE_JUDGE }),
        st('브라우저가 OPTIONS 요청을 보냅니다. 실제로 쓸 메서드와 헤더를 Access-Control-Request-Method와 Access-Control-Request-Headers에 적어 서버에 묻습니다. 요청 본문은 보내지 않습니다.',
            { from: 'B', to: 'S', kind: 'req', label: 'OPTIONS (사전 요청)', msg: [T('OPTIONS /data HTTP/1.1'), Y('Origin: ' + PAGE), Y('Access-Control-Request-Method: PUT'), Y('Access-Control-Request-Headers: content-type')], hl: { B: ['사전 요청', 'purple'], S: ['수신', 'teal'] }, cli: PRE_JUDGE }),
        st('서버가 허용하는 출처, 메서드, 헤더와 이 허락을 기억해 둘 시간(Max-Age)을 응답 헤더로 알려 줍니다. 이 시각화에서는 600초(10분)입니다.',
            { from: 'S', to: 'B', kind: 'res', label: '204 + 허용 목록', msg: [T('HTTP/1.1 204 No Content'), Y('Access-Control-Allow-Origin: ' + PAGE), Y('Access-Control-Allow-Methods: GET, PUT'), Y('Access-Control-Allow-Headers: content-type'), Y('Access-Control-Max-Age: 600')], hl: { S: ['허용 목록', 'teal'], B: ['응답 수신', 'purple'] }, cli: PRE_JUDGE, srv: PRE_OK_SRV }),
        st('브라우저가 허용 목록에 실제 요청의 출처, 메서드(PUT), 헤더(content-type)가 모두 있는지 확인합니다. 모두 있으므로 통과합니다.',
            { from: null, to: null, kind: '', label: '사전 요청 통과', msg: [G('Origin 허용'), G('PUT 허용'), G('content-type 허용')], hl: { B: ['통과', 'green'] }, cli: [G('허용 목록과 일치 → 실제 요청 전송')], srv: PRE_OK_SRV }),
        st('이제 브라우저가 진짜 PUT 요청을 보냅니다. 사전 요청에서 허락받은 요청이므로 서버로 갑니다.',
            { from: 'B', to: 'S', kind: 'req', label: 'PUT /data', msg: [T('PUT /data HTTP/1.1'), Y('Origin: ' + PAGE), Y('Content-Type: application/json'), Y('{ "name": "kim" }')], hl: { B: ['실제 요청', 'purple'], S: ['수신', 'teal'] }, cli: [G('허용 목록과 일치 → 실제 요청 전송')], srv: PRE_OK_SRV }),
        st('실제 요청의 응답에도 Access-Control-Allow-Origin이 있어야 합니다. 있으므로 브라우저가 응답을 스크립트에 넘기고, 스크립트가 결과를 읽습니다. 허락은 Max-Age 동안 기억되어 같은 요청에는 사전 요청을 다시 보내지 않습니다.',
            { from: 'S', to: 'B', kind: 'res', label: '200 OK + Allow-Origin', msg: [T('HTTP/1.1 200 OK'), Y('Access-Control-Allow-Origin: ' + PAGE), Y('{ "ok": true }')], hl: { S: ['응답', 'teal'], B: ['스크립트에 전달', 'green'] }, cli: [G('Allow-Origin 일치 → 응답 전달')], srv: PRE_OK_SRV }),
        st('이번에는 서버의 허용 메서드가 GET뿐이라고 해 봅시다. 사전 요청의 응답에 PUT이 없습니다.',
            { from: 'S', to: 'B', kind: 'res', label: '204 (PUT 없음)', msg: [T('HTTP/1.1 204 No Content'), Y('Access-Control-Allow-Origin: ' + PAGE), R('Access-Control-Allow-Methods: GET')], hl: { S: ['PUT 미허용', 'red'], B: ['응답 수신', 'purple'] }, cli: PRE_JUDGE, srv: [Y('Allow-Origin: ' + PAGE), R('Allow-Methods: GET')] }),
        st('사전 요청에서 거절당했으므로 브라우저는 실제 PUT 요청을 아예 보내지 않고 콘솔에 오류를 남깁니다. 사전 요청 덕분에 허락받지 못한 요청은 서버에 도착하기 전에 멈춥니다.',
            { from: 'B', to: 'C', kind: 'err', label: '요청 중단', msg: [R('PUT /data 전송하지 않음'), R('콘솔: preflight 응답이 요청을 허용하지 않음')], hl: { B: ['중단', 'red'], C: ['오류', 'red'] }, cli: [R('Allow-Methods에 PUT 없음 → 요청 중단')], srv: [Y('Allow-Origin: ' + PAGE), R('Allow-Methods: GET')] })
    ];

    var CRED_FETCH = [T('fetch("' + API + '/me", {'), Y('  credentials: "include" })')];
    var CRED_STEPS = [
        st('로그인 쿠키 같은 자격 증명을 다른 출처 요청에 함께 보내려면 fetch에 credentials: "include"를 씁니다. 이때는 서버가 허락하는 방식이 더 엄격해집니다.', {}),
        st('스크립트가 쿠키를 포함해 다른 출처의 API를 요청합니다.',
            { from: 'C', to: 'B', kind: 'req', label: 'fetch 호출', msg: CRED_FETCH, hl: { C: ['쿠키 포함 요청', 'orange'], B: ['출처 비교', 'purple'] }, cli: DIFF_ORIGIN }),
        st('브라우저가 Origin 헤더와 함께 해당 서버의 쿠키를 요청에 붙입니다(쿠키는 브라우저의 쿠키 정책을 통과해야 붙습니다).',
            { from: 'B', to: 'S', kind: 'req', label: 'GET + Origin + Cookie', msg: [T('GET /me HTTP/1.1'), Y('Origin: ' + PAGE), Y('Cookie: sid=3f9a1c7e…')], hl: { B: ['쿠키 첨부', 'purple'], S: ['수신', 'teal'] }, cli: DIFF_ORIGIN }),
        st('서버가 모든 출처를 뜻하는 와일드카드(*)와 Access-Control-Allow-Credentials: true를 함께 보냈다고 해 봅시다.',
            { from: 'S', to: 'B', kind: 'res', label: '200 OK (Allow-Origin: *)', msg: [T('HTTP/1.1 200 OK'), R('Access-Control-Allow-Origin: *'), Y('Access-Control-Allow-Credentials: true')], hl: { S: ['와일드카드', 'red'], B: ['응답 수신', 'purple'] }, cli: DIFF_ORIGIN, srv: [R('Allow-Origin: *'), Y('Allow-Credentials: true')] }),
        st('자격 증명이 포함된 요청에서는 Access-Control-Allow-Origin에 와일드카드(*)를 쓸 수 없습니다. 브라우저가 응답을 차단합니다. 쿠키가 딸린 응답을 아무 출처의 페이지나 읽게 되는 것을 막기 위한 규칙입니다.',
            { from: 'B', to: 'C', kind: 'err', label: '응답 차단', msg: [R('자격 증명 요청에 * 는 허용되지 않음'), R('콘솔: blocked by CORS policy')], hl: { B: ['차단', 'red'], C: ['오류', 'red'] }, cli: [R('credentials + * → 차단')], srv: [R('Allow-Origin: *'), Y('Allow-Credentials: true')] }),
        st('서버를 고칩니다. Access-Control-Allow-Origin에 요청한 출처를 정확히 적고, Access-Control-Allow-Credentials: true를 보냅니다. 응답이 요청의 Origin에 따라 달라지므로 Vary: Origin도 붙여 캐시가 다른 출처에 잘못 재사용되지 않게 합니다.',
            { from: 'S', to: 'B', kind: 'res', label: '200 OK (정확한 출처)', msg: [T('HTTP/1.1 200 OK'), Y('Access-Control-Allow-Origin: ' + PAGE), Y('Access-Control-Allow-Credentials: true'), Y('Vary: Origin')], hl: { S: ['설정 수정', 'teal'], B: ['응답 수신', 'purple'] }, cli: DIFF_ORIGIN, srv: [Y('Allow-Origin: ' + PAGE), Y('Allow-Credentials: true'), Y('Vary: Origin')] }),
        st('브라우저가 출처가 정확히 일치하고 Allow-Credentials가 true인 것을 확인하고 통과시킵니다.',
            { from: null, to: null, kind: '', label: 'CORS 검사', msg: [G('Allow-Origin이 요청 출처와 일치'), G('Allow-Credentials: true')], hl: { B: ['통과', 'green'] }, cli: [G('정확한 출처 + credentials → 허용')], srv: [Y('Allow-Origin: ' + PAGE), Y('Allow-Credentials: true'), Y('Vary: Origin')] }),
        st('응답이 스크립트에 전달되어 로그인한 사용자의 데이터를 읽을 수 있습니다.',
            { from: 'B', to: 'C', kind: 'res', label: '응답 전달', msg: [G('스크립트가 응답을 읽을 수 있음'), Y('{ "user": "kim" }')], hl: { B: ['전달', 'green'], C: ['데이터 수신', 'orange'] }, cli: [G('정확한 출처 + credentials → 허용')], srv: [Y('Allow-Origin: ' + PAGE), Y('Allow-Credentials: true'), Y('Vary: Origin')] })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'preflight') return PRE_STEPS;
        if (mode === 'creds') return CRED_STEPS;
        return SIMPLE_STEPS;
    }
    function defaultLog() {
        if (mode === 'preflight') return 'PUT 요청처럼 사전 요청(preflight)이 필요한 경우를 봅니다.';
        if (mode === 'creds') return '쿠키를 포함한 요청에서 와일드카드와 정확한 출처가 어떻게 다른지 봅니다.';
        return '단순 GET 요청이 CORS 검사를 통과하거나 막히는 과정을 봅니다.';
    }

    /* ===================== 레이아웃(모드마다 고정) ===================== */
    function wrapRows(rows, maxW, fs) {
        var out = [];
        (rows || []).forEach(function (r) {
            lines(r[0], maxW, fs).forEach(function (t) { out.push([t, r[1]]); });
        });
        return out;
    }
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = Math.round(fs * 1.45);
        var innerW = w - 28;
        var judge = 0, srvN = 0, cardN = 0;
        currentSteps().forEach(function (s) {
            judge = Math.max(judge, wrapRows(s.cli, innerW, fs - 1).length);
            srvN = Math.max(srvN, wrapRows(s.srv, innerW, fs - 1).length);
            cardN = Math.max(cardN, wrapRows(s.msg, w - 76, fs - 1).length);
        });
        var winH = 30 + 12 + 26 + 10 + 16 + Math.max(1, judge) * lh + 12;
        var cardH = Math.max(1, cardN) * lh + 14;
        var gapH = cardH + 70;
        var srvH = 24 + 16 + Math.max(1, srvN) * lh + 12;
        return { fs: fs, lh: lh, winH: winH, cardH: cardH, gapH: gapH, srvH: srvH, total: winH + gapH + srvH + 6 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [] };
        var hl = s.hl || {};
        var gateKey = hl.B ? hl.B[1] : 'muted';
        var gateCol = colorOf(gateKey === 'purple' ? 'purple' : gateKey);
        var winY = top, winH = L.winH;
        var gateY = winY + winH;
        var gapTop = gateY + 8;
        var srvY = gateY + L.gapH;

        rr(x0, winY, w, winH, 10, P.orange + '0f', P.orange + 'aa', 1.6);
        rr(x0, winY, w, 30, 10, P.orange + '22', 'none');
        [0, 1, 2].forEach(function (i) { circ(x0 + 14 + i * 13, winY + 15, 3.6, P.muted + 'cc'); });
        rr(x0 + 56, winY + 5, w - 68, 20, 10, P.bg ? P.bg : 'none', P.muted + '88', 1);
        tx('https://app.example.com', x0 + 66, winY + 15, fs - 0.5, P.orange + 'ff', 'left', true);

        var chipY = winY + 42;
        var chipLbl = hl.C ? hl.C[0] : 'app 스크립트';
        var chipCol = hl.C ? colorOf(hl.C[1]) : colorOf('orange');
        rr(x0 + 12, chipY, Math.min(w - 24, 190 + (hl.C ? 40 : 0)), 26, 6, chipCol + '22', chipCol + 'ff', 1.5);
        tx('📜 ' + chipLbl, x0 + 22, chipY + 13, fs - 0.5, chipCol + 'ff', 'left', true);

        tx('브라우저의 판단', x0 + 14, chipY + 40, fs - 1.5, P.sub + 'ff', 'left', true);
        wrapRows(s.cli, w - 28, fs - 1).forEach(function (r, i) {
            tx(r[0], x0 + 14, chipY + 58 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
        });

        ln(x0 + 4, gateY, x0 + w - 4, gateY, gateCol + (hl.B ? 'ff' : '66'), hl.B ? 5 : 2.5);
        var gl = hl.B ? 'CORS 검사: ' + hl.B[0] : 'CORS 검사';
        ctx.font = '700 ' + (fs - 0.5) + 'px "JetBrains Mono",monospace';
        var gw = ctx.measureText(gl).width + 24;
        rr(x0 + w / 2 - gw / 2, gateY - 11, gw, 22, 11, P.bg ? P.bg : '#000', gateCol + (hl.B ? 'ff' : '88'), 1.6);
        tx(gl, x0 + w / 2, gateY, fs - 0.5, gateCol + (hl.B ? 'ff' : 'cc'), 'center', true);

        var laneL = x0 + 12, laneR = x0 + w - 12;
        var kc = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
        var goDown = s.from === 'B' && s.to === 'S';
        var goUp = s.from === 'S' && s.to === 'B';
        arrow(laneL, gateY + 14, laneL, srvY - 4, goDown ? kc + 'ff' : P.muted + '55', goDown ? 3 : 1.6, goDown ? undefined : [4, 4]);
        arrow(laneR, srvY - 4, laneR, gateY + 14, goUp ? kc + 'ff' : P.muted + '55', goUp ? 3 : 1.6, goUp ? undefined : [4, 4]);

        var rows = wrapRows(s.msg, w - 76, fs - 1);
        var cardW = w - 52;
        var cardX = x0 + 26;
        var yTop = gapTop, yBot = srvY - L.cardH - 6;
        var e = clamp01(t);
        var cy = null, alpha = 1, border = kc, blocked = false;
        if (s.from === 'C' && s.to === 'B') { cy = yTop; alpha = e; }
        else if (goDown) { cy = lerp(yTop, yBot, e); }
        else if (goUp) { cy = lerp(yBot, yTop, e); }
        else if (s.from === 'B' && s.to === 'C') {
            cy = s.kind === 'err' ? yTop : lerp(yTop, yTop - 22, e);
            alpha = s.kind === 'err' ? 1 : 1 - e * 0.85;
            blocked = s.kind === 'err';
        }
        if (cy !== null && rows.length) {
            ctx.globalAlpha = alpha;
            rr(cardX, cy, cardW, L.cardH, 8, border + '1c', border + 'ff', 1.8);
            rows.forEach(function (r, i) {
                tx(r[0], cardX + 10, cy + 7 + L.lh / 2 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
            });
            if (blocked) tx('✕', cardX + cardW - 14, cy + 14, fs + 6, P.red + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (s.label && cy === null) {
            tx(s.label, x0 + w / 2, gateY + L.gapH / 2, fs, colorOf('yellow') + 'ff', 'center', true);
        }

        rr(x0, srvY, w, L.srvH, 10, P.teal + '0f', P.teal + 'aa', 1.6);
        tx('api.example.com  (서버)', x0 + 14, srvY + 16, fs, P.teal + 'ff', 'left', true);
        tx('응답에 담는 CORS 헤더', x0 + 14, srvY + 38, fs - 1.5, P.sub + 'ff', 'left', true);
        var srvRows = wrapRows(s.srv, w - 28, fs - 1);
        if (!srvRows.length) tx('(설정 없음)', x0 + 14, srvY + 56, fs - 1, P.sub + 'ff', 'left', false);
        srvRows.forEach(function (r, i) {
            tx(r[0], x0 + 14, srvY + 56 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
        });
    }

    /* ===================== 메인 드로우 ===================== */
    function sidePad(w) { return w < 600 ? 14 : 24; }
    function topPad(w) { return w < 600 ? 14 : 20; }

    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;
        var prev = stepIdx > 0 ? steps[stepIdx - 1] : null;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = 260;
        currentSteps().concat([null]).forEach(function (s) {
            var h = topPad(w) + sceneH(w - sidePad(w) * 2, mob, s) + 14;
            if (h > neededH) neededH = h;
        });
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = Math.ceil(neededH) + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        var dur = Math.max(320, speed * 0.55);
        var t0 = null;
        function frame(now) {
            if (t0 === null) t0 = now;
            var p = Math.min(1, (now - t0) / dur);
            anim = p;
            draw();
            if (p < 1) { rafId = requestAnimationFrame(frame); }
            else { rafId = null; anim = 1; if (onDone) onDone(); }
        }
        anim = 0;
        rafId = requestAnimationFrame(frame);
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = currentSteps()[idx].log;
        animateStep(function () { if (onDone) setTimeout(onDone, 0); });
    }

    function vizStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        var steps = currentSteps();
        function tick() {
            var next = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.6);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; anim = 1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('cors-viz__speed-btn--active'); });
        btn.classList.add('cors-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cors-viz__mode-btn--active', d.key === m); });
        vizReset();
    }

    logEl.textContent = defaultLog();

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW: GW, GH: GH,
                mousePos: { x: -1, y: -1 },
                tooltipHits: [],
                hoveredKey: function () { return null; },
                setHoveredKey: function () {},
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();