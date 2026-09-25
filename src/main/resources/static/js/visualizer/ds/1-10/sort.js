/**
 * 정렬 알고리즘 시각화
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
        { key: 'merge',  label: '병합 정렬' },
        { key: 'quick',  label: '퀵 정렬' },
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
    [['1x', 1400], ['2x', 700], ['3x', 400]].forEach(function (pair, i) {
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

    var logEl = el('div', 'sort-viz__log', '▶ PLAY를 눌러 정렬 과정을 확인하세요.');
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode     = 'bubble';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1400;
    var animProg = 1;

    function currentSteps() {
        if (mode === 'bubble') return BUBBLE_STEPS;
        if (mode === 'merge')  return MERGE_STEPS;
        return QUICK_STEPS;
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

    function textWidth(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }

    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.stroke();
    }

    /* ===================== 막대 색상 (항상 순수 hex 반환 — 알파는 그리는 곳에서 한 번만 붙임) ===================== */
    function barColor(i, step) {
        if (step.sorted && step.sorted.indexOf(i) >= 0) return step.type === 'done' ? P.green : P.teal;
        if (step.highlight.pivot === i) return P.purple;
        if (step.highlight.compare && step.highlight.compare.indexOf(i) >= 0) return P.orange;
        if (step.highlight.swap && step.highlight.swap.indexOf(i) >= 0) return P.orange;
        if (step.highlight.writing === i) return P.orange;
        return P.muted;
    }

    /* ===================== 범례 ===================== */
    function drawLegend(W, top, mob) {
        var items = [
            { col: P.teal,   label: '정렬됨' },
            { col: P.orange, label: '비교/교환' },
        ];
        if (mode === 'quick') items.push({ col: P.purple, label: '피벗' });
        items.push({ col: P.muted, label: '아직' });

        var fLbl = mob ? 10 : 11;
        var sw   = mob ? 9  : 10;
        var x0   = mob ? 16 : 28;
        var y    = top + (mob ? 7 : 9);
        var gapAfterLabel = mob ? 16 : 20;

        var x = x0;
        items.forEach(function (it) {
            circle(x, y, sw / 2, it.col + 'dd', it.col + 'ee', 1);
            x += sw + 5;
            tx(it.label, x, y, fLbl, P.text + 'cc', 'left', false);
            x += textWidth(it.label, fLbl, false) + gapAfterLabel;
        });
    }

    /* ===================== 막대 그래프 ===================== */
    function drawBars(W, top, h, mob, step) {
        var n = step.array.length;
        var marginX = mob ? 14 : 26;
        var gap     = mob ? 8  : 14;
        var barW    = (W - 2 * marginX - (n - 1) * gap) / n;
        var topPad    = mob ? 22 : 26;
        var bottomPad = mob ? 40 : 46;
        var maxBarH   = Math.max(20, h - topPad - bottomPad);
        var baselineY = top + topPad + maxBarH;

        for (var i = 0; i < n; i++) {
            var val  = step.array[i];
            var barH = Math.max(6, (val / MAXVAL) * maxBarH);
            var barX = marginX + i * (barW + gap);
            var barY = baselineY - barH;
            var col  = barColor(i, step);

            rr(barX, barY, barW, barH, 4, col + '33', col + 'ee', 2);
            tx(String(val), barX + barW / 2, barY - (mob ? 11 : 13), mob ? 12 : 14, P.text + 'ee', 'center', true);
            tx(String(i), barX + barW / 2, baselineY + (mob ? 13 : 15), mob ? 9 : 10, P.text + '77', 'center', false);
        }

        if (step.highlight.range) {
            var lo = step.highlight.range[0], hi = step.highlight.range[1];
            var xlo = marginX + lo * (barW + gap);
            var xhi = marginX + hi * (barW + gap) + barW;
            var by  = baselineY + (mob ? 26 : 30);
            line(xlo, by, xhi, by, P.purple + '99', 2);
            line(xlo, by - 4, xlo, by + 4, P.purple + '99', 2);
            line(xhi, by - 4, xhi, by + 4, P.purple + '99', 2);
            tx('구간 [' + lo + '..' + hi + ']', (xlo + xhi) / 2, by + (mob ? 12 : 14), mob ? 9 : 10, P.purple + 'cc', 'center', true);
        }
    }

    /* ===================== 레이아웃 상수 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 18 : 24,
            legendH:  mob ? 24 : 28,
            barAreaH: mob ? 232 : 268,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        return L.top + L.legendH + L.barAreaH + L.top;
    }

    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var h = calcH(w);
        canvasWrap.style.height    = h + 'px';
        canvasWrap.style.minHeight = h + 'px';
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
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

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        drawLegend(W, L.top, mob);
        drawBars(W, L.top + L.legendH, L.barAreaH, mob, step);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.01 * (1400 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                draw();
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        if (mode === 'bubble') return '▶ PLAY를 눌러 버블 정렬 과정을 확인하세요.';
        if (mode === 'merge')  return '▶ PLAY를 눌러 병합 정렬 과정을 확인하세요.';
        return '▶ PLAY를 눌러 퀵 정렬 과정을 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.45);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running || animProg < 1) return;
        var steps = currentSteps();
        var next  = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animProg = 1;
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
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('sort-viz__mode-btn--active', d.key === m);
        });
        vizReset();
    }

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