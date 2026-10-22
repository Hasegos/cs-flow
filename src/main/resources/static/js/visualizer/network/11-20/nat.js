/**
 * NAT 시각화
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
    var root    = el('div', 'nat-viz');
    var toolbar = el('div', 'nat-viz__toolbar');
    var tbLeft  = el('div', 'nat-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'nat-viz__title', 'NAT'));

    var modeWrap = el('div', 'nat-viz__mode');
    var modeDefs = [
        { key: 'pat', label: 'PAT 변환' },
        { key: 'reply', label: '응답과 차단' },
        { key: 'forward', label: '포트 포워딩' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'nat-viz__mode-btn' + (i === 0 ? ' nat-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'nat-viz__speed');
    speedWrap.appendChild(el('span', 'nat-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'nat-viz__speed-btn' + (i === 0 ? ' nat-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'nat-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'nat-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'nat-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'nat-viz__controls');
    var btnPlay  = el('button', 'nat-viz__btn nat-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'nat-viz__btn', '▶| STEP');
    var btnReset = el('button', 'nat-viz__btn', '↺ RESET');
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
    var mode    = 'pat';
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

    /* ===================== 데이터: 주소와 변환 표 ===================== */
    var PUB_IP = '203.0.113.5';
    var A_IP = '192.168.0.10';
    var B_IP = '192.168.0.20';
    var SRV_IP = '198.51.100.7';
    var SRC_PORT = 51000;
    var PORT_A = 40001;
    var PORT_B = 40002;
    var FWD_PORT = 8080;
    var WEB_PORT = 80;
    function ep(ip, port) { return ip + ':' + port; }

    function st(log, o) {
        var s = { log: log, hl: {}, arrows: [], inn: '', out: '', table: [], drop: false };
        for (var k in o) s[k] = o[k];
        return s;
    }
    var T_A = [A_IP + ':' + SRC_PORT, PORT_A, ''];
    var T_B = [B_IP + ':' + SRC_PORT, PORT_B, ''];
    var PAT_STEPS = [
        st('같은 가정 · 사무실의 내부 호스트 A와 B는 사설 IP(' + A_IP + ', ' + B_IP + ')를 씁니다. 사설 주소는 인터넷에서 라우팅되지 않아 그대로는 외부 서버와 통신할 수 없습니다. 공유기(NAT)는 공인 IP ' + PUB_IP + ' 하나를 가지고 있습니다. 예시 주소는 문서용 주소 대역입니다.', {}),
        st('A가 외부 서버 ' + SRV_IP + ':443에 접속합니다. 패킷의 출발지는 사설 주소 ' + ep(A_IP, SRC_PORT) + '이고 NAT 장치로 갑니다.',
            { hl: { A: ['전송', 'orange'] }, arrows: [['A', 'N']], inn: '내부측 ' + ep(A_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443) }),
        st('NAT가 출발지를 공인 주소 ' + ep(PUB_IP, PORT_A) + '로 바꿔 내보내고, 변환 표에 "' + ep(A_IP, SRC_PORT) + ' ↔ 외부 포트 ' + PORT_A + '"를 기록합니다. 서버에는 공유기의 공인 IP에서 온 것으로 보입니다(이 예시는 포트 변환을 보이려고 항상 새 포트를 줍니다. 실제 장비는 충돌할 때만 바꾸기도 합니다).',
            { hl: { A: ['전송', 'orange'], N: ['출발지 변환', 'green'] }, arrows: [['A', 'N'], ['N', 'S']], inn: '내부측 ' + ep(A_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), out: '외부측 ' + ep(PUB_IP, PORT_A) + ' → ' + ep(SRV_IP, 443), table: [T_A] }),
        st('B도 같은 서버에 접속합니다. B의 출발지 포트가 우연히 A와 같은 ' + SRC_PORT + '입니다. 내부 주소가 다르므로 내부에서는 구분되지만, 그대로 내보내면 같은 공인 IP에서 나가는 두 연결이 겹칩니다.',
            { hl: { B: ['전송', 'purple'] }, arrows: [['B', 'N']], inn: '내부측 ' + ep(B_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), table: [T_A] }),
        st('PAT(포트 주소 변환)는 IP 주소와 함께 출발지 포트도 바꿔 이를 해결합니다. B의 연결에는 다른 외부 포트 ' + PORT_B + '를 할당해 ' + ep(PUB_IP, PORT_B) + '로 내보내고 표에 기록합니다. 하나의 공인 IP로 여러 내부 호스트가 동시에 통신합니다.',
            { hl: { B: ['전송', 'purple'], N: ['주소·포트 변환', 'green'] }, arrows: [['B', 'N'], ['N', 'S']], inn: '내부측 ' + ep(B_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), out: '외부측 ' + ep(PUB_IP, PORT_B) + ' → ' + ep(SRV_IP, 443), table: [T_A, T_B] }),
        st('정리 — 변환 표가 "내부 주소:포트 ↔ 공인 포트" 대응을 기억하므로 응답이 돌아올 때 어느 내부 호스트로 보낼지 알 수 있습니다. 응답 처리는 "응답과 차단" 탭에서 봅니다.',
            { hl: { N: ['변환 표 유지', 'green'] }, table: [T_A, T_B] })
    ];

    var REPLY_STEPS = [
        st('A와 B의 연결이 이미 변환 표에 기록되어 있는 상태입니다. 서버의 응답이 공인 주소로 돌아올 때 NAT가 어떻게 처리하는지 봅니다.', { table: [T_A, T_B] }),
        st('서버가 ' + ep(PUB_IP, PORT_A) + '로 응답합니다. NAT가 변환 표에서 외부 포트 ' + PORT_A + '를 찾아 목적지를 ' + ep(A_IP, SRC_PORT) + '로 되돌려 A에게 전달합니다.',
            { hl: { S: ['응답', 'teal'], N: ['표에서 찾음', 'green'], A: ['수신', 'orange'] }, arrows: [['S', 'N'], ['N', 'A']], out: '외부측 ' + ep(SRV_IP, 443) + ' → ' + ep(PUB_IP, PORT_A), inn: '내부측 ' + ep(SRV_IP, 443) + ' → ' + ep(A_IP, SRC_PORT), table: [T_A, T_B] }),
        st('이번에는 외부에서 먼저 ' + ep(PUB_IP, 40009) + '로 패킷이 들어옵니다. 변환 표에 이 포트의 항목이 없어 일반적인 NAT는 어느 내부 호스트로 보낼지 알 수 없어 이 패킷을 버립니다. NAT는 내부에서 시작한 연결에만 변환 정보를 만듭니다.',
            { hl: { S: ['먼저 접속 시도', 'teal'], N: ['항목 없어 폐기', 'red'] }, arrows: [['S', 'N']], out: '외부측 ' + ep(SRV_IP, 5555) + ' → ' + ep(PUB_IP, 40009), table: [T_A, T_B], drop: true }),
        st('연결이 오래 쓰이지 않으면 NAT는 변환 표의 항목을 지웁니다(유지 시간은 장비와 프로토콜마다 다릅니다). 항목이 지워진 뒤 들어오는 응답은 위와 같은 이유로 버려집니다.',
            { hl: { N: ['항목 만료', 'yellow'] }, table: [T_B] }),
        st('정리 — NAT 뒤의 호스트는 외부에서 직접 접속할 수 없는 부수 효과가 생기지만, 이것은 NAT의 목적이 아니므로 보안은 방화벽으로 따로 정해야 합니다. 외부에서 내부 서버로 접속하게 하려면 "포트 포워딩" 탭의 방법을 씁니다.',
            { hl: { N: ['방화벽은 별개', 'green'] }, table: [T_B] })
    ];

    var T_F = ['외부 ' + PUB_IP + ':' + FWD_PORT + ' → ' + B_IP + ':' + WEB_PORT, FWD_PORT, 'static'];
    var FWD_STEPS = [
        st('B는 웹 서버(포트 ' + WEB_PORT + ')를 운영합니다. 외부에서 먼저 시작하는 접속은 NAT가 어디로 보낼지 모르므로, 공인 IP의 특정 포트를 내부 서버에 연결해 두는 포트 포워딩 규칙이 필요합니다.', {}),
        st('관리자가 규칙을 등록합니다. "공인 ' + PUB_IP + ' 포트 ' + FWD_PORT + '로 오는 패킷은 ' + ep(B_IP, WEB_PORT) + '로 보낸다." 이 규칙은 미리 정해 둔 고정(static) 항목이라 연결이 오지 않아도 유지됩니다.',
            { hl: { N: ['규칙 등록', 'green'] }, table: [T_F] }),
        st('외부 클라이언트 ' + SRV_IP + '가 ' + ep(PUB_IP, FWD_PORT) + '로 접속을 시작합니다.',
            { hl: { S: ['접속 시작', 'teal'] }, arrows: [['S', 'N']], out: '외부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(PUB_IP, FWD_PORT), table: [T_F] }),
        st('NAT가 규칙에 따라 목적지를 ' + ep(B_IP, WEB_PORT) + '로 바꿔 B에게 전달합니다(목적지 변환). B의 웹 서버가 요청을 받습니다.',
            { hl: { S: ['접속 시작', 'teal'], N: ['목적지 변환', 'green'], B: ['수신', 'purple'] }, arrows: [['S', 'N'], ['N', 'B']], out: '외부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(PUB_IP, FWD_PORT), inn: '내부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(B_IP, WEB_PORT), table: [T_F] }),
        st('B의 응답은 출발지가 ' + ep(B_IP, WEB_PORT) + '입니다. NAT가 출발지를 ' + ep(PUB_IP, FWD_PORT) + '로 되돌려 클라이언트에게 보냅니다. 클라이언트는 공유기의 공인 주소와 통신한 것으로 보입니다.',
            { hl: { B: ['응답', 'purple'], N: ['출발지 복원', 'green'], S: ['수신', 'teal'] }, arrows: [['B', 'N'], ['N', 'S']], inn: '내부측 ' + ep(B_IP, WEB_PORT) + ' → ' + ep(SRV_IP, 50000), out: '외부측 ' + ep(PUB_IP, FWD_PORT) + ' → ' + ep(SRV_IP, 50000), table: [T_F] })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'reply') return REPLY_STEPS;
        if (mode === 'forward') return FWD_STEPS;
        return PAT_STEPS;
    }
    function defaultLog() {
        if (mode === 'reply') return '응답이 돌아올 때 변환 표로 목적지를 되돌리고, 표에 없는 패킷은 버리는 과정을 봅니다.';
        if (mode === 'forward') return '외부에서 먼저 들어오는 접속을 포트 포워딩 규칙으로 내부 서버에 연결하는 과정을 봅니다.';
        return '여러 내부 호스트가 하나의 공인 IP를 포트 번호로 나눠 쓰는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var lh = mob ? 15 : 17;
        var topH = 128;
        var py = topH + 14;
        var ph = lh * (mob ? 4 : 2) + 22;
        var ty = py + ph + 12;
        return { fs: mob ? 10.5 : 12, lh: lh, topH: topH, py: py, ph: ph, ty: ty, total: ty + 24 + 2 * lh + 6 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function epShort(str, mob) {
        var src = str.replace(/^(내부측|외부측) /, '').split(' → ')[0];
        var parts = src.split(':');
        var oct = parts[0].split('.').pop();
        return mob ? ':' + parts[1] : '.' + oct + ':' + parts[1];
    }
    function dstPort(str) {
        var dst = str.replace(/^(내부측|외부측) /, '').split(' → ')[1] || '';
        return dst.split(':')[1];
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fs = L.fs, lh = L.lh;
        var bw = mob ? 86 : 130;
        var bh = 52;
        var topH = L.topH;
        var xs = { L: x0, M: x0 + (w - bw) / 2, R: x0 + w - bw };
        var yA = top, yB = top + bh + 24;
        var cy = top + topH / 2;
        var nodes = {
            A: { x: xs.L, y: yA, name: 'A', ip: A_IP, col: 'orange' },
            B: { x: xs.L, y: yB, name: mode === 'forward' ? (mob ? 'B 웹서버' : 'B (웹 서버)') : 'B', ip: B_IP, col: 'purple' },
            N: { x: xs.M, y: cy - bh / 2 - 14, name: mob ? '공유기' : 'NAT 공유기', ip: PUB_IP, col: 'green', h: bh + 28 },
            S: { x: xs.R, y: cy - bh / 2, name: mode === 'forward' ? (mob ? '외부 PC' : '외부 클라이언트') : '외부 서버', ip: SRV_IP, col: 'teal' }
        };
        var legGeom = function (a) {
            var from = a[0], to = a[1], p1, p2;
            if (from === 'A' || from === 'B') {
                p1 = { x: nodes[from].x + bw, y: nodes[from].y + bh / 2 };
                p2 = { x: nodes.N.x, y: nodes.N.y + (from === 'A' ? 16 : nodes.N.h - 16) };
            } else if (to === 'A' || to === 'B') {
                p1 = { x: nodes.N.x, y: nodes.N.y + (to === 'A' ? 16 : nodes.N.h - 16) };
                p2 = { x: nodes[to].x + bw, y: nodes[to].y + bh / 2 };
            } else if (from === 'S') {
                p1 = { x: nodes.S.x, y: nodes.S.y + bh / 2 - 8 };
                p2 = { x: nodes.N.x + bw, y: nodes.N.y + nodes.N.h / 2 - 8 };
            } else {
                p1 = { x: nodes.N.x + bw, y: nodes.N.y + nodes.N.h / 2 + 8 };
                p2 = { x: nodes.S.x, y: nodes.S.y + bh / 2 + 8 };
            }
            return [p1, p2];
        };

        var n = s.arrows.length;
        var sameArrows = JSON.stringify(s.arrows) === JSON.stringify(p.arrows);
        s.arrows.forEach(function (a, i) {
            var g = legGeom(a);
            var prog = sameArrows ? 1 : ez(seg(e, i / n * 0.7, (i + 1) / n * 0.7 + 0.05));
            var col = (s.drop ? P.red : P.yellow) + 'ff';
            if (prog >= 1) {
                arrow(g[0].x, g[0].y, g[1].x, g[1].y, col, 2.6);
                return;
            }
            if (prog <= 0) return;
            var px = lerp(g[0].x, g[1].x, prog), py = lerp(g[0].y, g[1].y, prog);
            ln(g[0].x, g[0].y, px, py, col, 2.6);
            var fromEdge = a[0] === 'A' || a[0] === 'B' || a[1] === 'A' || a[1] === 'B';
            var addr = fromEdge ? s.inn : s.out;
            var lab = addr ? epShort(addr, mob) : '';
            if (lab) {
                var cw = lab.length * 7 + 12;
                rr(px - cw / 2, py - 17, cw, 18, 5, col, col, 1.2);
                tx(lab, px, py - 8, fs - 1.5, '#111111', 'center', true);
            }
        });

        var arrived = seg(e, 0.55, 0.9);
        ['A', 'B', 'N', 'S'].forEach(function (id) {
            var nd = nodes[id];
            var h = nd.h || bh;
            var c = colorOf(nd.col);
            var badge = s.hl[id];
            var pb = p.hl[id];
            var ba = badge ? (pb && pb[0] === badge[0] ? 1 : arrived) : 0;
            var bc = badge ? colorOf(badge[1]) : c;
            rr(nd.x, nd.y, bw, h, 6, c + '18', (badge && ba > 0.3 ? bc : c) + (badge ? 'ff' : '88'), badge && ba > 0.3 ? 1.9 : 1.2);
            tx(nd.name, nd.x + bw / 2, nd.y + 13, fs - (mob ? 0.5 : 0), c + 'ff', 'center', true);
            tx(nd.ip, nd.x + bw / 2, nd.y + 28, fs - 1.5, P.sub + 'ff', 'center', false);
            if (badge && ba > 0) {
                ctx.globalAlpha = ba;
                var bl = lines(badge[0], bw - 6, fs - 1.5);
                bl.forEach(function (l, li) {
                    tx(l, nd.x + bw / 2, nd.y + h - 9 - (bl.length - 1 - li) * 13, fs - 1.5, bc + 'ff', 'center', true);
                });
                ctx.globalAlpha = 1;
            }
        });
        if (s.drop && e > 0.6) {
            var gx = legGeom(['S', 'N'])[1];
            var xa = clamp01((e - 0.6) / 0.2);
            ctx.globalAlpha = xa;
            ln(gx.x + 2, gx.y - 8, gx.x + 18, gx.y + 8, P.red + 'ff', 3.4);
            ln(gx.x + 2, gx.y + 8, gx.x + 18, gx.y - 8, P.red + 'ff', 3.4);
            ctx.globalAlpha = 1;
        }

        var py0 = top + L.py;
        rr(x0, py0, w, L.ph, 6, 'none', P.sub + '66', 1.2);
        tx('패킷 헤더 (출발지 → 목적지)', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        var rowsH = [['inn', s.inn, '내부측 —', P.text], ['out', s.out, '외부측 —', P.yellow]];
        var cyH = py0 + 12 + lh;
        rowsH.forEach(function (r) {
            var ls = lines(r[1] || r[2], w - 20, fs - 0.5);
            var changed = r[1] && r[1] !== p[r[0]];
            if (changed) {
                var fa = 1 - seg(e, 0.5, 1);
                if (fa > 0) {
                    ctx.globalAlpha = fa;
                    rr(x0 + 4, cyH - lh / 2 + 1, w - 8, lh * ls.length, 3, P.yellow + '33', P.yellow + 'ff', 1.2);
                    ctx.globalAlpha = 1;
                }
            }
            ctx.globalAlpha = changed ? seg(e, 0.45, 0.8) : 1;
            ls.forEach(function (l, li) {
                tx(l, x0 + 10, cyH + li * lh, fs - 0.5, (r[1] ? r[3] : P.sub) + 'ff', 'left', !!r[1]);
            });
            ctx.globalAlpha = 1;
            cyH += lh * ls.length;
        });

        var ty0 = top + L.ty;
        rr(x0, ty0, w, 24 + 2 * lh, 6, 'none', P.sub + '66', 1.2);
        tx('NAT 변환 표', x0 + 10, ty0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        var lines2 = s.arrows.length > 0 && s.arrows.some(function (a) { return a[0] === 'S' && a[1] === 'N'; });
        var lookPort = lines2 ? dstPort(s.out) : null;
        var matchIdx = -1;
        s.table.forEach(function (r, i) { if (lookPort && String(r[1]) === lookPort) matchIdx = i; });
        var inTable = function (tb, key) { return tb.some(function (r) { return r[0] === key; }); };
        if (!s.table.length && !p.table.length) tx('(비어 있음)', x0 + 10, ty0 + 12 + lh, fs - 0.5, P.sub + 'ff', 'left', false);
        var rowAt = s.arrows.length ? 0.6 : 0.1;
        s.table.forEach(function (r, i) {
            var yy = ty0 + 12 + lh * (i + 1);
            var isNew = !inTable(p.table, r[0]);
            var a = isNew ? seg(e, rowAt, rowAt + 0.3) : 1;
            var line = r[2] === 'static' ? r[0] : r[0] + ' ↔ 외부 포트 ' + r[1];
            if (isNew && e < 1) {
                var hi = 1 - seg(e, rowAt + 0.1, 1);
                if (hi > 0) {
                    ctx.globalAlpha = hi;
                    rr(x0 + 4, yy - lh / 2 + 1, w - 8, lh, 3, P.yellow + '33', P.yellow + 'ff', 1.2);
                    ctx.globalAlpha = 1;
                }
            }
            if (lookPort && e > 0.3 && e < 1) {
                var scan = seg(e, 0.3, 0.7);
                var onRow = i === matchIdx;
                if (onRow && scan >= 1) {
                    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e * 24);
                    rr(x0 + 4, yy - lh / 2 + 1, w - 8, lh, 3, P.green + '33', P.green + 'ff', 1.8);
                    ctx.globalAlpha = 1;
                }
            }
            ctx.globalAlpha = a;
            tx(line, x0 + 10 + (isNew ? (1 - a) * 18 : 0), yy, fs - 0.5, (r[2] === 'static' ? P.yellow : P.green) + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        });
        p.table.forEach(function (r, i) {
            if (inTable(s.table, r[0])) return;
            var yy = ty0 + 12 + lh * (i + 1);
            var line = r[2] === 'static' ? r[0] : r[0] + ' ↔ 외부 포트 ' + r[1];
            ctx.globalAlpha = 1 - seg(e, 0, 0.5);
            tx(line, x0 + 10, yy, fs - 0.5, P.red + 'ff', 'left', false);
            ln(x0 + 10, yy, x0 + 10 + Math.min(w - 20, line.length * 6.6) * seg(e, 0, 0.3), yy, P.red + 'ff', 1.4);
            ctx.globalAlpha = 1;
        });
        if (lookPort) {
            var ra = seg(e, 0.65, 0.9);
            ctx.globalAlpha = ra;
            tx(matchIdx >= 0 ? '포트 ' + lookPort + ' 일치' : '포트 ' + lookPort + ' 항목 없음', x0 + w - 10, ty0 + 12, fs - 1, matchIdx >= 0 ? P.green + 'ff' : P.red + 'ff', 'right', true);
            ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('nat-viz__speed-btn--active'); });
        btn.classList.add('nat-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('nat-viz__mode-btn--active', d.key === m); });
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