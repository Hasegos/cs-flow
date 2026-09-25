/**
 * 정렬 알고리즘 비교 시각화
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
        { key: 'heap',  label: '힙 정렬' },
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
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode    = 'merge';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        if (mode === 'merge') return MERGE_STEPS;
        if (mode === 'quick') return QUICK_STEPS;
        return HEAP_STEPS;
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
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function line(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.stroke();
    }

    /* ===================== 막대 좌표 계산 ===================== */
    function boxLayout(W, mob) {
        var n = ARR.length;
        var padX = mob ? 14 : 28;
        var gap  = mob ? 6 : 10;
        var plotW = W - 2 * padX;
        var boxW = Math.floor((plotW - (n - 1) * gap) / n);
        boxW = Math.max(mob ? 24 : 34, Math.min(mob ? 40 : 58, boxW));
        var totalW = n * boxW + (n - 1) * gap;
        var x0 = padX + Math.max(0, (plotW - totalW) / 2);
        return { n: n, boxW: boxW, gap: gap, x0: x0, totalW: totalW };
    }

    function idxX(BL, i) { return BL.x0 + i * (BL.boxW + BL.gap); }
    function idxCenterX(BL, i) { return idxX(BL, i) + BL.boxW / 2; }

    /* ===================== 스텝 → 렌더 스펙 변환 ===================== */
    function computeRenderSpec(step) {
        var spec = { highlights: {}, band: null, divider: null, pointers: [], sortedFrom: null, confirmedSet: null, allGreen: step.type === 'done' };

        if (mode === 'merge') {
            if (step.left != null) {
                spec.band = { start: step.left, end: step.right, colorKey: 'teal' };
                spec.divider = step.mid;
            }
            if (step.k != null) {
                spec.highlights[step.k] = 'orange';
                spec.pointers.push({ idx: step.k, label: 'k' });
            }
        } else if (mode === 'quick') {
            if (step.lo != null) spec.band = { start: step.lo, end: step.hi + 1, colorKey: 'teal' };
            if (step.confirmed) spec.confirmedSet = step.confirmed;
            if (step.hi != null && (step.type === 'pivot' || step.type === 'compare' || step.type === 'swap-or-compare')) {
                spec.highlights[step.hi] = 'purple';
                spec.pointers.push({ idx: step.hi, label: 'pivot' });
            }
            if (step.j != null) {
                spec.highlights[step.j] = 'orange';
                spec.pointers.push({ idx: step.j, label: 'j' });
            }
            if (step.i != null && step.lo != null && step.i >= step.lo) {
                spec.pointers.push({ idx: step.i, label: 'i' });
            }
            if (step.type === 'place-pivot') {
                spec.highlights[step.pivotFinal] = 'green';
            }
        } else {
            if (step.heapEnd != null) {
                spec.sortedFrom = step.heapEnd;
                spec.band = { start: 0, end: step.heapEnd, colorKey: 'teal' };
            }
            if (step.root != null) { spec.highlights[step.root] = 'orange'; spec.pointers.push({ idx: step.root, label: 'root' }); }
            if (step.child != null) { spec.highlights[step.child] = 'purple'; spec.pointers.push({ idx: step.child, label: 'child' }); }
        }
        return spec;
    }

    /* ===================== 막대 + 포인터 렌더 ===================== */
    function drawBars(BL, top, h, mob, step, spec) {
        if (spec.band) {
            var col1 = P[spec.band.colorKey];
            var bx0 = idxX(BL, spec.band.start) - BL.gap / 2;
            var bx1 = idxX(BL, spec.band.end)   - BL.gap / 2;
            rr(bx0, top - 6, Math.max(0, bx1 - bx0), h + 12, 5, col1 + '0c', col1 + '3a', 1);
        }
        if (spec.divider != null) {
            var dx = idxX(BL, spec.divider) - BL.gap / 2;
            ctx.save();
            ctx.setLineDash([4, 4]);
            line(dx, top - 8, dx, top + h + 8, P.text + '55', 1.4);
            ctx.restore();
        }

        var valueTopPad = mob ? 20 : 22;
        for (var i = 0; i < step.arr.length; i++) {
            var val = step.arr[i];
            var bh = Math.max(4, (val / ARR_MAX) * (h - valueTopPad));
            var bx = idxX(BL, i);
            var by = top + h - bh;

            var col = P.muted;
            if (spec.confirmedSet && spec.confirmedSet.indexOf(i) >= 0) col = P.green;
            if (spec.sortedFrom != null && i >= spec.sortedFrom) col = P.green;
            if (spec.highlights[i]) col = P[spec.highlights[i]];
            if (spec.allGreen) col = P.green;

            rr(bx, by, BL.boxW, bh, 3, col + '33', col + 'ee', 1.6);
            tx(String(val), bx + BL.boxW / 2, by - (mob ? 9 : 10), mob ? 9 : 10.5, P.text + 'cc', 'center', true);
            tx(String(i), bx + BL.boxW / 2, top + h + (mob ? 11 : 13), mob ? 8 : 9, P.text + '66', 'center', false);
        }

        var laneH = mob ? 22 : 26;
        var laneMap = LANE_MAP[mode];
        spec.pointers.forEach(function (p) {
            var lane = laneMap[p.label];
            if (lane == null) return;
            var cx = idxCenterX(BL, p.idx);
            var ly = top - (lane + 1) * laneH + laneH / 2 - 2;
            var col = P[POINTER_COLOR[p.label]];
            tx(p.label, cx, ly, mob ? 12 : 14, col + 'ee', 'center', true);
            line(cx, ly + (mob ? 9 : 10), cx, top - 2, col + '88', 1.2);
        });
    }

    /* ===================== 비교 횟수 비교 (마지막 모드 — 힙 정렬 화면에서 상시 표시) ===================== */
    function drawCallComparison(x0, top, w, mob) {
        var mergeTotal = MERGE_STEPS[MERGE_STEPS.length - 1].comparisons;
        var quickTotal = QUICK_STEPS[QUICK_STEPS.length - 1].comparisons;
        var heapTotal  = HEAP_STEPS[HEAP_STEPS.length - 1].comparisons;
        var maxVal = Math.max(mergeTotal, quickTotal, heapTotal);

        var rows = [
            { label: '병합 정렬', value: mergeTotal, col: P.teal },
            { label: '퀵 정렬',   value: quickTotal, col: P.orange },
            { label: '힙 정렬',   value: heapTotal,  col: P.purple },
        ];

        var fLbl = mob ? 10 : 11;
        var labelW = mob ? 66 : 84;
        var barMaxW = Math.max(60, w - labelW - (mob ? 50 : 70));
        var rowH = mob ? 24 : 28;

        tx('비교 횟수 비교 (원소 8개 배열 기준)', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var rowsTop = top + (mob ? 18 : 22);
        rows.forEach(function (r, i) {
            var ry = rowsTop + i * rowH;
            tx(r.label, x0, ry, fLbl, P.text + 'dd', 'left', true);
            var barX = x0 + labelW;
            var barW = Math.max(4, (r.value / maxVal) * barMaxW);
            rr(barX, ry - (mob ? 7 : 8), barW, mob ? 14 : 16, 3, r.col + '55', r.col + 'ee', 1.4);
            tx(r.value + '회', barX + barMaxW + 10, ry, mob ? 9 : 10, P.text + '99', 'left', false);
        });
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 18 : 24,
            laneH:    mob ? 22 : 26,
            gapAfterPointers: mob ? 6 : 8,
            barH:     mob ? 130 : 170,
            labelH:   mob ? 16 : 18,
            gapAfterBars: mob ? 14 : 16,
            compareH: mode === 'heap' ? (mob ? 100 : 112) : 0,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        var pointerBlockH = laneCountFor(mode) * L.laneH;
        return L.top + pointerBlockH + L.gapAfterPointers + L.barH + L.labelH + L.gapAfterBars + L.compareH + L.top;
    }

    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;

        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W   = GW();
        var mob = W < 600;
        var L   = getLayout(mob);

        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        L.top = L.top + extra / 2;

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        var BL = boxLayout(W, mob);
        var spec = computeRenderSpec(step);

        var pointerBlockH = laneCountFor(mode) * L.laneH;
        var barTop = L.top + pointerBlockH + L.gapAfterPointers;
        drawBars(BL, barTop, L.barH, mob, step, spec);

        if (mode === 'heap') {
            var compareTop = barTop + L.barH + L.labelH + L.gapAfterBars;
            drawCallComparison(BL.x0, compareTop, BL.totalW, mob);
        }
    }

    /* ===================== 애니메이션(스텝 전환 타이밍) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () {
            rafId = null;
            if (onDone) onDone();
        });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        return currentSteps()[0].log;
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
                    timer = setTimeout(tick, speed * 0.32);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next  = stepIdx + 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('sort-compare-viz__speed-btn--active'); });
        btn.classList.add('sort-compare-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('sort-compare-viz__mode-btn--active', d.key === m);
        });
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
                draw: draw,
            };
        },
    });

    setTimeout(resize, 60);
})();