/**
 * 그래프 색칠 문제 시각화
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
    var root    = el('div', 'gc-viz');
    var toolbar = el('div', 'gc-viz__toolbar');
    var tbLeft  = el('div', 'gc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'gc-viz__title', 'GRAPH COLORING'));

    var modeWrap = el('div', 'gc-viz__mode');
    var modeDefs = [
        { key: 'greedy', label: '그리디 색칠' },
        { key: 'order', label: '정점 순서의 영향' },
        { key: 'back', label: '백트래킹' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'gc-viz__mode-btn' + (i === 0 ? ' gc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'gc-viz__speed');
    speedWrap.appendChild(el('span', 'gc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'gc-viz__speed-btn' + (i === 0 ? ' gc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'gc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'gc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'gc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'gc-viz__controls');
    var btnPlay  = el('button', 'gc-viz__btn gc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'gc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'gc-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 그래프 색칠 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var N = 6;
    var NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
    var POS = [[0.5, 0.05], [0.2, 0.33], [0.8, 0.33], [0.2, 0.66], [0.8, 0.66], [0.5, 0.95]];
    var EDGES = [[0, 1], [0, 2], [1, 2], [1, 3], [1, 5], [2, 4], [2, 5], [4, 5]];
    var ADJ = [];
    (function () {
        var i;
        for (i = 0; i < N; i++) ADJ.push([]);
        EDGES.forEach(function (e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
        ADJ.forEach(function (a) { a.sort(function (x, y) { return x - y; }); });
    })();
    var DEG_ORDER = [1, 2, 5, 0, 4, 3];
    var NAT_ORDER = [0, 1, 2, 3, 4, 5];
    function zeros() {
        var z = [];
        for (var i = 0; i < N; i++) z.push(0);
        return z;
    }
    function nameList(list) {
        return list.map(function (v) { return NAMES[v]; }).join(', ');
    }
    function orderText(order) {
        return order.map(function (v) { return NAMES[v]; }).join(', ');
    }
    function usedBy(col, v) {
        return ADJ[v].filter(function (u) { return col[u] > 0; });
    }
    function neighborColors(col, v) {
        return usedBy(col, v).map(function (u) { return NAMES[u] + '(색 ' + col[u] + ')'; }).join(', ');
    }
    function usedColors(col, v) {
        var out = [];
        usedBy(col, v).forEach(function (u) { if (out.indexOf(col[u]) < 0) out.push(col[u]); });
        return out.sort(function (x, y) { return x - y; });
    }
    function pickColor(col, v) {
        var used = usedBy(col, v).map(function (u) { return col[u]; });
        var c = 1;
        while (used.indexOf(c) >= 0) c++;
        return c;
    }
    function maxColor(col) {
        var m = 0;
        col.forEach(function (c) { if (c > m) m = c; });
        return m;
    }
    function gstep(col, order, cur, tryC, bad, cap, cap2, cap3, log) {
        return { col: col.slice(), order: order, cur: cur, tryC: tryC, bad: bad, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function greedyRun(order) {
        var col = zeros();
        order.forEach(function (v) { col[v] = pickColor(col, v); });
        return col;
    }

    /* ===================== 데이터: 그리디 색칠 ===================== */
    var GREEDY_STEPS = [];
    (function () {
        var col = zeros();
        var order = DEG_ORDER;
        GREEDY_STEPS.push(gstep(col, order, -1, 0, [], '', '', '', '그래프 색칠은 간선으로 이어진 두 정점이 서로 다른 색을 갖도록 모든 정점에 색을 칠하는 문제이고, 되도록 적은 색을 쓰는 것이 목표입니다. 그리디 방식은 정점을 정해진 순서로 하나씩 보면서 이웃이 쓰지 않는 가장 작은 번호의 색을 칠합니다. 여기서는 이웃이 많은(차수가 큰) 정점부터 ' + orderText(order) + ' 순서로 칠합니다.'));
        order.forEach(function (v) {
            var c = pickColor(col, v);
            var nb = usedBy(col, v);
            var usedList = usedColors(col, v);
            col[v] = c;
            GREEDY_STEPS.push(gstep(col, order, v, c, nb,
                NAMES[v] + ' → 색 ' + c,
                nb.length ? '금지 색 ' + usedList.join(', ') : '금지 색 없음',
                '지금까지 쓴 색 ' + maxColor(col) + '개',
                '정점 ' + NAMES[v] + '의 이웃은 ' + nameList(ADJ[v]) + '입니다. ' + (nb.length ? '이 중 이미 칠해진 이웃은 ' + neighborColors(col, v) + '입니다. 이웃이 쓰는 색은 쓸 수 없으므로 남은 가장 작은 번호인 색 ' + c + ju(c, '을', '를') + ' 칠합니다.' : '아직 칠해진 이웃이 없어 금지된 색이 없으므로 가장 작은 번호인 색 1을 칠합니다.')));
        });
        var maxDeg = 0;
        ADJ.forEach(function (a) { if (a.length > maxDeg) maxDeg = a.length; });
        GREEDY_STEPS.push(gstep(col, order, -1, 0, [], '색 ' + maxColor(col) + '개로 완성', '최대 차수 ' + maxDeg + ' → 그리디는 최대 ' + (maxDeg + 1) + '색 이하', '',
            '정리 — 색 ' + maxColor(col) + '개로 모든 정점을 칠했습니다. 그리디는 정점마다 이웃 수보다 하나 많은 색만 있으면 항상 칠할 수 있으므로, 최대 차수가 ' + maxDeg + '인 이 그래프는 어떤 순서로도 ' + (maxDeg + 1) + '색 이하로 칠합니다. A, B, C는 서로 이웃이라 최소 3색이 필요하므로 이 결과가 최소입니다.'));
    })();

    /* ===================== 데이터: 정점 순서의 영향 ===================== */
    var ORDER_STEPS = [];
    var DEG_COL = greedyRun(DEG_ORDER);
    (function () {
        var col = zeros();
        var order = NAT_ORDER;
        ORDER_STEPS.push(gstep(col, order, -1, 0, [], '', '', '', '같은 그래프를 정점 순서만 바꿔 칠해 봅니다. 그리디가 쓰는 색의 수는 정점을 보는 순서에 따라 달라질 수 있습니다. 먼저 알파벳 순서 ' + orderText(order) + '로 칠합니다.'));
        order.forEach(function (v) {
            var c = pickColor(col, v);
            var nb = usedBy(col, v);
            var usedList = usedColors(col, v);
            col[v] = c;
            var extra = c > 3 ? ' 색 1, 2, 3이 모두 이웃에게 쓰이고 있어 네 번째 색이 필요해집니다.' : '';
            ORDER_STEPS.push(gstep(col, order, v, c, nb,
                NAMES[v] + ' → 색 ' + c,
                nb.length ? '금지 색 ' + usedList.join(', ') : '금지 색 없음',
                '지금까지 쓴 색 ' + maxColor(col) + '개',
                '정점 ' + NAMES[v] + (nb.length ? '의 칠해진 이웃은 ' + neighborColors(col, v) + '입니다. 이웃이 쓰는 색을 뺀 가장 작은 번호인 색 ' + c + ju(c, '을', '를') + ' 칠합니다.' : '는 아직 칠해진 이웃이 없어 색 1을 칠합니다.') + extra));
        });
        ORDER_STEPS.push(gstep(DEG_COL, DEG_ORDER, -1, 0, [], '순서를 ' + orderText(DEG_ORDER) + '로 바꾸면 색 ' + maxColor(DEG_COL) + '개', '알파벳 순서는 색 ' + maxColor(col) + '개', '',
            '정리 — 알파벳 순서로는 색 ' + maxColor(col) + '개가 필요했지만, 차수가 큰 ' + orderText(DEG_ORDER) + ' 순서로 칠하면 색 ' + maxColor(DEG_COL) + '개로 끝납니다. 그리디는 순서에 따라 최소보다 많은 색을 쓸 수 있습니다. 이웃이 많은 정점부터 보는 순서는 Welsh-Powell 방법으로 알려져 있지만, 이것도 항상 최소 색을 보장하지는 않습니다.'));
    })();

    /* ===================== 데이터: 백트래킹 ===================== */
    var BACK_STEPS = [];
    var BACK_M = 3;
    (function () {
        var col = zeros();
        var attempts = 0;
        var backs = 0;
        BACK_STEPS.push(gstep(col, NAT_ORDER, -1, 0, [], '', '', '', '백트래킹은 정점을 순서대로 보며 색을 하나씩 시도합니다. 이웃과 충돌하면 다음 색을 시도하고, 모든 색이 충돌하면 앞 정점에서 한 선택을 취소하고(되돌아가기) 다른 색을 시도합니다. 색을 ' + BACK_M + '가지(색 1~' + BACK_M + ')만 써서 ' + orderText(NAT_ORDER) + ' 순서로 칠할 수 있는지 찾습니다.'));
        function rec(v) {
            if (v === N) return true;
            var c;
            for (c = 1; c <= BACK_M; c++) {
                var bad = ADJ[v].filter(function (u) { return col[u] === c; });
                attempts++;
                if (bad.length) {
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, c, bad, NAMES[v] + ' · 색 ' + c + ' 시도', '충돌: ' + nameList(bad) + '가 색 ' + c + ' 사용', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v] + '에 색 ' + c + ju(c, '을', '를') + ' 시도합니다. 이웃 ' + nameList(bad) + '가 이미 색 ' + c + ju(c, '을', '를') + ' 쓰고 있어 충돌하므로 다음 색으로 넘어갑니다.'));
                } else {
                    col[v] = c;
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, c, [], NAMES[v] + ' · 색 ' + c + ' 시도', '충돌 없음 → 색 ' + c + ' 배정', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v] + '에 색 ' + c + ju(c, '을', '를') + ' 시도합니다. 칠해진 이웃과 겹치지 않으므로 배정하고 다음 정점으로 넘어갑니다.'));
                    if (rec(v + 1)) return true;
                    col[v] = 0;
                    backs++;
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, 0, [], '되돌아가기 · ' + NAMES[v] + '의 색 취소', '다음 색을 시도', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v + 1] + '에 쓸 수 있는 색이 없습니다. 앞 정점 ' + NAMES[v] + '의 색 ' + c + ' 선택을 취소하고(되돌아가기) ' + NAMES[v] + '에 다음 색을 시도합니다.'));
                }
            }
            return false;
        }
        rec(0);
        BACK_STEPS.push(gstep(col, NAT_ORDER, -1, 0, [], BACK_M + '색으로 완성', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs, '',
            '정리 — 색 ' + BACK_M + '개로 모든 정점을 칠했고, 되돌아간 것은 ' + backs + '번입니다. 되돌아가기 덕분에 한 번 잘못 고른 색도 고칠 수 있습니다. 대신 최악에는 ' + BACK_M + '^' + N + '가지 배정을 모두 살펴봐야 해서 정점이 많아지면 시간이 급격히 늘어납니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'greedy';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'order') return ORDER_STEPS;
        if (mode === 'back') return BACK_STEPS;
        return GREEDY_STEPS;
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

    /* ===================== 공통: 그래프와 정점 순서 그리기 ===================== */
    var COLORS = ['', 'teal', 'orange', 'purple', 'red', 'yellow'];
    function colorOf(c) {
        return c > 0 ? P[COLORS[c]] : P.sub;
    }
    function drawGC(x0, top, w, mob, step) {
        var col = step ? step.col : zeros();
        var order = step ? step.order : (mode === 'greedy' ? DEG_ORDER : NAT_ORDER);
        var cur = step ? step.cur : -1;
        var bad = step ? step.bad : [];
        var tryC = step ? step.tryC : 0;
        var fs = mob ? 11.5 : 13;
        var r = mob ? 17 : 20;
        var gh = mob ? 200 : 240;
        var gx = x0 + r + 6;
        var gw = w - 2 * (r + 6);
        function px(v) { return gx + POS[v][0] * gw; }
        function py(v) { return top + r + 8 + POS[v][1] * (gh - 2 * r - 16); }
        var i;
        EDGES.forEach(function (e) {
            var hot = (e[0] === cur && bad.indexOf(e[1]) >= 0) || (e[1] === cur && bad.indexOf(e[0]) >= 0);
            ctx.beginPath();
            ctx.moveTo(px(e[0]), py(e[0]));
            ctx.lineTo(px(e[1]), py(e[1]));
            ctx.strokeStyle = hot ? P.red + 'ff' : P.sub + '88';
            ctx.lineWidth = hot ? 3 : 1.6;
            ctx.stroke();
        });
        for (i = 0; i < N; i++) {
            var c = col[i];
            var isCur = i === cur;
            var isBad = bad.indexOf(i) >= 0;
            var base = c > 0 ? colorOf(c) : P.sub;
            if (isCur && tryC > 0 && c === 0) base = colorOf(tryC);
            ctx.beginPath();
            ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
            ctx.fillStyle = (c > 0 || (isCur && tryC > 0) ? base + '55' : P.surf2);
            ctx.fill();
            ctx.strokeStyle = (isCur ? P.yellow : isBad ? P.red : base) + 'ff';
            ctx.lineWidth = isCur || isBad ? 3 : 1.8;
            ctx.stroke();
            tx(NAMES[i], px(i), py(i) - 1, fs + 1, P.text + 'ff', 'center', true);
            if (c > 0) tx('색 ' + c, px(i), py(i) + r + 11, fs - 1.5, base + 'ff', 'center', true);
        }
        var sy = top + gh + 14;
        var cw = Math.min(50, (w - 56) / N);
        var sx0 = x0 + 56 + (w - 56 - cw * N) / 2;
        tx('순서', x0, sy + 17, fs - 1, P.sub + 'ee', 'left', true);
        for (i = 0; i < N; i++) {
            var v = order[i];
            var cc = col[v];
            var onCur = v === cur;
            rr(sx0 + i * cw + 2, sy, cw - 4, 34, 4, cc > 0 ? colorOf(cc) + '33' : 'none', (onCur ? P.yellow : cc > 0 ? colorOf(cc) : P.sub) + (onCur || cc > 0 ? 'ff' : '88'), onCur ? 2.4 : 1.3);
            tx(NAMES[v], sx0 + i * cw + cw / 2, sy + 11, fs - 0.5, P.text + 'ff', 'center', true);
            tx(cc > 0 ? String(cc) : '·', sx0 + i * cw + cw / 2, sy + 25, fs - 1, cc > 0 ? colorOf(cc) + 'ff' : P.sub + 'cc', 'center', true);
        }
        var at = sy + 52;
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

        drawGC(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 그래프 색칠의 동작을 확인하세요.';
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
        neededH = mob ? 380 : 410;
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
        if (mode === 'order') return '같은 그래프를 정점 순서만 바꿔 칠하면 필요한 색의 수가 어떻게 달라지는지 봅니다.';
        if (mode === 'back') return '색을 시도하다 막히면 되돌아가 다른 색을 시도하는 백트래킹을 봅니다.';
        return '이웃이 쓰지 않는 가장 작은 번호의 색을 정점마다 칠하는 그리디 방식을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('gc-viz__speed-btn--active'); });
        btn.classList.add('gc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('gc-viz__mode-btn--active', d.key === m); });
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