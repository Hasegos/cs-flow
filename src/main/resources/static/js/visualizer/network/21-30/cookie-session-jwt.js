/**
 * 쿠키 · 세션 · JWT 시각화
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
    var root    = el('div', 'cjwt-viz');
    var toolbar = el('div', 'cjwt-viz__toolbar');
    var tbLeft  = el('div', 'cjwt-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cjwt-viz__title', 'COOKIE · SESSION · JWT'));

    var modeWrap = el('div', 'cjwt-viz__mode');
    var modeDefs = [
        { key: 'session', label: '세션 + 쿠키' },
        { key: 'jwt', label: 'JWT' },
        { key: 'revoke', label: '로그아웃과 폐기' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cjwt-viz__mode-btn' + (i === 0 ? ' cjwt-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cjwt-viz__speed');
    speedWrap.appendChild(el('span', 'cjwt-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cjwt-viz__speed-btn' + (i === 0 ? ' cjwt-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cjwt-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cjwt-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cjwt-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cjwt-viz__controls');
    var btnPlay  = el('button', 'cjwt-viz__btn cjwt-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cjwt-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cjwt-viz__btn', '↺ RESET');
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
    var mode    = 'session';
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
        { id: 'C', name: '클라이언트', sub: '브라우저', col: 'orange' },
        { id: 'S', name: '서버', sub: '애플리케이션', col: 'teal' },
        { id: 'D', name: '저장소', sub: '세션 데이터', col: 'purple' }
    ];
    var SID = '3f9a1c7e…';
    var HEAD = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    var PAY = 'eyJzdWIiOiJraW0iLCJleHAiOjE4MDAwMDAwMDB9';
    var SIG = 'TKioOZi_z_vysPYQRp_RpNH2SplZQa5zV9uVKOWSWXg';
    var TOKEN_SHORT = 'eyJhbGciOiJIUzI1NiIs…';

    function T(s) { return [s, 'text']; }
    function Y(s) { return [s, 'yellow']; }
    function G(s) { return [s, 'green']; }
    function R(s) { return [s, 'red']; }

    function st(log, o) {
        var s = { log: log, from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [] };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var COOKIE_C = [Y('쿠키 sid=' + SID)];
    var SESSION_S = [Y(SID + ' → { user: kim }')];
    var LOGIN_MSG = [T('POST /login HTTP/1.1'), Y('username=kim'), Y('password=********')];

    var SESSION_STEPS = [
        st('HTTP는 요청마다 독립적이라 서버는 이전 요청을 기억하지 못합니다. 로그인한 사용자를 알아보려면 요청마다 "나는 누구다"를 증명할 방법이 필요합니다. 세션 방식은 사용자 정보를 서버가 저장하고, 클라이언트에는 그 번호표(세션 ID)만 줍니다.', {}),
        st('로그인 요청 — 클라이언트가 아이디와 비밀번호를 서버에 보냅니다(실제로는 HTTPS로 보내야 합니다).',
            { from: 'C', to: 'S', kind: 'req', label: 'POST /login', msg: LOGIN_MSG, hl: { C: ['로그인 요청', 'orange'], S: ['수신', 'teal'] } }),
        st('서버가 인증에 성공하면 세션을 만듭니다. 예측할 수 없는 난수로 세션 ID를 정하고, 사용자 정보를 서버 쪽 저장소에 저장합니다(세션 ID는 화면 크기에 맞춰 줄여 표시했습니다).',
            { from: 'S', to: 'D', kind: 'req', label: '세션 저장', msg: [Y('저장: ' + SID + ' → 사용자 kim')], hl: { S: ['인증 성공', 'teal'], D: ['세션 저장', 'purple'] }, srv: SESSION_S }),
        st('서버가 응답의 Set-Cookie 헤더로 세션 ID를 내려 보내고, 브라우저는 이 쿠키를 저장합니다. 사용자 정보는 서버에 있고 클라이언트에는 번호표만 있습니다. HttpOnly는 자바스크립트가 쿠키를 읽지 못하게, Secure는 HTTPS에서만 보내게 합니다.',
            { from: 'S', to: 'C', kind: 'res', label: '200 OK + Set-Cookie', msg: [T('HTTP/1.1 200 OK'), Y('Set-Cookie: sid=' + SID), Y('  HttpOnly; Secure; SameSite=Lax')], hl: { C: ['쿠키 저장', 'orange'], S: ['응답', 'teal'] }, cli: COOKIE_C, srv: SESSION_S }),
        st('다음 요청부터 브라우저가 같은 서버로 가는 요청에 쿠키를 자동으로 붙입니다. 개발자가 따로 코드를 쓰지 않아도 됩니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'GET /me + Cookie', msg: [T('GET /me HTTP/1.1'), Y('Cookie: sid=' + SID)], hl: { C: ['쿠키 전송', 'orange'], S: ['수신', 'teal'] }, cli: COOKIE_C, srv: SESSION_S }),
        st('서버는 쿠키의 세션 ID로 저장소를 조회해 이 요청이 사용자 kim의 것임을 알아냅니다. 요청마다 저장소 조회가 한 번 필요합니다.',
            { from: 'S', to: 'D', kind: 'req', label: '세션 조회', msg: [Y('조회: ' + SID), G('→ 사용자 kim')], hl: { S: ['조회', 'teal'], D: ['kim 확인', 'purple'] }, cli: COOKIE_C, srv: SESSION_S }),
        st('사용자를 확인했으므로 요청한 데이터를 응답합니다.',
            { from: 'S', to: 'C', kind: 'res', label: '200 OK', msg: [T('HTTP/1.1 200 OK'), Y('{ "user": "kim" }')], hl: { C: ['수신', 'orange'], S: ['응답', 'teal'] }, cli: COOKIE_C, srv: SESSION_S })
    ];

    var JWT_C = [Y('토큰 ' + TOKEN_SHORT)];
    var JWT_S = [['저장하는 사용자 정보 없음 (비밀키만 보관)', 'sub']];
    var JWT_STEPS = [
        st('JWT 방식에서는 서버가 사용자 정보를 저장하지 않습니다. 사용자 정보(클레임)를 토큰 안에 담고 서버의 비밀키로 서명해 클라이언트에게 줍니다. 서버는 나중에 서명만 검증하면 됩니다.', {}),
        st('로그인 요청은 세션 방식과 같습니다. 클라이언트가 아이디와 비밀번호를 서버에 보냅니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'POST /login', msg: LOGIN_MSG, hl: { C: ['로그인 요청', 'orange'], S: ['수신', 'teal'] } }),
        st('인증에 성공하면 서버가 토큰을 만듭니다. 헤더(' + HEAD.length + '글자)와 페이로드(' + PAY.length + '글자)를 Base64url로 인코딩해 점으로 잇고, 그 위에 비밀키로 계산한 서명(' + SIG.length + '글자)을 붙입니다. 저장소에는 아무것도 저장하지 않습니다.',
            { from: null, to: null, kind: '', label: '토큰 만들기', msg: [Y('헤더 {"alg":"HS256","typ":"JWT"}'), Y('페이로드 {"sub":"kim","exp":1800000000}'), Y('서명 = HMAC-SHA256(헤더.페이로드, 비밀키)')], hl: { S: ['토큰 발급', 'teal'], D: ['사용 안 함', 'muted'] }, srv: JWT_S }),
        st('서버가 토큰을 응답으로 돌려주고, 클라이언트가 이를 보관합니다. 토큰 문자열은 헤더.페이로드.서명 세 부분이 점으로 이어진 모양입니다.',
            { from: 'S', to: 'C', kind: 'res', label: '200 OK + 토큰', msg: [T('HTTP/1.1 200 OK'), Y('{ "access_token":'), Y('  "' + TOKEN_SHORT + '" }')], hl: { C: ['토큰 보관', 'orange'], S: ['응답', 'teal'], D: ['사용 안 함', 'muted'] }, cli: JWT_C, srv: JWT_S }),
        st('클라이언트가 요청의 Authorization 헤더에 토큰을 실어 보냅니다. 쿠키와 달리 브라우저가 자동으로 붙이지 않아 코드에서 직접 붙입니다(토큰을 쿠키에 담아 보내는 구성도 있습니다).',
            { from: 'C', to: 'S', kind: 'req', label: 'GET /me + Bearer', msg: [T('GET /me HTTP/1.1'), Y('Authorization: Bearer ' + TOKEN_SHORT)], hl: { C: ['토큰 전송', 'orange'], S: ['수신', 'teal'], D: ['사용 안 함', 'muted'] }, cli: JWT_C, srv: JWT_S }),
        st('서버는 받은 헤더와 페이로드로 서명을 다시 계산해 토큰의 서명과 비교하고 만료 시각(exp)을 확인합니다. 저장소를 조회하지 않고 토큰만으로 사용자가 kim임을 압니다.',
            { from: null, to: null, kind: '', label: '서명 검증', msg: [G('서명을 다시 계산 → 일치'), G('exp 확인 → 아직 유효'), Y('sub = kim')], hl: { S: ['서명 검증', 'green'], D: ['조회 없음', 'muted'] }, cli: JWT_C, srv: JWT_S }),
        st('검증을 통과했으므로 요청한 데이터를 응답합니다.',
            { from: 'S', to: 'C', kind: 'res', label: '200 OK', msg: [T('HTTP/1.1 200 OK'), Y('{ "user": "kim" }')], hl: { C: ['수신', 'orange'], S: ['응답', 'teal'], D: ['조회 없음', 'muted'] }, cli: JWT_C, srv: JWT_S }),
        st('누군가 페이로드를 열어 sub를 admin으로 바꿔 보냈다고 해 봅시다. 페이로드는 암호화가 아니라 인코딩이라서 누구나 읽고 바꿀 수 있습니다. 지키는 것은 서명입니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'GET /me (변조)', msg: [T('GET /me HTTP/1.1'), Y('Authorization: Bearer 헤더.페이로드*.서명'), R('* sub를 kim에서 admin으로 바꿈')], hl: { C: ['변조한 토큰', 'red'], S: ['수신', 'teal'], D: ['사용 안 함', 'muted'] }, cli: JWT_C, srv: JWT_S }),
        st('바뀐 페이로드로 서명을 다시 계산하면 토큰의 서명과 다릅니다. 공격자는 비밀키가 없어 맞는 서명을 만들 수 없으므로 서버가 요청을 거부합니다.',
            { from: 'S', to: 'C', kind: 'err', label: '401 Unauthorized', msg: [R('서명을 다시 계산 → 불일치'), R('HTTP/1.1 401 Unauthorized')], hl: { C: ['거부됨', 'red'], S: ['서명 불일치', 'red'], D: ['사용 안 함', 'muted'] }, cli: JWT_C, srv: JWT_S })
    ];

    var REVOKE_STEPS = [
        st('두 방식의 큰 차이는 서버가 사용 중인 인증 정보를 통제할 수 있는지입니다. 사용자가 로그아웃하거나 쿠키·토큰이 유출됐을 때 어떻게 되는지 비교합니다. 앞쪽 단계는 세션, 뒤쪽 단계는 JWT입니다.',
            { cli: COOKIE_C, srv: SESSION_S }),
        st('[세션] 사용자가 로그아웃을 요청합니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'POST /logout', msg: [T('POST /logout HTTP/1.1'), Y('Cookie: sid=' + SID)], hl: { C: ['로그아웃', 'orange'], S: ['수신', 'teal'] }, cli: COOKIE_C, srv: SESSION_S }),
        st('[세션] 서버가 저장소에서 세션을 삭제합니다. 번호표가 사라졌으므로 이 세션 ID는 이제 어디서도 쓸 수 없습니다. 관리자가 강제로 로그아웃시킬 때도 같은 방법을 씁니다.',
            { from: 'S', to: 'D', kind: 'req', label: '세션 삭제', msg: [R('삭제: ' + SID)], hl: { S: ['삭제 요청', 'teal'], D: ['세션 삭제', 'red'] }, cli: COOKIE_C, srv: [['(비어 있음)', 'sub']] }),
        st('[세션] 그 전에 유출된 쿠키를 가진 누군가가 같은 세션 ID로 요청합니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'GET /me + 옛 쿠키', msg: [T('GET /me HTTP/1.1'), Y('Cookie: sid=' + SID)], hl: { C: ['유출된 쿠키', 'red'], S: ['수신', 'teal'] }, cli: COOKIE_C, srv: [['(비어 있음)', 'sub']] }),
        st('[세션] 저장소에 해당 세션 ID가 없으므로 거부합니다. 서버가 세션을 지우는 순간부터 즉시 무효가 됩니다.',
            { from: 'S', to: 'C', kind: 'err', label: '401 Unauthorized', msg: [R('조회: ' + SID + ' → 없음'), R('HTTP/1.1 401 Unauthorized')], hl: { C: ['거부됨', 'red'], S: ['조회 실패', 'red'], D: ['세션 없음', 'red'] }, cli: COOKIE_C, srv: [['(비어 있음)', 'sub']] }),
        st('[JWT] 같은 상황입니다. 사용자가 로그아웃해도 서버는 발급한 토큰을 기억하지 않아 지울 것이 없습니다. 클라이언트가 자기 토큰을 지워도, 이미 복사된 토큰은 그대로 남습니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'POST /logout', msg: [T('POST /logout HTTP/1.1'), Y('Authorization: Bearer ' + TOKEN_SHORT), ['서버에 지울 세션이 없음', 'sub']], hl: { C: ['로그아웃', 'orange'], S: ['지울 것 없음', 'teal'], D: ['사용 안 함', 'muted'] }, cli: [['클라이언트는 지움 (복사본은 남을 수 있음)', 'sub']], srv: JWT_S }),
        st('[JWT] 유출된 토큰으로 누군가 요청합니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'GET /me + 복사된 토큰', msg: [T('GET /me HTTP/1.1'), Y('Authorization: Bearer ' + TOKEN_SHORT)], hl: { C: ['유출된 토큰', 'red'], S: ['수신', 'teal'], D: ['사용 안 함', 'muted'] }, cli: [['클라이언트는 지움 (복사본은 남을 수 있음)', 'sub']], srv: JWT_S }),
        st('[JWT] 서명이 맞고 만료 시각(exp)도 지나지 않았으므로 서버는 이 토큰을 정상으로 받아들입니다. 토큰은 만료될 때까지 유효합니다.',
            { from: 'S', to: 'C', kind: 'res', label: '200 OK', msg: [G('서명 일치, exp 전 → 통과'), T('HTTP/1.1 200 OK')], hl: { C: ['통과됨', 'red'], S: ['서명 검증', 'green'], D: ['조회 없음', 'muted'] }, cli: [['클라이언트는 지움 (복사본은 남을 수 있음)', 'sub']], srv: JWT_S }),
        st('[JWT] 대응 방법은 둘입니다. 액세스 토큰의 만료를 짧게 하고 갱신 토큰으로 다시 발급하거나, 폐기한 토큰의 ID(jti)를 차단 목록에 저장하는 것입니다. 차단 목록을 쓰면 요청마다 저장소를 조회하게 되어 세션 방식과 비슷해집니다.',
            { from: null, to: null, kind: '', label: '폐기 대책', msg: [Y('① 만료를 짧게 + 갱신 토큰'), Y('② 폐기한 토큰의 jti를 차단 목록에 저장')], hl: { S: ['대책 필요', 'teal'], D: ['차단 목록', 'purple'] }, cli: [['클라이언트는 지움 (복사본은 남을 수 있음)', 'sub']], srv: [Y('차단 목록: 폐기된 jti …')] })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'jwt') return JWT_STEPS;
        if (mode === 'revoke') return REVOKE_STEPS;
        return SESSION_STEPS;
    }
    function defaultLog() {
        if (mode === 'jwt') return '서버가 사용자 정보를 저장하지 않고, 서명한 토큰만으로 사용자를 확인하는 과정을 봅니다.';
        if (mode === 'revoke') return '로그아웃하거나 쿠키 · 토큰이 유출됐을 때 세션과 JWT가 어떻게 다른지 봅니다.';
        return '서버가 세션을 저장하고 쿠키로 세션 ID만 주고받아 사용자를 알아보는 과정을 봅니다.';
    }
    function variantOf(s, idx) {
        if (mode === 'jwt') return 'jwt';
        if (mode === 'revoke') {
            if (s && s.log.indexOf('[JWT]') === 0) return 'jwt';
            return 'session';
        }
        return 'session';
    }
    function tokenShown(s, idx) {
        if (mode === 'jwt') return idx >= 3;
        if (mode === 'revoke') return s.log.indexOf('[JWT]') === 0;
        return false;
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
        var cliN = 0, srvN = 0, cardN = 0, anyTok = false;
        var steps = currentSteps();
        steps.forEach(function (s, i) {
            cliN = Math.max(cliN, wrapRows(s.cli, w - 28, fs - 1).length);
            srvN = Math.max(srvN, wrapRows(s.srv, w - 28, fs - 1).length);
            cardN = Math.max(cardN, wrapRows(s.msg, w - 76, fs - 1).length);
            if (tokenShown(s, i)) anyTok = true;
        });
        var cliH = 34 + (anyTok ? 38 : 0) + Math.max(1, cliN) * lh + 14;
        var cardH = Math.max(1, cardN) * lh + 14;
        var gapH = cardH + 70;
        var srvH = 34 + 30 + Math.max(1, srvN) * lh + (mode === 'session' ? 0 : 36) + 14;
        return { fs: fs, lh: lh, cliH: cliH, cardH: cardH, gapH: gapH, srvH: srvH, tok: anyTok, total: cliH + gapH + srvH + 6 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 토큰 막대 ===================== */
    function drawToken(x, y, w, bad) {
        var parts = [['헤더', HEAD.length, 'purple'], ['페이로드', PAY.length, 'orange'], ['서명', SIG.length, 'teal']];
        var total = HEAD.length + PAY.length + SIG.length;
        var cx = x;
        parts.forEach(function (p, i) {
            var pw = (w - 24) * p[1] / total;
            var c = colorOf(bad && i === 1 ? 'red' : p[2]);
            rr(cx, y, pw, 26, 5, c + '33', c + 'ff', 1.6);
            tx(p[0], cx + pw / 2, y + 13, 10.5, c + 'ff', 'center', true);
            if (i < 2) tx('.', cx + pw + 6, y + 18, 14, P.text + 'ff', 'center', true);
            cx += pw + 12;
        });
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var idx = stepIdx;
        var s = step || { from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [], log: '' };
        var hl = s.hl || {};
        var variant = variantOf(s, idx);
        var showTok = step && tokenShown(s, idx);
        var tampered = step && s.label.indexOf('변조') >= 0;

        var cy0 = top;
        var cc = hl.C ? colorOf(hl.C[1]) : colorOf('orange');
        rr(x0, cy0, w, L.cliH, 10, P.orange + '0f', cc + (hl.C ? 'ff' : 'aa'), hl.C ? 2 : 1.6);
        tx('클라이언트 (브라우저)', x0 + 14, cy0 + 16, fs, P.orange + 'ff', 'left', true);
        if (hl.C) {
            ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
            var bw = ctx.measureText(hl.C[0]).width + 18;
            rr(x0 + w - bw - 10, cy0 + 6, bw, 20, 10, cc + '22', cc + 'ff', 1.2);
            tx(hl.C[0], x0 + w - bw / 2 - 10, cy0 + 16, fs - 1, cc + 'ff', 'center', true);
        }
        var yy = cy0 + 34;
        if (L.tok) {
            if (showTok) drawToken(x0 + 14, yy, w - 28, tampered);
            else tx('(토큰 없음)', x0 + 14, yy + 13, fs - 1, P.sub + 'ff', 'left', false);
            yy += 38;
        }
        var cliRows = wrapRows(s.cli, w - 28, fs - 1);
        if (!cliRows.length && !L.tok) tx('(가진 것 없음)', x0 + 14, yy + 8, fs - 1, P.sub + 'ff', 'left', false);
        cliRows.forEach(function (r, i) { tx(r[0], x0 + 14, yy + 8 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false); });

        var gapTop = cy0 + L.cliH + 8;
        var srvY = cy0 + L.cliH + L.gapH;
        var kc = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
        var goDown = s.from === 'C' && s.to === 'S';
        var goUp = s.from === 'S' && s.to === 'C';
        var store = s.from === 'S' && s.to === 'D';
        var laneL = x0 + 12, laneR = x0 + w - 12;
        arrow(laneL, gapTop - 2, laneL, srvY - 4, goDown ? kc + 'ff' : P.muted + '55', goDown ? 3 : 1.6, goDown ? undefined : [4, 4]);
        arrow(laneR, srvY - 4, laneR, gapTop - 2, goUp ? kc + 'ff' : P.muted + '55', goUp ? 3 : 1.6, goUp ? undefined : [4, 4]);

        var rows = wrapRows(s.msg, w - 76, fs - 1);
        var cardW = w - 52, cardX = x0 + 26;
        var yTop = gapTop, yBot = srvY - L.cardH - 6;
        var e = clamp01(t);
        var cy = null, alpha = 1, border = kc;
        if (goDown) cy = lerp(yTop, yBot, e);
        else if (goUp) cy = lerp(yBot, yTop, e);
        else if (store) { cy = yBot; alpha = e; }
        else if (rows.length) { cy = lerp(yTop, yBot, 0.5); alpha = e; border = P.yellow; }
        if (cy !== null && rows.length) {
            ctx.globalAlpha = alpha;
            rr(cardX, cy, cardW, L.cardH, 8, border + '1c', border + 'ff', 1.8);
            rows.forEach(function (r, i) {
                tx(r[0], cardX + 10, cy + 7 + L.lh / 2 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        }

        var sc = P.teal;
        rr(x0, srvY, w, L.srvH, 10, P.teal + '0f', sc + (hl.S ? 'ff' : 'aa'), hl.S ? 2 : 1.6);
        tx('서버', x0 + 14, srvY + 16, fs, P.teal + 'ff', 'left', true);
        if (hl.S) {
            var sc2 = colorOf(hl.S[1]);
            ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
            var sw = ctx.measureText(hl.S[0]).width + 18;
            rr(x0 + w - sw - 10, srvY + 6, sw, 20, 10, sc2 + '22', sc2 + 'ff', 1.2);
            tx(hl.S[0], x0 + w - sw / 2 - 10, srvY + 16, fs - 1, sc2 + 'ff', 'center', true);
        }
        var sy = srvY + 34;
        var dcol = hl.D ? colorOf(hl.D[1]) : P.muted;
        var title = variant === 'session' ? (mob ? '세션 저장소' : '세션 저장소 (서버 메모리 · DB · Redis)') :'저장소: 사용하지 않음 · 서버가 가진 것';
        if (variant === 'session') {
            var storeRows = wrapRows(s.srv, w - 40, fs - 1);
            var boxH = 26 + Math.max(1, storeRows.length) * L.lh + 6;
            var sp = store ? 0.5 + 0.5 * Math.sin(Math.min(1, t) * Math.PI) : 0;
            rr(x0 + 10, sy, w - 20, boxH, 6, dcol + '14', dcol + (hl.D ? 'ff' : '99'), hl.D ? 2 + sp * 2 : 1.2);
            tx(title, x0 + 20, sy + 12, fs - 1.5, P.sub + 'ff', 'left', true);
            if (hl.D) {
                ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
                var dw = ctx.measureText(hl.D[0]).width + 14;
                tx(hl.D[0], x0 + w - 20, sy + 12, fs - 1, dcol + 'ff', 'right', true);
            }
            if (!storeRows.length) tx('(비어 있음)', x0 + 20, sy + 30, fs - 1, P.sub + 'ff', 'left', false);
            storeRows.forEach(function (r, i) { tx(r[0], x0 + 20, sy + 30 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false); });
        } else {
            tx('🔑 비밀키만 보관', x0 + 14, sy + 8, fs - 1, P.sub + 'ff', 'left', true);
            if (hl.D) tx('저장소: ' + hl.D[0], x0 + 14, sy + 26, fs - 1, dcol + 'ff', 'left', true);
            var jr = wrapRows(s.srv, w - 28, fs - 1);
            jr.forEach(function (r, i) { tx(r[0], x0 + 14, sy + 46 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false); });
            if (s.label === '토큰 만들기') {
                drawToken(x0 + 14, srvY + L.srvH - 40, w - 28, false);
            }
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('cjwt-viz__speed-btn--active'); });
        btn.classList.add('cjwt-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cjwt-viz__mode-btn--active', d.key === m); });
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