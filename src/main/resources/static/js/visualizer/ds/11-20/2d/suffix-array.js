/**
 * 접미사 배열 시각화 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'build';
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
    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'lcp') return LCP_STEPS;
        return BUILD_STEPS;
    }
    function defaultLog() {
        if (mode === 'search') return '정렬된 접미사에서 이진 탐색으로 패턴이 시작하는 구간을 찾습니다.';
        if (mode === 'lcp') return '이웃한 접미사의 공통 접두사 길이를 LCP 배열로 정리합니다.';
        return '접미사를 사전순으로 정렬해 시작 인덱스만 모으는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var saLayMemo = {};
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function saFs(mob) {
        if (mob) return { body: 11.5, small: 11 };
        return { body: 13, small: 12 };
    }
    function saCapParts(s, w, S) {
        var out = [];
        if (s.cap) lines(s.cap, w - 8, S.body).forEach(function (str) { out.push({ t: str, c: P.yellow + 'ff', b: true, f: S.body }); });
        if (s.cap2) lines(s.cap2, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.text + 'ee', b: false, f: S.small }); });
        if (s.cap3) lines(s.cap3, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.green + 'ff', b: true, f: S.small }); });
        return out;
    }
    function saCapH(w, S) {
        var mx = 0;
        currentSteps().forEach(function (s) {
            var h = 0;
            saCapParts(s, w, S).forEach(function (pt) { h += pt.f + 5; });
            if (h > mx) mx = h;
        });
        return mx;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + (mob ? 'm' : 'd');
        if (saLayMemo[key]) return saLayMemo[key];
        var S = saFs(mob);
        var rh = mob ? 24 : 28;
        var rowsTop = 24;
        var capTop = rowsTop + N * rh + 14;
        var gap = mob ? 14 : 28;
        var L = { S: S, rh: rh, rowsTop: rowsTop, colGap: gap, colW: (w - gap) / 2, capTop: capTop, total: capTop + saCapH(w, S) + 6 };
        saLayMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function saW(str, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function saTween(p, n, pOn, nOn, fresh, e) {
        var k = fresh ? ez(e) : 1;
        if (nOn && pOn) return { v: lerp(p, n, k), a: 1 };
        if (nOn) return { v: n, a: k };
        if (pOn) return { v: p, a: 1 - k };
        return { v: n, a: 0 };
    }
    function saBand(pv, now, fresh, e) {
        var pOn = fresh && pv.lo >= 0;
        var nOn = now.lo >= 0;
        var bLo = saTween(pv.lo, now.lo, pOn, nOn, fresh, e);
        var bHi = saTween(pv.hi, now.hi, pOn, nOn, fresh, e);
        return { lo: bLo.v, hi: bHi.v, a: bLo.a };
    }
    function saRowAlpha(k, band) {
        if (band.a <= 0) return 1;
        var inside = k + 0.5 >= band.lo && k + 0.5 < band.hi;
        return inside ? 1 : lerp(1, 0.4, band.a);
    }
    function saRankOf(v) {
        for (var q = 0; q < N; q++) if (SA[q] === v) return q;
        return -1;
    }
    function saChip(x, y, cw, ch, v, col, al, fs) {
        ctx.globalAlpha = al;
        rr(x, y, cw, ch, 4, col + '26', col + 'ff', 1.4);
        tx(String(v), x + 12, y + ch / 2, fs, P.orange + 'ff', 'center', true);
        tx(SUF[v], x + 26, y + ch / 2, fs, P.text + 'ff', 'left', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 그리기 ===================== */
    function saDrawBuild(x0, top, w, mob, L, now, pv, fresh, e) {
        var S = L.S;
        var rh = L.rh;
        var cH = rh - 4;
        var colW = L.colW;
        var rx = x0 + colW + L.colGap;
        var flying = fresh && now.placed > pv.placed ? now.placed - 1 : -1;
        var cur = now.placed - 1;
        var k;
        var y;
        tx('인덱스 순서', x0 + 2, top + 8, S.small, P.sub + 'ee', 'left', true);
        tx('사전순 정렬 결과', rx + 2, top + 8, S.small, P.sub + 'ee', 'left', true);
        for (k = 0; k < N; k++) {
            y = top + L.rowsTop + k * rh;
            var rk = saRankOf(k);
            if (rk === flying && e < 0.9) rr(x0, y, colW, cH, 4, P.yellow + '26', P.yellow + 'ff', 2.2);
            else if (rk < now.placed) rr(x0, y, colW, cH, 4, P.green + '22', P.green + 'ff', 1.3);
            else rr(x0, y, colW, cH, 4, 'none', P.sub + '55', 1);
            tx(String(k), x0 + 12, y + cH / 2, S.small, P.sub + 'ff', 'center', true);
            tx(SUF[k], x0 + 26, y + cH / 2, S.body, (rk < now.placed ? P.sub : P.text) + 'ff', 'left', true);
        }
        for (k = 0; k < N; k++) {
            y = top + L.rowsTop + k * rh;
            rr(rx, y, colW, cH, 4, 'none', P.sub + '55', 1);
        }
        for (k = 0; k < now.placed; k++) {
            y = top + L.rowsTop + k * rh;
            var al = k === flying ? ez(seg(e, 0.8, 1)) : 1;
            saChip(rx, y, colW, cH, SA[k], k === cur ? P.yellow : P.teal, al, S.body);
        }
        if (flying >= 0 && e < 1) {
            var sx = x0 + colW;
            var dx = rx;
            var gx = (sx + dx) / 2;
            var sy = top + L.rowsTop + SA[flying] * rh + cH / 2;
            var dy = top + L.rowsTop + flying * rh + cH / 2;
            var q1 = ez(seg(e, 0.05, 0.3));
            var q2 = ez(seg(e, 0.3, 0.65));
            var q3 = ez(seg(e, 0.65, 0.95));
            var h1 = lerp(sx, gx, q1);
            var px = q2 > 0 ? gx : h1;
            var py = sy;
            if (q2 > 0) py = lerp(sy, dy, q2);
            if (q3 > 0) { px = lerp(gx, dx, q3); py = dy; }
            ln(sx, sy, h1, sy, P.yellow + 'ff', 1.6);
            if (q2 > 0) ln(gx, sy, gx, lerp(sy, dy, q2), P.yellow + 'ff', 1.6);
            if (q3 > 0) ln(gx, dy, px, dy, P.yellow + 'ff', 1.6);
            circ(px, py, 4, P.yellow + 'ff', null, 0);
        }
    }
    function saDrawTable(x0, top, w, mob, L, now, pv, fresh, e) {
        var S = L.S;
        var rh = L.rh;
        var rowH = rh - 4;
        var fs = S.body;
        var isLcp = mode === 'lcp';
        var hasPair = now.pair >= 1;
        var cRank = x0 + 14;
        var cSA = x0 + w * 0.22;
        var cSuf = x0 + w * 0.36;
        var cLcp = x0 + w - 16;
        var cw = saW('a', fs);
        var band = saBand(pv, now, fresh, e);
        var fd = saTween(0, 1, fresh && pv.found.length > 0, now.found.length > 0, fresh, e);
        var md = saTween(pv.mid, now.mid, fresh && pv.mid >= 0, now.mid >= 0, fresh, e);
        var pr = saTween(pv.pair, now.pair, fresh && pv.pair >= 1, hasPair, fresh, e);
        var cl = hasPair ? LCP[now.pair] : 0;
        var minLen = hasPair ? Math.min(SUF[SA[now.pair - 1]].length, SUF[SA[now.pair]].length) : 0;
        var total = hasPair ? cl + (cl < minLen ? 1 : 0) : 0;
        var scan = hasPair && fresh && pv.pair !== now.pair ? total * ez(seg(e, 0.1, 0.9)) : total;
        var k;
        function rowY(v) { return top + L.rowsTop + v * rh; }

        tx('순위', cRank, top + 8, S.small, P.sub + 'ee', 'center', true);
        tx('SA', cSA, top + 8, S.small, P.sub + 'ee', 'center', true);
        tx('접미사', cSuf, top + 8, S.small, P.sub + 'ee', 'left', true);
        if (isLcp) tx('LCP', cLcp, top + 8, S.small, P.sub + 'ee', 'center', true);

        if (band.a > 0) {
            ctx.globalAlpha = band.a;
            rr(x0, rowY(band.lo), w, (band.hi - band.lo) * rh - 4, 4, P.teal + '1f', P.teal + 'aa', 1.2);
            ctx.globalAlpha = 1;
        }
        if (isLcp && pr.a > 0) {
            var pTop = rowY(pr.v - 1) - 2;
            var pBot = rowY(pr.v) + rowH + 2;
            ctx.globalAlpha = pr.a;
            rr(x0 - 2, pTop, w + 4, pBot - pTop, 5, P.orange + '14', P.orange + 'ff', 1.6);
            ctx.globalAlpha = 1;
        }
        for (k = 0; k < N; k++) {
            var y = rowY(k);
            var cy = y + rowH / 2;
            var sfx = SUF[SA[k]];
            var isFound = now.found.indexOf(k) >= 0;
            var inPair = hasPair && (k === now.pair || k === now.pair - 1);
            var ra = saRowAlpha(k, band);
            ctx.globalAlpha = ra;
            rr(x0, y, w, rowH, 4, 'none', P.sub + '66', 1);
            if (isFound) {
                ctx.globalAlpha = ra * fd.a;
                rr(x0, y, w, rowH, 4, P.green + '33', P.green + 'ff', 2);
                ctx.globalAlpha = ra;
            }
            if (isFound && !isLcp && fd.a > 0) {
                rr(cSuf - 2, y + 2, saW(sfx.slice(0, PAT.length), fs) * fd.a + 4, rowH - 4, 3, P.green + '66', 'none', 1);
            }
            if (inPair && scan > 0) {
                var gw = cw * Math.min(scan, cl);
                if (gw > 0) rr(cSuf - 2, y + 2, gw + 4, rowH - 4, 3, P.green + '55', 'none', 1);
                if (cl < minLen && scan > cl) rr(cSuf + cl * cw - 1, y + 2, cw + 2, rowH - 4, 3, P.red + '77', 'none', 1);
            }
            ctx.globalAlpha = ra;
            tx(String(k), cRank, cy, S.small, (isFound ? P.green : P.sub) + 'ff', 'center', true);
            tx(String(SA[k]), cSA, cy, fs, P.orange + 'ff', 'center', true);
            tx(sfx, cSuf, cy, fs, P.text + 'ff', 'left', true);
            if (isLcp && k > 0 && (now.lcpAll || k <= now.pair)) {
                ctx.globalAlpha = fresh && k === now.pair && pv.pair < now.pair ? ez(seg(e, 0.6, 1)) : 1;
                tx(String(LCP[k]), cLcp, cy, fs, P.yellow + 'ff', 'center', true);
            }
            ctx.globalAlpha = 1;
        }
        if (md.a > 0) {
            ctx.globalAlpha = md.a;
            rr(x0 - 1, rowY(md.v) - 1, w + 2, rowH + 2, 5, 'none', P.yellow + 'ff', 2.2);
        }
        if (isLcp && now.lcpAll) {
            ctx.globalAlpha = fresh ? ez(seg(e, 0.4, 1)) : 1;
            rr(cLcp - 15, rowY(now.pair) + 1, 30, rowH - 2, 4, 'none', P.yellow + 'ff', 2);
        }
        if (hasPair && fresh && scan > 0 && scan < total) {
            var cx = cSuf + scan * cw;
            ctx.globalAlpha = 1;
            ln(cx, rowY(now.pair - 1) - 2, cx, rowY(now.pair) + rowH + 2, P.yellow + 'ff', 1.6);
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var now = step || currentSteps()[0];
        var pv = prev || now;
        var fresh = now !== pv;
        var L = layout(w, mob);
        if (mode === 'build') saDrawBuild(x0, top, w, mob, L, now, pv, fresh, e);
        else saDrawTable(x0, top, w, mob, L, now, pv, fresh, e);
        var parts = saCapParts(now, w, L.S);
        var cy = top + L.capTop;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        parts.forEach(function (pt) {
            tx(pt.t, x0 + w / 2, cy + (pt.f + 5) / 2, pt.f, pt.c, 'center', pt.b);
            cy += pt.f + 5;
        });
        ctx.globalAlpha = 1;
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