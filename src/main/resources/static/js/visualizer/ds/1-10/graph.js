/**
 * 그래프 시각화
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
    var root    = el('div', 'graph-viz');
    var toolbar = el('div', 'graph-viz__toolbar');
    var tbLeft  = el('div', 'graph-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'graph-viz__title', 'Graph'));

    var modeWrap = el('div', 'graph-viz__mode');
    var modeDefs = [
        { key: 'structure', label: '구조' },
        { key: 'matrix',    label: '인접 행렬' },
        { key: 'list',      label: '인접 리스트' },
        { key: 'bfs',       label: 'BFS' },
        { key: 'dfs',       label: 'DFS' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'graph-viz__mode-btn' + (i === 0 ? ' graph-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'graph-viz__speed');
    speedWrap.appendChild(el('span', 'graph-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'graph-viz__speed-btn' + (i === 0 ? ' graph-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'graph-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'graph-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'graph-viz__log', '▶ PLAY를 눌러 그래프 구조를 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'graph-viz__controls');
    var btnPlay  = el('button', 'graph-viz__btn graph-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'graph-viz__btn', '▶| STEP');
    var btnReset = el('button', 'graph-viz__btn', '↺ RESET');
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

    /* ===================== 그래프 정의 ===================== */
    var NODE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F'];
    var NODES = {
        A: { id: 'A', x: 0.50, y: 0.14 },
        B: { id: 'B', x: 0.22, y: 0.50 },
        C: { id: 'C', x: 0.78, y: 0.50 },
        D: { id: 'D', x: 0.12, y: 0.88 },
        E: { id: 'E', x: 0.50, y: 0.88 },
        F: { id: 'F', x: 0.88, y: 0.88 },
    };
    var EDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['E', 'F']];

    var ADJ = {};
    NODE_ORDER.forEach(function (id) { ADJ[id] = []; });
    EDGES.forEach(function (e) {
        ADJ[e[0]].push(e[1]);
        ADJ[e[1]].push(e[0]);
    });

    function edgesIncident(id) {
        return EDGES.filter(function (e) { return e[0] === id || e[1] === id; });
    }

    function sameEdge(e1, e2) {
        return (e1[0] === e2[0] && e1[1] === e2[1]) || (e1[0] === e2[1] && e1[1] === e2[0]);
    }

    function edgeInList(edge, list) {
        if (list === 'all') return true;
        if (!list) return false;
        return list.some(function (e) { return sameEdge(e, edge); });
    }

    /* ===================== 구조 탭 스텝 ===================== */
    var STRUCTURE_STEPS = [
        {
            log: '그래프(Graph)는 정점(Vertex)과 간선(Edge)의 집합입니다. 트리와 달리 루트가 없고, 사이클이 존재할 수 있습니다. 이 그래프는 정점 6개, 간선 6개로 구성됩니다.',
            highlight: { nodes: NODE_ORDER, edges: 'all' }, label: null,
        },
        {
            log: '정점(Vertex): 데이터를 담는 하나의 단위입니다. A~F 여섯 개의 정점이 있습니다.',
            highlight: { nodes: ['A'], edges: [] }, label: null,
        },
        {
            log: '간선(Edge): 두 정점을 연결하는 관계입니다. 방향이 없는 무방향 간선은 A→B, B→A 양쪽 모두를 의미합니다.',
            highlight: { nodes: ['A', 'B'], edges: [['A', 'B']] }, label: null,
        },
        {
            log: '인접(Adjacent): 정점 B와 간선으로 직접 연결된 정점은 A, D, E 입니다. 두 정점 사이에 간선이 있으면 서로 인접하다고 합니다.',
            highlight: { nodes: ['B', 'A', 'D', 'E'], edges: [['A', 'B'], ['B', 'D'], ['B', 'E']] }, label: 'adjacent',
        },
        {
            log: '차수(Degree): 정점 B에 연결된 간선의 수는 3개(A, D, E)입니다. 차수가 높을수록 그래프에서 허브 역할을 하는 정점입니다.',
            highlight: { nodes: ['B'], edges: edgesIncident('B') }, label: 'degree',
        },
        {
            log: '사이클(Cycle): A → B → E → F → C → A 처럼 시작 정점으로 되돌아오는 경로가 존재합니다. 트리는 이런 사이클이 없는 특수한 그래프입니다.',
            highlight: { nodes: ['A', 'B', 'E', 'F', 'C'], edges: [['A', 'B'], ['B', 'E'], ['E', 'F'], ['C', 'F'], ['A', 'C']] }, label: 'cycle',
        },
    ];

    /* ===================== 인접 행렬 탭 스텝 ===================== */
    function buildMatrixSteps() {
        var steps = [];
        steps.push({
            type: 'intro', edgeIdx: -1,
            log: '인접 행렬(Adjacency Matrix)은 그래프를 V×V 크기의 2차원 배열로 표현합니다. matrix[i][j] = 1이면 정점 i와 j 사이에 간선이 있다는 뜻입니다.',
        });
        EDGES.forEach(function (e, i) {
            steps.push({
                type: 'fill', edgeIdx: i, edge: e,
                log: e[0] + ' — ' + e[1] + ' 간선 추가: matrix[' + e[0] + '][' + e[1] + '] = 1, matrix[' + e[1] + '][' + e[0] + '] = 1 (무방향 그래프는 대칭)',
            });
        });
        steps.push({
            type: 'complete', edgeIdx: EDGES.length - 1,
            log: '인접 행렬 완성. 대각선을 기준으로 대칭 구조이며, 공간복잡도 O(V²), 두 정점 사이 간선 존재 여부 조회는 O(1)입니다. 정점은 많고 간선은 적은 희소 그래프에서는 공간이 낭비될 수 있습니다.',
        });
        return steps;
    }

    /* ===================== 인접 리스트 탭 스텝 ===================== */
    function buildListSteps() {
        var steps = [];
        steps.push({
            type: 'intro', nodeIdx: -1,
            log: '인접 리스트(Adjacency List)는 각 정점마다 연결된 인접 정점들의 목록만 저장합니다.',
        });
        NODE_ORDER.forEach(function (id, i) {
            steps.push({
                type: 'fill', nodeIdx: i, node: id,
                log: '정점 ' + id + '의 인접 리스트: [' + ADJ[id].join(', ') + ']',
            });
        });
        steps.push({
            type: 'complete', nodeIdx: NODE_ORDER.length - 1,
            log: '인접 리스트 완성. 공간복잡도 O(V+E)로 희소 그래프에 효율적이며, 두 정점 사이 간선 존재 확인은 O(degree)로 인접 행렬(O(1))보다 느릴 수 있습니다.',
        });
        return steps;
    }

    /* ===================== BFS 스텝 ===================== */
    function buildBFSSteps(startId) {
        var steps = [];
        var visited = {};
        var order = [];
        var queue = [];

        visited[startId] = true;
        queue.push(startId);
        steps.push({
            type: 'enqueue', node: startId, queue: queue.slice(), order: order.slice(),
            log: '시작 정점 ' + startId + '를 큐에 삽입하고 방문 처리합니다.',
        });

        while (queue.length) {
            var cur = queue.shift();
            order.push(cur);
            steps.push({
                type: 'dequeue', node: cur, queue: queue.slice(), order: order.slice(),
                log: '큐에서 ' + cur + '를 꺼내 방문 순서에 추가합니다: [' + order.join(', ') + ']',
            });
            ADJ[cur].forEach(function (nb) {
                if (!visited[nb]) {
                    visited[nb] = true;
                    queue.push(nb);
                    steps.push({
                        type: 'enqueue', node: nb, queue: queue.slice(), order: order.slice(),
                        log: cur + '의 인접 정점 ' + nb + '를 큐에 삽입하고 방문 처리합니다.',
                    });
                }
            });
        }

        steps.push({
            type: 'done', node: null, queue: [], order: order.slice(),
            log: 'BFS 종료. 방문 순서: ' + order.join(' → ') + '. 모든 정점·간선을 한 번씩 확인하므로 시간복잡도는 O(V+E)입니다.',
        });
        steps.unshift({
            type: 'intro', node: null, queue: [], order: [],
            log: 'BFS(너비 우선 탐색)는 큐(Queue, FIFO)를 사용해 시작 정점과 가까운 정점부터 순서대로 방문합니다.',
        });
        return steps;
    }

    /* ===================== DFS 스텝 ===================== */
    function buildDFSSteps(startId) {
        var steps = [];
        var visited = {};
        var order = [];

        function dfs(id) {
            visited[id] = true;
            steps.push({
                type: 'enter', node: id, order: order.slice(),
                log: id + ' 진입 (호출 스택에 push), 방문 처리',
            });
            order.push(id);
            steps.push({
                type: 'visit', node: id, order: order.slice(),
                log: id + ' 방문 → 결과에 추가: [' + order.join(', ') + ']',
            });
            ADJ[id].forEach(function (nb) {
                if (!visited[nb]) dfs(nb);
            });
            steps.push({
                type: 'return', node: id, order: order.slice(),
                log: id + '와 연결된 미방문 정점 탐색 완료 (호출 스택에서 pop)',
            });
        }

        dfs(startId);
        steps.push({
            type: 'done', node: null, order: order.slice(),
            log: 'DFS 종료. 방문 순서: ' + order.join(' → ') + '. 시간복잡도 O(V+E), 재귀 호출 스택 깊이는 최악의 경우 O(V)입니다.',
        });
        steps.unshift({
            type: 'intro', node: null, order: [],
            log: 'DFS(깊이 우선 탐색)는 스택(재귀 호출 스택, LIFO)을 사용해 한 방향으로 최대한 깊이 들어간 뒤 되돌아옵니다.',
        });
        return steps;
    }

    var MATRIX_STEPS = buildMatrixSteps();
    var LIST_STEPS   = buildListSteps();
    var BFS_STEPS    = buildBFSSteps('A');
    var DFS_STEPS    = buildDFSSteps('A');

    function computeDFSStack(steps, idx) {
        var stack = [];
        for (var i = 0; i <= idx; i++) {
            var s = steps[i];
            if (s.type === 'enter')  stack.push(s.node);
            if (s.type === 'return') stack.pop();
        }
        return stack;
    }

    /* ===================== 상태 변수 ===================== */
    var mode     = 'structure';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;

    function currentSteps() {
        if (mode === 'structure') return STRUCTURE_STEPS;
        if (mode === 'matrix')    return MATRIX_STEPS;
        if (mode === 'list')      return LIST_STEPS;
        if (mode === 'bfs')       return BFS_STEPS;
        return DFS_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y,     x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x,     y + h, r);
        ctx.arcTo(x,     y + h, x,     y,     r);
        ctx.arcTo(x,     y,     x + w, y,     r);
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

    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, col, lw, dash) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }

    /* ===================== 노드 좌표 계산 ===================== */
    function nodePos(id, W, top, h, mob) {
        var n = NODES[id];
        var marginX = mob ? 28 : 46;
        var x = marginX + n.x * (W - 2 * marginX);
        var y = top + n.y * h;
        return { x: x, y: y };
    }

    /* ===================== 상태 색상 ===================== */
    function nodeColor(id, step) {
        if (mode === 'structure') {
            var hi = step.highlight;
            if (hi && hi.nodes.indexOf(id) >= 0) {
                if (step.label === 'adjacent') return P.teal;
                if (step.label === 'degree')   return P.orange;
                if (step.label === 'cycle')    return P.purple;
                return P.purple;
            }
            return P.muted;
        }
        if (mode === 'matrix') {
            if (step.type === 'fill' && (id === step.edge[0] || id === step.edge[1])) return P.orange;
            return P.muted;
        }
        if (mode === 'list') {
            var idx = NODE_ORDER.indexOf(id);
            if (step.type === 'fill' && step.nodeIdx === idx) return P.orange;
            if (step.type === 'complete') return P.teal;
            if (step.type === 'fill' && idx < step.nodeIdx) return P.teal;
            return P.muted;
        }
        if (mode === 'bfs') {
            if (step.node === id) return step.type === 'dequeue' ? P.green : P.orange;
            if (step.order && step.order.indexOf(id) >= 0) return P.teal;
            if (step.queue && step.queue.indexOf(id) >= 0) return P.orange;
            return P.muted;
        }
        if (step.node === id) {
            if (step.type === 'visit')  return P.green;
            if (step.type === 'enter')  return P.orange;
            if (step.type === 'return') return P.teal;
        }
        if (step.order && step.order.indexOf(id) >= 0) return P.teal;
        return P.muted;
    }

    /* ===================== 그래프 다이어그램 드로우 ===================== */
    function drawGraph(W, top, h, mob, step) {
        var r    = mob ? 20 : 26;
        var fVal = mob ? 13 : 15;
        var fLbl = mob ? 9  : 11;

        var hiEdges = (mode === 'structure') ? (step.highlight ? step.highlight.edges : []) : null;

        EDGES.forEach(function (e) {
            var p1 = nodePos(e[0], W, top, h, mob);
            var p2 = nodePos(e[1], W, top, h, mob);
            var col = P.muted + '33';
            var lw  = 1.5;

            if (mode === 'structure') {
                var isHi = edgeInList(e, hiEdges);
                col = isHi ? P.purple + 'aa' : P.muted + '33';
                lw  = isHi ? 2.2 : 1.5;
            } else if (mode === 'matrix' && step.type === 'fill' && sameEdge(e, step.edge)) {
                col = P.orange + 'cc'; lw = 2.2;
            } else if (mode === 'matrix' && step.type !== 'intro') {
                var idx2 = EDGES.indexOf(e);
                var filledUpTo = step.type === 'fill' ? step.edgeIdx : EDGES.length - 1;
                if (idx2 <= filledUpTo) { col = P.teal + '77'; lw = 1.8; }
            } else if (mode === 'list' && step.type === 'fill' && (e[0] === step.node || e[1] === step.node)) {
                col = P.orange + 'cc'; lw = 2.2;
            } else if (mode === 'list' && step.type === 'complete') {
                col = P.teal + '55'; lw = 1.8;
            } else if ((mode === 'bfs' || mode === 'dfs') && step.node) {
                if (e[0] === step.node || e[1] === step.node) { col = nodeColor(step.node, step) + '99'; lw = 2; }
            }
            line(p1.x, p1.y, p2.x, p2.y, col, lw);
        });

        NODE_ORDER.forEach(function (id) {
            var pos = nodePos(id, W, top, h, mob);
            var col = nodeColor(id, step);
            var isEmph = col !== P.muted;
            circle(pos.x, pos.y, r, col + (isEmph ? '22' : '12'), col + (isEmph ? 'ee' : '55'), isEmph ? 2.4 : 1.5);
            tx(id, pos.x, pos.y, fVal, isEmph ? col : P.text + 'cc', 'center', isEmph);

            if (mode === 'structure' && step.label === 'degree' && id === 'B') {
                tx('deg = ' + ADJ['B'].length, pos.x, pos.y - r - (mob ? 12 : 16), fLbl, P.orange, 'center', true);
            }
        });
    }

    /* ===================== 인접 행렬 패널 ===================== */
    function drawMatrixPanel(W, top, mob, step) {
        var n = NODE_ORDER.length;
        var cell = mob ? 25 : 32;
        var gridW = cell * (n + 1);
        var startX = Math.max(mob ? 10 : 20, (W - gridW) / 2);
        var startY = top + (mob ? 18 : 22);
        var fLbl = mob ? 9 : 11;
        var fVal = mob ? 11 : 13;

        tx('ADJACENCY MATRIX', startX, top, fLbl, P.muted + 'aa', 'left', true);

        var filledUpTo = step.type === 'intro' ? -1 : (step.type === 'fill' ? step.edgeIdx : EDGES.length - 1);
        var filledEdges = EDGES.slice(0, filledUpTo + 1);

        NODE_ORDER.forEach(function (colId, j) {
            var cx = startX + cell * (j + 1) + cell / 2;
            tx(colId, cx, startY + cell / 2, fLbl, P.muted + 'cc', 'center', true);
        });

        NODE_ORDER.forEach(function (rowId, i) {
            var ry = startY + cell * (i + 1);
            tx(rowId, startX + cell / 2, ry + cell / 2, fLbl, P.muted + 'cc', 'center', true);

            NODE_ORDER.forEach(function (colId, j) {
                var cx = startX + cell * (j + 1);
                var isDiag = rowId === colId;
                var hasEdge = !isDiag && filledEdges.some(function (e) { return sameEdge(e, [rowId, colId]); });
                var isCurrent = !isDiag && step.type === 'fill' && sameEdge(step.edge, [rowId, colId]);

                var fill = isDiag ? P.muted + '10' : (isCurrent ? P.orange + '2a' : (hasEdge ? P.teal + '1c' : 'transparent'));
                var stroke = isDiag ? P.muted + '33' : (isCurrent ? P.orange + 'ee' : (hasEdge ? P.teal + 'aa' : P.muted + '33'));
                rr(cx, ry, cell, cell, 3, fill, stroke, isCurrent ? 2.2 : 1);

                var val = isDiag ? '—' : (hasEdge ? '1' : '0');
                var valCol = isDiag ? P.muted + '66' : (isCurrent ? P.orange : (hasEdge ? P.teal : P.muted + '88'));
                tx(val, cx + cell / 2, ry + cell / 2, fVal, valCol, 'center', hasEdge || isCurrent);
            });
        });
    }

    /* ===================== 인접 리스트 패널 ===================== */
    function drawListPanel(W, top, mob, step) {
        var rowH = mob ? 24 : 28;
        var fLbl = mob ? 9  : 11;
        var fVal = mob ? 12 : 13;
        var x0 = mob ? 16 : 28;

        tx('ADJACENCY LIST', x0, top, fLbl, P.muted + 'aa', 'left', true);

        var filledUpTo = step.type === 'intro' ? -1 : (step.type === 'fill' ? step.nodeIdx : NODE_ORDER.length - 1);

        NODE_ORDER.forEach(function (id, i) {
            var y = top + (mob ? 18 : 22) + i * rowH;
            var isCurrent = step.type === 'fill' && step.nodeIdx === i;
            var isFilled  = i <= filledUpTo;
            var col = isCurrent ? P.orange : (isFilled ? P.teal : P.muted + '77');
            var text = id + '  →  [ ' + (isFilled ? ADJ[id].join(', ') : '…') + ' ]';
            tx(text, x0, y, fVal, col, 'left', isCurrent);
        });
    }

    /* ===================== BFS 큐 패널 ===================== */
    function drawQueuePanel(W, top, mob, step) {
        var fLbl = mob ? 9 : 11;
        var boxW = mob ? 34 : 42;
        var boxH = mob ? 28 : 34;
        var gap  = mob ? 6  : 8;
        var x0   = mob ? 16 : 28;

        tx('QUEUE (FRONT → BACK)', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var by = top + (mob ? 16 : 20);
        var q = step.queue || [];
        if (!q.length) {
            tx('(empty)', x0, by + boxH / 2, mob ? 10 : 12, P.muted + '77', 'left', false);
        } else {
            q.forEach(function (id, i) {
                var bx = x0 + i * (boxW + gap);
                var isFront = i === 0;
                var col = isFront ? P.orange : P.muted;
                rr(bx, by, boxW, boxH, 5, col + '18', col + 'cc', isFront ? 2 : 1.5);
                tx(id, bx + boxW / 2, by + boxH / 2, mob ? 12 : 14, col, 'center', true);
            });
        }

        var resY = by + boxH + (mob ? 22 : 28);
        tx('VISITED ORDER', x0, resY, fLbl, P.muted + 'aa', 'left', true);
        tx((step.order && step.order.length) ? step.order.join(', ') : '(empty)', x0, resY + (mob ? 16 : 20), mob ? 12 : 13, P.green, 'left', false);
    }

    /* ===================== DFS 콜스택 패널 ===================== */
    function drawStackPanel(W, top, mob, steps, step, idx) {
        var fLbl = mob ? 9 : 11;
        var boxW = mob ? 34 : 42;
        var boxH = mob ? 28 : 34;
        var gap  = mob ? 6  : 8;
        var x0   = mob ? 16 : 28;

        tx('CALL STACK', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var by = top + (mob ? 16 : 20);
        var stack = computeDFSStack(steps, idx);
        if (!stack.length) {
            tx('(empty)', x0, by + boxH / 2, mob ? 10 : 12, P.muted + '77', 'left', false);
        } else {
            stack.forEach(function (id, i) {
                var bx = x0 + i * (boxW + gap);
                var isTop = i === stack.length - 1;
                var col = isTop ? P.orange : P.muted;
                rr(bx, by, boxW, boxH, 5, col + '18', col + 'cc', isTop ? 2 : 1.5);
                tx(id, bx + boxW / 2, by + boxH / 2, mob ? 12 : 14, col, 'center', true);
            });
        }

        var resY = by + boxH + (mob ? 22 : 28);
        tx('VISITED ORDER', x0, resY, fLbl, P.muted + 'aa', 'left', true);
        tx((step.order && step.order.length) ? step.order.join(', ') : '(empty)', x0, resY + (mob ? 16 : 20), mob ? 12 : 13, P.green, 'left', false);
    }

    /* ===================== 레이아웃 상수 (calcH / draw 공용) ===================== */
    function getLayout(mob) {
        return {
            top:       mob ? 24  : 32,
            r:         mob ? 20  : 26,
            ghFull:    mob ? 190 : 230,
            ghPanel:   mob ? 130 : 160,
            panelGap:  mob ? 46  : 56,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);

        if (mode === 'structure') {
            return L.top + L.ghFull + L.r + (mob ? 30 : 40);
        }
        if (mode === 'matrix') {
            var cell = mob ? 25 : 32;
            var matrixH = (mob ? 18 : 22) + cell * 7 + (mob ? 20 : 26);
            return L.top + L.ghPanel + L.panelGap + matrixH;
        }
        if (mode === 'list') {
            var rowH = mob ? 24 : 28;
            var listH = (mob ? 18 : 22) + rowH * 6 + (mob ? 16 : 20);
            return L.top + L.ghPanel + L.panelGap + listH;
        }
        var panelH = (mob ? 16 : 20) + (mob ? 28 : 34) + (mob ? 22 : 28) + (mob ? 16 : 20) + (mob ? 20 : 24);
        return L.top + L.ghPanel + L.panelGap + panelH;
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

        if (mode === 'structure') {
            drawGraph(W, L.top, L.ghFull, mob, step);
            return;
        }

        drawGraph(W, L.top, L.ghPanel, mob, step);
        var panelTop = L.top + L.ghPanel + L.panelGap;

        if (mode === 'matrix') drawMatrixPanel(W, panelTop, mob, step);
        else if (mode === 'list') drawListPanel(W, panelTop, mob, step);
        else if (mode === 'bfs') drawQueuePanel(W, panelTop, mob, step);
        else drawStackPanel(W, panelTop, mob, steps, step, stepIdx >= 0 ? stepIdx : 0);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
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
        if (mode === 'structure') return '▶ PLAY를 눌러 그래프 구조를 확인하세요.';
        if (mode === 'matrix')    return '▶ PLAY를 눌러 인접 행렬이 채워지는 과정을 확인하세요.';
        if (mode === 'list')      return '▶ PLAY를 눌러 인접 리스트가 채워지는 과정을 확인하세요.';
        if (mode === 'bfs')       return '▶ PLAY를 눌러 BFS 탐색 과정을 확인하세요.';
        return '▶ PLAY를 눌러 DFS 탐색 과정을 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.55);
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
        speedBtns.forEach(function (b) { b.classList.remove('graph-viz__speed-btn--active'); });
        btn.classList.add('graph-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('graph-viz__mode-btn--active', d.key === m);
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