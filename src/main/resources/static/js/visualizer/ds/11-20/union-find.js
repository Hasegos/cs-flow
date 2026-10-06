/**
 * 분리집합(Union-Find) 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'naive';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'size') return SZ_STEPS;
        if (mode === 'compress') return PC_STEPS;
        return NV_STEPS;
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

    /* ===================== 공통: 숲과 부모 배열 그리기 ===================== */
    function layoutForest(par) {
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
        roots.forEach(function (r) {
            walk(r, 0);
            leaf += 0.5;
        });
        return { pos: pos, total: leaf - 0.5 };
    }
    function drawUF(x0, top, w, mob, step) {
        var par = step ? step.par : mkPar();
        var cur = step ? step.cur : 0;
        var hops = step ? step.hops : [];
        var hl = step ? step.hl : [];
        var fs = mob ? 10.5 : 12;
        var r = mob ? 11 : 12.5;
        var dy = mob ? 24 : 28;
        var lay = layoutForest(par);
        var u = Math.min(52, w / Math.max(lay.total, 1));
        var offX = x0 + (w - lay.total * u) / 2;
        function px(v) { return offX + lay.pos[v].cx * u; }
        function py(v) { return top + 16 + lay.pos[v].d * dy; }
        var v;
        for (v = 1; v <= N; v++) {
            if (par[v] === v) continue;
            var ax = px(v), ay = py(v), bx = px(par[v]), by = py(par[v]);
            var dx = bx - ax, dyy = by - ay;
            var len = Math.sqrt(dx * dx + dyy * dyy);
            var ux = dx / len, uy = dyy / len;
            var sx = ax + ux * r, sy = ay + uy * r;
            var ex = bx - ux * (r + 2), ey = by - uy * (r + 2);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = P.sub + 'cc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - ux * 6 - uy * 3.5, ey - uy * 6 + ux * 3.5);
            ctx.lineTo(ex - ux * 6 + uy * 3.5, ey - uy * 6 - ux * 3.5);
            ctx.closePath();
            ctx.fillStyle = P.sub + 'cc';
            ctx.fill();
        }
        for (v = 1; v <= N; v++) {
            var isRoot = par[v] === v;
            var col = P.teal;
            var lw = 1.5;
            if (isRoot) { col = P.green; lw = 2.4; }
            if (hops.indexOf(v) >= 0) col = P.orange;
            if (hl.indexOf(v) >= 0) col = P.purple;
            if (v === cur) col = P.yellow;
            ctx.beginPath();
            ctx.arc(px(v), py(v), r, 0, Math.PI * 2);
            ctx.fillStyle = col + '30';
            ctx.fill();
            ctx.strokeStyle = col + 'ff';
            ctx.lineWidth = v === cur || hl.indexOf(v) >= 0 ? 2.6 : lw;
            ctx.stroke();
            tx(String(v), px(v), py(v), fs, P.text + 'ff', 'center', true);
        }
        var at = top + 5 * dy + 44;
        var cw = Math.min(46, w / N);
        var ax0 = x0 + (w - cw * N) / 2;
        tx('parent', x0, at - 8, fs - 1.5, P.sub + 'ee', 'left', true);
        for (var i = 1; i <= N; i++) {
            var hot = i === cur || hl.indexOf(i) >= 0;
            tx(String(i), ax0 + (i - 0.5) * cw, at + 6, fs - 1.5, P.sub + 'ee', 'center', true);
            rr(ax0 + (i - 1) * cw + 1.5, at + 16, cw - 3, 22, 3, hot ? P.yellow + '30' : 'none', (hot ? P.yellow : P.sub) + (hot ? 'ff' : '88'), hot ? 1.8 : 1.1);
            tx(String(par[i]), ax0 + (i - 0.5) * cw, at + 27, fs - 0.5, P.text + 'ee', 'center', true);
        }
        if (step && step.cap) tx(step.cap, x0 + w / 2, at + 56, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, at + 74, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, at + 92, fs - 1, P.green + 'ee', 'center', true);
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

        drawUF(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 분리집합의 동작을 확인하세요.';
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
        neededH = mob ? 300 : 330;
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
        if (mode === 'size') return '같은 연산을 크기 기준으로 합치면 트리 높이가 어떻게 달라지는지 봅니다.';
        if (mode === 'compress') return 'find가 지나간 경로를 루트에 직접 연결하는 경로 압축을 봅니다.';
        return '루트를 다른 루트 밑에 붙이는 union을 한 번씩 실행해 봅니다.';
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