/**
 * 교착 상태 시각화 시각화
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
    var root    = el('div', 'dl-viz');
    var toolbar = el('div', 'dl-viz__toolbar');
    var tbLeft  = el('div', 'dl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dl-viz__title', 'Deadlock'));

    var modeWrap = el('div', 'dl-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dl-viz__mode-btn' + (i === 0 ? ' dl-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dl-viz__speed');
    speedWrap.appendChild(el('span', 'dl-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dl-viz__speed-btn' + (i === 0 ? ' dl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dl-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dl-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dl-viz__controls');
    var btnPlay  = el('button', 'dl-viz__btn dl-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dl-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dl-viz__btn', '↺ RESET');
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

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: '초기 상태',
            log:   'Step 1 — P1·P2 두 프로세스, R1·R2 두 자원이 있습니다. 아직 어떤 자원도 할당되지 않았습니다. 자원 할당 그래프(RAG)에 간선이 없습니다.',
            alloc: {}, request: {}, cycle: false, resolved: false, conditions: [],
        },
        {
            badge: 'P1: R1 획득',
            log:   'Step 2 — P1이 R1을 획득합니다. R1→P1 할당 간선이 생깁니다. 【조건 1: 상호 배제】 R1은 P1만 사용할 수 있습니다.',
            alloc: { R1: 'P1' }, request: {}, cycle: false, resolved: false,
            conditions: ['상호 배제'],
            animEdge: { type: 'alloc', from: 'R1', to: 'P1' },
        },
        {
            badge: 'P2: R2 획득',
            log:   'Step 3 — P2가 R2를 획득합니다. R2→P2 할당 간선 추가. 【조건 2: 점유와 대기】 각 프로세스가 자원을 보유한 채 추가 자원을 요청할 준비가 됩니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: {}, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기'],
            animEdge: { type: 'alloc', from: 'R2', to: 'P2' },
        },
        {
            badge: 'P1: R2 요청 → 대기',
            log:   'Step 4 — P1이 R2를 추가 요청합니다. R2는 P2가 보유 중이므로 P1은 대기합니다. P1→R2 요청 간선(점선) 추가. 【조건 3: 비선점】 P2가 자발적으로 반납 전까지 R2를 빼앗을 수 없습니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2' }, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점'],
            animEdge: { type: 'req', from: 'P1', to: 'R2' },
        },
        {
            badge: 'P2: R1 요청 → 대기',
            log:   'Step 5 — P2도 R1을 추가 요청합니다. R1은 P1이 보유 중이므로 P2도 대기합니다. P2→R1 요청 간선 추가. 【조건 4: 순환 대기】 P1→R2→P2→R1→P1 사이클이 형성됩니다!',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2', P2: 'R1' }, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점', '순환 대기'],
            animEdge: { type: 'req', from: 'P2', to: 'R1' },
        },
        {
            badge: '교착 상태 발생! ⚠',
            log:   'Step 6 — 교착 상태! 4조건이 모두 성립했습니다. P1은 R2를, P2는 R1을 기다리며 영원히 진행되지 못합니다. 사이클이 존재합니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2', P2: 'R1' }, cycle: true, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점', '순환 대기'],
        },
        {
            badge: '해결: Lock 순서 통일',
            log:   'Step 7 — 순환 대기 조건을 제거합니다. 모든 프로세스가 자원을 R1→R2 오름차순으로만 요청하도록 강제합니다. P1은 R1을 보유한 채 R2를 요청하고, P2는 R1부터 요청하며 대기합니다. R2가 비어 있어 P1이 완료·반납하면 P2가 진행되어 사이클이 형성되지 않습니다. 교착 상태 예방 ✓',
            alloc: { R1: 'P1' }, request: { P1: 'R2', P2: 'R1' }, cycle: false, resolved: true,
            conditions: ['상호 배제', '점유와 대기', '비선점'],
            resolveNote: 'R1 → R2 순서 통일',
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = {
        P1: 'Process 1\n자원 R1을 보유하고 R2를 요청하는 프로세스입니다. 교착 상태에서 R2가 해제될 때까지 영원히 대기합니다.',
        P2: 'Process 2\n자원 R2를 보유하고 R1을 요청하는 프로세스입니다. R1은 P1이 보유 중이어서 진행 불가입니다.',
        R1: 'Resource 1\n단일 인스턴스 자원입니다. P1이 보유 중이며 P2가 요청하고 있습니다. 비선점 조건으로 강제 회수 불가합니다.',
        R2: 'Resource 2\n단일 인스턴스 자원입니다. P2가 보유 중이며 P1이 요청하고 있습니다. 자원 할당 그래프에서 사이클의 일부입니다.'
    };
    var DL_CHIPS = ['상호 배제', '점유와 대기', '비선점', '순환 대기'];
    var DL_LAP = [['P1', 'R2'], ['R2', 'P2'], ['P2', 'R1'], ['R1', 'P1']];

    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 교착 상태 발생 과정을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function dlW(str, fs) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 127 ? fs : fs * 0.6;
        return n;
    }
    function layout(w, mob) {
        var chipH = mob ? 24 : 30;
        var gY = (mob ? 2 * chipH + 6 : chipH) + 14;
        var gH = mob ? 196 : 270;
        var cx = w / 2;
        return {
            mob: mob, chipH: chipH, gY: gY, gH: gH,
            r: mob ? 20 : 26, hw: mob ? 34 : 46, hh: mob ? 18 : 20,
            xL: mob ? 60 : cx - 180, xR: mob ? w - 60 : cx + 180,
            yT: gY + (mob ? 52 : 64), yB: gY + gH - (mob ? 34 : 44),
            fs: mob ? 11 : 12, fsB: mob ? 13 : 15,
            stY: gY + gH + 8, total: gY + gH + 48
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function dlPos(L, key) {
        if (key === 'P1') return { x: L.xL, y: L.yT };
        if (key === 'R2') return { x: L.xR, y: L.yT };
        if (key === 'P2') return { x: L.xR, y: L.yB };
        return { x: L.xL, y: L.yB };
    }
    function dlOff(L, key, ux, uy, gap) {
        if (key.charAt(0) === 'P') return { x: ux * (L.r + gap), y: uy * (L.r + gap) };
        var kx = Math.abs(ux) < 0.000001 ? Infinity : L.hw / Math.abs(ux);
        var ky = Math.abs(uy) < 0.000001 ? Infinity : L.hh / Math.abs(uy);
        var t = Math.min(kx, ky) + gap;
        return { x: ux * t, y: uy * t };
    }
    function dlSeg(L, from, to) {
        var a = dlPos(L, from), b = dlPos(L, to);
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var o1 = dlOff(L, from, ux, uy, 3), o2 = dlOff(L, to, -ux, -uy, 4);
        return { x1: a.x + o1.x, y1: a.y + o1.y, x2: b.x + o2.x, y2: b.y + o2.y };
    }
    function dlHead(L, ed, prog) {
        var sg = dlSeg(L, ed.from, ed.to);
        return { x: sg.x1 + (sg.x2 - sg.x1) * prog, y: sg.y1 + (sg.y2 - sg.y1) * prog };
    }
    function dlEdges(st) {
        var m = {};
        Object.keys(st.alloc).forEach(function (res) {
            m['alloc:' + res + '>' + st.alloc[res]] = { kind: 'alloc', from: res, to: st.alloc[res] };
        });
        Object.keys(st.request).forEach(function (proc) {
            m['req:' + proc + '>' + st.request[proc]] = { kind: 'req', from: proc, to: st.request[proc] };
        });
        return m;
    }
    function dlProcCol(k) { return k === 'P1' ? P.teal : P.purple; }
    function dlResCol(k) { return k === 'R1' ? P.orange : P.green; }
    function dlOn(st, c) { return (st.conditions || []).indexOf(c) !== -1; }
    function dlChipCol(st, c) {
        if ((st.conditions || []).length === 4 && !st.resolved) return P.red;
        return dlOn(st, c) ? P.green : P.sub;
    }
    function dlRedA(s, p, fresh, e) {
        if (!fresh) return s.cycle ? 1 : 0;
        if (s.cycle && !p.cycle) return ez(seg(e, 0, 0.3));
        if (!s.cycle && p.cycle) return 1 - ez(seg(e, 0, 0.3));
        return s.cycle ? 1 : 0;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function dlChip(L, x, y, cw, c, on, col, a) {
        if (a <= 0.01) return;
        ctx.globalAlpha = a;
        rr(x, y, cw, L.chipH, 6, col + '22', col + 'bb', 1.4);
        circ(x + 12, y + L.chipH / 2, 4, on ? col + 'ff' : 'none', col + 'ff', 1.2);
        tx(c, x + 22, y + L.chipH / 2, L.fs, col + 'ff', 'left', on);
        ctx.globalAlpha = 1;
    }
    function dlPill(x, y, lab, col) {
        var pw = dlW(lab, 11) + 12;
        rr(x - pw / 2, y - 8, pw, 16, 8, col + 'ff', col + 'ff', 1);
        tx(lab, x, y, 11, '#111111', 'center', true);
    }
    function dlLine(L, ed, col, lw, dashed, prog, alpha) {
        if (alpha <= 0.01) return;
        var sg = dlSeg(L, ed.from, ed.to);
        var hd = dlHead(L, ed, prog);
        ctx.globalAlpha = alpha;
        if (prog >= 0.999) arrow(sg.x1, sg.y1, sg.x2, sg.y2, col, lw, dashed ? [6, 5] : []);
        else ln(sg.x1, sg.y1, hd.x, hd.y, col, lw, dashed ? [6, 5] : []);
        ctx.globalAlpha = 1;
    }
    function dlEdgeDraw(L, ed, col, prog, alpha, redA) {
        if (redA < 1) dlLine(L, ed, col + 'ff', 2, ed.kind === 'req', prog, alpha * (1 - redA));
        if (redA > 0) dlLine(L, ed, P.red + 'ff', 3, false, prog, alpha * redA);
    }
    function dlCenter(L, w, items, alpha) {
        var maxW = L.xR - L.xL - 16;
        var blocks = items.map(function (it) { return { it: it, rows: lines(it.s, maxW, it.fs) }; });
        var total = -6;
        blocks.forEach(function (b) { total += b.rows.length * (b.it.fs + 5) + 6; });
        var y = (L.yT + L.yB) / 2 - total / 2;
        ctx.globalAlpha = alpha;
        blocks.forEach(function (b) {
            b.rows.forEach(function (row) {
                tx(row, w / 2, y + (b.it.fs + 5) / 2, b.it.fs, b.it.col + 'ff', 'center', b.it.bold);
                y += b.it.fs + 5;
            });
            y += 6;
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var idle = !step;
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var sE = dlEdges(s), pE = dlEdges(p);
        var animKey = fresh && s.animEdge ? s.animEdge.type + ':' + s.animEdge.from + '>' + s.animEdge.to : '';
        var redA = dlRedA(s, p, fresh, e);
        var hot = redA > 0.5;
        var badgeCol = idle ? P.sub : s.cycle ? P.red : s.resolved ? P.green : P.purple;
        var keys = {};
        Object.keys(sE).forEach(function (k) { keys[k] = true; });
        Object.keys(pE).forEach(function (k) { keys[k] = true; });

        ctx.save();
        ctx.translate(x0, top);

        Object.keys(keys).forEach(function (k) {
            var inS = !!sE[k];
            var ed = inS ? sE[k] : pE[k];
            var col = ed.kind === 'alloc' ? dlResCol(ed.from) : dlProcCol(ed.from);
            var prog = 1, alpha = 1;
            if (k === animKey) prog = ez(seg(e, 0, 0.7));
            else if (fresh && !inS) alpha = 1 - ez(seg(e, 0, 0.6));
            dlEdgeDraw(L, ed, col, prog, alpha, redA);
            if (k === animKey && prog > 0.02 && prog < 0.98) {
                var hd = dlHead(L, ed, prog);
                dlPill(hd.x, hd.y, ed.kind === 'alloc' ? '할당' : '요청', col);
            }
        });

        if (fresh && s.cycle) {
            var lf = seg(e, 0.45, 1);
            if (lf > 0 && lf < 1) {
                var seq = lf * DL_LAP.length;
                var k2 = Math.min(DL_LAP.length - 1, Math.floor(seq));
                var lg = dlSeg(L, DL_LAP[k2][0], DL_LAP[k2][1]);
                var u = seq - k2;
                circ(lg.x1 + (lg.x2 - lg.x1) * u, lg.y1 + (lg.y2 - lg.y1) * u, 6, P.yellow + 'ff', '#111111', 1.5);
            }
        }

        ['P1', 'P2', 'R1', 'R2'].forEach(function (key) {
            var pos = dlPos(L, key);
            var hov = hoveredKey === key;
            var isProc = key.charAt(0) === 'P';
            var col = hot ? P.red : isProc ? dlProcCol(key) : dlResCol(key);
            var txtCol = hot ? P.red : P.text;
            if (isProc) {
                circ(pos.x, pos.y, L.r, col + '33', (hov ? P.purple : col) + 'ff', hot ? 3 : 2);
                tx(key, pos.x, pos.y, L.fsB, txtCol + 'ff', 'center', true);
            } else {
                var holder = s.alloc[key];
                rr(pos.x - L.hw, pos.y - L.hh, L.hw * 2, L.hh * 2, 8, col + '22', (hov ? P.purple : col) + 'ff', hot ? 3 : 2);
                tx(key, pos.x, pos.y - (L.mob ? 7 : 8), L.fsB, txtCol + 'ff', 'center', true);
                tx(holder ? '보유: ' + holder : '비어 있음', pos.x, pos.y + (L.mob ? 9 : 11), L.fs, (holder ? txtCol : P.sub) + 'ff', 'center', false);
            }
        });

        var cw = L.mob ? (w - 6) / 2 : (w - 30) / 4;
        DL_CHIPS.forEach(function (c, i) {
            var x = L.mob ? (i % 2) * (cw + 6) : i * (cw + 10);
            var y = L.mob ? Math.floor(i / 2) * (L.chipH + 6) : 0;
            var cs = dlChipCol(s, c), cp = dlChipCol(p, c);
            var a = fresh && cp !== cs ? ez(seg(e, i * 0.12, i * 0.12 + 0.5)) : 1;
            if (a < 1) dlChip(L, x, y, cw, c, dlOn(p, c), cp, 1 - a);
            dlChip(L, x, y, cw, c, dlOn(s, c), cs, a);
        });

        var bt = idle ? 'IDLE' : s.badge;
        var bw = dlW(bt, L.fs) + 22;
        rr(w / 2 - bw / 2, L.gY, bw, 18, 9, badgeCol + '22', badgeCol + 'bb', 1.4);
        tx(bt, w / 2, L.gY + 9, L.fs, badgeCol + 'ff', 'center', true);

        var cAlpha = fresh && (s.cycle !== p.cycle || s.resolved !== p.resolved) ? ez(seg(e, 0.3, 0.9)) : 1;
        if (s.cycle) dlCenter(L, w, [{ s: '⚠ 교착 상태 — 사이클 검출', fs: L.fsB - 1, col: P.red, bold: true }], cAlpha);
        if (s.resolved) dlCenter(L, w, [
            { s: '✓ 교착 상태 예방', fs: L.fsB - 1, col: P.green, bold: true },
            { s: s.resolveNote || '', fs: L.fs, col: P.sub, bold: false }
        ], cAlpha);

        ['P1', 'P2'].forEach(function (pr, i) {
            var held = Object.keys(s.alloc).filter(function (r) { return s.alloc[r] === pr; });
            var wait = s.request[pr];
            tx(pr + '   보유: ' + (held.length ? held.join(', ') : '없음') + '   대기: ' + (wait || '없음'),
                w / 2, L.stY + 9 + i * 20, L.fs, (s.cycle ? P.red : P.text) + 'ff', 'center', false);
        });

        ctx.restore();

        ['P1', 'P2'].forEach(function (k) {
            var pos = dlPos(L, k);
            tipBadge(x0 + pos.x + L.r * 0.75, top + pos.y - L.r * 0.75, k);
        });
        ['R1', 'R2'].forEach(function (k) {
            var pos = dlPos(L, k);
            tipBadge(x0 + pos.x + L.hw - 8, top + pos.y - L.hh + 8, k);
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
        speedBtns.forEach(function (b) { b.classList.remove('dl-viz__speed-btn--active'); });
        btn.classList.add('dl-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dl-viz__mode-btn--active', d.key === m); });
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