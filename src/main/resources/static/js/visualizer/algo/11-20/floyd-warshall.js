/**
 * 플로이드-워셜 시각화 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'matrix';
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
    function currentSteps() {
        if (mode === 'cell') return CELL_STEPS;
        if (mode === 'path') return PATH_STEPS;
        return MAT_STEPS;
    }
    function defaultLog() {
        if (mode === 'cell') return '경유지 하나를 새로 허용했을 때 각 칸을 어떻게 비교하는지 봅니다.';
        if (mode === 'path') return '거리 행렬과 함께 저장한 next 행렬로 실제 경로를 복원하는 과정을 봅니다.';
        return '경유지를 하나씩 허용하며 모든 정점 쌍의 거리를 갱신하는 과정을 봅니다.';
    }

    /* ===================== 공용 계산 ===================== */
    function ez(q) {
        var v = clamp01(q);
        return v * v * (3 - 2 * v);
    }
    function fwVal(v, isNext) {
        if (isNext) return v < 0 ? '-' : NAMES[v];
        return fmt(v);
    }
    function fwHas(list, i, j) {
        var k;
        for (k = 0; k < list.length; k++) {
            if (list[k][0] === i && list[k][1] === j) return true;
        }
        return false;
    }

    /* ===================== 레이아웃 ===================== */
    var fwMemo = {};
    function fwSize(mob) {
        if (mob) return { fs: 11.5, fsS: 11, lhS: 14, gh: 118, rh: 23, nr: 13 };
        return { fs: 13, fsS: 12, lhS: 16, gh: 142, rh: 28, nr: 16 };
    }
    function fwLines(str, w, fs) {
        return str ? lines(str, w, fs).length : 0;
    }
    function layout(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (fwMemo[key]) return fwMemo[key];
        var z = fwSize(mob);
        var labN = 0;
        var capH = 0;
        MAT_STEPS.concat(CELL_STEPS, PATH_STEPS).forEach(function (s) {
            labN = Math.max(labN, fwLines(s.mlabel, w - 8, z.fsS));
            var h = fwLines(s.cap, w - 8, z.fs) * (z.fs + 5)
                + (fwLines(s.cap2, w - 8, z.fsS) + fwLines(s.cap3, w - 8, z.fsS)) * (z.fsS + 4);
            capH = Math.max(capH, h);
        });
        var L = { fs: z.fs, fsS: z.fsS, lhS: z.lhS, gh: z.gh, rh: z.rh, nr: z.nr };
        L.mTop = z.gh + 4 + labN * z.lhS + 6;
        L.capTop = L.mTop + 5 * z.rh + 10;
        L.total = L.capTop + capH + 6;
        fwMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그래프 ===================== */
    function fwPt(x0, w, top, L, v) {
        var gbw = Math.min(w, 300);
        var gx = x0 + (w - gbw) / 2;
        var padX = L.nr + 10;
        var padY = L.nr + 4;
        return {
            x: gx + padX + POS[v][0] * (gbw - 2 * padX),
            y: top + padY + POS[v][1] * (L.gh - 2 * padY)
        };
    }
    function fwEdge(x0, w, top, L, idx, s, p, fresh, e) {
        var ed = EDGES[idx];
        var a = fwPt(x0, w, top, L, ed[0]);
        var b = fwPt(x0, w, top, L, ed[1]);
        var ang = Math.atan2(b.y - a.y, b.x - a.x);
        var rev = EDGES.some(function (f) { return f[0] === ed[1] && f[1] === ed[0]; });
        var lo = rev ? 6 : 0;
        var ox = -Math.sin(ang) * lo;
        var oy = Math.cos(ang) * lo;
        var sx = a.x + ox + Math.cos(ang) * L.nr;
        var sy = a.y + oy + Math.sin(ang) * L.nr;
        var ex = b.x + ox - Math.cos(ang) * (L.nr + 3);
        var ey = b.y + oy - Math.sin(ang) * (L.nr + 3);
        var hot = s.hotE.indexOf(idx) >= 0;
        var grow = hot && fresh && p.hotE.indexOf(idx) < 0 ? ez(seg(e, 0.1, 0.8)) : 1;
        var col = hot ? P.green + 'ff' : P.sub + 'aa';
        var lw = hot ? 3 : 1.6;
        if (grow >= 1) arrow(sx, sy, ex, ey, col, lw);
        else ln(sx, sy, lerp(sx, ex, grow), lerp(sy, ey, grow), col, lw);
        var hx = (sx + ex) / 2;
        var hy = (sy + ey) / 2;
        var lx = hx + ox * 2;
        var ly = hy + oy * 2;
        if (!rev) {
            var vx = hx - (x0 + w / 2);
            var vy = hy - (top + L.gh / 2);
            var len = Math.sqrt(vx * vx + vy * vy);
            if (len > 1) {
                lx = hx + vx / len * 11;
                ly = hy + vy / len * 11;
            } else {
                lx = hx;
                ly = hy;
            }
        }
        tx(String(ed[2]), lx, ly, L.fs, (hot ? P.green : P.text) + 'ff', 'center', true);
    }
    function fwRoute(x0, w, top, L, s, fresh, e) {
        if (s.kind !== 'dist' || !s.cur || s.k < 0) return;
        var a = fwPt(x0, w, top, L, s.cur[0]);
        var m = fwPt(x0, w, top, L, s.k);
        var b = fwPt(x0, w, top, L, s.cur[1]);
        var f = fresh ? seg(e, 0, 0.6) : 1;
        var f1 = clamp01(f * 2);
        var f2 = clamp01(f * 2 - 1);
        var col = P.purple + 'ff';
        ln(a.x, a.y, lerp(a.x, m.x, f1), lerp(a.y, m.y, f1), col, 2, [4, 3]);
        if (f2 > 0) ln(m.x, m.y, lerp(m.x, b.x, f2), lerp(m.y, b.y, f2), col, 2, [4, 3]);
    }
    function fwNodes(x0, w, top, L, s, fresh, e) {
        var kHot = s.kind === 'dist' && s.hotV.length ? s.hotV[0] : -1;
        var i;
        for (i = 0; i < N; i++) {
            var q = fwPt(x0, w, top, L, i);
            var fill = P.surf2;
            var stroke = P.sub + 'ff';
            var lw = 1.8;
            if (s.kind === 'next' && s.hotV.indexOf(i) >= 0) {
                fill = P.green + '44'; stroke = P.green + 'ff'; lw = 3;
            } else if (i === kHot) {
                fill = P.yellow + '44'; stroke = P.yellow + 'ff'; lw = 3;
                if (fresh && e < 1) {
                    ctx.globalAlpha = 1 - e;
                    circ(q.x, q.y, L.nr + 3 + 8 * ez(e), 'none', P.yellow + 'ff', 2);
                    ctx.globalAlpha = 1;
                }
            } else if (s.kind === 'dist' && s.hotV.indexOf(i) >= 0) {
                fill = P.teal + '44'; stroke = P.teal + 'ff'; lw = 3;
            }
            circ(q.x, q.y, L.nr, fill, stroke, lw);
            tx(NAMES[i], q.x, q.y, L.fs, P.text + 'ff', 'center', true);
        }
    }
    function fwGraph(x0, w, top, L, s, p, fresh, e) {
        var ed;
        for (ed = 0; ed < EDGES.length; ed++) fwEdge(x0, w, top, L, ed, s, p, fresh, e);
        fwRoute(x0, w, top, L, s, fresh, e);
        fwNodes(x0, w, top, L, s, fresh, e);
    }

    /* ===================== 행렬 ===================== */
    function fwMat(x0, top, w, L, s, p, fresh, e) {
        var cw = Math.min(54, w / 5);
        var rh = L.rh;
        var mx = x0 + (w - cw * (N + 1)) / 2;
        var my = top + L.mTop;
        var isNext = s.kind === 'next';
        var cellMode = mode === 'cell';
        var cellFinal = cellMode && s.cur === null && s.k >= 0;
        var ref = cellFinal ? CELL_STEPS[0].mat : p.mat;
        var chgA = fresh ? ez(seg(e, cellMode ? 0.6 : 0.3, cellMode ? 0.85 : 0.7)) : 1;
        var kNow = isNext ? -1 : s.k;
        var kPrev = fresh && !isNext ? p.k : kNow;
        var aNow = fresh ? ez(seg(e, 0, 0.3)) : 1;
        var i;
        var j;
        function cen(r, c) {
            return { x: mx + (c + 1) * cw + cw / 2, y: my + (r + 1) * rh + rh / 2 };
        }
        for (j = 0; j < N; j++) tx(NAMES[j], cen(-1, j).x, my + rh / 2, L.fs, P.sub + 'ff', 'center', true);
        for (i = 0; i < N; i++) {
            tx(NAMES[i], mx + cw / 2, cen(i, -1).y, L.fs, P.sub + 'ff', 'center', true);
            for (j = 0; j < N; j++) {
                var x = mx + (j + 1) * cw;
                var y = my + (i + 1) * rh;
                var nowV = s.mat[i][j];
                var oldV = ref[i][j];
                var chg = (cellFinal || fresh) && oldV !== nowV;
                var inK = kNow >= 0 && (i === kNow || j === kNow);
                var inOld = kPrev >= 0 && kPrev !== kNow && (i === kPrev || j === kPrev);
                var tint = 0;
                if (inK) tint = fresh && kPrev !== kNow ? aNow : 1;
                if (inOld) tint = Math.max(tint, 1 - aNow);
                if (tint > 0) {
                    ctx.globalAlpha = tint;
                    rr(x + 1.5, y + 1.5, cw - 3, rh - 3, 3, P.teal + '33', 'none', 1);
                    ctx.globalAlpha = 1;
                }
                if (fwHas(s.cand, i, j)) rr(x + 1.5, y + 1.5, cw - 3, rh - 3, 3, P.teal + '44', P.teal + 'ff', 1.8);
                else rr(x + 1.5, y + 1.5, cw - 3, rh - 3, 3, 'none', P.sub + '66', 1);
                if (chg) {
                    ctx.globalAlpha = chgA;
                    rr(x + 1.5, y + 1.5, cw - 3, rh - 3, 3, P.yellow + '44', P.yellow + 'ff', 1.8);
                    ctx.globalAlpha = 1 - chgA;
                    tx(fwVal(oldV, isNext), x + cw / 2, y + rh / 2, L.fs, P.sub + 'ff', 'center', true);
                    ctx.globalAlpha = chgA;
                    tx(fwVal(nowV, isNext), x + cw / 2, y + rh / 2, L.fs, P.yellow + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                } else {
                    tx(fwVal(nowV, isNext), x + cw / 2, y + rh / 2, L.fs, P.text + 'ff', 'center', true);
                }
                if (s.cur && s.cur[0] === i && s.cur[1] === j) {
                    rr(x + 1.5, y + 1.5, cw - 3, rh - 3, 3, 'none', P.purple + 'ff', 2.6);
                }
            }
        }
        if (cellMode && s.cur && fresh && s.cand.length === 2) {
            var ca = s.cand[0];
            var cb = s.cand[1];
            var sum = s.mat[ca[0]][ca[1]] + s.mat[cb[0]][cb[1]];
            var pa = cen(ca[0], ca[1]);
            var pb = cen(cb[0], cb[1]);
            var pt = cen(s.cur[0], s.cur[1]);
            var g = ez(seg(e, 0.05, 0.6));
            var chx = lerp((pa.x + pb.x) / 2, pt.x, g);
            var chy = lerp((pa.y + pb.y) / 2, pt.y, g);
            var fa = ez(seg(e, 0, 0.1)) * (1 - ez(seg(e, 0.6, 0.8)));
            if (fa > 0) {
                ctx.globalAlpha = fa;
                rr(chx - 16, chy - 9, 32, 18, 5, P.surf2, P.yellow + 'ff', 1.6);
                tx(fmt(sum), chx, chy, L.fs, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 캡션 ===================== */
    function fwBlock(str, cx, y, maxW, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, maxW, fs);
        rows.forEach(function (row, li) {
            tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold);
        });
        return y + rows.length * lh;
    }
    function fwCaps(x0, top, w, L, s, fresh, e) {
        var cx = x0 + w / 2;
        var y = top + L.capTop;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        y = fwBlock(s.cap, cx, y, w - 8, L.fs, L.fs + 5, P.yellow + 'ff', true);
        y = fwBlock(s.cap2, cx, y, w - 8, L.fsS, L.fsS + 4, P.text + 'ee', false);
        fwBlock(s.cap3, cx, y, w - 8, L.fsS, L.fsS + 4, P.green + 'ff', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 진입 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = clamp01(t);
        var L = layout(w, mob);
        fwGraph(x0, w, top, L, s, p, fresh, e);
        fwBlock(s.mlabel, x0 + w / 2, top + L.gh + 4, w - 8, L.fsS, L.lhS, P.sub + 'ff', true);
        fwMat(x0, top, w, L, s, p, fresh, e);
        fwCaps(x0, top, w, L, s, fresh, e);
        ctx.globalAlpha = 1;
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