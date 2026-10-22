/**
 * 유니 / 멀티 / 브로드캐스트 시각화
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
    var root    = el('div', 'mc-viz');
    var toolbar = el('div', 'mc-viz__toolbar');
    var tbLeft  = el('div', 'mc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mc-viz__title', 'MULTICAST'));

    var modeWrap = el('div', 'mc-viz__mode');
    var modeDefs = [
        { key: 'cast', label: '전송 방식' },
        { key: 'addr', label: '주소' },
        { key: 'igmp', label: '그룹 가입' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'mc-viz__mode-btn' + (i === 0 ? ' mc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'mc-viz__speed');
    speedWrap.appendChild(el('span', 'mc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'mc-viz__speed-btn' + (i === 0 ? ' mc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'mc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'mc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'mc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'mc-viz__controls');
    var btnPlay  = el('button', 'mc-viz__btn mc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'mc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'mc-viz__btn', '↺ RESET');
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
    var mode    = 'cast';
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

    /* ===================== 데이터: 호스트와 전송 방식 ===================== */
    var HOSTS = ['H1', 'H2', 'H3', 'H4', 'H5'];
    var INTERESTED = [1, 0, 1, 0, 1];
    var WANT = INTERESTED.reduce(function (a, b) { return a + b; }, 0);
    var GROUP = '239.1.2.3';
    function none() { return [0, 0, 0, 0, 0]; }
    function recvOf(list) { return list.filter(function (v) { return v === 1; }).length; }
    var ST_UNI1 = [1, 0, 0, 0, 0];
    var ST_UNI3 = [1, 0, 1, 0, 1];
    var ST_BC = [1, 2, 1, 2, 1];
    var ST_MC = [1, 0, 1, 0, 1];
    var CAST_STEPS = [
        { copies: 0, st: none(), up: [], mem: null, lines: [], lab: '', val: '',
          log: '송신자가 같은 데이터를 보낼 때 받는 쪽이 누구인지에 따라 유니캐스트, 브로드캐스트, 멀티캐스트로 나뉩니다. 같은 네트워크의 호스트 5개(H1~H5) 가운데 H1, H3, H5가 이 데이터를 원하는 상황을 봅니다.' },
        { copies: 1, st: ST_UNI1, up: [], mem: null, lines: ['유니캐스트: 받는 호스트 1대(H1)', '송신 1번, 받는 호스트 1대'], lab: '송신 횟수', val: '1번',
          log: '유니캐스트는 송신자와 수신자가 1:1로 통신합니다. 웹 서핑 같은 일반적인 인터넷 통신이 대부분 유니캐스트입니다.' },
        { copies: WANT, st: ST_UNI3, up: [], mem: null, lines: ['같은 데이터를 H1, H3, H5에 각각 전송', '받는 사람이 늘수록 송신도 늘어남'], lab: '송신 횟수', val: WANT + '번 (수신자마다 1번)',
          log: '같은 데이터를 원하는 호스트가 ' + WANT + '대이면 유니캐스트는 데이터를 ' + WANT + '번 보내야 합니다. 수신자가 늘수록 송신자의 부담과 네트워크 사용량이 비례해서 늘어납니다.' },
        { copies: 1, st: ST_BC, up: [], mem: null, lines: ['브로드캐스트: 같은 네트워크 전체에 전송', 'H2, H4는 원하지 않아도 받아서 버림'], lab: '송신 횟수 / 받은 호스트', val: '1번 / ' + HOSTS.length + '대',
          log: '브로드캐스트는 같은 네트워크(브로드캐스트 도메인)의 모든 호스트에게 한 번에 보냅니다. 송신은 1번이지만 원하지 않는 H2, H4도 패킷을 받아 처리한 뒤 버려야 합니다. ARP 요청과 DHCP Discover가 이 방식입니다.' },
        { copies: 1, st: ST_MC, up: [], mem: null, lines: ['멀티캐스트: 그룹에 가입한 호스트만 수신', 'H1, H3, H5가 그룹 ' + GROUP + '에 가입'], lab: '송신 횟수 / 받은 호스트', val: '1번 / ' + recvOf(ST_MC) + '대',
          log: '멀티캐스트는 그룹 주소로 한 번 보내면 그 그룹에 가입한 호스트에게만 전달됩니다. 송신은 1번이고 원하는 ' + recvOf(ST_MC) + '대만 받으므로, 유니캐스트의 반복 전송과 브로드캐스트의 낭비를 모두 줄입니다.' },
        { copies: 0, st: none(), up: [], mem: null, lines: ['유니캐스트: 송신 ' + WANT + '번 · 받은 호스트 ' + recvOf(ST_UNI3) + '대', '브로드캐스트: 송신 1번 · 받은 호스트 ' + HOSTS.length + '대'], lab: '멀티캐스트', val: '송신 1번 · 받은 호스트 ' + recvOf(ST_MC) + '대',
          log: '정리 — 원하는 수신자가 ' + WANT + '대일 때 유니캐스트는 송신 ' + WANT + '번, 브로드캐스트는 송신 1번이지만 호스트 ' + HOSTS.length + '대 모두가 받고, 멀티캐스트는 송신 1번에 원하는 ' + recvOf(ST_MC) + '대만 받습니다.' }
    ];

    /* ===================== 데이터: 주소 ===================== */
    function macOf(ip) {
        var p = ip.split('.').map(Number);
        function h(n) { return ('0' + n.toString(16)).slice(-2); }
        return '01:00:5e:' + h(p[1] & 0x7F) + ':' + h(p[2]) + ':' + h(p[3]);
    }
    var ADDR_ROWS = [
        { name: '유니캐스트', val: '192.168.1.10', col: 'orange', note: '호스트 하나를 가리키는 주소' },
        { name: '브로드캐스트', val: '192.168.1.255', col: 'red', note: '192.168.1.0/24의 마지막 주소 (모든 호스트 비트가 1)' },
        { name: '멀티캐스트', val: '224.0.0.0 ~ 239.255.255.255', col: 'teal', note: '앞 4비트가 1110인 클래스 D 영역 (224.0.0.0/4)' },
        { name: '멀티캐스트 MAC', val: GROUP + ' → ' + macOf(GROUP), col: 'purple', note: '01:00:5e + 그룹 주소의 하위 23비트' }
    ];
    var ADDR_STEPS = [
        { k: 0, log: '전송 방식마다 쓰는 목적지 주소가 다릅니다. IPv4 주소와 이더넷 MAC 주소가 어떻게 달라지는지 한 줄씩 봅니다.' },
        { k: 1, log: '유니캐스트 — 목적지 주소가 호스트 하나를 가리킵니다. 예: 192.168.1.10.' },
        { k: 2, log: '브로드캐스트 — 서브넷의 호스트 비트를 모두 1로 채운 주소(192.168.1.255)로 그 네트워크 전체에 보냅니다. 제한된 브로드캐스트 주소 255.255.255.255는 라우터를 넘지 않습니다. IPv6에는 브로드캐스트가 없고 멀티캐스트가 그 역할을 합니다.' },
        { k: 3, log: '멀티캐스트 — 224.0.0.0부터 239.255.255.255까지가 멀티캐스트 그룹 주소입니다. 앞 4비트가 1110입니다. 예: 224.0.0.1은 같은 네트워크의 모든 호스트, 224.0.0.2는 모든 라우터를 가리킵니다.' },
        { k: 4, log: '이더넷에서는 멀티캐스트 그룹 주소를 MAC 주소 01:00:5e로 시작하는 주소에 대응시킵니다. 그룹 주소 ' + GROUP + '의 하위 23비트(1.2.3)를 붙여 ' + macOf(GROUP) + '가 됩니다.' },
        { k: 5, log: '정리 — 그룹 주소의 의미 있는 28비트 중 5비트는 MAC 주소로 옮겨지지 않아, 서로 다른 그룹 주소 32개가 같은 MAC 주소를 쓸 수 있습니다. 그래서 수신 호스트는 IP 계층에서 한 번 더 걸러야 합니다.' }
    ];

    /* ===================== 데이터: 그룹 가입 ===================== */
    var IGMP_STEPS = [
        { copies: 0, st: none(), up: [], mem: [0, 0, 0, 0, 0], lines: [], lab: '', val: '',
          log: '멀티캐스트는 수신자가 그룹에 가입해야 데이터를 받습니다. IPv4에서는 IGMP(Internet Group Management Protocol)로 가입과 탈퇴를 알립니다. 그룹 주소는 ' + GROUP + '입니다.' },
        { copies: 0, st: none(), up: [0], mem: [1, 0, 0, 0, 0], lines: ['H1이 그룹 ' + GROUP + ' 가입 보고(IGMP)', '네트워크가 H1을 가입자로 기억'], lab: '그룹 가입자', val: 'H1',
          log: 'H1이 IGMP 멤버십 보고(Membership Report)를 보내 그룹 ' + GROUP + '에 가입합니다. 라우터와 스위치가 이 보고를 보고 가입자를 기억합니다.' },
        { copies: 0, st: none(), up: [2, 4], mem: [1, 0, 1, 0, 1], lines: ['H3, H5도 같은 그룹에 가입', '가입자가 3대로 늘어남'], lab: '그룹 가입자', val: 'H1, H3, H5',
          log: 'H3과 H5도 같은 그룹에 가입합니다. 가입자는 H1, H3, H5 3대입니다.' },
        { copies: 1, st: ST_BC, up: [], mem: [1, 0, 1, 0, 1], lines: ['IGMP 스누핑을 안 쓰는 스위치', '그룹 프레임을 모든 포트로 내보냄'], lab: '프레임이 도착한 포트', val: HOSTS.length + '개 (가입 안 한 2개 포함)',
          log: '스위치가 IGMP를 모르면 멀티캐스트 프레임을 브로드캐스트처럼 모든 포트로 보냅니다. 가입하지 않은 H2, H4에도 프레임이 전달되어 불필요한 트래픽이 생깁니다.' },
        { copies: 1, st: ST_MC, up: [], mem: [1, 0, 1, 0, 1], lines: ['IGMP 스누핑을 쓰는 스위치', '가입자가 있는 포트로만 내보냄'], lab: '프레임이 도착한 포트', val: recvOf(ST_MC) + '개 (가입자만)',
          log: 'IGMP 스누핑을 지원하는 스위치는 오가는 IGMP 메시지를 엿보고 가입자가 있는 포트만 기억해, 그 포트로만 멀티캐스트 프레임을 보냅니다. 가입자 ' + recvOf(ST_MC) + '대만 받습니다.' },
        { copies: 1, st: [1, 0, 0, 0, 1], up: [2], mem: [1, 0, 0, 0, 1], lines: ['H3이 그룹 탈퇴(IGMP Leave)', '이후 H1, H5만 수신'], lab: '그룹 가입자', val: 'H1, H5',
          log: 'H3이 그룹에서 탈퇴하면 가입자 목록에서 빠지고, 이후 멀티캐스트 데이터는 H1과 H5에게만 갑니다. 멀티캐스트 라우터가 가입자가 없음을 확인하면 그 네트워크로는 그룹 트래픽을 보내지 않습니다.' },
        { copies: 0, st: none(), up: [], mem: [1, 0, 0, 0, 1], lines: ['가입 → 스위치가 가입자 포트를 기억', '전달은 가입자에게만, 탈퇴하면 중단'], lab: '핵심', val: '그룹 가입 상태가 전달 범위를 정함',
          log: '정리 — 멀티캐스트는 가입한 호스트에게만 전달됩니다. IGMP가 가입과 탈퇴를 알리고, IGMP 스누핑이 있는 스위치가 그 범위를 실제 포트에 반영합니다. IPv6에서는 같은 역할을 MLD가 합니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'addr') return ADDR_STEPS;
        if (mode === 'igmp') return IGMP_STEPS;
        return CAST_STEPS;
    }
    function defaultLog() {
        if (mode === 'addr') return '전송 방식별 목적지 주소와 멀티캐스트 MAC 주소 변환을 봅니다.';
        if (mode === 'igmp') return '멀티캐스트 그룹 가입과 스위치의 전달 범위를 봅니다.';
        return '유니캐스트, 브로드캐스트, 멀티캐스트가 누구에게 전달되는지 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'addr' ? (mob ? 318 : 312) : (mob ? 330 : 290);
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 전송 방식, 그룹 가입 ===================== */
    function drawNet(x0, top, w, mob, s, p, e, fs) {
        var gap = 6;
        var bw = (w - gap * 4) / 5;
        var hy = top + 112, hh = mob ? 48 : 38;
        var sw = 88, sx = x0 + w / 2 - sw / 2, sy = top + 6;
        var swy = top + 58, swh = mode === 'igmp' ? 42 : 26;
        var mem = s.mem;
        var cxS = x0 + w / 2;
        var hostCx = function (i) { return x0 + i * (bw + gap) + bw / 2; };
        var replay = s.copies !== p.copies || s.st.join() !== p.st.join() || s.up.join() !== p.up.join();
        var tag = '패킷';

        rr(sx, sy, sw, 30, 6, P.orange + '18', P.orange + 'ff', 1.3);
        tx('송신자', cxS, sy + 15, fs, P.orange + 'ff', 'center', true);
        rr(sx - 20, swy, sw + 40, swh, 6, P.purple + '18', P.purple + 'ff', 1.3);
        tx('스위치', cxS, swy + 13, fs, P.purple + 'ff', 'center', true);
        if (mode === 'igmp') {
            for (var di = 0; di < 5; di++) {
                var dx = cxS + (di - 2) * 22;
                var on = mem && mem[di] === 1;
                var pOn = p.mem && p.mem[di] === 1;
                var ch = on !== pOn ? seg(e, 0.35, 0.6) : 1;
                var a = on ? (pOn ? 1 : ch) : (pOn ? 1 - ch : 0);
                circ(dx, swy + 30, 5, 'none', P.sub + '88', 1.2);
                if (a > 0) {
                    ctx.globalAlpha = a;
                    circ(dx, swy + 30, 5, P.green + 'ff', 'none', 1);
                    ctx.globalAlpha = 1;
                }
            }
        }
        var swB = swy + swh;
        var recvList = [];
        s.st.forEach(function (v, i) { if (v) recvList.push(i); });

        for (var c = 0; c < s.copies; c++) {
            var ox = s.copies === 1 ? 0 : (c - (s.copies - 1) / 2) * 14;
            var u1 = replay ? ez(seg(e, c * 0.1, c * 0.1 + 0.3)) : 1;
            var ya = sy + 30, yb = swy;
            if (u1 >= 1) arrow(cxS + ox, ya, cxS + ox, yb, P.yellow + 'ff', 2.2);
            else if (u1 > 0) {
                var cy = lerp(ya, yb, u1);
                ln(cxS + ox, ya, cxS + ox, cy, P.yellow + 'ff', 2.2);
                rr(cxS + ox - 16, cy - 8, 32, 16, 4, P.yellow + 'ff', 'none', 1);
                tx(tag, cxS + ox, cy, fs - 2, '#111111', 'center', true);
            }
        }

        HOSTS.forEach(function (name, i) {
            var hx = x0 + i * (bw + gap);
            var st = s.st[i];
            var pst = p.st[i];
            var isMem = mem ? mem[i] === 1 : INTERESTED[i] === 1;
            var col = isMem ? P.green : P.sub;
            var order = recvList.indexOf(i);
            var startT = s.copies > 1 && order >= 0 ? 0.3 + order * 0.1 : 0.35;
            var u2 = st && replay ? ez(seg(e, startT, startT + 0.3)) : 1;
            var arrived = st ? (replay ? seg(e, startT + 0.25, startT + 0.45) : 1) : 0;
            var tcx = hostCx(i);
            var from = { x: cxS + (tcx - cxS) * 0.15, y: swB };
            var fcol = st === 2 ? P.red : P.green;
            if (st && u2 > 0) {
                if (u2 >= 1) arrow(from.x, from.y, tcx, hy, fcol + 'ff', 2);
                else {
                    var px = lerp(from.x, tcx, u2), py = lerp(from.y, hy, u2);
                    ln(from.x, from.y, px, py, P.yellow + 'ff', 2);
                    rr(px - 14, py - 8, 28, 16, 4, P.yellow + 'ff', 'none', 1);
                    tx(tag, px, py, fs - 2, '#111111', 'center', true);
                }
            }
            if (s.up.indexOf(i) >= 0) {
                var uu = replay ? ez(seg(e, 0.05, 0.45)) : 1;
                var ux = lerp(tcx, from.x, uu), uy = lerp(hy, swB, uu);
                ln(tcx, hy, ux, uy, P.yellow + 'ff', 2);
                if (uu < 1) {
                    var lab = mem && mem[i] === 1 ? 'JOIN' : 'LEAVE';
                    rr(ux - 20, uy - 8, 40, 16, 4, P.yellow + 'ff', 'none', 1);
                    tx(lab, ux, uy, fs - 2, '#111111', 'center', true);
                }
            }
            var fillA = st === 1 ? arrived : 0;
            var edge = st === 1 ? (arrived > 0.3 ? P.green + 'ff' : col + '88') : (st === 2 && arrived > 0.3 ? P.red + 'ff' : col + '88');
            rr(hx, hy, bw, hh, 5, 'none', edge, st && arrived > 0.3 ? 1.8 : 1.2);
            if (fillA > 0) { ctx.globalAlpha = fillA; rr(hx, hy, bw, hh, 5, P.green + '30', 'none', 1); ctx.globalAlpha = 1; }
            tx(name, hx + bw / 2, hy + 12, fs, (isMem ? P.green : P.text) + 'ff', 'center', true);
            var stateTxt = st === 1 ? '수신' : (st === 2 ? '폐기' : (isMem ? (mem ? '가입' : '원함') : (mem ? '미가입' : '관심 없음')));
            var showState = st ? arrived : 1;
            ctx.globalAlpha = showState;
            lines(stateTxt, bw - 4, fs - 1.5).forEach(function (l, li) {
                tx(l, hx + bw / 2, hy + 27 + li * 12, fs - 1.5, (st === 2 ? P.red : (isMem || st === 1 ? P.green : P.sub)) + 'ff', 'center', false);
            });
            ctx.globalAlpha = 1;
            if (st === 2 && arrived > 0.5) {
                ln(hx + bw - 16, hy + 4, hx + bw - 6, hy + 14, P.red + 'ff', 2.4);
                ln(hx + bw - 6, hy + 4, hx + bw - 16, hy + 14, P.red + 'ff', 2.4);
            }
            if (pst && !st && e < 1) {
                ctx.globalAlpha = 1 - e;
                rr(hx, hy, bw, hh, 5, 'none', P.red + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        });

        var py0 = hy + hh + 14;
        var lh = mob ? 15 : 17;
        var wrapped = [];
        s.lines.forEach(function (l, i) { lines(l, w - 20, fs - 1).forEach(function (m) { wrapped.push([m, i]); }); });
        var ph = lh * Math.max(3, wrapped.length) + 14;
        var same = s.lines.join('|') === p.lines.join('|');
        var ca = same ? 1 : ez(seg(e, 0.2, 0.6));
        rr(x0, py0, w, ph, 6, 'none', P.sub + '66', 1.2);
        tx('전달 상황', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.lines.length) {
            ctx.globalAlpha = ca;
            var yy = py0 + 12 + lh;
            wrapped.forEach(function (m) {
                tx(m[0], x0 + 10, yy, fs - 1, (m[1] === 0 ? P.text : P.yellow) + 'ff', 'left', false);
                yy += lh;
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 전송이 없습니다)', x0 + 10, py0 + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }
        var ty = py0 + ph + 10;
        var th = 24 + lh;
        rr(x0, ty, w, th, 6, 'none', P.sub + '66', 1.2);
        tx(s.lab || '확인할 값', x0 + 10, ty + 12, fs - 1, P.sub + 'ff', 'left', true);
        var va = s.val === p.val ? 1 : ez(seg(e, 0.4, 0.8));
        ctx.globalAlpha = s.val ? va : 1;
        tx(s.val || '(없음)', x0 + 10, ty + 12 + lh, fs - 1, (s.val ? P.green : P.sub) + 'ff', 'left', false);
        ctx.globalAlpha = 1;
    }

    /* ===================== 주소 ===================== */
    function drawAddr(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var rowH = 52;
        ADDR_ROWS.forEach(function (r, i) {
            var shown = k >= i + 1 || (i === 3 && k >= 5);
            if (!shown) return;
            var cur = k === i + 1;
            var fresh = cur && pk < k;
            var y = top + 8 + i * rowH;
            var c = P[r.col];
            var q = fresh ? ez(seg(e, 0, 0.5)) : 1;
            ctx.globalAlpha = fresh ? clamp01(e * 4) : 1;
            tx(r.name, x0, y + 8, fs - 0.5, c + 'ff', 'left', true);
            ctx.globalAlpha = 1;
            if (i < 3) {
                rr(x0, y + 18, w, 24, 5, 'none', c + '55', 1.2);
                rr(x0, y + 18, w * q, 24, 5, c + (cur ? '30' : '18'), c + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
                if (q > 0.6) tx(r.val, x0 + w / 2, y + 30, fs - 0.5, P.text + 'ff', 'center', true);
                return;
            }
            var ipParts = GROUP.split('.');
            var macParts = macOf(GROUP).split(':');
            var cw = (w - 5 * 4) / 6;
            var ipW = Math.min(64, (w - 3 * 4) / 4);
            var fly = k === 4 && pk < 4 ? ez(seg(e, 0.25, 0.8)) : 1;
            var showMac = k >= 4 ? (k === 4 && pk < 4 ? seg(e, 0, 0.3) : 1) : 0;
            var ipY = y + 18, macY = y + 56;
            tx('IP', x0 + w - 2, ipY - 8, fs - 1.5, P.sub + 'ff', 'right', true);
            for (var b = 0; b < 4; b++) {
                var bx = x0 + b * (ipW + 4);
                rr(bx, ipY, ipW, 22, 4, c + '20', c + 'cc', 1.2);
                tx(ipParts[b], bx + ipW / 2, ipY + 11, fs - 0.5, P.text + 'ff', 'center', true);
            }
            if (k >= 4) {
                tx('MAC', x0 + w - 2, macY - 8, fs - 1.5, P.sub + 'ff', 'right', true);
                macParts.forEach(function (m, mi) {
                    var mx = x0 + mi * (cw + 5);
                    rr(mx, macY, cw, 22, 4, 'none', P.sub + '55', 1.2);
                    if (mi < 3) {
                        ctx.globalAlpha = showMac;
                        rr(mx, macY, cw, 22, 4, c + '30', c + 'ff', 1.4);
                        tx(m, mx + cw / 2, macY + 11, fs - 0.5, P.text + 'ff', 'center', true);
                        ctx.globalAlpha = 1;
                    } else {
                        var srcX = x0 + (mi - 2) * (ipW + 4) + ipW / 2 - cw / 2;
                        var cx2 = lerp(srcX, mx, fly), cy2 = lerp(ipY, macY, fly);
                        rr(cx2, cy2, cw, 22, 4, c + '40', c + 'ff', 1.4);
                        tx(m, cx2 + cw / 2, cy2 + 11, fs - 0.5, P.text + 'ff', 'center', true);
                    }
                });
                ctx.globalAlpha = showMac;
                tx('01:00:5e + 하위 23비트', x0, macY + 34, fs - 1.5, c + 'ff', 'left', true);
                ctx.globalAlpha = 1;
            }
        });
        var baseY = top + 8 + 3 * rowH + (k >= 4 ? 100 : 28);
        if (k >= 5) {
            var fresh5 = pk < 5;
            var q5 = fresh5 ? ez(seg(e, 0.1, 0.7)) : 1;
            var cw5 = (w - 27) / 28;
            for (var bi = 0; bi < 28; bi++) {
                var lost = bi < 5;
                var col5 = lost ? P.red : P.green;
                var a5 = clamp01(q5 * 28 - bi);
                rr(x0 + bi * (cw5 + 1), baseY, cw5, 12, 2, 'none', P.sub + '44', 1);
                if (a5 > 0) {
                    ctx.globalAlpha = a5;
                    rr(x0 + bi * (cw5 + 1), baseY, cw5, 12, 2, col5 + '55', col5 + 'ff', 1);
                    ctx.globalAlpha = 1;
                }
            }
            lines('그룹 주소 28비트 중 23비트만 MAC으로 · 5비트는 버려져 32개 그룹이 같은 MAC 사용', w, fs - 1).forEach(function (l, li) {
                ctx.globalAlpha = q5;
                tx(l, x0, baseY + 24 + li * 14, fs - 1, P.yellow + 'ff', 'left', true);
                ctx.globalAlpha = 1;
            });
        } else if (k >= 1 && k <= 4) {
            var row = ADDR_ROWS[k - 1];
            var na = k === pk ? 1 : ez(seg(e, 0.3, 0.8));
            ctx.globalAlpha = na;
            lines(row.note, w, fs - 1).forEach(function (l, li) {
                tx(l, x0, baseY + li * 14, fs - 1, P.yellow + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'addr') drawAddr(x0, top, w, mob, s, p, e, L.fs);
        else drawNet(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('mc-viz__speed-btn--active'); });
        btn.classList.add('mc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('mc-viz__mode-btn--active', d.key === m); });
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