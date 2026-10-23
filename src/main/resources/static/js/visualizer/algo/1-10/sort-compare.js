/**
 * 정렬 알고리즘 비교 시각화 시각화
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
    var root    = el('div', 'sort-compare-viz');
    var toolbar = el('div', 'sort-compare-viz__toolbar');
    var tbLeft  = el('div', 'sort-compare-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sort-compare-viz__title', 'SORT'));

    var modeWrap = el('div', 'sort-compare-viz__mode');
    var modeDefs = [
        { key: 'merge', label: '병합 정렬' },
        { key: 'quick', label: '퀵 정렬' },
        { key: 'heap', label: '힙 정렬' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sort-compare-viz__mode-btn' + (i === 0 ? ' sort-compare-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sort-compare-viz__speed');
    speedWrap.appendChild(el('span', 'sort-compare-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sort-compare-viz__speed-btn' + (i === 0 ? ' sort-compare-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sort-compare-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sort-compare-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sort-compare-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sort-compare-viz__controls');
    var btnPlay  = el('button', 'sort-compare-viz__btn sort-compare-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sort-compare-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sort-compare-viz__btn', '↺ RESET');
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
    var mode    = 'merge';
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

    /* ===================== 데이터 (고정 배열, 세 알고리즘 모두 동일하게 사용) ===================== */
    var ARR     = [8, 3, 5, 4, 7, 6, 1, 2];
    var ARR_MAX = Math.max.apply(null, ARR);

    /* ===================== 병합 정렬 스텝 (bottom-up, 실제 알고리즘 실행) ===================== */
    function buildMergeSteps() {
        var a = ARR.slice();
        var n = a.length;
        var steps = [];
        var comparisons = 0;
        steps.push({ type: 'intro', arr: a.slice(), comparisons: 0,
            log: 'PLAY를 눌러 병합 정렬이 배열을 절반씩 나눈 뒤 다시 합치는 과정을 확인하세요. (너비 1 → 2 → 4 순으로 병합)' });

        for (var width = 1; width < n; width *= 2) {
            for (var left = 0; left < n; left += 2 * width) {
                var mid = Math.min(left + width, n);
                var right = Math.min(left + 2 * width, n);
                if (mid >= right) continue;
                var Lc = a.slice(left, mid), Rc = a.slice(mid, right);
                var li = 0, ri = 0, k = left;
                while (li < Lc.length && ri < Rc.length) {
                    comparisons++;
                    if (Lc[li] <= Rc[ri]) {
                        a[k] = Lc[li];
                        steps.push({ type: 'place', arr: a.slice(), left: left, mid: mid, right: right, k: k, comparisons: comparisons,
                            log: '[' + left + '~' + (right - 1) + '] 병합 중 → 왼쪽 ' + Lc[li] + ' ≤ 오른쪽 ' + Rc[ri] + ' → 위치 ' + k + '에 ' + Lc[li] + ' 배치' });
                        li++;
                    } else {
                        a[k] = Rc[ri];
                        steps.push({ type: 'place', arr: a.slice(), left: left, mid: mid, right: right, k: k, comparisons: comparisons,
                            log: '[' + left + '~' + (right - 1) + '] 병합 중 → 오른쪽 ' + Rc[ri] + ' < 왼쪽 ' + Lc[li] + ' → 위치 ' + k + '에 ' + Rc[ri] + ' 배치' });
                        ri++;
                    }
                    k++;
                }
                while (li < Lc.length) {
                    a[k] = Lc[li];
                    steps.push({ type: 'place', arr: a.slice(), left: left, mid: mid, right: right, k: k, comparisons: comparisons,
                        log: '[' + left + '~' + (right - 1) + '] 왼쪽에 남은 ' + Lc[li] + ' → 위치 ' + k + '에 배치' });
                    li++; k++;
                }
                while (ri < Rc.length) {
                    a[k] = Rc[ri];
                    steps.push({ type: 'place', arr: a.slice(), left: left, mid: mid, right: right, k: k, comparisons: comparisons,
                        log: '[' + left + '~' + (right - 1) + '] 오른쪽에 남은 ' + Rc[ri] + ' → 위치 ' + k + '에 배치' });
                    ri++; k++;
                }
            }
        }
        steps.push({ type: 'done', arr: a.slice(), comparisons: comparisons,
            log: '병합 정렬 완료. 총 비교 ' + comparisons + '회. 분할은 항상 절반씩(log n단계) 이루어지고, 각 단계에서 전체 원소를 한 번씩 병합(n)하므로 O(n log n)입니다.' });
        return steps;
    }

    /* ===================== 퀵 정렬 스텝 (Lomuto 파티션, 재귀 실행) ===================== */
    function buildQuickSteps() {
        var a = ARR.slice();
        var steps = [];
        var comparisons = 0;
        var confirmed = [];
        steps.push({ type: 'intro', arr: a.slice(), comparisons: 0, confirmed: [],
            log: 'PLAY를 눌러 퀵 정렬이 피벗을 기준으로 배열을 나누는 과정을 확인하세요. (피벗 = 구간의 마지막 값)' });

        function partition(lo, hi) {
            var pivot = a[hi];
            var i = lo - 1;
            steps.push({ type: 'pivot', arr: a.slice(), lo: lo, hi: hi, comparisons: comparisons, confirmed: confirmed.slice(),
                log: '[' + lo + '~' + hi + '] 구간의 마지막 값 ' + pivot + '을 피벗으로 선택합니다.' });

            for (var j = lo; j < hi; j++) {
                comparisons++;
                if (a[j] < pivot) {
                    i++;
                    if (i !== j) {
                        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
                        steps.push({ type: 'swap-or-compare', arr: a.slice(), lo: lo, hi: hi, i: i, j: j, comparisons: comparisons, confirmed: confirmed.slice(),
                            log: '[' + lo + '~' + hi + '] ' + a[i] + ' < 피벗(' + pivot + ') → 위치 ' + i + '와 ' + j + ' 교환' });
                    } else {
                        steps.push({ type: 'swap-or-compare', arr: a.slice(), lo: lo, hi: hi, i: i, j: j, comparisons: comparisons, confirmed: confirmed.slice(),
                            log: '[' + lo + '~' + hi + '] ' + a[j] + ' < 피벗(' + pivot + ') → 이미 제자리라 교환 없음' });
                    }
                } else {
                    steps.push({ type: 'compare', arr: a.slice(), lo: lo, hi: hi, i: i, j: j, comparisons: comparisons, confirmed: confirmed.slice(),
                        log: '[' + lo + '~' + hi + '] ' + a[j] + ' ≥ 피벗(' + pivot + ') → 그대로 둡니다.' });
                }
            }
            var tmp2 = a[i + 1]; a[i + 1] = a[hi]; a[hi] = tmp2;
            var pivotFinal = i + 1;
            steps.push({ type: 'place-pivot', arr: a.slice(), lo: lo, hi: hi, pivotFinal: pivotFinal, comparisons: comparisons, confirmed: confirmed.slice(),
                log: '[' + lo + '~' + hi + '] 피벗 ' + a[pivotFinal] + '을 최종 위치 ' + pivotFinal + '로 이동 — 왼쪽은 모두 작고 오른쪽은 모두 큽니다.' });
            confirmed.push(pivotFinal);
            return pivotFinal;
        }

        function quickSort(lo, hi) {
            if (lo < hi) {
                var p = partition(lo, hi);
                quickSort(lo, p - 1);
                quickSort(p + 1, hi);
            } else if (lo === hi) {
                confirmed.push(lo);
            }
        }
        quickSort(0, a.length - 1);

        steps.push({ type: 'done', arr: a.slice(), comparisons: comparisons, confirmed: confirmed.slice(),
            log: '퀵 정렬 완료. 총 비교 ' + comparisons + '회. 이 배열·이 피벗 선택 기준에서는 이 횟수지만, 피벗을 잘못 고르면(예: 이미 정렬된 배열에서 항상 끝값 선택) 최악의 경우 O(n²)까지 느려질 수 있습니다.' });
        return steps;
    }

    /* ===================== 힙 정렬 스텝 (최대 힙 구성 + 추출, 실제 알고리즘 실행) ===================== */
    function buildHeapSteps() {
        var a = ARR.slice();
        var n = a.length;
        var steps = [];
        var comparisons = 0;
        steps.push({ type: 'intro', arr: a.slice(), heapEnd: n, comparisons: 0,
            log: 'PLAY를 눌러 힙 정렬이 배열을 최대 힙으로 만든 뒤 하나씩 꺼내 정렬하는 과정을 확인하세요.' });

        function siftDown(start, end) {
            var rootIdx = start;
            while (true) {
                var l = 2 * rootIdx + 1, r = 2 * rootIdx + 2, largest = rootIdx;
                if (l < end) { comparisons++; if (a[l] > a[largest]) largest = l; }
                if (r < end) { comparisons++; if (a[r] > a[largest]) largest = r; }
                if (largest === rootIdx) break;
                var tmp = a[rootIdx]; a[rootIdx] = a[largest]; a[largest] = tmp;
                steps.push({ type: 'sift', arr: a.slice(), heapEnd: end, root: rootIdx, child: largest, comparisons: comparisons,
                    log: '인덱스 ' + rootIdx + '의 값이 자식보다 작아 더 큰 자식(인덱스 ' + largest + ')과 교환합니다.' });
                rootIdx = largest;
            }
        }

        for (var i = Math.floor(n / 2) - 1; i >= 0; i--) siftDown(i, n);
        steps.push({ type: 'heap-built', arr: a.slice(), heapEnd: n, comparisons: comparisons,
            log: '최대 힙 구성 완료 — 루트(인덱스 0)에 배열 전체에서 가장 큰 값이 위치합니다.' });

        for (var end = n - 1; end > 0; end--) {
            var tmp2 = a[0]; a[0] = a[end]; a[end] = tmp2;
            steps.push({ type: 'extract', arr: a.slice(), heapEnd: end, comparisons: comparisons,
                log: '루트(최댓값 ' + a[end] + ')를 정렬 영역의 맨 앞(인덱스 ' + end + ')으로 옮깁니다.' });
            siftDown(0, end);
        }

        steps.push({ type: 'done', arr: a.slice(), heapEnd: 0, comparisons: comparisons,
            log: '힙 정렬 완료. 총 비교 ' + comparisons + '회. 힙을 만드는 데 O(n), 원소를 하나씩 꺼내며 다시 정리하는 데 O(n log n) — 전체는 O(n log n)입니다.' });
        return steps;
    }

    var MERGE_STEPS = buildMergeSteps();
    var QUICK_STEPS = buildQuickSteps();
    var HEAP_STEPS  = buildHeapSteps();

    /* ===================== 포인터 레인 배정 (모드별 고정 — 겹침 방지) ===================== */
    var LANE_MAP = {
        merge: { k: 0 },
        quick: { pivot: 0, j: 1, i: 2 },
        heap:  { root: 0, child: 1 },
    };
    var POINTER_COLOR = { k: 'orange', pivot: 'purple', j: 'orange', i: 'teal', root: 'orange', child: 'purple' };

    function laneCountFor(m) {
        if (m === 'merge') return 1;
        if (m === 'quick') return 3;
        return 2;
    }

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'merge') return MERGE_STEPS;
        if (mode === 'quick') return QUICK_STEPS;
        return HEAP_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function scHeadText() {
        return '비교 횟수 (원소 ' + ARR.length + '개 배열 기준)';
    }
    function layout(w, mob) {
        var n = ARR.length;
        var gap = mob ? 4 : 10;
        var mPad = mob ? 16 : 20;
        var bw = Math.max(12, Math.min(mob ? 36 : 58, Math.floor((w - 2 * mPad - (n - 1) * gap) / n)));
        var gridW = n * bw + (n - 1) * gap;
        var fs = mob ? 11 : 12;
        var laneH = mob ? 16 : 20;
        var nLanes = laneCountFor(mode);
        var barH = mob ? 100 : 150;
        var head = lines(scHeadText(), gridW, fs);
        var headStep = fs + 5;
        var rowH = mob ? 22 : 26;
        var regionOff = nLanes * laneH + 18;
        var rowsOff = barH + 28 + head.length * headStep + 4;
        return {
            w: w, gx: (w - gridW) / 2, gridW: gridW, bw: bw, gap: gap, fs: fs, laneH: laneH,
            regionOff: regionOff, barH: barH, valPad: mob ? 16 : 20, lift: mob ? 10 : 14,
            head: head, headStep: headStep, rowH: rowH, rowsOff: rowsOff,
            labelW: mob ? 64 : 84, valW: mob ? 40 : 54,
            total: regionOff + rowsOff + 3 * rowH + 6
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 헬퍼 ===================== */
    function scX(L, x0, i) { return x0 + L.gx + i * (L.bw + L.gap); }
    function scCx(L, x0, i) { return scX(L, x0, i) + L.bw / 2; }
    function scEdge(L, x0, b) { return x0 + L.gx + b * (L.bw + L.gap) - L.gap / 2; }
    function scTextW(str, fs, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + fs + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function scBandOf(st) {
        if (mode === 'merge') return st.left != null ? [st.left, st.right] : null;
        if (mode === 'quick') return st.lo != null ? [st.lo, st.hi + 1] : null;
        return st.heapEnd > 0 ? [0, st.heapEnd] : null;
    }
    function scMidOf(st) { return st.left != null ? st.mid : null; }
    function scSwapOf(a0, a1) {
        var diff = [];
        for (var i = 0; i < a0.length; i++) { if (a0[i] !== a1[i]) diff.push(i); }
        if (diff.length === 2 && a0[diff[0]] === a1[diff[1]] && a0[diff[1]] === a1[diff[0]]) return diff;
        return null;
    }
    function scRole(st, i) {
        if (st.type === 'done') return 'green';
        if (mode === 'merge') return st.k === i ? 'k' : 'idle';
        if (mode === 'quick') {
            if (st.type === 'place-pivot' && i === st.pivotFinal) return 'green';
            if (st.hi != null && i === st.hi && (st.type === 'pivot' || st.type === 'compare' || st.type === 'swap-or-compare')) return 'pivot';
            if (st.j != null && i === st.j) return 'j';
            if (st.confirmed && st.confirmed.indexOf(i) >= 0) return 'green';
            return 'idle';
        }
        if (st.root === i) return 'root';
        if (st.child === i) return 'child';
        if (st.heapEnd != null && i >= st.heapEnd) return 'green';
        return 'idle';
    }
    function scRoleCol(r) {
        if (r === 'green') return P.green;
        if (r === 'idle') return P.muted;
        return P[POINTER_COLOR[r]];
    }
    function scPtrIdx(st, label) {
        if (label === 'k') return st.k != null ? st.k : null;
        if (label === 'pivot') {
            if (st.type === 'place-pivot') return st.pivotFinal;
            return (st.hi != null && (st.type === 'pivot' || st.type === 'compare' || st.type === 'swap-or-compare')) ? st.hi : null;
        }
        if (label === 'j') return st.j != null ? st.j : null;
        if (label === 'i') return (st.i != null && st.lo != null && st.i >= st.lo) ? st.i : null;
        if (label === 'root') return st.root != null ? st.root : null;
        if (label === 'child') return st.child != null ? st.child : null;
        return null;
    }
    function scBar(x, y, bw, bh, col, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(x, y, bw, bh, 3, col + '33', col + 'ee', 1.6);
        ctx.globalAlpha = 1;
    }

    /* ===================== 구간 · 분할선 ===================== */
    function scDrawBand(L, x0, regionTop, p, s, k) {
        var pb = scBandOf(p), cb = scBandOf(s);
        var a0 = null, a1 = null, al = 1;
        if (pb && cb) { a0 = lerp(pb[0], cb[0], k); a1 = lerp(pb[1], cb[1], k); }
        else if (cb) { a0 = cb[0]; a1 = cb[1]; al = k; }
        else if (pb) { a0 = pb[0]; a1 = pb[1]; al = 1 - k; }
        if (a0 === null || al <= 0) return;
        var x1 = scEdge(L, x0, a0), x2 = scEdge(L, x0, a1);
        ctx.globalAlpha = al;
        rr(x1, regionTop - 4, x2 - x1, L.barH + 7, 5, P.teal + '0c', P.teal + '3a', 1);
        ctx.globalAlpha = 1;
    }
    function scDrawDivider(L, x0, regionTop, p, s, k) {
        var pm = scMidOf(p), cm = scMidOf(s);
        var m = null, al = 1;
        if (pm !== null && cm !== null) { m = lerp(pm, cm, k); }
        else if (cm !== null) { m = cm; al = k; }
        else if (pm !== null) { m = pm; al = 1 - k; }
        if (m === null || al <= 0) return;
        ctx.globalAlpha = al;
        ln(scEdge(L, x0, m), regionTop - 4, scEdge(L, x0, m), regionTop + L.barH + 3, P.text + '66', 1.4, [4, 4]);
        ctx.globalAlpha = 1;
    }

    /* ===================== 막대 (교환은 호를 그리며, 병합 배치는 올라오며 값이 바뀜) ===================== */
    function scDrawBars(L, x0, regionTop, p, s, sw, e, k) {
        var base = regionTop + L.barH;
        var n = ARR.length;
        for (var i = 0; i < n; i++) {
            var src = i;
            if (sw) { if (i === sw[0]) src = sw[1]; else if (i === sw[1]) src = sw[0]; }
            var pv = p.arr[src], cv = s.arr[i];
            var morph = pv !== cv;
            var x = lerp(scX(L, x0, src), scX(L, x0, i), k);
            var lift = (src !== i || morph) ? Math.sin(Math.PI * k) * L.lift : 0;
            var hv = morph ? lerp(pv, cv, k) : cv;
            var bh = Math.max(4, (hv / ARR_MAX) * (L.barH - L.valPad));
            var by = regionTop + L.barH - bh - lift;
            var rp = scRole(p, src), rc = scRole(s, i);
            if (rp !== rc) {
                scBar(x, by, L.bw, bh, scRoleCol(rp), 1 - e);
                scBar(x, by, L.bw, bh, scRoleCol(rc), e);
            } else {
                scBar(x, by, L.bw, bh, scRoleCol(rc), 1);
            }
            var vv = (morph && k < 0.5) ? pv : cv;
            tx(String(vv), x + L.bw / 2, by - 9, L.fs, P.text + 'cc', 'center', true);
            tx(String(i), scCx(L, x0, i), base + 12, L.fs, P.sub + 'ff', 'center', false);
        }
    }

    /* ===================== 포인터 (레인 고정, 위치는 이동) ===================== */
    function scDrawPointers(L, x0, regionTop, p, s, e, k) {
        var labels = Object.keys(LANE_MAP[mode]);
        labels.forEach(function (label) {
            var pIdx = scPtrIdx(p, label), cIdx = scPtrIdx(s, label);
            var x = null, al = 1;
            if (pIdx !== null && cIdx !== null) { x = lerp(scCx(L, x0, pIdx), scCx(L, x0, cIdx), k); }
            else if (cIdx !== null) { x = scCx(L, x0, cIdx); al = ez(seg(e, 0.3, 1)); }
            else if (pIdx !== null) { x = scCx(L, x0, pIdx); al = 1 - ez(seg(e, 0, 0.6)); }
            if (x === null || al <= 0) return;
            var col = P[POINTER_COLOR[label]];
            var hw = scTextW(label, L.fs, true) / 2 + 2;
            var px = Math.min(Math.max(x, x0 + hw), x0 + L.w - hw);
            var ly = regionTop - 14 - LANE_MAP[mode][label] * L.laneH;
            ctx.globalAlpha = al;
            ln(px, ly + 6, px, regionTop - 1, col + '88', 1.2);
            tx(label, px, ly, L.fs, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== 비교 횟수 막대 (현재 모드는 자라고, 나머지는 전체 값을 흐리게) ===================== */
    function scDrawCompare(L, x0, top, p, s, k) {
        var headY = top + L.regionOff + L.barH + 28;
        var rowsTop = top + L.regionOff + L.rowsOff;
        L.head.forEach(function (hl, li) {
            tx(hl, x0 + L.gx, headY + li * L.headStep, L.fs, P.sub + 'ff', 'left', true);
        });
        var rows = [
            { key: 'merge', name: '병합 정렬', total: MERGE_STEPS[MERGE_STEPS.length - 1].comparisons, col: P.teal },
            { key: 'quick', name: '퀵 정렬',   total: QUICK_STEPS[QUICK_STEPS.length - 1].comparisons, col: P.orange },
            { key: 'heap',  name: '힙 정렬',   total: HEAP_STEPS[HEAP_STEPS.length - 1].comparisons,  col: P.purple }
        ];
        var maxVal = Math.max(rows[0].total, rows[1].total, rows[2].total);
        var barMaxW = L.gridW - L.labelW - L.valW;
        var bh = L.rowH - 10;
        rows.forEach(function (r, ri) {
            var cur = r.key === mode;
            var v = cur ? lerp(p.comparisons, s.comparisons, k) : r.total;
            var ry = rowsTop + ri * L.rowH + L.rowH / 2;
            var bx = x0 + L.gx + L.labelW;
            var bwid = maxVal > 0 ? (v / maxVal) * barMaxW : 0;
            tx(r.name, x0 + L.gx, ry, L.fs, (cur ? P.text : P.sub) + 'ff', 'left', true);
            if (bwid > 0) {
                ctx.globalAlpha = cur ? 1 : 0.45;
                rr(bx, ry - bh / 2, Math.max(3, bwid), bh, 3, r.col + '55', r.col + 'ee', 1.4);
                ctx.globalAlpha = 1;
            }
            tx(Math.round(v) + '회', bx + barMaxW + 6, ry, L.fs, (cur ? P.text : P.sub) + 'dd', 'left', cur);
        });
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var tt = clamp01(t);
        var e = s !== p ? tt : 1;
        var k = s !== p ? ez(tt) : 1;
        var sw = scSwapOf(p.arr, s.arr);
        var regionTop = top + L.regionOff;
        scDrawBand(L, x0, regionTop, p, s, k);
        scDrawDivider(L, x0, regionTop, p, s, k);
        scDrawBars(L, x0, regionTop, p, s, sw, e, k);
        scDrawPointers(L, x0, regionTop, p, s, e, k);
        scDrawCompare(L, x0, top, p, s, k);
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
        speedBtns.forEach(function (b) { b.classList.remove('sort-compare-viz__speed-btn--active'); });
        btn.classList.add('sort-compare-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sort-compare-viz__mode-btn--active', d.key === m); });
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