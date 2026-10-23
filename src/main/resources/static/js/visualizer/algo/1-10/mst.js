/**
 * 최소 신장 트리(MST) 시각화 시각화
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
        { key: 'prim', label: '프림' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'kruskal';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'kruskal' ? KRUSKAL_STEPS : PRIM_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    var msLayCache = null;

    /* ===================== 공통 계산 ===================== */
    function msMetrics(mob) {
        return {
            fs: mob ? 11 : 12.5,
            fsB: mob ? 12 : 14,
            R: mob ? 13 : 17,
            gh: mob ? 140 : 190,
            padX: mob ? 22 : 30,
            padY: mob ? 22 : 27,
            gapB: mob ? 10 : 14,
            titleGap: mob ? 16 : 20,
            chipH: mob ? 24 : 27,
            chipGap: mob ? 6 : 8,
            chipRowGap: mob ? 8 : 9,
            chipPad: mob ? 8 : 10,
            rowH: mob ? 21 : 25,
            barH: mob ? 10 : 12,
            labW: mob ? 50 : 64,
            valW: mob ? 34 : 44,
            lineH: mob ? 14 : 17
        };
    }
    function msTextW(str, fs) {
        var w = 0;
        for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) < 128 ? 0.6 * fs : fs;
        return w;
    }
    function msSorted() {
        return EDGES.slice().sort(function (a, b) { return a[2] - b[2]; });
    }
    function msSameEdge(a, b) {
        return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
    }
    function msHasPair(list, a, b) {
        return (list || []).some(function (pr) { return msSameEdge(pr, [a, b]); });
    }
    function msIdxOf(list, ed) {
        for (var k = 0; k < list.length; k++) if (msSameEdge(list[k], ed)) return k;
        return -1;
    }
    function msComp(list) {
        var par = [];
        for (var i = 0; i < N; i++) par.push(i);
        function msRootOf(x) { while (par[x] !== x) x = par[x]; return x; }
        (list || []).forEach(function (pr) {
            var ra = msRootOf(pr[0]), rb = msRootOf(pr[1]);
            if (ra !== rb) par[Math.max(ra, rb)] = Math.min(ra, rb);
        });
        var out = [];
        for (var k = 0; k < N; k++) out.push(msRootOf(k));
        return out;
    }
    function msMaxW() {
        return EDGES.reduce(function (mx, ed) { return ed[2] > mx ? ed[2] : mx; }, 0);
    }
    function msFrontier(st) {
        var out = [], seen = {};
        EDGES.forEach(function (ed) {
            [[ed[0], ed[1]], [ed[1], ed[0]]].forEach(function (pr) {
                var from = pr[0], to = pr[1];
                if (st.inTree[from] && !st.inTree[to] && st.dist[to] === ed[2] && !seen[to]) {
                    seen[to] = true;
                    out.push({ ed: ed, to: to });
                }
            });
        });
        return out;
    }
    function msNextOf(st) {
        var best = -1;
        for (var i = 0; i < N; i++) {
            if (!st.inTree[i] && st.dist[i] !== Infinity && (best < 0 || st.dist[i] < st.dist[best])) best = i;
        }
        return best;
    }
    function msChipRows(x0, W, mob) {
        var m = msMetrics(mob), items = [], x = x0, row = 0;
        msSorted().forEach(function (ed) {
            var lbl = ed[0] + '-' + ed[1] + '(' + ed[2] + ')';
            var cw = msTextW(lbl, m.fs) + m.chipPad * 2;
            if (x + cw > x0 + W && x > x0) { x = x0; row++; }
            items.push({ ed: ed, lbl: lbl, x: x, w: cw, row: row });
            x += cw + m.chipGap;
        });
        return { items: items, rows: row + 1 };
    }
    function msStepsOf(md) {
        return md === 'kruskal' ? KRUSKAL_STEPS : PRIM_STEPS;
    }
    function msLegendOf(md) {
        return md === 'kruskal'
            ? '초록 = 채택 · 빨간 ✕ = 사이클이라 기각 · 주황 = 현재'
            : '초록 = 트리 간선 · 주황 = 다음 후보';
    }
    function msCapOf(md, st) {
        if (md === 'kruskal') {
            if (st.type === 'intro') return '처음엔 노드마다 따로 한 그룹이다';
            if (st.type === 'skip') return '같은 그룹이면 연결 시 사이클 → 건너뜀';
            if (st.type === 'done') return '노드 ' + N + '개가 한 그룹이 되었다 = 트리 완성';
            return '다른 그룹끼리라 합친다 (union)';
        }
        if (st.type === 'intro') return '시작 노드 ' + SRC + '의 키는 0, 나머지는 ∞';
        if (st.type === 'done') return '모든 노드가 트리에 붙었다 = MST 완성';
        return '키가 가장 작은 노드를 트리에 붙이고 이웃 키를 갱신';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var key = w + '|' + (mob ? 1 : 0);
        if (msLayCache && msLayCache.key === key) return msLayCache.val;
        var m = msMetrics(mob), legL = 1, capL = 1;
        ['kruskal', 'prim'].forEach(function (md) {
            legL = Math.max(legL, lines(msLegendOf(md), w, m.fs).length);
            msStepsOf(md).forEach(function (st) {
                capL = Math.max(capL, lines(msCapOf(md, st), w, m.fs).length);
            });
        });
        var rows = msChipRows(0, w, mob).rows;
        var listH = Math.max(rows * m.chipH + (rows - 1) * m.chipRowGap, N * m.rowH);
        var total = m.gh + m.gapB + m.titleGap + listH + 8 + legL * m.lineH + 4 + capL * m.lineH + 4;
        var val = { m: m, listH: listH, legL: legL, capL: capL, total: total };
        msLayCache = { key: key, val: val };
        return val;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function msGeom(x0, top, w, mob) {
        var L = layout(w, mob), m = L.m;
        var pts = NODES.map(function (nd) {
            return { x: x0 + m.padX + nd.x * (w - 2 * m.padX), y: top + m.padY + nd.y * (m.gh - 2 * m.padY) };
        });
        var bTop = top + m.gh + m.gapB;
        return { x0: x0, w: w, mob: mob, m: m, L: L, pts: pts, bTop: bTop, listTop: bTop + m.titleGap };
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function msChipBox(x, y, w, h, lbl, col, fsz, alpha, txtCol) {
        ctx.globalAlpha = alpha;
        rr(x, y, w, h, 5, col + '26', col + 'aa', 1.3);
        tx(lbl, x + w / 2, y + h / 2, fsz, (txtCol || P.text) + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function msPill(x, y, lbl, col, fsz) {
        var bw = msTextW(lbl, fsz) + 8, bh = fsz + 6;
        rr(x - bw / 2, y - bh / 2, bw, bh, 4, P.surf2 + 'ee', 'none');
        tx(lbl, x, y, fsz, col, 'center', true);
    }
    function msKNodeCol(st, id) {
        if (st.type === 'done') return P.green;
        if (st.edge && (st.edge[0] === id || st.edge[1] === id)) return P.orange;
        var comp = msComp(st.mstEdges), cnt = 0;
        for (var k = 0; k < N; k++) if (comp[k] === comp[id]) cnt++;
        return cnt > 1 ? P.teal : P.muted;
    }
    function msPNodeCol(st, id) {
        if (st.type === 'done') return P.green;
        if (st.addNode === id) return P.orange;
        return st.inTree[id] ? P.teal : P.muted;
    }
    function msDrawNotes(g, md, st) {
        var m = g.m, cx = g.x0 + g.w / 2, y0 = g.listTop + g.L.listH + 8;
        lines(msLegendOf(md), g.w, m.fs).forEach(function (t, j) {
            tx(t, cx, y0 + j * m.lineH + m.lineH / 2, m.fs, P.sub + 'ff', 'center', false);
        });
        var y1 = y0 + g.L.legL * m.lineH + 4;
        lines(msCapOf(md, st), g.w, m.fs).forEach(function (t, j) {
            tx(t, cx, y1 + j * m.lineH + m.lineH / 2, m.fs, P.text + 'dd', 'center', false);
        });
    }

    /* ===================== 크루스칼 장면 (간선 채택·기각, 유니온-파인드 그룹) ===================== */
    function msDrawKruskal(g, s, pv, fresh, e) {
        var m = g.m, sorted = msSorted();
        var curIdx = s.edge ? msIdxOf(sorted, s.edge) : -1;
        var q = ez(seg(e, 0.4, 0.8));
        var chips = msChipRows(g.x0, g.w, g.mob);

        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            var isCur = !!s.edge && msSameEdge(s.edge, ed);
            var adopted = msHasPair(s.mstEdges, ed[0], ed[1]);
            var lw = 1.4, col = P.sub + '44';
            if (adopted) {
                lw = isCur && fresh ? lerp(1.4, 3.6, q) : 3;
                col = P.green + 'ee';
            }
            ln(A.x, A.y, B.x, B.y, col, lw);
            if (isCur && s.type === 'skip') {
                var ka = fresh ? q : 1;
                var kk = (g.mob ? 4.5 : 5.5) * ka;
                var cy = my - (m.fs + 9);
                ctx.globalAlpha = ka;
                ln(A.x, A.y, B.x, B.y, P.red + 'cc', 2, [4, 3]);
                ln(mx - kk, cy - kk, mx + kk, cy + kk, P.red + 'ff', 2.2);
                ln(mx + kk, cy - kk, mx - kk, cy + kk, P.red + 'ff', 2.2);
                ctx.globalAlpha = 1;
            }
        });
        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            var isCur = !!s.edge && msSameEdge(s.edge, ed);
            var lcol = msHasPair(s.mstEdges, ed[0], ed[1]) ? P.green + 'ff' : P.text + 'bb';
            if (isCur && s.type === 'skip') lcol = P.red + 'ff';
            msPill(mx, my, String(ed[2]), lcol, m.fs);
        });

        if (fresh && curIdx >= 0) {
            var it = chips.items[curIdx];
            var sx = it.x + it.w / 2, sy = g.listTop + it.row * (m.chipH + m.chipRowGap) + m.chipH / 2;
            var se = s.edge, SA = g.pts[se[0]], SB = g.pts[se[1]];
            var tq = ez(seg(e, 0, 0.4));
            ctx.globalAlpha = ez(seg(e, 0, 0.08)) * (1 - ez(seg(e, 0.34, 0.44)));
            circ(lerp(sx, (SA.x + SB.x) / 2, tq), lerp(sy, (SA.y + SB.y) / 2, tq), 4.5, P.orange + 'ff', 'none');
            ctx.globalAlpha = 1;
        }

        NODES.forEach(function (nd) {
            var id = nd.id, p = g.pts[id];
            var cNew = msKNodeCol(s, id), cOld = fresh ? msKNodeCol(pv, id) : cNew;
            circ(p.x, p.y, m.R, cOld + '22', cOld + 'ee', 1.7);
            if (cNew !== cOld) {
                ctx.globalAlpha = ez(seg(e, 0, 0.4));
                circ(p.x, p.y, m.R, cNew + '33', cNew + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            if (fresh && s.edge && (s.edge[0] === id || s.edge[1] === id)) {
                var rq = seg(e, 0, 0.7);
                ctx.globalAlpha = 1 - rq;
                circ(p.x, p.y, m.R + 12 * ez(rq), 'none', P.orange + 'ff', 2.2);
                ctx.globalAlpha = 1;
            }
            tx(String(id), p.x, p.y, m.fsB, P.text + 'ff', 'center', true);
        });

        chips.items.forEach(function (c, i) {
            var y = g.listTop + c.row * (m.chipH + m.chipRowGap);
            var inM = msHasPair(s.mstEdges, c.ed[0], c.ed[1]);
            var decided = curIdx >= 0 && i <= curIdx;
            var col = inM ? P.green : (decided ? P.red : P.muted);
            var txc = decided ? P.text : P.sub;
            if (i === curIdx && fresh) {
                msChipBox(c.x, y, c.w, m.chipH, c.lbl, P.muted, m.fs, 1, P.sub);
                msChipBox(c.x, y, c.w, m.chipH, c.lbl, col, m.fs, q, txc);
            } else {
                msChipBox(c.x, y, c.w, m.chipH, c.lbl, decided ? col : P.muted, m.fs, 1, txc);
            }
            if (i === curIdx) rr(c.x - 2, y - 2, c.w + 4, m.chipH + 4, 6, 'none', P.orange + 'ff', 2);
        });

        tx('간선 (가중치 오름차순)', g.x0, g.bTop + m.lineH / 2, m.fs, P.sub + 'ff', 'left', true);
        msDrawNotes(g, 'kruskal', s);
    }

    /* ===================== 프림 장면 (트리가 번져 나가며 키 막대가 갱신) ===================== */
    function msDrawPrim(g, s, pv, fresh, e) {
        var m = g.m, front = msFrontier(s), nxt = msNextOf(s);
        var qAdd = ez(seg(e, 0.15, 0.7)), qKey = ez(seg(e, 0.25, 0.85));
        var maxW = msMaxW(), nxtEdge = null;
        front.forEach(function (f) {
            var A = g.pts[f.ed[0]], B = g.pts[f.ed[1]], isNx = f.to === nxt;
            if (isNx) nxtEdge = f.ed;
            ln(A.x, A.y, B.x, B.y, isNx ? P.orange + 'cc' : P.yellow + '77', isNx ? 2.2 : 1.3, [4, 3]);
        });

        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var isNew = fresh && !!s.addedEdge && msSameEdge(s.addedEdge, ed);
            var isTree = msHasPair(s.mstEdges, ed[0], ed[1]) && !isNew;
            var onFront = front.some(function (f) { return msSameEdge(f.ed, ed); });
            if (isTree) ln(A.x, A.y, B.x, B.y, P.green + 'ee', 3);
            else if (!onFront) ln(A.x, A.y, B.x, B.y, P.sub + '44', 1.4);
        });
        if (fresh && s.addedEdge) {
            var Va = g.pts[s.addedEdge[0]], Vb = g.pts[s.addedEdge[1]];
            ln(Va.x, Va.y, lerp(Va.x, Vb.x, qAdd), lerp(Va.y, Vb.y, qAdd), P.green + 'ff', 3.2);
        }

        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            var lcol = msHasPair(s.mstEdges, ed[0], ed[1]) ? P.green + 'ff' : P.text + 'bb';
            if (nxtEdge && msSameEdge(nxtEdge, ed)) lcol = P.orange + 'ff';
            msPill(mx, my, String(ed[2]), lcol, m.fs);
        });

        NODES.forEach(function (nd) {
            var id = nd.id, p = g.pts[id];
            var cNew = msPNodeCol(s, id), cOld = fresh ? msPNodeCol(pv, id) : cNew;
            circ(p.x, p.y, m.R, cOld + '22', cOld + 'ee', 1.7);
            if (cNew !== cOld) {
                ctx.globalAlpha = ez(seg(e, 0, 0.4));
                circ(p.x, p.y, m.R, cNew + '33', cNew + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            if (fresh && s.addNode === id) {
                var rq = seg(e, 0, 0.8);
                ctx.globalAlpha = 1 - rq;
                circ(p.x, p.y, m.R + 14 * ez(rq), 'none', P.teal + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            tx(String(id), p.x, p.y, m.fsB, P.text + 'ff', 'center', true);
        });

        var bx = g.x0 + m.labW, bw = g.w - m.labW - m.valW - 6;
        for (var i = 0; i < N; i++) {
            var rowY = g.listTop + i * m.rowH, my2 = rowY + m.rowH / 2;
            var vN = s.dist[i], vO = fresh ? pv.dist[i] : vN;
            var q = fresh ? qKey : 1;
            var isNx2 = i === nxt, inT = s.inTree[i];
            var base = inT ? P.teal : (isNx2 ? P.orange : (vN === Infinity ? P.muted : P.yellow));
            var lenN = vN === Infinity ? 0 : vN / maxW * bw;
            var lenO = vO === Infinity ? 0 : vO / maxW * bw;
            var by = my2 - m.barH / 2;
            rr(bx, by, bw, m.barH, 3, P.surf2 + 'ee', P.muted + '55', 1);
            var len = lerp(lenO, lenN, q);
            if (len > 0) rr(bx, by, len, m.barH, 3, base + 'cc', 'none');
            var txtV;
            if (vN === Infinity) txtV = '∞';
            else if (vO === Infinity) txtV = q < 0.5 ? '∞' : String(vN);
            else txtV = String(Math.round(lerp(vO, vN, q)));
            tx(txtV, g.x0 + g.w, my2, m.fs, (isNx2 ? P.orange : P.text) + 'ff', 'right', true);
            tx('노드 ' + i, g.x0, my2, m.fs, (inT ? P.teal : (isNx2 ? P.orange : P.sub)) + 'ff', 'left', isNx2 || inT);
        }

        tx('키 값 = 붙이는 최소 비용', g.x0, g.bTop + m.lineH / 2, m.fs, P.sub + 'ff', 'left', true);
        msDrawNotes(g, 'prim', s);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var pv = prev || s;
        var fresh = s !== pv;
        var e = fresh ? clamp01(t) : 1;
        var g = msGeom(x0, top, w, mob);
        if (mode === 'kruskal') msDrawKruskal(g, s, pv, fresh, e);
        else msDrawPrim(g, s, pv, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('mst-viz__speed-btn--active'); });
        btn.classList.add('mst-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('mst-viz__mode-btn--active', d.key === m); });
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