/**
 * 다익스트라(Dijkstra) 시각화 시각화
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
    var root    = el('div', 'dijkstra-viz');
    var toolbar = el('div', 'dijkstra-viz__toolbar');
    var tbLeft  = el('div', 'dijkstra-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dijkstra-viz__title', 'DIJKSTRA'));

    var modeWrap = el('div', 'dijkstra-viz__mode');
    var modeDefs = [
        { key: 'progress', label: '진행 과정' },
        { key: 'tree', label: '최단 경로 트리' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dijkstra-viz__mode-btn' + (i === 0 ? ' dijkstra-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dijkstra-viz__speed');
    speedWrap.appendChild(el('span', 'dijkstra-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dijkstra-viz__speed-btn' + (i === 0 ? ' dijkstra-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dijkstra-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dijkstra-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dijkstra-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dijkstra-viz__controls');
    var btnPlay  = el('button', 'dijkstra-viz__btn dijkstra-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dijkstra-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dijkstra-viz__btn', '↺ RESET');
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
    var mode    = 'progress';
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

    /* ===================== 그래프 데이터 (고정 가중치 그래프) ===================== */
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

    /* ===================== 다익스트라 진행 스텝 (실제 알고리즘 실행) ===================== */
    function buildProgressSteps() {
        var dist = new Array(N).fill(Infinity);
        var visited = new Array(N).fill(false);
        var prev = new Array(N).fill(null);
        dist[SRC] = 0;
        var steps = [];
        var finalizedCount = 0;
        var confirmedEdges = [];

        steps.push({ type: 'intro', dist: dist.slice(), visited: visited.slice(), finalize: null, updates: [], confirmedEdges: [],
            log: 'PLAY를 눌러 다익스트라가 노드 ' + SRC + '부터 각 노드까지의 최단 거리를 어떻게 갱신하며 확정하는지 확인하세요.' });

        while (finalizedCount < N) {
            var u = -1, best = Infinity;
            for (var i = 0; i < N; i++) {
                if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
            }
            if (u === -1) break;
            visited[u] = true;
            finalizedCount++;
            if (u !== SRC) confirmedEdges.push([prev[u], u]);

            var updates = [];
            ADJ[u].forEach(function (edge) {
                var v = edge[0], w = edge[1];
                if (!visited[v] && dist[u] + w < dist[v]) {
                    var oldD = dist[v];
                    dist[v] = dist[u] + w;
                    prev[v] = u;
                    updates.push({ node: v, from: oldD, to: dist[v] });
                }
            });

            var unvisitedList = [];
            for (var k = 0; k < N; k++) if (!visited[k]) unvisitedList.push({ node: k, dist: dist[k] });
            unvisitedList.sort(function (a, b) { return a.dist - b.dist; });

            var log;
            if (updates.length > 0) {
                var parts = updates.map(function (up) {
                    return '노드 ' + up.node + '는 ' + (up.from === Infinity ? '∞' : up.from) + ' → ' + up.to;
                });
                log = '노드 ' + u + '을 거리 ' + dist[u] + '로 확정 → ' + parts.join(', ') + '으로 갱신됩니다. (주황색 간선이 지금 막 비교된 연결입니다)';
            } else {
                log = '노드 ' + u + '을 거리 ' + dist[u] + '로 확정 → 더 짧아지는 인접 노드가 없어 갱신은 없습니다.';
            }
            steps.push({ type: finalizedCount === N ? 'done' : 'finalize', finalize: u, dist: dist.slice(),
                visited: visited.slice(), updates: updates, unvisitedList: unvisitedList, confirmedEdges: confirmedEdges.slice(), log: log });
        }
        steps[steps.length - 1].log += ' 모든 노드가 확정되었습니다. "최단 경로 트리" 탭에서 각 노드까지의 최종 경로를 확인하세요.';
        return { steps: steps, dist: dist, prev: prev };
    }

    var PROGRESS = buildProgressSteps();
    var PROGRESS_STEPS = PROGRESS.steps;
    var FINAL_DIST = PROGRESS.dist;
    var PREV = PROGRESS.prev;

    var FINALIZE_ORDER = [];
    PROGRESS_STEPS.forEach(function (s) { if (s.finalize != null) FINALIZE_ORDER.push(s.finalize); });

    function reconstructPath(target) {
        var path = [];
        var cur = target;
        while (cur != null) { path.unshift(cur); cur = PREV[cur]; }
        return path;
    }

    /* ===================== 최단 경로 트리 스텝 (소스 자기 자신은 자명하므로 건너뜀) ===================== */
    function buildTreeSteps() {
        var steps = [];
        steps.push({ type: 'intro', node: null, revealed: [SRC], confirmedEdges: [],
            log: 'PLAY를 눌러 노드 ' + SRC + '에서 각 노드까지의 최단 경로가 확정된 순서대로 나타나는 것을 확인하세요.' });

        var targets = FINALIZE_ORDER.filter(function (n) { return n !== SRC; });
        var revealed = [SRC];
        var confirmedEdges = [];
        targets.forEach(function (node, idx) {
            revealed = revealed.concat([node]);
            confirmedEdges.push([PREV[node], node]);
            var path = reconstructPath(node);
            steps.push({ type: idx === targets.length - 1 ? 'done' : 'reveal', node: node, revealed: revealed.slice(),
                confirmedEdges: confirmedEdges.slice(), path: path,
                log: '노드 ' + SRC + '에서 노드 ' + node + '까지 최단 경로: ' + path.join(' → ') + ' (총 거리 ' + FINAL_DIST[node] + ')' });
        });
        steps[steps.length - 1].log += ' — 이렇게 모인 최단 경로들을 합치면 "최단 경로 트리"가 됩니다.';
        return steps;
    }

    var TREE_STEPS = buildTreeSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'tree' ? TREE_STEPS : PROGRESS_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function dkNum(v) { return v === Infinity ? '∞' : String(v); }

    /* ===================== 레이아웃 ===================== */
    function dkMetrics(mob) {
        return {
            R: mob ? 15 : 19,
            M: mob ? 40 : 46,
            gh: mob ? 190 : 230,
            fs: mob ? 11 : 12.5,
            fsB: mob ? 12 : 14,
            pillH: mob ? 16 : 19,
            pillW: mob ? 26 : 30,
            cols: mob ? 3 : N,
            chipH: mob ? 36 : 40,
            rowGap: mob ? 8 : 10,
            sr: mob ? 12 : 14,
            arrowGap: mob ? 16 : 26
        };
    }
    function layout(w, mob) {
        var m = dkMetrics(mob);
        var rows = Math.ceil(N / m.cols);
        var titleH = m.fs + 8;
        var progH = m.gh + 10 + 2 * titleH + rows * m.chipH + (rows - 1) * m.rowGap + 6;
        var treeH = m.gh + 10 + titleH + 2 * m.sr + m.fs + 16;
        return { m: m, titleH: titleH, rows: rows, total: Math.max(progH, treeH) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그래프 기하 ===================== */
    function dkGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        var m = L.m;
        var padX = mob ? 22 : 30;
        var pts = NODES.map(function (nd) {
            return { x: x0 + padX + nd.x * (w - 2 * padX), y: top + m.M + nd.y * (m.gh - 2 * m.M) };
        });
        return { L: L, m: m, x0: x0, top: top, w: w, mob: mob, pts: pts };
    }
    function dkPillCenter(g, id) {
        var p = g.pts[id];
        var up = NODES[id].y <= 0.5;
        var off = g.m.R + 3 + g.m.pillH / 2;
        return { x: p.x, y: up ? p.y - off : p.y + off };
    }
    function dkSlot(g, chipTop, i) {
        var m = g.m;
        var cellW = g.w / m.cols;
        var col = i % m.cols;
        var row = Math.floor(i / m.cols);
        return { x: g.x0 + col * cellW + 4, y: chipTop + row * (m.chipH + m.rowGap), w: cellW - 8 };
    }

    /* ===================== 단계 판독 ===================== */
    function dkIn(list, v) { return (list || []).indexOf(v) >= 0; }
    function dkHasPair(list, a, b) {
        return (list || []).some(function (pr) {
            return (pr[0] === a && pr[1] === b) || (pr[0] === b && pr[1] === a);
        });
    }
    function dkAllGreen(st) { return mode === 'progress' && st.type === 'done'; }
    function dkStateOf(st, id) {
        if (mode === 'tree') {
            if (st.node === id) return 'current';
            return dkIn(st.revealed, id) ? 'visited' : 'unvisited';
        }
        if (st.finalize === id) return 'current';
        return st.visited[id] ? 'visited' : 'unvisited';
    }
    function dkDistOf(st, id) {
        if (mode === 'tree') return dkIn(st.revealed, id) ? FINAL_DIST[id] : null;
        return st.dist[id];
    }
    function dkUpdOf(st, id) {
        var hit = null;
        (st.updates || []).forEach(function (up) { if (up.node === id) hit = up; });
        return hit;
    }
    function dkCandList(st) {
        if (st.unvisitedList) return st.unvisitedList;
        var list = [];
        for (var k = 0; k < N; k++) if (!st.visited[k]) list.push({ node: k, dist: st.dist[k] });
        return list.sort(function (a, b) { return a.dist === b.dist ? 0 : (a.dist < b.dist ? -1 : 1); });
    }
    function dkIndexOf(list, id) {
        for (var k = 0; k < list.length; k++) if (list[k].node === id) return k;
        return -1;
    }
    function dkColor(state, allG) {
        if (allG) return P.green;
        if (state === 'current') return P.orange;
        if (state === 'visited') return P.teal;
        return P.sub;
    }
    function dkValView(st, fresh, e, id) {
        var up = fresh ? dkUpdOf(st, id) : null;
        if (!up) return { up: false, txt: dkNum(dkDistOf(st, id)) };
        var q = ez(seg(e, 0.5, 0.95));
        var from = up.from === Infinity ? up.to : up.from;
        return {
            up: true, inf: up.from === Infinity, q: q, to: up.to,
            fl: Math.sin(Math.PI * seg(e, 0.45, 1)),
            txt: dkNum(Math.round(lerp(from, up.to, q)))
        };
    }
    function dkPutVal(x, y, v, col, sz) {
        if (v.inf) {
            ctx.globalAlpha = 1 - v.q;
            tx('∞', x, y - 6 * v.q, sz, col, 'center', true);
            ctx.globalAlpha = v.q;
            tx(dkNum(v.to), x, y + 6 * (1 - v.q), sz, col, 'center', true);
            ctx.globalAlpha = 1;
            return;
        }
        tx(v.txt, x, y, sz, col, 'center', true);
    }
    function dkDot(x, y, col) {
        circ(x, y, 9, col + '44', 'none');
        circ(x, y, 5, col + 'ff', 'none');
    }

    /* ===================== 간선 ===================== */
    function dkEdges(g, st, pv, fresh, e) {
        var m = g.m;
        var fin = mode === 'progress' ? st.finalize : null;
        var newPair = (fresh && st.confirmedEdges.length > pv.confirmedEdges.length) ? st.confirmedEdges[st.confirmedEdges.length - 1] : null;
        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var inOld = dkHasPair(st.confirmedEdges, ed[0], ed[1]) && !(newPair && dkHasPair([newPair], ed[0], ed[1]));
            if (inOld) ln(A.x, A.y, B.x, B.y, P.purple + 'ee', 3);
            else ln(A.x, A.y, B.x, B.y, P.sub + '44', 1.4);
        });
        if (newPair !== null) {
            var PA = g.pts[newPair[0]], PB = g.pts[newPair[1]];
            if (mode === 'tree') {
                var wq = ez(seg(e, 0, 0.6));
                ln(PA.x, PA.y, PB.x, PB.y, P.purple + 'ff', lerp(1.4, 4.2, wq));
            } else {
                var gq = ez(seg(e, 0.55, 1));
                ln(PA.x, PA.y, lerp(PA.x, PB.x, gq), lerp(PA.y, PB.y, gq), P.purple + 'ff', 3.2);
            }
        }
        if (fin !== null) {
            var fA = g.pts[fin];
            EDGES.forEach(function (ed) {
                var v = ed[0] === fin ? ed[1] : (ed[1] === fin ? ed[0] : -1);
                if (v < 0 || st.visited[v]) return;
                var B = g.pts[v];
                ctx.globalAlpha = fresh ? ez(seg(e, 0.08, 0.35)) : 1;
                if (dkUpdOf(st, v)) ln(fA.x, fA.y, B.x, B.y, P.orange + 'ee', 3.2);
                else ln(fA.x, fA.y, B.x, B.y, P.yellow + 'aa', 2, [5, 4]);
                ctx.globalAlpha = 1;
            });
            if (fresh && e > 0.12 && e < 0.5) {
                var dq = ez(seg(e, 0.12, 0.5));
                st.updates.forEach(function (up) {
                    var B = g.pts[up.node];
                    dkDot(lerp(fA.x, B.x, dq), lerp(fA.y, B.y, dq), P.orange);
                });
            }
        }
        EDGES.forEach(function (ed) {
            var A = g.pts[ed[0]], B = g.pts[ed[1]];
            var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            var other = ed[0] === fin ? ed[1] : (ed[1] === fin ? ed[0] : -1);
            var hot = other >= 0 && dkUpdOf(st, other) !== null;
            var bw = g.mob ? 20 : 24, bh = m.fs + 6;
            rr(mx - bw / 2, my - bh / 2, bw, bh, 4, P.surf2 + 'ee', 'none');
            var lc = hot ? P.orange : (dkHasPair(st.confirmedEdges, ed[0], ed[1]) ? P.purple : P.text);
            tx(String(ed[2]), mx, my, m.fs, lc + 'ff', 'center', true);
        });
    }

    /* ===================== 정점과 거리 값 ===================== */
    function dkNodes(g, st, pv, fresh, e) {
        var m = g.m;
        var allG = dkAllGreen(st);
        var allP = dkAllGreen(pv);
        NODES.forEach(function (nd) {
            var id = nd.id;
            var p = g.pts[id];
            var cur = dkStateOf(st, id);
            var old = fresh ? dkStateOf(pv, id) : cur;
            var cNew = dkColor(cur, allG);
            var cOld = fresh ? dkColor(old, allP) : cNew;
            circ(p.x, p.y, m.R, cOld + '22', cOld + 'ee', 1.7);
            if (cNew !== cOld) {
                ctx.globalAlpha = ez(seg(e, 0, 0.35));
                circ(p.x, p.y, m.R, cNew + '33', cNew + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            if (fresh && cur === 'current') {
                var rq = seg(e, 0, 0.7);
                ctx.globalAlpha = 1 - rq;
                circ(p.x, p.y, m.R + 14 * ez(rq), 'none', P.orange + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            tx(String(id), p.x, p.y, m.fsB, P.text + 'ff', 'center', true);
            if (dkDistOf(st, id) === null) return;
            var pa = (mode === 'tree' && fresh && dkDistOf(pv, id) === null) ? ez(seg(e, 0.2, 0.6)) : 1;
            var pc = dkPillCenter(g, id);
            var pCol = cur === 'current' ? P.orange : ((cur === 'visited' || allG) ? P.green : P.sub);
            var v = dkValView(st, fresh, e, id);
            ctx.globalAlpha = pa;
            if (v.up && v.fl > 0.01) {
                ctx.globalAlpha = pa * v.fl;
                circ(p.x, p.y, m.R + 4 + 5 * v.fl, 'none', P.yellow + 'ff', 2.2);
                ctx.globalAlpha = pa;
            }
            rr(pc.x - m.pillW / 2, pc.y - m.pillH / 2, m.pillW, m.pillH, m.pillH / 2, P.surf2 + 'ee', pCol + 'ee', 1.3);
            dkPutVal(pc.x, pc.y, v, (v.up ? P.yellow : pCol) + 'ff', m.fs);
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== 미확정 노드 칩 ===================== */
    function dkCandidates(g, st, pv, fresh, e) {
        var m = g.m;
        var L = g.L;
        var titleY = g.top + m.gh + 10;
        var chipTop = titleY + 2 * L.titleH;
        var sl = dkCandList(st);
        var pl = dkCandList(pv);
        var mv = fresh ? ez(seg(e, 0.45, 0.95)) : 1;
        var fade = fresh ? ez(seg(e, 0.1, 0.4)) : 1;
        var seen = {};
        var order = [];
        pl.concat(sl).forEach(function (c) {
            if (!seen[c.node]) { seen[c.node] = true; order.push(c.node); }
        });
        tx('미확정 노드 (거리 오름차순)', g.x0, titleY + L.titleH / 2, m.fs, P.sub + 'ff', 'left', true);
        if (sl.length === 0) tx('(모두 확정됨)', g.x0 + g.w / 2, chipTop + m.chipH / 2, m.fs, P.sub + 'ff', 'center', false);
        if (sl.length > 0) {
            var s0 = dkSlot(g, chipTop, 0);
            ctx.globalAlpha = fresh ? ez(seg(e, 0.5, 1)) : 1;
            tx('다음 확정 ↓', s0.x + s0.w / 2, chipTop - L.titleH / 2, m.fs - 1, P.orange + 'ee', 'center', true);
            ctx.globalAlpha = 1;
        }
        order.forEach(function (id) {
            var pi = dkIndexOf(pl, id), si = dkIndexOf(sl, id);
            var a0 = dkSlot(g, chipTop, pi >= 0 ? pi : si);
            var a1 = si >= 0 ? dkSlot(g, chipTop, si) : a0;
            var x = a0.x, y = a0.y, alpha = 1, removed = si < 0;
            if (removed) alpha = 1 - fade;
            else if (pi < 0) alpha = fresh ? ez(seg(e, 0.5, 1)) : 1;
            else { x = lerp(a0.x, a1.x, mv); y = lerp(a0.y, a1.y, mv); }
            if (alpha <= 0.01) return;
            var isNext = si === 0;
            var hot = removed || isNext;
            var cw = a0.w;
            var v = dkValView(st, fresh, e, id);
            ctx.globalAlpha = alpha;
            rr(x, y, cw, m.chipH, 5, hot ? P.orange + '30' : P.muted + '10', hot ? P.orange + 'ee' : P.muted + '55', hot ? 2 : 1);
            tx('노드 ' + id, x + cw / 2, y + m.chipH * 0.3, m.fs, (hot ? P.text : P.sub) + 'ff', 'center', hot);
            dkPutVal(x + cw / 2, y + m.chipH * 0.72, v, (v.up ? P.yellow : (isNext ? P.orange : P.text)) + 'ff', m.fsB);
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== 최단 경로 트리 ===================== */
    function dkPath(g, st, fresh, e) {
        var m = g.m;
        var L = g.L;
        var titleY = g.top + m.gh + 10;
        var cy = titleY + L.titleH + m.sr + 4;
        var r = m.sr, gap = m.arrowGap;
        var path = st.path || [];
        tx('최단 경로 (노드 ' + SRC + ' 기준)', g.x0, titleY + L.titleH / 2, m.fs, P.sub + 'ff', 'left', true);
        if (path.length === 0) {
            tx('출발 노드 ' + SRC + ' (거리 0)', g.x0 + g.w / 2, cy, m.fs + 1, P.teal + 'ff', 'center', true);
            return;
        }
        var total = path.length * 2 * r + (path.length - 1) * gap;
        var sx = g.x0 + (g.w - total) / 2 + r;
        path.forEach(function (id, j) {
            var cx = sx + j * (2 * r + gap);
            var a = fresh ? ez(seg(e, 0.15 + 0.12 * j, 0.45 + 0.12 * j)) : 1;
            var col = j === path.length - 1 ? P.orange : P.purple;
            ctx.globalAlpha = a;
            if (j > 0) arrow(cx - r - gap + 2, cy, cx - r - 2, cy, P.purple + 'ee', 2);
            circ(cx, cy, r, col + '33', col + 'ff', 2);
            tx(String(id), cx, cy, m.fsB, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        var end = path[path.length - 1];
        ctx.globalAlpha = fresh ? ez(seg(e, 0.5, 0.9)) : 1;
        tx('총 거리 ' + FINAL_DIST[end] + ' (노드 ' + end + ')', g.x0 + g.w / 2, cy + r + 8 + m.fs / 2, m.fs, P.green + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var pv = prev || s;
        var fresh = s !== pv;
        var e = fresh ? clamp01(t) : 1;
        var g = dkGeom(x0, top, w, mob);
        dkEdges(g, s, pv, fresh, e);
        dkNodes(g, s, pv, fresh, e);
        if (mode === 'tree') dkPath(g, s, fresh, e);
        else dkCandidates(g, s, pv, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('dijkstra-viz__speed-btn--active'); });
        btn.classList.add('dijkstra-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dijkstra-viz__mode-btn--active', d.key === m); });
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