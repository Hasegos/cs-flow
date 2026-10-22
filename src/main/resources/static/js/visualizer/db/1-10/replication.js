/**
 * 복제(Replication) 시각화
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
    var root    = el('div', 'replication-viz');
    var toolbar = el('div', 'replication-viz__toolbar');
    var tbLeft  = el('div', 'replication-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'replication-viz__title', 'REPLICATION'));

    var modeWrap = el('div', 'replication-viz__mode');
    var modeDefs = [
        { key: 'sync', label: '동기 복제' },
        { key: 'async', label: '비동기 복제' },
        { key: 'fail', label: '장애 시 유실' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'replication-viz__mode-btn' + (i === 0 ? ' replication-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'replication-viz__speed');
    speedWrap.appendChild(el('span', 'replication-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'replication-viz__speed-btn' + (i === 0 ? ' replication-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'replication-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'replication-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'replication-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'replication-viz__controls');
    var btnPlay  = el('button', 'replication-viz__btn replication-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'replication-viz__btn', '▶| STEP');
    var btnReset = el('button', 'replication-viz__btn', '↺ RESET');
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
    var mode    = 'sync';
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



    /* ===================== 장면 데이터: 복제 로그 ===================== */
    function st(log, o) {
        var s = { log: log, from: null, to: null, lab: '', p: 3, r: 3, wp: false, wr: false, cli: 'idle', ms: 0, dead: false, promo: false, lost: false, cap: '' };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var SYNC_STEPS = [
        st('PRIMARY와 REPLICA가 같은 쓰기 로그(#1~#3)를 갖고 있습니다. CLIENT가 새 쓰기를 보내면 두 서버에 어떻게 반영되는지 봅니다.', { cap: '로그 칸 하나 = 쓰기 한 건' }),
        st('CLIENT가 PRIMARY에 쓰기 요청을 보냅니다. 이제 CLIENT는 응답이 올 때까지 기다립니다.', { from: 'client', to: 'primary', lab: 'INSERT #4', cli: 'wait', ms: 0, cap: '응답을 기다리는 시간이 CLIENT가 느끼는 지연' }),
        st('PRIMARY가 데이터를 기록합니다(#4).', { wp: true, p: 4, cli: 'wait', ms: 2, cap: 'PRIMARY 로그에 #4 추가' }),
        st('PRIMARY가 변경 내용을 REPLICA로 전송합니다. CLIENT는 아직 기다리는 중입니다.', { from: 'primary', to: 'replica', lab: 'log #4', p: 4, cli: 'wait', ms: 5, cap: '동기 복제: 복제본에 닿을 때까지 커밋하지 않음' }),
        st('REPLICA가 #4를 기록합니다.', { wr: true, p: 4, r: 4, cli: 'wait', ms: 8, cap: '두 서버의 로그가 같아짐' }),
        st('REPLICA가 기록을 마쳤다고 PRIMARY에 ack을 보냅니다.', { from: 'replica', to: 'primary', lab: 'ack', p: 4, r: 4, cli: 'wait', ms: 10, cap: 'ack = 복제본에 안전히 기록됨' }),
        st('PRIMARY가 REPLICA의 ack을 확인한 뒤에야 CLIENT에 커밋 완료를 알립니다. 동기 복제는 이 대기 시간만큼 느립니다.', { from: 'primary', to: 'client', lab: 'commit OK', p: 4, r: 4, cli: 'ok', ms: 12, cap: '응답까지 12ms — 느리지만 두 서버에 모두 기록됨' })
    ];

    var ASYNC_STEPS = [
        st('PRIMARY와 REPLICA가 같은 쓰기 로그(#1~#3)를 갖고 있습니다. 이번에는 PRIMARY가 복제본을 기다리지 않는 경우를 봅니다.', { cap: '로그 칸 하나 = 쓰기 한 건' }),
        st('CLIENT가 PRIMARY에 쓰기 요청을 보냅니다.', { from: 'client', to: 'primary', lab: 'INSERT #4', cli: 'wait', ms: 0, cap: '응답을 기다리는 중' }),
        st('PRIMARY가 데이터를 기록합니다(#4).', { wp: true, p: 4, cli: 'wait', ms: 2, cap: 'PRIMARY 로그에 #4 추가' }),
        st('PRIMARY는 REPLICA를 기다리지 않고 곧바로 CLIENT에 커밋 완료를 알립니다. 비동기 복제가 빠른 이유입니다.', { from: 'primary', to: 'client', lab: 'commit OK', p: 4, cli: 'ok', ms: 3, cap: '응답까지 3ms — REPLICA는 아직 #3까지' }),
        st('그 사이 PRIMARY가 백그라운드로 REPLICA에 변경 내용을 전송합니다.', { from: 'primary', to: 'replica', lab: 'log #4 (뒤늦게)', p: 4, cli: 'ok', ms: 3, cap: 'CLIENT 응답과 복제는 따로 진행' }),
        st('REPLICA는 CLIENT 응답이 끝난 뒤에야 #4를 기록합니다. 이 시간차가 복제 지연(Replication Lag)입니다.', { wr: true, p: 4, r: 4, cli: 'ok', ms: 3, cap: '복제 지연이 사라짐' })
    ];

    var FAIL_STEPS = [
        st('비동기 복제로 #4를 커밋한 직후입니다. CLIENT는 성공 응답을 받았지만 REPLICA는 아직 #3까지만 갖고 있습니다.', { p: 4, r: 3, cli: 'ok', ms: 3, cap: '복제 지연 1건이 남은 상태' }),
        st('이때 PRIMARY가 갑자기 다운됩니다. #4는 REPLICA에 도착하기 전입니다.', { p: 4, r: 3, cli: 'ok', ms: 3, dead: true, cap: 'PRIMARY 장애' }),
        st('장애 조치(failover): REPLICA를 새 PRIMARY로 승격합니다.', { p: 4, r: 3, cli: 'ok', ms: 3, dead: true, promo: true, cap: '새 PRIMARY의 로그는 #3까지' }),
        st('CLIENT는 #4가 커밋됐다고 믿지만 새 PRIMARY에는 #4가 없습니다. 비동기 복제는 장애 때 이렇게 데이터가 유실될 수 있습니다.', { p: 4, r: 3, cli: 'ok', ms: 3, dead: true, promo: true, lost: true, cap: '#4 유실 — 커밋 응답을 받았는데도' }),
        st('동기(또는 반동기) 복제는 복제본에 기록된 뒤 커밋하므로 이 유실이 없습니다. 대신 응답이 느려집니다. 지연과 안전의 교환입니다.', { p: 4, r: 3, cli: 'ok', ms: 3, dead: true, promo: true, lost: true, cap: '속도 ↔ 안전성의 선택' })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'async') return ASYNC_STEPS;
        if (mode === 'fail') return FAIL_STEPS;
        return SYNC_STEPS;
    }
    function defaultLog() {
        if (mode === 'async') return 'PRIMARY가 복제본을 기다리지 않고 응답하는 비동기 복제를 봅니다.';
        if (mode === 'fail') return '비동기 복제에서 PRIMARY가 죽으면 무엇이 사라지는지 봅니다.';
        return 'PRIMARY가 복제본의 ack을 기다린 뒤 응답하는 동기 복제를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var colW = w / 3;
        return { fs: mob ? 11 : 12, colW: colW, boxW: Math.min(150, colW - 14), boxH: 52, total: 262 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function drawStrip(cx, y, stripW, count, newIdx, e, col, lostIdx, fs, dim) {
        var n = 5, gap = 3;
        var sw = (stripW - gap * (n - 1)) / n;
        var x = cx - stripW / 2;
        for (var i = 0; i < n; i++) {
            var sx = x + i * (sw + gap);
            if (i === lostIdx) {
                rr(sx, y, sw, 30, 5, P.red + '1a', P.red + 'ff', 1.6);
                tx('✕', sx + sw / 2, y + 15, fs + 1, P.red + 'ff', 'center', true);
                continue;
            }
            if (i < count) {
                var a = (i === newIdx) ? clamp01(e * 1.6) : 1;
                var c = dim ? P.muted : col;
                ctx.globalAlpha = a;
                rr(sx, y, sw, 30, 5, c + '33', c + 'ff', i === newIdx ? 2.4 : 1.5);
                tx('#' + (i + 1), sx + sw / 2, y + 15, fs, c + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            } else {
                rr(sx, y, sw, 30, 5, 'none', P.muted + '77', 1.2);
            }
        }
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var e = clamp01(t);
        var s = step || st('', {});
        var ps = prev || st('', {});
        var idx = { client: 0, primary: 1, replica: 2 };
        var cx = [x0 + L.colW * 0.5, x0 + L.colW * 1.5, x0 + L.colW * 2.5];
        var ny = top + 34;
        var laneY = top + 22;

        /* 노드 */
        var defs = [
            { key: 'client', label: 'CLIENT', sub: 'APP', col: P.orange },
            { key: 'primary', label: 'PRIMARY', sub: s.dead ? '장애' : '쓰기 담당', col: s.dead ? P.red : P.purple },
            { key: 'replica', label: s.promo ? 'NEW PRIMARY' : 'REPLICA', sub: s.promo ? '승격됨' : '복제본', col: s.promo ? P.purple : P.teal }
        ];
        defs.forEach(function (d, i) {
            var active = (s.from === d.key || s.to === d.key) || (d.key === 'primary' && s.wp) || (d.key === 'replica' && s.wr);
            var a = active ? 'ff' : 'aa';
            rr(cx[i] - L.boxW / 2, ny, L.boxW, L.boxH, 10, d.col + (active ? '26' : '12'), d.col + a, active ? 2.6 : 1.6);
            tx(d.label, cx[i], ny + 19, fs + 0.5, d.col + 'ff', 'center', true);
            tx(d.sub, cx[i], ny + 38, fs - 1, P.sub + 'ff', 'center', false);
        });
        if (s.dead) {
            ln(cx[1] - L.boxW / 2 + 6, ny + 6, cx[1] + L.boxW / 2 - 6, ny + L.boxH - 6, P.red + 'ff', 2.4);
            ln(cx[1] + L.boxW / 2 - 6, ny + 6, cx[1] - L.boxW / 2 + 6, ny + L.boxH - 6, P.red + 'ff', 2.4);
        }

        /* 메시지 */
        if (s.from && s.to && s.from !== s.to) {
            var a1 = cx[idx[s.from]], b1 = cx[idx[s.to]];
            ln(a1, laneY, b1, laneY, P.muted + '88', 1.4, [4, 4]);
            ln(a1, laneY, a1, ny, P.muted + '88', 1.4);
            arrow(b1, laneY, b1, ny - 2, P.muted + 'cc', 1.4);
            var px = lerp(a1, b1, e);
            circ(px, laneY, 7, P.yellow + 'ff', 'none');
            tx(s.lab, (a1 + b1) / 2, top + 7, fs, P.yellow + 'ff', 'center', true);
        }

        /* 로그 띠 */
        var sy = ny + L.boxH + 30;
        var stripW = L.boxW + 12;
        tx('쓰기 로그(WAL)', cx[1], sy - 12, fs - 1, P.sub + 'ff', 'center', false);
        tx('쓰기 로그(WAL)', cx[2], sy - 12, fs - 1, P.sub + 'ff', 'center', false);
        drawStrip(cx[1], sy, stripW, s.p, s.wp ? s.p - 1 : -1, e, P.purple, -1, fs - 1, s.dead);
        drawStrip(cx[2], sy, stripW, s.r, s.wr ? s.r - 1 : -1, e, s.promo ? P.purple : P.teal, s.lost ? s.r : -1, fs - 1, false);

        /* CLIENT 응답 시간 막대 */
        var ms = lerp(ps.cli === 'idle' ? 0 : ps.ms, s.ms, e);
        if (s.cli !== 'idle') {
            var bw = L.boxW, bx = cx[0] - bw / 2, by = sy + 10;
            var done = s.cli === 'ok' && e > 0.99;
            var bc = s.lost ? P.red : (s.cli === 'ok' ? P.green : P.yellow);
            tx('응답 시간', cx[0], sy - 12, fs - 1, P.sub + 'ff', 'center', false);
            rr(bx, by, bw, 12, 6, 'none', P.muted + '99', 1.2);
            rr(bx, by, Math.max(8, bw * ms / 12), 12, 6, bc + 'ff', 'none');
            tx(s.cli === 'ok' ? (Math.round(s.ms) + 'ms 만에 응답') : (Math.round(ms) + 'ms 대기 중'), cx[0], by + 30, fs - 1, bc + 'ff', 'center', true);
            if (s.lost) tx('#4 성공 응답을 받음', cx[0], by + 46, fs - 1, P.red + 'ff', 'center', true);
        }

        /* 복제 지연 */
        if (!s.dead && s.p > s.r) {
            var lg = '복제 지연 ' + (s.p - s.r) + '건';
            ctx.font = '700 ' + (fs - 0.5) + 'px "JetBrains Mono",monospace';
            var lw = ctx.measureText(lg).width + 20;
            var lcx = (cx[1] + cx[2]) / 2;
            rr(lcx - lw / 2, sy + 42, lw, 22, 11, P.yellow + '22', P.yellow + 'ff', 1.4);
            tx(lg, lcx, sy + 53, fs - 0.5, P.yellow + 'ff', 'center', true);
        }

        /* 캡션 */
        if (s.cap) {
            lines(s.cap, w - 20, fs).forEach(function (l, i) {
                tx(l, x0 + w / 2, sy + 84 + i * (fs + 5), fs, P.yellow + 'ff', 'center', true);
            });
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
        speedBtns.forEach(function (b) { b.classList.remove('replication-viz__speed-btn--active'); });
        btn.classList.add('replication-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('replication-viz__mode-btn--active', d.key === m); });
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