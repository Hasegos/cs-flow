/**
 * 백트래킹(Backtracking) 시각화 시각화
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
        { key: 'tree', label: '탐색 트리' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'board';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'tree' ? TREE_STEPS : BOARD_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var cell = mob ? 44 : 56;
        var boardPx = cell * N;
        var colLabelH = mob ? 18 : 22;
        var gap = mob ? 12 : 14;
        var stripH = mob ? 24 : 26;
        var levelH = mob ? 40 : 52;
        var boardTotal = colLabelH + boardPx + gap + stripH;
        var treeTotal = (N + 1) * levelH + gap + stripH;
        return {
            cell: cell, headW: mob ? 40 : 48, boardPx: boardPx, colLabelH: colLabelH,
            gap: gap, stripH: stripH, levelH: levelH, gutter: mob ? 34 : 44,
            fs: mob ? 11 : 12.5, total: mode === 'tree' ? treeTotal : boardTotal
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 보드 장면 ===================== */
    function abtDrawBoard(x0, top, w, mob, L, s, steps, fresh, t) {
        var pr = function (a, b) { return fresh ? seg(t, a, b) : 1; };
        var cell = L.cell;
        var fs = L.fs;
        var boardW = L.headW + L.boardPx;
        var bx = x0 + (w - boardW) / 2 + L.headW;
        var by = top + L.colLabelH;
        var ax = function (c) { return bx + c * cell + cell / 2; };
        var ay = function (r) { return by + r * cell + cell / 2; };
        var tries = s.tried || [];
        var nT = tries.length;
        var tAt = function (i) { return pr(0.1 + 0.4 * i / nT, 0.1 + 0.4 * (i + 1) / nT); };
        var r, c, i;

        for (r = 0; r < N; r++) {
            tx('행' + r, x0 + (w - boardW) / 2 + L.headW / 2, ay(r), fs, P.text + 'dd', 'center', true);
        }
        for (c = 0; c < N; c++) {
            tx(String(c), ax(c), top + L.colLabelH / 2, fs, P.text + 'dd', 'center', true);
        }
        for (r = 0; r < N; r++) {
            for (c = 0; c < N; c++) {
                var baseCol = ((r + c) % 2 === 0) ? P.muted + '0a' : P.muted + '16';
                rr(bx + c * cell, by + r * cell, cell - 2, cell - 2, 3, baseCol, P.muted + '30', 1);
            }
        }
        if (s.row >= 0 && s.row < N) {
            ctx.globalAlpha = pr(0, 0.2);
            rr(bx, by + s.row * cell, L.boardPx - 2, cell - 2, 3, P.orange + '14', P.orange + '55', 1.2);
            ctx.globalAlpha = 1;
        }
        if (s.type === 'backtrack' && s.row > 0) {
            ctx.globalAlpha = pr(0.6, 1);
            ctx.setLineDash([5, 4]);
            rr(bx, by + (s.row - 1) * cell, L.boardPx - 2, cell - 2, 3, 'none', P.orange + 'ff', 1.8);
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
        for (i = 0; i < nT; i++) {
            var tr = tries[i];
            if (tr.safe) continue;
            var la = tAt(i);
            var x1 = ax(tr.col), y1 = ay(s.row);
            var x2 = ax(s.board[tr.conflictRow]), y2 = ay(tr.conflictRow);
            ctx.globalAlpha = la;
            ln(x1, y1, x1 + (x2 - x1) * la, y1 + (y2 - y1) * la, P.red + 'cc', 2, tr.reason === 'diag' ? [5, 4] : []);
            ctx.globalAlpha = 1;
        }
        if (fresh && nT > 0 && (s.type === 'place' || s.type === 'backtrack')) {
            var fi = seg(t, 0, 0.5) * (nT - 1);
            var i0 = Math.floor(fi), i1 = Math.min(nT - 1, i0 + 1);
            var cc = lerp(tries[i0].col, tries[i1].col, fi - i0);
            ctx.globalAlpha = 1 - pr(0.45, 0.6);
            rr(bx + cc * cell + 1, by + s.row * cell + 1, cell - 4, cell - 4, 4, 'none', P.yellow + 'cc', 1.8);
            ctx.globalAlpha = 1;
        }
        for (r = 0; r < N; r++) {
            var qc = s.board[r];
            if (qc < 0) continue;
            var qx = ax(qc), qy = ay(r), qs = mob ? 26 : 32;
            if (s.type === 'remove' && r === s.row) {
                var va = 1 - pr(0, 0.6);
                ctx.globalAlpha = va;
                tx('♛', qx, qy - 14 * (1 - va), qs, P.orange + 'ff', 'center', true);
                ctx.globalAlpha = va * pr(0, 0.25);
                ctx.setLineDash([4, 3]);
                circ(qx, qy, cell * 0.38, 'none', P.orange + 'ff', 2.2);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
                continue;
            }
            if (s.type === 'solution') {
                var sg = pr(0, 0.5);
                ctx.globalAlpha = 1 - sg;
                tx('♛', qx, qy, qs, P.teal + 'ff', 'center', true);
                ctx.globalAlpha = sg;
                tx('♛', qx, qy, qs, P.green + 'ff', 'center', true);
                ctx.globalAlpha = sg * 0.4;
                circ(qx, qy, cell * 0.42, 'none', P.green + 'ff', 2);
                ctx.globalAlpha = 1;
                continue;
            }
            var isNew = s.type === 'place' && r === s.row;
            var qa = isNew ? pr(0.5, 0.7) : 1;
            var qy2 = isNew ? qy - (1 - ez(pr(0.5, 1))) * cell * 0.9 : qy;
            ctx.globalAlpha = qa;
            tx('♛', qx, qy2, qs, (r === s.row ? P.orange : P.teal) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        for (i = 0; i < nT; i++) {
            if (tries[i].safe) continue;
            ctx.globalAlpha = tAt(i);
            tx('✕', ax(tries[i].col), ay(s.row), mob ? 19 : 23, P.red + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;

        var sy = by + L.boardPx + L.gap;
        var solAll = BOARD_STEPS.filter(function (x) { return x.type === 'solution'; }).length;
        var si = steps.indexOf(s), found = 0;
        for (var k = 0; k <= si; k++) { if (steps[k].type === 'solution') found++; }
        tx('찾은 정답 ' + found + ' / ' + solAll, x0 + w / 2, sy + L.stripH / 2, fs,
            (found === solAll ? P.green : P.sub) + 'ff', 'center', true);
    }

    /* ===================== 트리 장면 ===================== */
    function abtDrawTree(x0, top, w, mob, L, s, p, fresh, t) {
        var pr = function (a, b) { return fresh ? seg(t, a, b) : 1; };
        var fs = L.fs;
        var tx0 = x0 + L.gutter;
        var tw = w - L.gutter - 8;
        var colW = tw / Math.max(1, TREE.leafCount);
        var rad0 = Math.min(mob ? 12 : 16, colW * 0.42);
        var lh = L.levelH;
        var newId = fresh && s.curId != null ? s.curId : null;
        var revealed = {};
        (s.revealed || []).forEach(function (id) { revealed[id] = true; });
        var path = {};
        if (s.curId != null) {
            var cur = s.curId;
            while (cur != null) { path[cur] = true; cur = TREE.byId[cur].parentId; }
        }
        var posOf = function (nd) { return { x: tx0 + (nd.x + 0.5) * colW, y: top + nd.row * lh + lh / 2 }; };

        TREE.nodes.forEach(function (nd) {
            if (nd.parentId == null || !revealed[nd.id]) return;
            var a = posOf(TREE.byId[nd.parentId]), b = posOf(nd);
            var g = nd.id === newId ? pr(0, 0.5) : 1;
            var onAct = path[nd.id] && path[nd.parentId];
            var eCol = onAct ? P.orange : (nd.onSolutionPath ? P.green : P.muted);
            var eA = onAct ? 'ee' : (nd.onSolutionPath ? 'cc' : '55');
            var eLw = onAct ? 2.8 : (nd.onSolutionPath ? 2.2 : 1.3);
            ln(a.x, a.y, a.x + (b.x - a.x) * g, a.y + (b.y - a.y) * g, eCol + eA, eLw);
        });

        TREE.nodes.forEach(function (nd) {
            if (!revealed[nd.id]) return;
            var q = posOf(nd);
            var isNew = nd.id === newId;
            var g = isNew ? ez(pr(0.4, 1)) : 1;
            var isCur = s.curId === nd.id;
            var col = P.muted, label = nd.col != null ? String(nd.col) : '·';
            if (nd.type === 'deadend') label = '✕';
            if (nd.type === 'solution') { col = P.green; label = '✓'; }
            if (nd.onSolutionPath && nd.type !== 'solution') col = P.green;
            if (nd.type === 'place' && !nd.onSolutionPath) col = P.teal;
            if (isCur) col = P.orange;
            ctx.globalAlpha = g;
            ctx.beginPath();
            ctx.arc(q.x, q.y, rad0 * (0.6 + 0.4 * g), 0, Math.PI * 2);
            ctx.fillStyle = col + '28';
            ctx.fill();
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = isCur ? 2.4 : 1.6;
            ctx.stroke();
            tx(label, q.x, q.y, mob ? 12 : 13.5, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        for (var lv = 0; lv <= N; lv++) {
            tx(lv === N ? '완성' : '행' + lv, x0 + 2, top + lv * lh + lh / 2, fs, P.text + 'dd', 'left', true);
        }

        var sy = top + (N + 1) * lh + L.gap;
        var sh = L.stripH;
        var cw = mob ? 22 : 26;
        var cg = mob ? 5 : 6;
        var cx0 = x0 + (mob ? 30 : 40);
        var curB = s.curId != null ? TREE.byId[s.curId].board : null;
        var prevB = p.curId != null ? TREE.byId[p.curId].board : null;
        var chip = function (i, val, a) {
            var x = cx0 + i * (cw + cg), y = sy + (sh - cw) / 2;
            if (val < 0) { rr(x, y, cw, cw, 4, 'none', P.muted + '66', 1.2); return; }
            ctx.globalAlpha = a;
            rr(x, y, cw, cw, 4, P.teal + '30', P.teal + 'ff', 1.4);
            tx(String(val), x + cw / 2, y + cw / 2, fs, P.teal + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        };
        tx('배치', x0, sy + sh / 2, fs, P.sub + 'ff', 'left', true);
        for (var ci = 0; ci < N; ci++) {
            var cv = curB ? curB[ci] : -1;
            var pv = prevB ? prevB[ci] : -1;
            if (fresh && cv !== pv) {
                if (pv >= 0) chip(ci, pv, 1 - pr(0, 0.5));
                if (cv >= 0) chip(ci, cv, pr(0.4, 1));
                else chip(ci, -1, 1);
            } else {
                chip(ci, cv, 1);
            }
        }
        tx('가지 ' + (s.revealed || []).length + ' / ' + TREE.nodes.length, x0 + w, sy + sh / 2, fs, P.sub + 'ff', 'right', true);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var tt = clamp01(t);
        var L = layout(w, mob);
        if (mode === 'tree') {
            abtDrawTree(x0, top, w, mob, L, s, p, fresh, tt);
        } else {
            abtDrawBoard(x0, top, w, mob, L, s, steps, fresh, tt);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('backtracking-viz__speed-btn--active'); });
        btn.classList.add('backtracking-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('backtracking-viz__mode-btn--active', d.key === m); });
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