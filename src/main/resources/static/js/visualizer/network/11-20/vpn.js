/**
 * VPN 터널링 시각화
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
    var root    = el('div', 'vpn-viz');
    var toolbar = el('div', 'vpn-viz__toolbar');
    var tbLeft  = el('div', 'vpn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'vpn-viz__title', 'VPN'));

    var modeWrap = el('div', 'vpn-viz__mode');
    var modeDefs = [
        { key: 'tunnel', label: '캡슐화' },
        { key: 'path', label: '패킷의 여정' },
        { key: 'kinds', label: '종류와 방식' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'vpn-viz__mode-btn' + (i === 0 ? ' vpn-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'vpn-viz__speed');
    speedWrap.appendChild(el('span', 'vpn-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'vpn-viz__speed-btn' + (i === 0 ? ' vpn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'vpn-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'vpn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'vpn-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'vpn-viz__controls');
    var btnPlay  = el('button', 'vpn-viz__btn vpn-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'vpn-viz__btn', '▶| STEP');
    var btnReset = el('button', 'vpn-viz__btn', '↺ RESET');
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
    var mode    = 'tunnel';
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

    /* ===================== 데이터: 주소와 단계 ===================== */
    var VPN_CLIENT = '10.8.0.2';
    var INNER_DST = '192.168.10.5';
    var CLIENT_PUB = '203.0.113.20';
    var GW_PUB = '198.51.100.1';
    var INNER_TXT = '내부 패킷: ' + VPN_CLIENT + ' → ' + INNER_DST + ' (사설 주소)';
    var OUTER_TXT = '외부 패킷: ' + CLIENT_PUB + ' → ' + GW_PUB + ' (공인 주소)';
    var INNER_S = '내부: ' + VPN_CLIENT + ' → ' + INNER_DST;
    var OUTER_S = '외부: ' + CLIENT_PUB + ' → ' + GW_PUB;
    function shortTxt(s, mob) {
        return mob ? s.replace(INNER_TXT, INNER_S).replace(OUTER_TXT, OUTER_S) : s;
    }

    var TUNNEL_STEPS = [
        { k: 0, log: '원격 근무자의 노트북이 인터넷을 거쳐 회사 내부 서버 ' + INNER_DST + '에 접속합니다. 이 주소는 사설 주소라 인터넷에서는 보낼 수 없고, 평문으로 보내면 중간에서 내용이 보입니다. VPN은 패킷을 다른 패킷 안에 넣어(캡슐화) 암호화해서 보냅니다.' },
        { k: 1, log: '1단계 — 노트북의 VPN 소프트웨어가 보낼 원래 패킷(내부 패킷)을 만듭니다. VPN이 준 가상 주소 ' + VPN_CLIENT + '에서 내부 서버 ' + INNER_DST + '로 가는 패킷입니다.' },
        { k: 2, log: '2단계 — 내부 패킷 전체(헤더와 데이터)를 암호화합니다. 암호문이 되면 내부 주소와 내용 모두 중간 장비가 읽을 수 없습니다.' },
        { k: 3, log: '3단계 — 암호문에 VPN 헤더와 새 외부 IP 헤더를 덧붙입니다(캡슐화). 외부 헤더의 주소는 인터넷에서 통하는(NAT를 거친 뒤의) 노트북의 공인 주소 ' + CLIENT_PUB + '와 VPN 게이트웨이 ' + GW_PUB + '입니다. 이 터널링 때문에 바깥에서는 노트북과 게이트웨이 사이의 통신으로만 보입니다.' },
        { k: 4, log: '4단계 — 인터넷의 중간 장비는 외부 헤더(외부 IP 헤더와 VPN 헤더)를 읽을 수 있지만, 내부 주소와 데이터는 암호문이어서 읽을 수 없습니다. 이것이 VPN이 공용 인터넷 구간의 도청을 막는 방식입니다.' },
        { k: 5, log: '5단계 — 게이트웨이는 반대로 외부 헤더를 벗기고(캡슐 해제) 암호문을 복호화해 원래 내부 패킷을 꺼냅니다. 그 패킷을 사내망으로 전달하면 노트북이 사내망에 있는 것처럼 동작합니다.' }
    ];

    var PATH_STEPS = [
        { seg: -1, hl: {}, pkt: [], log: '노트북에서 사내 서버까지 패킷이 지나가는 경로를 따라갑니다. 노트북과 VPN 게이트웨이 사이는 공용 인터넷이고, 게이트웨이 뒤는 사내망입니다.' },
        { seg: -1, hl: { C: ['암호화', 'orange'] }, pkt: [INNER_TXT, '→ 암호화하고 외부 헤더를 붙임'], log: '노트북의 VPN 소프트웨어가 내부 패킷을 암호화하고 외부 헤더를 붙여 터널로 내보냅니다.' },
        { seg: 0, hl: { C: ['송신', 'orange'], I: ['도청 가능', 'red'] }, pkt: [OUTER_TXT, '내용: 암호문 (읽을 수 없음)'], log: '인터넷 구간입니다. 도청하는 사람이 있어도 보이는 것은 외부 헤더(노트북 ↔ 게이트웨이)와 암호문뿐입니다.' },
        { seg: 1, hl: { G: ['복호화', 'green'] }, pkt: [OUTER_TXT, '→ 외부 헤더를 벗기고 복호화'], log: 'VPN 게이트웨이가 외부 패킷을 받아 복호화하고 외부 헤더를 벗겨 원래 내부 패킷을 얻습니다.' },
        { seg: 2, hl: { G: ['전달', 'green'], S: ['수신', 'teal'] }, pkt: [INNER_TXT, '사내망 안에서는 VPN 보호 없는 내부 패킷'], log: '게이트웨이가 내부 패킷을 사내 서버에 전달합니다. 서버에게는 사내망의 가상 주소 ' + VPN_CLIENT + '에서 온 평범한 요청으로 보입니다.' },
        { seg: 2, hl: { S: ['응답', 'teal'], G: ['암호화', 'green'] }, pkt: ['응답: ' + INNER_DST + ' → ' + VPN_CLIENT, '→ 게이트웨이가 암호화하고 외부 헤더를 붙임'], log: '서버의 응답은 반대 방향으로 같은 과정을 거칩니다. 게이트웨이가 응답을 암호화·캡슐화해 노트북으로 되돌려 보냅니다. 노트북이 복호화하면 한 번의 왕복이 끝납니다.' }
    ];

    var KIND_STEPS = [
        { k: 0, log: 'VPN은 연결하는 대상에 따라 크게 두 가지로 나누고, 터널을 만드는 프로토콜도 여러 가지입니다.' },
        { k: 1, log: '원격 접속(remote access) VPN — 개별 사용자의 기기가 회사 게이트웨이와 터널을 만듭니다. 재택근무자의 노트북이 사내망에 접속하는 경우입니다.' },
        { k: 2, log: '사이트 간(site-to-site) VPN — 본사와 지사의 게이트웨이끼리 터널을 만들어, 두 네트워크 안의 기기들이 VPN을 의식하지 않고 서로 통신합니다.' },
        { k: 3, log: 'IPsec — IP 계층에서 패킷을 보호합니다. 데이터는 ESP로 암호화하고 키 교환에는 IKE를 씁니다. 사이트 간 VPN에 널리 쓰입니다.' },
        { k: 4, log: 'WireGuard — UDP 위에서 동작하는 비교적 새로운 VPN으로 코드가 작고 설정이 단순합니다. 리눅스 커널에는 5.6부터 포함되었습니다.' },
        { k: 5, log: 'OpenVPN — TLS를 이용하는 VPN으로, 기본 포트는 UDP 1194이고 TCP도 쓸 수 있습니다. 방식마다 장단점이 있어 환경에 맞게 고릅니다.' }
    ];
    var KINDS = [
        ['IPsec', 'IP 계층 · ESP + IKE', 'orange'],
        ['WireGuard', 'UDP · 단순한 설정', 'teal'],
        ['OpenVPN', 'TLS 기반 · UDP 1194', 'purple']
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'path') return PATH_STEPS;
        if (mode === 'kinds') return KIND_STEPS;
        return TUNNEL_STEPS;
    }
    function defaultLog() {
        if (mode === 'path') return '패킷이 노트북에서 사내 서버까지 터널을 지나는 경로를 봅니다.';
        if (mode === 'kinds') return 'VPN의 두 가지 구성과 대표적인 터널 프로토콜을 봅니다.';
        return '원래 패킷이 암호화되고 새 헤더에 싸여 터널로 나가는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'kinds' ? 236 : (mode === 'path' ? (mob ? 232 : 228) : (mob ? 326 : 300));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function block(x, y, w, h, label, color, fs, strong) {
        rr(x, y, w, h, 4, color + (strong ? '40' : '22'), color + (strong ? 'ff' : '99'), strong ? 1.8 : 1.2);
        if (label) tx(label, x + w / 2, y + h / 2, fs, P.text + 'ff', 'center', true);
    }
    function lock(cx, cy, col) {
        rr(cx - 6, cy - 2, 12, 9, 2, col + 'ff', 'none', 1);
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 4, Math.PI, 0);
        ctx.strokeStyle = col + 'ff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    function eye(cx, cy, col, blocked) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, 11, 6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = col + 'ff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        circ(cx, cy, 3, col + 'ff', 'none', 1);
        if (blocked) ln(cx - 12, cy + 8, cx + 12, cy - 8, P.red + 'ff', 2.4);
    }

    /* ===================== 캡슐화 ===================== */
    function drawTunnel(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k, q = ez(e);
        var bh = 34;
        var pitch = mob ? 82 : 74;
        var y1 = top + 4, y2 = y1 + pitch, y3 = y2 + pitch;
        var spy = k >= 4;
        var f1 = k === 1 && pk < 1, f2 = k === 2 && pk < 2, f3 = k === 3 && pk < 3, f4 = k === 4 && pk < 4;
        var rev = k === 5 && pk < 5;

        if (k >= 1) {
            var a1 = f1 ? q : 1;
            ctx.globalAlpha = a1;
            tx('원래 패킷 (내부 패킷)', x0, y1 + 6, fs - 1, P.sub + 'ff', 'left', true);
            var dx1 = f1 ? (1 - q) * -40 : 0;
            block(x0 + dx1, y1 + 14, w * 0.36, bh, '내부 IP 헤더', P.teal, fs - 1, false);
            block(x0 + w * 0.36 + 4 + dx1 * 0.5, y1 + 14, w * 0.64 - 4, bh, '데이터', P.teal, fs - 1, false);
            tx(mob ? INNER_S : INNER_TXT, x0, y1 + 14 + bh + 12, fs - 1.5, P.sub + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        }
        if (k >= 2) {
            var enc = f2 ? ez(seg(e, 0.2, 0.7)) : 1;
            var yy2 = f2 ? lerp(y1 + 14, y2 + 14, ez(seg(e, 0, 0.35))) : y2 + 14;
            ctx.globalAlpha = f2 ? clamp01(e * 4) : 1;
            tx('암호화', x0 + w / 2, y2 + 6, fs - 1, P.yellow + 'ff', 'center', true);
            rr(x0, yy2, w, bh, 4, P.teal + '22', P.teal + '99', 1.2);
            if (enc > 0) {
                ctx.globalAlpha = (f2 ? clamp01(e * 4) : 1) * enc;
                rr(x0, yy2, w * enc, bh, 4, P.red + (spy ? '40' : '22'), P.red + 'ff', spy ? 1.8 : 1.2);
            }
            ctx.globalAlpha = f2 ? clamp01(e * 4) : 1;
            tx(enc > 0.5 ? (mob ? '암호문 (전체 암호화)' : '암호문 (내부 헤더와 데이터를 모두 암호화)') : '평문', x0 + w / 2 + (enc > 0.5 ? 10 : 0), yy2 + bh / 2, fs - 1, P.text + 'ff', 'center', true);
            if (enc > 0.5) lock(x0 + 12, yy2 + bh / 2 + 1, P.yellow);
            ctx.globalAlpha = 1;
        }
        if (k >= 3) {
            var cp = f3 ? ez(seg(e, 0, 0.5)) : 1;
            var hd = f3 ? ez(seg(e, 0.3, 0.8)) : 1;
            ctx.globalAlpha = f3 ? clamp01(e * 4) : 1;
            tx('캡슐화한 패킷 (외부 패킷)', x0, y3 + 6, fs - 1, P.sub + 'ff', 'left', true);
            var cx3 = lerp(x0, x0 + w * 0.44 + 4, cp), cw3 = lerp(w, w * 0.56 - 4, cp);
            var cy3 = f3 ? lerp(y2 + 14, y3 + 14, ez(seg(e, 0, 0.4))) : y3 + 14;
            block(cx3, cy3, cw3, bh, '암호문', P.red, fs - 1, spy);
            ctx.globalAlpha = (f3 ? hd : 1);
            var hx = f3 ? (1 - hd) * -50 : 0;
            block(x0 + hx, y3 + 14, w * 0.3, bh, '외부 IP 헤더', P.orange, fs - 1, spy);
            block(x0 + w * 0.3 + 4 + hx, y3 + 14, w * 0.14 - 4, bh, 'VPN', P.purple, fs - 1, false);
            ctx.globalAlpha = f3 ? clamp01(e * 4) : 1;
            tx(mob ? OUTER_S : OUTER_TXT, x0, y3 + 14 + bh + 12, fs - 1.5, P.sub + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        }
        if (k >= 4) {
            var ra = f4 ? ez(seg(e, 0.1, 0.5)) : 1;
            var gl = f4 && e < 1 ? 0.6 + 0.4 * Math.sin(e * 20) : 1;
            ctx.globalAlpha = ra;
            eye(x0 + w * 0.22, y3 - 12, P.yellow, false);
            eye(x0 + w * 0.72, y3 - 12, P.yellow, true);
            tx('읽을 수 있음', x0 + w * 0.22 + 18, y3 - 12, fs - 1.5, P.yellow + 'ff', 'left', true);
            tx('읽을 수 없음', x0 + w * 0.72 + 18, y3 - 12, fs - 1.5, P.red + 'ff', 'left', true);
            ctx.globalAlpha = gl;
            rr(x0 - 2, y3 + 12, w * 0.44 + 2, bh + 4, 6, 'none', P.yellow + 'ff', 1.8);
            ctx.globalAlpha = 1;
        }
        if (k >= 5) {
            var sw = rev ? ez(seg(e, 0.1, 0.8)) : 1;
            ctx.globalAlpha = rev ? clamp01(e * 3) : 1;
            var gy = y3 + 14 + bh + 30;
            tx(mob ? '게이트웨이: 헤더 제거 → 복호화 → 복원' : '게이트웨이: 외부 헤더 제거 → 복호화 → 내부 패킷 복원', x0, gy, fs - 1, P.green + 'ff', 'left', true);
            rr(x0, gy + 12, w, 6, 3, 'none', P.green + '66', 1);
            rr(x0, gy + 12, w * sw, 6, 3, P.green + '88', 'none', 1);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 패킷의 여정 ===================== */
    function drawPath(x0, top, w, mob, s, p, e, fs) {
        var steps = currentSteps();
        var idx = steps.indexOf(s);
        var gap = mob ? 14 : 28;
        var bw = (w - gap * 3) / 4;
        var bh = 58;
        var nodes = [
            { id: 'C', name: '노트북', sub: VPN_CLIENT, col: 'orange' },
            { id: 'I', name: '인터넷', sub: '공용망', col: 'red' },
            { id: 'G', name: '게이트웨이', sub: mob ? '' : GW_PUB, col: 'green' },
            { id: 'S', name: '사내 서버', sub: mob ? '' : INNER_DST, col: 'teal' }
        ];
        var y = top + 22;
        var cxN = function (i) { return x0 + i * (bw + gap) + bw / 2; };
        var arrived = seg(e, 0.6, 0.9);
        for (var i = 0; i < 3; i++) {
            var on = s.seg === i;
            ln(x0 + i * (bw + gap) + bw, y + bh / 2, x0 + (i + 1) * (bw + gap), y + bh / 2, on ? P.yellow + 'ff' : P.sub + '88', on ? 3 : 1.6);
        }
        nodes.forEach(function (n, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(n.col);
            var badge = s.hl[n.id];
            var pb = p.hl[n.id];
            var ba = badge ? (pb && pb[0] === badge[0] ? 1 : arrived) : 0;
            var bc = badge ? colorOf(badge[1]) : c;
            rr(x, y, bw, bh, 6, c + '18', (badge && ba > 0.3 ? bc : c) + (badge ? 'ff' : '88'), badge && ba > 0.3 ? 1.9 : 1.2);
            tx(n.name, x + bw / 2, y + 13, fs - (mob ? 0.5 : 0), c + 'ff', 'center', true);
            if (n.sub) tx(n.sub, x + bw / 2, y + 28, fs - 1.5, P.sub + 'ff', 'center', false);
            if (badge && ba > 0) {
                ctx.globalAlpha = ba;
                tx(badge[0], x + bw / 2, y + 46, fs - 1.5, bc + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        });
        var ty = y + bh + 18;
        ln(cxN(0), ty, cxN(2), ty, P.purple + '88', 10);
        tx(mob ? '암호화된 터널' : '암호화된 터널 (노트북 ↔ 게이트웨이)', (cxN(0) + cxN(2)) / 2, ty + 44, fs - 1.5, P.purple + 'ff', 'center', true);
        tx(mob ? '사내망(보호 밖)' : '사내망 (VPN 보호 밖)', cxN(3), ty + 44, fs - 1.5, P.teal + 'ff', 'center', true);

        var specs = [null, { at: 0, tf: 'enc' }, { from: 0, to: 2, st: 'cipher' }, { at: 2, tf: 'dec' }, { from: 2, to: 3, st: 'inner' }, { from: 3, to: 2, st: 'inner', then: 'enc' }];
        var sp = specs[idx];
        var cy = ty;
        var drawChip = function (cx, st, t01) {
            var inner = st === 'inner';
            var wC = mob ? 22 : 28;
            if (inner) {
                block(cx - wC, cy - 9, wC * 2, 18, '내부', P.teal, fs - 2, true);
                return;
            }
            var hdw = (mob ? 18 : 24) * t01;
            block(cx - wC - hdw / 2, cy - 9, wC * 2 + hdw, 18, '', P.red, fs - 2, true);
            tx('암호문', cx + hdw / 2, cy, fs - 2, P.text + 'ff', 'center', true);
            if (hdw > 4) block(cx - wC - hdw / 2, cy - 9, hdw, 18, '', P.orange, fs - 2, true);
        };
        if (sp) {
            if (sp.at !== undefined) {
                var t = ez(seg(e, 0.1, 0.7));
                var tt = sp.tf === 'enc' ? t : 1 - t;
                drawChip(cxN(sp.at), tt > 0.5 ? 'cipher' : 'inner', tt > 0.5 ? (tt - 0.5) * 2 : 0);
                if (tt > 0.5 && sp.tf === 'enc') lock(cxN(sp.at) + (mob ? 40 : 52), cy, P.yellow);
            } else {
                var u = ez(seg(e, 0.05, sp.then ? 0.55 : 0.85));
                var px = lerp(cxN(sp.from), cxN(sp.to), u);
                var st = sp.st;
                var hd2 = 1;
                if (sp.then && u >= 1) {
                    var t2 = ez(seg(e, 0.55, 0.95));
                    st = t2 > 0.5 ? 'cipher' : 'inner';
                    hd2 = t2 > 0.5 ? (t2 - 0.5) * 2 : 0;
                }
                drawChip(px, st, st === 'cipher' ? hd2 : 0);
                if (st === 'cipher' && sp.st === 'cipher') {
                    var passI = Math.abs(px - cxN(1)) < bw * 0.6;
                    eye(cxN(1), cy + 24, passI ? P.red : P.sub, passI);
                }
            }
        }

        var py = ty + 62;
        var lh = mob ? 15 : 17;
        var ph = lh * 2 + 22;
        var same = s.pkt.join('|') === p.pkt.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        rr(x0, py, w, ph, 6, 'none', P.sub + '66', 1.2);
        tx('이 구간의 패킷', x0 + 10, py + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.pkt.length) {
            ctx.globalAlpha = ca;
            s.pkt.forEach(function (l, i) {
                tx(shortTxt(l, mob), x0 + 10, py + 12 + lh * (i + 1), fs - 1, (i === 0 ? P.text : P.yellow) + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 보낸 패킷이 없습니다)', x0 + 10, py + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }
    }

    /* ===================== 종류와 방식 ===================== */
    function drawKinds(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var bw = mob ? 92 : 110, bh = 30;
        var y = top + 8;
        var node = function (x, yy, label, col, a) {
            var c = colorOf(col);
            ctx.globalAlpha = a;
            rr(x, yy, bw, bh, 5, c + '18', c + 'ff', 1.4);
            tx(label, x + bw / 2, yy + bh / 2, fs - 1, c + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        };
        var tube = function (x1, x2, yy, on, fresh) {
            var g = fresh ? ez(seg(e, 0.2, 0.7)) : 1;
            ln(x1, yy, x2, yy, P.sub + '66', 3);
            ln(x1, yy, lerp(x1, x2, g), yy, P.purple + (on ? 'ff' : '88'), on ? 6 : 4);
            tx('터널', (x1 + x2) / 2, yy - 12, fs - 1.5, (on ? P.purple : P.sub) + 'ff', 'center', true);
            if (fresh && g < 1) {
                for (var i = 0; i < 3; i++) {
                    var dp = clamp01(g * 1.4 - i * 0.2);
                    if (dp > 0 && dp < 1) circ(lerp(x1, x2, dp), yy, 5, P.yellow + 'ff', 'none', 1);
                }
            }
        };
        var blocks = [[1, y, '원격 접속 VPN', '노트북', 'orange', mob ? '게이트웨이' : 'VPN 게이트웨이', 'green'], [2, y + 66, '사이트 간 VPN', '본사 게이트웨이', 'green', '지사 게이트웨이', 'green']];
        blocks.forEach(function (b) {
            var on = k >= b[0], cur = k === b[0], fresh = cur && pk < b[0];
            tx(b[2], x0, b[1], fs - 0.5, (cur ? P.text : P.sub) + 'ff', 'left', true);
            if (!on) return;
            var a = fresh ? ez(seg(e, 0, 0.3)) : 1;
            node(x0, b[1] + 12, b[3], b[4], a);
            node(x0 + w - bw, b[1] + 12, b[5], b[6], a);
            ctx.globalAlpha = a;
            tube(x0 + bw, x0 + w - bw, b[1] + 12 + bh / 2, cur, fresh);
            ctx.globalAlpha = 1;
        });
        var y3 = y + 132;
        KINDS.forEach(function (r, i) {
            var rowK = 3 + i;
            if (k < rowK) return;
            var yy = y3 + i * 28;
            var cur = k === rowK;
            var fresh = cur && pk < rowK;
            var q = fresh ? ez(seg(e, 0, 0.5)) : 1;
            var c = colorOf(r[2]);
            ctx.globalAlpha = q;
            rr(x0 + (1 - q) * 30, yy, w, 24, 4, cur ? c + '25' : 'none', c + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
            tx(r[0], x0 + 10 + (1 - q) * 30, yy + 12, fs - 1, c + 'ff', 'left', true);
            tx(r[1], x0 + w - 10 + (1 - q) * 30, yy + 12, fs - 1.5, (cur ? P.text : P.sub) + 'ff', 'right', false);
            ctx.globalAlpha = 1;
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'path') drawPath(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'kinds') drawKinds(x0, top, w, mob, s, p, e, L.fs);
        else drawTunnel(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('vpn-viz__speed-btn--active'); });
        btn.classList.add('vpn-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('vpn-viz__mode-btn--active', d.key === m); });
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