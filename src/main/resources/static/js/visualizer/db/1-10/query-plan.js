/**
 * 쿼리 실행 계획 시각화
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
    var root    = el('div', 'query-plan-viz');
    var toolbar = el('div', 'query-plan-viz__toolbar');
    var tbLeft  = el('div', 'query-plan-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'query-plan-viz__title', 'EXPLAIN'));

    var modeWrap = el('div', 'query-plan-viz__mode');
    var modeDefs = [
        { key: 'intro', label: 'EXPLAIN 읽기' },
        { key: 'high', label: '선택도 높음' },
        { key: 'low', label: '선택도 낮음' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'query-plan-viz__mode-btn' + (i === 0 ? ' query-plan-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'query-plan-viz__speed');
    speedWrap.appendChild(el('span', 'query-plan-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'query-plan-viz__speed-btn' + (i === 0 ? ' query-plan-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'query-plan-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'query-plan-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'query-plan-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'query-plan-viz__controls');
    var btnPlay  = el('button', 'query-plan-viz__btn query-plan-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'query-plan-viz__btn', '▶| STEP');
    var btnReset = el('button', 'query-plan-viz__btn', '↺ RESET');
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
    var mode    = 'intro';
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

    /* ===================== 기준 데이터 ===================== */
    var TOTAL_ROWS = 20;
    var VIP_COUNT = 2;
    var NORMAL_COUNT = 18;
    var INDEX_OVERHEAD = 2;
    var RANDOM_ACCESS_WEIGHT = 4;

    /* ===================== 비용 계산 (실제 실행 — 하드코딩 아님) ===================== */
    function fullScanCost(total) { return total; }
    function indexScanCost(matching) { return INDEX_OVERHEAD + matching * RANDOM_ACCESS_WEIGHT; }
    function decide(matching, total) {
        var fs = fullScanCost(total);
        var ix = indexScanCost(matching);
        return { fullCost: fs, indexCost: ix, winner: ix < fs ? 'index' : 'full', selectivity: matching / total };
    }

    var HIGH_SEL = decide(NORMAL_COUNT, TOTAL_ROWS);
    var LOW_SEL  = decide(VIP_COUNT, TOTAL_ROWS);

    var EXPLAIN_CARDS = [
        { key: 'type', title: 'type', example: 'ALL / ref', desc: '어떤 방식으로 읽었는지. ALL(풀 스캔)이 가장 느리고, const·ref·range 등은 인덱스를 사용한 것입니다.' },
        { key: 'keyCol', title: 'key', example: 'idx_grade / NULL', desc: '실제로 사용된 인덱스 이름. 인덱스가 있어도 옵티마이저가 안 쓰기로 하면 NULL이 됩니다.' },
        { key: 'rows', title: 'rows', example: '2 / 20', desc: '옵티마이저가 예상한 스캔 행 수. 이 값이 작을수록 빠른 계획입니다.' }
    ];

    /* ===================== 스텝 빌더 ===================== */
    function buildIntroSteps() {
        var steps = [];
        steps.push({ kind: 'intro', card: -1,
            log: 'SQL을 실행하면 DB 옵티마이저가 여러 실행 방법의 비용을 계산해서 가장 싼 방법을 고릅니다. 그 선택 결과를 보여주는 것이 EXPLAIN입니다.' });
        EXPLAIN_CARDS.forEach(function (c, i) {
            steps.push({ kind: 'card', card: i, log: c.title + ' — ' + c.desc });
        });
        steps.push({ kind: 'done', card: -1,
            log: '정리 — 인덱스가 "있다"는 사실보다, 옵티마이저가 그 인덱스를 "쓰기로 했는지"가 중요합니다. 다음 두 탭에서 같은 인덱스를 두고 옵티마이저가 다르게 판단하는 걸 확인해보세요.' });
        return steps;
    }

    function buildSelectivitySteps(matching, label, sel) {
        var pct = Math.round(sel.selectivity * 100);
        var steps = [];
        steps.push({ kind: 'intro', showDist: true, distHi: label, showCost: false, winner: null,
            log: "user_grade = '" + label + "' 조건은 전체 " + TOTAL_ROWS + "행 중 " + matching + "행이 해당합니다 (선택도 " + pct + "%)." });
        steps.push({ kind: 'full-cost', showDist: true, distHi: label, showCost: 'full', winner: null,
            log: '풀 스캔 비용 = 전체 행 수 = ' + sel.fullCost });
        steps.push({ kind: 'index-cost', showDist: true, distHi: label, showCost: 'both', winner: null,
            log: '인덱스 스캔 비용 = 인덱스 탐색 비용(' + INDEX_OVERHEAD + ') + ' + matching + '행 × ' + RANDOM_ACCESS_WEIGHT + ' = ' + sel.indexCost });
        steps.push({ kind: 'decide', showDist: true, distHi: label, showCost: 'both', winner: sel.winner,
            log: sel.winner === 'index'
                ? sel.indexCost + ' < ' + sel.fullCost + ' 이므로 옵티마이저는 인덱스 스캔을 선택합니다.'
                : sel.fullCost + ' < ' + sel.indexCost + ' 이므로 인덱스가 있어도 옵티마이저는 풀 스캔을 선택합니다.' });
        steps.push({ kind: 'done', showDist: true, distHi: label, showCost: 'both', winner: sel.winner, showExplain: true,
            log: sel.winner === 'index'
                ? '정리 — EXPLAIN 결과: type=ref, key=idx_user_grade, rows=' + matching + '. 선택도가 낮을수록(희귀한 값일수록) 인덱스가 유리합니다.'
                : '정리 — EXPLAIN 결과: type=ALL, key=NULL, rows=' + TOTAL_ROWS + '. 조건에 맞는 행이 너무 많으면(선택도가 높으면) 인덱스보다 풀 스캔이 더 쌉니다.' });
        return steps;
    }

    var INTRO_STEPS = buildIntroSteps();
    var HIGH_STEPS  = buildSelectivitySteps(NORMAL_COUNT, '일반', HIGH_SEL);
    var LOW_STEPS   = buildSelectivitySteps(VIP_COUNT, 'VIP', LOW_SEL);

    /* ===================== 상태 ===================== */
    var VIPI = [5, 14];
    function currentSteps() {
        if (mode === 'high') return HIGH_STEPS;
        if (mode === 'low') return LOW_STEPS;
        return INTRO_STEPS;
    }
    function defaultLog() {
        if (mode === 'high') return '조건에 맞는 행이 많을 때 옵티마이저가 어떤 계획을 고르는지 봅니다.';
        if (mode === 'low') return '조건에 맞는 행이 적을 때 옵티마이저가 어떤 계획을 고르는지 봅니다.';
        return 'EXPLAIN 결과의 type, key, rows를 하나씩 읽어 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var intro = mode === 'intro';
        return { fs: mob ? 11 : 12.5, total: intro ? 8 + 30 + 6 + 2 * 72 + (mob ? 96 : 56) : (mob ? 262 : 290) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function groupOf(i) { return VIPI.indexOf(i) >= 0 ? 'VIP' : '일반'; }

    function strip(x, y, w, h, fillFn, hiLabel) {
        var cw = w / TOTAL_ROWS;
        for (var i = 0; i < TOTAL_ROWS; i++) {
            var vip = groupOf(i) === 'VIP';
            var base = vip ? P.purple : P.teal;
            var f = fillFn ? fillFn(i) : null;
            var hi = hiLabel && groupOf(i) === hiLabel;
            var col = f || base;
            rr(x + i * cw + 1, y, cw - 2, h, 3, col + (f ? '88' : '18'), (hi ? P.orange : col) + (hi || f ? 'ff' : '66'), hi ? 2 : 1.2);
        }
    }

    /* ===================== 모드1: EXPLAIN 읽기 ===================== */
    function drawIntro(x0, top, w, mob, s, p, e, fs) {
        var y0 = top + 8;
        var gap = mob ? 6 : 14;
        var cwid = (w - gap * 2) / 3;
        var act = s.card;
        var vals = [['ALL', 'NULL', String(TOTAL_ROWS)], ['ref', 'idx_user_grade', String(VIP_COUNT)]];
        var labels = ['인덱스 없이 (풀 스캔)', '인덱스를 쓰면'];
        var done = s.kind === 'done';
        var k, r;
        EXPLAIN_CARDS.forEach(function (c, i) {
            var bx = x0 + i * (cwid + gap);
            var on = act === i;
            var col = on ? P.orange : P.purple;
            rr(bx, y0, cwid, 30, 7, on ? col + '30' : 'none', col + (on ? 'ff' : '88'), on ? 2.4 : 1.4);
            tx(c.title, bx + cwid / 2, y0 + 15, fs + 2, col + 'ff', 'center', true);
            if (on && e < 1) circ(bx + cwid / 2, y0 + 15, 10 + e * 30, 'none', P.orange + 'ff', 1.8);
        });
        for (r = 0; r < 2; r++) {
            var ry = y0 + 36 + r * 72;
            tx(labels[r], x0, ry + 7, fs - 0.5, P.sub + 'ff', 'left', true);
            var sc = r === 0 ? P.orange : P.green;
            var cnt = '';
            if (s.kind !== 'intro') {
                var fin = r === 0 ? TOTAL_ROWS : VIP_COUNT;
                cnt = '읽은 행 ' + (act === 2 ? Math.round(fin * e) : fin);
            }
            tx(cnt, x0 + w, ry + 7, fs - 0.5, sc + 'ff', 'right', true);
            for (k = 0; k < 3; k++) {
                var bx2 = x0 + k * (cwid + gap);
                var on2 = act === k;
                var cc = on2 ? P.orange : sc;
                rr(bx2, ry + 16, cwid, 26, 6, cc + (on2 ? '33' : '14'), cc + (on2 ? 'ff' : '88'), on2 ? 2.2 : 1.3);
                tx(vals[r][k], bx2 + cwid / 2, ry + 29, fs - 0.5, P.text + 'ff', 'center', on2 || done);
            }
            var fillN = 0;
            if (s.kind !== 'intro') {
                if (r === 0) fillN = act === 0 ? TOTAL_ROWS * e : TOTAL_ROWS;
                else fillN = act === 0 ? Math.min(VIP_COUNT, Math.floor(e * 2.4)) : VIP_COUNT;
            }
            var sy = ry + 46;
            if (r === 0) {
                strip(x0, sy, w, 18, function (i) { return i < fillN ? P.yellow : null; }, null);
                if (act === 0 && e < 1 && fillN > 0) ln(x0 + w * (fillN / TOTAL_ROWS), sy - 3, x0 + w * (fillN / TOTAL_ROWS), sy + 21, P.yellow + 'ff', 2.4);
            } else {
                strip(x0, sy, w, 18, function (i) { return VIPI.indexOf(i) >= 0 && VIPI.indexOf(i) < fillN ? P.green : null; }, null);
                if (act === 0 && e < 1) {
                    var hop = clamp01((e * 2.4) % 1);
                    if (fillN < VIP_COUNT) circ(lerp(x0 + w / 2, x0 + w * ((VIPI[fillN] + 0.5) / TOTAL_ROWS), hop), sy - 4 - (1 - hop) * 8, 4.5, P.yellow + 'ff', 'none');
                }
            }
        }
        var dy = y0 + 36 + 2 * 72 + 6;
        if (act >= 0) {
            var c = EXPLAIN_CARDS[act];
            var ls = lines(c.title + ' — ' + c.desc, w, fs);
            ls.forEach(function (l, i) { tx(l, x0, dy + i * (fs + 5), fs, P.orange + 'ee', 'left', false); });
        } else if (done) {
            tx('인덱스를 쓰기로 했는지가 중요합니다', x0 + w / 2, dy, fs, P.green + 'ee', 'center', true);
        } else {
            tx('아래 STEP으로 type → key → rows를 읽어 봅니다', x0 + w / 2, dy, fs, P.sub + 'ff', 'center', false);
        }
    }

    /* ===================== 모드2, 3: 선택도와 비용 ===================== */
    function drawSel(x0, top, w, mob, s, p, e, fs) {
        var sel = mode === 'high' ? HIGH_SEL : LOW_SEL;
        var matching = mode === 'high' ? NORMAL_COUNT : VIP_COUNT;
        var hi = s.distHi;
        var y0 = top + 8;
        var kind = s.kind;
        var k;
        tx('users ' + TOTAL_ROWS + '행 · user_grade = ' + hi + ' (' + matching + '행)', x0, y0 + 4, fs - 0.5, P.sub + 'ff', 'left', true);
        var sy = y0 + 16;
        var cw = w / TOTAL_ROWS;
        var winner = s.winner;
        var mIdx = [];
        for (k = 0; k < TOTAL_ROWS; k++) { if (groupOf(k) === hi) mIdx.push(k); }
        var visited = 0;
        if (kind === 'index-cost') visited = Math.min(matching, Math.floor(e * matching + 0.001));
        else if (kind === 'decide' || kind === 'done') visited = winner === 'index' ? matching : 0;
        var scanned = kind === 'full-cost' ? TOTAL_ROWS * e : ((kind === 'decide' || kind === 'done') && winner === 'full' ? TOTAL_ROWS : 0);
        strip(x0, sy, w, 28, function (i) {
            if (i < scanned) return P.yellow;
            var pos = mIdx.indexOf(i);
            if (pos >= 0 && pos < visited) return P.green;
            return null;
        }, hi);
        if (kind === 'full-cost' && e < 1) ln(x0 + w * (scanned / TOTAL_ROWS), sy - 3, x0 + w * (scanned / TOTAL_ROWS), sy + 31, P.yellow + 'ff', 2.4);
        var showIdx = kind === 'index-cost' || ((kind === 'decide' || kind === 'done') && winner === 'index');
        if (showIdx) {
            rr(x0 + w - 70, sy + 34, 70, 18, 4, P.green + '33', P.green + 'ff', 1.4);
            tx('인덱스', x0 + w - 35, sy + 43, fs - 1, P.green + 'ff', 'center', true);
        }
        if (kind === 'index-cost' && e < 1 && visited < matching) {
            var slot = e * matching - visited;
            var cell = mIdx[visited];
            circ(lerp(x0 + w - 35, x0 + (cell + 0.5) * cw, clamp01(slot)), lerp(sy + 34, sy + 14, clamp01(slot)), 4.5, P.yellow + 'ff', 'none');
        }
        if (kind === 'full-cost') tx(Math.round(TOTAL_ROWS * e) + '행 읽음', x0, sy + 43, fs - 0.5, P.yellow + 'ff', 'left', true);
        else if (kind === 'index-cost') tx(visited + '행 접근 (무작위)', x0, sy + 43, fs - 0.5, P.green + 'ff', 'left', true);

        var barH = mob ? 30 : 36, bgap = mob ? 14 : 18;
        var by = sy + 28 + 34 + 14;
        var labelW = mob ? 78 : 96;
        var barAreaW = w - labelW - (mob ? 46 : 58);
        var maxCost = Math.max(sel.fullCost, sel.indexCost, 1);
        tx('예상 비용', x0, by - 12, fs - 0.5, P.sub + 'ff', 'left', true);
        var rows = [
            { key: 'full', label: '풀 스캔', cost: sel.fullCost, show: s.showCost === 'full' || s.showCost === 'both', grow: kind === 'full-cost' },
            { key: 'index', label: '인덱스 스캔', cost: sel.indexCost, show: s.showCost === 'both', grow: kind === 'index-cost' }
        ];
        rows.forEach(function (r, i) {
            var ry = by + i * (barH + bgap);
            var isW = winner && winner === r.key;
            var isL = winner && winner !== r.key;
            tx(r.label, x0 + labelW - 8, ry + barH / 2, fs - 0.5, P.text + (isL ? '88' : 'ee'), 'right', isW);
            var trackX = x0 + labelW;
            rr(trackX, ry, barAreaW, barH, 6, P.sub + '12', P.sub + '55', 1);
            if (!r.show) return;
            var fr = r.grow ? e : 1;
            var bw = Math.max(6, barAreaW * (r.cost / maxCost) * fr);
            var accent = isW ? P.green : (isL ? P.sub : P.teal);
            rr(trackX, ry, bw, barH, 6, accent + (isW ? '44' : '22'), accent + (isW ? 'ff' : 'aa'), isW ? 2.2 : 1.3);
            tx(String(Math.round(r.cost * fr)), trackX + bw + (mob ? 10 : 14), ry + barH / 2, fs, accent + 'ff', 'left', isW);
            if (isW && kind === 'decide' && e < 1) rr(trackX - 3, ry - 3, bw + 6, barH + 6, 8, 'none', P.green + 'ff', 2 * (1 - e));
        });
        if (s.showExplain) {
            var ey = by + 2 * barH + bgap + 18;
            var accent2 = winner === 'index' ? P.green : P.orange;
            var q = p.showExplain ? 1 : clamp01(e * 1.5);
            ctx.globalAlpha = q;
            rr(x0, ey + (1 - q) * 10, w, 44, 8, accent2 + '14', accent2 + 'cc', 1.8);
            var typeVal = winner === 'index' ? 'ref' : 'ALL';
            var keyVal = winner === 'index' ? 'idx_user_grade' : 'NULL';
            var rowsVal = winner === 'index' ? matching : TOTAL_ROWS;
            var line = 'EXPLAIN → type=' + typeVal + '  key=' + keyVal + '  rows=' + rowsVal;
            var el2 = lines(line, w - 12, fs - 0.5);
            el2.forEach(function (l2, li2) {
                tx(l2, x0 + w / 2, ey + (1 - q) * 10 + 22 + (li2 - (el2.length - 1) / 2) * (fs + 2), fs - 0.5, accent2 + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'intro') drawIntro(x0, top, w, mob, s, p, e, L.fs);
        else drawSel(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('query-plan-viz__speed-btn--active'); });
        btn.classList.add('query-plan-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('query-plan-viz__mode-btn--active', d.key === m); });
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