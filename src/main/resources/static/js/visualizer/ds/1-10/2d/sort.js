/**
 * 정렬 알고리즘 시각화 시각화
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
    var root    = el('div', 'sort-viz');
    var toolbar = el('div', 'sort-viz__toolbar');
    var tbLeft  = el('div', 'sort-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sort-viz__title', 'Sort'));

    var modeWrap = el('div', 'sort-viz__mode');
    var modeDefs = [
        { key: 'bubble', label: '버블 정렬' },
        { key: 'merge', label: '병합 정렬' },
        { key: 'quick', label: '퀵 정렬' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sort-viz__mode-btn' + (i === 0 ? ' sort-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sort-viz__speed');
    speedWrap.appendChild(el('span', 'sort-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sort-viz__speed-btn' + (i === 0 ? ' sort-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sort-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sort-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sort-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sort-viz__controls');
    var btnPlay  = el('button', 'sort-viz__btn sort-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sort-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sort-viz__btn', '↺ RESET');
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
    var mode    = 'bubble';
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

    /* ===================== 데이터 ===================== */
    var ARR = [8, 3, 6, 1, 9, 4, 7, 2];
    var MAXVAL = Math.max.apply(null, ARR);

    function snap(type, arr, hi, sortedArr, log) {
        return { type: type, array: arr.slice(), highlight: hi || {}, sorted: (sortedArr || []).slice(), log: log };
    }

    /* ===================== 버블 정렬 ===================== */
    function buildBubbleSteps(arr) {
        var a = arr.slice();
        var steps = [];
        var n = a.length;
        var sorted = [];
        steps.push(snap('intro', a, {}, sorted,
            '버블 정렬: 인접한 두 원소를 비교하며, 순서가 뒤바뀌어 있으면 교환합니다. 한 패스가 끝날 때마다 가장 큰 값이 맨 뒤로 확정됩니다.'));
        for (var i = 0; i < n - 1; i++) {
            var swappedInPass = false;
            for (var j = 0; j < n - 1 - i; j++) {
                steps.push(snap('compare', a, { compare: [j, j + 1] }, sorted,
                    'a[' + j + ']=' + a[j] + ' 와 a[' + (j + 1) + ']=' + a[j + 1] + ' 비교'));
                if (a[j] > a[j + 1]) {
                    var tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp;
                    swappedInPass = true;
                    steps.push(snap('swap', a, { swap: [j, j + 1] }, sorted,
                        '앞이 더 크므로 교환 → [' + a.join(', ') + ']'));
                }
            }
            sorted.unshift(n - 1 - i);
            steps.push(snap('sorted', a, {}, sorted.slice(),
                '이번 패스 최댓값이 인덱스 ' + (n - 1 - i) + '(으)로 확정되었습니다.'));
            if (!swappedInPass) {
                steps.push(snap('early-exit', a, {}, sorted.slice(),
                    '이번 패스에서 교환이 한 번도 없었습니다 → 이미 정렬 완료, 조기 종료(early exit)합니다.'));
                break;
            }
        }
        for (var k = 0; k < n; k++) if (sorted.indexOf(k) < 0) sorted.push(k);
        steps.push(snap('done', a, {}, sorted.slice(),
            '정렬 완료: [' + a.join(', ') + ']. 최악의 경우 시간복잡도 O(n²), 공간복잡도 O(1) (제자리 정렬).'));
        return steps;
    }

    /* ===================== 병합 정렬 ===================== */
    function buildMergeSteps(arr) {
        var a = arr.slice();
        var steps = [];
        steps.push(snap('intro', a, {}, [],
            '병합 정렬: 배열을 더 나눌 수 없을 때까지 절반으로 분할한 뒤, 정렬된 두 부분을 순서대로 합칩니다 (분할 정복).'));

        function mergeRange(lo, mid, hi) {
            var left = a.slice(lo, mid + 1);
            var right = a.slice(mid + 1, hi + 1);
            var i = 0, j = 0, k = lo;
            while (i < left.length && j < right.length) {
                steps.push(snap('compare', a, { range: [lo, hi], compare: [lo + i, mid + 1 + j] }, [],
                    left[i] + ' 와 ' + right[j] + ' 비교 (더 작은 값을 먼저 기록)'));
                if (left[i] <= right[j]) {
                    a[k] = left[i];
                    steps.push(snap('write', a, { range: [lo, hi], writing: k }, [], 'a[' + k + '] = ' + left[i]));
                    i++;
                } else {
                    a[k] = right[j];
                    steps.push(snap('write', a, { range: [lo, hi], writing: k }, [], 'a[' + k + '] = ' + right[j]));
                    j++;
                }
                k++;
            }
            while (i < left.length) {
                a[k] = left[i];
                steps.push(snap('write', a, { range: [lo, hi], writing: k }, [], 'a[' + k + '] = ' + left[i] + ' (왼쪽 나머지)'));
                i++; k++;
            }
            while (j < right.length) {
                a[k] = right[j];
                steps.push(snap('write', a, { range: [lo, hi], writing: k }, [], 'a[' + k + '] = ' + right[j] + ' (오른쪽 나머지)'));
                j++; k++;
            }
            steps.push(snap('merged', a, { range: [lo, hi] }, [], '[' + lo + '..' + hi + '] 구간 병합 완료'));
        }

        function mergeSortRange(lo, hi) {
            if (lo >= hi) return;
            var mid = Math.floor((lo + hi) / 2);
            steps.push(snap('split', a, { range: [lo, hi], splitMid: mid }, [],
                '[' + lo + '..' + hi + '] 구간을 [' + lo + '..' + mid + ']와 [' + (mid + 1) + '..' + hi + ']로 분할'));
            mergeSortRange(lo, mid);
            mergeSortRange(mid + 1, hi);
            mergeRange(lo, mid, hi);
        }

        mergeSortRange(0, a.length - 1);
        var allSorted = []; for (var t = 0; t < a.length; t++) allSorted.push(t);
        steps.push(snap('done', a, {}, allSorted,
            '정렬 완료: [' + a.join(', ') + ']. 시간복잡도 O(n log n)로 항상 일정하지만, 병합에 임시 배열이 필요해 공간복잡도는 O(n)입니다.'));
        return steps;
    }

    /* ===================== 퀵 정렬 (Lomuto 파티션) ===================== */
    function buildQuickSteps(arr) {
        var a = arr.slice();
        var steps = [];
        steps.push(snap('intro', a, {}, [],
            '퀵 정렬: 기준값(pivot)을 정한 뒤, pivot보다 작은 값은 왼쪽·큰 값은 오른쪽으로 분할(partition)하고 각 부분을 재귀적으로 정렬합니다.'));
        var sortedSet = {};
        function sortedIdx() { return Object.keys(sortedSet).map(Number); }

        function quickSort(lo, hi) {
            if (lo > hi) return;
            if (lo === hi) { sortedSet[lo] = true; return; }
            var pivotVal = a[hi];
            steps.push(snap('pivot', a, { range: [lo, hi], pivot: hi }, sortedIdx(),
                '[' + lo + '..' + hi + '] 구간의 피벗으로 마지막 원소 a[' + hi + ']=' + pivotVal + '을 선택'));
            var i = lo - 1;
            for (var j = lo; j < hi; j++) {
                steps.push(snap('compare', a, { range: [lo, hi], pivot: hi, compare: [j, hi] }, sortedIdx(),
                    'a[' + j + ']=' + a[j] + ' 와 pivot(' + pivotVal + ') 비교'));
                if (a[j] < pivotVal) {
                    i++;
                    if (i !== j) {
                        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
                        steps.push(snap('swap', a, { range: [lo, hi], pivot: hi, swap: [i, j] }, sortedIdx(),
                            'pivot보다 작음 → a[' + i + ']와 a[' + j + '] 교환'));
                    }
                }
            }
            var pIdx = i + 1;
            var tmp2 = a[pIdx]; a[pIdx] = a[hi]; a[hi] = tmp2;
            steps.push(snap('swap', a, { range: [lo, hi], pivot: pIdx, swap: [pIdx, hi] }, sortedIdx(),
                '피벗을 경계 위치 ' + pIdx + '(으)로 이동'));
            sortedSet[pIdx] = true;
            steps.push(snap('placed', a, { range: [lo, hi] }, sortedIdx(),
                '피벗 값 ' + a[pIdx] + '이 최종 위치 ' + pIdx + '에 확정 (왼쪽은 모두 작은 값, 오른쪽은 모두 큰 값)'));
            quickSort(lo, pIdx - 1);
            quickSort(pIdx + 1, hi);
        }

        quickSort(0, a.length - 1);
        for (var t = 0; t < a.length; t++) sortedSet[t] = true;
        steps.push(snap('done', a, {}, sortedIdx(),
            '정렬 완료: [' + a.join(', ') + ']. 평균 시간복잡도 O(n log n)이지만, 피벗이 계속 최솟값/최댓값으로 뽑히는 최악의 경우 O(n²)입니다.'));
        return steps;
    }

    var BUBBLE_STEPS = buildBubbleSteps(ARR);
    var MERGE_STEPS  = buildMergeSteps(ARR);
    var QUICK_STEPS  = buildQuickSteps(ARR);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'merge') return MERGE_STEPS;
        if (mode === 'quick') return QUICK_STEPS;
        return BUBBLE_STEPS;
    }
    function defaultLog() {
        if (mode === 'merge') return '▶ PLAY를 눌러 병합 정렬 과정을 확인하세요.';
        if (mode === 'quick') return '▶ PLAY를 눌러 퀵 정렬 과정을 확인하세요.';
        return '▶ PLAY를 눌러 버블 정렬 과정을 확인하세요.';
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function layout(w, mob) {
        var bh = mob ? 92 : 124;
        var base = (mob ? 58 : 62) + bh;
        return { fs: mob ? 10.5 : 12, bh: bh, base: base, total: base + (mob ? 60 : 66) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function dsGeom(x0, top, w, mob, n) {
        var L = layout(w, mob);
        var cw = Math.min(mob ? 40 : 60, (w - 24) / n);
        var gap = mob ? 7 : 10;
        return {
            x0: x0, w: w, top: top, n: n, fs: L.fs, bh: L.bh, cw: cw, gap: gap, bw: cw - gap,
            ox: x0 + (w - cw * n) / 2, base: top + L.base, legY: top + (mob ? 8 : 9)
        };
    }
    function dsX(g, k) { return g.ox + k * g.cw; }
    function dsCX(g, k) { return g.ox + k * g.cw + g.cw / 2; }
    function dsTw(str, fs) {
        ctx.font = '500 ' + fs + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function dsMid(steps, idx, lo, hi) {
        for (var q = idx; q >= 0; q--) {
            var h = steps[q].highlight;
            if (steps[q].type === 'split' && h.range[0] === lo && h.range[1] === hi) return h.splitMid;
        }
        return -1;
    }

    /* ===================== 색 ===================== */
    function dsColor(s, i) {
        var h = s.highlight;
        if (s.sorted.indexOf(i) >= 0) return s.type === 'done' ? P.green : P.teal;
        if (h.pivot === i) return P.purple;
        if ((h.compare && h.compare.indexOf(i) >= 0) || (h.swap && h.swap.indexOf(i) >= 0) || h.writing === i) return P.orange;
        return P.sub;
    }

    /* ===================== 범례 ===================== */
    function dsLegend(g, mob) {
        var fs = mob ? 10 : 11;
        var items = mode === 'merge'
            ? [[P.purple, '구간'], [P.orange, '비교/기록'], [P.teal, '정렬됨'], [P.sub, '아직']]
            : mode === 'quick'
                ? [[P.purple, '피벗'], [P.orange, '비교/교환'], [P.teal, '정렬됨'], [P.sub, '아직']]
                : [[P.orange, '비교/교환'], [P.teal, '정렬됨'], [P.sub, '아직']];
        var x = g.x0 + 2;
        items.forEach(function (it) {
            circ(x + 4, g.legY, 4, it[0] + 'ff', null, 1);
            x += 12;
            tx(it[1], x, g.legY, fs, P.text + 'cc', 'left', false);
            x += dsTw(it[1], fs) + 12;
        });
    }

    /* ===================== 구간 표시 ===================== */
    function dsZone(g, a, b, col, label) {
        var x1 = dsX(g, a) + 1, x2 = dsX(g, b) + g.cw - 1;
        rr(x1, g.base - g.bh - 14, x2 - x1, g.bh + 16, 6, col + '2a', null, 0);
        if (x2 - x1 >= dsTw(label, g.fs - 1) + 6) tx(label, (x1 + x2) / 2, g.base + 36, g.fs - 1, col + 'ff', 'center', true);
    }
    function dsRangeBg(g, s) {
        var r = s.highlight.range;
        if (!r) return;
        var x1 = dsX(g, r[0]) + 1, x2 = dsX(g, r[1]) + g.cw - 1;
        rr(x1, g.base - g.bh - 14, x2 - x1, g.bh + 16, 6, P.purple + '14', null, 0);
    }
    function dsQuickBase(g, s) {
        var h = s.highlight;
        if (mode !== 'quick' || !h.range || h.pivot === undefined) return;
        var lo = h.range[0], hi = h.range[1];
        var pv = s.array[h.pivot];
        var j = h.pivot === hi ? (h.compare ? h.compare[0] : (h.swap ? h.swap[1] : -1)) : -1;
        if (j >= 0) {
            var cnt = 0;
            for (var x = lo; x < j; x++) if (s.array[x] < pv) cnt++;
            var bd = lo - 1 + cnt;
            if (bd >= lo) dsZone(g, lo, bd, P.teal, '작음');
            if (j - 1 > bd) dsZone(g, bd + 1, j - 1, P.sub, '큼');
        }
        var yP = g.base - pv / MAXVAL * g.bh;
        ln(dsX(g, lo), yP, dsX(g, hi) + g.cw, yP, P.purple + '99', 1.2, [4, 3]);
    }

    /* ===================== 병합 구간 ===================== */
    function dsBracket(g, a, b, col, alpha) {
        if (alpha <= 0) return;
        var x1 = dsX(g, a) + 2, x2 = dsX(g, b) + g.cw - 2, y = g.base + 24;
        ctx.globalAlpha = alpha;
        ln(x1, y, x2, y, col + 'ff', 2);
        ln(x1, y, x1, y - 5, col + 'ff', 2);
        ln(x2, y, x2, y - 5, col + 'ff', 2);
        ctx.globalAlpha = 1;
    }
    function dsMergeRuns(g, s, fresh, e, steps, idx) {
        var h = s.highlight;
        if (mode !== 'merge' || !h.range) return;
        var lo = h.range[0], hi = h.range[1];
        var splitting = s.type === 'split';
        var whole = s.type === 'merged';
        var mid = splitting ? h.splitMid : dsMid(steps, idx, lo, hi);
        var aWhole = whole ? (fresh ? ez(e) : 1) : (splitting && fresh ? 1 - ez(e) : 0);
        var aSub = whole ? (fresh ? 1 - ez(e) : 0) : (splitting && fresh ? ez(e) : 1);
        dsBracket(g, lo, hi, P.teal, aWhole);
        if (mid >= 0) {
            dsBracket(g, lo, mid, P.teal, aSub);
            dsBracket(g, mid + 1, hi, P.purple, aSub);
        }
        if (splitting && mid >= 0) {
            ctx.globalAlpha = fresh ? ez(e) : 1;
            ln(dsX(g, mid + 1), g.base - g.bh - 14, dsX(g, mid + 1), g.base + 2, P.yellow + 'ff', 1.4, [3, 3]);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 막대 ===================== */
    function dsSlot(s, p, fresh, e, k) {
        if (!fresh || mode === 'merge') return k;
        var m = p.array.indexOf(s.array[k]);
        return m < 0 ? k : lerp(m, k, ez(e));
    }
    function dsBars(g, s, p, fresh, e) {
        ln(g.ox, g.base + 1, g.ox + g.n * g.cw, g.base + 1, P.sub + '66', 1);
        for (var k = 0; k < g.n; k++) {
            var v = s.array[k];
            var slot = dsSlot(s, p, fresh, e, k);
            var moving = Math.abs(slot - k) > 0.001;
            var changing = fresh && mode === 'merge' && p.array[k] !== v;
            var shown = changing && e < 0.5 ? p.array[k] : v;
            var bh = Math.max(6, (changing ? lerp(p.array[k], v, ez(e)) : v) / MAXVAL * g.bh);
            var lift = moving ? Math.sin(Math.PI * ez(e)) * (g.bh + 16 - bh + (slot < k ? 14 : 0)) : 0;
            var x = dsX(g, slot) + g.gap / 2;
            var y = g.base - bh - lift;
            var col = dsColor(s, k);
            rr(x, y, g.bw, bh, 4, col + '55', col + 'ff', 1.8);
            tx(String(shown), x + g.bw / 2, y - 8, g.fs, P.text + 'ff', 'center', true);
            tx(String(k), dsCX(g, k), g.base + 12, g.fs - 1, P.sub + 'ff', 'center', false);
        }
    }

    /* ===================== 이동 표시 ===================== */
    function dsFlight(g, s, p, fresh, e) {
        var h = s.highlight;
        if (mode !== 'merge' || !fresh || h.writing === undefined || !p.highlight.compare) return;
        var a = 1 - seg(e, 0.8, 1);
        if (a <= 0) return;
        var c = p.highlight.compare, v = s.array[h.writing];
        var src = p.array[c[0]] === v ? c[0] : (p.array[c[1]] === v ? c[1] : -1);
        if (src < 0) return;
        var q = ez(e);
        var x = lerp(dsCX(g, src), dsCX(g, h.writing), q) - g.bw / 2;
        var y = g.base - g.bh - 26 - Math.sin(Math.PI * q) * 10;
        ctx.globalAlpha = a;
        rr(x, y - 9, g.bw, 18, 4, P.yellow + 'ff', null, 0);
        tx(String(v), x + g.bw / 2, y, g.fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function dsPointers(g, s, p, fresh, e) {
        var h = s.highlight;
        if (mode === 'merge' && h.compare) {
            tx('L', dsCX(g, h.compare[0]), g.base + 36, g.fs - 1, P.teal + 'ff', 'center', true);
            tx('R', dsCX(g, h.compare[1]), g.base + 36, g.fs - 1, P.purple + 'ff', 'center', true);
        }
        if (mode === 'quick' && h.range && h.pivot !== undefined) {
            tx('피벗', dsX(g, dsSlot(s, p, fresh, e, h.pivot)) + g.cw / 2, g.base + 36, g.fs - 1, P.purple + 'ff', 'center', true);
        }
    }

    /* ===================== 설명 ===================== */
    function dsNote(g, s) {
        var h = s.highlight, txt = '';
        if (s.type === 'done') txt = '정렬 완료 · 모든 칸 확정';
        else if (mode === 'bubble') txt = '확정 ' + s.sorted.length + '칸 / 전체 ' + g.n + '칸';
        else if (mode === 'quick' && h.range) txt = (h.pivot !== undefined ? '피벗 ' + s.array[h.pivot] + ' · ' : '') + '구간 [' + h.range[0] + '..' + h.range[1] + ']';
        else if (mode === 'merge' && h.range) {
            if (s.type === 'split') txt = '[' + h.range[0] + '..' + h.splitMid + ']+[' + (h.splitMid + 1) + '..' + h.range[1] + ']로 분할';
            else if (s.type === 'merged') txt = '[' + h.range[0] + '..' + h.range[1] + '] 병합 완료';
            else txt = '구간 [' + h.range[0] + '..' + h.range[1] + '] 병합 중';
        }
        if (txt) tx(txt, g.x0 + g.w / 2, g.base + 50, g.fs - 0.5, P.text + 'dd', 'center', true);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var g = dsGeom(x0, top, w, mob, s.array.length);
        dsLegend(g, mob);
        dsRangeBg(g, s);
        dsQuickBase(g, s);
        dsMergeRuns(g, s, fresh, e, steps, steps.indexOf(s));
        dsBars(g, s, p, fresh, e);
        dsFlight(g, s, p, fresh, e);
        dsPointers(g, s, p, fresh, e);
        dsNote(g, s);
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
        speedBtns.forEach(function (b) { b.classList.remove('sort-viz__speed-btn--active'); });
        btn.classList.add('sort-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sort-viz__mode-btn--active', d.key === m); });
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