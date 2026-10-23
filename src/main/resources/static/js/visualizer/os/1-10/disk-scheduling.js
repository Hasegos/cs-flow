/**
 * 디스크 스케줄링 시각화
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
    var root    = el('div', 'dsk-viz');
    var toolbar = el('div', 'dsk-viz__toolbar');
    var tbLeft  = el('div', 'dsk-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dsk-viz__title', 'Disk Scheduling'));

    var modeWrap = el('div', 'dsk-viz__mode');
    var modeDefs = [
        { key: 'fcfs', label: 'FCFS' },
        { key: 'sstf', label: 'SSTF' },
        { key: 'scan', label: 'SCAN' },
        { key: 'cscan', label: 'C-SCAN' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dsk-viz__mode-btn' + (i === 0 ? ' dsk-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dsk-viz__speed');
    speedWrap.appendChild(el('span', 'dsk-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dsk-viz__speed-btn' + (i === 0 ? ' dsk-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dsk-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dsk-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dsk-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dsk-viz__controls');
    var btnPlay  = el('button', 'dsk-viz__btn dsk-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dsk-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dsk-viz__btn', '↺ RESET');
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
    var mode    = 'fcfs';
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

    /* ===================== 상수 ===================== */
    const INIT_HEAD = 53;
    const REQUESTS  = [98, 183, 37, 122, 14, 124, 65, 67];
    const MAX_TRACK = 199;
    const MIN_TRACK = 0;

    /* ===================== 알고리즘 계산 ===================== */

    function calcFCFS() {
        const seq = [INIT_HEAD].concat(REQUESTS.slice());
        return seq;
    }

    function calcSSTF() {
        const seq  = [INIT_HEAD];
        const rem  = REQUESTS.slice();
        let   cur  = INIT_HEAD;

        while (rem.length > 0) {
            let minDist = Infinity, minIdx = 0;
            rem.forEach(function (t, i) {
                const d = Math.abs(t - cur);
                if (d < minDist) { minDist = d; minIdx = i; }
            });
            cur = rem.splice(minIdx, 1)[0];
            seq.push(cur);
        }
        return seq;
    }

    function calcSCAN() {
        const seq  = [INIT_HEAD];
        const high = REQUESTS.filter(function (t) { return t >= INIT_HEAD; }).sort(function (a, b) { return a - b; });
        const low  = REQUESTS.filter(function (t) { return t <  INIT_HEAD; }).sort(function (a, b) { return b - a; });

        high.forEach(function (t) { seq.push(t); });
        if (high.length > 0 || low.length > 0) seq.push(MAX_TRACK);
        low.forEach(function (t) { seq.push(t); });
        return seq;
    }

    function calcCSCAN() {
        const seq  = [INIT_HEAD];
        const high = REQUESTS.filter(function (t) { return t >= INIT_HEAD; }).sort(function (a, b) { return a - b; });
        const low  = REQUESTS.filter(function (t) { return t <  INIT_HEAD; }).sort(function (a, b) { return a - b; });

        high.forEach(function (t) { seq.push(t); });
        seq.push(MAX_TRACK);
        seq.push(MIN_TRACK);
        low.forEach(function (t)  { seq.push(t); });
        return seq;
    }

    function totalDist(seq) {
        let d = 0;
        for (let i = 1; i < seq.length; i++) d += Math.abs(seq[i] - seq[i-1]);
        return d;
    }

    const ALGOS = [
        { name: 'FCFS',   fn: calcFCFS,  col: function() { return P.teal;   }, desc: 'First-Come First-Served — 요청 순서대로 처리' },
        { name: 'SSTF',   fn: calcSSTF,  col: function() { return P.purple; }, desc: 'Shortest Seek Time First — 가장 가까운 트랙 우선' },
        { name: 'SCAN',   fn: calcSCAN,  col: function() { return P.orange; }, desc: 'SCAN (엘리베이터) — 끝까지 이동 후 방향 전환' },
        { name: 'C-SCAN', fn: calcCSCAN, col: function() { return P.green;  }, desc: 'Circular SCAN — 한 방향, 끝에서 0으로 점프' },
    ];

    /* ===================== 상태 ===================== */
    var dskModeIdx = { fcfs: 0, sstf: 1, scan: 2, cscan: 3 };
    var dskCache   = {};

    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function dskSteps(idx) {
        if (!dskCache[idx]) dskCache[idx] = dskBuild(idx);
        return dskCache[idx];
    }
    function currentSteps() { return dskSteps(dskModeIdx[mode] || 0); }
    function defaultLog() {
        return '▶ PLAY를 눌러 헤드 이동 경로를 확인하세요. 알고리즘을 바꿔 비교해 보세요.';
    }

    /* ===================== 단계 데이터 파생 ===================== */
    function dskBuild(idx) {
        var algo = ALGOS[idx];
        var seq  = algo.fn();
        var out  = [];
        var acc  = 0;
        out.push({
            n: 0, from: seq[0], track: seq[0], dist: 0, total: 0, kind: 'init',
            log: algo.name + ' — 초기 헤드 위치: 트랙 ' + INIT_HEAD +
                 '. 요청 큐: [' + REQUESTS.join(', ') + ']. 헤드 이동을 시작합니다.'
        });
        for (var n = 1; n < seq.length; n++) {
            var from = seq[n - 1], to = seq[n];
            var dist = Math.abs(to - from);
            acc += dist;
            var isJump = idx === 3 && from === MAX_TRACK && to === MIN_TRACK;
            var isEdge = !isJump && (idx === 2 || idx === 3) && (to === MAX_TRACK || to === MIN_TRACK);
            var txt;
            if (isJump) {
                txt = algo.name + ' Step ' + n + ' — C-SCAN: 끝(트랙 199)에서 트랙 0으로 점프(이동 없이 복귀). 총 이동: ' + acc + ' 트랙.';
            } else if (isEdge) {
                txt = algo.name + ' Step ' + n + ' — 헤드가 ' + (to === MAX_TRACK ? '최대(199)' : '최소(0)') +
                      '에 도달했습니다. (' + dist + ' 트랙 이동) 총: ' + acc + ' 트랙.';
            } else {
                txt = algo.name + ' Step ' + n + ' — 트랙 ' + from + ' → ' + to +
                      ' (' + dist + ' 트랙 이동). 누적 이동 거리: ' + acc + ' 트랙.';
            }
            out.push({
                n: n, from: from, track: to, dist: dist, total: acc,
                kind: isJump ? 'jump' : (isEdge ? 'edge' : 'req'), log: txt
            });
        }
        return out;
    }
    function dskOrder(steps, v) {
        for (var k = 0; k < steps.length; k++) {
            if (steps[k].kind === 'req' && steps[k].track === v) return k;
        }
        return -1;
    }
    function dskW(str, fs) {
        var w = 0;
        for (var k = 0; k < str.length; k++) w += str.charCodeAt(k) < 128 ? fs * 0.6 : fs;
        return w;
    }
    function dskX(bx0, bw, v) { return bx0 + (v / MAX_TRACK) * bw; }
    function dskArcH(dist, L) { return Math.min(L.maxArc, 4 + dist * L.arcK); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var m = {
            padX: mob ? 12 : 24, fs: mob ? 11 : 12, fsB: mob ? 13 : 14,
            pillH: mob ? 16 : 18, r: mob ? 6 : 7, hA: mob ? 50 : 66,
            cols: mob ? 4 : 8, gap: mob ? 6 : 8, chipH: mob ? 34 : 36, rowGap: 6,
            statH: mob ? 46 : 50, cmpH: mob ? 52 : 54, arcK: mob ? 0.2 : 0.25
        };
        m.rowH = m.pillH + 8;
        m.barY = m.rowH + m.hA;
        m.maxArc = m.hA - 6;
        m.meterY = m.barY + 20 + m.fs;
        m.statY = m.meterY + 16;
        m.cmpY = m.statY + m.statH + 10;
        m.chipTitleY = m.cmpY + m.cmpH + 10;
        m.chipsY = m.chipTitleY + m.fs + 10;
        m.rows = Math.ceil(REQUESTS.length / m.cols);
        m.total = m.chipsY + m.rows * m.chipH + (m.rows - 1) * m.rowGap + 6;
        return m;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 그리기 ===================== */
    function dskTrail(bx0, bw, bY, st, uq, h, col) {
        var x1 = dskX(bx0, bw, st.from), x2 = dskX(bx0, bw, st.track);
        ctx.beginPath();
        ctx.moveTo(x1, bY);
        for (var k = 1; k <= 24; k++) {
            var u = uq * k / 24;
            ctx.lineTo(lerp(x1, x2, u), bY - 4 * h * u * (1 - u));
        }
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2.2;
        ctx.setLineDash(st.kind === 'jump' ? [6, 5] : []);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s     = step || steps[0];
        var pv    = prev || s;
        var fresh = s !== pv;
        var e     = fresh ? clamp01(t) : 1;
        var L     = layout(w, mob);
        var ai    = dskModeIdx[mode] || 0;
        var algo  = ALGOS[ai];
        var col   = algo.col();
        var bx0   = x0 + L.padX, bw = w - 2 * L.padX;
        var bY    = top + L.barY;
        var q     = 1;
        if (fresh) q = s.kind === 'jump' ? ez(clamp01(e * 2)) : ez(e);

        rr(bx0, bY - 3, bw, 6, 3, P.surf2, P.border, 1);
        [0, 50, 100, 150, 199].forEach(function (v) {
            var x = dskX(bx0, bw, v);
            ln(x, bY + 3, x, bY + 7, P.border, 1);
            tx(String(v), x, bY + 10 + L.fs / 2, L.fs, P.sub + 'ff', 'center', false);
        });

        REQUESTS.forEach(function (v) {
            var x   = dskX(bx0, bw, v);
            var k   = dskOrder(steps, v);
            var lit = k >= 0 && (k < s.n || (k === s.n && (!fresh || e >= 0.85)));
            if (lit) circ(x, bY, 4.5, col + 'ff', 'none');
            else     circ(x, bY, 3.5, 'none', P.sub + 'aa', 1.2);
            if (fresh && k === s.n && k >= 0 && e >= 0.85 && e < 1) {
                var pq = seg(e, 0.85, 1);
                ctx.globalAlpha = 1 - pq;
                circ(x, bY, 4 + 8 * pq, 'none', col + 'ff', 1.6);
                ctx.globalAlpha = 1;
            }
        });

        for (var j = 1; j <= s.n; j++) {
            var st = steps[j];
            dskTrail(bx0, bw, bY, st, j < s.n ? 1 : q, dskArcH(st.dist, L), col + (j < s.n ? 'aa' : 'ff'));
        }

        if (fresh && s.kind === 'edge' && e >= 0.8) {
            var er = seg(e, 0.8, 1);
            ctx.globalAlpha = 1 - er;
            circ(dskX(bx0, bw, s.track), bY, L.r + 10 * er, 'none', col + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        var hx = lerp(dskX(bx0, bw, s.from), dskX(bx0, bw, s.track), q);
        var hy = bY - 4 * dskArcH(s.dist, L) * q * (1 - q);
        var pillCY = top + L.pillH / 2 + 1;
        var hv = Math.round(lerp(s.from, s.track, q));
        var pw = dskW('헤드 ' + hv, L.fs) + 14;
        var px = Math.min(Math.max(hx, x0 + pw / 2), x0 + w - pw / 2);
        ln(hx, pillCY + L.pillH / 2, hx, hy - L.r, P.yellow + '88', 1.4, [3, 3]);
        rr(px - pw / 2, pillCY - L.pillH / 2, pw, L.pillH, L.pillH / 2, P.surf2 + 'ee', P.yellow + 'ee', 1.3);
        tx('헤드 ' + hv, px, pillCY, L.fs, P.yellow + 'ff', 'center', true);
        circ(hx, hy, L.r, P.yellow + 'ff', P.bg + 'ff', 2);

        var prevT   = s.total - s.dist;
        var dNow    = Math.round(prevT + s.dist * q);
        var totalAll = steps[steps.length - 1].total;
        var done    = s.n === steps.length - 1;
        var my      = top + L.meterY;
        rr(bx0, my, bw, 8, 4, P.surf2, P.border, 1);
        rr(bx0, my, bw * (totalAll > 0 ? dNow / totalAll : 0), 8, 4, col + 'cc', 'none');

        var sy = top + L.statY, sh = L.statH, cw = w / 3;
        rr(x0, sy, w, sh, 6, P.surf, done ? col : P.border, done ? 2 : 1);
        tx(algo.name, x0 + cw * 0.5, sy + sh * 0.3, L.fs, P.sub + 'ff', 'center', false);
        tx(String(dNow), x0 + cw * 0.5, sy + sh * 0.72, L.fsB, col + 'ff', 'center', true);
        tx(mob ? '이동 거리' : '헤드 이동 거리', x0 + cw * 1.5, sy + sh * 0.3, L.fs, P.sub + 'ff', 'center', false);
        tx(dNow + (done ? ' 트랙' : '...'), x0 + cw * 1.5, sy + sh * 0.72, L.fsB, col + 'ff', 'center', true);
        tx('최대 가능', x0 + cw * 2.5, sy + sh * 0.3, L.fs, P.sub + 'ff', 'center', false);
        tx(String(totalAll), x0 + cw * 2.5, sy + sh * 0.72, L.fsB, P.sub + 'ff', 'center', false);
        [1, 2].forEach(function (d) { ln(x0 + cw * d, sy + 6, x0 + cw * d, sy + sh - 6, P.border, 1); });

        if (done) {
            var cq   = fresh ? ez(seg(e, 0.2, 0.9)) : 1;
            var cmpT = top + L.cmpY, cH = L.cmpH, c4 = w / 4;
            ctx.globalAlpha = cq;
            rr(x0, cmpT, w, cH, 6, P.surf2, P.border, 1);
            tx('알고리즘 비교 (총 이동 거리)', x0 + w / 2, cmpT + cH * 0.24, L.fs, P.sub + 'ff', 'center', false);
            ALGOS.forEach(function (a, i) {
                var arr = dskSteps(i);
                var tot = arr[arr.length - 1].total;
                var mine = i === ai;
                var c = mine ? a.col() + 'ff' : P.sub + 'ff';
                tx(a.name, x0 + c4 * (i + 0.5), cmpT + cH * 0.52, L.fs, c, 'center', mine);
                tx(String(tot), x0 + c4 * (i + 0.5), cmpT + cH * 0.8, L.fsB, c, 'center', mine);
            });
            [1, 2, 3].forEach(function (d) { ln(x0 + c4 * d, cmpT + 8, x0 + c4 * d, cmpT + cH - 8, P.border, 1); });
            ctx.globalAlpha = 1;
        }

        tx('요청 큐 (원래 순서)', x0, top + L.chipTitleY + L.fs / 2, L.fs, P.sub + 'ff', 'left', true);
        var cw2 = (w - (L.cols - 1) * L.gap) / L.cols;
        REQUESTS.forEach(function (v, r) {
            var k    = dskOrder(steps, v);
            var lit  = k >= 0 && (k < s.n || (k === s.n && (!fresh || e >= 0.85)));
            var cur  = lit && k === s.n;
            var tone = cur ? P.orange : (lit ? col : null);
            var cx   = x0 + (r % L.cols) * (cw2 + L.gap);
            var cy   = top + L.chipsY + Math.floor(r / L.cols) * (L.chipH + L.rowGap);
            rr(cx, cy, cw2, L.chipH, 5, tone ? tone + '30' : P.muted + '10',
               tone ? tone + 'ee' : P.muted + '55', tone ? 1.8 : 1);
            tx(String(v), cx + cw2 / 2, cy + L.chipH * 0.36, L.fsB, (tone ? P.text : P.sub) + 'ff', 'center', !!tone);
            tx(lit ? 'Step ' + k : '대기', cx + cw2 / 2, cy + L.chipH * 0.74, L.fs, (tone || P.sub) + 'ff', 'center', false);
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
        speedBtns.forEach(function (b) { b.classList.remove('dsk-viz__speed-btn--active'); });
        btn.classList.add('dsk-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dsk-viz__mode-btn--active', d.key === m); });
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