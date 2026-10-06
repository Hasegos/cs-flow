/**
 * 벨만-포드 시각화
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
    var root    = el('div', 'bf-viz');
    var toolbar = el('div', 'bf-viz__toolbar');
    var tbLeft  = el('div', 'bf-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bf-viz__title', 'BELLMAN-FORD'));

    var modeWrap = el('div', 'bf-viz__mode');
    var modeDefs = [
        { key: 'rounds', label: '라운드 반복' },
        { key: 'edge', label: '간선 완화' },
        { key: 'neg', label: '음수 사이클' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bf-viz__mode-btn' + (i === 0 ? ' bf-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bf-viz__speed');
    speedWrap.appendChild(el('span', 'bf-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'bf-viz__speed-btn' + (i === 0 ? ' bf-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bf-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bf-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bf-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bf-viz__controls');
    var btnPlay  = el('button', 'bf-viz__btn bf-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bf-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bf-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 벨만-포드 ===================== */
    var N = 5;
    var NAMES = ['S', 'A', 'B', 'C', 'D'];
    var POS = [[0.07, 0.5], [0.37, 0.1], [0.37, 0.9], [0.68, 0.2], [0.93, 0.8]];
    var EDGES = [[3, 4, 2], [2, 3, 4], [1, 2, -3], [0, 1, 4], [0, 2, 5], [1, 3, 8], [2, 4, 7]];
    var NEG_EDGES = EDGES.concat([[2, 1, 1]]);
    var INF = 1000000000;
    function fmt(x) {
        return x >= INF ? '∞' : String(x);
    }
    function initD() {
        return [0, INF, INF, INF, INF];
    }
    function edgeText(e) {
        return NAMES[e[0]] + ' → ' + NAMES[e[1]] + ' (' + e[2] + ')';
    }
    function dText(d) {
        return d.map(function (x, i) { return NAMES[i] + ' ' + fmt(x); }).join(', ');
    }
    function bstep(edges, d, prev, hot, upd, cap, cap2, cap3, log) {
        return { edges: edges, d: d.slice(), prev: prev.slice(), hot: hot, upd: upd, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function roundOnce(edges, d) {
        var upd = [];
        var lines = [];
        edges.forEach(function (e, i) {
            if (d[e[0]] < INF && d[e[0]] + e[2] < d[e[1]]) {
                lines.push(edgeText(e) + ': d[' + NAMES[e[1]] + '] ' + fmt(d[e[1]]) + ' → ' + (d[e[0]] + e[2]));
                d[e[1]] = d[e[0]] + e[2];
                upd.push(i);
            }
        });
        return { upd: upd, lines: lines };
    }

    /* ===================== 데이터: 라운드 반복 ===================== */
    function buildRounds(edges, steps, intro) {
        var d = initD();
        var r;
        steps.push(bstep(edges, d, d, [], [], '시작: 출발 정점 S의 거리만 0', '나머지는 아직 닿지 못해 ∞', '원 안의 숫자 = 현재 거리 d', intro));
        for (r = 1; r <= N; r++) {
            var prev = d.slice();
            var res = roundOnce(edges, d);
            var check = r === N;
            steps.push(bstep(edges, d, prev, [], res.upd, check ? '확인 라운드(' + r + '번째)' : '라운드 ' + r + '/' + (N - 1) + ' 끝', res.upd.length ? '갱신된 간선 ' + res.upd.length + '개 (초록색)' : '갱신된 간선 없음', check ? (res.upd.length ? '거리가 계속 줄어듭니다' : '더 줄일 거리가 없습니다') : '', (check ? '확인 라운드 — ' : '라운드 ' + r + ' — ') + '간선을 목록 순서대로 한 번씩 완화했습니다. ' + (res.lines.length ? res.lines.join(', ') + '.' : '갱신된 거리가 없습니다.') + (check ? (res.upd.length ? ' V-1번 반복한 뒤에도 거리가 줄어듭니다.' : ' V-1번 반복한 뒤에는 더 줄어드는 거리가 없습니다.') : '')));
        }
        return d;
    }
    var ROUND_STEPS = [];
    (function () {
        var d = buildRounds(EDGES, ROUND_STEPS, '벨만-포드 알고리즘은 모든 간선을 한 번씩 완화(relax)하는 라운드를 V-1번 반복합니다. 간선 u → v의 완화는 d[u] + 가중치가 d[v]보다 작으면 d[v]를 그 값으로 줄이는 일입니다. 정점 5개이므로 라운드를 4번 돌리고, 5번째로 한 번 더 확인합니다. 간선은 화면에 적힌 가중치 그대로 목록 순서(C → D, B → C, A → B, …)로 확인합니다.');
        ROUND_STEPS.push(bstep(EDGES, d, d, [], [], '최단 거리 확정', dText(d), '음수 사이클 없음', '정리 — 최단 거리는 ' + dText(d) + '입니다. 음수 간선 A → B(-3)가 있어도 정답을 구했고, 이 예에서는 간선 순서가 불리해 4라운드가 모두 필요했습니다. 라운드마다 간선 E개를 확인하므로 O(VE)입니다. 확인 라운드에서도 갱신이 없어 음수 사이클이 없다고 판단합니다.'));
    })();

    /* ===================== 데이터: 간선 완화 ===================== */
    var EDGE_STEPS = [];
    (function () {
        var d = initD();
        roundOnce(EDGES, d);
        var start = d.slice();
        EDGE_STEPS.push(bstep(EDGES, d, d, [], [], '라운드 2를 간선 하나씩 확인', '시작 거리: ' + dText(d), '', '라운드 1이 끝난 상태에서 라운드 2의 간선을 하나씩 완화해 봅니다. 완화는 간선 u → v에 대해 d[u] + 가중치와 현재 d[v]를 비교해, 더 작을 때만 d[v]를 갱신합니다. 앞에서 갱신된 값은 같은 라운드의 뒤쪽 간선에서 바로 쓰입니다.'));
        EDGES.forEach(function (e, i) {
            var prev = d.slice();
            var u = e[0];
            var v = e[1];
            var msg;
            var cap2;
            var upd = [];
            if (d[u] >= INF) {
                msg = '간선 ' + edgeText(e) + ' 확인: 출발 쪽 d[' + NAMES[u] + ']가 ∞라 아직 이 간선으로 갈 수 없어 건너뜁니다.';
                cap2 = '건너뜀 (출발 거리 ∞)';
            } else {
                var cand = d[u] + e[2];
                msg = '간선 ' + edgeText(e) + ' 확인: d[' + NAMES[u] + '] + (' + e[2] + ') = ' + d[u] + ' + (' + e[2] + ') = ' + cand + ', 현재 d[' + NAMES[v] + '] = ' + fmt(d[v]) + '. ';
                if (cand < d[v]) {
                    msg += cand + ' < ' + fmt(d[v]) + '이므로 갱신합니다: d[' + NAMES[v] + '] ' + fmt(d[v]) + ' → ' + cand + '.';
                    cap2 = '갱신 ' + fmt(d[v]) + ' → ' + cand + ' (초록색)';
                    d[v] = cand;
                    upd = [i];
                } else {
                    msg += cand + ' ≥ ' + fmt(d[v]) + '이므로 그대로 둡니다.';
                    cap2 = '비교 ' + cand + ' ≥ ' + fmt(d[v]) + ' → 변화 없음';
                }
            }
            EDGE_STEPS.push(bstep(EDGES, d, prev, [i], upd, '완화: ' + edgeText(e), cap2, '', msg));
        });
        EDGE_STEPS.push(bstep(EDGES, d, start, [], [], '라운드 2 끝', dText(d), '', '정리 — 라운드 2에서 C, B, D의 거리가 줄었습니다. B → C(4)는 A → B(-3)보다 목록에서 앞이라 아직 d[B] = 5를 써서 d[C]를 9까지만 줄였고, 이어지는 라운드 3에서야 d[B] = 1을 반영해 5가 됩니다. 간선 순서에 따라 같은 일에 필요한 라운드 수가 달라지지만, 음수 사이클이 없으면 최단 경로는 간선이 많아야 V-1개이므로 V-1번이면 충분합니다.'));
    })();

    /* ===================== 데이터: 음수 사이클 ===================== */
    var NEG_STEPS = [];
    (function () {
        var d = buildRounds(NEG_EDGES, NEG_STEPS, '같은 그래프에 B → A(1) 간선을 더했습니다. 이제 A → B(-3)와 B → A(1)가 A → B → A 순환을 이루고 그 합은 -3 + 1 = -2로 음수입니다. 이런 음수 사이클을 한 바퀴 돌 때마다 거리가 2씩 줄어들어 최단 거리가 정해지지 않습니다. 라운드 4번 뒤에 한 번 더 완화해 갱신이 일어나는지 봅니다.');
        NEG_STEPS.push(bstep(NEG_EDGES, d, d, [], [], '음수 사이클 발견', '확인 라운드에서도 거리가 줄었음', '최단 거리가 정해지지 않음', '정리 — V-1번 라운드를 돌린 뒤에도 완화가 일어났습니다. 음수 사이클이 없다면 V-1번이면 모든 최단 거리가 확정되므로, 이는 출발 정점에서 닿을 수 있는 음수 사이클이 있다는 신호입니다. 이때는 최단 거리가 정의되지 않으므로 알고리즘은 사이클이 있다고 보고합니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'rounds';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'edge') return EDGE_STEPS;
        if (mode === 'neg') return NEG_STEPS;
        return ROUND_STEPS;
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

    /* ===================== 공통: 가중치 방향 그래프 그리기 ===================== */
    function drawBF(x0, top, w, mob, step) {
        var edges = step ? step.edges : (mode === 'neg' ? NEG_EDGES : EDGES);
        var d = step ? step.d : initD();
        var prev = step ? step.prev : d;
        var hot = step ? step.hot : [];
        var upd = step ? step.upd : [];
        var fs = mob ? 11.5 : 13;
        var r = mob ? 20 : 23;
        var gh = mob ? 230 : 262;
        var gx = x0 + r + 6;
        var gw = w - 2 * (r + 6);
        var gy0 = top + r + 6;
        var gih = gh - 2 * r - 12;
        function px(v) { return gx + POS[v][0] * gw; }
        function py(v) { return gy0 + POS[v][1] * gih; }
        var i;
        edges.forEach(function (e, k) {
            var ax = px(e[0]);
            var ay = py(e[0]);
            var bx = px(e[1]);
            var by = py(e[1]);
            var ang = Math.atan2(by - ay, bx - ax);
            var sx = ax + Math.cos(ang) * r;
            var sy = ay + Math.sin(ang) * r;
            var ex = bx - Math.cos(ang) * (r + 3);
            var ey = by - Math.sin(ang) * (r + 3);
            var isHot = hot.indexOf(k) >= 0;
            var isUpd = upd.indexOf(k) >= 0;
            var color = isHot ? P.yellow + 'ff' : isUpd ? P.green + 'ff' : P.sub + 'aa';
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = color;
            ctx.lineWidth = isHot || isUpd ? 3 : 1.6;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - 9 * Math.cos(ang - 0.4), ey - 9 * Math.sin(ang - 0.4));
            ctx.lineTo(ex - 9 * Math.cos(ang + 0.4), ey - 9 * Math.sin(ang + 0.4));
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            var mx = (sx + ex) / 2 - Math.sin(ang) * 11;
            var my = (sy + ey) / 2 + Math.cos(ang) * 11;
            tx(String(e[2]), mx, my, fs, e[2] < 0 ? P.red + 'ff' : P.text + 'ff', 'center', true);
        });
        for (i = 0; i < N; i++) {
            var reached = d[i] < INF;
            var changed = d[i] !== prev[i];
            var base = changed ? P.yellow : reached ? P.teal : P.sub;
            ctx.beginPath();
            ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
            ctx.fillStyle = reached ? base + '44' : P.surf2;
            ctx.fill();
            ctx.strokeStyle = base + 'ff';
            ctx.lineWidth = changed ? 3.2 : 2;
            ctx.stroke();
            tx(NAMES[i], px(i), py(i) - 6, fs + 1, P.text + 'ff', 'center', true);
            tx(fmt(d[i]), px(i), py(i) + 9, fs, changed ? P.yellow + 'ff' : P.green + 'ff', 'center', true);
        }
        var at = top + gh + 16;
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

        drawBF(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 벨만-포드의 동작을 확인하세요.';
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
        neededH = mob ? 340 : 372;
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
        if (mode === 'edge') return '간선 하나를 완화할 때 거리를 비교하고 갱신하는 과정을 봅니다.';
        if (mode === 'neg') return '음수 사이클이 있을 때 V-1번 뒤에도 거리가 줄어드는 모습을 봅니다.';
        return '모든 간선을 한 번씩 완화하는 라운드를 V-1번 반복하는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('bf-viz__speed-btn--active'); });
        btn.classList.add('bf-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bf-viz__mode-btn--active', d.key === m); });
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