/**
 * 캐시 메모리 인터랙티브 시각화
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
    var root    = el('div', 'cache-viz');
    var toolbar = el('div', 'cache-viz__toolbar');
    var tbLeft  = el('div', 'cache-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cache-viz__title', 'Cache Memory'));

    var modeWrap = el('div', 'cache-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cache-viz__mode-btn' + (i === 0 ? ' cache-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cache-viz__speed');
    speedWrap.appendChild(el('span', 'cache-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cache-viz__speed-btn' + (i === 0 ? ' cache-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cache-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cache-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cache-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cache-viz__controls');
    var btnPlay  = el('button', 'cache-viz__btn cache-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cache-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cache-viz__btn', '↺ RESET');
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
        CPU:    'CPU\nCache에 데이터를 요청하는 프로세서',
        CACHE:  'Cache Memory\nCPU와 RAM 사이의 초고속 임시 저장소',
        MEM:    'Main Memory (RAM)\n실제 데이터가 저장된 주기억장치',
        HIT:    'Cache Hit\n요청 데이터가 캐시에 존재 — 빠름',
        MISS:   'Cache Miss\n요청 데이터가 캐시에 없음 — RAM 접근 필요',
        LRU:    'LRU 교체\n가장 오래 사용 안 한 슬롯을 새 데이터로 교체',
    };

    /* ===================== 시나리오 정의 ===================== */
    const MEM_BLOCKS = ['A','B','C','D','E','F','G','H'];

    const STEPS = [
        {
            req: 'A', hit: false, load: 'A', evict: null,
            badge: 'MISS #1',
            log: 'Step 1 — CPU가 블록 A 요청. 캐시 미스! 메인 메모리에서 A를 가져와 슬롯 0에 적재합니다.',
        },
        {
            req: 'B', hit: false, load: 'B', evict: null,
            badge: 'MISS #2',
            log: 'Step 2 — CPU가 블록 B 요청. 캐시 미스! 메인 메모리에서 B를 가져와 슬롯 1에 적재합니다.',
        },
        {
            req: 'A', hit: true, load: null, evict: null,
            badge: 'HIT #1',
            log: 'Step 3 — CPU가 블록 A 재요청. 캐시 히트! 메인 메모리 접근 없이 슬롯 0에서 즉시 반환합니다.',
        },
        {
            req: 'C', hit: false, load: 'C', evict: null,
            badge: 'MISS #3',
            log: 'Step 4 — CPU가 블록 C 요청. 캐시 미스! 메인 메모리에서 C를 가져와 슬롯 2에 적재합니다.',
        },
        {
            req: 'D', hit: false, load: 'D', evict: null,
            badge: 'MISS #4',
            log: 'Step 5 — CPU가 블록 D 요청. 캐시 미스! 메인 메모리에서 D를 가져와 슬롯 3에 적재합니다. 캐시가 꽉 찼습니다.',
        },
        {
            req: 'B', hit: true, load: null, evict: null,
            badge: 'HIT #2',
            log: 'Step 6 — CPU가 블록 B 재요청. 캐시 히트! 슬롯 1에서 즉시 반환합니다. B의 LRU 순위가 갱신됩니다.',
        },
        {
            req: 'E', hit: false, load: 'E', evict: 'A',
            badge: 'LRU 교체',
            log: 'Step 7 — CPU가 블록 E 요청. 캐시 미스 + 캐시 풀! LRU 정책으로 가장 오래된 A를 제거하고 E를 슬롯 0에 적재합니다.',
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = TOOLTIPS;

    /* ===================== 장면 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 캐시 동작을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function pcmTxtW(str, sz) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? 1 : 0.6;
        return n * sz;
    }

    function pcmReplay(n) {
        var slots = [null, null, null, null];
        var hits = 0, miss = 0, k, i, j;
        for (i = 0; i < n; i++) {
            var st = STEPS[i];
            if (st.hit) {
                hits++;
                for (j = 0; j < 4; j++) {
                    if (slots[j] && slots[j].block === st.req) slots[j] = { block: st.req, rank: i + 1 };
                }
            } else {
                miss++;
                k = -1;
                if (st.evict) {
                    for (j = 0; j < 4; j++) if (slots[j] && slots[j].block === st.evict) k = j;
                } else {
                    for (j = 0; j < 4; j++) if (!slots[j] && k < 0) k = j;
                }
                if (k >= 0) slots[k] = { block: st.load, rank: i + 1 };
            }
        }
        return { slots: slots, hits: hits, miss: miss };
    }

    function pcmOrder(slots, i) {
        var o = 1;
        for (var j = 0; j < 4; j++) if (slots[j] && slots[i] && slots[j].rank < slots[i].rank) o++;
        return o;
    }

    function pcmTrack(t, pts) {
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

    function pcmLetter(c, x, y, fs, col) {
        if (c) tx(c.block, x, y, fs, col + 'ff', 'center', true);
        else tx('—', x, y, fs, P.sub + 'ff', 'center', false);
    }

    function layout(w, mob) {
        var boxW = mob ? w : Math.min(w, 560);
        var slotPad = mob ? 8 : 14;
        var slotGap = mob ? 6 : 12;
        var memGap = mob ? 4 : 8;
        var hdrH = 22, slotH = 56, memCellH = 32;
        var cpuH = 44, laneH = 30;
        var cacheY = cpuH + laneH;
        var slotBox = hdrH + slotH + 8;
        var memY = cacheY + slotBox + laneH;
        var memBox = hdrH + memCellH + 8;
        return {
            boxW: boxW, bx: (w - boxW) / 2, cx: w / 2,
            cpuW: mob ? 84 : 136, cpuH: cpuH, cpuY: 0,
            cacheY: cacheY, slotBox: slotBox, slotH: slotH, hdrH: hdrH,
            slotW: (boxW - slotPad * 2 - slotGap * 3) / 4, slotPad: slotPad, slotGap: slotGap,
            memY: memY, memBox: memBox, memCellH: memCellH,
            memW: (boxW - slotPad * 2 - memGap * 7) / 8, memGap: memGap,
            laneH: laneH, totalH: memY + memBox
        };
    }

    function sceneH(w, mob) { return layout(w, mob).totalH; }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var idx = step ? steps.indexOf(step) : -1;
        var s = idx >= 0 ? steps[idx] : null;
        var before = pcmReplay(Math.max(idx, 0));
        var after = pcmReplay(idx + 1);
        var tt = s ? t : 0;
        var miss = !!s && !s.hit;
        var check = tt >= 0.17;
        var fillT = tt >= 0.8;
        var fsL = mob ? 10 : 11;
        var fsM = mob ? 11 : 13;
        var fsLet = mob ? 12 : 15;
        var chipR = mob ? 10 : 12;
        var cxA = x0 + L.cx;
        var cpuY = top + L.cpuY;
        var cpuBot = cpuY + L.cpuH;
        var cacheX = x0 + L.bx;
        var cacheY = top + L.cacheY;
        var memX = cacheX;
        var memY = top + L.memY;
        var hdrMid = L.hdrH / 2;
        var i, j;

        var hitIdx = -1, placeIdx = -1, victimIdx = -1;
        if (s && s.hit) {
            for (i = 0; i < 4; i++) if (before.slots[i] && before.slots[i].block === s.req) hitIdx = i;
        }
        if (miss) {
            var full = true;
            for (i = 0; i < 4; i++) {
                var ab = after.slots[i], bb = before.slots[i];
                if (ab && (!bb || bb.block !== ab.block)) placeIdx = i;
                if (!bb) full = false;
            }
            if (full) {
                victimIdx = 0;
                for (i = 1; i < 4; i++) if (before.slots[i].rank < before.slots[victimIdx].rank) victimIdx = i;
            }
        }

        var cpuHov = hoveredKey === 'CPU';
        var busy = !!s && tt < 0.96;
        rr(cxA - L.cpuW / 2, cpuY, L.cpuW, L.cpuH, 8, cpuHov ? P.purple + '28' : P.surf,
            P.purple + (busy || cpuHov ? 'ff' : '99'), busy || cpuHov ? 2 : 1.5);
        tx('CPU', cxA, cpuY + 15, mob ? 12 : 14, P.purple + 'ff', 'center', true);
        tx(s ? '요청 ' + s.req : '대기', cxA, cpuY + 32, fsL, P.sub + 'ff', 'center', false);
        tipBadge(cxA + L.cpuW / 2 - 10, cpuY + 10, 'CPU');

        var cnt = check ? after : before;
        tx('HIT ' + cnt.hits, x0 + 6, top + 11, fsM, P.green + 'ff', 'left', true);
        tx('MISS ' + cnt.miss, x0 + 6, top + 30, fsM, P.orange + 'ff', 'left', true);
        tipBadge(x0 + 6 + pcmTxtW('HIT ' + cnt.hits, fsM) + 12, top + 11, 'HIT');
        tipBadge(x0 + 6 + pcmTxtW('MISS ' + cnt.miss, fsM) + 12, top + 30, 'MISS');

        if (s && check) {
            var pc = s.evict ? P.red : (s.hit ? P.green : P.orange);
            var pw = pcmTxtW(s.badge, fsM) + 16;
            var px = x0 + w - pw - 2;
            rr(px, top + 9, pw, 22, 11, pc + '33', pc + 'ff', 1.5);
            tx(s.badge, px + pw / 2, top + 20, fsM, pc + 'ff', 'center', true);
        }

        ln(cxA, cpuBot, cxA, cacheY, P.border + 'ff', 1.4, [4, 4]);
        tx('요청', cxA + 8, cpuBot + L.laneH / 2, fsL, P.sub + 'ff', 'left', false);

        var laneTop = cacheY + L.slotBox;
        ln(cxA, laneTop, cxA, memY, P.border + 'ff', 1.4, [4, 4]);
        if (miss && tt >= 0.3 && tt < 0.72) tx('메모리 조회', cxA + 8, laneTop + L.laneH / 2, fsL, P.orange + 'ff', 'left', true);

        var cFlash = miss && tt >= 0.17 && tt < 0.3;
        var hFlash = !!s && s.hit && tt >= 0.3 && tt < 0.44;
        var cacheHov = hoveredKey === 'CACHE';
        var cCol = cFlash ? P.red : (hFlash ? P.green : P.teal);
        rr(cacheX, cacheY, L.boxW, L.slotBox, 8, cacheHov ? P.teal + '10' : P.surf,
            cCol + 'ff', cFlash || hFlash || cacheHov ? 2.5 : 1.5);
        tx('CACHE · LRU', cacheX + 10, cacheY + hdrMid, fsL, P.teal + 'ff', 'left', true);
        tipBadge(cacheX + L.boxW - 30, cacheY + hdrMid, 'LRU');
        tipBadge(cacheX + L.boxW - 10, cacheY + hdrMid, 'CACHE');

        var rankSrc = fillT ? after : before;
        for (i = 0; i < 4; i++) {
            var cl = cacheX + L.slotPad + i * (L.slotW + L.slotGap);
            var ct = cacheY + L.hdrH;
            var cw = L.slotW, ch = L.slotH;
            var isHit = i === hitIdx && tt >= 0.3;
            var isPlace = i === placeIdx;
            var isVic = i === victimIdx && tt >= 0.17 && tt < 0.8;
            var bg = P.surf2, bd = P.border, lw = 1, lc = P.text;
            if (isVic) { bg = P.red + '22'; bd = P.red; lw = 2; lc = P.red; }
            else if (isHit) { bg = P.green + '22'; bd = P.green; lw = 2; lc = P.green; }
            else if (isPlace && fillT) { bg = P.teal + '22'; bd = P.teal; lw = 2; lc = P.teal; }
            rr(cl, ct, cw, ch, 5, bg, bd + 'ff', lw);

            tx('S' + i, cl + 6, ct + 10, fsL, P.sub + 'ff', 'left', false);
            var ccx = cl + cw / 2, ccy = ct + 28;
            var bsl = before.slots[i], asl = after.slots[i];
            if (isPlace && tt >= 0.8 && tt < 0.9) {
                var fa = seg(tt, 0.8, 0.9);
                ctx.globalAlpha = 1 - fa;
                pcmLetter(bsl, ccx, ccy, fsLet, lc);
                ctx.globalAlpha = fa;
                pcmLetter(asl, ccx, ccy, fsLet, lc);
                ctx.globalAlpha = 1;
            } else {
                pcmLetter(fillT ? asl : bsl, ccx, ccy, fsLet, lc);
            }

            var cur = fillT ? asl : bsl;
            var lbl, lcol = P.sub, lb = false;
            if (!cur) lbl = '빈 슬롯';
            else if (isPlace && tt >= 0.85) { lbl = 'LOAD'; lcol = P.teal; lb = true; }
            else if (isHit) { lbl = 'HIT'; lcol = P.green; lb = true; }
            else if (isVic) { lbl = '교체'; lcol = P.red; lb = true; }
            else lbl = 'LRU ' + pcmOrder(rankSrc.slots, i);
            tx(lbl, ccx, ct + ch - 10, fsL, lcol + 'ff', 'center', lb);
        }

        var memHov = hoveredKey === 'MEM';
        var memHi = miss && tt >= 0.5 && tt < 0.72;
        rr(memX, memY, L.boxW, L.memBox, 8, memHov ? P.orange + '10' : P.surf,
            P.orange + 'ff', memHov ? 2.5 : 1.5);
        tx('MAIN MEMORY', memX + 10, memY + hdrMid, fsL, P.orange + 'ff', 'left', true);
        tipBadge(memX + L.boxW - 10, memY + hdrMid, 'MEM');
        for (j = 0; j < 8; j++) {
            var mx = memX + L.slotPad + j * (L.memW + L.memGap);
            var my = memY + L.hdrH;
            var hi = memHi && MEM_BLOCKS[j] === s.req;
            rr(mx, my, L.memW, L.memCellH, 4, hi ? P.orange + '33' : P.surf2,
                (hi ? P.orange : P.border) + 'ff', hi ? 2 : 1);
            tx(MEM_BLOCKS[j], mx + L.memW / 2, my + L.memCellH / 2, fsLet,
                (hi ? P.orange : P.sub) + 'ff', 'center', hi);
        }

        if (s) {
            var hdrY = cacheY + hdrMid;
            var slotY = cacheY + L.hdrH + L.slotH / 2;
            var memRow = memY + L.hdrH + L.memCellH / 2;
            var pts, col;
            if (s.hit) {
                var hx = hitIdx >= 0 ? cacheX + L.slotPad + hitIdx * (L.slotW + L.slotGap) + L.slotW / 2 : cxA;
                pts = [[0, cxA, cpuBot], [0.2, cxA, hdrY], [0.36, hx, slotY], [0.44, hx, slotY],
                    [0.72, cxA, slotY], [0.96, cxA, cpuBot]];
                col = tt < 0.36 ? P.purple : P.green;
            } else {
                var mxq = memX + L.slotPad + MEM_BLOCKS.indexOf(s.req) * (L.memW + L.memGap) + L.memW / 2;
                pts = [[0, cxA, cpuBot], [0.17, cxA, hdrY], [0.3, cxA, hdrY], [0.5, cxA, memRow],
                    [0.6, mxq, memRow], [0.66, mxq, memRow], [0.72, cxA, memRow], [0.8, cxA, hdrY],
                    [0.96, cxA, cpuBot]];
                col = tt < 0.3 ? P.purple : (tt < 0.72 ? P.orange : P.teal);
            }
            if (tt < 0.96) {
                var pos = pcmTrack(tt, pts);
                circ(pos[0], pos[1], chipR, col + 'ff', P.bg + 'ff', 1.5);
                tx(s.req, pos[0], pos[1], fsM, '#111111', 'center', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('cache-viz__speed-btn--active'); });
        btn.classList.add('cache-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cache-viz__mode-btn--active', d.key === m); });
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