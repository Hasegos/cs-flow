/**
 * 서브네팅 / CIDR 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'bits';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'split') return SPLIT_STEPS;
        if (mode === 'cidr') return CIDR_STEPS;
        return BITS_STEPS;
    }

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

    /* ===================== 공통: 비트 줄 ===================== */
    function drawBitRow(x0, y, w, bits, prefix, label, tag, fs, mob) {
        var gap = mob ? 7 : 12;
        var cw = (w - gap * 3) / 32;
        tx(label, x0, y, fs - 0.5, P.text + 'ee', 'left', true);
        tx(tag, x0 + w, y, fs - 0.5, P.yellow + 'ee', 'right', true);
        var by = y + 8;
        for (var i = 0; i < 32; i++) {
            var gx = x0 + i * cw + Math.floor(i / 8) * gap;
            var net = i < prefix;
            var c = net ? P.teal : P.orange;
            rr(gx, by, cw - 1, 18, 2, c + '30', c + 'cc', 1);
            tx(bits.charAt(i), gx + (cw - 1) / 2, by + 9, fs - 1.5, P.text + 'ff', 'center', true);
        }
        return by + 18;
    }
    function drawBits(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var y = top + 8;
        BITS_ROWS.forEach(function (r, i) {
            if (k < i + 1) return;
            drawBitRow(x0, y, w, bin32(r.n), PFX, r.label, r.tag, fs, mob);
            y += 52;
        });
        if (k >= 2) {
            tx('청록 = 네트워크 부분 (' + PFX + '비트), 주황 = 호스트 부분 (' + (32 - PFX) + '비트)', x0, top + 8 + 4 * 52 + 4, fs - 1, P.sub + 'ee', 'left', false);
        }
        if (k >= 5) {
            tx('호스트 ' + ipStr(FIRST) + ' ~ ' + ipStr(LAST) + ' (' + hostsOf(PFX) + '개)', x0 + w / 2, top + 8 + 4 * 52 + 26, fs, P.green + 'ff', 'center', true);
        }
    }

    /* ===================== 모드: 서브넷 나누기 ===================== */
    function drawSplit(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var hi = step ? step.hi : -1;
        var colors = [P.orange, P.teal, P.purple, P.green];
        tx(ipStr(BASE) + '/' + BASE_PFX + ' (주소 256개)', x0, top + 10, fs, P.text + 'ee', 'left', true);
        var barY = top + 26;
        var bh = 30;
        var segs = k >= 1 ? SUB_N : 1;
        var sw = w / segs;
        for (var i = 0; i < segs; i++) {
            var cc = segs === 1 ? P.purple : colors[i];
            var dim = hi >= 0 && hi !== i;
            rr(x0 + i * sw + 1, barY, sw - 2, bh, 4, cc + (dim ? '15' : '40'), cc + (dim ? '66' : 'ff'), hi === i ? 2.2 : 1.3);
            tx(segs === 1 ? '/' + BASE_PFX : '/' + SUB_PFX + ' #' + (i + 1), x0 + i * sw + sw / 2, barY + bh / 2, fs - 0.5, P.text + 'ff', 'center', true);
        }
        tx('.0', x0, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'left', false);
        tx('.255', x0 + w, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'right', false);
        if (k >= 1) {
            for (var b = 1; b < SUB_N; b++) {
                tx('.' + (b * SUB_SIZE), x0 + b * sw, barY + bh + 12, fs - 1.5, P.sub + 'ee', 'center', false);
            }
        }
        var ty = barY + bh + 34;
        var rh = mob ? 38 : 40;
        if (k < 1) {
            tx('호스트에 줄 수 있는 주소 ' + hostsOf(BASE_PFX) + '개 (네트워크 · 브로드캐스트 제외)', x0, ty + 8, fs - 0.5, P.sub + 'ee', 'left', false);
            return;
        }
        SUBS.forEach(function (s, i) {
            var y = ty + i * (rh + 6);
            var on = hi === i;
            var cc = colors[i];
            rr(x0, y, w, rh, 5, on ? cc + '25' : 'none', cc + (on ? 'ff' : '77'), on ? 1.9 : 1.2);
            tx('#' + (i + 1) + '  ' + ipStr(s.net) + '/' + SUB_PFX, x0 + 10, y + 13, fs - 0.5, (on ? P.text : P.sub) + 'ee', 'left', true);
            if (k >= 2) {
                tx('호스트 ' + ipStr(s.first) + ' ~ ' + ipStr(s.last), x0 + 10, y + 28, fs - 1.5, (on ? P.yellow : P.sub) + 'ee', 'left', false);
            }
        });
    }

    /* ===================== 모드: CIDR 요약 ===================== */
    function drawCidr(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var lw = mob ? 104 : 150;
        var cw = Math.min(24, (w - lw - 7) / 8);
        function oct(y, label, n, common, color) {
            tx(label, x0, y + 9, fs - 1, color + 'ee', 'left', true);
            if (k < 2) return;
            var bits = third(n);
            for (var i = 0; i < 8; i++) {
                var same = k >= 3 && i < common;
                var c = same ? P.green : P.orange;
                rr(x0 + lw + i * cw, y, cw - 2, 18, 2, c + '30', c + 'cc', 1);
                tx(bits.charAt(i), x0 + lw + i * cw + (cw - 2) / 2, y + 9, fs - 1.5, P.text + 'ff', 'center', true);
            }
        }
        if (k < 1) {
            tx('네트워크를 합쳐 라우팅 표 항목 줄이기', x0, top + 14, fs, P.text + 'ee', 'left', true);
            return;
        }
        var second = k >= 4;
        var A = second ? CB : CA;
        var B = second ? CC : CB;
        var common = (second ? CP2 : CP1) - 16;
        tx(second ? '예 2: 정확히 합칠 수 없는 경우' : '예 1: 합칠 수 있는 경우', x0, top + 12, fs, P.text + 'ee', 'left', true);
        tx('세 번째 옥텟 (이진수)', x0 + lw, top + 32, fs - 1.5, P.sub + 'ee', 'left', false);
        oct(top + 44, ipStr(A) + '/24', A, common, P.orange);
        oct(top + 74, ipStr(B) + '/24', B, common, P.teal);
        if (k >= 3) {
            var sum = second ? SUM2 : SUM1;
            var sp = second ? CP2 : CP1;
            var y = top + 112;
            tx('공통 접두사 ' + sp + '비트  →  ' + ipStr(sum) + '/' + sp, x0, y, fs, (second ? P.red : P.green) + 'ff', 'left', true);
            tx(second ? '합치면 ' + Math.pow(2, 32 - sp) + '개 주소 (원래는 ' + 2 * 256 + '개) → 정확하지 않음' : '합친 주소 ' + Math.pow(2, 32 - sp) + '개 = 원래 ' + 2 * 256 + '개 (정확히 일치)', x0, y + 20, fs - 1.5, P.sub + 'ee', 'left', false);
        }
        if (k >= 5) {
            tx('이어지고 크기에 맞게 정렬된 네트워크만 하나로 요약됩니다', x0, top + 154, fs - 0.5, P.yellow + 'ee', 'left', true);
        }
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        if (mode === 'split') drawSplit(padX, top, fullW, mob, step);
        else if (mode === 'cidr') drawCidr(padX, top, fullW, mob, step);
        else drawBits(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 주소를 계산하는 과정을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = (mob ? 11 : 12.5) * Math.min(1, (W - 16) / ctx.measureText(hint).width);
            tx(hint, W / 2, GH() - (mob ? 12 : 14), hs, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'split') neededH = mob ? 330 : 320;
        else if (mode === 'cidr') neededH = mob ? 260 : 260;
        else neededH = mob ? 310 : 310;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'split') return '네트워크 하나를 서브넷 여러 개로 나누는 과정을 봅니다.';
        if (mode === 'cidr') return '여러 네트워크를 접두사 하나로 합치는 CIDR 요약을 봅니다.';
        return 'IP 주소와 서브넷 마스크를 비트로 계산해 네트워크 주소를 구하는 과정을 봅니다.';
    }

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
        running = false; stepIdx = -1;
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