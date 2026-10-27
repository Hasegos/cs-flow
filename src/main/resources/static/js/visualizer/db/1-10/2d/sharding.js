/**
 * 샤딩(Sharding) 시각화
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
    var root    = el('div', 'sharding-viz');
    var toolbar = el('div', 'sharding-viz__toolbar');
    var tbLeft  = el('div', 'sharding-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sharding-viz__title', 'SHARD ROUTER'));

    var modeWrap = el('div', 'sharding-viz__mode');
    var modeDefs = [
        { key: 'hash', label: '해시 샤딩' },
        { key: 'range', label: '레인지 샤딩' },
        { key: 'hot', label: '핫스팟' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sharding-viz__mode-btn' + (i === 0 ? ' sharding-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sharding-viz__speed');
    speedWrap.appendChild(el('span', 'sharding-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sharding-viz__speed-btn' + (i === 0 ? ' sharding-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sharding-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sharding-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sharding-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sharding-viz__controls');
    var btnPlay  = el('button', 'sharding-viz__btn sharding-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sharding-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sharding-viz__btn', '↺ RESET');
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
    var mode    = 'hash';
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



    /* ===================== 장면 데이터: 샤딩 ===================== */
    var KEYS = [101, 205, 310, 450];
    var BOUNDS = [150, 300, 500];
    var RANGE_LABEL = ['1~150', '151~300', '301~500'];
    var HASH_LABEL = ['key % 3 = 0', 'key % 3 = 1', 'key % 3 = 2'];

    function hashShard(k) { return k % 3; }
    function rangeShard(k) {
        for (var i = 0; i < BOUNDS.length; i++) { if (k <= BOUNDS[i]) return i; }
        return BOUNDS.length - 1;
    }

    function buildSteps(kind) {
        var fn = kind === 'hash' ? hashShard : rangeShard;
        var steps = [{ log: kind === 'hash'
            ? '해시 샤딩은 키를 해시 함수(여기서는 % 3)에 넣어 나온 값으로 샤드를 정합니다. 키 네 개가 어느 샤드로 가는지 봅니다.'
            : '레인지 샤딩은 키의 범위마다 샤드를 정해 둡니다. 키 네 개가 어느 범위에 속하는지 봅니다.', key: null, shard: -1, placed: [[], [], []] }];
        var placed = [[], [], []];
        KEYS.forEach(function (key) {
            var sh = fn(key);
            var prev = placed.map(function (a) { return a.slice(); });
            placed[sh].push(key);
            var calc = kind === 'hash'
                ? key + ' % 3 = ' + sh
                : key + ' → 범위 ' + RANGE_LABEL[sh];
            steps.push({ key: key, shard: sh, calc: calc, prevPlaced: prev, placed: placed.map(function (a) { return a.slice(); }),
                log: '키 ' + key + ' → ' + calc + ' → Shard ' + (sh + 1) + '로 보냅니다.' });
        });
        var last = steps[steps.length - 1];
        steps.push({ key: null, shard: -1, placed: last.placed, prevPlaced: last.placed,
            log: kind === 'hash'
                ? '정리: 해시는 키를 고르게 흩뿌리지만, 범위 조회(예: 키 100~300)는 모든 샤드를 뒤져야 합니다.'
                : '정리: 레인지는 범위 조회가 한두 샤드에서 끝나지만, 키가 한쪽 범위에 몰리면 한 샤드만 바빠집니다.' });
        return steps;
    }

    var HASH_STEPS = buildSteps('hash');
    var RANGE_STEPS = buildSteps('range');

    var HOT_COUNT = [200, 200, 100];
    var HOT_STEPS = [
        { log: '범위 샤딩에서 id가 자동 증가하는 테이블이라면 어떻게 될까요? 샤드 세 개의 현재 저장 건수가 막대로 보입니다.', cnt: [200, 200, 100], hot: -1, burst: 0 },
        { log: '새 가입자 id 301~350이 들어옵니다. id가 커지는 순서라 모두 마지막 범위(Shard 3)로 갑니다.', cnt: [200, 200, 150], hot: 2, burst: 50 },
        { log: '이어서 351~400도 모두 Shard 3으로 갑니다. 다른 샤드는 쉬고 있습니다.', cnt: [200, 200, 200], hot: 2, burst: 50 },
        { log: '쓰기가 계속될수록 Shard 3만 계속 부풀고 느려집니다. 이것이 핫스팟(hotspot)입니다.', cnt: [200, 200, 300], hot: 2, burst: 100 },
        { log: '같은 id를 해시로 나누면 301, 302, 303이 서로 다른 샤드로 흩어져 쓰기가 고르게 퍼집니다. 대신 범위 조회는 모든 샤드를 봐야 합니다.', cnt: [250, 250, 250], hot: -1, burst: 0, spread: true }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'range') return RANGE_STEPS;
        if (mode === 'hot') return HOT_STEPS;
        return HASH_STEPS;
    }
    function defaultLog() {
        if (mode === 'range') return '키의 범위로 샤드를 정하는 레인지 샤딩을 봅니다.';
        if (mode === 'hot') return '레인지 샤딩에서 키가 한쪽으로 몰리는 핫스팟을 봅니다.';
        return '키를 해시해서 샤드를 정하는 해시 샤딩을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mob ? 330 : 318 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var e = clamp01(t);
        var hot = mode === 'hot';
        var s = step || (hot ? HOT_STEPS[0] : { key: null, shard: -1, placed: [[], [], []] });
        var cx = x0 + w / 2;
        var colW = w / 3;
        var shardW = Math.min(150, colW - 12);
        var sx = [x0 + colW * 0.5, x0 + colW * 1.5, x0 + colW * 2.5];

        /* 라우터 */
        var rw = Math.min(w - 8, 360), rh = 64;
        rr(cx - rw / 2, top + 6, rw, rh, 12, P.purple + '1a', P.purple + 'ff', 2);
        tx('샤드 라우터', cx, top + 22, fs, P.purple + 'ff', 'center', true);
        if (!hot) {
            var kind = mode === 'range' ? 'range' : 'hash';
            if (s.key !== null && s.key !== undefined) {
                tx('키 ' + s.key, cx - rw * 0.3, top + 48, fs + 2, P.yellow + 'ff', 'center', true);
                tx('→', cx - rw * 0.1, top + 48, fs + 2, P.sub + 'ff', 'center', false);
                tx(kind === 'hash' ? (s.key + ' % 3 = ' + s.shard) : ('범위 ' + RANGE_LABEL[s.shard]), cx + rw * 0.22, top + 48, fs + 1, P.green + 'ff', 'center', true);
            } else {
                tx(kind === 'hash' ? '샤드 = 키 % 3' : '범위 표로 샤드 결정', cx, top + 48, fs + 1, P.sub + 'ff', 'center', true);
            }
        } else {
            tx(s.spread ? '해시로 분산하면' : '키 범위로 라우팅', cx, top + 48, fs + 1, (s.spread ? P.green : P.sub) + 'ff', 'center', true);
        }

        /* 샤드 */
        var shTop = top + 140, shH = 124;
        for (var i = 0; i < 3; i++) {
            var isTarget = !hot && s.shard === i;
            var col = isTarget ? P.orange : P.teal;
            var overloaded = hot && !s.spread && s.cnt && s.cnt[i] >= 300;
            if (overloaded) col = P.red;
            rr(sx[i] - shardW / 2, shTop, shardW, shH, 10, col + (isTarget ? '22' : '12'), col + 'ff', isTarget ? 2.6 : 1.6);
            tx('Shard ' + (i + 1), sx[i], shTop + 16, fs + 0.5, col + 'ff', 'center', true);
            var lab = hot ? (['id 1~200', 'id 201~300', 'id 301~'])[i] : (mode === 'range' ? RANGE_LABEL[i] : HASH_LABEL[i]);
            if (hot && s.spread) lab = '해시 분산';
            tx(lab, sx[i], shTop + 34, fs - 1, P.sub + 'ff', 'center', false);
            if (!hot) {
                var placed = s.placed ? s.placed[i] : [];
                var prevPl = s.prevPlaced ? s.prevPlaced[i] : placed;
                placed.forEach(function (k, j) {
                    var isNew = j >= prevPl.length;
                    var cw = Math.min(56, shardW - 20);
                    var cyy = shTop + shH - 20 - j * 22;
                    var a = isNew ? clamp01((e - 0.45) * 2.2) : 1;
                    ctx.globalAlpha = a;
                    rr(sx[i] - cw / 2, cyy - 9, cw, 18, 5, P.yellow + '22', P.yellow + 'ff', isNew ? 2 : 1.3);
                    tx(String(k), sx[i], cyy, fs - 0.5, P.yellow + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                });
            } else {
                var maxC = 320, bh = 46, bx = sx[i] - shardW / 2 + 14, bw = shardW - 28;
                var pc = prev && prev.cnt ? prev.cnt[i] : (s.cnt ? s.cnt[i] : 0);
                var cnt = lerp(pc, s.cnt ? s.cnt[i] : 0, e);
                var by = shTop + shH - 10;
                rr(bx, by - bh, bw, bh, 5, 'none', P.muted + '99', 1.2);
                var fh = Math.max(4, bh * cnt / maxC);
                rr(bx, by - fh, bw, fh, 5, col + '55', col + 'ff', 1.4);
                tx(Math.round(cnt) + '건', sx[i], by - bh - 11, fs - 1, col + 'ff', 'center', true);
            }
        }

        /* 이동 점 */
        var tgt = hot ? (s.hot >= 0 && !s.spread ? s.hot : -1) : s.shard;
        if (tgt >= 0 && e < 1) {
            var ax = cx, ay = top + 6 + rh, bx2 = sx[tgt], by2 = shTop;
            var px = lerp(ax, bx2, e), py = lerp(ay, by2, e);
            ln(ax, ay, bx2, by2, P.orange + '88', 1.6, [4, 3]);
            circ(px, py, 7, P.yellow + 'ff', 'none');
        } else if (tgt >= 0) {
            ln(cx, top + 6 + rh, sx[tgt], shTop, P.orange + 'aa', 1.6, [4, 3]);
        }
        if (hot && s.spread && e > 0.2) {
            [0, 1, 2].forEach(function (i) {
                ln(cx, top + 6 + rh, sx[i], shTop, P.green + 'cc', 1.8, [4, 3]);
            });
        }

        /* 캡션 */
        var capY = shTop + shH + 22;
        var capTxt = hot ? (s.spread ? '쓰기가 세 샤드로 고르게 퍼짐' : (s.burst ? 'Shard 3만 쓰기를 전부 받음' : '레인지 샤딩 + 증가하는 id')) :
            (s.key === null || s.key === undefined ? (s.placed && s.placed.some(function (a) { return a.length; }) ? (mode === 'hash' ? '고르게 분산 ↔ 범위 조회는 전체 샤드' : '범위 조회에 유리 ↔ 한쪽으로 쏠릴 수 있음') : (mode === 'hash' ? '샤드 = 해시(키) % 3' : '키 범위마다 샤드가 정해져 있음')) : '키 ' + s.key + ' → Shard ' + (s.shard + 1));
        lines(capTxt, w - 20, fs).forEach(function (l, i) {
            tx(l, cx, capY + i * (fs + 5), fs, P.yellow + 'ff', 'center', true);
        });
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
        speedBtns.forEach(function (b) { b.classList.remove('sharding-viz__speed-btn--active'); });
        btn.classList.add('sharding-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sharding-viz__mode-btn--active', d.key === m); });
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