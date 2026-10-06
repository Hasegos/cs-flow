/**
 * 접미사 배열 시각화
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
    var root    = el('div', 'sa-viz');
    var toolbar = el('div', 'sa-viz__toolbar');
    var tbLeft  = el('div', 'sa-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sa-viz__title', 'SUFFIX ARRAY'));

    var modeWrap = el('div', 'sa-viz__mode');
    var modeDefs = [
        { key: 'build', label: '구성' },
        { key: 'search', label: '패턴 검색' },
        { key: 'lcp', label: 'LCP 배열' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sa-viz__mode-btn' + (i === 0 ? ' sa-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sa-viz__speed');
    speedWrap.appendChild(el('span', 'sa-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'sa-viz__speed-btn' + (i === 0 ? ' sa-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sa-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sa-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sa-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sa-viz__controls');
    var btnPlay  = el('button', 'sa-viz__btn sa-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sa-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sa-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 접미사 배열 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var TEXT = 'banana';
    var N = TEXT.length;
    var SUF = [];
    for (var si = 0; si < N; si++) SUF.push(TEXT.slice(si));
    var SA = [];
    for (var sj = 0; sj < N; sj++) SA.push(sj);
    SA.sort(function (a, b) { return SUF[a] < SUF[b] ? -1 : (SUF[a] > SUF[b] ? 1 : 0); });
    function commonLen(a, b) {
        var k = 0;
        while (k < a.length && k < b.length && a[k] === b[k]) k++;
        return k;
    }
    var LCP = [0];
    for (var li = 1; li < N; li++) LCP.push(commonLen(SUF[SA[li - 1]], SUF[SA[li]]));
    function astep(layout, o) {
        var s = { layout: layout, placed: 0, lo: -1, hi: -1, mid: -1, found: [], pair: -1, lcpAll: false, cap: '', cap2: '', cap3: '', log: '' };
        for (var k in o) s[k] = o[k];
        return s;
    }

    /* ===================== 데이터: 구성 ===================== */
    var BUILD_STEPS = [];
    BUILD_STEPS.push(astep('build', { placed: 0, log: '접미사 배열(suffix array)은 문자열의 모든 접미사를 사전순으로 정렬했을 때 각 접미사가 시작하는 인덱스를 차례로 적은 배열입니다. 문자열 "' + TEXT + '"의 접미사는 ' + N + '개이고, 왼쪽이 시작 인덱스 순서 그대로입니다.' }));
    for (var bi = 0; bi < N; bi++) {
        (function (r) {
            BUILD_STEPS.push(astep('build', {
                placed: r + 1,
                cap: '사전순 ' + (r + 1) + '번째 · 시작 인덱스 ' + SA[r],
                cap2: 'SA = [' + SA.slice(0, r + 1).join(', ') + (r + 1 < N ? ', ...' : '') + ']',
                log: '아직 놓지 않은 접미사 가운데 사전순으로 가장 앞선 것은 "' + SUF[SA[r]] + '"(인덱스 ' + SA[r] + ')입니다. 정렬 결과의 ' + (r + 1) + '번째 자리에 인덱스 ' + SA[r] + ju(SA[r], '을', '를') + ' 적습니다.'
            }));
        })(bi);
    }
    BUILD_STEPS.push(astep('build', { placed: N, cap: 'SA = [' + SA.join(', ') + ']', cap2: '접미사 ' + N + '개 · 원본 문자열은 그대로', log: '정리 — 접미사 배열은 [' + SA.join(', ') + ']입니다. 접미사 문자열을 모두 저장하지 않고 시작 인덱스만 저장하므로 결과 배열의 공간이 O(n)입니다. 단순하게 정렬해 만들면 비교 비용 때문에 O(n^2 log n)까지 걸릴 수 있어 실제로는 더 빠른 구축 알고리즘을 씁니다.' }));

    /* ===================== 데이터: 패턴 검색 ===================== */
    var PAT = 'ana';
    function lessThanPat(i) { return SUF[SA[i]].slice(0, PAT.length) < PAT; }
    function greaterThanPat(i) { return SUF[SA[i]].slice(0, PAT.length) > PAT; }
    var SEARCH_STEPS = [];
    SEARCH_STEPS.push(astep('table', { log: '패턴 "' + PAT + '"의 출현 위치를 찾습니다. 접미사가 사전순으로 정렬돼 있으므로 패턴으로 시작하는 접미사들은 배열에서 연속된 구간을 이룹니다. 이진 탐색으로 그 구간의 시작과 끝을 찾습니다.' }));
    var lo = 0;
    var hi = N;
    while (lo < hi) {
        var mid = Math.floor((lo + hi) / 2);
        var less = lessThanPat(mid);
        var pre = SUF[SA[mid]].slice(0, PAT.length);
        SEARCH_STEPS.push(astep('table', {
            lo: lo, hi: hi, mid: mid,
            cap: '시작 찾기 · 가운데 ' + mid + ' = "' + SUF[SA[mid]] + '"',
            cap2: '앞 ' + PAT.length + '글자 "' + pre + '" ' + (less ? '< ' : '≥ ') + '"' + PAT + '"',
            log: '구간 [' + lo + ', ' + hi + ')의 가운데는 ' + mid + '번 접미사 "' + SUF[SA[mid]] + '"입니다. 앞 ' + PAT.length + '글자 "' + pre + '"' + (less ? '는 "' + PAT + '"보다 작으므로 오른쪽 절반으로 좁힙니다.' : '는 "' + PAT + '" 이상이므로 왼쪽 절반(가운데 포함)으로 좁힙니다.')
        }));
        if (less) lo = mid + 1; else hi = mid;
    }
    var LOWER = lo;
    SEARCH_STEPS.push(astep('table', { lo: LOWER, hi: LOWER + 1, mid: -1, cap: '시작 위치 = ' + LOWER, log: '구간이 하나로 좁혀졌습니다. 패턴 "' + PAT + '" 이상인 첫 접미사는 ' + LOWER + '번입니다.' }));
    lo = LOWER;
    hi = N;
    while (lo < hi) {
        var mid2 = Math.floor((lo + hi) / 2);
        var gt = greaterThanPat(mid2);
        var pre2 = SUF[SA[mid2]].slice(0, PAT.length);
        SEARCH_STEPS.push(astep('table', {
            lo: lo, hi: hi, mid: mid2,
            cap: '끝 찾기 · 가운데 ' + mid2 + ' = "' + SUF[SA[mid2]] + '"',
            cap2: '앞 ' + PAT.length + '글자 "' + pre2 + '" ' + (gt ? '> ' : '≤ ') + '"' + PAT + '"',
            log: '구간 [' + lo + ', ' + hi + ')의 가운데는 ' + mid2 + '번 접미사 "' + SUF[SA[mid2]] + '"입니다. 앞 ' + PAT.length + '글자 "' + pre2 + '"' + (gt ? '는 "' + PAT + '"보다 크므로 왼쪽으로 좁힙니다.' : '는 "' + PAT + '"보다 크지 않으므로 오른쪽으로 좁힙니다.')
        }));
        if (gt) hi = mid2; else lo = mid2 + 1;
    }
    var UPPER = lo;
    var FOUND = [];
    for (var fi = LOWER; fi < UPPER; fi++) FOUND.push(fi);
    var OCC = FOUND.map(function (r) { return SA[r]; }).sort(function (a, b) { return a - b; });
    SEARCH_STEPS.push(astep('table', { found: FOUND, cap: '구간 [' + LOWER + ', ' + UPPER + ') · ' + FOUND.length + '개', cap2: '출현 위치 ' + OCC.join(', '), log: '패턴으로 시작하는 접미사의 구간은 [' + LOWER + ', ' + UPPER + ')이고 ' + FOUND.length + '개입니다. SA의 값 ' + FOUND.map(function (r) { return SA[r]; }).join(', ') + '이 출현 위치이며, 작은 순으로 ' + OCC.join(', ') + '번입니다.' }));
    SEARCH_STEPS.push(astep('table', { found: FOUND, cap: '이진 탐색 2번 · 문자열 전체를 훑지 않음', log: '정리 — 이진 탐색을 두 번 해서 구간을 찾았으므로 접미사를 하나하나 훑지 않습니다. 비교 한 번에 패턴 길이만큼 글자를 보므로 패턴 길이를 m이라 하면 대략 O(m log n)입니다.' }));

    /* ===================== 데이터: LCP 배열 ===================== */
    var LCP_STEPS = [];
    LCP_STEPS.push(astep('table', { pair: -1, log: 'LCP 배열은 사전순으로 이웃한 두 접미사가 앞에서부터 몇 글자까지 같은지(최장 공통 접두사, Longest Common Prefix)를 적은 배열입니다. 정렬된 접미사에서 이웃한 쌍을 위에서부터 비교합니다.' }));
    for (var pi = 1; pi < N; pi++) {
        (function (r) {
            var a = SUF[SA[r - 1]];
            var b = SUF[SA[r]];
            LCP_STEPS.push(astep('table', {
                pair: r,
                cap: '"' + a + '"와 "' + b + '"',
                cap2: '공통 접두사 ' + LCP[r] + '글자' + (LCP[r] ? ' "' + b.slice(0, LCP[r]) + '"' : ''),
                cap3: 'LCP = [' + LCP.slice(0, r + 1).join(', ') + (r + 1 < N ? ', ...' : '') + ']',
                log: '사전순 ' + (r - 1) + '번 "' + a + '"와 ' + r + '번 "' + b + '"를 앞에서부터 비교하면 ' + (LCP[r] ? LCP[r] + '글자 "' + b.slice(0, LCP[r]) + '"까지 같습니다.' : '첫 글자부터 다릅니다.') + ' LCP[' + r + '] = ' + LCP[r] + '입니다.'
            }));
        })(pi);
    }
    var MAXL = 0;
    var MAXI = 0;
    for (var mi = 1; mi < N; mi++) { if (LCP[mi] > MAXL) { MAXL = LCP[mi]; MAXI = mi; } }
    var SUMLCP = LCP.reduce(function (s, v) { return s + v; }, 0);
    var DISTINCT = N * (N + 1) / 2 - SUMLCP;
    LCP_STEPS.push(astep('table', {
        pair: MAXI,
        lcpAll: true,
        cap: '가장 긴 반복 부분 문자열 "' + SUF[SA[MAXI]].slice(0, MAXL) + '" (' + MAXL + '글자)',
        cap2: '서로 다른 부분 문자열 ' + (N * (N + 1) / 2) + ' - ' + SUMLCP + ' = ' + DISTINCT + '개',
        log: '정리 — LCP의 최댓값 ' + MAXL + '이 가장 긴 반복 부분 문자열의 길이이고, 그 문자열은 "' + SUF[SA[MAXI]].slice(0, MAXL) + '"입니다. 서로 다른 부분 문자열의 개수는 접미사의 전체 접두사 수 ' + (N * (N + 1) / 2) + '개에서 LCP의 합 ' + SUMLCP + '을 뺀 ' + DISTINCT + '개입니다.'
    }));

    /* ===================== 상태 ===================== */
    var mode    = 'build';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'lcp') return LCP_STEPS;
        return BUILD_STEPS;
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

    /* ===================== 공통: 접미사 목록 그리기 ===================== */
    function drawSA(x0, top, w, mob, step) {
        var fs = mob ? 11.5 : 13;
        var rh = mob ? 27 : 30;
        var layout = step ? step.layout : 'table';
        var placed = step ? step.placed : 0;
        var i;
        if (layout === 'build') {
            var half = w / 2 - 6;
            tx('인덱스 순서', x0 + 2, top + 8, fs - 1, P.sub + 'ee', 'left', true);
            tx('사전순 정렬 결과', x0 + w / 2 + 8, top + 8, fs - 1, P.sub + 'ee', 'left', true);
            var placedStart = {};
            for (i = 0; i < placed; i++) placedStart[SA[i]] = true;
            for (i = 0; i < N; i++) {
                var y = top + 28 + i * rh;
                var done = placedStart[i];
                var col = done ? P.green : P.teal;
                rr(x0, y, half, rh - 4, 4, col + '22', col + (done ? 'ff' : 'aa'), 1.3);
                tx(i + '', x0 + 14, y + (rh - 4) / 2, fs, P.sub + 'ff', 'center', true);
                tx(SUF[i], x0 + 30, y + (rh - 4) / 2, fs, (done ? P.sub : P.text) + 'ff', 'left', true);
            }
            for (i = 0; i < N; i++) {
                var y2 = top + 28 + i * rh;
                if (i < placed) {
                    var cur = i === placed - 1;
                    var col2 = cur ? P.yellow : P.teal;
                    rr(x0 + w / 2 + 6, y2, half, rh - 4, 4, col2 + '30', col2 + 'ff', cur ? 2.2 : 1.3);
                    tx(String(SA[i]), x0 + w / 2 + 6 + 16, y2 + (rh - 4) / 2, fs, P.orange + 'ff', 'center', true);
                    tx(SUF[SA[i]], x0 + w / 2 + 6 + 34, y2 + (rh - 4) / 2, fs, P.text + 'ff', 'left', true);
                } else {
                    rr(x0 + w / 2 + 6, y2, half, rh - 4, 4, 'none', P.sub + '55', 1);
                }
            }
        } else {
            var lo2 = step ? step.lo : -1;
            var hi2 = step ? step.hi : -1;
            var mid = step ? step.mid : -1;
            var found = step ? step.found : [];
            var pair = step ? step.pair : -1;
            var cRank = x0 + 12;
            var cSA = x0 + w * 0.2;
            var cSuf = x0 + w * 0.34;
            var cLcp = x0 + w - 14;
            tx('순위', cRank, top + 8, fs - 1.5, P.sub + 'ee', 'center', true);
            tx('SA', cSA, top + 8, fs - 1.5, P.sub + 'ee', 'center', true);
            tx('접미사', cSuf, top + 8, fs - 1.5, P.sub + 'ee', 'left', true);
            if (mode === 'lcp') tx('LCP', cLcp, top + 8, fs - 1.5, P.sub + 'ee', 'center', true);
            for (i = 0; i < N; i++) {
                var yy = top + 28 + i * rh;
                var inRange = lo2 >= 0 && i >= lo2 && i < hi2;
                var isMid = i === mid;
                var isFound = found.indexOf(i) >= 0;
                var rc = P.teal;
                if (lo2 >= 0 && !inRange) rc = P.sub;
                if (isFound) rc = P.green;
                if (pair >= 0 && (i === pair || i === pair - 1)) rc = P.orange;
                if (isMid) rc = P.yellow;
                var dim = lo2 >= 0 && !inRange && !isFound;
                rr(x0, yy, w, rh - 4, 4, dim ? 'none' : rc + '26', rc + (dim ? '66' : 'ff'), isMid || isFound ? 2.2 : 1.2);
                var cy = yy + (rh - 4) / 2;
                tx(String(i), cRank, cy, fs, P.sub + 'ff', 'center', true);
                tx(String(SA[i]), cSA, cy, fs, P.orange + 'ff', 'center', true);
                var s = SUF[SA[i]];
                var cl = 0;
                if (pair >= 0 && i === pair) cl = LCP[pair];
                if (pair >= 0 && i === pair - 1) cl = LCP[pair];
                if (isFound) cl = PAT.length;
                if (cl > 0) {
                    tx(s.slice(0, cl), cSuf, cy, fs, P.green + 'ff', 'left', true);
                    var pw = ctx.measureText(s.slice(0, cl)).width;
                    if (s.length > cl) tx(s.slice(cl), cSuf + pw, cy, fs, P.text + 'ff', 'left', true);
                } else {
                    tx(s, cSuf, cy, fs, P.text + 'ff', 'left', true);
                }
                var showL = mode === 'lcp' && step && (step.lcpAll || (pair >= 0 && i <= pair));
                if (i > 0 && showL) tx(String(LCP[i]), cLcp, cy, fs, P.yellow + 'ff', 'center', true);
            }
        }
        var capY = top + 28 + N * rh + 14;
        if (step && step.cap) tx(step.cap, x0 + w / 2, capY, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, capY + 19, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, capY + 38, fs - 1, P.green + 'ee', 'center', true);
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

        drawSA(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 접미사 배열의 동작을 확인하세요.';
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
        neededH = mob ? 310 : 330;
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
        if (mode === 'search') return '정렬된 접미사에서 이진 탐색으로 패턴이 시작하는 구간을 찾습니다.';
        if (mode === 'lcp') return '이웃한 접미사의 공통 접두사 길이를 LCP 배열로 정리합니다.';
        return '접미사를 사전순으로 정렬해 시작 인덱스만 모으는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('sa-viz__speed-btn--active'); });
        btn.classList.add('sa-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sa-viz__mode-btn--active', d.key === m); });
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