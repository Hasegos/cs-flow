/**
 * 그래프 시각화 시각화
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
        { key: 'matrix', label: '인접 행렬' },
        { key: 'list', label: '인접 리스트' },
        { key: 'bfs', label: 'BFS' },
        { key: 'dfs', label: 'DFS' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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

    var logEl = el('div', 'graph-viz__log', '');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'structure';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'matrix') return MATRIX_STEPS;
        if (mode === 'list') return LIST_STEPS;
        if (mode === 'bfs') return BFS_STEPS;
        if (mode === 'dfs') return DFS_STEPS;
        return STRUCTURE_STEPS;
    }
    function defaultLog() {
        if (mode === 'matrix') return '▶ PLAY를 눌러 인접 행렬이 채워지는 과정을 확인하세요.';
        if (mode === 'list') return '▶ PLAY를 눌러 인접 리스트가 채워지는 과정을 확인하세요.';
        if (mode === 'bfs') return '▶ PLAY를 눌러 BFS 탐색 과정을 확인하세요.';
        if (mode === 'dfs') return '▶ PLAY를 눌러 DFS 탐색 과정을 확인하세요.';
        return '▶ PLAY를 눌러 그래프 구조를 확인하세요.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var L = {
            mob: mob,
            side: !mob,
            r: mob ? 18 : 24,
            gh: mob ? 168 : 220,
            fs: mob ? 11 : 12,
            cell: mob ? 24 : 30,
            rowH: mob ? 18 : 22,
            bw: mob ? 30 : 40,
            bh: mob ? 26 : 32,
            gap: mob ? 5 : 8,
        };
        L.y0 = L.gh + 14;
        var mH = 16 + L.cell * 7;
        var lH = 16 + L.rowH * 6;
        L.lX = L.cell * 8 + 44;
        L.lY = L.side ? L.y0 : L.y0 + mH + 14;
        L.matrixTotal = L.side ? L.y0 + Math.max(mH, lH) + 6 : L.lY + lH + 6;
        L.listTotal = L.y0 + lH + 6;
        L.panelTotal = L.y0 + 16 + L.bh + 40;
        L.structTotal = L.gh + 8;
        return L;
    }
    function sceneH(w, mob) {
        var L = layout(w, mob);
        if (mode === 'structure') return L.structTotal;
        if (mode === 'matrix') return L.matrixTotal;
        if (mode === 'list') return L.listTotal;
        return L.panelTotal;
    }

    /* ===================== 공통 헬퍼 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function dgW(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function dgPos(x0, top, w, L) {
        var mx = L.mob ? 22 : 44;
        var out = {};
        NODE_ORDER.forEach(function (id) {
            var n = NODES[id];
            out[id] = { x: x0 + mx + n.x * (w - 2 * mx), y: top + L.r + n.y * (L.gh - 2 * L.r) };
        });
        return out;
    }
    function dgEdge(pos, ed, col, lw, f) {
        var a = pos[ed[0]], b = pos[ed[1]];
        var k = f === undefined ? 1 : f;
        ln(a.x, a.y, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, col, lw);
    }
    function dgEdgeIdx(a, b) {
        for (var i = 0; i < EDGES.length; i++) {
            if (sameEdge(EDGES[i], [a, b])) return i;
        }
        return -1;
    }
    function dgStructCol(s) {
        if (!s) return P.purple;
        if (s.label === 'adjacent') return P.teal;
        if (s.label === 'degree') return P.orange;
        return P.purple;
    }
    function dgNode(q, id, r, col, a, solid) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(q.x, q.y, r, solid ? col + 'ff' : col + '26', col + 'ff', 2);
        tx(id, q.x, q.y, r < 20 ? 13 : 15, solid ? '#111111' : P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function dgRing(q, rad, col, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(q.x, q.y, rad, 'none', col, 2.4);
        ctx.globalAlpha = 1;
    }
    function dgDot(x, y, rad, col) { circ(x, y, rad, col, 'none'); }
    function dgBox(x, y, bw, bh, id, col, fs) {
        rr(x, y, bw, bh, 5, col + '18', col + 'cc', 1.6);
        tx(id, x + bw / 2, y + bh / 2, fs, col + 'ff', 'center', true);
    }
    function dgRow(id, items, alphas, base, x, y, sz, col, bold) {
        ctx.globalAlpha = base;
        if (!items.length) {
            tx(id + '  →  [ ]', x, y, sz, col, 'left', bold);
            ctx.globalAlpha = 1;
            return;
        }
        var acc = id + '  →  [ ';
        tx(acc, x, y, sz, col, 'left', bold);
        items.forEach(function (nb, j) {
            var piece = (j > 0 ? ', ' : '') + nb;
            ctx.globalAlpha = alphas[j] * base;
            tx(piece, x + dgW(acc, sz, bold), y, sz, col, 'left', bold);
            acc += piece;
        });
        ctx.globalAlpha = base;
        tx(' ]', x + dgW(acc, sz, bold), y, sz, col, 'left', bold);
        ctx.globalAlpha = 1;
    }
    function dgBfsTree(steps, si) {
        var out = [];
        for (var i = 0; i <= si; i++) {
            var q = steps[i];
            if (q.type === 'enqueue' && q.order.length) out.push([q.order[q.order.length - 1], q.node]);
        }
        return out;
    }
    function dgDfsInfo(steps, si) {
        var st = [], tree = [];
        for (var i = 0; i <= si; i++) {
            var q = steps[i];
            if (q.type === 'enter') {
                if (st.length) tree.push([st[st.length - 1], q.node]);
                st.push(q.node);
            } else if (q.type === 'return') {
                st.pop();
            }
        }
        return { stack: st, tree: tree };
    }
    function dgFilled(st) {
        if (st.type === 'intro') return 0;
        if (st.type === 'complete') return EDGES.length;
        return st.edgeIdx + 1;
    }

    /* ===================== 구조 장면 ===================== */
    function dgStructure(x0, top, w, L, s, p, e) {
        var pos = dgPos(x0, top, w, L);
        var r = L.r;
        var hi = s.highlight;
        var ph = p ? p.highlight : null;
        var col = dgStructCol(s);
        var pcol = dgStructCol(p);

        EDGES.forEach(function (ed) {
            var inC = edgeInList(ed, hi.edges);
            var inP = ph ? edgeInList(ed, ph.edges) : false;
            if (inC && inP) dgEdge(pos, ed, col + 'aa', 2.2, 1);
            else if (inC) dgEdge(pos, ed, col + 'aa', 2.2, ez(e));
            else if (inP) {
                ctx.globalAlpha = 1 - ez(e);
                dgEdge(pos, ed, pcol + 'aa', 2.2, 1);
                ctx.globalAlpha = 1;
            } else dgEdge(pos, ed, P.muted + '33', 1.5, 1);
        });

        if (s.label === 'adjacent' && e < 1 && (!p || p.label !== 'adjacent')) {
            ADJ.B.forEach(function (nb, j) {
                var k = clamp01((e - j * 0.15) / 0.7);
                if (k <= 0 || k >= 1) return;
                var a = pos.B, b = pos[nb];
                dgDot(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 4.5, P.teal + 'ff');
            });
        }

        NODE_ORDER.forEach(function (id, i) {
            var inC = hi.nodes.indexOf(id) >= 0;
            var inP = ph ? ph.nodes.indexOf(id) >= 0 : false;
            var oa = 0, oc = col;
            if (inC && inP) oa = 1;
            else if (inC) oa = ez(seg(e, i * 0.06, 0.6 + i * 0.06));
            else if (inP) { oa = 1 - ez(e); oc = pcol; }
            if (oa < 1) dgNode(pos[id], id, r, P.muted, 1 - oa, false);
            if (oa > 0) dgNode(pos[id], id, r, oc, oa, false);
        });

        if (s.label === 'degree') {
            var nDeg = ADJ.B.length;
            var fresh = !p || p.label !== 'degree';
            var cnt = fresh ? Math.min(nDeg, Math.floor(e * (nDeg + 1))) : nDeg;
            tx('deg = ' + cnt, pos.B.x, pos.B.y - r - 12, L.fs, P.orange + 'ff', 'center', true);
        }

        if (s.label === 'cycle') {
            var cyc = ['A', 'B', 'E', 'F', 'C', 'A'];
            var u = e * (cyc.length - 1);
            var k2 = Math.min(cyc.length - 2, Math.floor(u));
            var fr = u - k2;
            var pa = pos[cyc[k2]], pb = pos[cyc[k2 + 1]];
            if (e < 1 && (!p || p.label !== 'cycle')) dgDot(pa.x + (pb.x - pa.x) * fr, pa.y + (pb.y - pa.y) * fr, 5, P.purple + 'ff');
            for (var c = 0; c < 5; c++) {
                if (u >= c - 0.01) tx(String(c + 1), pos[cyc[c]].x, pos[cyc[c]].y - r - 9, L.fs, P.purple + 'ff', 'center', true);
            }
        }
    }

    /* ===================== 인접 행렬 장면 ===================== */
    function dgMatrix(x0, top, w, L, s, p, e) {
        var pos = dgPos(x0, top, w, L);
        var ga = p ? 1 : ez(e);
        var n = dgFilled(s);
        var ni = (s.type === 'fill' && (!p || p.edgeIdx !== s.edgeIdx)) ? s.edgeIdx : -1;
        var ne = ni >= 0 ? EDGES[ni] : null;
        var grow = ni >= 0 ? ez(seg(e, 0, 0.5)) : 1;
        var ov = ni >= 0 ? ez(seg(e, 0.5, 0.9)) : 0;
        var touched = {};
        EDGES.forEach(function (ed, i) {
            if (i < n) { touched[ed[0]] = true; touched[ed[1]] = true; }
        });

        ctx.globalAlpha = ga;
        EDGES.forEach(function (ed, i) {
            if (i >= n) dgEdge(pos, ed, P.muted + '33', 1.4, 1);
            else if (i === ni) dgEdge(pos, ed, P.orange + 'cc', 2.4, grow);
            else dgEdge(pos, ed, P.teal + 'aa', 1.8, 1);
        });
        if (ne && e < 0.5) {
            var qa = pos[ne[0]], qb = pos[ne[1]];
            dgDot(qa.x + (qb.x - qa.x) * grow, qa.y + (qb.y - qa.y) * grow, 4, P.orange + 'ff');
        }
        NODE_ORDER.forEach(function (id) {
            var isE = ne && (ne[0] === id || ne[1] === id);
            dgNode(pos[id], id, L.r, isE ? P.orange : (touched[id] ? P.teal : P.muted), ga, !!isE);
        });

        var mY = top + L.y0;
        var gridTop = mY + 16;
        var cell = L.cell, fsL = L.fs, fsV = L.mob ? 11 : 13;
        var x = x0;
        ctx.globalAlpha = ga;
        tx('ADJACENCY MATRIX', x, mY + 7, fsL, P.muted + 'ff', 'left', true);
        NODE_ORDER.forEach(function (id, j) {
            tx(id, x + cell * (j + 1) + cell / 2, gridTop + cell / 2, fsL, P.muted + 'ff', 'center', true);
        });
        NODE_ORDER.forEach(function (rowId, i) {
            var ry = gridTop + cell * (i + 1);
            tx(rowId, x + cell / 2, ry + cell / 2, fsL, P.muted + 'ff', 'center', true);
            NODE_ORDER.forEach(function (colId, j) {
                var cx = x + cell * (j + 1);
                if (i === j) {
                    rr(cx + 1, ry + 1, cell - 2, cell - 2, 3, P.muted + '10', P.muted + '33', 1);
                    tx('—', cx + cell / 2, ry + cell / 2, fsV, P.muted + 'ff', 'center', false);
                    return;
                }
                var ei = dgEdgeIdx(rowId, colId);
                if (ei >= 0 && ei === ni) {
                    rr(cx + 1, ry + 1, cell - 2, cell - 2, 3, 'none', P.muted + '33', 1);
                    ctx.globalAlpha = ga * ov;
                    rr(cx + 1, ry + 1, cell - 2, cell - 2, 3, P.orange + '2a', P.orange + 'ee', 2);
                    ctx.globalAlpha = ga;
                    tx(ov > 0.5 ? '1' : '0', cx + cell / 2, ry + cell / 2, fsV, ov > 0.5 ? P.orange + 'ff' : P.muted + 'ff', 'center', ov > 0.5);
                    return;
                }
                var on = ei >= 0 && ei < n;
                rr(cx + 1, ry + 1, cell - 2, cell - 2, 3, on ? P.teal + '2a' : 'none', on ? P.teal + 'aa' : P.muted + '33', 1);
                tx(on ? '1' : '0', cx + cell / 2, ry + cell / 2, fsV, on ? P.teal + 'ff' : P.muted + 'ff', 'center', on);
            });
        });
        if (s.type === 'complete' && e < 1) {
            var sy = gridTop + cell * (1 + 6 * e);
            ln(x + cell, sy, x + cell * 8, sy, P.orange + 'aa', 2);
        }

        var lx = x0 + (L.side ? L.lX : 0);
        var lt = top + L.lY;
        ctx.globalAlpha = ga;
        tx('ADJACENCY LIST', lx, lt + 7, fsL, P.muted + 'ff', 'left', true);
        NODE_ORDER.forEach(function (id, i) {
            var yc = lt + 16 + i * L.rowH + L.rowH / 2;
            var items = ADJ[id].filter(function (nb) {
                var k = dgEdgeIdx(id, nb);
                return k >= 0 && k < n;
            });
            var isE = ne && (ne[0] === id || ne[1] === id);
            var other = isE ? (ne[0] === id ? ne[1] : ne[0]) : null;
            var alphas = items.map(function (nb) { return nb === other ? ov : 1; });
            var col = isE ? P.orange + 'ff' : (items.length ? P.teal + 'ff' : P.muted + 'ff');
            dgRow(id, items, alphas, ga, lx, yc, fsL, col, !!isE);
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== 인접 리스트 장면 ===================== */
    function dgList(x0, top, w, L, s, p, e) {
        var pos = dgPos(x0, top, w, L);
        var ga = p ? 1 : ez(e);
        var cur = s.type === 'fill' ? s.nodeIdx : -1;
        var curId = cur >= 0 ? NODE_ORDER[cur] : null;
        var fresh = cur >= 0 && (!p || p.nodeIdx !== cur);
        var done = function (id) {
            return s.type === 'complete' || (cur >= 0 && NODE_ORDER.indexOf(id) < cur);
        };

        ctx.globalAlpha = ga;
        EDGES.forEach(function (ed) {
            if (curId && (ed[0] === curId || ed[1] === curId)) {
                var other = ed[0] === curId ? ed[1] : ed[0];
                var j = ADJ[curId].indexOf(other);
                dgEdge(pos, ed, P.orange + 'cc', 2.4, fresh ? ez(seg(e, j * 0.3, j * 0.3 + 0.4)) : 1);
            } else if (done(ed[0]) || done(ed[1])) {
                dgEdge(pos, ed, P.teal + 'aa', 1.8, 1);
            } else {
                dgEdge(pos, ed, P.muted + '33', 1.4, 1);
            }
        });
        NODE_ORDER.forEach(function (id) {
            var isC = id === curId;
            dgNode(pos[id], id, L.r, isC ? P.orange : (done(id) ? P.teal : P.muted), ga, isC);
        });

        var lt = top + L.y0;
        tx('ADJACENCY LIST', x0, lt + 7, L.fs, P.muted + 'ff', 'left', true);
        NODE_ORDER.forEach(function (id, i) {
            var yc = lt + 16 + i * L.rowH + L.rowH / 2;
            if (!done(id) && id !== curId) {
                ctx.globalAlpha = ga;
                tx(id + '  →  [ … ]', x0, yc, L.fs, P.sub + 'ff', 'left', false);
                return;
            }
            var items = ADJ[id];
            var alphas = items.map(function (nb, j) {
                return (id === curId && fresh) ? ez(seg(e, j * 0.3, j * 0.3 + 0.4)) : 1;
            });
            dgRow(id, items, alphas, ga, x0, yc, L.fs, id === curId ? P.orange + 'ff' : P.teal + 'ff', id === curId);
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== BFS 큐 장면 ===================== */
    function dgQueue(x0, top, w, L, s, p, e, steps, si) {
        var pos = dgPos(x0, top, w, L);
        var ga = p ? 1 : ez(e);
        var tN = dgBfsTree(steps, si);
        var tP = si > 0 ? dgBfsTree(steps, si - 1) : [];
        var fe = s.type === 'enqueue' && tN.length > tP.length ? tN[tN.length - 1] : null;
        var q = s.queue || [];
        var pq = p ? (p.queue || []) : [];
        var ord = s.order || [];

        ctx.globalAlpha = ga;
        EDGES.forEach(function (ed) { dgEdge(pos, ed, P.muted + '33', 1.4, 1); });
        tN.forEach(function (ed) { if (ed !== fe) dgEdge(pos, ed, P.teal + 'cc', 2.2, 1); });
        if (fe) dgEdge(pos, fe, P.orange + 'ee', 2.6, ez(e));
        NODE_ORDER.forEach(function (id) {
            var isC = s.node === id;
            var col = P.muted, solid = false, a = ga;
            if (isC && s.type === 'dequeue') { col = P.green; solid = true; }
            else if (isC) { col = P.orange; solid = true; a = ga * ez(e); }
            else if (ord.indexOf(id) >= 0) col = P.teal;
            else if (q.indexOf(id) >= 0) col = P.orange;
            dgNode(pos[id], id, L.r, col, a, solid);
            if (isC && s.type === 'dequeue') dgRing(pos[id], L.r + 60 * ez(e), P.green + 'ff', 0.8 * (1 - e));
        });

        ctx.globalAlpha = 1;
        var lt = top + L.y0;
        var by = lt + 16, bw = L.bw, bh = L.bh, stp = L.bw + L.gap, fsB = L.mob ? 12 : 14;
        tx('QUEUE (FRONT → BACK)', x0, lt + 7, L.fs, P.muted + 'ff', 'left', true);
        pq.forEach(function (id, k) {
            if (q.indexOf(id) >= 0) return;
            ctx.globalAlpha = 1 - ez(e);
            dgBox(x0 + k * stp, by, bw, bh, id, P.green, fsB);
        });
        q.forEach(function (id, i) {
            var from = pq.indexOf(id);
            if (from < 0) return;
            ctx.globalAlpha = ga;
            dgBox(x0 + lerp(from, i, ez(e)) * stp, by, bw, bh, id, i === 0 ? P.orange : P.muted, fsB);
        });
        if (s.type === 'enqueue') {
            var ni = q.indexOf(s.node);
            var sx = x0 + ni * stp + bw / 2, sy = by + bh / 2;
            var fp = fe ? pos[fe[0]] : null;
            var fx = fp ? lerp(fp.x, sx, ez(e)) : sx;
            var fy = fp ? lerp(fp.y, sy, ez(e)) : sy;
            ctx.globalAlpha = fp ? seg(e, 0, 0.2) : ez(e);
            dgBox(fx - bw / 2, fy - bh / 2, bw, bh, s.node, P.orange, fsB);
        }
        ctx.globalAlpha = 1;
        if (!q.length && e >= 1) tx('(empty)', x0, by + bh / 2, L.fs, P.sub + 'ff', 'left', false);

        var oy = by + bh + 12;
        tx('VISITED ORDER', x0, oy, L.fs, P.muted + 'ff', 'left', true);
        tx(ord.length ? ord.join(', ') : '(empty)', x0, oy + 18, L.mob ? 12 : 13, P.green + 'ff', 'left', false);
    }

    /* ===================== DFS 스택 장면 ===================== */
    function dgStack(x0, top, w, L, s, p, e, steps, si) {
        var pos = dgPos(x0, top, w, L);
        var ga = p ? 1 : ez(e);
        var iN = dgDfsInfo(steps, si);
        var iP = si > 0 ? dgDfsInfo(steps, si - 1) : { stack: [], tree: [] };
        var fe = s.type === 'enter' && iN.tree.length > iP.tree.length ? iN.tree[iN.tree.length - 1] : null;
        var st = iN.stack, pst = iP.stack, ord = s.order || [];

        ctx.globalAlpha = ga;
        EDGES.forEach(function (ed) { dgEdge(pos, ed, P.muted + '33', 1.4, 1); });
        iN.tree.forEach(function (ed) { if (ed !== fe) dgEdge(pos, ed, P.teal + 'cc', 2.2, 1); });
        if (fe) dgEdge(pos, fe, P.orange + 'ee', 2.6, ez(e));
        NODE_ORDER.forEach(function (id) {
            var isC = s.node === id;
            var col = P.muted, solid = false, a = ga;
            if (isC && s.type === 'visit') { col = P.green; solid = true; }
            else if (isC && s.type === 'enter') { col = P.orange; solid = true; a = ga * ez(e); }
            else if (isC) { col = P.teal; solid = true; }
            else if (ord.indexOf(id) >= 0) col = P.teal;
            else if (st.indexOf(id) >= 0) col = P.orange;
            dgNode(pos[id], id, L.r, col, a, solid);
            if (isC && s.type === 'visit') dgRing(pos[id], L.r + 60 * ez(e), P.green + 'ff', 0.8 * (1 - e));
        });

        ctx.globalAlpha = 1;
        var lt = top + L.y0;
        var by = lt + 16, bw = L.bw, bh = L.bh, stp = L.bw + L.gap, fsB = L.mob ? 12 : 14;
        tx('CALL STACK (LIFO)', x0, lt + 7, L.fs, P.muted + 'ff', 'left', true);
        var n = Math.max(st.length, pst.length);
        for (var i = 0; i < n; i++) {
            var inNow = i < st.length;
            var id = inNow ? st[i] : pst[i];
            var isNew = inNow && i >= pst.length;
            var isTop = inNow && i === st.length - 1;
            var dy = 0;
            if (isNew) { ctx.globalAlpha = ez(e); dy = -14 * (1 - ez(e)); }
            else if (!inNow) { ctx.globalAlpha = 1 - ez(e); dy = -12 * ez(e); }
            else ctx.globalAlpha = ga;
            dgBox(x0 + i * stp, by + dy, bw, bh, id, isTop ? P.orange : P.muted, fsB);
        }
        ctx.globalAlpha = 1;
        if (!n && e >= 1) tx('(empty)', x0, by + bh / 2, L.fs, P.sub + 'ff', 'left', false);

        var oy = by + bh + 12;
        tx('VISITED ORDER', x0, oy, L.fs, P.muted + 'ff', 'left', true);
        tx(ord.length ? ord.join(', ') : '(empty)', x0, oy + 18, L.mob ? 12 : 13, P.green + 'ff', 'left', false);
    }

    /* ===================== 메인 드로우 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var si = Math.max(0, steps.indexOf(s));
        var p = prev || null;
        var e = clamp01(t);
        if (mode === 'structure') dgStructure(x0, top, w, L, s, p, e);
        else if (mode === 'matrix') dgMatrix(x0, top, w, L, s, p, e);
        else if (mode === 'list') dgList(x0, top, w, L, s, p, e);
        else if (mode === 'bfs') dgQueue(x0, top, w, L, s, p, e, steps, si);
        else dgStack(x0, top, w, L, s, p, e, steps, si);
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
        speedBtns.forEach(function (b) { b.classList.remove('graph-viz__speed-btn--active'); });
        btn.classList.add('graph-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('graph-viz__mode-btn--active', d.key === m); });
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