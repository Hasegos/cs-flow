/**
 * 블룸 필터 시각화
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
    tbLeft.appendChild(el('span', 'bf-viz__title', 'BLOOM FILTER'));

    var modeWrap = el('div', 'bf-viz__mode');
    var modeDefs = [
        { key: 'add', label: '추가' },
        { key: 'query', label: '조회' },
        { key: 'delete', label: '삭제 불가' }
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

    /* ===================== 엔진: 블룸 필터 ===================== */
    var M = 16;
    var K = 3;
    function djb2(s) {
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
        return h;
    }
    function fnv(s) {
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
        return h;
    }
    function positions(w) {
        var a = djb2(w);
        var b = (fnv(w) | 1) >>> 0;
        var out = [];
        for (var i = 0; i < K; i++) out.push((a + i * b) % M);
        return out;
    }
    function listPos(p) { return p.join(', '); }
    function emptyBits() {
        var b = [];
        for (var i = 0; i < M; i++) b.push(0);
        return b;
    }
    function ones(bits) {
        var c = 0;
        bits.forEach(function (v) { c += v; });
        return c;
    }
    function bstep(bits, head, targets, kind, cap, cap2, cap3, log) {
        return { bits: bits.slice(), head: head, targets: targets, kind: kind, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    var ADDED = ['apple', 'banana', 'cherry'];

    /* ===================== 데이터: 추가 ===================== */
    var ADD_STEPS = [];
    var AFTER = emptyBits();
    (function () {
        var bits = emptyBits();
        ADD_STEPS.push(bstep(bits, '', [], 'add', '', '', '', '블룸 필터(Bloom filter)는 원소가 "있을 수도 있다"와 "확실히 없다"만 알려 주는 대신 메모리를 아주 적게 쓰는 확률적 자료구조입니다. 비트 배열 ' + M + '칸과 해시 함수 ' + K + '개로 만듭니다. 원소를 추가하면 해시 함수가 가리키는 ' + K + '칸을 1로 켭니다. 처음에는 모든 칸이 0입니다.'));
        ADDED.forEach(function (w) {
            var p = positions(w);
            var already = p.filter(function (x) { return bits[x] === 1; });
            ADD_STEPS.push(bstep(bits, 'add("' + w + '")', p, 'add', '해시 위치 ' + listPos(p), '', '',
                'add("' + w + '") — 해시 함수 ' + K + '개가 ' + w + '의 위치 ' + listPos(p) + '를 가리킵니다. 이 칸들을 1로 켜면 추가가 끝납니다.'));
            p.forEach(function (x) { bits[x] = 1; });
            ADD_STEPS.push(bstep(bits, 'add("' + w + '")', p, 'add', '켜진 칸 ' + ones(bits) + '개 / ' + M + '칸', already.length ? '이미 1이던 칸: ' + listPos(already) : '', '',
                '칸 ' + listPos(p) + '를 1로 켰습니다. 켜진 칸은 모두 ' + ones(bits) + '개입니다.' + (already.length ? ' 칸 ' + listPos(already) + '는 앞서 추가한 원소가 이미 켜 둔 칸이라 칸을 서로 공유합니다.' : '')));
        });
        AFTER = bits.slice();
        ADD_STEPS.push(bstep(bits, '', [], 'add', '원소 ' + ADDED.length + '개 · 비트 ' + M + '개 · 켜진 칸 ' + ones(bits) + '개', '', '',
            '정리 — 원소 ' + ADDED.length + '개를 넣는 데 비트 ' + M + '개만 썼습니다. 원소 자체는 저장하지 않으므로 어떤 원소가 들어 있는지 꺼내 볼 수는 없고, 있는지만 물어볼 수 있습니다.'));
    })();

    /* ===================== 데이터: 조회 ===================== */
    var QUERIES = ['apple', 'mango', 'grape'];
    var QUERY_STEPS = [];
    (function () {
        QUERY_STEPS.push(bstep(AFTER, '', [], 'q', '', '', '', 'query는 원소의 해시 위치 ' + K + '칸을 모두 확인합니다. 하나라도 0이면 "확실히 없다", 모두 1이면 "있을 수도 있다"입니다. apple, banana, cherry를 추가한 필터에서 세 가지 경우를 차례로 봅니다.'));
        QUERIES.forEach(function (w) {
            var p = positions(w);
            var allOne = p.every(function (x) { return AFTER[x] === 1; });
            var actually = ADDED.indexOf(w) >= 0;
            var head = 'query("' + w + '")';
            var bitsTxt = p.map(function (x) { return AFTER[x]; }).join(', ');
            var cap = allOne ? '모두 1 → 있을 수도 있음' : '0이 있음 → 확실히 없음';
            var log;
            if (allOne && actually) {
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값이 모두 1이라 "있을 수도 있다"고 답합니다. 실제로 추가한 원소이므로 맞는 답입니다.';
            } else if (allOne) {
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값이 모두 1이라 "있을 수도 있다"고 답합니다. 하지만 ' + w + '는 추가한 적이 없습니다. 다른 원소들이 켠 칸과 우연히 겹친 거짓 양성(false positive)입니다.';
            } else {
                var zero = p.filter(function (x) { return AFTER[x] === 0; });
                log = 'query("' + w + '") — 위치 ' + listPos(p) + '의 값은 ' + bitsTxt + '입니다. 칸 ' + listPos(zero) + '가 0이므로 추가한 적이 없다고 확신할 수 있습니다. "확실히 없다"고 답하며 거짓 음성은 없습니다.';
            }
            QUERY_STEPS.push(bstep(AFTER, head, p, 'q', cap, '위치 ' + listPos(p) + ' → 값 ' + bitsTxt, actually ? '실제로 추가한 원소' : '추가한 적 없는 원소', log));
        });
        var fp = Math.pow(1 - Math.pow(1 - 1 / M, K * ADDED.length), K) * 100;
        QUERY_STEPS.push(bstep(AFTER, '', [], 'q', '"없다"는 항상 맞고 "있다"는 틀릴 수 있음', '거짓 양성 확률 약 ' + fp.toFixed(1) + '%', '',
            '정리 — "없다"는 항상 맞고(거짓 음성 없음) "있다"는 틀릴 수 있습니다(거짓 양성). 거짓 양성 확률은 대략 (1 - (1 - 1/m)^(kn))^k이고, 이 예(m = ' + M + ', k = ' + K + ', n = ' + ADDED.length + ')에서는 약 ' + fp.toFixed(1) + '%입니다. 칸 수 m을 크게 잡을수록 확률이 낮아집니다.'));
    })();

    /* ===================== 데이터: 삭제 불가 ===================== */
    var DEL_STEPS = [];
    (function () {
        var bits = AFTER.slice();
        DEL_STEPS.push(bstep(bits, '', [], 'del', '', '', '', '앞에서 만든 필터(apple, banana, cherry 추가)에서 apple을 지우려고 하면 어떻게 되는지 봅니다. 한 칸을 여러 원소가 공유할 수 있다는 점이 문제입니다.'));
        var pa = positions('apple');
        var others = [];
        ['banana', 'cherry'].forEach(function (w) { positions(w).forEach(function (x) { if (others.indexOf(x) < 0) others.push(x); }); });
        var shared = pa.filter(function (x) { return others.indexOf(x) >= 0; });
        pa.forEach(function (x) { bits[x] = 0; });
        DEL_STEPS.push(bstep(bits, 'delete("apple")', pa, 'del', '칸 ' + listPos(pa) + ' → 0', '다른 원소와 공유한 칸: ' + listPos(shared), '',
            'apple의 칸 ' + listPos(pa) + '를 0으로 끕니다. 그런데 칸 ' + listPos(shared) + '는 다른 원소도 쓰던 칸이었습니다.'));
        var pb = positions('banana');
        var zero = pb.filter(function (x) { return bits[x] === 0; });
        DEL_STEPS.push(bstep(bits, 'query("banana")', pb, 'q', '칸 ' + listPos(zero) + '가 0 → 확실히 없음', 'banana는 추가된 원소인데도', '거짓 음성',
            'query("banana") — 위치 ' + listPos(pb) + ' 가운데 ' + listPos(zero) + '가 0이라 "확실히 없다"고 답합니다. 하지만 banana는 추가된 원소입니다. 칸을 공유한 apple을 지우면서 banana의 흔적까지 지워졌습니다.'));
        DEL_STEPS.push(bstep(bits, '', [], 'del', '삭제하면 거짓 음성이 생길 수 있음', '', '',
            '정리 — 표준 블룸 필터는 삭제하면 거짓 음성이 생길 수 있어 삭제를 지원하지 않습니다. 삭제가 필요하면 칸마다 비트 대신 카운터를 두는 Counting Bloom filter를 씁니다. 대신 칸당 메모리가 늘어납니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'add';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'delete') return DEL_STEPS;
        return ADD_STEPS;
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

    /* ===================== 공통: 비트 배열 그리기 ===================== */
    function drawBF(x0, top, w, mob, step) {
        var bits = step ? step.bits : emptyBits();
        var targets = step ? step.targets : [];
        var kind = step ? step.kind : 'add';
        var fs = mob ? 11 : 12.5;
        var per = M / 2;
        var cw = w / per;
        var bw = Math.min(58, cw - 6);
        var bh = mob ? 34 : 38;
        var rowGap = mob ? 62 : 68;
        var ty = top + 8;
        if (step && step.head) tx(step.head, x0 + w / 2, ty, fs, P.yellow + 'ff', 'center', true);
        for (var i = 0; i < M; i++) {
            var r = Math.floor(i / per);
            var c = i % per;
            var cx = x0 + (c + 0.5) * cw;
            var y = top + 28 + r * rowGap;
            var on = bits[i] === 1;
            var tIdx = targets.indexOf(i);
            var col = on ? P.teal : P.sub;
            var ring = null;
            if (tIdx >= 0) {
                if (kind === 'add') ring = P.orange;
                else if (kind === 'del') ring = P.red;
                else ring = on ? P.green : P.red;
            }
            rr(cx - bw / 2, y, bw, bh, 5, on ? P.teal + '35' : 'none', (ring || col) + (ring || on ? 'ff' : '88'), ring ? 2.6 : 1.3);
            tx(String(i), cx, y + 9, fs - 1.5, P.sub + 'ee', 'center', true);
            tx(String(bits[i]), cx, y + bh - 11, fs + 1, on ? P.text + 'ff' : P.sub + 'ee', 'center', true);
            if (tIdx >= 0) tx('h' + tIdx, cx, y + bh + 11, fs - 1, (ring || P.orange) + 'ff', 'center', true);
        }
        var capY = top + 28 + rowGap + bh + 32;
        if (step && step.cap) tx(step.cap, x0 + w / 2, capY, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, capY + 19, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, capY + 38, fs - 1, P.green + 'ee', 'center', true);
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
            var hint = '아래 STEP으로 블룸 필터의 동작을 확인하세요.';
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
        neededH = mob ? 290 : 310;
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
        if (mode === 'query') return '해시 위치의 칸이 모두 1인지 확인해 "있을 수도 있다"와 "확실히 없다"를 가려 봅니다.';
        if (mode === 'delete') return '칸을 공유한 원소를 지우면 어떤 문제가 생기는지 봅니다.';
        return '원소를 추가할 때 해시 위치의 칸이 켜지는 모습을 봅니다.';
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