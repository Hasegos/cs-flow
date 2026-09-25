/**
 * 최소 신장 트리(MST) 시각화
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
    var root    = el('div', 'mst-viz');
    var toolbar = el('div', 'mst-viz__toolbar');
    var tbLeft  = el('div', 'mst-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mst-viz__title', 'MST'));

    var modeWrap = el('div', 'mst-viz__mode');
    var modeDefs = [
        { key: 'kruskal', label: '크루스칼' },
        { key: 'prim',    label: '프림' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'mst-viz__mode-btn' + (i === 0 ? ' mst-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'mst-viz__speed');
    speedWrap.appendChild(el('span', 'mst-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
        var b = el('button', 'mst-viz__speed-btn' + (i === 0 ? ' mst-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'mst-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'mst-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'mst-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'mst-viz__controls');
    var btnPlay  = el('button', 'mst-viz__btn mst-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'mst-viz__btn', '▶| STEP');
    var btnReset = el('button', 'mst-viz__btn', '↺ RESET');
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

    /* ===================== 그래프 데이터 (algo-05 다익스트라와 동일한 그래프 재사용) ===================== */
    var NODES = [
        { id: 0, x: 0.08, y: 0.50 },
        { id: 1, x: 0.36, y: 0.14 },
        { id: 2, x: 0.36, y: 0.86 },
        { id: 3, x: 0.66, y: 0.14 },
        { id: 4, x: 0.66, y: 0.86 },
        { id: 5, x: 0.92, y: 0.50 },
    ];
    var EDGES = [
        [0, 1, 4], [0, 2, 1], [1, 2, 2], [1, 3, 5],
        [2, 3, 8], [2, 4, 2], [3, 4, 3], [3, 5, 6], [4, 5, 5],
    ];
    var N = NODES.length;
    var SRC = 0;

    var ADJ = [];
    for (var ai = 0; ai < N; ai++) ADJ.push([]);
    EDGES.forEach(function (e) { ADJ[e[0]].push([e[1], e[2]]); ADJ[e[1]].push([e[0], e[2]]); });
    ADJ.forEach(function (a) { a.sort(function (x, y) { return x[0] - y[0]; }); });

    function edgeKey(a, b) { return Math.min(a, b) + '-' + Math.max(a, b); }

    function copyObj(o) {
        var r = {};
        for (var k in o) { if (o.hasOwnProperty(k)) r[k] = o[k]; }
        return r;
    }

    /* ===================== 크루스칼 스텝 (가중치 오름차순 + 유니온-파인드로 사이클 검사) ===================== */
    function buildKruskalSteps() {
        var parent = [0, 1, 2, 3, 4, 5], rank = [0, 0, 0, 0, 0, 0];
        function find(x) { while (parent[x] !== x) x = parent[x]; return x; }
        function union(a, b) {
            var ra = find(a), rb = find(b);
            if (ra === rb) return false;
            if (rank[ra] < rank[rb]) parent[ra] = rb;
            else if (rank[ra] > rank[rb]) parent[rb] = ra;
            else { parent[rb] = ra; rank[ra]++; }
            return true;
        }

        var sorted = EDGES.slice().sort(function (a, b) { return a[2] - b[2]; });
        var steps = [];
        var mstEdges = [];
        var touched = {};

        steps.push({ type: 'intro', edge: null, mstEdges: [], touched: {},
            log: 'PLAY를 눌러 간선을 가중치가 작은 순서로 하나씩 확인하는 크루스칼 알고리즘을 확인하세요.' });

        for (var idx = 0; idx < sorted.length && mstEdges.length < N - 1; idx++) {
            var e = sorted[idx];
            var ra = find(e[0]), rb = find(e[1]);
            var log;
            if (ra !== rb) {
                union(e[0], e[1]);
                mstEdges.push(e);
                touched = copyObj(touched); touched[e[0]] = true; touched[e[1]] = true;
                var isDone = mstEdges.length === N - 1;
                log = '간선 ' + e[0] + '-' + e[1] + '(가중치' + e[2] + ') 확인 → 두 노드가 서로 다른 그룹이라 연결해도 안전 → MST에 추가!';
                steps.push({ type: isDone ? 'done' : 'add', edge: e, mstEdges: mstEdges.slice(), touched: copyObj(touched), log: log });
            } else {
                log = '간선 ' + e[0] + '-' + e[1] + '(가중치' + e[2] + ') 확인 → 이미 같은 그룹이라 연결하면 사이클이 생김 → 건너뜁니다.';
                steps.push({ type: 'skip', edge: e, mstEdges: mstEdges.slice(), touched: copyObj(touched), log: log });
            }
        }
        var total = mstEdges.reduce(function (s, e2) { return s + e2[2]; }, 0);
        steps[steps.length - 1].log += ' 총 ' + (N - 1) + '개의 간선을 모아 MST 완성 — 총 가중치 ' + total + '.';
        return steps;
    }

    var KRUSKAL_STEPS = buildKruskalSteps();

    /* ===================== 프림 스텝 (다익스트라와 같은 골격, "거리" 대신 "연결 비용"을 기준으로 확장) ===================== */
    function buildPrimSteps() {
        var inTree = new Array(N).fill(false);
        var dist = new Array(N).fill(Infinity);
        var via = new Array(N).fill(null);
        dist[SRC] = 0;
        var steps = [];
        var mstEdges = [];

        steps.push({ type: 'intro', dist: dist.slice(), inTree: inTree.slice(), mstEdges: [], addNode: null,
            log: 'PLAY를 눌러 노드 ' + SRC + '에서 시작해, 트리에 연결하는 가장 싼 간선을 매번 골라 나무를 키우는 프림 알고리즘을 확인하세요.' });

        for (var count = 0; count < N; count++) {
            var u = -1, best = Infinity;
            for (var i = 0; i < N; i++) if (!inTree[i] && dist[i] < best) { best = dist[i]; u = i; }
            inTree[u] = true;
            var addedEdge = null;
            if (via[u] != null) { addedEdge = [via[u], u, dist[u]]; mstEdges.push(addedEdge); }

            var updates = [];
            ADJ[u].forEach(function (edge) {
                var v = edge[0], w = edge[1];
                if (!inTree[v] && w < dist[v]) {
                    var old = dist[v];
                    dist[v] = w;
                    via[v] = u;
                    updates.push({ node: v, from: old, to: w });
                }
            });

            var unvisitedList = [];
            for (var k = 0; k < N; k++) if (!inTree[k]) unvisitedList.push({ node: k, dist: dist[k] });
            unvisitedList.sort(function (a, b) { return a.dist - b.dist; });

            var log;
            if (addedEdge) {
                log = '간선 ' + addedEdge[0] + '-' + addedEdge[1] + '(가중치' + addedEdge[2] + ')로 노드 ' + u + '을 트리에 추가합니다.';
            } else {
                log = '시작 노드 ' + u + '을 트리에 넣습니다 (아직 간선 없음).';
            }
            if (updates.length > 0) {
                var parts = updates.map(function (up) {
                    return '노드 ' + up.node + '는 ' + (up.from === Infinity ? '∞' : up.from) + ' → ' + up.to;
                });
                log += ' 연결 비용 갱신: ' + parts.join(', ') + '.';
            }
            var isDone = count === N - 1;
            steps.push({ type: isDone ? 'done' : 'grow', addNode: u, addedEdge: addedEdge, dist: dist.slice(),
                inTree: inTree.slice(), mstEdges: mstEdges.slice(), unvisitedList: unvisitedList, log: log });
        }
        var total = mstEdges.reduce(function (s, e) { return s + e[2]; }, 0);
        steps[steps.length - 1].log += ' MST 완성 — 총 가중치 ' + total + ' (크루스칼과 똑같습니다!).';
        return steps;
    }

    var PRIM_STEPS = buildPrimSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'kruskal';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        return mode === 'kruskal' ? KRUSKAL_STEPS : PRIM_STEPS;
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

    /* ===================== 스텝 → 렌더 스펙 ===================== */
    function computeSpec(step) {
        var spec = { nodeStatus: {}, dist: {}, mstEdgeKeys: {}, curEdgeKey: null, curEdgeState: null, allGreen: step.type === 'done' };

        (step.mstEdges || []).forEach(function (e) { spec.mstEdgeKeys[edgeKey(e[0], e[1])] = true; });

        if (mode === 'kruskal') {
            var touched = step.touched || {};
            for (var i = 0; i < N; i++) spec.nodeStatus[i] = touched[i] ? 'visited' : 'unvisited';
            if (step.edge) {
                spec.curEdgeKey = edgeKey(step.edge[0], step.edge[1]);
                spec.curEdgeState = step.type === 'skip' ? 'skip' : 'add';
                spec.nodeStatus[step.edge[0]] = 'current';
                spec.nodeStatus[step.edge[1]] = 'current';
            }
        } else {
            for (var i2 = 0; i2 < N; i2++) {
                spec.nodeStatus[i2] = step.inTree[i2] ? 'visited' : 'unvisited';
                spec.dist[i2] = step.dist[i2];
            }
            if (step.addNode != null) spec.nodeStatus[step.addNode] = 'current';
        }
        return spec;
    }

    /* ===================== 그래프 다이어그램 렌더 ===================== */
    function drawGraphDiagram(top, h, mob, W, spec) {
        var padX = mob ? 28 : 46;
        var padTop = top + (mob ? 12 : 16);
        var usableH = h - (mob ? 24 : 32);
        var R = mob ? 16 : 20;

        function px(node) { return { x: padX + node.x * (W - 2 * padX), y: padTop + node.y * usableH }; }

        EDGES.forEach(function (e) {
            var p1 = px(NODES[e[0]]), p2 = px(NODES[e[1]]);
            var key = edgeKey(e[0], e[1]);
            var isCur = spec.curEdgeKey === key;
            var onMst = spec.mstEdgeKeys[key];
            var col = P.muted, alphaLine = '4a', lw = 1.4;
            if (onMst) { col = P.green; alphaLine = 'ee'; lw = 3; }
            if (isCur && spec.curEdgeState === 'add') { col = P.orange; alphaLine = 'ee'; lw = 3; }
            if (isCur && spec.curEdgeState === 'skip') { col = P.orange; alphaLine = 'aa'; lw = 2; }
            if (spec.allGreen) { col = P.green; alphaLine = 'ee'; lw = 3; }
            line(p1.x, p1.y, p2.x, p2.y, col + alphaLine, lw);

            if (isCur && spec.curEdgeState === 'skip') {
                var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
                ctx.save();
                ctx.setLineDash([3, 3]);
                line(p1.x, p1.y, p2.x, p2.y, P.muted + 'cc', 2);
                ctx.restore();
                tx('✕', mx, my - (mob ? 24 : 28), mob ? 12 : 14, P.orange + 'ee', 'center', true);
            }

            var mx2 = (p1.x + p2.x) / 2, my2 = (p1.y + p2.y) / 2;
            var wLbl = String(e[2]);
            var wSz = mob ? 9 : 10;
            var edx = p2.x - p1.x, edy = p2.y - p1.y;
            var elen = Math.sqrt(edx * edx + edy * edy) || 1;
            var nx = -edy / elen, ny = edx / elen;
            if (ny > 0) { nx = -nx; ny = -ny; }
            var labelOffset = mob ? 10 : 12;
            var lx = mx2 + nx * labelOffset, ly = my2 + ny * labelOffset;
            tx(wLbl, lx, ly, wSz, (onMst || isCur ? col : P.text) + (onMst || isCur ? 'ee' : 'cc'), 'center', true);
        });

        NODES.forEach(function (node) {
            var p = px(node);
            var status = spec.nodeStatus[node.id] || 'unvisited';
            var col = P.muted;
            if (status === 'current') col = P.orange;
            else if (status === 'visited') col = P.teal;
            if (spec.allGreen) col = P.green;

            ctx.beginPath();
            ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
            ctx.fillStyle = col + '22';
            ctx.fill();
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = status === 'current' ? 2.8 : 1.7;
            ctx.stroke();

            tx(String(node.id), p.x, p.y, mob ? 11 : 13, P.text + 'ee', 'center', true);

            if (mode === 'prim' && spec.dist[node.id] != null) {
                var dVal = spec.dist[node.id];
                var dLbl = dVal === Infinity ? '∞' : String(dVal);
                var bR = mob ? 10 : 12;
                var bx = p.x + R * 0.95, by = p.y - R * 0.95;
                var badgeCol = status === 'unvisited' ? P.muted : (status === 'current' ? P.orange : P.green);
                ctx.beginPath(); ctx.arc(bx, by, bR, 0, Math.PI * 2);
                ctx.fillStyle = badgeCol + 'ee'; ctx.fill();
                tx(dLbl, bx, by, mob ? 9 : 10.5, '#0f0f1a', 'center', true);
            }
        });
    }

    /* ===================== 하단 패널: 크루스칼(정렬된 간선 목록) / 프림(미확정 노드 후보) ===================== */
    function drawKruskalEdgeList(x0, top, mob, W, step) {
        var sorted = EDGES.slice().sort(function (a, b) { return a[2] - b[2]; });
        var fLbl = mob ? 10 : 11;
        tx('간선 (가중치 오름차순 — 왼쪽부터 확인)', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var chipY = top + (mob ? 16 : 18);
        var chipH = mob ? 24 : 28, gap = mob ? 6 : 8;
        var x = x0, rowGap = chipH + (mob ? 8 : 10);
        var maxW = W - x0;
        sorted.forEach(function (e) {
            var key = edgeKey(e[0], e[1]);
            var lbl = e[0] + '-' + e[1] + '(' + e[2] + ')';
            ctx.font = '700 ' + fLbl + 'px "JetBrains Mono",monospace';
            var w = ctx.measureText(lbl).width + (mob ? 16 : 20);
            if (x + w > x0 + maxW && x > x0) { x = x0; chipY += rowGap; }

            var isCur = step.edge && edgeKey(step.edge[0], step.edge[1]) === key;
            var inMst = (step.mstEdges || []).some(function (m) { return edgeKey(m[0], m[1]) === key; });
            var col = P.muted, fillA = '10', strokeA = '55', lw = 1;
            if (inMst) { col = P.green; fillA = '22'; strokeA = 'ee'; lw = 1.6; }
            if (isCur) { col = P.orange; fillA = '28'; strokeA = 'ee'; lw = 2; }

            rr(x, chipY, w, chipH, 4, col + fillA, col + strokeA, lw);
            tx(lbl, x + w / 2, chipY + chipH / 2, fLbl, col === P.muted ? P.text + '99' : col + 'ee', 'center', inMst || isCur);
            x += w + gap;
        });
    }

    function drawPrimCandidateList(x0, top, mob, step) {
        var fLbl = mob ? 10 : 11;
        tx('트리 밖 노드 (연결 비용 오름차순 — 맨 왼쪽이 다음 후보)', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var chipY = top + (mob ? 24 : 27);
        var chipH = mob ? 24 : 28, gap = mob ? 6 : 8;
        var list = step.unvisitedList || [];
        if (list.length === 0) {
            tx('(모두 연결됨)', x0, chipY + chipH / 2, fLbl, P.text + '77', 'left', false);
            return;
        }
        var x = x0;
        list.forEach(function (item, idx) {
            var isNext = idx === 0;
            var lbl = '노드' + item.node + ' · ' + (item.dist === Infinity ? '∞' : item.dist);
            ctx.font = '700 ' + fLbl + 'px "JetBrains Mono",monospace';
            var w = ctx.measureText(lbl).width + (mob ? 18 : 22);
            if (isNext) {
                tx('다음 연결 ↓', x + w / 2, chipY - (mob ? 10 : 11), mob ? 8 : 9, P.orange + 'ee', 'center', true);
                rr(x, chipY, w, chipH, 4, P.orange + '30', P.orange + 'ee', 2);
                tx(lbl, x + w / 2, chipY + chipH / 2, fLbl, P.text + 'ff', 'center', true);
            } else {
                rr(x, chipY, w, chipH, 4, P.muted + '10', P.muted + '55', 1);
                tx(lbl, x + w / 2, chipY + chipH / 2, fLbl, P.text + '99', 'center', false);
            }
            x += w + gap;
        });
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 16 : 22,
            graphH:   mob ? 220 : 270,
            gapMid:   mob ? 12 : 16,
            panelH:   mob ? 70 : 80,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        return L.top + L.graphH + L.gapMid + L.panelH + L.top;
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
        var spec  = computeSpec(step);

        drawGraphDiagram(L.top, L.graphH, mob, W, spec);

        var padX = mob ? 12 : 24;
        var bottomTop = L.top + L.graphH + L.gapMid;
        if (mode === 'kruskal') {
            drawKruskalEdgeList(padX, bottomTop, mob, W - padX, step);
        } else {
            drawPrimCandidateList(padX, bottomTop, mob, step);
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
                    timer = setTimeout(tick, speed * 0.4);
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
        speedBtns.forEach(function (b) { b.classList.remove('mst-viz__speed-btn--active'); });
        btn.classList.add('mst-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('mst-viz__mode-btn--active', d.key === m);
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