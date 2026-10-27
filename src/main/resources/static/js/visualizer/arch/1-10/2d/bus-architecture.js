/**
 * 버스 구조 인터랙티브 시각화
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
    var root    = el('div', 'bus-viz');
    var toolbar = el('div', 'bus-viz__toolbar');
    var tbLeft  = el('div', 'bus-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bus-viz__title', 'Bus Architecture'));

    var modeWrap = el('div', 'bus-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bus-viz__mode-btn' + (i === 0 ? ' bus-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bus-viz__speed');
    speedWrap.appendChild(el('span', 'bus-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bus-viz__speed-btn' + (i === 0 ? ' bus-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bus-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bus-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bus-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bus-viz__controls');
    var btnPlay  = el('button', 'bus-viz__btn bus-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bus-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bus-viz__btn', '↺ RESET');
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
    var mode    = '';
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
    var tipHits = [];
    var mousePos = { x: -1, y: -1 };
    var hoveredKey = null;
    function tipHit(x, y, w, h, key) { tipHits.push({ x: x, y: y, w: w, h: h, key: key }); }
    function tipBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx - 10, cy - 10, 20, 20, key);
    }
    function drawTip(mx, my, text) {
        var parts = text.split(String.fromCharCode(10));
        var title = parts[0], desc = parts[1] || '';
        var W = GW(), H = GH();
        var pad = 14;
        var maxIn = W - 16 - pad * 2;
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var tl = window.CsFlow.wrapText(ctx, title, maxIn);
        var titleW = 0;
        tl.forEach(function (l) { titleW = Math.max(titleW, ctx.measureText(l).width); });
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 24 + tl.length * 18 + dl.length * 18 : 18 + tl.length * 18;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tl.forEach(function (l, i) { tx(l, bx + pad, by + 18 + i * 18, 14, P.text + 'ff', 'left', true); });
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 24 + tl.length * 18 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 툴팁 정의 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n버스를 통해 데이터 전송을 요청하는 주체 (Bus Master)',
        MEM:  'Main Memory\n주소 버스로 지정된 위치에 데이터 읽기/쓰기 (Slave)',
        IO:   'I/O Device\n입출력 장치 — 버스 중재(Arbitration)를 거쳐 접근',
        ADDR: 'Address Bus\n단방향 — CPU가 접근할 메모리/I/O 주소를 전송',
        DATA: 'Data Bus\n양방향 — 실제 데이터를 주고받는 통로',
        CTRL: 'Control Bus\n양방향 — Read/Write/IRQ 등 제어 신호 전송',
        ARB:  'Bus Arbiter\n여러 장치의 버스 요청을 중재하여 우선순위 결정',
    };

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: 'ADDR → MEM',
            log: 'Step 1 — CPU가 Address Bus에 메모리 주소(0x00FF)를 전송합니다. 단방향으로 CPU → Memory 방향으로만 흐릅니다.',
            activeBus: 'addr',
            arrows: [{ from: 'cpu', to: 'mem', via: 'addr' }],
        },
        {
            badge: 'CTRL READ',
            log: 'Step 2 — Control Bus로 READ 신호를 전송합니다. CPU가 메모리에서 데이터를 읽겠다고 알립니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'cpu', to: 'mem', via: 'ctrl' }],
        },
        {
            badge: 'DATA ← MEM',
            log: 'Step 3 — Memory가 Data Bus를 통해 요청한 데이터를 CPU로 반환합니다. 양방향 버스가 Memory → CPU 방향으로 동작합니다.',
            activeBus: 'data',
            arrows: [{ from: 'mem', to: 'cpu', via: 'data' }],
        },
        {
            badge: 'ADDR → I/O',
            log: 'Step 4 — CPU가 I/O 장치에 접근하기 위해 Address Bus에 I/O 포트 주소(0x03F8)를 전송합니다.',
            activeBus: 'addr',
            arrows: [{ from: 'cpu', to: 'io', via: 'addr' }],
        },
        {
            badge: 'CTRL WRITE',
            log: 'Step 5 — Control Bus로 WRITE 신호를 전송합니다. CPU가 I/O 장치에 데이터를 쓰겠다고 알립니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'cpu', to: 'io', via: 'ctrl' }],
        },
        {
            badge: 'DATA → I/O',
            log: 'Step 6 — CPU가 Data Bus를 통해 I/O 장치로 데이터를 전송합니다.',
            activeBus: 'data',
            arrows: [{ from: 'cpu', to: 'io', via: 'data' }],
        },
        {
            badge: 'BUS REQ',
            log: 'Step 7 — I/O 장치가 DMA를 위해 버스 사용을 요청(Bus Request)합니다. Arbiter가 요청을 수신합니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'io', to: 'arb', via: 'ctrl' }],
        },
        {
            badge: 'BUS GRANT + DMA',
            log: 'Step 8 — Arbiter가 버스 사용권(Bus Grant)을 I/O에 부여합니다. I/O는 Data Bus로 Memory에 직접 접근합니다(DMA).',
            activeBus: 'data',
            arrows: [
                { from: 'arb', to: 'io',  via: 'ctrl' },
                { from: 'io',  to: 'mem', via: 'data' },
            ],
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = TOOLTIPS;
    var BS_CHIPS = [['0x00FF'], ['READ'], ['DATA'], ['0x03F8'], ['WRITE'], ['DATA'], ['REQ'], ['GRANT', 'DMA']];
    var BS_COL = { addr: 'purple', data: 'green', ctrl: 'teal' };

    /* ===================== 단계 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 버스 동작을 확인하세요.'; }
    function ez(q) { var c = clamp01(q); return c * c * (3 - 2 * c); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var nw = mob ? 56 : 110, nh = mob ? 60 : 80;
        var busH = mob ? 28 : 44, gap = mob ? 20 : 30, tap = mob ? 8 : 16;
        var pillH = mob ? 20 : 24, labZ = mob ? 18 : 24;
        var aT = pillH + 10 + labZ;
        var dT = aT + busH + gap;
        var cT = dT + busH + gap;
        var arbW = mob ? 84 : 120, arbH = mob ? 26 : 34;
        var arbT = cT + busH + (mob ? 22 : 30);
        var busL = nw + tap, rX = w - nw - tap;
        return {
            mob: mob, w: w, nw: nw, nh: nh, busH: busH, gap: gap, pillH: pillH, labZ: labZ,
            fsL: mob ? 11 : 12, fsN: mob ? 11 : 14, fsS: mob ? 11 : 12, fsC: mob ? 11 : 12,
            aT: aT, dT: dT, cT: cT, cB: cT + busH,
            aM: aT + busH / 2, dM: dT + busH / 2, cM: cT + busH / 2,
            cpuR: nw, cpuH: cT + busH - aT,
            busL: busL, rX: rX, memX: w - nw, ioX: w - nw,
            ax: (busL + rX) / 2, arbW: arbW, arbH: arbH, arbT: arbT,
            ox: 0, oy: 0,
            h: arbT + arbH + (mob ? 22 : 28)
        };
    }
    function sceneH(w, mob) { return layout(w, mob).h; }

    /* ===================== 상태 계산 ===================== */
    function bsWin(n, ai) { return n === 1 ? [0, 0.88] : [ai * 0.5, ai * 0.5 + 0.46]; }
    function bsGrants(st) { return st.arrows.some(function (a) { return a.from === 'arb'; }); }
    function bsOwner(idx, tt) {
        var steps = currentSteps();
        var own = 'CPU';
        for (var i = 0; i < idx; i++) { if (bsGrants(steps[i])) own = 'IO'; }
        if (idx >= 0 && bsGrants(steps[idx]) && tt >= 0.46) own = 'IO';
        return own;
    }
    function bsLit(st, tt) {
        var lit = {};
        if (!st) return lit;
        st.arrows.forEach(function (arr, ai) {
            if (tt >= bsWin(st.arrows.length, ai)[0]) {
                lit[arr.from.toUpperCase()] = true;
                lit[arr.to.toUpperCase()] = true;
            }
        });
        return lit;
    }

    /* ===================== 경로 ===================== */
    function bsRoute(L, arr) {
        var key = arr.from + '>' + arr.to + ':' + arr.via;
        var cR = L.cpuR, rX = L.rX, mX = L.memX, iX = L.ioX;
        var a = L.aM, d = L.dM, c = L.cM;
        if (key === 'cpu>mem:addr') return [[cR, a], [rX, a], [mX, a]];
        if (key === 'cpu>mem:ctrl') return [[cR, c], [rX, c], [rX, a], [mX, a]];
        if (key === 'mem>cpu:data') return [[mX, a], [rX, a], [rX, d], [cR, d]];
        if (key === 'cpu>io:addr') return [[cR, a], [rX, a], [rX, c], [iX, c]];
        if (key === 'cpu>io:ctrl') return [[cR, c], [rX, c], [iX, c]];
        if (key === 'cpu>io:data') return [[cR, d], [rX, d], [rX, c], [iX, c]];
        if (key === 'io>arb:ctrl') return [[iX, c], [rX, c], [L.ax, c], [L.ax, L.arbT]];
        if (key === 'arb>io:ctrl') return [[L.ax, L.arbT], [L.ax, c], [rX, c], [iX, c]];
        return [[iX, c], [rX, c], [rX, d], [rX, a], [mX, a]];
    }
    function bsAt(pts, f) {
        var lens = [], total = 0, i;
        for (i = 1; i < pts.length; i++) {
            lens[i - 1] = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            total += lens[i - 1];
        }
        var want = total * f;
        for (i = 0; i < lens.length; i++) {
            if (want <= lens[i] || i === lens.length - 1) {
                var r = lens[i] > 0 ? clamp01(want / lens[i]) : 1;
                return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
            }
            want -= lens[i];
        }
        return pts[pts.length - 1];
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function bsW(str, fs, bold) {
        ctx.font = (bold ? '700 ' : '400 ') + fs + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function bsBadge(L, cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx + L.ox - 10, cy + L.oy - 10, 20, 20, key);
    }
    function bsPill(L, str, col) {
        var pw = bsW(str, L.fsL, true) + 22;
        rr(L.w / 2 - pw / 2, 0, pw, L.pillH, L.pillH / 2, col + '22', col + 'ff', 1.5);
        tx(str, L.w / 2, L.pillH / 2, L.fsL, P.text + 'ff', 'center', true);
    }
    function bsLanes(L, act) {
        var defs = [
            { k: 'addr', top: L.aT, lab: 'ADDRESS BUS', mlab: 'ADDR BUS', tip: 'ADDR', ly: L.aT - L.labZ / 2 },
            { k: 'data', top: L.dT, lab: 'DATA BUS', mlab: 'DATA BUS', tip: 'DATA', ly: L.dT - L.gap / 2 },
            { k: 'ctrl', top: L.cT, lab: 'CONTROL BUS', mlab: 'CTRL BUS', tip: 'CTRL', ly: L.cT - L.gap / 2 }
        ];
        defs.forEach(function (d) {
            var col = P[BS_COL[d.k]], on = act === d.k;
            var lb = L.mob ? d.mlab : d.lab;
            rr(L.busL, d.top, L.rX - L.busL, L.busH, 3, on ? col + '22' : col + '0a', on ? col + 'ff' : col + '55', on ? 2 : 1);
            tx(lb, L.busL, d.ly, L.fsL, on ? col + 'ff' : P.sub + 'ff', 'left', true);
            bsBadge(L, L.busL + bsW(lb, L.fsL, true) + 14, d.ly, d.tip);
        });
    }
    function bsWires(L, act, arbOn) {
        var mids = [['addr', L.aM, P.purple], ['data', L.dM, P.green], ['ctrl', L.cM, P.teal]];
        mids.forEach(function (m) {
            var on = act === m[0];
            ln(L.cpuR, m[1], L.busL, m[1], on ? m[2] + 'ff' : P.muted + '88', on ? 2.5 : 1, on ? [] : [4, 5]);
        });
        ln(L.rX, L.aM, L.rX, L.cM, P.muted + '99', 2);
        ln(L.rX, L.aM, L.memX, L.aM, P.muted + '99', 1.5);
        ln(L.rX, L.cM, L.ioX, L.cM, P.muted + '99', 1.5);
        ln(L.ax, L.cB, L.ax, L.arbT, arbOn ? P.teal + 'ff' : P.muted + '88', arbOn ? 2.5 : 1, arbOn ? [] : [4, 5]);
    }
    function bsNode(L, x, y, w, h, key, col, lbl, sub, lit, ly, sy) {
        var hov = hoveredKey === key;
        rr(x, y, w, h, 8, (hov || lit) ? col + '28' : P.surf, col, hov ? 2.5 : 1.5);
        tx(lbl, x + w / 2, ly, L.fsN, col + 'ff', 'center', true);
        tx(sub, x + w / 2, sy, L.fsS, P.sub + 'ff', 'center', false);
        bsBadge(L, x + w - 8, y, key);
    }
    function bsArbiter(L, on) {
        var x = L.ax - L.arbW / 2;
        var hov = hoveredKey === 'ARB';
        rr(x, L.arbT, L.arbW, L.arbH, 6, (hov || on) ? P.teal + '28' : P.surf, P.teal, (hov || on) ? 2 : 1.5);
        tx('ARBITER', L.ax, L.arbT + L.arbH / 2, L.fsN, P.teal + 'ff', 'center', true);
        bsBadge(L, x + L.arbW - 8, L.arbT, 'ARB');
    }
    function bsTrace(pts, col) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = col + '77';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function bsChip(L, x, y, str, col) {
        var cw = bsW(str, L.fsC, true) + 12, ch = L.mob ? 18 : 22;
        rr(x - cw / 2, y - ch / 2, cw, ch, 5, col + 'ff', null, 0);
        tx(str, x, y, L.fsC, '#111111', 'center', true);
    }
    function bsFlow(L, st, idx, tt) {
        var n = st.arrows.length;
        st.arrows.forEach(function (arr, ai) {
            var win = bsWin(n, ai);
            var pts = bsRoute(L, arr);
            var col = P[BS_COL[arr.via]];
            bsTrace(pts, col);
            if (tt < win[0]) return;
            if (ai < n - 1 && tt >= win[1]) return;
            var p = bsAt(pts, ez(seg(tt, win[0], win[1])));
            bsChip(L, p[0], p[1], BS_CHIPS[idx][ai], col);
        });
    }

    /* ===================== 메인 드로우 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var idx = step ? steps.indexOf(step) : -1;
        var st = idx < 0 ? null : step;
        var tt = st && step !== prev ? t : 1;
        var lit = bsLit(st, tt);
        var own = bsOwner(idx, tt);
        var act = st ? st.activeBus : '';
        L.ox = x0;
        L.oy = top;
        ctx.save();
        ctx.translate(x0, top);
        bsPill(L, st ? (idx + 1) + '/' + steps.length + ' ' + st.badge : 'IDLE', st ? P[BS_COL[st.activeBus]] : P.sub);
        bsLanes(L, act);
        bsWires(L, act, !!lit.ARB);
        bsNode(L, 0, L.aT, L.nw, L.cpuH, 'CPU', P.purple, 'CPU', 'Master', lit.CPU, (L.aM + L.dM) / 2, (L.dM + L.cM) / 2);
        bsNode(L, L.memX, L.aM - L.nh / 2, L.nw, L.nh, 'MEM', P.orange, 'MEMORY', 'Slave', lit.MEM, L.aM - L.nh * 0.25, L.aM + L.nh * 0.27);
        bsNode(L, L.ioX, L.cM - L.nh / 2, L.nw, L.nh, 'IO', P.yellow, 'I/O', 'Device', lit.IO, L.cM - L.nh * 0.25, L.cM + L.nh * 0.27);
        bsArbiter(L, lit.ARB);
        if (st) bsFlow(L, st, idx, tt);
        tx('버스 사용권: ' + (own === 'CPU' ? 'CPU' : 'I/O (DMA)'), L.ax, L.arbT + L.arbH + (mob ? 14 : 17), L.fsL, P.text + 'ff', 'center', true);
        ctx.restore();
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
        tipHits.length = 0;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
        if (hoveredKey && typeof TIPS !== 'undefined' && TIPS[hoveredKey]) drawTip(mousePos.x, mousePos.y, TIPS[hoveredKey]);
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
        speedBtns.forEach(function (b) { b.classList.remove('bus-viz__speed-btn--active'); });
        btn.classList.add('bus-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bus-viz__mode-btn--active', d.key === m); });
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
                mousePos: mousePos,
                tooltipHits: tipHits,
                hoveredKey: function () { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();