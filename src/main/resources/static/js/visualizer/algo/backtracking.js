/**
 * 백트래킹(Backtracking) 시각화`
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
    var root    = el('div', 'backtracking-viz');
    var toolbar = el('div', 'backtracking-viz__toolbar');
    var tbLeft  = el('div', 'backtracking-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'backtracking-viz__title', 'N-QUEENS'));

    var modeWrap = el('div', 'backtracking-viz__mode');
    var modeDefs = [
        { key: 'board', label: '보드에서 탐색' },
        { key: 'tree',  label: '탐색 트리' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'backtracking-viz__mode-btn' + (i === 0 ? ' backtracking-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'backtracking-viz__speed');
    speedWrap.appendChild(el('span', 'backtracking-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1200], ['2x', 600], ['3x', 300]].forEach(function (pair, i) {
        var b = el('button', 'backtracking-viz__speed-btn' + (i === 0 ? ' backtracking-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'backtracking-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'backtracking-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'backtracking-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'backtracking-viz__controls');
    var btnPlay  = el('button', 'backtracking-viz__btn backtracking-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'backtracking-viz__btn', '▶| STEP');
    var btnReset = el('button', 'backtracking-viz__btn', '↺ RESET');
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

    /* ===================== N-Queens 데이터 (N=4, 실제 백트래킹 알고리즘 실행) ===================== */
    var N = 4;

    function checkSafe(cols, row, col) {
        for (var r = 0; r < row; r++) {
            var c = cols[r];
            if (c === col) return { safe: false, reason: 'col', conflictRow: r };
            if (Math.abs(c - col) === Math.abs(r - row)) return { safe: false, reason: 'diag', conflictRow: r };
        }
        return { safe: true };
    }

    var DIGIT_PARTICLE = ['은', '은', '는', '은', '는', '는', '은', '은', '은', '는'];
    function withEunNeun(num) { return DIGIT_PARTICLE[num % 10]; }
    var DIGIT_GWA_WA = ['과', '과', '와', '과', '와', '와', '과', '과', '과', '와'];
    function withGwaWa(num) { return DIGIT_GWA_WA[num % 10]; }

    function describeTried(tried, excludeLastSafe) {
        var parts = [];
        tried.forEach(function (t) {
            if (t.safe) return;
            var why = t.reason === 'col' ? ('행' + t.conflictRow + withGwaWa(t.conflictRow) + ' 같은 열') : ('행' + t.conflictRow + withGwaWa(t.conflictRow) + ' 대각선');
            parts.push('열' + t.col + '(' + why + ')');
        });
        return parts;
    }

    /* ===================== 보드 관점 스텝 (행 단위로 묶어 이해하기 쉽게 구성) ===================== */
    function buildBoardSteps() {
        var cols = new Array(N).fill(-1);
        var steps = [];
        var solutionCount = 0;

        steps.push({ type: 'intro', row: -1, board: cols.slice(), tried: [],
            log: 'PLAY를 눌러보세요. 퀸을 한 줄씩 놓다가, 안 되면 지우고 다른 자리를 다시 찾습니다.' });

        function solve(row) {
            if (row === N) {
                solutionCount++;
                steps.push({ type: 'solution', row: row, board: cols.slice(), tried: [], solutionIdx: solutionCount,
                    log: '성공! [' + cols.join(', ') + '] 배치 완성 — ' + solutionCount + '번째 정답이에요.' });
                return;
            }
            var tried = [];
            for (var col = 0; col < N; col++) {
                var res = checkSafe(cols, row, col);
                tried.push({ col: col, safe: res.safe, reason: res.reason, conflictRow: res.conflictRow });
                if (res.safe) {
                    cols[row] = col;
                    var rejected = describeTried(tried);
                    var log = rejected.length > 0
                        ? '행' + row + ': ' + rejected.join(', ') + '은 안 돼요. 열' + col + withEunNeun(col) + ' 안전해요! 퀸을 놓을게요.'
                        : '행' + row + ': 열' + col + withEunNeun(col) + ' 바로 안전해요! 퀸을 놓을게요.';
                    steps.push({ type: 'place', row: row, tried: tried.slice(), placedCol: col, board: cols.slice(), log: log });
                    solve(row + 1);
                    steps.push({ type: 'remove', row: row, removedCol: col, board: cols.slice(),
                        log: '행' + row + '의 퀸을 치울게요 — 이 자리는 다 확인했으니 다른 열을 마저 찾아볼게요.' });
                    cols[row] = -1;
                    tried = [];
                }
            }
            if (row > 0) {
                var rejectedAll = describeTried(tried);
                var backLog = rejectedAll.length > 0
                    ? '행' + row + ': ' + rejectedAll.join(', ') + ' 다 안 돼요. 안전한 열이 없어서 한 줄 위로 돌아갈게요.'
                    : '행' + row + ': 더 확인할 열이 없어요. 한 줄 위로 돌아갈게요.';
                steps.push({ type: 'backtrack', row: row, tried: tried.slice(), board: cols.slice(), log: backLog });
            }
        }
        solve(0);

        steps.push({ type: 'done', row: -1, board: new Array(N).fill(-1), tried: [],
            log: '다 찾아봤어요! 4-Queens 정답은 총 ' + solutionCount + '개예요. "탐색 트리" 탭에서 전체 과정을 한눈에 볼 수 있어요.' });
        return steps;
    }

    var BOARD_STEPS = buildBoardSteps();

    /* ===================== 탐색 트리 데이터 (동일한 알고리즘을 트리 구조로 기록) ===================== */
    function buildTreeData() {
        var cols = new Array(N).fill(-1);
        var nodes = [];
        var events = [];
        var idCounter = 0;

        function solve(row, parentId) {
            if (row === N) {
                var sid = idCounter++;
                nodes.push({ id: sid, row: row, col: null, parentId: parentId, type: 'solution', board: cols.slice() });
                events.push({ id: sid, log: '여기까지 오면 정답이에요! 배치 [' + cols.join(', ') + ']' });
                return;
            }
            var any = false;
            for (var col = 0; col < N; col++) {
                var res = checkSafe(cols, row, col);
                if (res.safe) {
                    any = true;
                    cols[row] = col;
                    var id = idCounter++;
                    nodes.push({ id: id, row: row, col: col, parentId: parentId, type: 'place', board: cols.slice() });
                    events.push({ id: id, log: '행' + row + '에 열' + col + '을 놓아봐요. 아직까진 괜찮아요.' });
                    solve(row + 1, id);
                    cols[row] = -1;
                }
            }
            if (!any) {
                var did = idCounter++;
                nodes.push({ id: did, row: row, col: null, parentId: parentId, type: 'deadend', board: cols.slice() });
                events.push({ id: did, log: '행' + row + '엔 놓을 자리가 없어요. 여기서 막혀요 — 가지를 잘라내고 돌아가요.' });
            }
        }
        solve(0, null);

        var byId = {};
        nodes.forEach(function (n) { byId[n.id] = n; });
        nodes.filter(function (n) { return n.type === 'solution'; }).forEach(function (sol) {
            var cur = sol.id;
            while (cur != null) { byId[cur].onSolutionPath = true; cur = byId[cur].parentId; }
        });

        var childrenOf = {};
        nodes.forEach(function (n) {
            var key = n.parentId === null ? 'root' : n.parentId;
            if (!childrenOf[key]) childrenOf[key] = [];
            childrenOf[key].push(n.id);
        });
        var leafCounter = 0;
        function layout(id) {
            var kids = childrenOf[id] || [];
            if (kids.length === 0) { byId[id].x = leafCounter++; return byId[id].x; }
            var sum = 0;
            kids.forEach(function (k) { sum += layout(k); });
            byId[id].x = sum / kids.length;
            return byId[id].x;
        }
        (childrenOf['root'] || []).forEach(function (k) { layout(k); });

        return { nodes: nodes, byId: byId, events: events, leafCount: leafCounter, solutionCount: nodes.filter(function (n) { return n.type === 'solution'; }).length };
    }

    var TREE = buildTreeData();

    function buildTreeSteps() {
        var steps = [];
        steps.push({ type: 'intro', revealed: [],
            log: 'PLAY를 눌러보세요. 시도할 때마다 나뭇가지가 하나씩 자라나요. 초록 가지가 정답으로 이어지는 길이에요.' });
        var revealed = [];
        TREE.events.forEach(function (e, idx) {
            revealed = revealed.concat([e.id]);
            var isLast = idx === TREE.events.length - 1;
            steps.push({ type: isLast ? 'done' : 'reveal', curId: e.id, revealed: revealed.slice(), log: e.log });
        });
        steps[steps.length - 1].log += ' 다 자랐어요! 가지 ' + TREE.nodes.length + '개 중에 정답은 ' + TREE.solutionCount + '개예요.';
        return steps;
    }

    var TREE_STEPS = buildTreeSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'board';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1200;

    function currentSteps() {
        return mode === 'board' ? BOARD_STEPS : TREE_STEPS;
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

    /* ===================== 보드 렌더 ===================== */
    function drawBoard(x0, top, mob, step, headW) {
        var cell = mob ? 44 : 56;
        var boardX = x0 + headW;
        var boardPx = cell * N;

        for (var r0 = 0; r0 < N; r0++) {
            tx('행' + r0, x0 + headW / 2, top + r0 * cell + cell / 2, mob ? 11 : 12.5, P.text + 'dd', 'center', true);
        }

        for (var r = 0; r < N; r++) {
            for (var c = 0; c < N; c++) {
                var cx = boardX + c * cell, cy = top + r * cell;
                var isCurRow = step.row === r;
                var baseCol = ((r + c) % 2 === 0) ? P.muted + '0a' : P.muted + '16';
                rr(cx, cy, cell - 2, cell - 2, 3, baseCol, P.muted + '30', 1);

                if (isCurRow) {
                    rr(cx, cy, cell - 2, cell - 2, 3, P.orange + '10', P.orange + '30', 1);
                }

                var queenCol = step.board[r];
                if (queenCol === c) {
                    if (step.type === 'remove' && r === step.row && c === step.removedCol) {
                        ctx.save();
                        ctx.setLineDash([4, 3]);
                        ctx.beginPath();
                        ctx.arc(cx + cell / 2, cy + cell / 2, cell * 0.38, 0, Math.PI * 2);
                        ctx.strokeStyle = P.orange + 'cc';
                        ctx.lineWidth = 2.2;
                        ctx.stroke();
                        ctx.restore();
                        tx('♛', cx + cell / 2, cy + cell / 2, mob ? 26 : 32, P.orange + '77', 'center', true);
                    } else {
                        var qCol = step.type === 'solution' ? P.green : (isCurRow ? P.orange : P.teal);
                        tx('♛', cx + cell / 2, cy + cell / 2, mob ? 26 : 32, qCol + 'ff', 'center', true);
                    }
                } else if (isCurRow && step.tried) {
                    var t = step.tried.filter(function (tt) { return tt.col === c; })[0];
                    if (t && !t.safe) {
                        tx('✕', cx + cell / 2, cy + cell / 2, mob ? 19 : 23, P.muted + 'ee', 'center', true);
                    }
                }
            }
        }

        for (var c2 = 0; c2 < N; c2++) {
            tx(String(c2), boardX + c2 * cell + cell / 2, top - (mob ? 15 : 17), mob ? 11 : 12.5, P.text + 'dd', 'center', true);
        }
        return headW + boardPx;
    }

    /* ===================== 탐색 트리 렌더 ===================== */
    function drawTree(x0, top, w, h, mob, step) {
        var revealedSet = {};
        (step.revealed || []).forEach(function (id) { revealedSet[id] = true; });

        var activePath = {};
        if (step.curId != null) {
            var cur = step.curId;
            while (cur != null) { activePath[cur] = true; cur = TREE.byId[cur].parentId; }
        }

        var levels = N + 1;
        var colW = w / Math.max(1, TREE.leafCount);
        var rowH = h / levels;

        function nodePx(n) {
            return { x: x0 + (n.x + 0.5) * colW, y: top + n.row * rowH + rowH / 2 };
        }

        TREE.nodes.forEach(function (n) {
            if (n.parentId == null || !revealedSet[n.id]) return;
            var parent = TREE.byId[n.parentId];
            var p1 = nodePx(parent), p2 = nodePx(n);
            var onActive = activePath[n.id] && activePath[n.parentId];
            var onSol = n.onSolutionPath && revealedSet[n.id];
            var eCol = onActive ? P.orange : (onSol ? P.green : P.muted);
            var eAlpha = onActive ? 'ee' : (onSol ? 'cc' : '55');
            var eLw = onActive ? 2.8 : (onSol ? 2.2 : 1.3);
            line(p1.x, p1.y, p2.x, p2.y, eCol + eAlpha, eLw);
        });

        TREE.nodes.forEach(function (n) {
            if (!revealedSet[n.id]) return;
            var p = nodePx(n);
            var isCur = step.curId === n.id;
            var r = mob ? 15 : 18;
            var col = P.muted, label = n.col != null ? String(n.col) : '·';
            if (n.type === 'deadend') { col = P.muted; label = '✕'; }
            if (n.type === 'solution') { col = P.green; label = '✓'; }
            if (n.onSolutionPath && n.type !== 'solution') col = P.green;
            if (n.type === 'place' && !n.onSolutionPath) col = P.teal;
            if (isCur) col = P.orange;

            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = col + '28';
            ctx.fill();
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = isCur ? 2.4 : 1.6;
            ctx.stroke();
            tx(label, p.x, p.y, mob ? 12 : 13.5, col + 'ff', 'center', true);
            var rowLabel = n.type === 'solution' ? '완성' : ('행' + n.row);
            tx(rowLabel, p.x + r * 0.85, p.y - r * 0.85, mob ? 11 : 13, P.text + 'aa', 'left', true);
        });
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        var cell = mob ? 44 : 56;
        var headW = mob ? 40 : 48;
        return {
            top:      mob ? 18 : 24,
            boardTopPad: mob ? 24 : 28,
            boardPx:  cell * N,
            headW:    headW,
            treeH:    mob ? 260 : 320,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        if (mode === 'board') return L.top + L.boardTopPad + L.boardPx + L.top;
        return L.top + L.treeH + L.top;
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

        if (mode === 'board') {
            var boardX0 = (W - (L.headW + L.boardPx)) / 2;
            drawBoard(boardX0, L.top + L.boardTopPad, mob, step, L.headW);
        } else {
            var padX = mob ? 16 : 28;
            drawTree(padX, L.top, W - padX * 2, L.treeH, mob, step);
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
                    timer = setTimeout(tick, speed * 0.32);
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
        speedBtns.forEach(function (b) { b.classList.remove('backtracking-viz__speed-btn--active'); });
        btn.classList.add('backtracking-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('backtracking-viz__mode-btn--active', d.key === m);
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