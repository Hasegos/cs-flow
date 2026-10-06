/**
 * 플로이드-워셜 시각화
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
    var root    = el('div', 'fw-viz');
    var toolbar = el('div', 'fw-viz__toolbar');
    var tbLeft  = el('div', 'fw-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'fw-viz__title', 'FLOYD-WARSHALL'));

    var modeWrap = el('div', 'fw-viz__mode');
    var modeDefs = [
        { key: 'matrix', label: '거리 행렬 갱신' },
        { key: 'cell', label: '한 칸 계산' },
        { key: 'path', label: '경로 복원' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'fw-viz__mode-btn' + (i === 0 ? ' fw-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'fw-viz__speed');
    speedWrap.appendChild(el('span', 'fw-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'fw-viz__speed-btn' + (i === 0 ? ' fw-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'fw-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'fw-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'fw-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'fw-viz__controls');
    var btnPlay  = el('button', 'fw-viz__btn fw-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'fw-viz__btn', '▶| STEP');
    var btnReset = el('button', 'fw-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 플로이드-워셜 ===================== */
    var N = 4;
    var NAMES = ['A', 'B', 'C', 'D'];
    var POS = [[0.1, 0.2], [0.9, 0.2], [0.9, 0.8], [0.1, 0.8]];
    var EDGES = [[0, 1, 3], [0, 3, 7], [1, 0, 8], [1, 2, 2], [2, 0, 5], [2, 3, 1], [3, 0, 2]];
    var INF = 1000000000;
    function fmt(x) {
        return x >= INF ? '∞' : String(x);
    }
    function cloneM(m) {
        return m.map(function (r) { return r.slice(); });
    }
    function initDist() {
        var d = [];
        var i;
        var j;
        for (i = 0; i < N; i++) {
            d.push([]);
            for (j = 0; j < N; j++) d[i].push(i === j ? 0 : INF);
        }
        EDGES.forEach(function (e) { d[e[0]][e[1]] = e[2]; });
        return d;
    }
    function initNext() {
        var n = [];
        var i;
        var j;
        for (i = 0; i < N; i++) {
            n.push([]);
            for (j = 0; j < N; j++) n[i].push(-1);
        }
        EDGES.forEach(function (e) { n[e[0]][e[1]] = e[1]; });
        return n;
    }
    function allowedText(k) {
        if (k < 0) return '거치는 정점 없음 (직접 간선만)';
        return '거치는 정점 ' + NAMES.slice(0, k + 1).join(', ') + '까지 허용';
    }
    function mstep(kind, mat, k, cur, cand, changed, hotV, hotE, mlabel, cap, cap2, cap3, log) {
        return { kind: kind, mat: cloneM(mat), k: k, cur: cur, cand: cand, changed: changed, hotV: hotV, hotE: hotE, mlabel: mlabel, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function edgeIdx(u, v) {
        var i;
        for (i = 0; i < EDGES.length; i++) if (EDGES[i][0] === u && EDGES[i][1] === v) return i;
        return -1;
    }
    function relaxCell(d, nx, i, j, k) {
        var via = d[i][k] + d[k][j];
        if (d[i][k] < INF && d[k][j] < INF && via < d[i][j]) {
            d[i][j] = via;
            nx[i][j] = nx[i][k];
            return true;
        }
        return false;
    }
    function viaText(d, i, j, k) {
        return NAMES[i] + ' → ' + NAMES[j] + ': ' + 'd[' + NAMES[i] + '][' + NAMES[k] + '] + d[' + NAMES[k] + '][' + NAMES[j] + '] = ' + fmt(d[i][k]) + ' + ' + fmt(d[k][j]);
    }

    /* ===================== 데이터: 거리 행렬 갱신 ===================== */
    var MAT_STEPS = [];
    var FINAL_D = null;
    var FINAL_N = null;
    (function () {
        var d = initDist();
        var nx = initNext();
        var k;
        MAT_STEPS.push(mstep('dist', d, -1, null, [], [], [], [], allowedText(-1), '시작: 직접 이어진 거리만', '이어지지 않은 칸은 ∞, 자기 자신은 0', '', '플로이드-워셜은 모든 정점 쌍 사이의 최단 거리를 한 번에 구합니다. 거리 행렬 d[i][j]에서 시작해, 경유지 k를 A, B, C, D 순서로 하나씩 허용하며 "i에서 j로 바로 가는 것보다 k를 거쳐 가는 것이 짧은가"를 모든 칸에서 확인합니다. 지금은 직접 이어진 간선의 가중치만 들어 있습니다.'));
        for (k = 0; k < N; k++) {
            var changed = [];
            var lines = [];
            var i;
            var j;
            for (i = 0; i < N; i++) {
                for (j = 0; j < N; j++) {
                    if (i === j || i === k || j === k) continue;
                    var before = d[i][j];
                    var text = viaText(d, i, j, k);
                    if (relaxCell(d, nx, i, j, k)) {
                        changed.push([i, j]);
                        lines.push(text + ' = ' + d[i][j] + ' < ' + fmt(before) + ' → 갱신');
                    }
                }
            }
            MAT_STEPS.push(mstep('dist', d, k, null, [], changed, [k], [], allowedText(k), '경유지 ' + NAMES[k] + ' 허용', changed.length ? changed.length + '칸 갱신 (노란색)' : '갱신된 칸 없음', '', '경유지 ' + NAMES[k] + '를 허용해 모든 칸을 확인했습니다. ' + (lines.length ? lines.join('; ') + '.' : '갱신된 칸이 없습니다.') + ' ' + NAMES[k] + ' 행과 열은 ' + NAMES[k] + '를 거치는 경로의 두 토막이라 이번 단계에서 바뀌지 않습니다.'));
        }
        FINAL_D = cloneM(d);
        FINAL_N = cloneM(nx);
        MAT_STEPS.push(mstep('dist', d, N - 1, null, [], [], [], [], allowedText(N - 1), '모든 쌍의 최단 거리 완성', '경유지 ' + N + '개를 모두 허용', '', '정리 — 경유지를 하나씩 늘려 가며 모든 칸을 갱신한 결과가 모든 정점 쌍의 최단 거리입니다. 경유지 N개, 출발지 N개, 도착지 N개의 삼중 반복이라 O(V³)입니다. 예를 들어 A → D는 직접 7이지만 A → B → C → D로 3 + 2 + 1 = 6이 됩니다.'));
    })();

    /* ===================== 데이터: 한 칸 계산 ===================== */
    var CELL_STEPS = [];
    (function () {
        var d = initDist();
        var nx = initNext();
        var K = 2;
        var k;
        var i;
        var j;
        for (k = 0; k < K; k++) {
            for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (i !== j && i !== k && j !== k) relaxCell(d, nx, i, j, k);
        }
        CELL_STEPS.push(mstep('dist', d, -1, null, [], [], [K], [], allowedText(K - 1), '경유지 ' + NAMES[K] + '를 새로 허용', NAMES[K] + ' 행과 열을 거치는 합으로 비교', '', '경유지 A, B까지 허용한 거리 행렬에서, 경유지 ' + NAMES[K] + '를 새로 허용했을 때 각 칸이 어떻게 바뀌는지 한 칸씩 봅니다. 칸 d[i][j]는 기존 값과 d[i][' + NAMES[K] + '] + d[' + NAMES[K] + '][j] 중 작은 값으로 정해집니다. ' + NAMES[K] + '가 출발이나 도착인 칸과 대각선은 바뀔 일이 없어 건너뜁니다.'));
        var cnt = 0;
        var gained = [];
        for (i = 0; i < N; i++) {
            for (j = 0; j < N; j++) {
                if (i === j || i === K || j === K) continue;
                var text = viaText(d, i, j, K);
                var cand = d[i][K] + d[K][j];
                var old = d[i][j];
                var hit = relaxCell(d, nx, i, j, K);
                cnt++;
                if (hit) gained.push(NAMES[i] + ' → ' + NAMES[j]);
                CELL_STEPS.push(mstep('dist', d, K, [i, j], [[i, K], [K, j]], hit ? [[i, j]] : [], [K, i, j], [], allowedText(K - 1) + ' → ' + NAMES[K] + ' 추가', NAMES[i] + ' → ' + NAMES[j] + ' 확인', hit ? '경유 ' + cand + ' < 기존 ' + fmt(old) + ' → 갱신' : '경유 ' + cand + ' ≥ 기존 ' + fmt(old) + ' → 그대로', '', text + ' = ' + cand + ', 기존 d[' + NAMES[i] + '][' + NAMES[j] + '] = ' + fmt(old) + '. ' + (hit ? cand + ' < ' + fmt(old) + '이므로 ' + NAMES[K] + '를 거치는 쪽으로 바꿉니다.' : cand + ' ≥ ' + fmt(old) + '이므로 그대로 둡니다.')));
            }
        }
        CELL_STEPS.push(mstep('dist', d, K, null, [], [], [], [], allowedText(K), '경유지 ' + NAMES[K] + ' 단계 끝', cnt + '칸 중 ' + gained.length + '칸 갱신', '', '정리 — 경유지 ' + NAMES[K] + '를 허용하자 ' + gained.join(', ') + ' ' + gained.length + '칸이 줄었습니다. 이 확인을 경유지마다 모든 칸에 하므로 O(V³)입니다. 경유지 k를 가장 바깥 반복문으로 두어야 하며, 순서를 바꾸면 결과가 틀릴 수 있습니다.'));
    })();

    /* ===================== 데이터: 경로 복원 ===================== */
    var PATH_STEPS = [];
    (function () {
        var nx = FINAL_N;
        var S = 0;
        var T = 3;
        var path = [S];
        var cur = S;
        PATH_STEPS.push(mstep('next', nx, -1, null, [], [], [S, T], [], 'next[i][j] = i에서 j로 갈 때 i 다음 정점', NAMES[S] + ' → ' + NAMES[T] + ' 경로 복원', '거리 d[' + NAMES[S] + '][' + NAMES[T] + '] = ' + FINAL_D[S][T], '', '거리만으로는 어떤 길로 가는지 알 수 없습니다. 거리를 갱신할 때 next[i][j]도 next[i][k]로 함께 바꿔 두면, "i에서 j로 가려면 먼저 어디로 가는가"가 행렬에 남습니다. next[' + NAMES[S] + '][' + NAMES[T] + ']부터 따라가며 ' + NAMES[S] + ' → ' + NAMES[T] + ' 경로를 복원합니다. 이 행렬은 갱신이 모두 끝난 뒤의 값입니다.'));
        while (cur !== T) {
            var nxt = nx[cur][T];
            var hot = [];
            path.push(nxt);
            var p;
            for (p = 0; p + 1 < path.length; p++) hot.push(edgeIdx(path[p], path[p + 1]));
            PATH_STEPS.push(mstep('next', nx, -1, [cur, T], [], [], path.slice(), hot, 'next[i][j] = i에서 j로 갈 때 i 다음 정점', 'next[' + NAMES[cur] + '][' + NAMES[T] + '] = ' + NAMES[nxt], '경로: ' + path.map(function (v) { return NAMES[v]; }).join(' → '), nxt === T ? NAMES[T] + ' 도착' : '', NAMES[cur] + '에서 ' + NAMES[T] + '로 가려면 next[' + NAMES[cur] + '][' + NAMES[T] + '] = ' + NAMES[nxt] + '이므로 먼저 ' + NAMES[nxt] + '로 갑니다. ' + (nxt === T ? NAMES[T] + '에 도착했습니다.' : NAMES[nxt] + '에서 같은 방법으로 이어 갑니다.')));
            cur = nxt;
        }
        var w = 0;
        var p2;
        for (p2 = 0; p2 + 1 < path.length; p2++) w += EDGES[edgeIdx(path[p2], path[p2 + 1])][2];
        PATH_STEPS.push(mstep('next', nx, -1, null, [], [], path.slice(), (function () { var h = []; var q; for (q = 0; q + 1 < path.length; q++) h.push(edgeIdx(path[q], path[q + 1])); return h; })(), 'next[i][j] = i에서 j로 갈 때 i 다음 정점', path.map(function (v) { return NAMES[v]; }).join(' → '), '간선 가중치 합 ' + w + ' = d[' + NAMES[S] + '][' + NAMES[T] + ']', '', '정리 — 경로 ' + path.map(function (v) { return NAMES[v]; }).join(' → ') + '의 간선 가중치를 더한 합은 ' + w + '이고, 이는 거리 d[' + NAMES[S] + '][' + NAMES[T] + '] = ' + FINAL_D[S][T] + ' 값 그대로입니다. 경로 길이만큼만 next를 따라가면 되므로 모든 쌍의 경로를 거리 행렬과 같은 크기의 행렬 하나로 저장할 수 있습니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'matrix';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cell') return CELL_STEPS;
        if (mode === 'path') return PATH_STEPS;
        return MAT_STEPS;
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

    /* ===================== 공통: 그래프와 행렬 그리기 ===================== */
    function drawFW(x0, top, w, mob, step) {
        var mat = step ? step.mat : initDist();
        var kind = step ? step.kind : 'dist';
        var k = step ? step.k : -1;
        var cur = step ? step.cur : null;
        var cand = step ? step.cand : [];
        var changed = step ? step.changed : [];
        var hotV = step ? step.hotV : [];
        var hotE = step ? step.hotE : [];
        var fs = mob ? 11.5 : 13;
        var r = mob ? 17 : 20;
        var gh = mob ? 150 : 190;
        var gbox = Math.min(w, 340);
        var gx = x0 + (w - gbox) / 2 + r + 24;
        var gw = gbox - 2 * (r + 24);
        var gy0 = top + r + 6;
        var gih = gh - 2 * r - 12;
        function px(v) { return gx + POS[v][0] * gw; }
        function py(v) { return gy0 + POS[v][1] * gih; }
        var i;
        var j;
        EDGES.forEach(function (e, idx) {
            var ax = px(e[0]);
            var ay = py(e[0]);
            var bx = px(e[1]);
            var by = py(e[1]);
            var ang = Math.atan2(by - ay, bx - ax);
            var nxv = -Math.sin(ang) * 7;
            var nyv = Math.cos(ang) * 7;
            var sx = ax + nxv + Math.cos(ang) * r;
            var sy = ay + nyv + Math.sin(ang) * r;
            var ex = bx + nxv - Math.cos(ang) * (r + 2);
            var ey = by + nyv - Math.sin(ang) * (r + 2);
            var isHot = hotE.indexOf(idx) >= 0;
            var color = isHot ? P.green + 'ff' : P.sub + 'aa';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = color;
            ctx.lineWidth = isHot ? 3 : 1.6;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4));
            ctx.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4));
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            tx(String(e[2]), (sx + ex) / 2 + nxv * 1.7, (sy + ey) / 2 + nyv * 1.7, fs, isHot ? P.green + 'ff' : P.text + 'ff', 'center', true);
        });
        for (i = 0; i < N; i++) {
            var isHotV = hotV.indexOf(i) >= 0;
            var base = kind === 'next' ? (isHotV ? P.green : P.sub) : (isHotV && i === k ? P.yellow : isHotV ? P.teal : P.sub);
            ctx.beginPath();
            ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
            ctx.fillStyle = isHotV ? base + '44' : P.surf2;
            ctx.fill();
            ctx.strokeStyle = base + 'ff';
            ctx.lineWidth = isHotV ? 3 : 1.8;
            ctx.stroke();
            tx(NAMES[i], px(i), py(i), fs + 1, P.text + 'ff', 'center', true);
        }
        var cw = Math.min(58, (w - 8) / (N + 1));
        var rh = mob ? 27 : 30;
        var mx = x0 + (w - cw * (N + 1)) / 2;
        var my = top + gh + 24;
        if (step && step.mlabel) tx(step.mlabel, x0 + w / 2, my - 11, fs - 1, P.sub + 'ee', 'center', true);
        for (i = -1; i < N; i++) {
            for (j = -1; j < N; j++) {
                var cx0 = mx + (j + 1) * cw;
                var cy0 = my + (i + 1) * rh;
                if (i < 0 && j < 0) continue;
                if (i < 0 || j < 0) {
                    tx(NAMES[i < 0 ? j : i], cx0 + cw / 2, cy0 + rh / 2, fs, P.sub + 'ff', 'center', true);
                    continue;
                }
                var isCur = cur && cur[0] === i && cur[1] === j;
                var isCh = changed.some(function (c) { return c[0] === i && c[1] === j; });
                var isCand = cand.some(function (c) { return c[0] === i && c[1] === j; });
                var onK = k >= 0 && kind === 'dist' && (i === k || j === k) && (cur || changed.length);
                var fill = isCh ? P.yellow + '44' : isCand ? P.teal + '44' : onK ? P.teal + '18' : 'none';
                var stroke = isCur ? P.yellow + 'ff' : isCh ? P.yellow + 'ff' : isCand ? P.teal + 'ff' : P.sub + '66';
                rr(cx0 + 1.5, cy0 + 1.5, cw - 3, rh - 3, 3, fill, stroke, isCur ? 2.6 : isCh || isCand ? 1.8 : 1);
                var v = mat[i][j];
                var label = kind === 'next' ? (v < 0 ? '-' : NAMES[v]) : fmt(v);
                tx(label, cx0 + cw / 2, cy0 + rh / 2, fs, isCh ? P.yellow + 'ff' : P.text + 'ff', 'center', true);
            }
        }
        var at = my + (N + 1) * rh + 18;
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

        drawFW(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 플로이드-워셜의 동작을 확인하세요.';
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
        neededH = mob ? 410 : 460;
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
        if (mode === 'cell') return '경유지 하나를 새로 허용했을 때 각 칸을 어떻게 비교하는지 봅니다.';
        if (mode === 'path') return '거리 행렬과 함께 저장한 next 행렬로 실제 경로를 복원하는 과정을 봅니다.';
        return '경유지를 하나씩 허용하며 모든 정점 쌍의 거리를 갱신하는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('fw-viz__speed-btn--active'); });
        btn.classList.add('fw-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('fw-viz__mode-btn--active', d.key === m); });
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