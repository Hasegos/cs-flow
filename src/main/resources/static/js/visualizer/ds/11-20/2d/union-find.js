/**
 * 분리집합(Union-Find) 시각화 시각화
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
    var root    = el('div', 'uf-viz');
    var toolbar = el('div', 'uf-viz__toolbar');
    var tbLeft  = el('div', 'uf-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'uf-viz__title', 'UNION-FIND'));

    var modeWrap = el('div', 'uf-viz__mode');
    var modeDefs = [
        { key: 'naive', label: '기본 합치기' },
        { key: 'size', label: '크기 기준' },
        { key: 'compress', label: '경로 압축' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'uf-viz__mode-btn' + (i === 0 ? ' uf-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'uf-viz__speed');
    speedWrap.appendChild(el('span', 'uf-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'uf-viz__speed-btn' + (i === 0 ? ' uf-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'uf-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'uf-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'uf-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'uf-viz__controls');
    var btnPlay  = el('button', 'uf-viz__btn uf-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'uf-viz__btn', '▶| STEP');
    var btnReset = el('button', 'uf-viz__btn', '↺ RESET');
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
    var mode    = 'naive';
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

    /* ===================== 엔진: 분리집합 ===================== */
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var N = 6;
    function mkPar() {
        var p = [0];
        for (var i = 1; i <= N; i++) p.push(i);
        return p;
    }
    function rootOf(p, x) {
        while (p[x] !== x) x = p[x];
        return x;
    }
    function depthOf(p, x) {
        var d = 0;
        while (p[x] !== x) { x = p[x]; d++; }
        return d;
    }
    function heightOf(p) {
        var h = 0;
        for (var i = 1; i <= N; i++) h = Math.max(h, depthOf(p, i));
        return h;
    }
    var OPS = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
    function step(par, cur, hops, hl, cap, cap2, cap3, log) {
        return { par: par.slice(), cur: cur, hops: hops, hl: hl, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: 기본 합치기 ===================== */
    var NV_STEPS = [];
    (function () {
        var p = mkPar();
        NV_STEPS.push(step(p, 0, [], [], '', '', '', '분리집합(Union-Find)은 원소들을 서로 겹치지 않는 집합으로 나눠 관리하는 자료구조입니다. 원소 1~' + N + '이 처음에는 각자 자기 집합이고, 부모가 자기 자신인 루트(초록 테두리)입니다. union 한 번은 첫 원소의 루트를 둘째 원소의 루트 밑에 붙입니다. STEP으로 5번 실행해 봅니다.'));
        OPS.forEach(function (op) {
            var a = op[0], b = op[1];
            var ra = rootOf(p, a), rb = rootOf(p, b);
            p[ra] = rb;
            var h = heightOf(p);
            NV_STEPS.push(step(p, 0, [], [ra, rb], 'union(' + a + ', ' + b + ')', 'parent[' + ra + '] = ' + rb, '높이 ' + h, 'union(' + a + ', ' + b + ') — ' + a + '의 루트는 ' + ra + ', ' + b + '의 루트는 ' + rb + '입니다. 루트 ' + ra + ju(ra, '을', '를') + ' 루트 ' + rb + ' 밑에 붙입니다. 트리 높이는 ' + h + '입니다.'));
        });
        var path = [];
        for (var x = 1; x < N; x++) path.push(x);
        NV_STEPS.push(step(p, 1, path, [N], 'find(1) · 이동 ' + (N - 1) + '번', '', '높이 ' + heightOf(p), '정리 — 연산 ' + OPS.length + '번 뒤 원소 ' + N + '개가 한 줄로 이어져 높이가 ' + heightOf(p) + '입니다. find(1) 한 번에 부모를 ' + (N - 1) + '번 따라가야 루트 ' + N + '에 닿습니다. 이처럼 합치는 순서에 따라 트리가 한쪽으로 길어지면 find가 최악에 O(n)입니다.'));
    })();

    /* ===================== 데이터: 크기 기준 ===================== */
    var SZ_STEPS = [];
    (function () {
        var p = mkPar();
        var sz = [0];
        for (var i = 1; i <= N; i++) sz.push(1);
        SZ_STEPS.push(step(p, 0, [], [], '', '', '', '같은 연산 ' + OPS.length + '번을 크기 기준으로 합쳐 봅니다. 각 루트가 자기 트리의 원소 수(크기)를 기억하고, 합칠 때 작은 쪽 루트를 큰 쪽 루트 밑에 붙입니다. 크기가 같으면 첫 번째 루트를 그대로 루트로 둡니다.'));
        OPS.forEach(function (op) {
            var a = op[0], b = op[1];
            var ra = rootOf(p, a), rb = rootOf(p, b);
            var sa = sz[ra], sb = sz[rb];
            var big = ra, small = rb;
            if (sa < sb) { big = rb; small = ra; }
            p[small] = big;
            sz[big] += sz[small];
            var h = heightOf(p);
            SZ_STEPS.push(step(p, 0, [], [big, small], 'union(' + a + ', ' + b + ')', 'parent[' + small + '] = ' + big + ' · 크기 ' + sz[big], '높이 ' + h, 'union(' + a + ', ' + b + ') — 루트 ' + ra + '의 크기는 ' + sa + ', 루트 ' + rb + '의 크기는 ' + sb + '입니다. ' + (sa === sb ? '크기가 같으므로 두 번째 루트를 첫 번째 밑에 붙입니다. ' : '작은 쪽 루트를 큰 쪽 밑에 붙입니다. ') + '루트 ' + small + ju(small, '을', '를') + ' 루트 ' + big + ' 밑에 붙여 높이는 ' + h + '입니다.'));
        });
        SZ_STEPS.push(step(p, 0, [], [1], '높이 ' + heightOf(p) + ' · 기본 방식은 ' + (N - 1), '', '', '정리 — 같은 연산을 해도 높이가 ' + heightOf(p) + '입니다(기본 방식은 ' + (N - 1) + '). 작은 트리를 큰 트리 밑에 붙이면, 원소의 깊이가 1 늘 때마다 그 원소가 속한 트리의 크기가 두 배 이상이 됩니다. 그래서 높이는 항상 log2(n) 이하입니다.'));
    })();

    /* ===================== 데이터: 경로 압축 ===================== */
    var PC_STEPS = [];
    (function () {
        var p = mkPar();
        for (var i = 1; i < N; i++) p[i] = i + 1;
        PC_STEPS.push(step(p, 0, [], [], '', '', '', '기본 합치기로 만든 한 줄짜리 트리(1 → 2 → ... → ' + N + ')에서 find(1)을 실행합니다. 루트를 찾으며 지나간 노드를 모두 루트에 직접 연결하는 것이 경로 압축(path compression)입니다.'));
        var path = [];
        for (var x = 1; x < N; x++) {
            path.push(x);
            PC_STEPS.push(step(p, x, path.slice(), [], 'find(1) · 노드 ' + x, 'parent[' + x + '] = ' + p[x], '지금까지 이동 ' + (x - 1) + '번', '노드 ' + x + '의 부모는 ' + p[x] + '입니다. 루트가 아니므로 ' + jro(p[x]) + ' 올라갑니다.'));
        }
        PC_STEPS.push(step(p, N, path.concat([N]), [], 'parent[' + N + '] = ' + N + ' · 루트', '', '이동 ' + (N - 1) + '번', '노드 ' + N + ju(N, '은', '는') + ' 부모가 자기 자신이라 루트입니다. 1에서 루트까지 ' + (N - 1) + '번 이동했습니다. 지나온 노드 1~' + (N - 2) + ju(N - 2, '을', '를') + ' 루트 ' + N + '에 직접 연결합니다. 노드 ' + (N - 1) + ju(N - 1, '은', '는') + ' 이미 루트 바로 아래입니다.'));
        for (var y = 1; y <= N - 2; y++) {
            var old = p[y];
            p[y] = N;
            PC_STEPS.push(step(p, y, [], [N], 'parent[' + y + '] = ' + N, y + '의 부모: ' + old + ' → ' + N, '높이 ' + heightOf(p), y + '의 부모를 ' + old + '에서 ' + jro(N) + ' 바꿉니다. 이제 ' + y + '에서 루트까지 한 번에 갑니다.'));
        }
        PC_STEPS.push(step(p, 1, [1], [N], 'find(1) · 이동 1번', 'parent[1] = ' + N + ' · 루트', '높이 ' + heightOf(p), '같은 find(1)을 다시 실행하면 부모 ' + N + '이 바로 루트라서 1번 만에 끝납니다. 압축 한 번이 이후의 find를 모두 빠르게 만듭니다.'));
        PC_STEPS.push(step(p, 0, [], [N], '높이 ' + heightOf(p) + ' · 경로가 펴짐', '', '', '정리 — find가 지나간 경로를 루트에 직접 연결해 트리를 납작하게 만듭니다. 경로 압축만 써도 연산당 분할 상환 O(log n)이고, 크기 기준 합치기와 함께 쓰면 역 아커만 함수 α(n)에 비례하는 거의 상수 시간입니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'size') return SZ_STEPS;
        if (mode === 'compress') return PC_STEPS;
        return NV_STEPS;
    }
    function defaultLog() {
        if (mode === 'size') return '같은 연산을 크기 기준으로 합치면 트리 높이가 어떻게 달라지는지 봅니다.';
        if (mode === 'compress') return 'find가 지나간 경로를 루트에 직접 연결하는 경로 압축을 봅니다.';
        return '루트를 다른 루트 밑에 붙이는 union을 한 번씩 실행해 봅니다.';
    }

    /* ===================== 공통 ===================== */
    function ez(q) {
        var v = clamp01(q);
        return v * v * (3 - 2 * v);
    }
    function ufA(c, a) {
        var h = Math.round(clamp01(a) * 255).toString(16);
        return c + (h.length < 2 ? '0' + h : h);
    }
    function ufForest(par) {
        var ch = [];
        var i;
        for (i = 0; i <= N; i++) ch.push([]);
        var roots = [];
        for (i = 1; i <= N; i++) {
            if (par[i] === i) roots.push(i); else ch[par[i]].push(i);
        }
        var pos = {};
        var leaf = 0;
        function walk(v, d) {
            var kids = ch[v];
            if (!kids.length) {
                pos[v] = { cx: leaf + 0.5, d: d };
                leaf += 1;
                return;
            }
            kids.forEach(function (k) { walk(k, d + 1); });
            pos[v] = { cx: (pos[kids[0]].cx + pos[kids[kids.length - 1]].cx) / 2, d: d };
        }
        roots.forEach(function (rt) { walk(rt, 0); leaf += 0.5; });
        return { pos: pos, total: leaf - 0.5 };
    }
    function ufSizes(par) {
        var sz = [];
        var i;
        for (i = 0; i <= N; i++) sz.push(0);
        for (i = 1; i <= N; i++) sz[rootOf(par, i)] += 1;
        return sz;
    }
    function ufPrefix(a, b) {
        if (a.length >= b.length) return false;
        var k;
        for (k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
        return true;
    }
    function ufMaxTotal(steps) {
        var m = 1;
        steps.forEach(function (st) { m = Math.max(m, ufForest(st.par).total); });
        return m;
    }
    function ufMaxDepth(steps) {
        var d = 0;
        steps.forEach(function (st) { d = Math.max(d, heightOf(st.par)); });
        return d;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var steps = currentSteps();
        var g = {
            r: mob ? 10 : 12.5,
            fs: mob ? 11 : 12.5,
            fsSub: mob ? 11 : 12,
            dy: mob ? 30 : 36,
            D: ufMaxDepth(steps),
            M: ufMaxTotal(steps),
            labW: mob ? 46 : 56,
            bh: mob ? 22 : 24,
            sr: mode === 'size' ? (mob ? 16 : 18) : 0
        };
        g.cw = Math.min(mob ? 36 : 50, (w - g.labW) / N);
        g.u = Math.min(mob ? 36 : 52, Math.max(8, (w - 2 * g.r - 4) / g.M));
        g.treeH = 2 * g.r + 8 + g.D * g.dy;
        g.stripH = 15 + g.bh + (g.sr ? 4 + g.sr : 0) + 4;
        return g;
    }

    /* ===================== 캡션 ===================== */
    function ufCapBlock(w, g, st) {
        var out = [];
        if (st.cap) out.push({ ls: lines(st.cap, w, g.fs), col: P.yellow + 'ff', bold: true, sz: g.fs });
        if (st.cap2) out.push({ ls: lines(st.cap2, w, g.fsSub), col: P.text + 'ee', bold: false, sz: g.fsSub });
        if (st.cap3) out.push({ ls: lines(st.cap3, w, g.fsSub), col: P.green + 'ff', bold: true, sz: g.fsSub });
        return out;
    }
    function ufCapH(w, g, st) {
        var h = 0;
        ufCapBlock(w, g, st).forEach(function (b, bi) {
            h += (bi > 0 ? 6 : 0) + b.ls.length * (b.sz + 4);
        });
        return h;
    }
    function ufDrawCap(x0, y, w, g, st) {
        var yy = y;
        ufCapBlock(w, g, st).forEach(function (b, bi) {
            if (bi > 0) yy += 6;
            b.ls.forEach(function (str) {
                tx(str, x0 + w / 2, yy + (b.sz + 4) / 2, b.sz, b.col, 'center', b.bold);
                yy += b.sz + 4;
            });
        });
    }
    function sceneH(w, mob) {
        var g = layout(w, mob);
        var cap = 0;
        currentSteps().forEach(function (st) { cap = Math.max(cap, ufCapH(w, g, st)); });
        return g.treeH + g.stripH + 4 + cap;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function ufEdge(x1, y1, x2, y2, r, col) {
        var dx = x2 - x1;
        var dz = y2 - y1;
        var len = Math.sqrt(dx * dx + dz * dz);
        if (len < 2 * r) return;
        var ux = dx / len;
        var uy = dz / len;
        var ex = x2 - ux * (r + 1);
        var ey = y2 - uy * (r + 1);
        ln(x1 + ux * r, y1 + uy * r, ex, ey, col, 1.5);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * 6 - uy * 3.5, ey - uy * 6 + ux * 3.5);
        ctx.lineTo(ex - ux * 6 + uy * 3.5, ey - uy * 6 - ux * 3.5);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 진입 ===================== */
    function drawScene(x0, top, w, mob, cs, ps, t) {
        var s = cs || currentSteps()[0];
        var p = ps || s;
        var mv = p !== s;
        var tt = mv ? t : 1;
        var e = ez(tt);
        var g = layout(w, mob);
        var offX = x0 + (w - g.M * g.u) / 2;
        var baseY = top + g.r + 4;
        var lay = ufForest(s.par);
        var lp = ufForest(p.par);
        var nx = [];
        var ny = [];
        var v;
        var i;
        for (v = 1; v <= N; v++) {
            nx[v] = lerp(offX + lp.pos[v].cx * g.u, offX + lay.pos[v].cx * g.u, e);
            ny[v] = lerp(baseY + lp.pos[v].d * g.dy, baseY + lay.pos[v].d * g.dy, e);
        }
        for (v = 1; v <= N; v++) {
            var pv = s.par[v];
            if (pv !== v) {
                var fresh = mv && p.par[v] !== pv;
                ufEdge(nx[v], ny[v], nx[pv], ny[pv], g.r, fresh ? ufA(P.yellow, e * 0.95) : ufA(P.sub, 0.8));
            }
            var old = p.par[v];
            if (mv && old !== v && old !== pv) {
                ufEdge(nx[v], ny[v], nx[old], ny[old], g.r, ufA(P.sub, (1 - e) * 0.8));
            }
        }
        var hops = s.hops;
        for (v = 1; v <= N; v++) {
            var isRoot = s.par[v] === v;
            var inHl = s.hl.indexOf(v) >= 0;
            var cur = v === s.cur;
            var col = isRoot ? P.green : P.teal;
            if (hops.indexOf(v) >= 0) col = P.orange;
            if (inHl) col = P.purple;
            if (cur) col = P.yellow;
            circ(nx[v], ny[v], g.r, ufA(col, 0.19), ufA(col, 1), isRoot || inHl || cur ? 2.4 : 1.5);
            tx(String(v), nx[v], ny[v], g.fs, P.text + 'ff', 'center', true);
        }
        if (hops.length) {
            var st0 = mv && p.hops.length > 0 && ufPrefix(p.hops, hops) ? p.hops.length - 1 : 0;
            var f = mv ? st0 + tt * (hops.length - 1 - st0) : hops.length - 1;
            var i0 = Math.floor(f);
            var i1 = Math.min(i0 + 1, hops.length - 1);
            var fr = f - i0;
            var wx = lerp(nx[hops[i0]], nx[hops[i1]], fr);
            var wy = lerp(ny[hops[i0]], ny[hops[i1]], fr);
            circ(wx, wy, g.r + 3, 'none', P.yellow + 'ff', 2);
        }

        var gx = x0 + g.labW + (w - g.labW - g.cw * N) / 2;
        var idxC = top + g.treeH + 7;
        var boxT = top + g.treeH + 15;
        var boxC = boxT + g.bh / 2;
        tx('parent', x0, boxC, g.fsSub, P.sub + 'ff', 'left', true);
        var szs = ufSizes(s.par);
        var pszs = ufSizes(p.par);
        for (i = 1; i <= N; i++) {
            var cx0 = gx + (i - 1) * g.cw;
            var hot = i === s.cur || s.hl.indexOf(i) >= 0;
            var chg = mv && p.par[i] !== s.par[i];
            var flash = chg ? Math.sin(Math.PI * tt) : 0;
            var shownP = chg && tt < 0.5 ? p.par[i] : s.par[i];
            tx(String(i), cx0 + g.cw / 2, idxC, g.fsSub, P.sub + 'ff', 'center', true);
            rr(cx0 + 1.5, boxT, g.cw - 3, g.bh, 3,
                chg ? ufA(P.yellow, 0.1 + 0.35 * flash) : hot ? ufA(P.yellow, 0.19) : 'none',
                hot || chg ? P.yellow + 'ff' : ufA(P.sub, 0.55),
                hot || chg ? 1.8 : 1.1);
            tx(String(shownP), cx0 + g.cw / 2, boxC, g.fs, P.text + 'ff', 'center', true);
        }
        if (g.sr) {
            var syC = boxT + g.bh + 4 + g.sr / 2;
            tx('크기', x0, syC, g.fsSub, P.sub + 'ff', 'left', true);
            for (i = 1; i <= N; i++) {
                var scx = gx + (i - 1) * g.cw + g.cw / 2;
                var nv = szs[i];
                var ov = pszs[i];
                var chgS = mv && nv !== ov;
                var show = chgS && tt < 0.5 ? ov : nv;
                var txt = show > 0 ? String(show) : '-';
                var tcol = chgS ? P.yellow + 'ff' : show > 0 ? P.green + 'ff' : P.sub + 'ff';
                tx(txt, scx, syC, g.fsSub, tcol, 'center', true);
            }
        }
        ufDrawCap(x0, top + g.treeH + g.stripH + 4, w, g, s);
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
        speedBtns.forEach(function (b) { b.classList.remove('uf-viz__speed-btn--active'); });
        btn.classList.add('uf-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('uf-viz__mode-btn--active', d.key === m); });
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