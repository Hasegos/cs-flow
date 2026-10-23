/**
 * 동적 프로그래밍(DP) 기초 시각화 — 피보나치 수열 시각화
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
    var root    = el('div', 'dp-viz');
    var toolbar = el('div', 'dp-viz__toolbar');
    var tbLeft  = el('div', 'dp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dp-viz__title', 'DP'));

    var modeWrap = el('div', 'dp-viz__mode');
    var modeDefs = [
        { key: 'naive', label: '완전 탐색' },
        { key: 'memo', label: '메모이제이션' },
        { key: 'tab', label: '타뷸레이션' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dp-viz__mode-btn' + (i === 0 ? ' dp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dp-viz__speed');
    speedWrap.appendChild(el('span', 'dp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dp-viz__speed-btn' + (i === 0 ? ' dp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dp-viz__controls');
    var btnPlay  = el('button', 'dp-viz__btn dp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dp-viz__btn', '↺ RESET');
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
    var mode    = 'naive';
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

    /* ===================== 피보나치 호출 트리 정의 (fib(5) 고정) ===================== */
    var FIB_N = 5;

    function buildFibTree(n, path) {
        path = path || '';
        var node = { id: path || 'root', n: n, path: path, children: [] };
        if (n > 1) {
            node.children.push(buildFibTree(n - 1, path + 'L'));
            node.children.push(buildFibTree(n - 2, path + 'R'));
        }
        return node;
    }
    var TREE_ROOT = buildFibTree(FIB_N, '');
    var NODES = {};
    var EDGES = [];
    (function assignLayout() {
        var leafCounter = { count: 0 };
        function assignX(node) {
            if (node.children.length === 0) {
                node.xRaw = leafCounter.count;
                leafCounter.count++;
            } else {
                node.children.forEach(assignX);
                var xs = node.children.map(function (c) { return c.xRaw; });
                node.xRaw = (xs[0] + xs[xs.length - 1]) / 2;
            }
            node.depth = node.path.length;
        }
        assignX(TREE_ROOT);

        var all = [];
        function collect(node, parentId) {
            all.push(node);
            NODES[node.id] = node;
            if (parentId) EDGES.push([parentId, node.id]);
            node.children.forEach(function (c) { collect(c, node.id); });
        }
        collect(TREE_ROOT, null);

        var maxLeafIdx = Math.max(1, leafCounter.count - 1);
        var maxDepth   = Math.max.apply(null, all.map(function (n) { return n.depth; }));
        all.forEach(function (node) {
            node.nx = node.xRaw / maxLeafIdx;
            node.ny = maxDepth > 0 ? node.depth / maxDepth : 0;
        });
    })();

    /* ===================== 완전 탐색 스텝 ===================== */
    function buildNaiveSteps() {
        var steps = [];
        var entered = [], returned = [], resultById = {};
        var callCount = 0;
        steps.push({ type: 'intro', id: null, entered: [], returned: [], resultById: {}, callCount: 0,
            log: '완전 탐색(재귀): fib(n) = fib(n-1) + fib(n-2)를 그대로 재귀 호출합니다. 같은 부분 문제를 몇 번이고 다시 계산합니다.' });

        function dfs(node) {
            callCount++;
            entered.push(node.id);
            steps.push({ type: 'enter', id: node.id, n: node.n, entered: entered.slice(), returned: returned.slice(),
                resultById: copyObj(resultById), callCount: callCount,
                log: 'fib(' + node.n + ') 호출 (누적 호출 수: ' + callCount + ')' });

            var value;
            if (node.n <= 1) {
                value = node.n;
            } else {
                var lv = dfs(node.children[0]);
                var rv = dfs(node.children[1]);
                value = lv + rv;
            }
            resultById[node.id] = value;
            returned.push(node.id);
            steps.push({ type: 'return', id: node.id, n: node.n, value: value, entered: entered.slice(), returned: returned.slice(),
                resultById: copyObj(resultById), callCount: callCount,
                log: node.n <= 1
                    ? ('기저 사례: fib(' + node.n + ') = ' + value)
                    : ('fib(' + node.n + ') = fib(' + (node.n - 1) + ') + fib(' + (node.n - 2) + ') = ' + value + ' 반환') });
            return value;
        }

        var result = dfs(TREE_ROOT);
        steps.push({ type: 'done', id: null, entered: entered.slice(), returned: returned.slice(),
            resultById: copyObj(resultById), callCount: callCount,
            log: '완료: fib(' + FIB_N + ') = ' + result + '. 총 호출 횟수 ' + callCount + '회 — 같은 부분 문제를 반복 계산하는 지수 시간 O(2ⁿ)입니다.' });
        return steps;
    }

    /* ===================== 메모이제이션 스텝 ===================== */
    function buildMemoSteps() {
        var steps = [];
        var memo = {};
        var entered = [], returned = [], cacheHit = [], resultById = {};
        var computeCount = 0, cacheHitCount = 0;
        steps.push({ type: 'intro', id: null, entered: [], returned: [], cacheHit: [], resultById: {}, memo: {}, computeCount: 0, cacheHitCount: 0,
            log: '메모이제이션(Top-down + 캐시): 처음 계산한 결과를 memo에 저장해두고, 같은 부분 문제가 다시 나오면 캐시에서 즉시 반환합니다.' });

        function dfs(node) {
            if (memo.hasOwnProperty(node.n)) {
                cacheHitCount++;
                entered.push(node.id);
                returned.push(node.id);
                cacheHit.push(node.id);
                resultById[node.id] = memo[node.n];
                steps.push({ type: 'cache-hit', id: node.id, n: node.n, value: memo[node.n],
                    entered: entered.slice(), returned: returned.slice(), cacheHit: cacheHit.slice(),
                    resultById: copyObj(resultById), memo: copyObj(memo), computeCount: computeCount, cacheHitCount: cacheHitCount,
                    log: 'fib(' + node.n + ')는 이미 memo에 있음 → 재귀 호출 없이 즉시 반환: ' + memo[node.n] });
                return memo[node.n];
            }

            computeCount++;
            entered.push(node.id);
            steps.push({ type: 'enter', id: node.id, n: node.n,
                entered: entered.slice(), returned: returned.slice(), cacheHit: cacheHit.slice(),
                resultById: copyObj(resultById), memo: copyObj(memo), computeCount: computeCount, cacheHitCount: cacheHitCount,
                log: 'fib(' + node.n + ') 호출 (memo에 없음 → 새로 계산)' });

            var value;
            if (node.n <= 1) {
                value = node.n;
            } else {
                var lv = dfs(node.children[0]);
                var rv = dfs(node.children[1]);
                value = lv + rv;
            }
            memo[node.n] = value;
            resultById[node.id] = value;
            returned.push(node.id);
            steps.push({ type: 'return', id: node.id, n: node.n, value: value,
                entered: entered.slice(), returned: returned.slice(), cacheHit: cacheHit.slice(),
                resultById: copyObj(resultById), memo: copyObj(memo), computeCount: computeCount, cacheHitCount: cacheHitCount,
                log: node.n <= 1
                    ? ('기저 사례: fib(' + node.n + ') = ' + value + ' → memo에 저장')
                    : ('fib(' + node.n + ') = ' + value + ' → memo에 저장 후 반환') });
            return value;
        }

        var result = dfs(TREE_ROOT);
        steps.push({ type: 'done', id: null, entered: entered.slice(), returned: returned.slice(), cacheHit: cacheHit.slice(),
            resultById: copyObj(resultById), memo: copyObj(memo), computeCount: computeCount, cacheHitCount: cacheHitCount,
            log: '완료: fib(' + FIB_N + ') = ' + result + '. 실제 계산 ' + computeCount + '회 + 캐시 재사용 ' + cacheHitCount + '회 (완전 탐색 대비 호출이 크게 줄어든 O(n) 시간)' });
        return steps;
    }

    /* ===================== 타뷸레이션 스텝 ===================== */
    function buildTabSteps(n) {
        var steps = [];
        var dp = {}; dp[0] = 0; dp[1] = 1;
        var filled = [0, 1];
        steps.push({ type: 'init', filled: filled.slice(), dp: copyObj(dp),
            log: '기저 사례를 먼저 표에 채웁니다: dp[0] = 0, dp[1] = 1' });

        for (var i = 2; i <= n; i++) {
            var a = dp[i - 1], b = dp[i - 2];
            dp[i] = a + b;
            filled.push(i);
            steps.push({ type: 'compute', i: i, sources: [i - 1, i - 2], filled: filled.slice(), dp: copyObj(dp),
                log: 'dp[' + i + '] = dp[' + (i - 1) + '] + dp[' + (i - 2) + '] = ' + a + ' + ' + b + ' = ' + dp[i] });
        }

        steps.push({ type: 'done', filled: filled.slice(), dp: copyObj(dp),
            log: '완료: fib(' + n + ') = ' + dp[n] + '. 반복문 한 번으로 O(n) 시간. 표 전체 대신 직전 두 값만 저장하면 공간복잡도도 O(1)로 줄일 수 있습니다.' });
        return steps;
    }

    var NAIVE_STEPS = buildNaiveSteps();
    var MEMO_STEPS  = buildMemoSteps();
    var TAB_STEPS   = buildTabSteps(FIB_N);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'memo') return MEMO_STEPS;
        if (mode === 'tab') return TAB_STEPS;
        return NAIVE_STEPS;
    }
    function defaultLog() {
        if (mode === 'naive') return '▶ PLAY를 눌러 완전 탐색 재귀 과정을 확인하세요.';
        if (mode === 'memo') return '▶ PLAY를 눌러 메모이제이션 과정을 확인하세요.';
        return '▶ PLAY를 눌러 타뷸레이션 과정을 확인하세요.';
    }

    /* ===================== 데이터 보조 ===================== */
    function copyObj(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }
    function fbHas(arr, id) { return !!arr && arr.indexOf(id) >= 0; }
    function fbParentOf(id) {
        var p = null;
        EDGES.forEach(function (ed) { if (ed[1] === id) p = ed[0]; });
        return p;
    }
    function fbNaiveTotal() { return NAIVE_STEPS[NAIVE_STEPS.length - 1].callCount; }
    function fbCompareRows() {
        var naiveCalls = fbNaiveTotal();
        var memoLast = MEMO_STEPS[MEMO_STEPS.length - 1];
        var memoTotal = memoLast.computeCount + memoLast.cacheHitCount;
        var tabTotal = FIB_N + 1;
        var maxVal = Math.max(naiveCalls, memoTotal, tabTotal);
        return [
            { label: '완전 탐색', value: naiveCalls, sub: '재귀 함수 호출', col: P.sub, frac: naiveCalls / maxVal },
            { label: '메모이제이션', value: memoTotal, sub: '계산 ' + memoLast.computeCount + '회 + 캐시 ' + memoLast.cacheHitCount + '회', col: P.orange, frac: memoTotal / maxVal },
            { label: '타뷸레이션', value: tabTotal, sub: '반복문 (재귀 호출 0회)', col: P.teal, frac: tabTotal / maxVal },
        ];
    }

    /* ===================== 레이아웃 ===================== */
    function fbItems() {
        if (mode === 'tab') return [
            { col: P.teal, label: '계산됨' },
            { col: P.orange, label: '현재 계산' },
            { col: P.purple, label: '참조하는 값' },
            { col: P.muted, label: '아직' },
        ];
        var items = [
            { col: P.orange, label: '현재 호출' },
            { col: P.green, label: '방금 반환' },
            { col: P.teal, label: '반환 완료' },
        ];
        if (mode === 'memo') items.push({ col: P.purple, label: '캐시 재사용' });
        items.push({ col: P.muted, label: '아직/생략' });
        return items;
    }
    function fbLegend(w, mob) {
        var fs = mob ? 11 : 12;
        var sw = mob ? 9 : 10;
        var gapX = mob ? 12 : 18;
        var rowH = fs + 12;
        var pos = [];
        var x = 0;
        var y = 0;
        ctx.font = '500 ' + fs + 'px "JetBrains Mono",monospace';
        fbItems().forEach(function (it) {
            var need = sw + 5 + ctx.measureText(it.label).width;
            if (x > 0 && x + need > w) { x = 0; y += rowH; }
            pos.push({ x: x, y: y + rowH / 2, it: it });
            x += need + gapX;
        });
        return { pos: pos, fs: fs, sw: sw, h: y + rowH + 2 };
    }
    function layout(w, mob) {
        var leg = fbLegend(w, mob);
        var L = { leg: leg, treeTop: leg.h + 4, treeH: mob ? 230 : 300 };
        if (mode === 'tab') {
            L.bh = mob ? 44 : 52;
            L.cellTop = leg.h + 40;
            L.formulaY = L.cellTop + L.bh + 34;
            L.cmpTop = L.formulaY + 26;
            L.rowH = mob ? 36 : 28;
            L.total = L.cmpTop + 18 + 3 * L.rowH + 4;
        } else if (mode === 'memo') {
            L.titleY = L.treeTop + L.treeH + 14;
            L.cellTop = L.titleY + 12;
            L.bh = mob ? 40 : 48;
            L.statY = L.cellTop + L.bh + 14;
            L.total = L.statY + 14;
        } else {
            L.statY = L.treeTop + L.treeH + 6;
            L.total = L.statY + 14;
        }
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 그리기 보조 ===================== */
    function fbA(a) { var v = Math.round(clamp01(a) * 255); return (v < 16 ? '0' : '') + v.toString(16); }
    function fbEdge(a, b, col, alpha, lw) { ln(a.x, a.y, b.x, b.y, col + fbA(alpha), lw); }
    function fbChip(x, y, rad, col, label, a, mob) {
        if (a <= 0.01) return;
        circ(x, y, rad, col + fbA(a), col + fbA(a), 1.2);
        tx(String(label), x, y, mob ? 12 : 14, '#111111' + fbA(a), 'center', true);
    }
    function fbPill(x, y, pw, ph, col, label, a, fs) {
        if (a <= 0.01) return;
        rr(x - pw / 2, y - ph / 2, pw, ph, 5, col + fbA(a), col + fbA(a), 1.4);
        tx(String(label), x, y, fs, '#111111' + fbA(a), 'center', true);
    }
    function fbLegendDraw(x0, top, w, mob) {
        var leg = fbLegend(w, mob);
        leg.pos.forEach(function (p) {
            var yy = top + p.y;
            circ(x0 + p.x + leg.sw / 2, yy, leg.sw / 2, p.it.col + 'dd', p.it.col + 'ff', 1);
            tx(p.it.label, x0 + p.x + leg.sw + 5, yy, leg.fs, P.text + 'cc', 'left', false);
        });
    }

    /* ===================== 트리 장면 ===================== */
    function fbTreeGeo(x0, y0, w, h, mob) {
        var r = mob ? 12 : 21;
        var padX = r + 6;
        var padT = r + 4;
        var padB = r + 20;
        return {
            r: r,
            pos: function (node) {
                return { x: x0 + padX + node.nx * (w - 2 * padX), y: y0 + padT + node.ny * (h - padT - padB) };
            },
        };
    }
    function fbNodeCol(st, id) {
        if (fbHas(st.cacheHit, id)) return P.purple;
        if (st.id === id && st.type === 'return') return P.green;
        if (st.id === id && st.type === 'enter') return P.orange;
        if (fbHas(st.returned, id)) return P.teal;
        if (fbHas(st.entered, id)) return P.orange;
        return P.muted;
    }
    function fbNodeBody(x, y, r, col, a, n, mob) {
        if (a <= 0.01) return;
        var emph = col !== P.muted;
        circ(x, y, r, col + fbA(a * (emph ? 0.2 : 0.06)), col + fbA(a * (emph ? 1 : 0.45)), emph ? 2 : 1.3);
        tx(String(n), x, y, mob ? 13 : 16, P.text + fbA(a * (emph ? 1 : 0.6)), 'center', true);
    }
    function fbDrawTree(x0, y0, w, h, mob, s, pv, e) {
        var g = fbTreeGeo(x0, y0, w, h, mob);
        var r = g.r;
        var fs = mob ? 11 : 12;
        EDGES.forEach(function (ed) {
            var a = g.pos(NODES[ed[0]]);
            var b = g.pos(NODES[ed[1]]);
            var on = fbHas(s.entered, ed[1]);
            var was = fbHas(pv.entered, ed[1]);
            if (on === was) {
                fbEdge(a, b, on ? P.sub : P.muted, on ? 0.6 : 0.3, on ? 1.8 : 1.3);
            } else {
                var k = ez(seg(e, 0.4, 1));
                fbEdge(a, b, was ? P.sub : P.muted, (was ? 0.6 : 0.3) * (1 - k), was ? 1.8 : 1.3);
                fbEdge(a, b, on ? P.sub : P.muted, (on ? 0.6 : 0.3) * k, on ? 1.8 : 1.3);
            }
        });
        Object.keys(NODES).forEach(function (id) {
            var node = NODES[id];
            var p = g.pos(node);
            var cNow = fbNodeCol(s, id);
            var cPrev = fbNodeCol(pv, id);
            if (cNow === cPrev) {
                fbNodeBody(p.x, p.y, r, cNow, 1, node.n, mob);
            } else {
                var k2 = ez(seg(e, 0.4, 1));
                fbNodeBody(p.x, p.y, r, cPrev, 1 - k2, node.n, mob);
                fbNodeBody(p.x, p.y, r, cNow, k2, node.n, mob);
            }
            if (s.resultById && s.resultById.hasOwnProperty(id)) {
                var la = pv.resultById && pv.resultById.hasOwnProperty(id) ? 1 : ez(seg(e, 0.6, 1));
                if (la > 0.01) tx('=' + s.resultById[id], p.x, p.y + r + 11, fs, P.text + fbA(la), 'center', true);
            }
        });
        var pid = fbParentOf(s.id);
        if (pid !== null && (s.type === 'enter' || s.type === 'return') && e < 0.7) {
            var fromId = s.type === 'enter' ? pid : s.id;
            var toId = s.type === 'enter' ? s.id : pid;
            var pa = g.pos(NODES[fromId]);
            var pb = g.pos(NODES[toId]);
            var q = ez(seg(e, 0, 0.6));
            fbChip(pa.x + (pb.x - pa.x) * q, pa.y + (pb.y - pa.y) * q, r * 0.8,
                s.type === 'enter' ? P.orange : P.green,
                s.type === 'enter' ? s.n : s.value, seg(e, 0, 0.08) * (1 - seg(e, 0.55, 0.7)), mob);
        }
    }

    /* ===================== 캐시 표 장면 ===================== */
    function fbCellGeo(x0, w, mob) {
        var gap = mob ? 4 : 12;
        var bw = Math.min(mob ? 44 : 60, (w - gap * FIB_N) / (FIB_N + 1));
        var total = (FIB_N + 1) * bw + FIB_N * gap;
        var sx = x0 + (w - total) / 2;
        return { bw: bw, x: function (k) { return sx + k * (bw + gap); } };
    }
    function fbDrawMemo(x0, top, w, mob, L, s, pv, e) {
        var geo = fbCellGeo(x0, w, mob);
        var fs = mob ? 11 : 12;
        var memo = s.memo || {};
        var pm = pv.memo || {};
        var cy = top + L.cellTop;
        var bh = L.bh;
        var bw = geo.bw;
        tx('MEMO 캐시 (n → fib(n))', x0, top + L.titleY, fs, P.sub + 'ff', 'left', true);
        for (var k = 0; k <= FIB_N; k++) {
            var bx = geo.x(k);
            var has = memo.hasOwnProperty(k);
            var was = pm.hasOwnProperty(k);
            var a = has && !was ? ez(seg(e, 0.5, 1)) : 1;
            if (has) rr(bx, cy, bw, bh, 5, P.teal + fbA(0.16 * a), P.teal + fbA(a), 1.8);
            else rr(bx, cy, bw, bh, 5, P.muted + fbA(0.06), P.muted + fbA(0.45), 1.3);
            if (s.type === 'cache-hit' && s.n === k) rr(bx - 2, cy - 2, bw + 4, bh + 4, 7, 'none', P.purple + 'ff', 2.2);
            tx('n=' + k, bx + bw / 2, cy + 11, fs, P.sub + 'ff', 'center', false);
            if (!has) tx('·', bx + bw / 2, cy + bh / 2 + 8, mob ? 15 : 17, P.sub + 'ff', 'center', false);
            else if (a > 0.01) tx(String(memo[k]), bx + bw / 2, cy + bh / 2 + 8, mob ? 15 : 17, P.text + fbA(a), 'center', true);
        }
        tx('계산 ' + s.computeCount + '회 · 캐시 재사용 ' + s.cacheHitCount + '회', x0, top + L.statY, fs, P.orange + 'ff', 'left', true);
        if (s.type === 'cache-hit' && e < 0.7) {
            var to = fbTreeGeo(x0, top + L.treeTop, w, L.treeH, mob).pos(NODES[s.id]);
            var from = { x: geo.x(s.n) + bw / 2, y: cy };
            var q = ez(seg(e, 0, 0.6));
            fbChip(from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q, mob ? 10 : 12,
                P.purple, s.value, seg(e, 0, 0.08) * (1 - seg(e, 0.55, 0.7)), mob);
        }
    }

    /* ===================== 타뷸레이션 장면 ===================== */
    function fbCellBody(bx, by, bw, bh, col, a) {
        if (a <= 0.01) return;
        var emph = col !== P.muted;
        rr(bx, by, bw, bh, 6, col + fbA(a * (emph ? 0.18 : 0.06)), col + fbA(a * (emph ? 1 : 0.45)), emph ? 2.2 : 1.3);
    }
    function fbDrawTab(x0, top, w, mob, L, s, pv, e) {
        var geo = fbCellGeo(x0, w, mob);
        var fs = mob ? 11 : 12;
        var big = mob ? 16 : 19;
        var bw = geo.bw;
        var bh = L.bh;
        var cy = top + L.cellTop;
        var filled = s.filled || [];
        var pf = pv.filled || [];
        var dp = s.dp || {};
        var comp = s.type === 'compute';
        var pcomp = pv.type === 'compute';
        for (var i = 0; i <= FIB_N; i++) {
            var bx = geo.x(i);
            var has = filled.indexOf(i) >= 0;
            var was = pf.indexOf(i) >= 0;
            var cur = comp && s.i === i;
            var src = comp && s.sources.indexOf(i) >= 0;
            var pcur = pcomp && pv.i === i;
            var psrc = pcomp && pv.sources.indexOf(i) >= 0;
            var col = cur ? P.orange : (src ? P.purple : (has ? P.teal : P.muted));
            var pcol = pcur ? P.orange : (psrc ? P.purple : (was ? P.teal : P.muted));
            if (col === pcol) {
                fbCellBody(bx, cy, bw, bh, col, 1);
            } else {
                var k = ez(seg(e, 0, 0.3));
                fbCellBody(bx, cy, bw, bh, pcol, 1 - k);
                fbCellBody(bx, cy, bw, bh, col, k);
            }
            var va = has ? (was ? 1 : ez(seg(e, 0.6, 1))) : 0;
            if (has && va > 0.01) tx(String(dp[i]), bx + bw / 2, cy + bh / 2, big, P.text + fbA(va), 'center', true);
            if (!has || va < 1) tx('?', bx + bw / 2, cy + bh / 2, big, P.sub + fbA(has ? 1 - va : 1), 'center', false);
            tx('dp[' + i + ']', bx + bw / 2, cy + bh + 12, fs, P.sub + 'ff', 'center', false);
        }
        if (comp && e < 0.7) {
            var tgt = geo.x(s.i) + bw / 2;
            var fade = 1 - seg(e, 0.55, 0.7);
            var pw = mob ? 24 : 30;
            var ph = mob ? 18 : 22;
            s.sources.forEach(function (si, idx) {
                var sx = geo.x(si) + bw / 2;
                var up = idx === 0 ? 14 : 30;
                var d1 = up;
                var d2 = Math.abs(tgt - sx);
                var plen = d1 + d2 + d1;
                var u = ez(seg(e, 0, 0.55)) * plen;
                var px;
                var py;
                if (u <= d1) { px = sx; py = cy - u; }
                else if (u <= d1 + d2) { px = sx + (tgt > sx ? 1 : -1) * (u - d1); py = cy - up; }
                else { px = tgt; py = cy - up + (u - d1 - d2); }
                var pc = P.purple + fbA(0.35 * fade);
                ln(sx, cy, sx, cy - up, pc, 1.2);
                ln(sx, cy - up, tgt, cy - up, pc, 1.2);
                ln(tgt, cy - up, tgt, cy, pc, 1.2);
                fbPill(px, py, pw, ph, P.purple, dp[si], fade, fs);
            });
        }
        var fy = top + L.formulaY;
        if (comp) tx('dp[' + (s.i - 1) + '] + dp[' + (s.i - 2) + '] → dp[' + s.i + ']', x0, fy, fs, P.orange + 'ff', 'left', true);
        else if (s.type === 'done') tx('fib(' + FIB_N + ') = dp[' + FIB_N + '] = ' + dp[FIB_N], x0, fy, fs, P.teal + 'ff', 'left', true);
        else tx('기저 사례: dp[0] = 0, dp[1] = 1', x0, fy, fs, P.sub + 'ff', 'left', true);
    }

    /* ===================== 연산 횟수 비교 ===================== */
    function fbDrawCompare(x0, y, w, mob, s, pv, e) {
        var fs = mob ? 11 : 12;
        var grow = s.type === 'done' && pv.type !== 'done' ? ez(e) : 1;
        var labelW = mob ? 82 : 100;
        var barMax = Math.max(40, w - labelW - (mob ? 34 : 200));
        var rowH = mob ? 36 : 28;
        tx('연산 횟수 비교', x0, y, fs, P.sub + 'ff', 'left', true);
        fbCompareRows().forEach(function (rw, i) {
            var ry = y + 20 + i * rowH;
            var bx = x0 + labelW;
            var bwid = Math.max(4, rw.frac * barMax) * grow;
            tx(rw.label, x0, ry, fs, P.text + 'ff', 'left', true);
            rr(bx, ry - 7, bwid, 14, 3, rw.col + '55', rw.col + 'ff', 1.4);
            tx(rw.value + '회', bx + bwid + 6, ry, fs, P.text + 'ff', 'left', true);
            if (mob) tx(rw.sub, x0 + labelW, ry + 15, fs, P.sub + 'ff', 'left', false);
            else tx(rw.sub, bx + barMax + 50, ry, fs, P.sub + 'ff', 'left', false);
        });
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var pv = prev || s;
        var e = clamp01(t);
        var L = layout(w, mob);
        fbLegendDraw(x0, top, w, mob);
        if (mode === 'tab') {
            fbDrawTab(x0, top, w, mob, L, s, pv, e);
            fbDrawCompare(x0, top + L.cmpTop, w, mob, s, pv, e);
            return;
        }
        fbDrawTree(x0, top + L.treeTop, w, L.treeH, mob, s, pv, e);
        if (mode === 'memo') {
            fbDrawMemo(x0, top, w, mob, L, s, pv, e);
        } else {
            tx('누적 호출 ' + s.callCount + '회 / 전체 ' + fbNaiveTotal() + '회', x0, top + L.statY, mob ? 11 : 12, P.orange + 'ff', 'left', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('dp-viz__speed-btn--active'); });
        btn.classList.add('dp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dp-viz__mode-btn--active', d.key === m); });
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