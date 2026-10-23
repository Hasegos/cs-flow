/**
 * CDN 시각화
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
    var root    = el('div', 'cdn-viz');
    var toolbar = el('div', 'cdn-viz__toolbar');
    var tbLeft  = el('div', 'cdn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cdn-viz__title', 'CDN'));

    var modeWrap = el('div', 'cdn-viz__mode');
    var modeDefs = [
        { key: 'hit', label: '캐시 히트' },
        { key: 'miss', label: '캐시 미스' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cdn-viz__mode-btn' + (i === 0 ? ' cdn-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cdn-viz__speed');
    speedWrap.appendChild(el('span', 'cdn-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cdn-viz__speed-btn' + (i === 0 ? ' cdn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cdn-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cdn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cdn-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cdn-viz__controls');
    var btnPlay  = el('button', 'cdn-viz__btn cdn-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cdn-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cdn-viz__btn', '↺ RESET');
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
    var mode    = 'hit';
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
    var tipHits = [];
    var mousePos = { x: -1, y: -1 };
    var hoveredKey = null;
    function tipHit(x, y, w, h, key) { tipHits.push({ x: x, y: y, w: w, h: h, key: key }); }
    function tipBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx - 10, cy - 10, 20, 20, key);
    }
    function drawTip(mx, my, text) {
        var parts = text.split(String.fromCharCode(10));
        var title = parts[0], desc = parts[1] || '';
        var W = GW(), H = GH();
        var pad = 14;
        var maxIn = W - 16 - pad * 2;
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var tl = window.CsFlow.wrapText(ctx, title, maxIn);
        var titleW = 0;
        tl.forEach(function (l) { titleW = Math.max(titleW, ctx.measureText(l).width); });
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 24 + tl.length * 18 + dl.length * 18 : 18 + tl.length * 18;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tl.forEach(function (l, i) { tx(l, bx + pad, by + 18 + i * 18, 14, P.text + 'ff', 'left', true); });
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 24 + tl.length * 18 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 시나리오 ===================== */
    var STEPS_HIT = [
        {
            log: '캐시 히트 시나리오. 엣지 서버에 이미 콘텐츠가 캐싱되어 있습니다. 오리진 서버 요청 없이 응답합니다.',
            phase: null,
        },
        {
            log: 'Step 1 — 사용자 요청. 브라우저가 image.png를 요청합니다. DNS가 가장 가까운 CDN 엣지 서버로 라우팅합니다.',
            phase: 'user_to_edge',
            label: 'GET /image.png',
            col: 'purple',
        },
        {
            log: 'Step 2 — 캐시 히트 ✓  엣지 서버에 콘텐츠가 있습니다. 오리진 서버에 요청하지 않고 즉시 응답합니다. X-Cache: HIT 헤더가 포함됩니다.',
            phase: 'edge_to_user',
            label: '200 OK (X-Cache: HIT)',
            col: 'green',
            cacheHit: true,
        },
    ];

    var STEPS_MISS = [
        {
            log: '캐시 미스 시나리오. 엣지 서버에 콘텐츠가 없거나 만료되었습니다. 오리진 서버에서 가져와 캐싱합니다.',
            phase: null,
        },
        {
            log: 'Step 1 — 사용자 요청. 브라우저가 image.png를 요청합니다.',
            phase: 'user_to_edge',
            label: 'GET /image.png',
            col: 'purple',
        },
        {
            log: 'Step 2 — 캐시 미스. 엣지 서버에 콘텐츠가 없습니다. 오리진 서버에 요청을 전달합니다. X-Cache: MISS 헤더가 반환됩니다.',
            phase: 'edge_to_origin',
            label: 'GET /image.png (Forwarded)',
            col: 'yellow',
            cacheMiss: true,
        },
        {
            log: 'Step 3 — 오리진 응답. 오리진 서버가 콘텐츠를 반환합니다. Cache-Control: max-age=86400 헤더로 캐시 TTL을 설정합니다.',
            phase: 'origin_to_edge',
            label: '200 OK (Cache-Control: max-age=86400)',
            col: 'teal',
        },
        {
            log: 'Step 4 — 캐싱 완료. 엣지 서버가 콘텐츠를 캐싱합니다. 이후 동일 요청은 캐시 히트로 처리됩니다.',
            phase: 'edge_cache',
            label: '캐싱 완료',
            col: 'green',
        },
        {
            log: 'Step 5 — 사용자에게 응답. 엣지 서버가 캐싱한 콘텐츠를 사용자에게 전달합니다. X-Cache: MISS (첫 요청), 이후 HIT.',
            phase: 'edge_to_user',
            label: '200 OK (X-Cache: MISS)',
            col: 'purple',
        },
    ];

    function getSteps() { return mode === 'hit' ? STEPS_HIT : STEPS_MISS; }

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return getSteps();
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 CDN 동작을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 단계 해석 ===================== */
    var CDN_DIR = {
        user_to_edge: ['UE', false],
        edge_to_user: ['UE', true],
        edge_to_origin: ['EO', false],
        origin_to_edge: ['EO', true]
    };
    function cdnFind(steps, phase) {
        for (var i = 0; i < steps.length; i++) {
            if (steps[i].phase === phase) return i;
        }
        return -1;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var steps = currentSteps();
        var vert = w < 700;
        var fs = mob ? 11 : 12;
        var lh = fs * 1.35;
        var nw = vert ? Math.min(156, Math.floor(w * 0.56)) : 130;
        var uh = 50, eh = 84, oh = 50;
        var capW = vert ? w - nw / 2 - 14 : (w - nw * 3) / 2 - 12;
        var n = 0;
        steps.forEach(function (s) {
            if (s.label) n = Math.max(n, lines(s.label, capW, fs).length);
        });
        var box = {}, path = {}, total;
        if (vert) {
            var gap = Math.max(54, Math.ceil(n * lh) + 14);
            var yE = uh + gap, yO = yE + eh + gap;
            box.U = { x: 0, y: 0, w: nw, h: uh };
            box.E = { x: 0, y: yE, w: nw, h: eh };
            box.O = { x: 0, y: yO, w: nw, h: oh };
            path.UE = { ax: nw / 2, ay: uh, bx: nw / 2, by: yE };
            path.EO = { ax: nw / 2, ay: yE + eh, bx: nw / 2, by: yO };
            total = yO + oh;
        } else {
            var cy = Math.max(Math.ceil(n * lh) + 14, eh / 2 + 4) + 36;
            var xE = (w - nw) / 2, xO = w - nw;
            box.U = { x: 0, y: cy - uh / 2, w: nw, h: uh };
            box.E = { x: xE, y: cy - eh / 2, w: nw, h: eh };
            box.O = { x: xO, y: cy - oh / 2, w: nw, h: oh };
            path.UE = { ax: nw, ay: cy, bx: xE, by: cy };
            path.EO = { ax: xE + nw, ay: cy, bx: xO, by: cy };
            total = cy + eh / 2 + 36;
        }
        return { vert: vert, fs: fs, fsT: vert ? 12 : 13, lh: lh, nw: nw, capW: capW, box: box, path: path, total: Math.ceil(total) };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 ===================== */
    function cdnCaption(g, key, str, col, alpha, x0, top) {
        var p = g.path[key];
        var ls = lines(str, g.capW, g.fs);
        var ax = x0 + p.ax, ay = top + p.ay, bx = x0 + p.bx, by = top + p.by;
        ctx.globalAlpha = alpha;
        if (g.vert) {
            var y0 = (ay + by) / 2 - (ls.length - 1) * g.lh / 2;
            ls.forEach(function (c, i) { tx(c, ax + 14, y0 + i * g.lh, g.fs, col, 'left', true); });
        } else {
            var bot = ay - 12;
            ls.forEach(function (c, i) { tx(c, (ax + bx) / 2, bot - (ls.length - 1 - i) * g.lh, g.fs, col, 'center', true); });
        }
        ctx.globalAlpha = 1;
    }
    function cdnNode(b, col, title, sub, g, x0, top, alpha) {
        var x = x0 + b.x, y = top + b.y;
        ctx.globalAlpha = alpha;
        rr(x, y, b.w, b.h, 6, col + '22', col + 'cc', 2);
        ctx.globalAlpha = 1;
        tx(title, x + b.w / 2, y + 16, g.fsT, col + 'ff', 'center', true);
        tx(sub, x + b.w / 2, y + 32, g.fs, P.sub + 'ff', 'center', false);
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var i = steps.indexOf(s);
        var fresh = !!step && !!prev && prev !== step;
        var e = fresh ? ez(t) : 1;
        var g = layout(w, mob);
        var ecI = cdnFind(steps, 'edge_cache');
        var foI = cdnFind(steps, 'edge_to_origin');
        var cacheA = i > ecI ? 1 : (i === ecI ? e : 0);
        var edgeCol = cacheA > 0.5 ? P.green : P.teal;
        var reqN = foI >= 0 && i >= foI ? 1 : 0;
        var dimO = foI < 0;

        cdnNode(g.box.U, P.purple, 'USER', 'Browser', g, x0, top, 1);
        cdnNode(g.box.E, edgeCol, 'EDGE', 'CDN 엣지', g, x0, top, 1);
        cdnNode(g.box.O, P.orange, 'ORIGIN', '오리진 요청 ' + reqN + '회', g, x0, top, dimO ? 0.4 : 1);

        var eb = g.box.E;
        var bx = x0 + eb.x + 10, by = top + eb.y + 46, bw = eb.w - 20, bh = 28;
        rr(bx, by, bw, bh, 4, null, P.muted + '99', 1.2);
        if (cacheA < 1) {
            ctx.globalAlpha = 1 - cacheA;
            tx('비어 있음', bx + bw / 2, by + bh / 2, g.fs, P.sub + 'ff', 'center', false);
            ctx.globalAlpha = 1;
        }
        if (cacheA > 0) {
            ctx.globalAlpha = cacheA;
            rr(bx, by, bw, bh, 4, P.green + 'ff', null);
            tx('image.png', bx + bw / 2, by + bh / 2, g.fs, '#111111', 'center', true);
            ctx.globalAlpha = 1;
        }

        ['UE', 'EO'].forEach(function (k) {
            var p = g.path[k];
            ln(x0 + p.ax, top + p.ay, x0 + p.bx, top + p.by, P.muted + '88', 1.5, [4, 4]);
        });
        if (dimO) cdnCaption(g, 'EO', '요청 없음', P.sub + 'ff', 1, x0, top);

        if (!step) {
            cdnCaption(g, 'UE', steps[1].label, P.sub + 'ff', 0.6, x0, top);
        } else if (CDN_DIR[s.phase]) {
            var dir = CDN_DIR[s.phase];
            var p2 = g.path[dir[0]];
            var A = { x: x0 + p2.ax, y: top + p2.ay }, B = { x: x0 + p2.bx, y: top + p2.by };
            var from = dir[1] ? B : A, to = dir[1] ? A : B;
            var pk = { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) };
            var col = colorOf(s.col || 'purple');
            ln(from.x, from.y, pk.x, pk.y, col + 'aa', 3);
            circ(pk.x, pk.y, g.vert ? 6 : 7, col + 'ff', null);
            cdnCaption(g, dir[0], s.label, col + 'ff', fresh ? ez(seg(t, 0.15, 0.5)) : 1, x0, top);
        } else if (s.label) {
            cdnCaption(g, 'EO', s.label, colorOf(s.col || 'teal') + 'ff', fresh ? ez(seg(t, 0.15, 0.5)) : 1, x0, top);
        }
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
        tipHits.length = 0;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
        if (hoveredKey && typeof TIPS !== 'undefined' && TIPS[hoveredKey]) drawTip(mousePos.x, mousePos.y, TIPS[hoveredKey]);
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
        speedBtns.forEach(function (b) { b.classList.remove('cdn-viz__speed-btn--active'); });
        btn.classList.add('cdn-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cdn-viz__mode-btn--active', d.key === m); });
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
                mousePos: mousePos,
                tooltipHits: tipHits,
                hoveredKey: function () { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();