/**
 * 다익스트라(Dijkstra) 시각화
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
        { key: 'tree',     label: '최단 경로 트리' },
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
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode    = 'progress';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        return mode === 'progress' ? PROGRESS_STEPS : TREE_STEPS;
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
        var spec = { nodeStatus: {}, dist: {}, pathEdges: {}, activeEdges: {}, allGreen: step.type === 'done' && mode === 'progress' };

        (step.confirmedEdges || []).forEach(function (e) {
            spec.pathEdges[e[0] + '-' + e[1]] = true;
            spec.pathEdges[e[1] + '-' + e[0]] = true;
        });

        if (mode === 'progress') {
            for (var i = 0; i < N; i++) {
                spec.nodeStatus[i] = step.visited[i] ? 'visited' : 'unvisited';
                spec.dist[i] = step.dist[i];
            }
            if (step.finalize != null) spec.nodeStatus[step.finalize] = 'current';
            (step.updates || []).forEach(function (up) {
                var a = step.finalize, b = up.node;
                spec.activeEdges[a + '-' + b] = true;
                spec.activeEdges[b + '-' + a] = true;
            });
        } else {
            var revealed = step.revealed || [];
            revealed.forEach(function (n) { spec.nodeStatus[n] = 'visited'; spec.dist[n] = FINAL_DIST[n]; });
            spec.nodeStatus[SRC] = 'visited'; spec.dist[SRC] = 0;
            if (step.node != null) spec.nodeStatus[step.node] = 'current';
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
            var key = e[0] + '-' + e[1];
            var isActive = spec.activeEdges && spec.activeEdges[key];
            var onPath = spec.pathEdges[key];
            var edgeCol = isActive ? P.orange : (onPath ? P.purple : P.muted);
            var edgeLw = isActive ? 3.4 : (onPath ? 3 : 1.4);
            line(p1.x, p1.y, p2.x, p2.y, edgeCol + (isActive || onPath ? 'ee' : '4a'), edgeLw);

            var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            var wLbl = String(e[2]);
            var wSz = mob ? 9 : 10;
            tx(wLbl, mx, my, wSz, (isActive || onPath ? edgeCol : P.text) + (isActive || onPath ? 'ee' : 'cc'), 'center', true);
        });

        NODES.forEach(function (node) {
            var p = px(node);
            var status = spec.nodeStatus[node.id] || 'unvisited';
            var col = P.muted;
            if (status === 'current') col = P.orange;
            else if (status === 'visited') col = P.teal;
            if (spec.allGreen) col = P.green;
            if (node.id === SRC) col = status === 'unvisited' ? P.muted : col;

            ctx.beginPath();
            ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
            ctx.fillStyle = col + '22';
            ctx.fill();
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = status === 'current' ? 2.8 : 1.7;
            ctx.stroke();

            tx(String(node.id), p.x, p.y, mob ? 11 : 13, P.text + 'ee', 'center', true);

            var dVal = spec.dist[node.id];
            if (dVal != null) {
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

    /* ===================== 미확정 노드 후보 목록 (진행 과정 모드) ===================== */
    function drawCandidateList(x0, top, mob, step) {
        var fLbl = mob ? 10 : 11;
        tx('미확정 노드 (거리 오름차순)', x0, top, fLbl, P.muted + 'aa', 'left', true);
        var chipY = top + (mob ? 20 : 22);
        var chipH = mob ? 24 : 28, gap = mob ? 8 : 10;
        var list = step.unvisitedList || [];
        if (list.length === 0) {
            tx('(모두 확정됨)', x0, chipY + chipH / 2, fLbl, P.text + '77', 'left', false);
            return;
        }
        var x = x0;
        list.forEach(function (item, idx) {
            var isNext = idx === 0;
            var lbl = '노드' + item.node + ' · ' + (item.dist === Infinity ? '∞' : item.dist);
            ctx.font = '700 ' + fLbl + 'px "JetBrains Mono",monospace';
            var w = ctx.measureText(lbl).width + (mob ? 18 : 22);

            if (isNext) {
                tx('다음 확정 ↓', x + w / 2, chipY - (mob ? 10 : 11), mob ? 8 : 9, P.orange + 'ee', 'center', true);
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
            panelH:   mob ? 56 : 62,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        var bottomH = mode === 'progress' ? L.panelH : 0;
        return L.top + L.graphH + (bottomH > 0 ? L.gapMid : 0) + bottomH + L.top;
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

        if (mode === 'progress') {
            var padX = mob ? 12 : 24;
            drawCandidateList(padX, L.top + L.graphH + L.gapMid, mob, step);
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
        speedBtns.forEach(function (b) { b.classList.remove('dijkstra-viz__speed-btn--active'); });
        btn.classList.add('dijkstra-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('dijkstra-viz__mode-btn--active', d.key === m);
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