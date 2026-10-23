/**
 * 메모리 관리 시각화 시각화
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
    var root    = el('div', 'mem-viz');
    var toolbar = el('div', 'mem-viz__toolbar');
    var tbLeft  = el('div', 'mem-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mem-viz__title', 'Memory Management'));

    var modeWrap = el('div', 'mem-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'mem-viz__mode-btn' + (i === 0 ? ' mem-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'mem-viz__speed');
    speedWrap.appendChild(el('span', 'mem-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'mem-viz__speed-btn' + (i === 0 ? ' mem-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'mem-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'mem-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'mem-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'mem-viz__controls');
    var btnPlay  = el('button', 'mem-viz__btn mem-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'mem-viz__btn', '▶| STEP');
    var btnReset = el('button', 'mem-viz__btn', '↺ RESET');
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

    /* ===================== 상수 ===================== */
    const TOTAL_KB = 512;
    const FRAME_KB = 64;
    const N_FRAMES = TOTAL_KB / FRAME_KB;

    function procCol(id) {
        if (id === 'P1') return P.teal;
        if (id === 'P2') return P.purple;
        if (id === 'P3') return P.orange;
        if (id === 'P4') return P.green;
        return P.muted;
    }

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: '초기 상태 — 연속 할당',
            log:   'Step 1 — 512KB의 빈 메모리입니다. 연속 할당(Contiguous Allocation)은 프로세스에 연속된 메모리 공간을 통째로 할당합니다. 단순하지만 단편화 문제가 잠재되어 있습니다.',
            mode:  'bar',
            segs:  [{ id: 'free', size: 512, type: 'free' }],
        },
        {
            badge: 'P1 할당 (128KB)',
            log:   'Step 2 — P1(128KB)이 메모리 앞쪽에 적재됩니다. 연속된 128KB가 P1에 할당되고 나머지 384KB가 여유 공간으로 남습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'free', size: 384, type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P1', freeId: 'free' },
        },
        {
            badge: 'P2 할당 (256KB)',
            log:   'Step 3 — P2(256KB) 추가 할당. P1 바로 뒤에 연속된 256KB를 할당합니다. 남은 여유 공간 128KB. 두 프로세스가 서로 인접해 있습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'P2',   size: 256, type: 'proc' },
                { id: 'free', size: 128, type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P2', freeId: 'free' },
        },
        {
            badge: 'P3 할당 (64KB)',
            log:   'Step 4 — P3(64KB) 추가 할당. 메모리: P1(128) + P2(256) + P3(64) + 여유(64KB). 메모리가 거의 가득 찼고 프로세스들이 연속되어 있습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'P2',   size: 256, type: 'proc' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P3', freeId: 'free' },
        },
        {
            badge: 'P2 종료 → 외부 단편화 ⚠',
            log:   'Step 5 — P2가 종료되어 256KB가 해제됩니다. P1과 P3 사이에 구멍(Hole)이 생깁니다! 외부 단편화(External Fragmentation) 발생: 총 여유 메모리 320KB지만 연속된 최대 공간은 256KB입니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'hole', size: 256, type: 'hole' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            showFrag: true,
        },
        {
            badge: 'P4 요청(320KB) → 실패! ⚠',
            log:   'Step 6 — P4가 320KB를 요청합니다. 총 여유 메모리 320KB로 딱 맞지만, 연속된 최대 공간은 256KB뿐입니다. 외부 단편화로 인해 P4 할당 실패! 압축(Compaction)은 모든 프로세스를 이동시켜야 해 비용이 매우 큽니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'hole', size: 256, type: 'hole' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            showFrag: true,
            showFail: true,
        },
        {
            badge: '페이징으로 해결 ✓',
            log:   'Step 7 — 페이징(Paging) 적용! 물리 메모리를 64KB 프레임 8개로 분할하고, P4(320KB)도 64KB 페이지 5개로 분할합니다. P4의 5개 페이지를 빈 프레임(F2~F5, F7)에 비연속적으로 배치합니다. 외부 단편화 완전 해결 ✓',
            mode:  'paging',
            frames: [
                { n: 0, owner: 'P1', page: 0 },
                { n: 1, owner: 'P1', page: 1 },
                { n: 2, owner: 'P4', page: 0 },
                { n: 3, owner: 'P4', page: 1 },
                { n: 4, owner: 'P4', page: 2 },
                { n: 5, owner: 'P4', page: 3 },
                { n: 6, owner: 'P3', page: 0 },
                { n: 7, owner: 'P4', page: 4 },
            ],
            pagingOk: true,
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = {
        P1: 'Process 1 (128KB)\n메모리 앞쪽 2 프레임(F0·F1)을 점유합니다.',
        P2: 'Process 2 (256KB)\n종료 후 4 프레임이 HOLE(구멍)이 됩니다.',
        P3: 'Process 3 (64KB)\n1 프레임(F6)을 점유합니다.',
        P4: 'Process 4 (320KB)\n연속 할당에서는 실패하지만, 페이징으로 5개 프레임에 분산 배치되어 성공합니다.',
        HOLE: '외부 단편화 구멍 (256KB)\n총 여유 공간에는 포함되지만 연속 공간이 필요한 프로세스는 이 공간을 활용하지 못합니다.',
        FREE: '여유 공간 (64KB)\n아직 할당되지 않은 연속 메모리 영역입니다.'
    };

    /* ===================== 장면 ===================== */
    var MM_REQ = 320;
    var mmOx = 0;
    var mmOy = 0;

    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 메모리 할당과 단편화 과정을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function mmFade(t, a, b) { return ez(seg(t, a, b)); }
    function mmTxtW(str, sz, bold) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? 1 : 0.6;
        return n * sz * (bold ? 1.1 : 1);
    }
    function mmHit(x, y, w, h, key) { tipHit(x + mmOx, y + mmOy, w, h, key); }
    function mmYOf(L, v) { return L.colY + v / TOTAL_KB * L.colH; }
    function mmRegions(st) {
        var out = [], acc = 0;
        st.segs.forEach(function (g) {
            out.push({ id: g.id, type: g.type, size: g.size, s: acc, e: acc + g.size });
            acc += g.size;
        });
        return out;
    }
    function mmFind(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }
    function mmReplOf(pr, cur, r) {
        for (var i = 0; i < pr.length; i++) {
            var q = pr[i];
            if (!mmFind(cur, q.id) && q.s === r.s && q.e === r.e) return q;
        }
        return null;
    }
    function mmStyleAt(list, kb) {
        for (var i = 0; i < list.length; i++) if (kb >= list[i].s && kb < list[i].e) return list[i];
        return null;
    }
    function mmSums(st) {
        var free = 0, maxC = 0;
        st.segs.forEach(function (g) {
            if (g.type === 'proc') return;
            free += g.size;
            if (g.size > maxC) maxC = g.size;
        });
        return { free: free, maxC: maxC };
    }
    function mmFrameAt(st, n) {
        for (var i = 0; i < st.frames.length; i++) if (st.frames[i].n === n) return st.frames[i];
        return null;
    }
    function mmP4List(st) {
        return st.frames.filter(function (f) { return f.owner === 'P4'; });
    }
    function mmPgStart(j) { return 0.2 + 0.1 * j; }
    function mmPgEnd(j) { return mmPgStart(j) + 0.35; }
    function mmTrack(t, pts) {
        for (var i = 0; i < pts.length - 1; i++) {
            var a = pts[i], b = pts[i + 1];
            if (t <= b[0]) {
                var u = ez(seg(t, a[0], b[0]));
                return [lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
            }
        }
        var z = pts[pts.length - 1];
        return [z[1], z[2]];
    }
    function mmChipOrigin(L) {
        if (L.mob) return { x: L.colX + L.colW / 2, y: L.colY + L.colH + 14 };
        return { x: L.pX + L.pW - 70, y: L.colY - 14 };
    }
    function mmPgOrigin(L, j) {
        var pad = L.mob ? 8 : 14;
        if (L.mob) {
            var cw = Math.floor((L.pW - pad * 2 - 12) / 3);
            return { x: L.pX + pad + (j % 3) * (cw + 6) + cw / 2, y: L.failY + 35 + Math.floor(j / 3) * 22 };
        }
        return { x: L.pX + pad + 50, y: L.failY + 34 + j * 18 };
    }
    function mmHatch(x, y, w, h, col) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, w - 2, h - 2);
        ctx.clip();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        for (var sx = x - h; sx < x + w + h; sx += 10) {
            ctx.beginPath();
            ctx.moveTo(sx, y);
            ctx.lineTo(sx + h, y + h);
            ctx.stroke();
        }
        ctx.restore();
    }
    function mmBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        mmHit(cx - 10, cy - 10, 20, 20, key);
    }
    function mmChip(x, y, txt, col, a, fs) {
        if (a <= 0.02) return;
        var cw = mmTxtW(txt, fs, true) + 14;
        ctx.globalAlpha = a;
        rr(x - cw / 2, y - 10, cw, 20, 10, col + 'ff');
        tx(txt, x, y, fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function mmBlock(L, r, y, h, a) {
        if (a <= 0.02 || h < 0.5) return;
        var x = L.colX, w = L.colW;
        var key = r.type === 'proc' ? r.id : (r.type === 'hole' ? 'HOLE' : 'FREE');
        var hov = hoveredKey === key;
        var col = r.type === 'proc' ? procCol(r.id) : (r.type === 'hole' ? P.red : P.muted);
        var lc = r.type === 'proc' ? col : (r.type === 'hole' ? P.red : P.sub);
        var fsN = L.mob ? 12 : 14, fsS = L.mob ? 11 : 12;
        ctx.globalAlpha = a;
        if (r.type === 'proc') rr(x, y, w, h, 4, col + '30', col, hov ? 3 : 2);
        else if (r.type === 'hole') { rr(x, y, w, h, 4, P.red + '14', P.red, hov ? 3 : 2.5); mmHatch(x, y, w, h, P.red + '40'); }
        else rr(x, y, w, h, 4, P.surf2, hov ? P.purple + 'ff' : P.border, hov ? 2 : 1);
        var lab = r.type === 'proc' ? r.id : (r.type === 'hole' ? 'HOLE' : 'FREE');
        var sz = r.size + 'KB';
        if (h >= 34) {
            tx(lab, x + w / 2, y + h / 2 - 7, fsN, lc + 'ff', 'center', true);
            tx(sz, x + w / 2, y + h / 2 + 9, fsS, (r.type === 'proc' ? P.sub : lc) + 'ff', 'center', false);
        } else if (h >= 13) {
            tx(lab + ' · ' + sz, x + w / 2, y + h / 2, fsS, lc + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
        mmHit(x, y, w, h, key);
    }
    function mmFrameCell(L, y, h, st, label, a) {
        if (a <= 0.01) return;
        var x = L.colX, w = L.colW;
        var col = st.type === 'proc' ? procCol(st.id) : (st.type === 'hole' ? P.red : P.muted);
        var lc = st.type === 'proc' ? col : (st.type === 'hole' ? P.red : P.sub);
        ctx.globalAlpha = a;
        if (st.type === 'proc') rr(x + 1, y + 1, w - 2, h - 2, 3, col + '30', col, 1.5);
        else if (st.type === 'hole') { rr(x + 1, y + 1, w - 2, h - 2, 3, P.red + '14', P.red, 1.5); mmHatch(x + 1, y + 1, w - 2, h - 2, P.red + '40'); }
        else rr(x + 1, y + 1, w - 2, h - 2, 3, P.surf2, P.border, 1);
        tx(label, x + w / 2, y + h / 2, L.mob ? 11 : 12, lc + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        if (mob) {
            var mpY = 36 + 150 + 34;
            return { mob: true, colX: 40, colY: 36, colW: w - 40, colH: 150,
                pX: 0, pY: mpY, pW: w, statH: 52,
                failY: mpY + 60, failH: 70, okY: mpY + 138, okH: 40, h: mpY + 186 };
        }
        var dpX = 56 + 220 + 40;
        return { mob: false, colX: 56, colY: 36, colW: 220, colH: 320,
            pX: dpX, pY: 36, pW: w - dpX, statH: 70,
            failY: 120, failH: 124, okY: 254, okH: 40, h: 376 };
    }
    function sceneH(w, mob) { return layout(w, mob).h; }

    /* ===================== 패널 ===================== */
    function mmStat(L, st, a) {
        if (a <= 0) return;
        var pad = L.mob ? 10 : 14, fsS = L.mob ? 11 : 12, fsM = L.mob ? 12 : 14;
        var x = L.pX, y = L.pY, w = L.pW, h = L.statH;
        ctx.globalAlpha = a;
        if (st.mode === 'paging') {
            rr(x, y, w, h, 6, P.surf, P.border, 1);
            tx('물리 메모리: 64KB 프레임 8개', x + w / 2, y + h / 2, fsM, P.sub + 'ff', 'center', true);
        } else if (st.showFrag) {
            var sm = mmSums(st);
            var ty = y + (L.mob ? 14 : 16), vy = y + h - (L.mob ? 15 : 18);
            var tlab = '⚠ 외부 단편화';
            rr(x, y, w, h, 6, P.red + '12', P.red + '88', 1.5);
            tx(tlab, x + pad, ty, fsS, P.red + 'ff', 'left', true);
            mmBadge(x + pad + mmTxtW(tlab, fsS, true) + 12, ty, 'HOLE');
            ln(x + w / 2, y + 8, x + w / 2, y + h - 8, P.red + '44', 1);
            tx('총 여유 ' + sm.free + 'KB', x + w * 0.25, vy, fsM, P.orange + 'ff', 'center', true);
            tx('최대 연속 ' + sm.maxC + 'KB', x + w * 0.75, vy, fsM, P.red + 'ff', 'center', true);
        } else {
            rr(x, y, w, h, 6, P.surf, P.border, 1);
            tx('여유 공간 ' + mmSums(st).free + 'KB', x + w / 2, y + h / 2, fsM, P.sub + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
    }
    function mmFailBox(L, maxC, a) {
        if (a <= 0) return;
        var pad = L.mob ? 8 : 14, fsS = L.mob ? 11 : 12;
        var x = L.pX, y = L.failY, w = L.pW, h = L.failH;
        var inner = w - pad * 2;
        var bh = L.mob ? 22 : 30, gap = L.mob ? 8 : 12;
        var y0 = y + (h - (bh * 2 + gap)) / 2;
        ctx.globalAlpha = a;
        rr(x, y, w, h, 6, P.surf, P.red + '88', 1.5);
        rr(x + pad, y0, inner, bh, 4, P.green + '30', P.green + 'ff', 1.5);
        tx('P4 필요 ' + MM_REQ + 'KB', x + pad + 8, y0 + bh / 2, fsS, P.green + 'ff', 'left', true);
        rr(x + pad, y0 + bh + gap, inner * maxC / MM_REQ, bh, 4, P.red + '30', P.red + 'ff', 1.5);
        tx('최대 연속 ' + maxC + 'KB', x + pad + 8, y0 + bh + gap + bh / 2, fsS, P.red + 'ff', 'left', true);
        ctx.globalAlpha = 1;
    }
    function mmOkBox(L, rows, col, a) {
        if (a <= 0) return;
        var x = L.pX, y = L.okY, w = L.pW, h = L.okH;
        var fs = L.mob ? 11 : 12, gap = fs + 4, n = rows.length;
        ctx.globalAlpha = a;
        rr(x, y, w, h, 6, col + '18', col + 'aa', 1.5);
        rows.forEach(function (txt, i) {
            tx(txt, x + w / 2, y + h / 2 + (i - (n - 1) / 2) * gap, fs, col + 'ff', 'center', true);
        });
        ctx.globalAlpha = 1;
    }
    function mmTable(L, st, tt, a) {
        if (a <= 0) return;
        var pad = L.mob ? 8 : 14, fsS = L.mob ? 11 : 12;
        var x = L.pX, y = L.failY, w = L.pW, h = L.failH;
        var p4 = mmP4List(st);
        var cw = Math.floor((w - pad * 2 - 12) / 3);
        var ttl = 'P4 페이지 테이블';
        ctx.globalAlpha = a;
        rr(x, y, w, h, 6, P.green + '10', P.green + '88', 1.5);
        tx(ttl, x + pad, y + 14, fsS, P.green + 'ff', 'left', true);
        mmBadge(x + pad + mmTxtW(ttl, fsS, true) + 12, y + 14, 'P4');
        for (var j = 0; j < p4.length; j++) {
            var fr = p4[j];
            var o = mmPgOrigin(L, j);
            ctx.globalAlpha = a * mmFade(tt, mmPgEnd(j) - 0.03, mmPgEnd(j) + 0.05);
            if (L.mob) {
                rr(o.x - cw / 2, o.y - 9, cw, 18, 9, P.surf2, P.green + 'cc', 1.2);
                tx('p' + fr.page + ' → F' + fr.n, o.x, o.y, fsS, P.green + 'ff', 'center', true);
            } else {
                tx('p' + fr.page, o.x, o.y, fsS, P.green + 'ff', 'center', true);
                tx('→', o.x + 70, o.y, fsS, P.sub + 'ff', 'center', false);
                tx('F' + fr.n, o.x + 130, o.y, fsS, P.green + 'ff', 'center', true);
            }
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 막대 장면 ===================== */
    function mmBars(L, st, pv, tt) {
        var cur = mmRegions(st);
        var pr = pv && pv.segs ? mmRegions(pv) : null;
        var u = mmFade(tt, 0.35, 1);
        var a;
        if (!pr) {
            cur.forEach(function (r) { mmBlock(L, r, mmYOf(L, r.s), mmYOf(L, r.e) - mmYOf(L, r.s), 1); });
            return;
        }
        cur.forEach(function (r) { r.old = mmFind(pr, r.id); r.rep = r.old ? null : mmReplOf(pr, cur, r); });
        pr.forEach(function (q) { q.gone = !mmFind(cur, q.id); q.by = null; });
        cur.forEach(function (r) { if (r.rep) r.rep.by = r; });
        pr.forEach(function (q) {
            if (!q.gone) return;
            a = q.by ? 1 - mmFade(tt, 0.3, 1) : 1 - mmFade(tt, 0, 0.4);
            mmBlock(L, q, mmYOf(L, q.s), mmYOf(L, q.e) - mmYOf(L, q.s), a);
        });
        cur.forEach(function (r) {
            var ss, ee, al = 1;
            if (r.old) { ss = lerp(r.old.s, r.s, u); ee = lerp(r.old.e, r.e, u); }
            else if (r.rep) { ss = r.s; ee = r.e; al = mmFade(tt, 0.3, 1); }
            else { ss = r.s; ee = lerp(r.s, r.e, u); }
            mmBlock(L, r, mmYOf(L, ss), mmYOf(L, ee) - mmYOf(L, ss), al);
        });
    }
    function mmFlights(L, st, pv, tt) {
        var fsC = L.mob ? 11 : 12;
        var cx = L.colX + L.colW / 2, ch = L.colH / 8;
        var j, s0, e0, o, fr, q;
        if (st.mode === 'paging') {
            var p4 = mmP4List(st);
            for (j = 0; j < p4.length; j++) {
                s0 = mmPgStart(j); e0 = mmPgEnd(j);
                if (tt < s0 || tt >= e0) continue;
                fr = p4[j];
                o = mmPgOrigin(L, j);
                q = ez(seg(tt, s0, e0));
                mmChip(lerp(o.x, cx, q), lerp(o.y, L.colY + (fr.n + 0.5) * ch, q), 'p' + fr.page, P.green, 1, fsC);
            }
            return;
        }
        if (!pv || !pv.segs) return;
        var cur = mmRegions(st), pr = mmRegions(pv);
        var o0 = mmChipOrigin(L);
        cur.forEach(function (r) {
            if (r.type !== 'proc' || mmFind(pr, r.id) || mmReplOf(pr, cur, r) || tt >= 0.42) return;
            var dy = mmYOf(L, (r.s + r.e) / 2);
            var pos = mmTrack(tt, [[0, o0.x, o0.y], [0.35, cx, dy]]);
            mmChip(pos[0], pos[1], r.id + ' · ' + r.size + 'KB', procCol(r.id), tt < 0.35 ? 1 : 1 - mmFade(tt, 0.35, 0.42), fsC);
        });
        var hole = mmFind(cur, 'hole');
        if (st.showFail && !pv.showFail && hole) {
            var hy = mmYOf(L, (hole.s + hole.e) / 2);
            if (tt < 0.82) {
                var pf = mmTrack(tt, [[0, o0.x, o0.y], [0.4, cx, hy], [0.55, cx, hy], [0.8, o0.x, o0.y]]);
                mmChip(pf[0], pf[1], 'P4 · ' + MM_REQ + 'KB', P.green, 1, fsC);
            }
            var ra = mmFade(tt, 0.4, 0.5) * (1 - mmFade(tt, 0.85, 1));
            if (ra > 0) {
                ctx.globalAlpha = ra;
                rr(L.colX - 2, mmYOf(L, hole.s) - 2, L.colW + 4, mmYOf(L, hole.e) - mmYOf(L, hole.s) + 4, 6, null, P.red, 3);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 페이징 장면 ===================== */
    function mmPagingCells(L, st, pv, tt) {
        var ch = L.colH / 8, n, fr, j, pst, y0, a;
        var pr = pv && pv.segs ? mmRegions(pv) : null;
        var p4 = mmP4List(st);
        for (n = 0; n < 8; n++) {
            fr = mmFrameAt(st, n);
            y0 = L.colY + n * ch;
            j = p4.indexOf(fr);
            pst = pr ? mmStyleAt(pr, n * FRAME_KB + FRAME_KB / 2) : null;
            if (pst && j >= 0 && !(pst.type === 'proc' && pst.id === 'P4')) {
                a = mmFade(tt, mmPgEnd(j) - 0.03, mmPgEnd(j) + 0.05);
                mmFrameCell(L, y0, ch, pst, 'F' + n + ' ' + (pst.type === 'hole' ? 'HOLE' : 'FREE'), 1 - a);
                mmFrameCell(L, y0, ch, { type: 'proc', id: 'P4' }, 'F' + n + ' · P4 · p' + fr.page, a);
            } else {
                mmFrameCell(L, y0, ch, { type: 'proc', id: fr.owner }, 'F' + n + ' · ' + fr.owner + ' · p' + fr.page, 1);
            }
            mmHit(L.colX, y0, L.colW, ch, fr.owner);
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var st = step || currentSteps()[0];
        var pv = prev || null;
        var tt = pv ? t : 1;
        var fsS = mob ? 11 : 12;
        var pc = st.showFail ? P.red : (st.showFrag ? P.orange : (st.pagingOk ? P.green : P.teal));
        var bw = mmTxtW(st.badge, fsS, true) + 18;
        var failSrc = null, failA = 0, k, swap, sc;
        if (st.showFail) { failSrc = st; failA = pv && pv.showFail ? 1 : mmFade(tt, 0.4, 0.85); }
        else if (pv && pv.showFail) { failSrc = pv; failA = 1 - mmFade(tt, 0, 0.3); }
        mmOx = x0;
        mmOy = top;
        ctx.save();
        ctx.translate(x0, top);
        rr(0, 0, bw, 22, 11, pc + '33', pc + 'ff', 1.5);
        tx(st.badge, bw / 2, 11, fsS, pc + 'ff', 'center', true);
        rr(L.colX - 2, L.colY - 2, L.colW + 4, L.colH + 4, 6, null, P.border, 1);
        [0, 128, 256, 384, 512].forEach(function (kb) {
            var yy = mmYOf(L, kb);
            ln(L.colX - 6, yy, L.colX - 2, yy, P.border, 1);
            tx(kb + 'K', L.colX - 8, yy, fsS, P.sub, 'right', false);
        });
        if (st.mode === 'paging') mmPagingCells(L, st, pv, tt);
        else mmBars(L, st, pv, tt);

        swap = pv && (st.mode === 'paging' ? pv.mode !== 'paging' : (st.showFrag && !pv.showFrag));
        k = swap ? (st.mode === 'paging' ? mmFade(tt, 0.3, 0.6) : mmFade(tt, 0.5, 0.9)) : 1;
        if (swap) mmStat(L, pv, 1 - k);
        mmStat(L, st, k);
        if (st.mode === 'paging') mmTable(L, st, tt, pv && pv.mode === 'paging' ? 1 : mmFade(tt, 0.2, 0.5));
        if (failA > 0) {
            sc = mmSums(failSrc);
            mmFailBox(L, sc.maxC, failA);
            mmOkBox(L, [MM_REQ + 'KB > ' + sc.maxC + 'KB → 할당 불가!'], P.red, failA);
        }
        if (st.mode === 'paging' && st.pagingOk) {
            mmOkBox(L, L.mob ? ['✓ 비연속 할당 성공', '외부 단편화 해결'] : ['✓ 비연속 할당 성공 — 외부 단편화 해결'], P.green, mmFade(tt, 0.9, 1));
        }
        mmFlights(L, st, pv, tt);
        ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('mem-viz__speed-btn--active'); });
        btn.classList.add('mem-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('mem-viz__mode-btn--active', d.key === m); });
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