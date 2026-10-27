/**
 * 블룸 필터 시각화 시각화
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
    var root    = el('div', 'bf-viz');
    var toolbar = el('div', 'bf-viz__toolbar');
    var tbLeft  = el('div', 'bf-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bf-viz__title', 'BLOOM FILTER'));

    var modeWrap = el('div', 'bf-viz__mode');
    var modeDefs = [
        { key: 'add', label: '추가' },
        { key: 'query', label: '조회' },
        { key: 'delete', label: '삭제 불가' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bf-viz__mode-btn' + (i === 0 ? ' bf-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bf-viz__speed');
    speedWrap.appendChild(el('span', 'bf-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bf-viz__speed-btn' + (i === 0 ? ' bf-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bf-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bf-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bf-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bf-viz__controls');
    var btnPlay  = el('button', 'bf-viz__btn bf-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bf-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bf-viz__btn', '↺ RESET');
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
    var mode    = 'add';
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

    /* ===================== 엔진: 블룸 필터 ===================== */
    var M = 16;
    var K = 3;
    function djb2(s) {
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
        return h;
    }
    function fnv(s) {
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
        return h;
    }
    function positions(w) {
        var a = djb2(w);
        var b = (fnv(w) | 1) >>> 0;
        var out = [];
        for (var i = 0; i < K; i++) out.push((a + i * b) % M);
        return out;
    }
    function listPos(p) { return p.join(', '); }
    function emptyBits() {
        var b = [];
        for (var i = 0; i < M; i++) b.push(0);
        return b;
    }
    function ones(bits) {
        var c = 0;
        bits.forEach(function (v) { c += v; });
        return c;
    }
    function bstep(bits, head, targets, kind, cap, cap2, cap3, log) {
        return { bits: bits.slice(), head: head, targets: targets, kind: kind, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    var ADDED = ['apple', 'banana', 'cherry'];

    /* ===================== 데이터: 추가 ===================== */
    var ADD_STEPS = [];
    var AFTER = emptyBits();
    (function () {
        var bits = emptyBits();
        ADD_STEPS.push(bstep(bits, '', [], 'add', '', '', '', '블룸 필터(Bloom filter)는 원소가 "있을 수도 있다"와 "확실히 없다"만 알려 주는 대신 메모리를 아주 적게 쓰는 확률적 자료구조입니다. 비트 배열 ' + M + '칸과 해시 함수 ' + K + '개로 만듭니다. 원소를 추가하면 해시 함수가 가리키는 ' + K + '칸을 1로 켭니다. 처음에는 모든 칸이 0입니다.'));
        ADDED.forEach(function (w) {
            var p = positions(w);
            var already = p.filter(function (x) { return bits[x] === 1; });
            ADD_STEPS.push(bstep(bits, 'add("' + w + '")', p, 'add', '해시 위치 ' + listPos(p), '', '',
                'add("' + w + '") — 해시 함수 ' + K + '개가 ' + w + '의 위치 ' + listPos(p) + '를 가리킵니다. 이 칸들을 1로 켜면 추가가 끝납니다.'));
            p.forEach(function (x) { bits[x] = 1; });
            ADD_STEPS.push(bstep(bits, 'add("' + w + '")', p, 'add', '켜진 칸 ' + ones(bits) + '개 / ' + M + '칸', already.length ? '이미 1이던 칸: ' + listPos(already) : '', '',
                '칸 ' + listPos(p) + '를 1로 켰습니다. 켜진 칸은 모두 ' + ones(bits) + '개입니다.' + (already.length ? ' 칸 ' + listPos(already) + '는 앞서 추가한 원소가 이미 켜 둔 칸이라 칸을 서로 공유합니다.' : '')));
        });
        AFTER = bits.slice();
        ADD_STEPS.push(bstep(bits, '', [], 'add', '원소 ' + ADDED.length + '개 · 비트 ' + M + '개 · 켜진 칸 ' + ones(bits) + '개', '', '',
            '정리 — 원소 ' + ADDED.length + '개를 넣는 데 비트 ' + M + '개만 썼습니다. 원소 자체는 저장하지 않으므로 어떤 원소가 들어 있는지 꺼내 볼 수는 없고, 있는지만 물어볼 수 있습니다.'));
    })();

    /* ===================== 데이터: 조회 ===================== */
    var QUERIES = ['apple', 'mango', 'grape'];
    var QUERY_STEPS = [];
    (function () {
        QUERY_STEPS.push(bstep(AFTER, '', [], 'q', '', '', '', 'query는 원소의 해시 위치 ' + K + '칸을 모두 확인합니다. 하나라도 0이면 "확실히 없다", 모두 1이면 "있을 수도 있다"입니다. apple, banana, cherry를 추가한 필터에서 세 가지 경우를 차례로 봅니다.'));
        QUERIES.forEach(function (w) {
            var p = positions(w);
            var allOne = p.every(function (x) { return AFTER[x] === 1; });
            var actually = ADDED.indexOf(w) >= 0;
            var head = 'query("' + w + '")';
            var bitsTxt = p.map(function (x) { return AFTER[x]; }).join(', ');
            var cap = allOne ? '모두 1 → 있을 수도 있음' : '0이 있음 → 확실히 없음';
            var log;
            if (allOne && actually) {
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값이 모두 1이라 "있을 수도 있다"고 답합니다. 실제로 추가한 원소이므로 맞는 답입니다.';
            } else if (allOne) {
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값이 모두 1이라 "있을 수도 있다"고 답합니다. 하지만 ' + w + '는 추가한 적이 없습니다. 다른 원소들이 켠 칸과 우연히 겹친 거짓 양성(false positive)입니다.';
            } else {
                var zero = p.filter(function (x) { return AFTER[x] === 0; });
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값은 ' + bitsTxt + '입니다. 칸 ' + listPos(zero) + '가 0이므로 추가한 적이 없다고 확신할 수 있습니다. "확실히 없다"고 답하며 거짓 음성은 없습니다.';
            }
            QUERY_STEPS.push(bstep(AFTER, head, p, 'q', cap, '위치 ' + listPos(p) + ' → 값 ' + bitsTxt, actually ? '실제로 추가한 원소' : '추가한 적 없는 원소', log));
        });
        var fp = Math.pow(1 - Math.pow(1 - 1 / M, K * ADDED.length), K) * 100;
        QUERY_STEPS.push(bstep(AFTER, '', [], 'q', '"없다"는 항상 맞고 "있다"는 틀릴 수 있음', '거짓 양성 확률 약 ' + fp.toFixed(1) + '%', '',
            '정리 — "없다"는 항상 맞고(거짓 음성 없음) "있다"는 틀릴 수 있습니다(거짓 양성). 거짓 양성 확률은 대략 (1 - (1 - 1/m)^(kn))^k이고, 이 예(m = ' + M + ', k = ' + K + ', n = ' + ADDED.length + ')에서는 약 ' + fp.toFixed(1) + '%입니다. 칸 수 m을 크게 잡을수록 확률이 낮아집니다.'));
    })();

    /* ===================== 데이터: 삭제 불가 ===================== */
    var DEL_STEPS = [];
    (function () {
        var bits = AFTER.slice();
        DEL_STEPS.push(bstep(bits, '', [], 'del', '', '', '', '앞에서 만든 필터(apple, banana, cherry 추가)에서 apple을 지우려고 하면 어떻게 되는지 봅니다. 한 칸을 여러 원소가 공유할 수 있다는 점이 문제입니다.'));
        var pa = positions('apple');
        var others = [];
        ['banana', 'cherry'].forEach(function (w) { positions(w).forEach(function (x) { if (others.indexOf(x) < 0) others.push(x); }); });
        var shared = pa.filter(function (x) { return others.indexOf(x) >= 0; });
        pa.forEach(function (x) { bits[x] = 0; });
        DEL_STEPS.push(bstep(bits, 'delete("apple")', pa, 'del', '칸 ' + listPos(pa) + ' → 0', '다른 원소와 공유한 칸: ' + listPos(shared), '',
            'apple의 칸 ' + listPos(pa) + '를 0으로 끕니다. 그런데 칸 ' + listPos(shared) + '는 다른 원소도 쓰던 칸이었습니다.'));
        var pb = positions('banana');
        var zero = pb.filter(function (x) { return bits[x] === 0; });
        DEL_STEPS.push(bstep(bits, 'query("banana")', pb, 'q', '칸 ' + listPos(zero) + '가 0 → 확실히 없음', 'banana는 추가된 원소인데도', '거짓 음성',
            'query("banana") — 위치 ' + listPos(pb) + ' 가운데 ' + listPos(zero) + '가 0이라 "확실히 없다"고 답합니다. 하지만 banana는 추가된 원소입니다. 칸을 공유한 apple을 지우면서 banana의 흔적까지 지워졌습니다.'));
        DEL_STEPS.push(bstep(bits, '', [], 'del', '삭제하면 거짓 음성이 생길 수 있음', '', '',
            '정리 — 표준 블룸 필터는 삭제하면 거짓 음성이 생길 수 있어 삭제를 지원하지 않습니다. 삭제가 필요하면 칸마다 비트 대신 카운터를 두는 Counting Bloom filter를 씁니다. 대신 칸당 메모리가 늘어납니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'delete') return DEL_STEPS;
        return ADD_STEPS;
    }
    function defaultLog() {
        if (mode === 'query') return '해시 위치의 칸이 모두 1인지 확인해 "있을 수도 있다"와 "확실히 없다"를 가려 봅니다.';
        if (mode === 'delete') return '칸을 공유한 원소를 지우면 어떤 문제가 생기는지 봅니다.';
        return '원소를 추가할 때 해시 위치의 칸이 켜지는 모습을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var blCapMemo = {};
    var BL_HINT = '아래 STEP으로 블룸 필터의 동작을 확인하세요.';
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function blFs(mob) { return mob ? 11.5 : 13; }
    function blSub(mob) { return mob ? 11 : 12; }
    function blCapH(s, w, mob) {
        var fs = blFs(mob);
        var fsub = blSub(mob);
        var h = 0;
        if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
        if (s.cap2) h += lines(s.cap2, w - 8, fsub).length * (fsub + 4);
        if (s.cap3) h += lines(s.cap3, w - 8, fsub).length * (fsub + 4);
        return h;
    }
    function blCapMax(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (blCapMemo[key] === undefined) {
            var best = blCapH({ cap: BL_HINT }, w, mob);
            [ADD_STEPS, QUERY_STEPS, DEL_STEPS].forEach(function (arr) {
                arr.forEach(function (s) {
                    var h = blCapH(s, w, mob);
                    if (h > best) best = h;
                });
            });
            blCapMemo[key] = best;
        }
        return blCapMemo[key];
    }
    function layout(w, mob) {
        var chipH = mob ? 20 : 24;
        var gridTop = chipH + 26;
        var rowGap = mob ? 62 : 68;
        var bh = mob ? 34 : 38;
        var capTop = gridTop + rowGap + bh + 24;
        return {
            fs: blFs(mob), fsub: blSub(mob), chipH: chipH, gridTop: gridTop,
            rowGap: rowGap, bh: bh, capTop: capTop,
            total: capTop + blCapMax(w, mob) + 8
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 기하 ===================== */
    function blGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        var cw = w / 8;
        return {
            L: L, x0: x0, w: w, top: top, fs: L.fs, fsub: L.fsub,
            cw: cw, bw: Math.min(mob ? 30 : 58, cw - 6), gy: top + L.gridTop,
            capY: top + L.capTop
        };
    }
    function blCellX(g, i) { return g.x0 + ((i % 8) + 0.5) * g.cw; }
    function blCellY(g, i) { return g.gy + Math.floor(i / 8) * g.L.rowGap; }
    function blRingCol(kind, on) {
        if (kind === 'del') return P.red;
        if (kind === 'q') return on ? P.green : P.red;
        return P.orange;
    }
    function blOtherCells() {
        var out = [];
        ADDED.forEach(function (word) {
            if (word === 'apple') return;
            positions(word).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
        });
        return out;
    }

    /* ===================== 칩과 칸 그리기 ===================== */
    function blBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) { tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold); });
        return y + rows.length * lh;
    }
    function blChip(g, text, cx, alpha) {
        ctx.font = '700 ' + g.fs + 'px "JetBrains Mono",monospace';
        var cw2 = ctx.measureText(text).width + 16;
        ctx.globalAlpha = alpha;
        rr(cx - cw2 / 2, g.top, cw2, g.L.chipH, 5, P.yellow + '33', P.yellow + 'ff', 1.4);
        tx(text, cx, g.top + g.L.chipH / 2, g.fs, P.yellow + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var g = blGeom(x0, top, w, mob);
        var fs = g.fs;
        var fsub = g.fsub;
        var bh = g.L.bh;
        var cx0 = x0 + w / 2;
        var chipBottom = top + g.L.chipH + 2;
        var tNew = fresh && (s.head !== p.head || s.targets.join(',') !== p.targets.join(','));
        var dotCol = s.kind === 'del' ? P.red : (s.kind === 'q' ? P.yellow : P.orange);
        var others = s.kind === 'del' ? blOtherCells() : [];
        var outA = fresh ? 1 - ez(seg(e, 0, 0.4)) : 0;
        var lost = fresh ? p.targets.filter(function (idx) { return s.targets.indexOf(idx) < 0; }) : [];

        if (s.head) blChip(g, s.head, cx0, fresh && s.head !== p.head ? ez(seg(e, 0, 0.25)) : 1);
        else if (fresh && p.head) blChip(g, p.head, cx0, 1 - ez(seg(e, 0, 0.25)));

        s.targets.forEach(function (idx) {
            ctx.globalAlpha = tNew ? ez(seg(e, 0, 0.25)) * 0.6 : 0.35;
            ln(cx0, chipBottom, blCellX(g, idx), blCellY(g, idx) - 2, P.sub + 'ff', 1.2, [3, 3]);
        });
        lost.forEach(function (idx) {
            ctx.globalAlpha = outA * 0.6;
            ln(cx0, chipBottom, blCellX(g, idx), blCellY(g, idx) - 2, P.sub + 'ff', 1.2, [3, 3]);
        });
        ctx.globalAlpha = 1;

        for (var i = 0; i < M; i++) {
            var cxi = blCellX(g, i);
            var yi = blCellY(g, i);
            var pb = p.bits[i];
            var sb = s.bits[i];
            var k = 1;
            if (fresh && sb !== pb) {
                var a0 = tNew ? 0.6 : 0;
                var ord = (i % 8) * 0.025;
                k = ez(seg(e, a0 + ord, a0 + 0.3 + ord));
            }
            var level = pb + (sb - pb) * k;
            var shown = k >= 0.5 ? sb : pb;
            var bx = cxi - g.bw / 2;
            rr(bx, yi, g.bw, bh, 5, 'none', P.sub + '88', 1.3);
            if (level > 0.01) {
                ctx.globalAlpha = level;
                rr(bx, yi, g.bw, bh, 5, P.teal + '44', P.teal + 'ff', 1.6);
                ctx.globalAlpha = 1;
            }
            tx(String(i), cxi, yi + 9, fsub, P.sub + 'ee', 'center', true);
            tx(String(shown), cxi, yi + bh - 11, fs + 1, (shown ? P.text : P.sub) + 'ff', 'center', true);
        }

        lost.forEach(function (idx) {
            ctx.globalAlpha = outA;
            rr(blCellX(g, idx) - g.bw / 2, blCellY(g, idx), g.bw, bh, 5, 'none', P.sub + 'ff', 2);
        });
        ctx.globalAlpha = 1;

        s.targets.forEach(function (idx, j) {
            var cxT = blCellX(g, idx);
            var yT = blCellY(g, idx);
            var ra = tNew ? seg(e, 0.55 + j * 0.06, 0.75 + j * 0.06) : 1;
            var col = blRingCol(s.kind, s.bits[idx] === 1);
            ctx.globalAlpha = ra;
            rr(cxT - g.bw / 2, yT, g.bw, bh, 5, 'none', col + 'ff', 2.6);
            tx('h' + j, cxT, yT + bh + 11, fsub, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        if (tNew) {
            s.targets.forEach(function (idx, j) {
                var q = ez(seg(e, j * 0.06, 0.55 + j * 0.06));
                if (q <= 0 || q >= 1) return;
                var dx = lerp(cx0, blCellX(g, idx), q);
                var dy = lerp(chipBottom, blCellY(g, idx) - 2, q);
                circ(dx, dy, 9, dotCol + '44', 'none');
                circ(dx, dy, 5, dotCol + 'ff', 'none');
            });
        }

        if (others.length) {
            var sa = tNew ? seg(e, 0.6, 0.8) : 1;
            s.targets.forEach(function (idx) {
                if (others.indexOf(idx) < 0) return;
                ctx.globalAlpha = sa;
                ctx.setLineDash([3, 3]);
                rr(blCellX(g, idx) - g.bw / 2 - 4, blCellY(g, idx) - 4, g.bw + 8, bh + 8, 7, 'none', P.yellow + 'ff', 1.6);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            });
        }

        if (!step) {
            blBlock(BL_HINT, cx0, g.capY, w, fsub, fsub + 4, P.sub + 'ff', false);
        } else {
            ctx.globalAlpha = fresh ? 0.3 + 0.7 * ez(e) : 1;
            var capY = blBlock(s.cap, cx0, g.capY, w, fs, fs + 5, P.yellow + 'ff', true);
            capY = blBlock(s.cap2, cx0, capY, w, fsub, fsub + 4, P.text + 'ee', false);
            blBlock(s.cap3, cx0, capY, w, fsub, fsub + 4, P.green + 'ff', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('bf-viz__speed-btn--active'); });
        btn.classList.add('bf-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bf-viz__mode-btn--active', d.key === m); });
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