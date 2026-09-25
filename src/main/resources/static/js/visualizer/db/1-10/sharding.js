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
        { key: 'hash',  label: '해시 샤딩' },
        { key: 'range', label: '레인지 샤딩' }
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    /* ===================== 예시 키 & 라우팅 계산 (하드코딩 아님) ===================== */
    var KEYS = [101, 205, 310, 450];
    var RANGE_BOUNDS = [150, 300, 500];

    function hashShard(key) { return key % 3; }
    function rangeShard(key) {
        for (var i = 0; i < RANGE_BOUNDS.length; i++) {
            if (key <= RANGE_BOUNDS[i]) return i;
        }
        return RANGE_BOUNDS.length - 1;
    }

    function buildSteps(fn, kind) {
        return KEYS.map(function (key) {
            var shard = fn(key);
            var calc = kind === 'hash'
                ? key + ' % 3 = ' + shard
                : key + ' → 범위 ' + (shard === 0 ? '0~' + RANGE_BOUNDS[0] : RANGE_BOUNDS[shard - 1] + 1 + '~' + RANGE_BOUNDS[shard]);
            return {
                key: key, shard: shard,
                log: '키 ' + key + ' → ' + calc + ' → Shard ' + (shard + 1)
            };
        });
    }

    var HASH_STEPS  = buildSteps(hashShard, 'hash');
    var RANGE_STEPS = buildSteps(rangeShard, 'range');

    /* ===================== 상태 ===================== */
    var mode    = 'hash';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;
    var shardHits = [0, 0, 0];

    function currentSteps() {
        return mode === 'range' ? RANGE_STEPS : HASH_STEPS;
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
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function arrow(x1, y1, x2, y2, color, lw) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var headLen = 9;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ===================== 레이아웃 ===================== */
    function layout(W, mob) {
        var padX = mob ? 16 : 26;
        var routerW = mob ? 120 : 190, routerH = mob ? 68 : 84;
        var shardW  = mob ? 128 : 200, shardH  = mob ? 68 : 84;
        var routerX = padX, routerY = mob ? 120 : 160;
        var shardX  = W - padX - shardW;
        var gapY = mob ? 28 : 38;
        var totalH = shardH * 3 + gapY * 2;
        var shardStartY = routerY + routerH / 2 - totalH / 2;

        var shards = [];
        for (var i = 0; i < 3; i++) {
            var y = shardStartY + i * (shardH + gapY);
            shards.push({ x: shardX, y: y, w: shardW, h: shardH, cx: shardX + shardW / 2, cy: y + shardH / 2 });
        }
        return {
            router: { x: routerX, y: routerY, w: routerW, h: routerH, cx: routerX + routerW / 2, cy: routerY + routerH / 2 },
            shards: shards
        };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var L = layout(W, mob);
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        var routerActive = !!step;
        rr(L.router.x, L.router.y, L.router.w, L.router.h, 10,
           P.orange + (routerActive ? '20' : '10'), (routerActive ? P.orange : P.purple) + (routerActive ? 'ee' : '99'), routerActive ? 2.6 : 1.8);
        tx('ROUTER', L.router.cx, L.router.cy - (mob ? 9 : 11), mob ? 13 : 15, (routerActive ? P.orange : P.purple) + 'ee', 'center', true);
        if (step) tx('key = ' + step.key, L.router.cx, L.router.cy + (mob ? 12 : 14), mob ? 11 : 13, P.orange + 'dd', 'center', false);

        L.shards.forEach(function (s, i) {
            var isTarget = step && step.shard === i;
            var col = isTarget ? P.green : P.teal;
            rr(s.x, s.y, s.w, s.h, 10, col + (isTarget ? '22' : '10'), col + (isTarget ? 'ee' : '99'), isTarget ? 2.6 : 1.8);
            tx('SHARD ' + (i + 1), s.cx, s.cy - (mob ? 9 : 11), mob ? 12.5 : 14.5, col + 'ee', 'center', true);
            tx(shardHits[i] + '건', s.cx, s.cy + (mob ? 12 : 14), mob ? 10.5 : 12, P.text + 'bb', 'center', false);
        });

        if (step) {
            var target = L.shards[step.shard];
            arrow(L.router.x + L.router.w, L.router.cy, target.x - 4, target.cy, P.orange, 2.2);
        }

        if (!step) {
            tx('아래 STEP을 눌러 키가 어느 샤드로 가는지 하나씩 확인하세요.', W / 2, (L.router.y + L.shards[2].y + L.shards[2].h) / 2, mob ? 12 : 13.5, P.text + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = (mob ? 68 : 84) * 3 + (mob ? 28 : 38) * 2 + (mob ? 90 : 120);
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
    function defaultLog() { return mode === 'range' ? '레인지 샤딩: 키 값의 범위로 샤드를 결정합니다.' : '해시 샤딩: 키를 해시(나머지 연산)해서 샤드를 결정합니다.'; }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        shardHits[currentSteps()[idx].shard]++;
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
        shardHits = [0, 0, 0];
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