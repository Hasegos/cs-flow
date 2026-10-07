/**
 * 세그먼트 트리 시각화
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
    var root    = el('div', 'seg-viz');
    var toolbar = el('div', 'seg-viz__toolbar');
    var tbLeft  = el('div', 'seg-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'seg-viz__title', 'SEGTREE'));

    var modeWrap = el('div', 'seg-viz__mode');
    var modeDefs = [
        { key: 'build', label: '트리 만들기' },
        { key: 'query', label: '구간 합 쿼리' },
        { key: 'update', label: '값 갱신' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'seg-viz__mode-btn' + (i === 0 ? ' seg-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'seg-viz__speed');
    speedWrap.appendChild(el('span', 'seg-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'seg-viz__speed-btn' + (i === 0 ? ' seg-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'seg-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'seg-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'seg-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'seg-viz__controls');
    var btnPlay  = el('button', 'seg-viz__btn seg-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'seg-viz__btn', '▶| STEP');
    var btnReset = el('button', 'seg-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 구간 합 세그먼트 트리 ===================== */
    function jg(n, a, b) {
        return n + ([0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b);
    }
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    var ARR = [5, 8, 6, 3, 2, 7, 1, 4];
    var N = ARR.length;
    var TREE = [];
    var RNG = [];
    function build(node, l, r) {
        RNG[node] = [l, r];
        if (l === r) {
            TREE[node] = ARR[l];
            return;
        }
        var m = (l + r) >> 1;
        build(node * 2, l, m);
        build(node * 2 + 1, m + 1, r);
        TREE[node] = TREE[node * 2] + TREE[node * 2 + 1];
    }
    build(1, 0, N - 1);
    function depthOf(node) {
        var d = 0;
        while (node > 1) { node >>= 1; d++; }
        return d;
    }
    function rtxt(node) { return '[' + RNG[node][0] + ', ' + RNG[node][1] + ']'; }
    var MAXD = depthOf(2 * N - 1);

    /* ===================== 데이터: 트리 만들기 ===================== */
    var BUILD_STEPS = [
        { show: 99, st: {}, cap: '', cap2: '', arr: [], log: '세그먼트 트리는 배열의 구간 정보(합, 최솟값 등)를 이진 트리에 미리 저장해 두는 자료구조입니다. 배열 ' + ARR.join(', ') + '의 구간 합 트리를 아래에서 위로 만들어 봅니다.' }
    ];
    for (var bd = MAXD; bd >= 0; bd--) {
        (function (d) {
            var nodes = [];
            for (var i = 1; i < 2 * N; i++) if (depthOf(i) === d) nodes.push(i);
            var step = { show: d, st: {}, cap: '', cap2: '', arr: [] };
            nodes.forEach(function (i) { step.st[i] = 'new'; });
            if (d === MAXD) {
                step.cap = '리프: 배열 원소 ' + N + '개를 그대로 저장';
                step.log = '맨 아래 리프 노드 ' + N + '개에 배열 원소를 그대로 저장합니다. 리프 하나가 길이 1인 구간 하나를 담당합니다.';
            } else {
                step.cap = '두 자식의 합으로 ' + nodes.length + '개 노드 계산';
                step.cap2 = nodes.map(function (i) { return rtxt(i) + '=' + TREE[i]; }).join('  ');
                step.log = '한 층 위의 노드 ' + nodes.length + '개를 만듭니다. 각 노드는 두 자식 구간의 합을 저장하고, 담당 구간은 두 자식 구간을 이은 것입니다.' + (d === 0 ? ' 루트는 전체 구간 ' + rtxt(1) + '의 합 ' + TREE[1] + '을 저장합니다.' : '');
            }
            BUILD_STEPS.push(step);
        })(bd);
    }
    BUILD_STEPS.push({ show: 0, st: {}, cap: '노드 ' + (2 * N - 1) + '개 · 층 ' + (MAXD + 1) + '개', cap2: '', arr: [], log: '정리 — 원소 ' + N + '개에 노드는 ' + (2 * N - 1) + '개이고 층은 ' + (MAXD + 1) + '개(높이 ' + MAXD + ')입니다. 구간을 절반씩 나누므로 층 수가 ⌈log2 n⌉ + 1이고, 만드는 데 O(n)이 걸립니다.' });

    /* ===================== 데이터: 구간 합 쿼리 ===================== */
    var QL = 2;
    var QR = 6;
    var QEVS = [];
    function qrun(node, l, r) {
        if (QR < l || r < QL) { QEVS.push({ n: node, t: 'out' }); return; }
        if (QL <= l && r <= QR) { QEVS.push({ n: node, t: 'full' }); return; }
        QEVS.push({ n: node, t: 'part' });
        var m = (l + r) >> 1;
        qrun(node * 2, l, m);
        qrun(node * 2 + 1, m + 1, r);
    }
    qrun(1, 0, N - 1);
    var QUERY_ARR = [];
    for (var qi = QL; qi <= QR; qi++) QUERY_ARR.push(qi);
    var QUERY_STEPS = [
        { show: 0, st: {}, sum: [], cap: '', cap2: '', arr: QUERY_ARR, log: '구간 [' + QL + ', ' + QR + ']의 합을 구합니다. 배열을 직접 더하면 ' + (QR - QL + 1) + '개를 훑어야 하지만, 세그먼트 트리는 루트에서 내려가며 이미 저장된 구간 합을 재사용합니다.' }
    ];
    var qst = {};
    var qsum = [];
    QEVS.forEach(function (ev) {
        qst[ev.n] = ev.t;
        var msg;
        if (ev.t === 'out') {
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간 [' + QL + ', ' + QR + ']과 겹치지 않으므로 0으로 보고 건너뜁니다. 더 내려가지 않습니다.';
        } else if (ev.t === 'full') {
            qsum.push(TREE[ev.n]);
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간 안에 완전히 포함됩니다. 저장된 값 ' + jg(TREE[ev.n], '을', '를') + ' 그대로 더하고 더 내려가지 않습니다.';
        } else {
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간과 일부만 겹칩니다. 두 자식으로 나누어 각각 확인합니다.';
        }
        var snapSt = {};
        Object.keys(qst).forEach(function (k) { snapSt[k] = qst[k]; });
        QUERY_STEPS.push({ show: 0, st: snapSt, sum: qsum.slice(), cap: qsum.length ? '합계: ' + qsum.join(' + ') + (qsum.length > 1 ? ' = ' + qsum.reduce(function (a, b) { return a + b; }, 0) : '') : '아직 더한 값 없음', cap2: '', arr: QUERY_ARR, log: msg });
    });
    var QTOTAL = qsum.reduce(function (a, b) { return a + b; }, 0);
    var QUSED = qsum.length;
    QUERY_STEPS.push({ show: 0, st: QUERY_STEPS[QUERY_STEPS.length - 1].st, sum: qsum.slice(), cap: '합계 ' + QTOTAL + ' · 방문 ' + QEVS.length + '개 · 합산 ' + QUSED + '개', cap2: '', arr: QUERY_ARR, log: '정리 — 구간 합은 ' + qsum.join(' + ') + ' = ' + QTOTAL + '입니다. 노드를 ' + QEVS.length + '개 방문했고 그 가운데 ' + QUSED + '개의 저장값만 더했습니다. 한 층에서 방문하는 노드는 최대 4개이므로 쿼리는 O(log n)입니다.' });

    /* ===================== 데이터: 값 갱신 ===================== */
    var UP_IDX = 3;
    var UP_NEW = 10;
    var UP_DELTA = UP_NEW - ARR[UP_IDX];
    var UP_PATH = [];
    (function () {
        var node = N + UP_IDX;
        while (node >= 1) { UP_PATH.push(node); node >>= 1; }
    })();
    var UP_VALS_OLD = TREE.slice();
    var UP_STEPS = [
        { show: 0, vals: UP_VALS_OLD, st: {}, cap: '', cap2: '', arr: [], mark: -1, log: '배열의 값을 바꾸면 그 원소를 포함하는 구간의 합도 모두 바뀝니다. A[' + UP_IDX + ']을 ' + ARR[UP_IDX] + '에서 ' + jro(UP_NEW) + ' 바꿀 때(변화량 ' + (UP_DELTA > 0 ? '+' : '') + UP_DELTA + ') 트리가 어떻게 갱신되는지 봅니다.' }
    ];
    var upVals = TREE.slice();
    var upSt = {};
    UP_PATH.forEach(function (node, i) {
        var oldV = upVals[node];
        if (i === 0) upVals[node] = UP_NEW;
        else upVals[node] = upVals[node * 2] + upVals[node * 2 + 1];
        upSt[node] = 'upd';
        var snapSt = {};
        Object.keys(upSt).forEach(function (k) { snapSt[k] = upSt[k]; });
        UP_STEPS.push({
            show: 0, vals: upVals.slice(), st: snapSt, cap: '구간 ' + rtxt(node) + ': ' + oldV + ' → ' + upVals[node], cap2: '', arr: [], mark: UP_IDX,
            log: i === 0
                ? '리프 ' + rtxt(node) + '의 값을 ' + oldV + '에서 ' + jro(upVals[node]) + ' 바꿉니다. 이 리프가 배열의 A[' + UP_IDX + ']에 해당합니다.'
                : '부모 ' + rtxt(node) + '의 값을 두 자식의 합으로 다시 계산합니다. ' + oldV + '에서 ' + jro(upVals[node]) + ' 바뀌고, 변화량 ' + (UP_DELTA > 0 ? '+' : '') + UP_DELTA + '만큼 달라집니다.'
        });
    });
    UP_STEPS.push({ show: 0, vals: upVals.slice(), st: upSt, cap: '갱신한 노드 ' + UP_PATH.length + '개 (전체 ' + (2 * N - 1) + '개)', cap2: '', arr: [], mark: UP_IDX, log: '정리 — 값 하나를 바꾸려고 리프에서 루트까지의 노드 ' + UP_PATH.length + '개만 다시 계산했습니다. 이 개수는 층 수와 같은 ⌈log2 n⌉ + 1이어서 갱신은 O(log n)입니다.' });

    /* ===================== 상태 ===================== */
    var mode    = 'build';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'update') return UP_STEPS;
        return BUILD_STEPS;
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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 트리 그리기 ===================== */
    function drawSeg(x0, top, w, mob, step, mode) {
        var fs = mob ? 10 : 11.5;
        var vals = step && step.vals ? step.vals : TREE;
        var st = step ? step.st : {};
        var show = step ? step.show : 0;
        var bw = mob ? 34 : 46;
        var bh = 22;
        var dy = 44;
        var pos = {};
        var leafW = w / N;
        for (var i = 2 * N - 1; i >= 1; i--) {
            var d = depthOf(i);
            var x;
            if (i >= N) x = x0 + (i - N + 0.5) * leafW;
            else x = (pos[i * 2].x + pos[i * 2 + 1].x) / 2;
            pos[i] = { x: x, y: top + 14 + d * dy };
        }
        for (var e = 2; e < 2 * N; e++) {
            var p = e >> 1;
            if (depthOf(e) < show) continue;
            ctx.beginPath();
            ctx.moveTo(pos[p].x, pos[p].y + bh / 2);
            ctx.lineTo(pos[e].x, pos[e].y - bh / 2);
            ctx.strokeStyle = P.sub + '88';
            ctx.lineWidth = 1.3;
            ctx.stroke();
        }
        for (var n = 1; n < 2 * N; n++) {
            if (depthOf(n) < show) continue;
            var s = st[n];
            var col = P.sub;
            var fill = 'none';
            var lw = 1.2;
            if (s === 'new') { col = P.teal; fill = P.teal + '30'; lw = 1.8; }
            else if (s === 'part') { col = P.yellow; fill = P.yellow + '22'; lw = 1.8; }
            else if (s === 'out') { col = P.red; fill = P.red + '18'; lw = 1.4; }
            else if (s === 'full') { col = P.green; fill = P.green + '35'; lw = 2; }
            else if (s === 'upd') { col = P.orange; fill = P.orange + '35'; lw = 2; }
            else if (mode !== 'build') { col = P.teal; fill = 'none'; lw = 1.2; }
            else { col = P.teal; fill = P.teal + '18'; }
            rr(pos[n].x - bw / 2, pos[n].y - bh / 2, bw, bh, 4, fill, col + (s ? 'ff' : '99'), lw);
            tx(String(vals[n]), pos[n].x, pos[n].y, fs, P.text + 'ee', 'center', true);
        }
        var ay = top + 14 + (MAXD + 1) * dy + 4;
        var arr = step ? step.arr : [];
        var aw = leafW - 4;
        for (var a = 0; a < N; a++) {
            var ax = x0 + a * leafW + 2;
            var inq = arr.indexOf(a) >= 0;
            var mk = step && step.mark === a;
            var c = mk ? P.orange : (inq ? P.yellow : P.sub);
            rr(ax, ay, aw, 20, 3, mk ? P.orange + '35' : (inq ? P.yellow + '25' : 'none'), c + (inq || mk ? 'ff' : '88'), inq || mk ? 1.6 : 1.1);
            tx(String(mk && mode === 'update' && step.vals ? step.vals[N + a] : ARR[a]), ax + aw / 2, ay + 10, fs - 0.5, P.text + 'ee', 'center', true);
            tx(String(a), ax + aw / 2, ay + 31, fs - 2, P.sub + 'ee', 'center', false);
        }
        if (step && step.cap) tx(step.cap, x0 + w / 2, ay + 52, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, ay + 68, fs - 2, P.sub + 'ee', 'center', false);
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

        drawSeg(padX, top, fullW, mob, step, mode);

        if (!step) {
            var hint = '아래 STEP으로 세그먼트 트리의 동작을 확인하세요.';
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
        neededH = mob ? 300 : 320;
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
        if (mode === 'query') return '구간 합을 구할 때 트리의 어떤 노드를 방문하고 더하는지 봅니다.';
        if (mode === 'update') return '배열 값을 바꿀 때 트리의 노드가 어떻게 갱신되는지 봅니다.';
        return '배열에서 구간 합 세그먼트 트리를 아래에서 위로 만드는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('seg-viz__speed-btn--active'); });
        btn.classList.add('seg-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('seg-viz__mode-btn--active', d.key === m); });
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