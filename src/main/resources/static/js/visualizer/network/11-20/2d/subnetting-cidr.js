/**
 * 서브넷팅 / CIDR 시각화
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
    var root    = el('div', 'sn-viz');
    var toolbar = el('div', 'sn-viz__toolbar');
    var tbLeft  = el('div', 'sn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sn-viz__title', 'SUBNET'));

    var modeWrap = el('div', 'sn-viz__mode');
    var modeDefs = [
        { key: 'bits', label: '비트로 계산' },
        { key: 'split', label: '서브넷 나누기' },
        { key: 'cidr', label: 'CIDR 요약' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sn-viz__mode-btn' + (i === 0 ? ' sn-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sn-viz__speed');
    speedWrap.appendChild(el('span', 'sn-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sn-viz__speed-btn' + (i === 0 ? ' sn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sn-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sn-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sn-viz__controls');
    var btnPlay  = el('button', 'sn-viz__btn sn-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sn-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sn-viz__btn', '↺ RESET');
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
    var mode    = 'bits';
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

    /* ===================== 데이터: 주소 계산 ===================== */
    function ipOf(a, b, c, d) { return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0; }
    function ipStr(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
    function maskOf(p) { return p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; }
    function bin32(n) {
        var s = '';
        for (var i = 31; i >= 0; i--) s += ((n >>> i) & 1);
        return s;
    }
    function hostsOf(p) { return Math.pow(2, 32 - p) - 2; }

    var PFX = 26;
    var ADDR = ipOf(192, 168, 1, 130);
    var MASK = maskOf(PFX);
    var NET = (ADDR & MASK) >>> 0;
    var BCAST = (NET | (~MASK >>> 0)) >>> 0;
    var FIRST = NET + 1;
    var LAST = BCAST - 1;
    var BITS_ROWS = [
        { label: 'IP 주소', n: ADDR, tag: ipStr(ADDR) },
        { label: '서브넷 마스크 /' + PFX, n: MASK, tag: ipStr(MASK) },
        { label: '네트워크 주소 (IP AND 마스크)', n: NET, tag: ipStr(NET) },
        { label: '브로드캐스트 (호스트 비트 모두 1)', n: BCAST, tag: ipStr(BCAST) }
    ];
    var BITS_STEPS = [
        { k: 0, log: '서브넷 마스크를 이용해 IP 주소 ' + ipStr(ADDR) + '/' + PFX + '이 속한 네트워크를 계산해 봅니다. IP 주소는 32비트이고 점으로 8비트씩 끊어 적습니다.' },
        { k: 1, log: 'IP 주소 ' + ipStr(ADDR) + '을 이진수로 쓰면 ' + bin32(ADDR).match(/.{8}/g).join('.') + '입니다.' },
        { k: 2, log: '/' + PFX + '은 마스크의 앞 ' + PFX + '비트가 1이라는 뜻입니다. 이 앞쪽 ' + PFX + '비트가 네트워크 부분, 나머지 ' + (32 - PFX) + '비트가 호스트 부분입니다. 마스크는 ' + ipStr(MASK) + '입니다.' },
        { k: 3, log: 'IP 주소와 마스크를 비트마다 AND하면 호스트 부분이 0이 되어 네트워크 주소 ' + ipStr(NET) + '이 나옵니다. 같은 네트워크의 호스트는 모두 이 값이 같습니다.' },
        { k: 4, log: '호스트 비트를 모두 1로 채우면 브로드캐스트 주소 ' + ipStr(BCAST) + '입니다. 이 네트워크 전체에 보내는 주소입니다.' },
        { k: 5, log: '네트워크 주소와 브로드캐스트 주소는 호스트에 줄 수 없으므로, 쓸 수 있는 호스트 주소는 ' + ipStr(FIRST) + ' ~ ' + ipStr(LAST) + ', 2^' + (32 - PFX) + ' − 2 = ' + hostsOf(PFX) + '개입니다.' }
    ];

    var BASE = ipOf(192, 168, 1, 0);
    var BASE_PFX = 24;
    var SUB_PFX = 26;
    var SUB_N = Math.pow(2, SUB_PFX - BASE_PFX);
    var SUB_SIZE = Math.pow(2, 32 - SUB_PFX);
    var SUBS = [];
    for (var si = 0; si < SUB_N; si++) {
        var sn = BASE + si * SUB_SIZE;
        SUBS.push({ net: sn, first: sn + 1, last: sn + SUB_SIZE - 2, bc: sn + SUB_SIZE - 1 });
    }
    var SPLIT_STEPS = [
        { k: 0, hi: -1, log: ipStr(BASE) + '/' + BASE_PFX + ' 네트워크 하나를 부서(서브넷)별로 나눠 봅니다. 호스트 비트 8개라 주소는 256개이고, 호스트에 줄 수 있는 주소는 ' + hostsOf(BASE_PFX) + '개입니다.' },
        { k: 1, hi: -1, log: '호스트 비트 중 ' + (SUB_PFX - BASE_PFX) + '비트를 네트워크 부분으로 빌려 오면 /' + SUB_PFX + '이 되고, 2^' + (SUB_PFX - BASE_PFX) + ' = ' + SUB_N + '개의 서브넷으로 나뉩니다. 서브넷마다 주소는 2^' + (32 - SUB_PFX) + ' = ' + SUB_SIZE + '개입니다.' }
    ];
    SUBS.forEach(function (s, i) {
        SPLIT_STEPS.push({ k: 2, hi: i, log: '서브넷 ' + (i + 1) + ' — ' + ipStr(s.net) + '/' + SUB_PFX + '. 호스트 주소는 ' + ipStr(s.first) + ' ~ ' + ipStr(s.last) + '(' + hostsOf(SUB_PFX) + '개)이고 브로드캐스트는 ' + ipStr(s.bc) + '입니다.' });
    });
    SPLIT_STEPS.push({ k: 2, hi: -1, log: '정리 — 서브넷 ' + SUB_N + '개의 호스트 주소를 모두 합치면 ' + (SUB_N * hostsOf(SUB_PFX)) + '개로, 나누기 전의 ' + hostsOf(BASE_PFX) + '개보다 ' + (hostsOf(BASE_PFX) - SUB_N * hostsOf(SUB_PFX)) + '개 적습니다. 서브넷마다 네트워크 주소와 브로드캐스트 주소를 하나씩 쓰기 때문입니다.' });

    function commonPrefix(a, b) {
        var x = bin32(a);
        var y = bin32(b);
        var n = 0;
        while (n < 32 && x.charAt(n) === y.charAt(n)) n++;
        return n;
    }
    var CA = ipOf(192, 168, 0, 0);
    var CB = ipOf(192, 168, 1, 0);
    var CC = ipOf(192, 168, 2, 0);
    var CP1 = commonPrefix(CA, CB);
    var CP2 = commonPrefix(CB, CC);
    var SUM1 = (CA & maskOf(CP1)) >>> 0;
    var SUM2 = (CB & maskOf(CP2)) >>> 0;
    function third(n) { return bin32(n).substr(16, 8); }
    var CIDR_STEPS = [
        { k: 0, log: 'CIDR 요약(슈퍼네팅)은 이어진 여러 네트워크를 접두사 하나로 합쳐 라우팅 표의 항목을 줄이는 방법입니다. 두 경우를 비교해 봅니다.' },
        { k: 1, log: '먼저 ' + ipStr(CA) + '/24와 ' + ipStr(CB) + '/24 두 네트워크를 하나로 합칠 수 있는지 봅니다. 앞의 두 옥텟(192.168)은 같으니 세 번째 옥텟을 비교합니다.' },
        { k: 2, log: '세 번째 옥텟을 이진수로 쓰면 ' + third(CA) + '과 ' + third(CB) + '입니다.' },
        { k: 3, log: '앞쪽에서 같은 비트가 ' + CP1 + '비트(옥텟 앞 ' + (CP1 - 16) + '비트까지)입니다. 이 공통 접두사가 ' + ipStr(SUM1) + '/' + CP1 + '이고, 주소 ' + Math.pow(2, 32 - CP1) + '개가 정확히 두 /24 네트워크(' + 2 * 256 + '개)입니다. 항목 2개가 1개로 줄었습니다.' },
        { k: 4, log: '반면 ' + ipStr(CB) + '/24와 ' + ipStr(CC) + '/24는 세 번째 옥텟이 ' + third(CB) + '과 ' + third(CC) + '이라 공통 접두사가 ' + CP2 + '비트뿐입니다. 이를 ' + ipStr(SUM2) + '/' + CP2 + '로 합치면 ' + ipStr(SUM2) + ' ~ ' + ipStr(SUM2 + Math.pow(2, 32 - CP2) - 1) + ' 전체(' + Math.pow(2, 32 - CP2) + '개)가 되어, 원래 없던 네트워크까지 포함하므로 정확히 합칠 수 없습니다.' },
        { k: 5, log: '정리 — 합치려는 네트워크들이 연속이고, 합친 크기에 맞게 정렬되어 있어야 하나의 접두사로 요약됩니다. CIDR은 이처럼 접두사 길이를 자유롭게 정해 주소를 효율적으로 쓰고 라우팅 표를 줄입니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'split') return SPLIT_STEPS;
        if (mode === 'cidr') return CIDR_STEPS;
        return BITS_STEPS;
    }
    function defaultLog() {
        if (mode === 'split') return '네트워크 하나를 서브넷 여러 개로 나누는 과정을 봅니다.';
        if (mode === 'cidr') return '여러 네트워크를 접두사 하나로 합치는 CIDR 요약을 봅니다.';
        return 'IP 주소와 서브넷 마스크를 비트로 계산해 네트워크 주소를 구하는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'split' ? (mob ? 330 : 324) : (mode === 'cidr' ? (mob ? 268 : 250) : (mob ? 280 : 268));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function ah(a) { return ('0' + Math.round(clamp01(a) * 255).toString(16)).slice(-2); }

    /* ===================== 공통 ===================== */
    function swapText(a, b, f, fn) {
        if (a === b) { if (a) fn(a, 1, true); ctx.globalAlpha = 1; return; }
        if (a) fn(a, 1 - f, false);
        if (b) fn(b, f, true);
        ctx.globalAlpha = 1;
    }
    function cellDraw(x, y, cw, ch, fs, st, a) {
        if (!st.vis || a <= 0) return;
        ctx.globalAlpha = a;
        rr(x, y, cw, ch, 2, st.c + '30', st.c + 'cc', 1);
        tx(st.ch, x + cw / 2, y + ch / 2, fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function cellPair(x, y, cw, ch, fs, A, B, f) {
        if (A.vis === B.vis && A.c === B.c && A.ch === B.ch) { cellDraw(x, y, cw, ch, fs, B, 1); return; }
        cellDraw(x, y, cw, ch, fs, A, 1 - f);
        cellDraw(x, y, cw, ch, fs, B, f);
    }

    /* ===================== 비트로 계산 ===================== */
    var BITS_SHORT = ['IP 주소', '마스크 /' + PFX, '네트워크 (IP AND 마스크)', '브로드캐스트 (호스트=1)'];
    function drawBits(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var gap = mob ? 7 : 12;
        var cw = (w - gap * 3) / 32;
        var y0 = top + 34;
        var rowH = 52;
        var bitsOf = BITS_ROWS.map(function (r) { return bin32(r.n); });
        function gx(i) { return x0 + i * cw + Math.floor(i / 8) * gap; }
        function bitSt(ri, i, kk) {
            return { vis: kk >= ri + 1, c: (ri === 0 && kk < 2) ? P.purple : (i < PFX ? P.teal : P.orange), ch: bitsOf[ri].charAt(i) };
        }

        var lgIn = k >= 2 ? (pk < 2 ? ez(seg(e, 0.3, 0.8)) : 1) : 0;
        if (lgIn < 1) {
            ctx.globalAlpha = 1 - lgIn;
            tx('32비트 = 8비트 × 4칸 (점으로 구분)', x0, top + 10, fs - 1, P.sub + 'ff', 'left', false);
        }
        if (lgIn > 0) {
            ctx.globalAlpha = lgIn;
            var half = x0 + w / 2;
            rr(x0, top + 3, 14, 14, 3, P.teal + '30', P.teal + 'cc', 1);
            tx('네트워크 ' + PFX + '비트', x0 + 20, top + 10, fs - 0.5, P.teal + 'ff', 'left', true);
            rr(half, top + 3, 14, 14, 3, P.orange + '30', P.orange + 'cc', 1);
            tx('호스트 ' + (32 - PFX) + '비트', half + 20, top + 10, fs - 0.5, P.orange + 'ff', 'left', true);
        }
        ctx.globalAlpha = 1;

        BITS_ROWS.forEach(function (r, ri) {
            var y = y0 + ri * rowH;
            var cy = y + 8;
            var vis = k >= ri + 1;
            var fresh = vis && pk < ri + 1;
            var la = ri === 0 ? 1 : (fresh ? ez(seg(e, 0, 0.3)) : (vis ? 1 : 0));
            if (la > 0) {
                ctx.globalAlpha = la;
                tx(mob ? BITS_SHORT[ri] : r.label, x0, y, fs - 0.5, P.text + 'ee', 'left', true);
                tx(r.tag, x0 + w, y, fs - 0.5, P.yellow + 'ee', 'right', true);
                ctx.globalAlpha = 1;
            }
            for (var i = 0; i < 32; i++) {
                var x = gx(i);
                if (ri === 0) rr(x, cy, cw - 1, 18, 2, 'none', P.sub + '55', 1);
                if (!vis) continue;
                var B = bitSt(ri, i, k);
                if (fresh) {
                    var f = ez(seg(e, i * 0.012, i * 0.012 + 0.3));
                    var dy = (ri >= 2 && i < PFX) ? (1 - f) * -14 : 0;
                    var src = ri === 2 ? ipBitsOf(i) : (ri === 3 ? bitsOf[2].charAt(i) : null);
                    if (src !== null && i >= PFX && src !== B.ch) {
                        var f2 = ez(seg(e, 0.55, 0.85));
                        cellDraw(x, cy, cw - 1, 18, fs - 1.5, { vis: true, c: B.c, ch: src }, f * (1 - f2));
                        cellDraw(x, cy, cw - 1, 18, fs - 1.5, B, f * f2);
                    } else {
                        cellDraw(x, cy + dy, cw - 1, 18, fs - 1.5, B, f);
                    }
                } else {
                    cellPair(x, cy, cw - 1, 18, fs - 1.5, bitSt(ri, i, pk), B, ez(seg(e, 0.45, 0.9)));
                }
            }
        });
        function ipBitsOf(i) { return bitsOf[0].charAt(i); }

        if (k >= 2) {
            var bxx = gx(PFX) - 0.5;
            for (var lr = 0; lr < Math.min(k, 4); lr++) {
                var lry = y0 + lr * rowH + 8;
                var la2 = lr + 1 > pk ? ez(seg(e, 0.25 + lr * 0.05, 0.6 + lr * 0.05)) : 1;
                ctx.globalAlpha = la2;
                ln(bxx, lry - 2, bxx, lry + 20, P.yellow + 'ff', 1.6, [4, 3]);
                ctx.globalAlpha = 1;
            }
        }

        if (k >= 5) {
            var f5 = pk < 5 ? ez(seg(e, 0.1, 0.7)) : 1;
            var by = y0 + 3 * rowH + 8 + 18 + 8;
            var bx1 = gx(PFX), bx2 = gx(31) + cw - 1;
            var mid = (bx1 + bx2) / 2, hw = (bx2 - bx1) / 2 * f5;
            ln(mid - hw, by, mid + hw, by, P.green + 'ff', 2.4);
            ln(mid - hw, by - 4, mid - hw, by, P.green + 'ff', 2.4);
            ln(mid + hw, by - 4, mid + hw, by, P.green + 'ff', 2.4);
            ctx.globalAlpha = f5;
            lines('호스트 ' + ipStr(FIRST) + ' ~ ' + ipStr(LAST) + ' (' + hostsOf(PFX) + '개)', w, fs).forEach(function (m, mi) {
                tx(m, x0 + w / 2, by + 18 + mi * (fs + 4), fs, P.green + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 서브넷 나누기 ===================== */
    function drawSplit(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, hi = s.hi, pk = p.k, phi = p.hi;
        var colors = [P.orange, P.teal, P.purple, P.green];
        var tt = ez(seg(e, 0, 0.4));
        var q = k >= 1 ? (pk < 1 ? ez(seg(e, 0.1, 0.7)) : 1) : 0;
        var bor = SUB_PFX - BASE_PFX;

        var T0 = ipStr(BASE) + '/' + BASE_PFX + ' (주소 256개)';
        var T1 = (mob ? '' : ipStr(BASE)) + '/' + BASE_PFX + ' → /' + SUB_PFX + ' 서브넷 ' + SUB_N + '개 (각 ' + SUB_SIZE + '개)';
        swapText(pk >= 1 ? T1 : T0, k >= 1 ? T1 : T0, ez(seg(e, 0.1, 0.6)), function (m, a) {
            ctx.globalAlpha = a;
            tx(m, x0, top + 10, fs, P.text + 'ee', 'left', true);
        });

        var barY = top + 26, bh = 30, sw = w / SUB_N;
        if (q < 1) {
            ctx.globalAlpha = 1 - q;
            rr(x0 + 1, barY, w - 2, bh, 4, P.purple + '40', P.purple + 'ff', 1.3);
            tx('/' + BASE_PFX, x0 + w / 2, barY + bh / 2, fs - 0.5, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (q > 0) {
            for (var i = 0; i < SUB_N; i++) {
                var bn = (hi < 0 || hi === i) ? 1 : 0;
                var bp = (pk < 1 || phi < 0 || phi === i) ? 1 : 0;
                var br = lerp(bp, bn, tt);
                var sel = lerp((pk >= 1 && phi === i) ? 1 : 0, hi === i ? 1 : 0, tt);
                var cc = colors[i];
                ctx.globalAlpha = q;
                rr(x0 + i * sw + 1, barY, sw - 2, bh, 4, cc + ah(0.08 + 0.17 * br), cc + ah(0.4 + 0.6 * br), 1.3 + 0.9 * sel);
                tx('/' + SUB_PFX + ' #' + (i + 1), x0 + i * sw + sw / 2, barY + bh / 2, fs - 0.5, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
        tx('.0', x0, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'left', false);
        tx('.255', x0 + w, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'right', false);
        if (q > 0) {
            ctx.globalAlpha = q;
            for (var b = 1; b < SUB_N; b++) {
                tx('.' + (b * SUB_SIZE), x0 + b * sw, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'center', false);
            }
            ctx.globalAlpha = 1;
        }

        var sy = top + 100, sh = 20, sc = mob ? 26 : 30;
        var lab0 = '마지막 옥텟 (호스트 8비트)';
        var lab1 = '마지막 옥텟 (빌린 ' + bor + '비트 + 호스트 ' + (32 - SUB_PFX) + '비트)';
        swapText(pk >= 1 ? lab1 : lab0, k >= 1 ? lab1 : lab0, ez(seg(e, 0.1, 0.6)), function (m, a) {
            ctx.globalAlpha = a;
            tx(m, x0, top + 88, fs - 1.5, P.sub + 'ff', 'left', false);
        });
        function stripSt(kk, hh, i) {
            var isB = kk >= 1 && i < bor;
            var ch = 'x';
            if (kk === 2 && hh >= 0) ch = ('00000000' + (SUBS[hh].net & 255).toString(2)).slice(-8).charAt(i);
            return { vis: true, c: isB ? (kk === 2 && hh >= 0 ? colors[hh] : P.teal) : P.orange, ch: ch };
        }
        for (var j = 0; j < 8; j++) {
            cellPair(x0 + j * sc + (j >= bor ? 6 : 0), sy, sc - 2, sh, fs - 1.5, stripSt(pk, phi, j), stripSt(k, hi, j), ez(seg(e, 0.1 + j * 0.03, 0.5 + j * 0.03)));
        }
        function tagOf(kk, hh) { return kk === 2 && hh >= 0 ? '= .' + (SUBS[hh].net & 255) : ''; }
        swapText(tagOf(pk, phi), tagOf(k, hi), ez(seg(e, 0.2, 0.7)), function (m, a, isNew) {
            ctx.globalAlpha = a;
            var hh = isNew ? hi : phi;
            tx(m, x0 + w, sy + sh / 2, fs - 0.5, (hh >= 0 ? colors[hh] : P.sub) + 'ff', 'right', true);
        });

        var ty = top + 134, rh = 38;
        if (pk < 1) {
            ctx.globalAlpha = k < 1 ? 1 : 1 - ez(seg(e, 0, 0.3));
            lines('호스트에 줄 수 있는 주소 ' + hostsOf(BASE_PFX) + '개 (네트워크 · 브로드캐스트 제외)', w, fs - 0.5).forEach(function (m, mi) {
                tx(m, x0, ty + 8 + mi * (fs + 5), fs - 0.5, P.sub + 'ee', 'left', false);
            });
            ctx.globalAlpha = 1;
        }
        if (k < 1) return;
        SUBS.forEach(function (sb, i) {
            var y = ty + i * (rh + 6);
            var cc = colors[i];
            var a = pk < 1 ? ez(seg(e, 0.15 + i * 0.12, 0.5 + i * 0.12)) : 1;
            var dx = (1 - a) * -24;
            var sl = lerp((pk >= 1 && phi === i) ? 1 : 0, hi === i ? 1 : 0, tt);
            ctx.globalAlpha = a;
            rr(x0 + dx, y, w, rh, 5, cc + ah(0.145 * sl), cc + ah(0.47 + 0.53 * sl), 1.2 + 0.7 * sl);
            tx('#' + (i + 1) + '  ' + ipStr(sb.net) + '/' + SUB_PFX, x0 + 10 + dx, y + 13, fs - 0.5, (sl > 0.5 ? P.text : P.sub) + 'ee', 'left', true);
            var vis = k >= 2 && (hi < 0 || i <= hi);
            var pvis = pk >= 2 && (phi < 0 || i <= phi);
            var ha = vis ? (pvis ? 1 : ez(seg(e, 0.35, 0.8))) : 0;
            if (ha > 0) {
                ctx.globalAlpha = a * ha;
                tx('호스트 ' + ipStr(sb.first) + ' ~ ' + ipStr(sb.last), x0 + 10 + dx, y + 28, fs - 1.5, (sl > 0.5 ? P.yellow : P.sub) + 'ee', 'left', false);
            }
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== CIDR 요약 ===================== */
    function drawCidr(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var lw = mob ? 104 : 150;
        var cw = Math.min(24, (w - lw - 7) / 8);
        var fT = ez(seg(e, 0.1, 0.6));
        function pairOf(kk) { return kk >= 4 ? [CB, CC] : [CA, CB]; }
        function commonOf(kk) { return (kk >= 4 ? CP2 : CP1) - 16; }
        function netCol(n) { return n === CA ? P.orange : (n === CB ? P.teal : P.purple); }
        function titleOf(kk) { return kk < 1 ? '네트워크를 합쳐 라우팅 표 항목 줄이기' : (kk >= 4 ? '예 2: 정확히 합칠 수 없는 경우' : '예 1: 합칠 수 있는 경우'); }
        swapText(titleOf(pk), titleOf(k), fT, function (m, a) {
            ctx.globalAlpha = a;
            tx(m, x0, top + 12, fs, P.text + 'ee', 'left', true);
        });

        var cpa = k >= 2 ? (pk < 2 ? ez(seg(e, 0.1, 0.6)) : 1) : 0;
        if (cpa > 0) {
            ctx.globalAlpha = cpa;
            tx('세 번째 옥텟 (이진수)', x0 + lw, top + 32, fs - 1.5, P.sub + 'ee', 'left', false);
            ctx.globalAlpha = 1;
        }

        function cbSt(kk, r, i) {
            return { vis: kk >= 2, c: (kk >= 3 && i < commonOf(kk)) ? P.green : P.orange, ch: third(pairOf(kk)[r]).charAt(i) };
        }
        [0, 1].forEach(function (r) {
            var y = top + 44 + r * 30;
            var nNew = pairOf(k)[r], nOld = pairOf(pk)[r];
            var oldL = pk >= 1 ? ipStr(nOld) + '/24' : '';
            var newL = k >= 1 ? ipStr(nNew) + '/24' : '';
            swapText(oldL, newL, ez(seg(e, 0.05, 0.5)), function (m, a, isNew) {
                ctx.globalAlpha = a;
                tx(m, x0, y + 9, fs - 1, netCol(isNew ? nNew : nOld) + 'ee', 'left', true);
            });
            for (var i = 0; i < 8; i++) {
                cellPair(x0 + lw + i * cw, y, cw - 2, 18, fs - 1.5, cbSt(pk, r, i), cbSt(k, r, i), ez(seg(e, 0.05 + i * 0.05, 0.4 + i * 0.05)));
            }
        });
        if (k >= 3) {
            var bxN = x0 + lw + commonOf(k) * cw - 1;
            var bxO = pk >= 3 ? x0 + lw + commonOf(pk) * cw - 1 : bxN;
            var gg = ez(seg(e, 0.2, 0.7));
            var bxx = lerp(bxO, bxN, gg);
            ln(bxx, top + 40, bxx, lerp(top + 40, top + 96, pk >= 3 ? 1 : gg), P.yellow + 'ff', 1.6, [4, 3]);
        }

        var sy = top + 116, sh = 26, sw = w / 4;
        tx('192.168.N.0/24 (N = 세 번째 옥텟)', x0, top + 104, fs - 1.5, P.sub + 'ee', 'left', false);
        function occ(kk) {
            if (kk < 1) return {};
            return kk >= 4 ? { 1: CB, 2: CC } : { 0: CA, 1: CB };
        }
        var oN = occ(k), oO = occ(pk);
        var fe = ez(seg(e, 0.35, 0.85));
        var ea = lerp(pk >= 4 ? 1 : 0, k >= 4 ? 1 : 0, fe);
        for (var j = 0; j < 4; j++) {
            var sx = x0 + j * sw + 2;
            rr(sx, sy, sw - 4, sh, 4, 'none', P.sub + '55', 1);
            var nn = oN[j], no = oO[j];
            var isExtra = k >= 4 && !nn || pk >= 4 && !no;
            var fo = ez(seg(e, 0.1 + j * 0.1, 0.5 + j * 0.1));
            var drawOcc = function (n, a) {
                ctx.globalAlpha = a;
                rr(sx, sy, sw - 4, sh, 4, netCol(n) + '40', netCol(n) + 'ff', 1.8);
                tx(String(j), sx + (sw - 4) / 2, sy + sh / 2, fs - 0.5, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            };
            if (nn === no) { if (nn) drawOcc(nn, 1); }
            else { if (no) drawOcc(no, 1 - fo); if (nn) drawOcc(nn, fo); }
            if (!nn && !no && !(isExtra && ea > 0)) tx(String(j), sx + (sw - 4) / 2, sy + sh / 2, fs - 0.5, P.sub + 'ff', 'center', false);
            if (isExtra && ea > 0 && !nn) {
                ctx.globalAlpha = ea;
                rr(sx, sy, sw - 4, sh, 4, P.red + '25', P.red + 'cc', 1.6);
                tx('없음', sx + (sw - 4) / 2, sy + sh / 2, fs - 0.5, P.red + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
        if (k >= 3) {
            var nN = k >= 4 ? 4 : 2;
            var nO = pk >= 4 ? 4 : (pk >= 3 ? 2 : 0);
            var gB = ez(seg(e, 0.2, 0.7));
            var nE = pk >= 3 ? lerp(nO, nN, gB) : nN * gB;
            var colB = (k >= 4 ? P.red : P.green) + 'ff';
            var by = sy + sh + 8;
            var bx2 = x0 + nE * sw - 4;
            if (nE > 0.02) {
                ln(x0 + 2, by, bx2, by, colB, 2.4);
                ln(x0 + 2, by - 5, x0 + 2, by, colB, 2.4);
                ln(bx2, by - 5, bx2, by, colB, 2.4);
            }
        }

        function res1(kk) {
            if (kk < 3) return '';
            var sp = kk >= 4 ? CP2 : CP1;
            return '공통 접두사 ' + sp + '비트  →  ' + ipStr(kk >= 4 ? SUM2 : SUM1) + '/' + sp;
        }
        function res2(kk) {
            if (kk < 3) return '';
            var sp = kk >= 4 ? CP2 : CP1;
            return kk >= 4 ? '합치면 ' + Math.pow(2, 32 - sp) + '개 주소 (원래는 ' + 2 * 256 + '개) → 정확하지 않음' : '합친 주소 ' + Math.pow(2, 32 - sp) + '개 = 원래 ' + 2 * 256 + '개 (정확히 일치)';
        }
        var fR = ez(seg(e, 0.4, 0.9));
        swapText(res1(pk), res1(k), fR, function (m, a, isNew) {
            ctx.globalAlpha = a;
            tx(m, x0, top + 172, fs, ((isNew ? k : pk) >= 4 ? P.red : P.green) + 'ff', 'left', true);
        });
        swapText(res2(pk), res2(k), fR, function (m, a) {
            ctx.globalAlpha = a;
            lines(m, w, fs - 1.5).forEach(function (l, li) {
                tx(l, x0, top + 192 + li * (fs + 3), fs - 1.5, P.sub + 'ee', 'left', false);
            });
        });
        if (k >= 5) {
            ctx.globalAlpha = pk < 5 ? ez(seg(e, 0.2, 0.7)) : 1;
            lines('이어지고 크기에 맞게 정렬된 네트워크만 하나로 요약됩니다', w, fs - 0.5).forEach(function (l, li) {
                tx(l, x0, top + (mob ? 236 : 226) + li * (fs + 4), fs - 0.5, P.yellow + 'ee', 'left', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'split') drawSplit(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'cidr') drawCidr(x0, top, w, mob, s, p, e, L.fs);
        else drawBits(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('sn-viz__speed-btn--active'); });
        btn.classList.add('sn-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sn-viz__mode-btn--active', d.key === m); });
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