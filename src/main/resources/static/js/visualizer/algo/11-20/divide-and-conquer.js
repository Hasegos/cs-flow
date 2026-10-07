/**
 * 분할정복 시각화
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
    var root    = el('div', 'dc-viz');
    var toolbar = el('div', 'dc-viz__toolbar');
    var tbLeft  = el('div', 'dc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dc-viz__title', 'DIVIDE AND CONQUER'));

    var modeWrap = el('div', 'dc-viz__mode');
    var modeDefs = [
        { key: 'merge', label: '병합 정렬' },
        { key: 'power', label: '거듭제곱' },
        { key: 'cost', label: '비용 트리' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dc-viz__mode-btn' + (i === 0 ? ' dc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dc-viz__speed');
    speedWrap.appendChild(el('span', 'dc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'dc-viz__speed-btn' + (i === 0 ? ' dc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dc-viz__controls');
    var btnPlay  = el('button', 'dc-viz__btn dc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dc-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 분할정복 ===================== */
    var ARR = [38, 27, 43, 3, 9, 82, 10, 5];
    var N = ARR.length;
    var DEPTH = 3;
    function listText(a) {
        return '[' + a.join(', ') + ']';
    }
    function mergeTwo(a, b) {
        var out = [];
        var i = 0;
        var j = 0;
        var c = 0;
        while (i < a.length && j < b.length) {
            c++;
            if (a[i] <= b[j]) out.push(a[i++]);
            else out.push(b[j++]);
        }
        return { arr: out.concat(a.slice(i)).concat(b.slice(j)), cmp: c };
    }
    function segOf(arr, size, k) {
        return arr.slice(k * size, (k + 1) * size);
    }
    function mstep(lv, vis, sorted, hot, cap, cap2, cap3, log) {
        return { kind: 'merge', lv: lv.map(function (r) { return r.slice(); }), vis: vis, sorted: sorted.slice(), hot: hot, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: 병합 정렬 ===================== */
    var MERGE_STEPS = [];
    (function () {
        var lv = [ARR.slice(), ARR.slice(), ARR.slice(), ARR.slice()];
        var sorted = [false, false, false, true];
        var total = 0;
        var d;
        MERGE_STEPS.push(mstep(lv, 1, [false, false, false, false], -1, '병합 정렬: 분할 → 정복 → 결합', '배열 ' + listText(ARR) + ' (' + N + '개)', '', '분할정복은 큰 문제를 더 작은 같은 종류의 문제로 나누고(분할), 작은 문제를 풀고(정복), 그 답을 합쳐(결합) 원래 문제의 답을 만드는 방식입니다. 병합 정렬은 배열을 절반씩 나누어 한 개씩이 될 때까지 쪼갠 뒤, 정렬된 두 조각을 합치며 올라옵니다.'));
        for (d = 1; d <= DEPTH; d++) {
            var size = N / Math.pow(2, d);
            var parts = [];
            var k;
            for (k = 0; k < Math.pow(2, d); k++) parts.push(listText(segOf(ARR, size, k)));
            MERGE_STEPS.push(mstep(lv, d + 1, [false, false, false, d === DEPTH], d, '분할 ' + d + '단계: 크기 ' + size + '짜리 ' + Math.pow(2, d) + '조각', d === DEPTH ? '한 개짜리 조각은 이미 정렬된 상태' : '', '', '배열을 절반씩 나눕니다. ' + (d === DEPTH ? '조각이 한 개씩이 되어 더 나눌 수 없습니다. 원소가 하나뿐인 조각은 이미 정렬되어 있으므로 이것이 기저 사례입니다.' : '조각은 ' + parts.join(', ') + '입니다.')));
        }
        for (d = DEPTH; d >= 1; d--) {
            var sz = N / Math.pow(2, d);
            var lines = [];
            var cmpSum = 0;
            var pair;
            for (pair = 0; pair < Math.pow(2, d - 1); pair++) {
                var a = segOf(lv[d], sz, pair * 2);
                var b = segOf(lv[d], sz, pair * 2 + 1);
                var m = mergeTwo(a, b);
                cmpSum += m.cmp;
                lines.push(listText(a) + ' + ' + listText(b) + ' → ' + listText(m.arr) + ' (비교 ' + m.cmp + '번)');
                var t;
                for (t = 0; t < m.arr.length; t++) lv[d - 1][pair * sz * 2 + t] = m.arr[t];
            }
            total += cmpSum;
            sorted[d - 1] = true;
            MERGE_STEPS.push(mstep(lv, DEPTH + 1, sorted, d - 1, '결합 ' + (DEPTH - d + 1) + '단계: 정렬된 조각 둘을 하나로', '이 단계의 비교 ' + cmpSum + '번 · 누적 ' + total + '번', '', '정렬된 두 조각을 앞에서부터 비교하며 합칩니다. ' + lines.join('; ') + '.' + (d === 1 ? '' : ' 합친 조각도 정렬된 상태이므로 다음 단계에서 같은 방식으로 합칩니다.')));
        }
        MERGE_STEPS.push(mstep(lv, DEPTH + 1, sorted, -1, '정렬 완료: ' + listText(lv[0]), '전체 비교 ' + total + '번', 'O(n log n)', '정리 — 배열을 log2 ' + N + ' = ' + DEPTH + '번 절반으로 나누고, 올라오면서 각 단계에서 전체 원소를 한 번씩 합쳤습니다. 합치는 비용이 단계마다 최대 n이고 단계가 log n개라서 O(n log n)입니다.'));
    })();

    /* ===================== 데이터: 거듭제곱 ===================== */
    var POW_STEPS = [];
    var POW_X = 2;
    var POW_N = 13;
    function pstep(frames, cur, mult, cap, cap2, cap3, log) {
        return { kind: 'pow', frames: frames.map(function (f) { return { n: f.n, res: f.res, note: f.note }; }), cur: cur, mult: mult, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        var frames = [];
        var ns = [];
        var n = POW_N;
        var mult = 0;
        var i;
        while (true) {
            ns.push(n);
            if (n === 0) break;
            n = Math.floor(n / 2);
        }
        POW_STEPS.push(pstep([], -1, 0, POW_X + '^' + POW_N + ' 계산', '단순하게 곱하면 곱셈 ' + (POW_N - 1) + '번', '', 'x^n을 구할 때 x를 n번 곱하면 곱셈이 n - 1번 필요합니다. 분할정복은 x^n = x^⌊n/2⌋ × x^⌊n/2⌋로 지수를 절반씩 줄이고, n이 홀수이면 x를 한 번 더 곱합니다. ' + POW_X + '^' + POW_N + '을 호출이 쌓이는 모습으로 봅니다.'));
        for (i = 0; i < ns.length; i++) {
            frames.push({ n: ns[i], res: null, note: '' });
            POW_STEPS.push(pstep(frames, i, mult, 'pow(' + POW_X + ', ' + ns[i] + ') 호출', ns[i] === 0 ? '지수 0 → 기저 사례' : 'pow(' + POW_X + ', ' + Math.floor(ns[i] / 2) + ')을 먼저 구해야 함', '', ns[i] === 0 ? 'pow(' + POW_X + ', 0)은 곱할 것이 없는 기저 사례라 바로 1을 돌려줍니다.' : 'pow(' + POW_X + ', ' + ns[i] + ')을 구하려면 지수를 절반으로 줄인 pow(' + POW_X + ', ' + Math.floor(ns[i] / 2) + ')이 먼저 필요합니다. 새 호출을 쌓습니다.'));
        }
        frames[frames.length - 1].res = 1;
        POW_STEPS.push(pstep(frames, frames.length - 1, mult, 'pow(' + POW_X + ', 0) = 1', '기저 사례에서 돌아가기 시작', '', '기저 사례 pow(' + POW_X + ', 0) = 1을 얻었습니다. 이제 쌓인 호출이 아래에서 위로 하나씩 결과를 계산하며 돌아갑니다.'));
        for (i = frames.length - 2; i >= 0; i--) {
            var h = frames[i + 1].res;
            var nn = frames[i].n;
            var r = h * h;
            var text = 'h × h = ' + h + ' × ' + h + ' = ' + r;
            mult++;
            if (nn % 2 === 1) {
                text += ', n이 홀수라 × ' + POW_X + ' = ' + (r * POW_X);
                r = r * POW_X;
                mult++;
            }
            frames[i].res = r;
            frames[i].note = text;
            POW_STEPS.push(pstep(frames, i, mult, 'pow(' + POW_X + ', ' + nn + ') = ' + r, '누적 곱셈 ' + mult + '번', '', 'pow(' + POW_X + ', ' + Math.floor(nn / 2) + ') = ' + h + '이므로 ' + text + '. 이 호출의 결과는 ' + r + '입니다. 지금까지 곱셈 ' + mult + '번.'));
        }
        POW_STEPS.push(pstep(frames, 0, mult, POW_X + '^' + POW_N + ' = ' + frames[0].res, '곱셈 ' + mult + '번 (단순 ' + (POW_N - 1) + '번)', 'O(log n)', '정리 — ' + POW_X + '^' + POW_N + ' = ' + frames[0].res + '입니다. 지수가 절반씩 줄어 호출이 ' + frames.length + '단계였고, 이 코드로 센 곱셈은 ' + mult + '번입니다. 지수 n이 두 배가 될 때마다 단계가 하나 늘어나므로 곱셈 횟수는 O(log n)입니다.'));
    })();

    /* ===================== 데이터: 비용 트리 ===================== */
    var COST_STEPS = [];
    function cstep(vis, cap, cap2, cap3, log) {
        return { kind: 'cost', vis: vis, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        var d;
        COST_STEPS.push(cstep(0, '점화식 T(n) = 2T(n/2) + n', '두 조각을 푸는 비용 + 합치는 비용 n', '', '분할정복의 시간은 점화식으로 셉니다. 병합 정렬은 문제를 절반 크기 둘로 나누어 각각 풀고(2T(n/2)), 합치는 데 n만큼 듭니다. 이 점화식을 재귀 트리로 펼쳐 단계마다 비용을 더합니다. n = ' + N + '입니다.'));
        for (d = 0; d <= DEPTH; d++) {
            var cnt = Math.pow(2, d);
            var size = N / cnt;
            var leaf = d === DEPTH;
            COST_STEPS.push(cstep(d + 1, (leaf ? '맨 아래 ' : d + '단계: ') + '조각 ' + cnt + '개 × ' + (leaf ? '기저 비용 1' : '합치기 ' + size), (leaf ? '합 ' + cnt + ' (기저 사례)' : '합 ' + cnt + ' × ' + size + ' = ' + N), '', (leaf ? '맨 아래 단계에는 크기 1인 조각이 ' + cnt + '개 있고 각각 기저 사례로 비용 1입니다. 합은 ' + cnt + '입니다.' : d + '단계에는 크기 ' + size + '인 조각이 ' + cnt + '개 있고, 각 조각을 합치는 비용이 조각 크기 ' + size + '이므로 이 단계의 합은 ' + cnt + ' × ' + size + ' = ' + N + '입니다. 조각 수가 두 배가 되어도 조각 크기가 절반이라 단계마다 합은 n으로 같습니다.')));
        }
        COST_STEPS.push(cstep(DEPTH + 1, 'T(' + N + ') = ' + (N * DEPTH + N), '합치기 ' + DEPTH + '단계 × ' + N + ' + 기저 ' + N + ' = n log2 n + n', 'Θ(n log n)', '정리 — 합치기 단계가 log2 ' + N + ' = ' + DEPTH + '개이고 단계마다 n이므로 합치기 비용은 n log2 n = ' + (N * DEPTH) + ', 여기에 기저 사례 ' + N + '을 더해 T(' + N + ') = ' + (N * DEPTH + N) + '입니다. n이 커지면 n log n이 지배하므로 Θ(n log n)입니다. 같은 모양의 점화식은 마스터 정리로도 풀 수 있고, 이진 탐색처럼 한쪽만 푸는 T(n) = T(n/2) + 1은 O(log n)이 됩니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'merge';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'power') return POW_STEPS;
        if (mode === 'cost') return COST_STEPS;
        return MERGE_STEPS;
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
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 분할정복 그리기 ===================== */
    function drawMerge(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var gap = mob ? 5 : 8;
        var cw = Math.min(42, (w - 4 - 7 * gap) / N);
        var rh = mob ? 52 : 58;
        var ch = mob ? 30 : 34;
        var d;
        var i;
        for (d = 0; d < s.vis; d++) {
            var segs = Math.pow(2, d);
            var size = N / segs;
            var rowW = N * cw + (segs - 1) * gap;
            var ox = x0 + (w - rowW) / 2;
            var y = top + 8 + d * rh;
            for (i = 0; i < N; i++) {
                var k = Math.floor(i / size);
                var bx = ox + i * cw + k * gap;
                var srt = s.sorted[d];
                var hot = s.hot === d;
                rr(bx + 1, y, cw - 2, ch, 3, srt ? P.green + '33' : P.teal + '22', hot ? P.yellow + 'ff' : srt ? P.green + 'ff' : P.sub + 'aa', hot ? 2.4 : 1.2);
                tx(String(s.lv[d][i]), bx + cw / 2, y + ch / 2, fs, P.text + 'ff', 'center', true);
            }
        }
        return top + 8 + s.vis * rh;
    }
    function drawPow(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var rh = mob ? 36 : 40;
        var i;
        for (i = 0; i < s.frames.length; i++) {
            var f = s.frames[i];
            var y = top + 8 + i * rh;
            var on = i === s.cur;
            rr(x0 + 4, y, w - 8, rh - 6, 4, f.res !== null ? P.green + '22' : P.teal + '18', on ? P.yellow + 'ff' : f.res !== null ? P.green + 'ff' : P.sub + 'aa', on ? 2.6 : 1.2);
            tx('pow(' + POW_X + ', ' + f.n + ')', x0 + 14, y + (rh - 6) / 2, fs, P.text + 'ff', 'left', true);
            tx(f.res === null ? '대기 중' : '= ' + f.res, x0 + w - 14, y + (rh - 6) / 2, fs, f.res === null ? P.sub + 'ff' : P.green + 'ff', 'right', true);
        }
        return top + 8 + Math.max(s.frames.length, 3) * rh;
    }
    function drawCost(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var rh = mob ? 52 : 58;
        var labW = 34;
        var bw = w - labW - 8;
        var d;
        var k;
        for (d = 0; d < s.vis; d++) {
            var cnt = Math.pow(2, d);
            var size = N / cnt;
            var y = top + 8 + d * rh;
            var leaf = d === DEPTH;
            tx('L' + d, x0 + 12, y + 17, fs, P.sub + 'ff', 'center', true);
            for (k = 0; k < cnt; k++) {
                var sw = bw / cnt;
                rr(x0 + labW + k * sw + 1, y, sw - 2, 34, 3, (leaf ? P.purple : P.teal) + '33', (leaf ? P.purple : P.teal) + 'ff', 1.2);
                tx(leaf ? '1' : String(size), x0 + labW + k * sw + sw / 2, y + 17, fs, P.text + 'ff', 'center', true);
            }
        }
        return top + 8 + Math.max(s.vis, 3) * rh;
    }
    function drawDC(x0, top, w, mob, step) {
        var s = step || (mode === 'power' ? POW_STEPS[0] : mode === 'cost' ? COST_STEPS[0] : MERGE_STEPS[0]);
        var fs = mob ? 11.5 : 13;
        var bottom = s.kind === 'pow' ? drawPow(x0, top, w, mob, s) : s.kind === 'cost' ? drawCost(x0, top, w, mob, s) : drawMerge(x0, top, w, mob, s);
        var at = bottom + 10;
        if (s.cap) tx(s.cap, x0 + w / 2, at, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, at + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, at + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        drawDC(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 분할정복의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 330 : 350;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'power') return '지수를 절반씩 줄이는 분할정복 거듭제곱을 봅니다.';
        if (mode === 'cost') return '점화식 T(n) = 2T(n/2) + n을 재귀 트리로 펼쳐 비용을 더해 봅니다.';
        return '배열을 절반씩 나누고 정렬된 조각을 합치며 올라가는 병합 정렬을 봅니다.';
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
        running = false; stepIdx = -1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('dc-viz__speed-btn--active'); });
        btn.classList.add('dc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dc-viz__mode-btn--active', d.key === m); });
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