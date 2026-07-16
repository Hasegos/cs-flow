/**
 * 동적 프로그래밍(DP) 기초 시각화 — 피보나치 수열
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
        { key: 'memo',  label: '메모이제이션' },
        { key: 'tab',   label: '타뷸레이션' },
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
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
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

    var logEl = el('div', 'dp-viz__log', '▶ PLAY를 눌러 완전 탐색 재귀 과정을 확인하세요.');
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    function copyObj(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }

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

    /* ===================== 상태 변수 ===================== */
    var mode     = 'naive';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1600;
    var animProg = 1;

    function currentSteps() {
        if (mode === 'naive') return NAIVE_STEPS;
        if (mode === 'memo')  return MEMO_STEPS;
        return TAB_STEPS;
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

    /* ===================== 노드 반지름 (nodePos/drawFibTree 공용 — 중복 정의로 값이 어긋나는 것 방지) ===================== */
    function nodeRadius(mob) { return mob ? 14 : 24; }

    /* ===================== 노드 좌표 (고정) ===================== */
    function nodePos(node, W, top, h, mob) {
        var r = nodeRadius(mob);
        var marginX = r + (mob ? 6 : 8);
        var marginY = r + (mob ? 10 : 14);
        return {
            x: marginX + node.nx * (W - 2 * marginX),
            y: top + marginY + node.ny * (h - 2 * marginY),
        };
    }

    /* ===================== 노드 색상 (항상 순수 hex) ===================== */
    function nodeColor(id, step) {
        if (step.cacheHit && step.cacheHit.indexOf(id) >= 0) return P.purple;
        if (step.id === id && step.type === 'return') return P.green;
        if (step.id === id && step.type === 'enter') return P.orange;
        if (step.returned && step.returned.indexOf(id) >= 0) return P.teal;
        if (step.entered && step.entered.indexOf(id) >= 0) return P.orange;
        return P.muted;
    }

    /* ===================== 재귀 호출 트리 드로우 ===================== */
    function drawFibTree(W, top, h, mob, step) {
        var r = nodeRadius(mob);
        var fVal = mob ? 12 : 15;
        var fSub = mob ? 8  : 10;

        EDGES.forEach(function (e) {
            var p1 = nodePos(NODES[e[0]], W, top, h, mob);
            var p2 = nodePos(NODES[e[1]], W, top, h, mob);
            var childOn = (step.entered && step.entered.indexOf(e[1]) >= 0);
            var col = childOn ? (P.muted + '77') : (P.muted + '2a');
            line(p1.x, p1.y, p2.x, p2.y, col, childOn ? 1.8 : 1.3);
        });

        Object.keys(NODES).forEach(function (id) {
            var node = NODES[id];
            var pos = nodePos(node, W, top, h, mob);
            var col = nodeColor(id, step);
            var isEmph = col !== P.muted;
            circle(pos.x, pos.y, r, col + (isEmph ? '2a' : '14'), col + (isEmph ? 'ee' : '66'), isEmph ? 2.2 : 1.4);
            tx(String(node.n), pos.x, pos.y, fVal, P.text + 'ee', 'center', true);

            var hasResult = step.resultById && step.resultById.hasOwnProperty(id);
            if (hasResult) {
                tx('=' + step.resultById[id], pos.x, pos.y + r + (mob ? 11 : 13), fSub, P.text + 'aa', 'center', false);
            }
        });
    }

    /* ===================== 메모 캐시 테이블 (메모이제이션 탭) ===================== */
    function drawMemoTable(W, top, mob, step) {
        var fLbl = mob ? 9  : 10;
        var fVal = mob ? 13 : 15;
        var boxW = mob ? 34 : 42;
        var boxH = mob ? 32 : 38;
        var gap  = mob ? 7  : 10;
        var n = FIB_N;
        var totalW = (n + 1) * boxW + n * gap;
        var x0 = Math.max(mob ? 12 : 24, (W - totalW) / 2);

        tx('MEMO 캐시 (n → fib(n))', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var by = top + (mob ? 24 : 28);
        var memo = step.memo || {};

        for (var i = 0; i <= n; i++) {
            var bx = x0 + i * (boxW + gap);
            var has = memo.hasOwnProperty(i);
            var col = has ? P.teal : P.muted;
            rr(bx, by, boxW, boxH, 5, col + (has ? '28' : '10'), col + (has ? 'ee' : '55'), has ? 2 : 1.3);
            tx('n=' + i, bx + boxW / 2, by - (mob ? 9 : 10), mob ? 8 : 9, P.text + '88', 'center', false);
            tx(has ? String(memo[i]) : '·', bx + boxW / 2, by + boxH / 2, fVal, P.text + (has ? 'ee' : '55'), 'center', has);
        }

        var statY = by + boxH + (mob ? 22 : 26);
        var statTxt = '계산 ' + (step.computeCount || 0) + '회 · 캐시 재사용 ' + (step.cacheHitCount || 0) + '회';
        tx(statTxt, x0, statY, mob ? 11 : 12, P.orange + 'dd', 'left', true);
    }

    /* ===================== 타뷸레이션 표 ===================== */
    function drawTabTable(W, top, mob, step) {
        var fVal = mob ? 16 : 19;
        var boxW = mob ? 44 : 54;
        var boxH = mob ? 44 : 52;
        var gap  = mob ? 9  : 13;
        var n = FIB_N;
        var totalW = (n + 1) * boxW + n * gap;
        var x0 = Math.max(mob ? 12 : 24, (W - totalW) / 2);

        var by = top + (mob ? 16 : 18);
        var dp = step.dp || {};
        var filled = step.filled || [];
        var sources = step.sources || [];

        for (var i = 0; i <= n; i++) {
            var bx = x0 + i * (boxW + gap);
            var has = filled.indexOf(i) >= 0;
            var isCurrent = (step.type === 'compute' && step.i === i);
            var isSource = sources.indexOf(i) >= 0;
            var col = isCurrent ? P.orange : (isSource ? P.purple : (has ? P.teal : P.muted));
            rr(bx, by, boxW, boxH, 6, col + (has || isCurrent ? '28' : '10'), col + (has || isCurrent ? 'ee' : '55'), (isCurrent || isSource) ? 2.6 : 1.5);
            tx('dp[' + i + ']', bx + boxW / 2, by - (mob ? 11 : 13), mob ? 9 : 10, P.text + '88', 'center', false);
            tx(has ? String(dp[i]) : '?', bx + boxW / 2, by + boxH / 2, fVal, P.text + (has ? 'ee' : '55'), 'center', has);
        }

        var arrowSlotY = by + boxH + (mob ? 20 : 24);
        if (step.type === 'compute') {
            tx('dp[' + sources[0] + '] + dp[' + sources[1] + '] → dp[' + step.i + ']', x0, arrowSlotY, mob ? 12 : 13, P.orange + 'dd', 'left', true);
        }

        drawCallComparison(x0, arrowSlotY + (mob ? 26 : 32), Math.min(totalW, W - x0 - (mob ? 12 : 24)), mob);
    }

    /* ===================== 연산 횟수 비교 (완전탐색 vs 메모이제이션 vs 타뷸레이션) ===================== */
    function drawCallComparison(x0, top, w, mob) {
        var naiveCalls = NAIVE_STEPS[NAIVE_STEPS.length - 1].callCount;
        var memoLast   = MEMO_STEPS[MEMO_STEPS.length - 1];
        var memoTotal  = memoLast.computeCount + memoLast.cacheHitCount;
        var tabTotal   = FIB_N + 1;
        var maxVal = Math.max(naiveCalls, memoTotal, tabTotal);

        var rows = [
            { label: '완전 탐색',   value: naiveCalls, sub: naiveCalls + '회 함수 호출',                 col: P.muted  },
            { label: '메모이제이션', value: memoTotal,  sub: memoLast.computeCount + '회 계산 + ' + memoLast.cacheHitCount + '회 캐시', col: P.orange },
            { label: '타뷸레이션',   value: tabTotal,   sub: tabTotal + '회 반복 (재귀 호출 0회)',        col: P.teal   },
        ];

        var fLbl = mob ? 10 : 11;
        var fSub = mob ? 9  : 10;
        var labelW = mob ? 74 : 92;
        var barMaxW = Math.max(60, w - labelW - (mob ? 60 : 80));
        var rowH = mob ? 26 : 30;

        tx('연산 횟수 비교', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var rowsTop = top + (mob ? 18 : 22);

        rows.forEach(function (r, i) {
            var ry = rowsTop + i * rowH;
            tx(r.label, x0, ry, fLbl, P.text + 'dd', 'left', true);
            var barX = x0 + labelW;
            var barW = Math.max(4, (r.value / maxVal) * barMaxW);
            rr(barX, ry - (mob ? 7 : 8), barW, mob ? 14 : 16, 3, r.col + '55', r.col + 'ee', 1.4);
            tx(r.sub, barX + barMaxW + 10, ry, fSub, P.text + '99', 'left', false);
        });
    }

    /* ===================== 범례 ===================== */
    function drawLegend(W, top, mob) {
        var items = [];
        if (mode === 'tab') {
            items = [
                { col: P.teal,   label: '계산됨' },
                { col: P.orange, label: '현재 계산' },
                { col: P.purple, label: '참조하는 값' },
                { col: P.muted,  label: '아직' },
            ];
        } else {
            items = [
                { col: P.orange, label: '현재 호출' },
                { col: P.green,  label: '방금 반환' },
                { col: P.teal,   label: '반환 완료' },
            ];
            if (mode === 'memo') items.push({ col: P.purple, label: '캐시 재사용' });
            items.push({ col: P.muted, label: '아직/생략' });
        }

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

    /* ===================== 레이아웃 상수 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 20 : 28,
            legendH:  mob ? 24 : 28,
            treeH:    mob ? 230 : 300,
            panelGap: mob ? 20  : 26,
            memoTableH: mob ? 100 : 118,
            tabTableH:  mob ? 205 : 240,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        if (mode === 'naive') return L.top + L.legendH + L.treeH + L.top;
        if (mode === 'memo')  return L.top + L.legendH + L.treeH + L.panelGap + L.memoTableH;
        return L.top + L.legendH + L.tabTableH + L.top;
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

        drawLegend(W, L.top, mob);

        if (mode === 'naive') {
            drawFibTree(W, L.top + L.legendH, L.treeH, mob, step);
        } else if (mode === 'memo') {
            drawFibTree(W, L.top + L.legendH, L.treeH, mob, step);
            drawMemoTable(W, L.top + L.legendH + L.treeH + L.panelGap, mob, step);
        } else {
            drawTabTable(W, L.top + L.legendH, mob, step);
        }
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.01 * (1600 / speed);
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
        if (mode === 'naive') return '▶ PLAY를 눌러 완전 탐색 재귀 과정을 확인하세요.';
        if (mode === 'memo')  return '▶ PLAY를 눌러 메모이제이션 과정을 확인하세요.';
        return '▶ PLAY를 눌러 타뷸레이션 과정을 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.4);
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
        speedBtns.forEach(function (b) { b.classList.remove('dp-viz__speed-btn--active'); });
        btn.classList.add('dp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('dp-viz__mode-btn--active', d.key === m);
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