/**
 * 위상 정렬 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'kahn';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'dfs') return DFS_STEPS;
        if (mode === 'cycle') return CYCLE_STEPS;
        return KAHN_STEPS;
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
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 방향 그래프와 목록 그리기 ===================== */
    function drawTS(x0, top, w, mob, step) {
        var dfs = mode === 'dfs';
        var edges = step ? step.edges : (mode === 'cycle' ? CYC_EDGES : EDGES);
        var deg = step ? step.deg : indegOf(edges);
        var col = step ? step.col : [0, 0, 0, 0, 0, 0];
        var row1 = step ? step.row1 : [];
        var row2 = step ? step.row2 : [];
        var cur = step ? step.cur : -1;
        var hot = step ? step.hot : [];
        var bad = step ? step.bad : [];
        var fs = mob ? 11.5 : 13;
        var r = mob ? 17 : 20;
        var gx = x0 + r + 8;
        var gw = w - 2 * (r + 8);
        var yTop = top + 62;
        var yBot = yTop + (mob ? 104 : 124);
        var src = edges.length ? edges : EDGES;
        function px(v) { return gx + POS[v][0] * gw; }
        function py(v) { return POS[v][1] ? yBot : yTop; }
        var i;
        src.forEach(function (e, k) {
            var a = e[0];
            var b = e[1];
            var curved = k >= EDGES.length;
            var isHot = hot.indexOf(k) >= 0;
            var isBad = bad.indexOf(a) >= 0 && bad.indexOf(b) >= 0;
            var done = !isHot && !isBad && col[a] === 2;
            var color = isHot ? P.yellow + 'ff' : isBad ? P.red + 'ff' : done ? P.sub + '55' : P.sub + 'cc';
            var ax = px(a);
            var ay = py(a);
            var bx = px(b);
            var by = py(b);
            var qx = (ax + bx) / 2;
            var qy = Math.min(ay, by) - r - 56;
            var d1 = Math.atan2((curved ? qy : by) - ay, (curved ? qx : bx) - ax);
            var d2 = Math.atan2((curved ? qy : ay) - by, (curved ? qx : ax) - bx);
            var sx = ax + Math.cos(d1) * r;
            var sy = ay + Math.sin(d1) * r;
            var ex = bx + Math.cos(d2) * (r + 3);
            var ey = by + Math.sin(d2) * (r + 3);
            var fx = curved ? qx : sx;
            var fy = curved ? qy : sy;
            var ang = Math.atan2(ey - fy, ex - fx);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            if (curved) ctx.quadraticCurveTo(qx, qy, ex, ey);
            else ctx.lineTo(ex, ey);
            ctx.strokeStyle = color;
            ctx.lineWidth = isHot || isBad ? 3 : 1.8;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - 9 * Math.cos(ang - 0.4), ey - 9 * Math.sin(ang - 0.4));
            ctx.lineTo(ex - 9 * Math.cos(ang + 0.4), ey - 9 * Math.sin(ang + 0.4));
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        });
        for (i = 0; i < N; i++) {
            var inQ = !dfs && row1.indexOf(i) >= 0;
            var isCur = i === cur;
            var isBadN = bad.indexOf(i) >= 0;
            var c = isBadN ? P.red : col[i] === 2 ? P.green : (col[i] === 1 || inQ) ? (dfs ? P.yellow : P.teal) : P.sub;
            ctx.beginPath();
            ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
            ctx.fillStyle = col[i] === 2 || col[i] === 1 || inQ || isBadN ? c + '44' : P.surf2;
            ctx.fill();
            ctx.strokeStyle = (isCur ? P.yellow : c) + 'ff';
            ctx.lineWidth = isCur ? 3.4 : 2;
            ctx.stroke();
            tx(NAMES[i], px(i), py(i) - 1, fs + 1, P.text + 'ff', 'center', true);
            var lab = dfs ? (col[i] === 1 ? '탐색 중' : col[i] === 2 ? '종료 ' + (row1.indexOf(i) + 1) : '') : (col[i] === 2 ? '완료' : '진입 ' + deg[i]);
            if (lab) tx(lab, px(i), py(i) + r + 12, fs - 1.5, c + 'ff', 'center', true);
        }
        var rowY = yBot + r + 28;
        var cw = Math.min(42, (w - 56) / N);
        var sx0 = x0 + 56 + (w - 56 - cw * N) / 2;
        var labels = dfs ? ['종료', '역순'] : ['큐', '결과'];
        var rows = [row1, row2];
        var k2;
        for (k2 = 0; k2 < 2; k2++) {
            var ry = rowY + k2 * 40;
            tx(labels[k2], x0, ry + 20, fs - 1, P.sub + 'ee', 'left', true);
            for (i = 0; i < N; i++) {
                var has = i < rows[k2].length;
                rr(sx0 + i * cw + 2, ry, cw - 4, 32, 4, has ? P.teal + '33' : 'none', has ? P.teal + 'ff' : P.sub + '55', has ? 1.6 : 1);
                if (has) tx(NAMES[rows[k2][i]], sx0 + i * cw + cw / 2, ry + 17, fs, P.text + 'ff', 'center', true);
            }
        }
        var at = rowY + 98;
        if (step && step.cap) tx(step.cap, x0 + w / 2, at, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, at + 19, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, at + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        drawTS(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 위상 정렬의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 400 : 430;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'dfs') return '깊이 우선 탐색이 끝나는 순서를 뒤집어 위상 순서를 얻는 방식을 봅니다.';
        if (mode === 'cycle') return '사이클이 있는 그래프에서 Kahn 알고리즘이 어디서 멈추는지 봅니다.';
        return '진입 차수가 0인 정점을 큐에서 꺼내며 순서를 만드는 Kahn 알고리즘을 봅니다.';
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
        running = false; stepIdx = -1;
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