/**
 * 로드 밸런서 시각화 시각화
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
    var root    = el('div', 'lb-viz');
    var toolbar = el('div', 'lb-viz__toolbar');
    var tbLeft  = el('div', 'lb-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'lb-viz__title', 'Load Balancer'));

    var modeWrap = el('div', 'lb-viz__mode');
    var modeDefs = [
        { key: 'rr', label: 'Round Robin' },
        { key: 'lc', label: 'Least Conn' },
        { key: 'ih', label: 'IP Hash' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'lb-viz__mode-btn' + (i === 0 ? ' lb-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'lb-viz__speed');
    speedWrap.appendChild(el('span', 'lb-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'lb-viz__speed-btn' + (i === 0 ? ' lb-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'lb-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'lb-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'lb-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'lb-viz__controls');
    var btnPlay  = el('button', 'lb-viz__btn lb-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'lb-viz__btn', '▶| STEP');
    var btnReset = el('button', 'lb-viz__btn', '↺ RESET');
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
    var mode    = 'rr';
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
        var titleW = Math.min(maxIn, ctx.measureText(title).width);
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 42 + dl.length * 18 : 36;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tx(title, bx + pad, by + (desc ? 18 : th / 2), 14, P.text + 'ff', 'left', true);
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 42 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 상태 ===================== */

    var serverConns = [0, 0, 0];
    var rrIndex     = 0;

    var CLIENT_IPS = ['192.168.1.10', '10.0.0.5', '172.16.0.3',
                      '192.168.1.10', '10.0.0.5', '192.168.2.20',
                      '172.16.0.3',  '192.168.1.10', '10.0.0.5'];

    var pktPhase  = 'idle';
    var pktProg   = 0;
    var pktTarget = 0;
    var pktClientIp = '';
    var pktMoving = false;
    var history   = [];

    function buildSteps() {
        var steps = [];
        var _rr = 0, _conns = [0, 0, 0];

        for (var i = 0; i < CLIENT_IPS.length; i++) {
            var ip  = CLIENT_IPS[i];
            var srv, reason;

            if (mode === 'rr') {
                srv    = _rr % 3;
                reason = 'Round Robin → Server ' + (srv + 1) + ' (순서: ' + (_rr + 1) + '번째)';
                _rr++;
            } else if (mode === 'lc') {
                srv    = _conns.indexOf(Math.min.apply(null, _conns));
                reason = 'Least Connection → Server ' + (srv + 1) + ' (연결 수: ' + _conns[srv] + ')';
            } else {
                var hash = 0;
                for (var c = 0; c < ip.length; c++) hash = (hash * 31 + ip.charCodeAt(c)) & 0xffff;
                srv    = hash % 3;
                reason = 'IP Hash(' + ip + ') → Server ' + (srv + 1);
            }
            _conns[srv]++;

            steps.push({
                clientIp: ip,
                target:   srv,
                log: '요청 ' + (i + 1) + ' — 클라이언트 ' + ip + '. ' + reason + '. 서버 연결 수: [' + _conns.join(', ') + ']',
                conns: _conns.slice(),
            });
        }
        return steps;
    }

    var STEPS = buildSteps();

    /* ===================== 상태 ===================== */
    var lbStepCache = {};

    function currentSteps() {
        if (!lbStepCache[mode]) lbStepCache[mode] = buildSteps();
        return lbStepCache[mode];
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 로드 밸런싱 동작을 확인하세요.';
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var g = {};
        if (mob) {
            var cw = Math.min(150, w - 20), sw = (w - 16) / 3;
            g.cl = { x: (w - cw) / 2, y: 0, w: cw, h: 44 };
            g.lb = { x: (w - 150) / 2, y: 96, w: 150, h: 46 };
            g.sv = [0, 1, 2].map(function (i) { return { x: i * (sw + 8), y: 188, w: sw, h: 56 }; });
            g.capY = 256; g.capLh = 14; g.H = 306;
        } else {
            g.cl = { x: 0, y: 110, w: 150, h: 60 };
            g.lb = { x: w * 0.44 - 85, y: 102, w: 170, h: 76 };
            g.sv = [0, 1, 2].map(function (i) { return { x: w - 200, y: 20 + i * 90, w: 200, h: 60 }; });
            g.capY = 276; g.capLh = 16; g.H = 312;
        }
        return g;
    }
    function sceneH(w, mob) { return layout(w, mob).H; }

    /* ===================== 판단 문구 ===================== */
    function lbCol(i) { return [P.green, P.orange, P.purple][i] || P.teal; }
    function lbPt(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    function lbHash(ip) {
        var h = 0;
        for (var c = 0; c < ip.length; c++) h = (h * 31 + ip.charCodeAt(c)) & 0xffff;
        return h;
    }
    function lbRule() {
        if (mode === 'rr') return '라운드 로빈: 요청을 서버 1 → 2 → 3 순서로 돌려 보낸다.';
        if (mode === 'lc') return '최소 연결: 지금 연결 수가 가장 적은 서버로 보낸다.';
        return 'IP 해시: 같은 클라이언트 IP는 항상 같은 서버로 보낸다.';
    }
    function lbCaption(s, i, bc) {
        var n = s.target + 1;
        if (mode === 'rr') return 'RR 순서 ' + i + ' mod 3 = ' + s.target + ' → SERVER ' + n;
        if (mode === 'lc') return '연결 [' + bc.join(', ') + '] 중 가장 적은 서버 → SERVER ' + n;
        var h = lbHash(s.clientIp);
        return 'hash = ' + h + ', ' + h + ' mod 3 = ' + s.target + ' → SERVER ' + n;
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var g = layout(w, mob);
        var e = clamp01(t);
        var steps = currentSteps();
        var s = step || null;
        var idx = s ? steps.indexOf(s) : -1;
        var bc = idx > 0 ? steps[idx - 1].conns : [0, 0, 0];
        var ac = s ? s.conns : [0, 0, 0];
        var tgt = s ? s.target : -1;
        var fsN = mob ? 11 : 13, fsS = mob ? 11 : 12;
        var glow = seg(e, 0.3, 0.45) * (1 - seg(e, 0.45, 0.6));
        var hl = s ? seg(e, 0.5, 0.7) : 0;
        var cnt = seg(e, 0.9, 1);
        var clOut = mob ? { x: g.cl.x + g.cl.w / 2, y: g.cl.y + g.cl.h } : { x: g.cl.x + g.cl.w, y: g.cl.y + g.cl.h / 2 };
        var lbIn = mob ? { x: g.lb.x + g.lb.w / 2, y: g.lb.y } : { x: g.lb.x, y: g.lb.y + g.lb.h / 2 };
        var lbOut = mob ? { x: g.lb.x + g.lb.w / 2, y: g.lb.y + g.lb.h } : { x: g.lb.x + g.lb.w, y: g.lb.y + g.lb.h / 2 };
        var svIn = g.sv.map(function (b) { return mob ? { x: b.x + b.w / 2, y: b.y } : { x: b.x, y: b.y + b.h / 2 }; });

        ctx.save();
        ctx.translate(x0, top);

        arrow(clOut.x, clOut.y, lbIn.x, lbIn.y, P.sub + '77', 1.4, [4, 4]);
        if (s && e > 0 && e < 0.35) arrow(clOut.x, clOut.y, lbIn.x, lbIn.y, P.teal + 'ff', 2.4);
        g.sv.forEach(function (b, i) {
            arrow(lbOut.x, lbOut.y, svIn[i].x, svIn[i].y, P.sub + '55', 1.2, [4, 4]);
            if (i === tgt && hl > 0) {
                ctx.globalAlpha = hl;
                arrow(lbOut.x, lbOut.y, svIn[i].x, svIn[i].y, lbCol(i) + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
        });

        rr(g.cl.x, g.cl.y, g.cl.w, g.cl.h, 6, P.purple + '22', P.purple + 'ff', 2);
        tx('CLIENT', g.cl.x + g.cl.w / 2, g.cl.y + (mob ? 14 : 20), fsN, P.purple + 'ff', 'center', true);
        tx(s ? s.clientIp : steps[0].clientIp, g.cl.x + g.cl.w / 2, g.cl.y + (mob ? 31 : 42), fsS, P.sub + 'ff', 'center', false);

        rr(g.lb.x, g.lb.y, g.lb.w, g.lb.h, 8, P.teal + '22', P.teal + 'ff', 2 + glow * 1.5);
        tx('LOAD BALANCER', g.lb.x + g.lb.w / 2, g.lb.y + (mode === 'rr' ? (mob ? 16 : 24) : g.lb.h / 2), fsN, P.teal + 'ff', 'center', true);
        if (mode === 'rr') {
            var k = idx >= 0 ? idx % 3 : -1;
            [0, 1, 2].forEach(function (i) {
                circ(g.lb.x + g.lb.w / 2 + (i - 1) * 16, g.lb.y + g.lb.h - (mob ? 11 : 14), 4, i === k ? lbCol(i) + 'ff' : P.sub + '44', 'none');
            });
        }

        g.sv.forEach(function (b, i) {
            var col = lbCol(i);
            var on = i === tgt ? hl : 0;
            var n = lerp(bc[i], ac[i], cnt);
            rr(b.x, b.y, b.w, b.h, 6, P.surf, P.sub + '66', 1.2);
            if (on > 0) {
                ctx.globalAlpha = on;
                rr(b.x, b.y, b.w, b.h, 6, col + '28', col + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            tx('SERVER ' + (i + 1), b.x + b.w / 2, b.y + (mob ? 14 : 18), fsN, (i === tgt && hl > 0.5 ? col : P.text) + 'ff', 'center', true);
            tx('conn: ' + Math.round(n), b.x + b.w / 2, b.y + (mob ? 30 : 36), fsS, P.sub + 'ff', 'center', false);
            rr(b.x + 6, b.y + b.h - 11, b.w - 12, 5, 2, P.sub + '33', 'none');
            rr(b.x + 6, b.y + b.h - 11, (b.w - 12) * n / steps.length, 5, 2, col + 'ff', 'none');
        });

        if (s && e < 1) {
            var p1 = ez(seg(e, 0, 0.35)), p3 = ez(seg(e, 0.5, 0.9));
            var dA = mob ? { x: 0, y: 12 } : { x: 36, y: 0 };
            var dB = mob ? { x: 0, y: -12 } : { x: -36, y: 0 };
            var pa = { x: clOut.x + dA.x, y: clOut.y + dA.y }, pb = { x: lbIn.x + dB.x, y: lbIn.y + dB.y };
            var pc = { x: lbOut.x + dA.x, y: lbOut.y + dA.y }, pd = { x: svIn[tgt].x + dB.x, y: svIn[tgt].y + dB.y };
            var pos = e < 0.5 ? lbPt(pa, pb, p1) : lbPt(pc, pd, p3);
            var cc = e < 0.5 ? P.teal : lbCol(tgt);
            var cw = mob ? 50 : 62, chh = mob ? 20 : 24;
            rr(pos.x - cw / 2, pos.y - chh / 2, cw, chh, 6, cc + 'ff', cc + 'ff', 1);
            tx('REQ ' + (idx + 1), pos.x, pos.y, fsS, '#111111', 'center', true);
        }

        var cap = s ? lbCaption(s, idx, bc) : lbRule();
        var capOn = glow > 0.05;
        lines(cap, w - 8, fsS).forEach(function (l, li) {
            tx(l, w / 2, g.capY + 7 + li * g.capLh, fsS, (capOn ? P.teal : P.sub) + 'ff', 'center', capOn);
        });

        ctx.restore();
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
        speedBtns.forEach(function (b) { b.classList.remove('lb-viz__speed-btn--active'); });
        btn.classList.add('lb-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('lb-viz__mode-btn--active', d.key === m); });
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