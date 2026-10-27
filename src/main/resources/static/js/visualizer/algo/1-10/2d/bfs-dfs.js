/**
 * BFS / DFS 시각화 시각화
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
    var root    = el('div', 'graph-search-viz');
    var toolbar = el('div', 'graph-search-viz__toolbar');
    var tbLeft  = el('div', 'graph-search-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'graph-search-viz__title', 'GRAPH'));

    var modeWrap = el('div', 'graph-search-viz__mode');
    var modeDefs = [
        { key: 'bfs', label: 'BFS 탐색' },
        { key: 'dfs', label: 'DFS 탐색' },
        { key: 'compare', label: '동시 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'graph-search-viz__mode-btn' + (i === 0 ? ' graph-search-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'graph-search-viz__speed');
    speedWrap.appendChild(el('span', 'graph-search-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'graph-search-viz__speed-btn' + (i === 0 ? ' graph-search-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'graph-search-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'graph-search-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'graph-search-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'graph-search-viz__controls');
    var btnPlay  = el('button', 'graph-search-viz__btn graph-search-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'graph-search-viz__btn', '▶| STEP');
    var btnReset = el('button', 'graph-search-viz__btn', '↺ RESET');
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
    var mode    = 'bfs';
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

    /* ===================== 그래프 데이터 (고정 트리 구조) ===================== */
    var NODES = [
        { id: 0, x: 0.50, y: 0.07 },
        { id: 1, x: 0.24, y: 0.34 },
        { id: 2, x: 0.76, y: 0.34 },
        { id: 3, x: 0.10, y: 0.62 },
        { id: 4, x: 0.34, y: 0.62 },
        { id: 5, x: 0.62, y: 0.62 },
        { id: 6, x: 0.90, y: 0.62 },
        { id: 7, x: 0.80, y: 0.92 },
    ];
    var EDGES = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [5, 7]];
    var N = NODES.length;

    var ADJ = [];
    for (var ai = 0; ai < N; ai++) ADJ.push([]);
    EDGES.forEach(function (e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
    ADJ.forEach(function (a) { a.sort(function (x, y) { return x - y; }); });

    /* ===================== BFS 스텝 (큐, 실제 알고리즘 실행) ===================== */
    function buildBFSSteps() {
        var visited = {};
        var order = [];
        var queue = [0];
        visited[0] = true;
        var steps = [];
        steps.push({ type: 'intro', node: null, newly: [], queue: queue.slice(), order: [],
            log: 'PLAY를 눌러 BFS(너비 우선 탐색)가 큐(Queue)로 그래프를 방문하는 순서를 확인하세요. 시작 노드: 0' });

        while (queue.length) {
            var cur = queue.shift();
            order.push(cur);
            var newly = [];
            ADJ[cur].forEach(function (n) {
                if (!visited[n]) { visited[n] = true; queue.push(n); newly.push(n); }
            });
            var log = newly.length > 0
                ? '큐에서 ' + cur + '을 꺼내 방문(' + order.length + '번째) → 인접한 ' + newly.join(', ') + '을 큐에 추가합니다.'
                : '큐에서 ' + cur + '을 꺼내 방문(' + order.length + '번째) → 인접 노드가 모두 이미 방문되어 추가할 것이 없습니다.';
            var done = queue.length === 0 && order.length === N;
            steps.push({ type: done ? 'done' : 'visit', node: cur, newly: newly.slice(), queue: queue.slice(), order: order.slice(), log: log });
        }
        steps[steps.length - 1].log += ' — BFS 방문 순서: ' + order.join(' → ');
        return steps;
    }

    /* ===================== DFS 스텝 (스택, 실제 알고리즘 실행) ===================== */
    function buildDFSSteps() {
        var visited = {};
        var order = [];
        var stack = [0];
        var steps = [];
        steps.push({ type: 'intro', node: null, pushed: [], stack: stack.slice(), order: [],
            log: 'PLAY를 눌러 DFS(깊이 우선 탐색)가 스택(Stack)으로 그래프를 방문하는 순서를 확인하세요. 시작 노드: 0' });

        while (stack.length) {
            var cur = stack.pop();
            if (visited[cur]) continue;
            visited[cur] = true;
            order.push(cur);
            var toPush = ADJ[cur].filter(function (n) { return !visited[n]; });
            toPush.slice().reverse().forEach(function (n) { stack.push(n); });
            var log = toPush.length > 0
                ? '스택에서 ' + cur + '을 꺼내 방문(' + order.length + '번째) → 인접한 ' + toPush.join(', ') + '을 스택에 추가합니다.'
                : '스택에서 ' + cur + '을 꺼내 방문(' + order.length + '번째) → 더 갈 곳이 없어 이전 갈래로 되돌아갑니다(백트래킹).';
            var done = stack.length === 0 && order.length === N;
            steps.push({ type: done ? 'done' : 'visit', node: cur, pushed: toPush.slice(), stack: stack.slice(), order: order.slice(), log: log });
        }
        steps[steps.length - 1].log += ' — DFS 방문 순서: ' + order.join(' → ');
        return steps;
    }

    var BFS_STEPS = buildBFSSteps();
    var DFS_STEPS = buildDFSSteps();
    var BFS_ORDER = BFS_STEPS[BFS_STEPS.length - 1].order;
    var DFS_ORDER = DFS_STEPS[DFS_STEPS.length - 1].order;
    var BFS_POS = {}, DFS_POS = {};
    BFS_ORDER.forEach(function (node, idx) { BFS_POS[node] = idx + 1; });
    DFS_ORDER.forEach(function (node, idx) { DFS_POS[node] = idx + 1; });

    /* ===================== 동시 비교 스텝 (노드 번호 순 = 마침 BFS 순서와 동일) ===================== */
    function buildCompareSteps() {
        var steps = [];
        steps.push({ type: 'intro', node: -1,
            log: 'PLAY를 눌러 노드 0부터 하나씩, 같은 노드를 BFS와 DFS가 각각 몇 번째로 방문했는지 비교하세요.' });

        for (var node = 0; node < N; node++) {
            var b = BFS_POS[node], d = DFS_POS[node];
            var log;
            if (node === 0) {
                log = '노드 0 → BFS·DFS 모두 1번째로 방문합니다 (시작 노드).';
            } else if (b === d) {
                log = '노드 ' + node + ' → BFS·DFS 모두 ' + b + '번째에 방문합니다.';
            } else {
                log = '노드 ' + node + ' → BFS는 ' + b + '번째, DFS는 ' + d + '번째에 방문 — 순서가 다릅니다.';
            }
            steps.push({ type: node === N - 1 ? 'done' : 'reveal', node: node, log: log });
        }
        steps[steps.length - 1].log += ' 같은 그래프인데도 큐(BFS)와 스택(DFS)이라는 자료구조 차이만으로 방문 순서가 이렇게 달라집니다.';
        return steps;
    }

    var COMPARE_STEPS = buildCompareSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'dfs') return DFS_STEPS;
        if (mode === 'compare') return COMPARE_STEPS;
        return BFS_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function gsLayout(w, mob) {
        var gH = mob ? 215 : 265;
        var gap = mob ? 12 : 16;
        var rowH = mob ? 56 : 62;
        if (mode === 'compare') rowH = mob ? 60 : 70;
        return {
            mob: mob, fs: mob ? 11 : 12, R: mob ? 15 : 19,
            padX: mob ? 12 : 20, padY: mob ? 12 : 16, usableH: gH - (mob ? 24 : 32),
            bottomY: gH + gap, total: gH + gap + rowH
        };
    }
    function sceneH(w, mob) { return gsLayout(w, mob).total; }

    /* ===================== 상태 조회 ===================== */
    function gsUp(st) { return st.node != null && st.node >= 0 ? st.node : -1; }
    function gsList(st) {
        if (mode === 'bfs') return st.queue || [];
        if (mode === 'dfs') return st.stack || [];
        return [];
    }
    function gsDisc(st) { return (mode === 'bfs' ? st.newly : st.pushed) || []; }
    function gsVisited(st, id) {
        if (mode === 'compare') return id <= gsUp(st);
        return (st.order || []).indexOf(id) >= 0;
    }
    function gsNodeState(st, id) {
        if (mode === 'compare') {
            var up = gsUp(st);
            return id === up ? 'cur' : (id < up ? 'vis' : 'unv');
        }
        if (gsVisited(st, id)) {
            if (st.type === 'done') return 'done';
            return st.node === id ? 'cur' : 'vis';
        }
        return gsList(st).indexOf(id) >= 0 ? 'front' : 'unv';
    }

    /* ===================== 그래프 그리기 ===================== */
    function gsSty(state) {
        if (state === 'cur') return { f: P.orange + '33', s: P.orange + 'ff', lw: 2.6 };
        if (state === 'front') return { f: P.yellow + '22', s: P.yellow + 'ee', lw: 1.8 };
        if (state === 'vis') return { f: P.teal + '33', s: P.teal + 'ee', lw: 1.6 };
        if (state === 'done') return { f: P.green + '33', s: P.green + 'ee', lw: 1.6 };
        return { f: P.surf2 + 'ff', s: P.sub + 'aa', lw: 1.6 };
    }
    function gsPt(L, x0, top, w, id) {
        var nd = NODES[id];
        return { x: x0 + L.padX + nd.x * (w - 2 * L.padX), y: top + L.padY + nd.y * L.usableH };
    }
    function gsAlphaOf(id, s, fresh, e) {
        if (!fresh) return 1;
        if (id === s.node) return ez(seg(e, 0, 0.3));
        if (gsDisc(s).indexOf(id) >= 0) return ez(seg(e, 0.55, 0.9));
        return ez(seg(e, 0.3, 0.6));
    }
    function gsDrawNode(c, R, state, alpha) {
        var sy = gsSty(state);
        ctx.globalAlpha = alpha;
        circ(c.x, c.y, R, sy.f);
        circ(c.x, c.y, R, 'none', sy.s, sy.lw);
        ctx.globalAlpha = 1;
    }
    function gsBadge(x, y, r, col, label, sc, fsz) {
        if (sc <= 0) return;
        ctx.globalAlpha = sc;
        circ(x, y, r * sc, col + 'ee');
        tx(String(label), x, y, fsz, '#0f0f1a', 'center', true);
        ctx.globalAlpha = 1;
    }
    function gsEdges(L, x0, top, w, s, p, fresh, e) {
        EDGES.forEach(function (ed) {
            var pa = gsPt(L, x0, top, w, ed[0]), pb = gsPt(L, x0, top, w, ed[1]);
            ln(pa.x, pa.y, pb.x, pb.y, P.sub + '55', 1.6);
            if (!(gsVisited(s, ed[0]) && gsVisited(s, ed[1]))) return;
            var was = gsVisited(p, ed[0]) && gsVisited(p, ed[1]);
            ctx.globalAlpha = fresh && !was ? ez(seg(e, 0.55, 0.9)) : 1;
            ln(pa.x, pa.y, pb.x, pb.y, P.teal + 'cc', 2.2);
            ctx.globalAlpha = 1;
        });
    }
    function gsNodes(L, x0, top, w, s, p, fresh, e) {
        var R = L.R, mob = L.mob;
        var bR = mob ? 9 : 10, dR = mob ? 8 : 9, bF = mob ? 9.5 : 10;
        NODES.forEach(function (nd) {
            var id = nd.id;
            var c = gsPt(L, x0, top, w, id);
            var ps = gsNodeState(p, id), ss = gsNodeState(s, id);
            if (ps !== ss) {
                gsDrawNode(c, R, ps, 1);
                gsDrawNode(c, R, ss, gsAlphaOf(id, s, fresh, e));
            } else {
                gsDrawNode(c, R, ss, 1);
            }
            if (fresh && e < 1 && id === s.node) {
                ctx.globalAlpha = 1 - e;
                circ(c.x, c.y, R + 4 + 12 * ez(e), 'none', P.orange + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            tx(String(id), c.x, c.y, mob ? 11 : 13, P.text + 'ee', 'center', true);
            if (mode === 'compare') {
                if (gsVisited(s, id)) {
                    var sc2 = fresh && id === s.node ? ez(seg(e, 0.5, 0.9)) : 1;
                    gsBadge(c.x - R * 0.95, c.y - R * 0.95, dR, P.teal, BFS_POS[id], sc2, bF);
                    gsBadge(c.x + R * 0.95, c.y - R * 0.95, dR, P.purple, DFS_POS[id], sc2, bF);
                }
            } else {
                var oi = (s.order || []).indexOf(id);
                if (oi >= 0) {
                    var sc = fresh && id === s.node ? ez(seg(e, 0.15, 0.5)) : 1;
                    gsBadge(c.x + R * 0.95, c.y - R * 0.95, bR, P.green, oi + 1, sc, bF);
                }
            }
        });
    }
    function gsDiscover(L, x0, top, w, s, fresh, e) {
        if (!fresh || s.node == null || s.node < 0) return;
        var pc = gsPt(L, x0, top, w, s.node);
        gsDisc(s).forEach(function (d) {
            var q = seg(e, 0.05, 0.55);
            if (q <= 0) return;
            var pd = gsPt(L, x0, top, w, d);
            var dx = lerp(pc.x, pd.x, q), dy = lerp(pc.y, pd.y, q);
            ln(pc.x, pc.y, dx, dy, P.yellow + 'cc', 2.4);
            if (q < 1) circ(dx, dy, 5, P.yellow + 'ff');
        });
    }

    /* ===================== 큐 · 스택 칩 (BFS/DFS 모드) ===================== */
    function gsChipAt(cx, cy, cw, ch, id, a, fsz) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 4, P.orange + '22', P.orange + 'aa', 1.2);
        tx(String(id), cx, cy, fsz, P.text + 'ee', 'center', true);
        ctx.globalAlpha = 1;
    }
    function gsChipRow(L, x0, top, w, s, p, fresh, e) {
        var fs = L.fs;
        var bottomTop = top + L.bottomY;
        var lbl = mode === 'bfs' ? '큐 (맨 왼쪽이 다음 차례)' : '스택 (맨 오른쪽이 다음 차례)';
        var chipY = bottomTop + 4;
        var chipH = L.mob ? 24 : 28;
        tx(lbl, x0, chipY + chipH + 16, fs, P.sub + 'ff', 'left', true);
        var pitch = Math.min(w / N, L.mob ? 40 : 52);
        var chipW = pitch - (L.mob ? 4 : 8);
        var cy = chipY + chipH / 2;
        var sl = gsList(s);
        var pl = fresh ? gsList(p) : sl;
        function slotCx(k) { return x0 + k * pitch + chipW / 2; }
        var k;
        ctx.globalAlpha = sl.length ? 1 : (fresh ? 1 - seg(e, 0.4, 0.9) : 0);
        for (k = 0; k < N; k++) rr(x0 + k * pitch, chipY, chipW, chipH, 4, 'none', P.sub + '33', 1);
        ctx.globalAlpha = 1;
        if (!fresh) {
            sl.forEach(function (id, i) { gsChipAt(slotCx(i), cy, chipW, chipH, id, 1, fs); });
        } else {
            pl.forEach(function (id, i) {
                if (sl.indexOf(id) >= 0) return;
                var c = gsPt(L, x0, top, w, id);
                var m = 0.6 * ez(seg(e, 0, 0.6));
                gsChipAt(lerp(slotCx(i), c.x, m), lerp(cy, c.y, m), chipW, chipH, id, 1 - seg(e, 0.2, 0.6), fs);
            });
            sl.forEach(function (id, i) {
                var pi = pl.indexOf(id);
                if (pi >= 0) {
                    gsChipAt(lerp(slotCx(pi), slotCx(i), ez(seg(e, 0.1, 0.6))), cy, chipW, chipH, id, 1, fs);
                    return;
                }
                var m2 = ez(seg(e, 0.5, 0.9));
                gsChipAt(slotCx(i), cy + (1 - m2) * 16, chipW, chipH, id, m2, fs);
            });
        }
        if (!sl.length) {
            ctx.globalAlpha = fresh ? seg(e, 0.5, 1) : 1;
            tx('(비어 있음 — 탐색 종료)', x0, cy, fs, P.sub + 'ff', 'left', false);
            ctx.globalAlpha = 1;
        } else {
            var mk = mode === 'bfs' ? 0 : sl.length - 1;
            var mx = slotCx(mk), my = chipY + chipH + 3;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx - 4, my + 5);
            ctx.lineTo(mx + 4, my + 5);
            ctx.closePath();
            ctx.fillStyle = P.yellow + 'cc';
            ctx.fill();
        }
    }

    /* ===================== 비교 타일 (동시 비교 모드) ===================== */
    function gsTile(cx, cy, tW, tH, n, col, stroke, fsz, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(cx - tW / 2, cy - tH / 2, tW, tH, 4, col + '33', stroke, 1.6);
        tx(String(n), cx, cy, fsz, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function gsCompareRows(L, x0, top, w, s, fresh, e) {
        var fs = L.fs, mob = L.mob;
        var bottomTop = top + L.bottomY;
        var y1 = bottomTop + 2, y2 = y1 + (mob ? 30 : 36);
        var tH = mob ? 22 : 26;
        var labW = mob ? 30 : 44;
        var pitch = Math.min((w - labW) / N, mob ? 34 : 56);
        var tW = pitch - 4;
        var up = gsUp(s);
        var k;
        tx('BFS', x0, y1 + tH / 2, fs, P.teal + 'ff', 'left', true);
        tx('DFS', x0, y2 + tH / 2, fs, P.purple + 'ff', 'left', true);
        for (k = 0; k < N; k++) {
            rr(x0 + labW + k * pitch + 2, y1, tW, tH, 4, 'none', P.sub + '44', 1);
            rr(x0 + labW + k * pitch + 2, y2, tW, tH, 4, 'none', P.sub + '44', 1);
        }
        for (k = 0; k <= up && k < N; k++) {
            var match = BFS_POS[k] === DFS_POS[k];
            var fly = fresh && k === up && e < 1;
            var m = fly ? ez(seg(e, 0.1, 0.8)) : 1;
            var c = gsPt(L, x0, top, w, k);
            var bx = x0 + labW + (BFS_POS[k] - 1) * pitch + 2 + tW / 2;
            var dx = x0 + labW + (DFS_POS[k] - 1) * pitch + 2 + tW / 2;
            var ys = y1 + tH / 2, yd = y2 + tH / 2;
            var ringCol = match ? P.green + 'ff' : P.orange + 'ff';
            var sB = fly && e < 0.8 ? P.teal + 'ff' : ringCol;
            var sD = fly && e < 0.8 ? P.purple + 'ff' : ringCol;
            var fa = fly ? seg(e, 0.25, 0.4) : 1;
            gsTile(lerp(c.x, bx, m), lerp(c.y, ys, m), tW, tH, k, P.teal, sB, fs, fa);
            gsTile(lerp(c.x, dx, m), lerp(c.y, yd, m), tW, tH, k, P.purple, sD, fs, fa);
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = gsLayout(w, mob);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        gsEdges(L, x0, top, w, s, p, fresh, e);
        gsNodes(L, x0, top, w, s, p, fresh, e);
        gsDiscover(L, x0, top, w, s, fresh, e);
        if (mode === 'compare') gsCompareRows(L, x0, top, w, s, fresh, e);
        else gsChipRow(L, x0, top, w, s, p, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('graph-search-viz__speed-btn--active'); });
        btn.classList.add('graph-search-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('graph-search-viz__mode-btn--active', d.key === m); });
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