/**
 * LRU 캐시 구현 시각화
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
    var root    = el('div', 'lru-viz');
    var toolbar = el('div', 'lru-viz__toolbar');
    var tbLeft  = el('div', 'lru-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'lru-viz__title', 'LRU CACHE'));

    var modeWrap = el('div', 'lru-viz__mode');
    var modeDefs = [
        { key: 'build', label: '구조' },
        { key: 'get', label: '조회' },
        { key: 'evict', label: '제거' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'lru-viz__mode-btn' + (i === 0 ? ' lru-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'lru-viz__speed');
    speedWrap.appendChild(el('span', 'lru-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'lru-viz__speed-btn' + (i === 0 ? ' lru-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'lru-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'lru-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'lru-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'lru-viz__controls');
    var btnPlay  = el('button', 'lru-viz__btn lru-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'lru-viz__btn', '▶| STEP');
    var btnReset = el('button', 'lru-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: LRU 캐시 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var CAP = 3;
    function nd(k, v) { return { k: k, v: v }; }
    function lstep(list, held, cur, victim, cap, cap2, cap3, log) {
        return {
            list: list.map(function (n) { return nd(n.k, n.v); }),
            keys: list.map(function (n) { return n.k; }).concat(held ? [held.k] : []),
            held: held, cur: cur, victim: victim, cap: cap, cap2: cap2, cap3: cap3, log: log
        };
    }

    /* ===================== 데이터: 구조 ===================== */
    var BUILD_STEPS = [];
    (function () {
        var list = [];
        BUILD_STEPS.push(lstep(list, null, 0, 0, '', '', '', 'LRU 캐시는 용량이 가득 차면 가장 오래 쓰지 않은 항목을 버리는 캐시입니다. 해시맵으로 키에서 노드를 바로 찾고, 이중 연결 리스트로 사용 순서를 관리합니다. 왼쪽이 가장 최근에 쓴 쪽(MRU), 오른쪽이 가장 오래된 쪽(LRU)입니다. 용량은 ' + CAP + '입니다.'));
        [[1, 'A'], [2, 'B'], [3, 'C']].forEach(function (kv) {
            list.unshift(nd(kv[0], kv[1]));
            BUILD_STEPS.push(lstep(list, null, kv[0], 0, 'put(' + kv[0] + ', ' + kv[1] + ')', '항목 ' + list.length + '개 / 용량 ' + CAP, '',
                'put(' + kv[0] + ', ' + kv[1] + ') — 키 ' + kv[0] + ju(kv[0], '은', '는') + ' 캐시에 없으므로 새 노드를 만들어 리스트 맨 앞에 넣고, 해시맵에 키 ' + kv[0] + ' → 노드를 등록합니다. 둘 다 O(1)입니다.'));
        });
        BUILD_STEPS.push(lstep(list, null, 0, list[list.length - 1].k, '용량 ' + CAP + '이 가득 참', '다음 삽입 때 제거 후보: 키 ' + list[list.length - 1].k, '',
            '정리 — 리스트는 사용 순서(왼쪽이 최근)를 담고, 해시맵은 키로 노드를 바로 찾게 해 줍니다. 용량 ' + CAP + '이 가득 찼고, 다음 삽입에서는 맨 오른쪽(LRU)인 키 ' + list[list.length - 1].k + ju(list[list.length - 1].k, '이', '가') + ' 제거 후보(빨간색)입니다.'));
    })();

    /* ===================== 데이터: 조회 ===================== */
    var GET_STEPS = [];
    (function () {
        var list = [nd(3, 'C'), nd(2, 'B'), nd(1, 'A')];
        GET_STEPS.push(lstep(list, null, 0, 0, '', '', '', '용량 ' + CAP + '인 캐시에 1, 2, 3을 넣어 리스트가 3, 2, 1 순서입니다. get(1)을 실행해 조회한 항목이 어떻게 맨 앞으로 이동하는지 봅니다.'));
        GET_STEPS.push(lstep(list, null, 1, 0, 'get(1) · 해시맵 조회', '키 1 → 노드 (O(1))', '', 'get(1) — 해시맵에서 키 1로 노드를 바로 찾습니다. 리스트를 처음부터 훑지 않으므로 O(1)입니다.'));
        var node = list.pop();
        GET_STEPS.push(lstep(list, node, 1, 0, 'get(1) · 노드 떼기', '앞뒤 노드의 포인터만 수정', '', 'get(1) — 찾은 노드를 이중 연결 리스트에서 떼어 냅니다. 이웃 노드의 포인터만 고치면 되어 O(1)입니다.'));
        list.unshift(node);
        GET_STEPS.push(lstep(list, null, 1, 0, 'get(1) · 맨 앞에 삽입', '최근 1 · 오래됨 ' + list[list.length - 1].k, '', 'get(1) — 노드를 맨 앞에 다시 끼워 넣습니다. 이제 키 1' + ju(1, '이', '가') + ' 가장 최근에 사용된 항목이고, 맨 뒤의 키 ' + list[list.length - 1].k + ju(list[list.length - 1].k, '이', '가') + ' 가장 오래된 항목입니다.'));
        GET_STEPS.push(lstep(list, null, 0, 0, 'get(9) · 해시맵에 키 9 없음', '리스트는 그대로 · None 반환', '', 'get(9) — 해시맵에 키 9가 없습니다. 캐시 미스이므로 리스트를 건드리지 않고 None을 돌려줍니다.'));
        GET_STEPS.push(lstep(list, null, 0, 0, '조회는 모두 O(1)', '', '', '정리 — 조회는 해시맵 찾기, 노드 떼기, 맨 앞 삽입으로 이루어지고 모두 O(1)입니다. 조회할 때마다 그 항목이 맨 앞으로 오므로, 맨 뒤는 늘 가장 오래 쓰지 않은 항목이 됩니다.'));
    })();

    /* ===================== 데이터: 제거 ===================== */
    var EV_STEPS = [];
    (function () {
        var list = [nd(1, 'A'), nd(3, 'C'), nd(2, 'B')];
        EV_STEPS.push(lstep(list, null, 0, 0, '', '', '', '용량 ' + CAP + '인 캐시가 가득 찬 상태에서 put(4, D)를 합니다. 앞의 조회 뒤라 리스트는 1, 3, 2 순서이고 맨 뒤가 키 2입니다.'));
        EV_STEPS.push(lstep(list, null, 0, 0, 'put(4, D) · 새 키', '해시맵에 키 4 없음 · ' + list.length + ' / ' + CAP, '', 'put(4, D) — 해시맵에 키 4가 없어 새 항목입니다. 그런데 항목이 ' + list.length + '개로 용량 ' + CAP + '이 가득 차 있어 하나를 버려야 합니다.'));
        var vic = list[list.length - 1].k;
        EV_STEPS.push(lstep(list, null, 0, vic, '제거 대상 · 키 ' + vic, '맨 뒤 = 가장 오래 쓰지 않음', '', '맨 뒤 노드가 가장 오래 쓰지 않은 항목이므로 키 ' + vic + ju(vic, '을', '를') + ' 제거 대상으로 고릅니다. 삽입 순서가 아니라 사용 순서가 기준이라, 가장 먼저 들어온 키 1이 아니라는 점에 주의하세요.'));
        list.pop();
        EV_STEPS.push(lstep(list, null, 0, 0, '키 ' + vic + ' 제거', '리스트와 해시맵 모두에서 삭제', '', '맨 뒤 노드를 리스트에서 떼고, 해시맵에서도 키 ' + vic + ju(vic, '을', '를') + ' 지웁니다. 둘 다 O(1)입니다.'));
        list.unshift(nd(4, 'D'));
        EV_STEPS.push(lstep(list, null, 4, 0, 'put(4, D) · 맨 앞에 삽입', '항목 ' + list.length + '개 / 용량 ' + CAP, '', '새 노드를 맨 앞에 넣고 해시맵에 키 4를 등록합니다. 용량 ' + CAP + '을 지켰습니다.'));
        EV_STEPS.push(lstep(list, null, 3, 0, 'put(3, E) · 이미 있는 키', '해시맵으로 노드를 찾아 값을 E로 변경', '', 'put(3, E) — 키 3은 이미 있습니다. 해시맵으로 노드를 찾고 값을 E로 바꿉니다. 새 항목이 아니라서 제거는 일어나지 않습니다.'));
        var idx = 0;
        list.forEach(function (n, i) { if (n.k === 3) idx = i; });
        var n3 = list.splice(idx, 1)[0];
        n3.v = 'E';
        list.unshift(n3);
        EV_STEPS.push(lstep(list, null, 3, 0, 'put(3, E) · 맨 앞으로 이동', '값을 바꿔도 사용한 것', '', '값을 바꾼 항목도 사용한 것이므로 맨 앞으로 옮깁니다. 리스트는 3, 4, 1 순서가 됩니다.'));
        EV_STEPS.push(lstep(list, null, 0, 0, '제거 대상은 사용 순서로 결정', '', '', '정리 — FIFO였다면 가장 먼저 들어온 키 1이 제거됐겠지만, 키 1은 방금 조회돼 최근 쪽에 있어서 LRU는 키 2를 제거했습니다. put은 해시맵 조회, 필요하면 맨 뒤 제거, 맨 앞 삽입으로 이루어져 O(1)입니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'build';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'get') return GET_STEPS;
        if (mode === 'evict') return EV_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 리스트와 해시맵 그리기 ===================== */
    function drawLRU(x0, top, w, mob, step) {
        var list = step ? step.list : [nd(3, 'C'), nd(2, 'B'), nd(1, 'A')];
        var keys = step ? step.keys : [];
        var held = step ? step.held : null;
        var cur = step ? step.cur : 0;
        var victim = step ? step.victim : 0;
        var fs = mob ? 10.5 : 12;
        var slot = w / CAP;
        var bw = Math.min(64, slot - (mob ? 24 : 34));
        var bh = mob ? 26 : 28;
        var ly = top + 80;
        function nx(i) { return x0 + (i + 0.5) * slot; }
        tx('MRU 최근', x0 + 2, top + 8, fs - 1.5, P.sub + 'ee', 'left', true);
        tx('LRU 오래됨', x0 + w - 2, top + 8, fs - 1.5, P.sub + 'ee', 'right', true);
        var i;
        for (i = 0; i < list.length - 1; i++) {
            var ax = nx(i) + bw / 2 + 2;
            var bx = nx(i + 1) - bw / 2 - 2;
            ctx.beginPath();
            ctx.moveTo(ax, ly);
            ctx.lineTo(bx, ly);
            ctx.strokeStyle = P.sub + 'cc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ax, ly);
            ctx.lineTo(ax + 5, ly - 3);
            ctx.lineTo(ax + 5, ly + 3);
            ctx.closePath();
            ctx.moveTo(bx, ly);
            ctx.lineTo(bx - 5, ly - 3);
            ctx.lineTo(bx - 5, ly + 3);
            ctx.closePath();
            ctx.fillStyle = P.sub + 'cc';
            ctx.fill();
        }
        var cy = top + 156;
        var cwid = w / 4;
        tx('해시맵', x0 + 2, cy - 22, fs - 1.5, P.sub + 'ee', 'left', true);
        keys.forEach(function (k) {
            var li = -1;
            list.forEach(function (n, j) { if (n.k === k) li = j; });
            var chx = x0 + (k - 0.5) * cwid;
            if (li >= 0) {
                ctx.beginPath();
                ctx.setLineDash(k === cur ? [] : [3, 3]);
                ctx.moveTo(chx, cy - 10);
                ctx.lineTo(nx(li), ly + bh / 2 + 1);
                ctx.strokeStyle = (k === cur ? P.yellow : P.sub) + (k === cur ? 'ff' : '88');
                ctx.lineWidth = k === cur ? 2 : 1.2;
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
        for (var k = 1; k <= 4; k++) {
            var chx2 = x0 + (k - 0.5) * cwid;
            var has = keys.indexOf(k) >= 0;
            var col = k === victim ? P.red : (k === cur ? P.yellow : P.teal);
            if (has) {
                rr(chx2 - 14, cy - 10, 28, 20, 4, col + '30', col + 'ff', k === cur || k === victim ? 2.2 : 1.3);
                tx(String(k), chx2, cy, fs - 0.5, P.text + 'ff', 'center', true);
            } else {
                rr(chx2 - 14, cy - 10, 28, 20, 4, 'none', P.sub + '55', 1);
            }
        }
        list.forEach(function (n, j) {
            var col2 = n.k === victim ? P.red : (n.k === cur ? P.yellow : P.teal);
            rr(nx(j) - bw / 2, ly - bh / 2, bw, bh, 5, col2 + '30', col2 + 'ff', n.k === cur || n.k === victim ? 2.4 : 1.4);
            tx(n.k + ':' + n.v, nx(j), ly, fs, P.text + 'ff', 'center', true);
        });
        if (held) {
            rr(x0 + w / 2 - bw / 2, top + 34, bw, bh - 4, 5, P.yellow + '30', P.yellow + 'ff', 2.4);
            tx(held.k + ':' + held.v, x0 + w / 2, top + 34 + (bh - 4) / 2, fs, P.text + 'ff', 'center', true);
        }
        var capY = cy + 34;
        if (step && step.cap) tx(step.cap, x0 + w / 2, capY, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, capY + 18, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, capY + 36, fs - 1, P.green + 'ee', 'center', true);
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

        drawLRU(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 LRU 캐시의 동작을 확인하세요.';
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
        neededH = mob ? 265 : 280;
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
        if (mode === 'get') return '조회한 항목이 리스트 맨 앞으로 이동하는 과정을 봅니다.';
        if (mode === 'evict') return '용량이 가득 찼을 때 맨 뒤 항목이 제거되는 과정을 봅니다.';
        return '해시맵과 이중 연결 리스트가 함께 사용 순서를 관리하는 구조를 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('lru-viz__speed-btn--active'); });
        btn.classList.add('lru-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('lru-viz__mode-btn--active', d.key === m); });
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