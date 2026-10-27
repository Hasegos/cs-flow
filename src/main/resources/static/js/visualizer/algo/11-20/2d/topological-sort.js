/**
 * 위상 정렬 시각화 시각화
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
    var root    = el('div', 'ts-viz');
    var toolbar = el('div', 'ts-viz__toolbar');
    var tbLeft  = el('div', 'ts-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ts-viz__title', 'TOPOLOGICAL SORT'));

    var modeWrap = el('div', 'ts-viz__mode');
    var modeDefs = [
        { key: 'kahn', label: 'Kahn 알고리즘' },
        { key: 'dfs', label: 'DFS 방식' },
        { key: 'cycle', label: '사이클 탐지' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ts-viz__mode-btn' + (i === 0 ? ' ts-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ts-viz__speed');
    speedWrap.appendChild(el('span', 'ts-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ts-viz__speed-btn' + (i === 0 ? ' ts-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ts-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ts-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ts-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ts-viz__controls');
    var btnPlay  = el('button', 'ts-viz__btn ts-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ts-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ts-viz__btn', '↺ RESET');
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
    var mode    = 'kahn';
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

    /* ===================== 엔진: 위상 정렬 ===================== */
    var N = 6;
    var NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
    var POS = [[0.12, 0], [0.12, 1], [0.5, 0], [0.5, 1], [0.88, 0], [0.88, 1]];
    var EDGES = [[0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5]];
    var CYC_EDGES = EDGES.concat([[4, 0]]);
    function nameList(list) {
        return list.map(function (v) { return NAMES[v]; }).join(', ');
    }
    function adjOf(edges) {
        var a = [];
        var i;
        for (i = 0; i < N; i++) a.push([]);
        edges.forEach(function (e) { a[e[0]].push(e[1]); });
        return a;
    }
    function indegOf(edges) {
        var d = [];
        var i;
        for (i = 0; i < N; i++) d.push(0);
        edges.forEach(function (e) { d[e[1]]++; });
        return d;
    }
    function edgeIdx(edges, u, v) {
        var i;
        for (i = 0; i < edges.length; i++) if (edges[i][0] === u && edges[i][1] === v) return i;
        return -1;
    }
    function tstep(kind, edges, deg, col, row1, row2, cur, hot, bad, cap, cap2, cap3, log) {
        return { kind: kind, edges: edges, deg: deg.slice(), col: col.slice(), row1: row1.slice(), row2: row2.slice(), cur: cur, hot: hot, bad: bad, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function degText(deg) {
        return deg.map(function (d, i) { return NAMES[i] + ' ' + d; }).join(', ');
    }

    /* ===================== 데이터: Kahn 알고리즘 ===================== */
    function buildKahn(edges, steps, intro) {
        var adj = adjOf(edges);
        var deg = indegOf(edges);
        var col = [0, 0, 0, 0, 0, 0];
        var q = [];
        var out = [];
        var i;
        for (i = 0; i < N; i++) if (deg[i] === 0) q.push(i);
        steps.push(tstep('kahn', edges, deg, col, q, out, -1, [], [], '진입 차수가 0인 정점 → 큐', '큐: ' + nameList(q), '', intro + ' 진입 차수는 ' + degText(deg) + '입니다. 진입 차수가 0인 ' + nameList(q) + '는 먼저 와야 할 정점이 없으므로 큐에 넣고 시작합니다.'));
        while (q.length) {
            var v = q.shift();
            var zero = [];
            var hot = [];
            out.push(v);
            col[v] = 2;
            adj[v].forEach(function (w) {
                deg[w]--;
                hot.push(edgeIdx(edges, v, w));
                if (deg[w] === 0) {
                    q.push(w);
                    zero.push(w);
                }
            });
            var msg = NAMES[v] + '를 큐 맨 앞에서 꺼내 결과에 넣습니다. ';
            if (adj[v].length) {
                msg += NAMES[v] + '에서 나가는 간선을 지워 ' + nameList(adj[v]) + '의 진입 차수를 1씩 줄입니다. ';
                msg += zero.length ? '진입 차수가 0이 된 ' + nameList(zero) + '를 큐 뒤에 넣습니다.' : '0이 된 정점은 아직 없습니다.';
            } else {
                msg += '나가는 간선이 없어 줄일 진입 차수도 없습니다.';
            }
            steps.push(tstep('kahn', edges, deg, col, q, out, v, hot, [], NAMES[v] + ' 꺼냄 → 결과 ' + out.length + '개', zero.length ? '진입 차수 0: ' + nameList(zero) + ' → 큐' : '새로 0이 된 정점 없음', '', msg));
        }
        return { deg: deg, col: col, out: out };
    }
    var KAHN_STEPS = [];
    (function () {
        var r = buildKahn(EDGES, KAHN_STEPS, '위상 정렬은 방향 그래프의 정점을 모든 간선이 앞에서 뒤로 향하도록 한 줄로 세우는 것입니다. Kahn 알고리즘은 진입 차수(들어오는 간선 수)가 0인 정점을 꺼내 결과에 넣고, 그 정점의 나가는 간선을 지우는 일을 반복합니다.');
        KAHN_STEPS.push(tstep('kahn', EDGES, r.deg, r.col, [], r.out, -1, [], [], '결과 ' + r.out.length + '개 = 전체 ' + N + '개', '사이클 없음 · 위상 순서 완성', '', '정리 — 큐가 비었고 결과에 정점 ' + N + '개가 모두 들어갔습니다. 결과 ' + nameList(r.out) + ' 순서에서 모든 간선이 앞쪽 정점에서 뒤쪽 정점으로 향합니다. 정점과 간선을 한 번씩 처리하므로 O(V + E)입니다. 큐에서 꺼내는 순서가 달라지면 다른 올바른 순서도 나올 수 있습니다.'));
    })();

    /* ===================== 데이터: DFS 방식 ===================== */
    var DFS_STEPS = [];
    (function () {
        var adj = adjOf(EDGES);
        var col = [0, 0, 0, 0, 0, 0];
        var fin = [];
        var none = [0, 0, 0, 0, 0, 0];
        DFS_STEPS.push(tstep('dfs', EDGES, none, col, fin, [], -1, [], [], '깊이 우선 탐색 시작', '정점이 끝나는 순서를 기록', '', 'DFS 방식은 깊이 우선 탐색을 하면서 정점의 탐색이 끝나는 순서를 기록합니다. 정점을 A, B, C 순서로 확인하다가 아직 방문하지 않은 정점에서 탐색을 시작합니다. 노란색은 탐색 중, 초록색은 탐색이 끝난 정점입니다.'));
        function visit(v, p) {
            var skipped = [];
            col[v] = 1;
            DFS_STEPS.push(tstep('dfs', EDGES, none, col, fin, [], v, p >= 0 ? [edgeIdx(EDGES, p, v)] : [], [], NAMES[v] + ' 진입 → 노란색', '탐색 중인 정점 ' + col.filter(function (c) { return c === 1; }).length + '개', '', NAMES[v] + (p >= 0 ? '에 ' + NAMES[p] + '에서 간선을 따라 도착했습니다. ' : '는 아직 방문하지 않아 여기서 새 탐색을 시작합니다. ') + NAMES[v] + '를 노란색(탐색 중)으로 표시하고 나가는 간선을 따라 더 깊이 들어갑니다.'));
            adj[v].forEach(function (w) {
                if (col[w] === 0) visit(w, v);
                else skipped.push(w);
            });
            col[v] = 2;
            fin.push(v);
            DFS_STEPS.push(tstep('dfs', EDGES, none, col, fin, fin.slice().reverse(), v, [], [], NAMES[v] + ' 종료 → 목록에 추가', '종료 순서: ' + nameList(fin), '', NAMES[v] + '에서 ' + (adj[v].length ? '나가는 간선을 모두 확인했습니다. ' : '나가는 간선이 없어 바로 끝납니다. ') + (skipped.length ? '이미 끝난 ' + nameList(skipped) + '는 다시 방문하지 않습니다. ' : '') + NAMES[v] + '를 초록색(종료)으로 바꾸고 종료 목록 맨 뒤에 넣습니다.'));
        }
        var i;
        for (i = 0; i < N; i++) if (col[i] === 0) visit(i, -1);
        DFS_STEPS.push(tstep('dfs', EDGES, none, col, fin, fin.slice().reverse(), -1, [], [], '종료 순서를 뒤집으면 위상 순서', nameList(fin) + ' → ' + nameList(fin.slice().reverse()), '', '정리 — 정점이 끝난 순서 ' + nameList(fin) + '를 뒤집으면 ' + nameList(fin.slice().reverse()) + '입니다. DAG에서는 간선 u → v에서 v가 항상 u보다 먼저 끝나므로 뒤집으면 u가 v보다 앞에 옵니다. 탐색 중인 정점으로 되돌아오는 간선을 만나면 사이클이 있다는 뜻이고, 시간은 O(V + E)입니다.'));
    })();

    /* ===================== 데이터: 사이클 탐지 ===================== */
    var CYCLE_STEPS = [];
    (function () {
        var r = buildKahn(CYC_EDGES, CYCLE_STEPS, '같은 그래프에 E에서 A로 가는 간선을 하나 더 넣어 A → C → E → A 사이클을 만들었습니다.');
        var rest = [];
        var i;
        for (i = 0; i < N; i++) if (r.col[i] !== 2) rest.push(i);
        CYCLE_STEPS.push(tstep('kahn', CYC_EDGES, r.deg, r.col, [], r.out, -1, [], rest, '결과 ' + r.out.length + '개 < 전체 ' + N + '개 → 사이클', '남은 ' + nameList(rest) + ': 진입 차수가 0이 되지 않음', '', '정리 — 큐가 비었는데 결과에는 정점 ' + r.out.length + '개만 들어갔습니다. 남은 ' + nameList(rest) + '는 서로를 기다리는 사이클에 있어 진입 차수가 끝내 0이 되지 않았습니다. 처리한 정점 수가 전체보다 적으면 사이클이 있다는 뜻이고, 이때는 위상 정렬이 불가능합니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'dfs') return DFS_STEPS;
        if (mode === 'cycle') return CYCLE_STEPS;
        return KAHN_STEPS;
    }
    function defaultLog() {
        if (mode === 'dfs') return '깊이 우선 탐색이 끝나는 순서를 뒤집어 위상 순서를 얻는 방식을 봅니다.';
        if (mode === 'cycle') return '사이클이 있는 그래프에서 Kahn 알고리즘이 어디서 멈추는지 봅니다.';
        return '진입 차수가 0인 정점을 큐에서 꺼내며 순서를 만드는 Kahn 알고리즘을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var tsCapMemo = {};
    var TS_QUEUE  = { sA: 0.08, sB: 0.6, eA: 0.35, eB: 0.9, node: true };
    var TS_RESULT = { sA: 0, sB: 0, eA: 0.6, eB: 0.7, node: false };
    var TS_FIN    = { sA: 0, sB: 0, eA: 0.3, eB: 0.8, node: true };
    var TS_REV    = { sA: 0, sB: 0.7, eA: 0.7, eB: 1, node: false };
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function tsCapH(s, w, fs) {
        var h = 4;
        if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
        if (s.cap2) h += lines(s.cap2, w - 8, fs).length * (fs + 4);
        if (s.cap3) h += lines(s.cap3, w - 8, fs).length * (fs + 4);
        return h;
    }
    function tsCapMax(w, mob) {
        var fs = mob ? 11 : 12;
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (tsCapMemo[key] === undefined) {
            var best = 0;
            [KAHN_STEPS, DFS_STEPS, CYCLE_STEPS].forEach(function (arr) {
                arr.forEach(function (s) {
                    var h = tsCapH(s, w, fs);
                    if (h > best) best = h;
                });
            });
            tsCapMemo[key] = best;
        }
        return tsCapMemo[key];
    }
    function layout(w, mob) {
        var r = mob ? 14 : 18;
        var ch = mob ? 22 : 26;
        var labW = mob ? 26 : 38;
        var yTop = mob ? 34 : 40;
        var yBot = yTop + (mob ? 74 : 84);
        var rowQ = yBot + r + 26;
        var rowR = rowQ + ch + 10;
        var capTop = rowR + ch + 14;
        return {
            fs: mob ? 11 : 12, r: r, ch: ch, labW: labW, cw: Math.min((w - labW) / N, mob ? 99 : 52),
            yTop: yTop, yBot: yBot, rowQ: rowQ, rowR: rowR, capTop: capTop,
            total: capTop + tsCapMax(w, mob) + 4
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function tsGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        L.x0 = x0; L.top = top; L.w = w;
        L.cx0 = x0 + L.labW + (w - L.labW - L.cw * N) / 2;
        L.gx = x0 + L.r + 8;
        L.gw = w - 2 * (L.r + 8);
        L.yTop += top; L.yBot += top; L.rowQ += top; L.rowR += top; L.capTop += top;
        return L;
    }

    /* ===================== 기하 ===================== */
    function tsNX(g, v) { return g.gx + POS[v][0] * g.gw; }
    function tsNY(g, v) { return POS[v][1] ? g.yBot : g.yTop; }
    function tsCX(g, i) { return g.cx0 + i * g.cw + g.cw / 2; }
    function tsEdge(g, edges, k) {
        var a = edges[k][0], b = edges[k][1];
        var ax = tsNX(g, a), ay = tsNY(g, a), bx = tsNX(g, b), by = tsNY(g, b);
        if (k < EDGES.length) {
            var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1;
            return { sx: ax + dx / L * g.r, sy: ay + dy / L * g.r, ex: bx - dx / L * (g.r + 3), ey: by - dy / L * (g.r + 3), curved: false };
        }
        return { sx: ax, sy: ay - g.r, ex: bx, ey: by - g.r - 3, qx: (ax + bx) / 2, qy: g.yTop - 2 * g.r - 28, curved: true };
    }
    function tsEdgeAt(ge, q) {
        if (!ge.curved) return { x: lerp(ge.sx, ge.ex, q), y: lerp(ge.sy, ge.ey, q) };
        var u = 1 - q;
        return {
            x: u * u * ge.sx + 2 * u * q * ge.qx + q * q * ge.ex,
            y: u * u * ge.sy + 2 * u * q * ge.qy + q * q * ge.ey
        };
    }
    function tsPath(ge, col, lw) {
        ctx.beginPath();
        ctx.moveTo(ge.sx, ge.sy);
        if (ge.curved) ctx.quadraticCurveTo(ge.qx, ge.qy, ge.ex, ge.ey);
        else ctx.lineTo(ge.ex, ge.ey);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
        var a = ge.curved ? Math.atan2(ge.ey - ge.qy, ge.ex - ge.qx) : Math.atan2(ge.ey - ge.sy, ge.ex - ge.sx);
        ctx.beginPath();
        ctx.moveTo(ge.ex, ge.ey);
        ctx.lineTo(ge.ex - 8 * Math.cos(a - 0.4), ge.ey - 8 * Math.sin(a - 0.4));
        ctx.lineTo(ge.ex - 8 * Math.cos(a + 0.4), ge.ey - 8 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 간선 ===================== */
    function tsEdges(g, s, fresh, e) {
        var badE = [];
        s.edges.forEach(function (ed, k) {
            var ge = tsEdge(g, s.edges, k);
            var isHot = s.hot.indexOf(k) >= 0;
            var isBad = s.bad.indexOf(ed[0]) >= 0 && s.bad.indexOf(ed[1]) >= 0;
            var col = isHot ? P.yellow + 'ff' : isBad ? P.red + 'ff' : s.col[ed[0]] === 2 ? P.sub + '55' : P.sub + 'cc';
            tsPath(ge, col, isHot || isBad ? 3 : 1.8);
            if (isBad) badE.push(ge);
            if (isHot && fresh && e < 0.55) {
                var dp = tsEdgeAt(ge, e / 0.55);
                circ(dp.x, dp.y, 5, P.yellow + 'ff');
            }
        });
        if (fresh && badE.length && e < 1) {
            var pos = e * badE.length;
            var j = Math.min(Math.floor(pos), badE.length - 1);
            var pt = tsEdgeAt(badE[j], pos - j);
            circ(pt.x, pt.y, 5, P.red + 'ff');
        }
    }

    /* ===================== 정점 ===================== */
    function tsNodes(g, s, p, fresh, e) {
        var dfs = mode === 'dfs';
        var early = fresh && e < 0.35;
        var cs = early ? p.col : s.col;
        var qs = early ? p.row1 : s.row1;
        var toIdx = [];
        if (fresh && !dfs) s.hot.forEach(function (k) { toIdx.push(s.edges[k][1]); });
        var i;
        for (i = 0; i < N; i++) {
            var x = tsNX(g, i), y = tsNY(g, i), r = g.r;
            var inQ = !dfs && qs.indexOf(i) >= 0;
            var isBad = s.bad.indexOf(i) >= 0;
            var c = isBad ? P.red : cs[i] === 2 ? P.green : (cs[i] === 1 || inQ) ? (dfs ? P.yellow : P.teal) : P.sub;
            var isCur = i === s.cur;
            circ(x, y, r, (cs[i] !== 0 || inQ || isBad) ? c + '44' : P.surf2);
            if (fresh && isCur && e < 1) {
                ctx.globalAlpha = 1 - e;
                circ(x, y, r + 4 + 12 * ez(e), 'none', P.yellow + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            circ(x, y, r, 'none', (isCur ? P.yellow : c) + 'ff', isCur ? 3.2 : 2);
            tx(NAMES[i], x, y - 1, g.fs + 1, P.text + 'ff', 'center', true);
            var lab = '';
            if (dfs) lab = cs[i] === 1 ? '탐색 중' : cs[i] === 2 ? '종료 ' + (qs.indexOf(i) + 1) : '';
            else if (cs[i] === 2) lab = '완료';
            else {
                var dv = s.deg[i];
                if (fresh && e < 0.55 && toIdx.indexOf(i) >= 0) dv = p.deg[i];
                lab = '진입 ' + dv;
            }
            if (lab) tx(lab, x, y + r + 10, g.fs, c + 'ff', 'center', true);
            if (fresh && !dfs && e >= 0.55 && toIdx.indexOf(i) >= 0) {
                var f = seg(e, 0.55, 0.95);
                ctx.globalAlpha = 1 - f;
                tx('-1', x + r + 14, y + r + 10 - 8 * f, g.fs, P.yellow + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 행 (큐 · 결과 / 종료 · 역순) ===================== */
    function tsSlots(g, y) {
        var i;
        for (i = 0; i < N; i++) rr(g.cx0 + i * g.cw + 2, y, g.cw - 4, g.ch, 4, 'none', P.sub + '55', 1);
    }
    function tsCell(g, cx, cy, name, col, alpha) {
        ctx.globalAlpha = alpha;
        rr(cx - (g.cw - 4) / 2, cy - g.ch / 2, g.cw - 4, g.ch, 4, col + '33', col + 'ff', 1.6);
        tx(name, cx, cy, g.fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function tsLeaving(g, s, p, e) {
        var qy = g.rowQ + g.ch / 2, ry = g.rowR + g.ch / 2;
        p.row1.forEach(function (v, pi) {
            var ri = s.row2.indexOf(v);
            if (s.row1.indexOf(v) >= 0 || ri < 0 || e >= 0.6) return;
            var m = ez(seg(e, 0.08, 0.6));
            tsCell(g, lerp(tsCX(g, pi), tsCX(g, ri), m), lerp(qy, ry, m), NAMES[v], P.green, 1);
        });
    }
    function tsRow(g, y, list, pl, fresh, e, spec, col) {
        var cy = y + g.ch / 2;
        list.forEach(function (v, i) {
            var cx = tsCX(g, i);
            var pi = pl.indexOf(v);
            if (!fresh || pi === i) { tsCell(g, cx, cy, NAMES[v], col, 1); return; }
            if (pi >= 0) { tsCell(g, lerp(tsCX(g, pi), cx, ez(seg(e, spec.sA, spec.sB))), cy, NAMES[v], col, 1); return; }
            if (!spec.node) { tsCell(g, cx, cy, NAMES[v], col, ez(seg(e, spec.eA, spec.eB))); return; }
            if (e < spec.eA) return;
            var m = ez(seg(e, spec.eA, spec.eB));
            tsCell(g, lerp(tsNX(g, v), cx, m), lerp(tsNY(g, v), cy, m), NAMES[v], col, 1);
        });
    }

    /* ===================== 설명 ===================== */
    function tsCapBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) {
            tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold);
        });
        return y + rows.length * lh;
    }
    function tsCaps(g, s, e) {
        var cx = g.x0 + g.w / 2;
        ctx.globalAlpha = 0.35 + 0.65 * ez(e);
        var y = tsCapBlock(s.cap, cx, g.capTop + 4, g.w, g.fs, g.fs + 5, P.yellow + 'ff', true);
        y = tsCapBlock(s.cap2, cx, y, g.w, g.fs, g.fs + 4, P.text + 'ee', false);
        tsCapBlock(s.cap3, cx, y, g.w, g.fs, g.fs + 4, P.green + 'ff', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var dfs = mode === 'dfs';
        var g = tsGeom(x0, top, w, mob);
        var names = dfs ? ['종료', '역순'] : ['큐', '결과'];
        tsSlots(g, g.rowQ);
        tsSlots(g, g.rowR);
        tx(names[0], x0, g.rowQ + g.ch / 2, g.fs, P.sub + 'ff', 'left', true);
        tx(names[1], x0, g.rowR + g.ch / 2, g.fs, P.sub + 'ff', 'left', true);
        tsEdges(g, s, fresh, e);
        tsNodes(g, s, p, fresh, e);
        if (!dfs) tsLeaving(g, s, p, e);
        tsRow(g, g.rowQ, s.row1, p.row1, fresh, e, dfs ? TS_FIN : TS_QUEUE, P.teal);
        tsRow(g, g.rowR, s.row2, p.row2, fresh, e, dfs ? TS_REV : TS_RESULT, P.green);
        tsCaps(g, s, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('ts-viz__speed-btn--active'); });
        btn.classList.add('ts-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ts-viz__mode-btn--active', d.key === m); });
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