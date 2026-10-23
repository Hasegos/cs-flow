/**
 * 캐시 일관성(MESI) 시각화 시각화
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
    var root    = el('div', 'coh-viz');
    var toolbar = el('div', 'coh-viz__toolbar');
    var tbLeft  = el('div', 'coh-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'coh-viz__title', 'CACHE COHERENCE'));

    var modeWrap = el('div', 'coh-viz__mode');
    var modeDefs = [
        { key: 'problem', label: '일관성 문제' },
        { key: 'mesi', label: 'MESI 상태 전이' },
        { key: 'false', label: '거짓 공유' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'coh-viz__mode-btn' + (i === 0 ? ' coh-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'coh-viz__speed');
    speedWrap.appendChild(el('span', 'coh-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'coh-viz__speed-btn' + (i === 0 ? ' coh-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'coh-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'coh-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'coh-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'coh-viz__controls');
    var btnPlay  = el('button', 'coh-viz__btn coh-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'coh-viz__btn', '▶| STEP');
    var btnReset = el('button', 'coh-viz__btn', '↺ RESET');
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
    var mode    = 'problem';
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

    /* ===================== 데이터: 일관성 문제 ===================== */
    var V0 = 5;
    var V1 = 7;
    var V2 = 9;
    var ST_LABEL = { N: '캐시에 없음', C: '복사본', M: 'M 수정됨', E: 'E 단독', S: 'S 공유', I: 'I 무효' };
    function stCol(s) {
        if (s === 'M') return P.orange;
        if (s === 'E') return P.green;
        if (s === 'S') return P.teal;
        if (s === 'C') return P.purple;
        return P.muted;
    }
    function cs(s, v, stale) { return { s: s, v: v, stale: !!stale }; }

    var PROB_STEPS = [
        { c: [cs('N', null), cs('N', null)], mem: V0, msg: '', act: -1, log: '메모리의 변수 X는 ' + V0 + '입니다. 코어 0과 코어 1은 각자 캐시를 가지고 있고 아직 X를 읽지 않았습니다.' },
        { c: [cs('C', V0), cs('N', null)], mem: V0, msg: '읽기 요청', act: 0, log: '코어 0이 X를 읽습니다. 메모리에서 가져와 자기 캐시에 복사본을 둡니다.' },
        { c: [cs('C', V0), cs('C', V0)], mem: V0, msg: '읽기 요청', act: 1, log: '코어 1도 X를 읽습니다. 이제 같은 주소의 복사본이 두 캐시에 하나씩 있습니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '신호 없음', act: 0, log: '코어 0이 X에 ' + V1 + '을 씁니다. 일관성 프로토콜이 없다면 코어 1의 복사본은 그대로 ' + V0 + '입니다. 낡은 값입니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '', act: 1, log: '코어 1이 X를 읽으면 자기 캐시의 낡은 값 ' + V0 + '을 얻습니다. 같은 변수를 코어마다 다른 값으로 보게 됩니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '', act: -1, log: '정리 — 이것이 캐시 일관성 문제입니다. 일관성 프로토콜은 한 코어가 쓰면 다른 코어의 복사본을 무효화하거나 갱신해 모든 코어가 같은 값을 보게 합니다.' }
    ];

    /* ===================== 데이터: MESI 상태 전이 ===================== */
    var MESI_STEPS = [
        { c: [cs('I', null), cs('I', null)], mem: V0, ms: false, msg: '', act: -1, log: '모든 캐시 라인이 무효(I) 상태입니다. 메모리의 X는 ' + V0 + '입니다.' },
        { c: [cs('E', V0), cs('I', null)], mem: V0, ms: false, msg: '읽기 요청', act: 0, log: '코어 0이 X를 읽습니다. 다른 캐시에 복사본이 없으므로 단독(E) 상태로 들어옵니다.' },
        { c: [cs('M', V1), cs('I', null)], mem: V0, ms: true, msg: '신호 없음', act: 0, log: '코어 0이 X에 ' + V1 + '을 씁니다. 단독(E) 라인은 다른 캐시에 알릴 필요 없이 수정됨(M)으로 바뀝니다. 메모리 값 ' + V0 + '은 낡은 값이 됩니다.' },
        { c: [cs('S', V1), cs('S', V1)], mem: V1, ms: false, msg: '데이터 제공(코어 0)', act: 1, log: '코어 1이 X를 읽습니다. 수정됨(M) 라인을 가진 코어 0이 최신 값 ' + V1 + '을 내주고(기본 MESI에서는 메모리에도 반영) 두 라인 모두 공유(S)가 됩니다.' },
        { c: [cs('M', V2), cs('I', null)], mem: V1, ms: true, msg: '무효화 신호', act: 0, log: '코어 0이 공유(S) 라인에 ' + V2 + '를 씁니다. 먼저 무효화 신호를 보내 코어 1의 복사본을 무효(I)로 만든 뒤 자신의 라인을 수정됨(M)으로 바꿉니다.' },
        { c: [cs('M', V2), cs('I', null)], mem: V1, ms: true, msg: '', act: -1, log: '정리 — 쓰기 전에는 반드시 다른 복사본이 무효화되므로, 한 시점에 수정됨(M) 라인은 한 캐시에만 있습니다. 코어 1이 다시 읽으면 코어 0이 최신 값을 내줍니다.' }
    ];

    /* ===================== 데이터: 거짓 공유 ===================== */
    var FS_SEQ = [0, 1, 0, 1];
    function fsMoves(split, n) {
        var moves = 0;
        if (split) return 0;
        for (var i = 1; i < n; i++) if (FS_SEQ[i] !== FS_SEQ[i - 1]) moves++;
        return moves;
    }
    var FS_N = FS_SEQ.length;

    var FALSE_STEPS = [
        { split: false, n: 0, log: '코어 0은 변수 a만, 코어 1은 변수 b만 씁니다. 둘은 서로 다른 변수지만 메모리에서 나란히 놓여 같은 캐시 라인에 들어 있습니다.' },
        { split: false, n: 1, log: '코어 0이 a에 씁니다. 라인을 가져와 수정됨(M)으로 만듭니다.' },
        { split: false, n: 2, log: '코어 1이 b에 씁니다. a와 b는 다른 변수지만 같은 라인이므로, 코어 0의 라인을 무효화하고 가져와야 합니다. 라인 이동 ' + fsMoves(false, 2) + '회.' },
        { split: false, n: 3, log: '코어 0이 a에 다시 씁니다. 이번에는 코어 1의 라인을 되가져옵니다. 라인 이동 ' + fsMoves(false, 3) + '회. 서로 공유하는 데이터가 없는데도 라인이 오갑니다.' },
        { split: false, n: 4, log: '쓰기 ' + FS_N + '번에 라인 이동 ' + fsMoves(false, 4) + '회가 일어났습니다. 이것이 거짓 공유(false sharing)입니다.' },
        { split: true, n: 4, log: 'a와 b를 서로 다른 캐시 라인에 두면(패딩, 정렬) 같은 쓰기 ' + FS_N + '번에도 각 코어가 자기 라인을 수정됨(M)으로 유지해 라인 이동이 ' + fsMoves(true, 4) + '회입니다.' },
        { split: true, n: 4, sum: true, log: '정리 — 같은 라인에 놓인 변수는 서로 무관해도 캐시 라인 단위로 일관성이 관리됩니다. 쓰기 ' + FS_N + '번 기준 라인 이동은 ' + fsMoves(false, 4) + '회 대 ' + fsMoves(true, 4) + '회입니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'mesi') return MESI_STEPS;
        if (mode === 'false') return FALSE_STEPS;
        return PROB_STEPS;
    }
    function defaultLog() {
        if (mode === 'mesi') return '캐시 라인 상태(M, E, S, I)가 읽기와 쓰기에 따라 어떻게 바뀌는지 코어 0과 코어 1로 따라가 봅니다.';
        if (mode === 'false') return '서로 다른 변수인데 같은 캐시 라인에 있어서 라인이 코어 사이를 오가는 거짓 공유를 봅니다.';
        return '일관성 프로토콜이 없다면 코어마다 같은 변수의 값이 달라질 수 있습니다. 읽기와 쓰기를 따라가 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var gap = mob ? 12 : 40;
        var bw = Math.min(250, (w - gap) / 2);
        var bh = mob ? 106 : 120;
        var sx = (w - 2 * bw - gap) / 2;
        var busY = bh + 22;
        var memY = busY + 48;
        var memH = mob ? 60 : 64;
        var capY = memY + memH + 12;
        return {
            fs: mob ? 11 : 12.5, bw: bw, bh: bh,
            xs: [sx, sx + bw + gap],
            busY: busY, busW: Math.min(w - 16, mob ? 210 : 300),
            memY: memY, memH: memH, memW: Math.min(w - 40, mob ? 192 : 220),
            capY: capY, total: capY + 44
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 드로우 헬퍼 ===================== */
    function cohA(a) {
        var h = Math.round(clamp01(a) * 255).toString(16);
        return h.length < 2 ? '0' + h : h;
    }
    function cohAlong(pts, u) {
        var tot = 0, L = [], i, d, k;
        for (i = 1; i < pts.length; i++) {
            L[i] = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
            tot += L[i];
        }
        d = clamp01(u) * tot;
        for (i = 1; i < pts.length; i++) {
            if (d <= L[i] || i === pts.length - 1) {
                k = L[i] > 0 ? clamp01(d / L[i]) : 1;
                return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
            }
            d -= L[i];
        }
        return pts[pts.length - 1];
    }
    function cohRouteMem(g, x0, top, w, i) {
        var cx = x0 + g.xs[i] + g.bw / 2, lane = top + g.busY - 6;
        return [[cx, top + g.bh], [cx, lane], [x0 + w / 2, lane], [x0 + w / 2, top + g.memY - 4]];
    }
    function cohRouteCore(g, x0, top, a, b) {
        var ca = x0 + g.xs[a] + g.bw / 2, cb = x0 + g.xs[b] + g.bw / 2, lane = top + g.busY - 6;
        return [[ca, top + g.bh], [ca, lane], [cb, lane], [cb, top + g.bh]];
    }
    function cohRouteBus(g, x0, top, i) {
        var cx = x0 + g.xs[i] + g.bw / 2, lane = top + g.busY - 6;
        return [[cx, top + g.bh], [cx, lane]];
    }
    function cohPacket(pt, label, col, alpha, mob) {
        var pw = mob ? 48 : 64, ph = 20;
        ctx.globalAlpha = clamp01(alpha);
        rr(pt[0] - pw / 2, pt[1] - ph / 2, pw, ph, 5, col + 'ff', col + 'ff', 1.2);
        tx(label, pt[0], pt[1], mob ? 11 : 12, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function cohBox(g, x0, top, i, st, col, active) {
        var x = x0 + g.xs[i];
        rr(x, top, g.bw, g.bh, 8, col + '14', active ? P.purple + 'ee' : col + '77', active ? 2.6 : 1.4);
        tx('Core ' + i, x + 10, top + 14, g.fs, P.text + 'ee', 'left', true);
        rr(x + 8, top + 26, g.bw - 16, 24, 6, col + '26', col + 'cc', 1.4);
        tx(ST_LABEL[st], x + g.bw / 2, top + 38, g.fs, col + 'ee', 'center', true);
    }
    function cohBus(g, x0, top, w, text, col, lit) {
        var by = top + g.busY, mx = x0 + w / 2, bwid = g.busW;
        var c0 = x0 + g.xs[0] + g.bw / 2, c1 = x0 + g.xs[1] + g.bw / 2;
        ln(c0, top + g.bh, c0, by, P.sub + '88', 1.6);
        ln(c1, top + g.bh, c1, by, P.sub + '88', 1.6);
        ln(mx, by + 22, mx, top + g.memY, P.sub + '88', 1.6);
        rr(mx - bwid / 2, by, bwid, 22, 6, lit ? col + '26' : P.sub + '12', lit ? col + 'cc' : P.sub + '66', 1.4);
        tx(text, mx, by + 11, g.fs, lit ? col + 'ff' : P.sub + 'ff', 'center', true);
    }
    function cohMemBox(g, x0, top, w, col) {
        var y = top + g.memY;
        rr(x0 + w / 2 - g.memW / 2, y, g.memW, g.memH, 6, col + '14', col + '99', 1.4);
        tx('Memory', x0 + w / 2, y + 12, g.fs, P.sub + 'ff', 'center', true);
    }
    function cohRing(g, x0, top, i, tt) {
        var ex = 4 + 8 * tt, x = x0 + g.xs[i];
        rr(x - ex, top - ex, g.bw + 2 * ex, g.bh + 2 * ex, 10, 'none', P.purple + cohA(1 - tt), 2);
    }
    function cohChip(cx, cy, cw, ch, cells, col, alpha, hi, mob) {
        var fs = mob ? 11 : 12.5, n = cells.length, cwi = cw / n, k, ccx;
        ctx.globalAlpha = clamp01(alpha);
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 6, col + '26', col + 'cc', 1.6);
        for (k = 0; k < n; k++) {
            ccx = cx - cw / 2 + cwi * (k + 0.5);
            if (k === hi) rr(ccx - cwi / 2 + 3, cy - ch / 2 + 3, cwi - 6, ch - 6, 4, P.purple + '40', P.purple + 'ff', 1.8);
            tx(cells[k], ccx, cy, fs, (k === hi ? P.text : P.sub) + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
    }
    function cohMsgCol(msg) {
        if (msg === '읽기 요청') return P.yellow;
        if (msg === '데이터 제공(코어 0)') return P.green;
        if (msg === '무효화 신호') return P.red;
        return P.sub;
    }
    function cohSwitchAt(msg, isAct) {
        if (msg === '읽기 요청') return isAct ? 0.95 : 0.6;
        if (msg === '신호 없음') return isAct ? 0.25 : 0.6;
        if (msg === '데이터 제공(코어 0)') return 0.8;
        if (msg === '무효화 신호') return isAct ? 0.7 : 0.5;
        return 0.6;
    }
    function cohReadPkts(g, x0, top, w, mob, a, val, tt) {
        var route = cohRouteMem(g, x0, top, w, a);
        if (tt < 0.45) cohPacket(cohAlong(route, tt / 0.45), '읽기', P.yellow, 1, mob);
        else if (tt >= 0.5 && tt < 0.95) cohPacket(cohAlong(route.slice().reverse(), (tt - 0.5) / 0.45), 'X = ' + val, P.green, 1, mob);
    }
    function cohDataPkts(g, x0, top, w, mob, s, tt) {
        if (tt < 0.25) cohPacket(cohAlong(cohRouteBus(g, x0, top, 1), tt / 0.25), '읽기', P.yellow, 1, mob);
        if (tt >= 0.3 && tt < 0.8) cohPacket(cohAlong(cohRouteCore(g, x0, top, 0, 1), (tt - 0.3) / 0.5), 'X = ' + s.c[1].v, P.green, 1, mob);
        if (tt >= 0.5 && tt < 0.95) cohPacket(cohAlong(cohRouteMem(g, x0, top, w, 0), (tt - 0.5) / 0.45), 'X = ' + s.mem, P.orange, 1, mob);
    }
    function cohInvPkts(g, x0, top, mob, tt) {
        if (tt < 0.5) cohPacket(cohAlong(cohRouteCore(g, x0, top, 0, 1), tt / 0.5), '무효화', P.red, 1, mob);
    }
    function cohFsOwner(n, split) {
        if (split || n <= 0) return -1;
        return FS_SEQ[n - 1];
    }
    function cohFsSt(n, split, i) {
        var k;
        if (split) return n > 0 ? 'M' : 'N';
        if (n > 0 && FS_SEQ[n - 1] === i) return 'M';
        for (k = 0; k < n; k++) if (FS_SEQ[k] === i) return 'I';
        return 'N';
    }
    function cohSlot(g, x0, top, w, o) {
        if (o < 0) return [x0 + w / 2, top + g.memY + 39];
        return [x0 + g.xs[o] + g.bw / 2, top + 75];
    }

    /* ===================== 모드: 일관성 문제 · MESI 상태 전이 ===================== */
    function cohDrawCore(g, x0, top, w, mob, s, p, fresh, tt) {
        var mesi = mode === 'mesi';
        var fs = g.fs;
        var shown = [];
        var i, c, cxm, memSw, memVal, memStale, diff, pDiff, da, pc, sc, changed;
        for (i = 0; i < 2; i++) {
            pc = p.c[i];
            sc = s.c[i];
            changed = pc.s !== sc.s || pc.v !== sc.v || !!pc.stale !== !!sc.stale;
            shown.push(fresh && changed && tt < cohSwitchAt(s.msg, i === s.act) ? pc : sc);
        }
        memSw = s.msg === '데이터 제공(코어 0)' ? 0.95 : 0.5;
        memVal = (fresh && p.mem !== s.mem && tt < memSw) ? p.mem : s.mem;
        memStale = mesi && ((fresh && p.ms !== s.ms && tt < memSw) ? p.ms : s.ms);
        cohMemBox(g, x0, top, w, memStale ? P.red : P.green);
        tx('X = ' + memVal + (memStale ? ' (낡음)' : ''), x0 + w / 2, top + g.memY + 40, fs + 2, (memStale ? P.red : P.green) + 'ee', 'center', true);
        cohBus(g, x0, top, w, s.msg || (s.act >= 0 ? '버스 사용 없음' : '버스'), s.msg ? cohMsgCol(s.msg) : P.sub, !!s.msg);
        for (i = 0; i < 2; i++) {
            c = shown[i];
            cohBox(g, x0, top, i, c.s, c.stale ? P.red : stCol(c.s), s.act === i);
            cxm = x0 + g.xs[i] + g.bw / 2;
            tx(c.v === null ? 'X = —' : 'X = ' + c.v, cxm, top + 66, fs + 3, c.v === null ? P.sub + 'ff' : P.text + 'ee', 'center', true);
            if (c.stale) tx('낡은 값', cxm, top + 88, fs, P.red + 'ff', 'center', true);
        }
        if (fresh && s.act >= 0 && (s.msg === '신호 없음' || s.msg === '')) cohRing(g, x0, top, s.act, tt);
        if (fresh) {
            if (s.msg === '읽기 요청' && s.act >= 0) cohReadPkts(g, x0, top, w, mob, s.act, s.mem, tt);
            if (s.msg === '데이터 제공(코어 0)') cohDataPkts(g, x0, top, w, mob, s, tt);
            if (s.msg === '무효화 신호') cohInvPkts(g, x0, top, mob, tt);
        }
        diff = s.c[0].v !== null && s.c[1].v !== null && s.c[0].v !== s.c[1].v;
        pDiff = p.c[0].v !== null && p.c[1].v !== null && p.c[0].v !== p.c[1].v;
        if (diff) {
            da = (fresh && !pDiff) ? ez(tt) : 1;
            tx('두 코어의 X 값이 다릅니다', x0 + w / 2, top + g.capY + 8, fs, P.red + cohA(da), 'center', true);
        }
    }

    /* ===================== 모드: 거짓 공유 ===================== */
    function cohDrawFalse(g, x0, top, w, mob, s, p, fresh, tt) {
        var fs = g.fs;
        var pn = p.n, sn = s.n, ps = p.split, ss = s.split;
        var pOwner = cohFsOwner(pn, ps), sOwner = cohFsOwner(sn, ss);
        var lineOwner = ss ? pOwner : sOwner;
        var lastW = sn > 0 ? FS_SEQ[sn - 1] : -1;
        var moved = !ss && sn >= 2 && FS_SEQ[sn - 1] !== FS_SEQ[sn - 2];
        var moving = fresh && !ss && pOwner !== sOwner;
        var splitIn = fresh && ss && !ps;
        var sharedA = ss ? (splitIn ? 1 - ez(tt) : 0) : 1;
        var splitA = ss ? (splitIn ? ez(tt) : 1) : 0;
        var cw = g.bw - 20, ch = 30;
        var i, st, stP, shownSt, from, to, pos, sp, cnt, cy, sa;

        cohMemBox(g, x0, top, w, P.sub);
        cohBus(g, x0, top, w, moved ? '캐시 라인 이동' : '버스', P.orange, moved);
        for (i = 0; i < 2; i++) {
            st = cohFsSt(sn, ss, i);
            stP = cohFsSt(pn, ps, i);
            shownSt = (fresh && st !== stP && tt < 0.9) ? stP : st;
            cohBox(g, x0, top, i, shownSt, stCol(shownSt), lastW === i);
        }
        if (fresh && sn > pn && lastW >= 0) cohRing(g, x0, top, lastW, tt);

        if (sharedA > 0) {
            from = cohSlot(g, x0, top, w, pOwner);
            to = cohSlot(g, x0, top, w, sOwner);
            if (moving) pos = [lerp(from[0], to[0], ez(tt)), lerp(from[1], to[1], ez(tt))];
            else pos = cohSlot(g, x0, top, w, lineOwner);
            cohChip(pos[0], pos[1], cw, ch, ['a', 'b'], lineOwner >= 0 ? P.orange : P.sub, sharedA, lastW, mob);
        }
        if (splitA > 0) {
            for (i = 0; i < 2; i++) {
                sp = cohSlot(g, x0, top, w, i);
                cohChip(sp[0], sp[1], cw, ch, [i === 0 ? 'a' : 'b'], sn > 0 ? P.orange : P.sub, splitA, lastW === i ? 0 : -1, mob);
            }
        }

        cnt = fsMoves(ss, sn);
        cy = top + g.capY + 8;
        tx('캐시 라인 이동: ' + cnt + '회', x0 + w / 2, cy, fs + 1, cnt > 0 ? P.orange + 'ff' : P.green + 'ff', 'center', true);
        if (s.sum) {
            sa = fresh ? ez(tt) : 1;
            ctx.globalAlpha = sa;
            tx((mob ? '같은 라인 ' + fsMoves(false, FS_N) + '회 → 분리 ' : '같은 라인 ' + fsMoves(false, FS_N) + '회 → 라인 분리 ') + fsMoves(true, FS_N) + '회', x0 + w / 2, cy + 20, fs, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var g = layout(w, mob);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var tt = fresh ? clamp01(t) : 1;
        if (mode === 'false') cohDrawFalse(g, x0, top, w, mob, s, p, fresh, tt);
        else cohDrawCore(g, x0, top, w, mob, s, p, fresh, tt);
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
        speedBtns.forEach(function (b) { b.classList.remove('coh-viz__speed-btn--active'); });
        btn.classList.add('coh-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('coh-viz__mode-btn--active', d.key === m); });
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