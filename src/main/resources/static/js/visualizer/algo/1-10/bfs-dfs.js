/**
 * BFS / DFS 시각화
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
        { key: 'bfs',     label: 'BFS 탐색' },
        { key: 'dfs',     label: 'DFS 탐색' },
        { key: 'compare', label: '동시 비교' },
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
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode    = 'bfs';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        if (mode === 'bfs') return BFS_STEPS;
        if (mode === 'dfs') return DFS_STEPS;
        return COMPARE_STEPS;
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

    /* ===================== 스텝 → 렌더 스펙 변환 ===================== */
    function computeGraphSpec(step) {
        var spec = { nodeStatus: {}, badge: {}, badgeDual: null, chipLabel: '', chipItems: [], allGreen: step.type === 'done' && mode !== 'compare' };

        if (mode === 'bfs' || mode === 'dfs') {
            var order = step.order || [];
            order.forEach(function (nodeId, idx) {
                spec.nodeStatus[nodeId] = 'visited';
                spec.badge[nodeId] = idx + 1;
            });
            if (step.node != null) spec.nodeStatus[step.node] = 'current';
            spec.chipLabel = mode === 'bfs' ? '큐 (맨 왼쪽이 다음 차례)' : '스택 (맨 오른쪽이 다음 차례)';
            spec.chipItems = mode === 'bfs' ? (step.queue || []) : (step.stack || []);
        } else {
            var upTo = step.node != null && step.node >= 0 ? step.node : -1;
            spec.badgeDual = {};
            for (var n = 0; n <= upTo && n < N; n++) {
                spec.nodeStatus[n] = (n === upTo) ? 'current' : 'visited';
                spec.badgeDual[n] = { bfs: BFS_POS[n], dfs: DFS_POS[n] };
            }
        }
        return spec;
    }

    /* ===================== 그래프 다이어그램 렌더 ===================== */
    function drawGraphDiagram(top, h, mob, W, spec) {
        var padX = mob ? 26 : 44;
        var padTop = top + (mob ? 12 : 16);
        var usableH = h - (mob ? 24 : 32);
        var R = mob ? 15 : 19;

        function px(node) { return { x: padX + node.x * (W - 2 * padX), y: padTop + node.y * usableH }; }

        EDGES.forEach(function (e) {
            var p1 = px(NODES[e[0]]), p2 = px(NODES[e[1]]);
            line(p1.x, p1.y, p2.x, p2.y, P.muted + '55', 1.6);
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
            ctx.lineWidth = status === 'current' ? 2.6 : 1.6;
            ctx.stroke();

            tx(String(node.id), p.x, p.y, mob ? 11 : 13, P.text + 'ee', 'center', true);

            if (spec.badge[node.id] != null) {
                var bR = mob ? 9 : 10;
                var bx = p.x + R * 0.95, by = p.y - R * 0.95;
                ctx.beginPath(); ctx.arc(bx, by, bR, 0, Math.PI * 2);
                ctx.fillStyle = P.green + 'ee'; ctx.fill();
                tx(String(spec.badge[node.id]), bx, by, mob ? 9 : 10, '#0f0f1a', 'center', true);
            }
            if (spec.badgeDual && spec.badgeDual[node.id]) {
                var d = spec.badgeDual[node.id];
                var dR = mob ? 8 : 9;
                var lx = p.x - R * 0.95, ly = p.y - R * 0.95;
                var rx = p.x + R * 0.95, ry = p.y - R * 0.95;
                ctx.beginPath(); ctx.arc(lx, ly, dR, 0, Math.PI * 2);
                ctx.fillStyle = P.teal + 'ee'; ctx.fill();
                tx(String(d.bfs), lx, ly, mob ? 8 : 9, '#0f0f1a', 'center', true);
                ctx.beginPath(); ctx.arc(rx, ry, dR, 0, Math.PI * 2);
                ctx.fillStyle = P.purple + 'ee'; ctx.fill();
                tx(String(d.dfs), rx, ry, mob ? 8 : 9, '#0f0f1a', 'center', true);
            }
        });
    }

    /* ===================== 큐/스택 칩 목록 (BFS/DFS 모드) ===================== */
    function drawChipsRow(x0, top, mob, label, items) {
        var fLbl = mob ? 10 : 11;
        tx(label, x0, top, fLbl, P.muted + 'aa', 'left', true);
        var chipY = top + (mob ? 16 : 18);
        var chipH = mob ? 24 : 28, chipW = mob ? 30 : 36, gap = mob ? 6 : 8;
        if (items.length === 0) {
            tx('(비어 있음 — 탐색 종료)', x0, chipY + chipH / 2, fLbl, P.text + '77', 'left', false);
            return;
        }
        var x = x0;
        items.forEach(function (v) {
            rr(x, chipY, chipW, chipH, 4, P.orange + '18', P.orange + '88', 1.2);
            tx(String(v), x + chipW / 2, chipY + chipH / 2, fLbl, P.text + 'ee', 'center', true);
            x += chipW + gap;
        });
    }

    /* ===================== BFS/DFS 순서 비교 표 (동시 비교 모드) ===================== */
    function drawCompareTable(x0, top, mob, step) {
        var upTo = step.node != null && step.node >= 0 ? step.node : -1;
        var fLbl = mob ? 10 : 11;
        var fVal = mob ? 11 : 12.5;
        var colW = mob ? 60 : 76;
        var rowH = mob ? 22 : 26;
        var headH = mob ? 24 : 28;

        tx('노드', x0, top + headH / 2, fLbl, P.muted + 'aa', 'left', true);
        tx('BFS 순서', x0 + colW, top + headH / 2, fLbl, P.teal + 'cc', 'center', true);
        tx('DFS 순서', x0 + colW * 2, top + headH / 2, fLbl, P.purple + 'cc', 'center', true);

        for (var n = 0; n < N; n++) {
            var ry = top + headH + n * rowH;
            var on = n <= upTo;
            tx(String(n), x0, ry + rowH / 2, fVal, on ? P.text + 'ee' : P.muted + '66', 'left', true);
            if (on) {
                var same = BFS_POS[n] === DFS_POS[n];
                tx(String(BFS_POS[n]), x0 + colW, ry + rowH / 2, fVal, P.teal + 'ee', 'center', false);
                tx(String(DFS_POS[n]), x0 + colW * 2, ry + rowH / 2, fVal, P.purple + 'ee', 'center', false);
                if (!same) tx('≠', x0 + colW * 2 + colW * 0.62, ry + rowH / 2, fVal, P.orange + 'cc', 'left', true);
            } else {
                tx('·', x0 + colW, ry + rowH / 2, fVal, P.muted + '66', 'center', false);
                tx('·', x0 + colW * 2, ry + rowH / 2, fVal, P.muted + '66', 'center', false);
            }
        }
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        var compareRows = N;
        return {
            top:       mob ? 16 : 22,
            graphH:    mob ? 215 : 265,
            gapMid:    mob ? 12 : 16,
            chipRowH:  mob ? 56 : 62,
            compareH:  mode === 'compare' ? ((mob ? 24 : 28) + compareRows * (mob ? 22 : 26) + (mob ? 10 : 12)) : 0,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        var bottomH = mode === 'compare' ? L.compareH : L.chipRowH;
        return L.top + L.graphH + L.gapMid + bottomH + L.top;
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
        var spec  = computeGraphSpec(step);

        drawGraphDiagram(L.top, L.graphH, mob, W, spec);

        var bottomTop = L.top + L.graphH + L.gapMid;
        var padX = mob ? 12 : 24;
        if (mode === 'compare') {
            drawCompareTable(padX, bottomTop, mob, step);
        } else {
            drawChipsRow(padX, bottomTop, mob, spec.chipLabel, spec.chipItems);
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
                    timer = setTimeout(tick, speed * 0.5);
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
        speedBtns.forEach(function (b) { b.classList.remove('graph-search-viz__speed-btn--active'); });
        btn.classList.add('graph-search-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('graph-search-viz__mode-btn--active', d.key === m);
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