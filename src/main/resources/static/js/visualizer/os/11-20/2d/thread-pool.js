/**
 * 스레드 풀 시각화
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
    var root    = el('div', 'tp-viz');
    var toolbar = el('div', 'tp-viz__toolbar');
    var tbLeft  = el('div', 'tp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tp-viz__title', 'THREAD POOL'));

    var modeWrap = el('div', 'tp-viz__mode');
    var modeDefs = [
        { key: 'create', label: '생성 비용 비교' },
        { key: 'queue', label: '작업 큐' },
        { key: 'size', label: '풀 크기' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tp-viz__mode-btn' + (i === 0 ? ' tp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tp-viz__speed');
    speedWrap.appendChild(el('span', 'tp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tp-viz__speed-btn' + (i === 0 ? ' tp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tp-viz__controls');
    var btnPlay  = el('button', 'tp-viz__btn tp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tp-viz__btn', '↺ RESET');
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
    var mode    = 'create';
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

    /* ===================== 데이터: 생성 비용 비교 ===================== */
    var N_TASKS   = 8;
    var T_CREATE  = 3;
    var T_DESTROY = 1;
    var T_RUN     = 2;
    var POOL_N    = 3;
    var PER_REQ = { create: N_TASKS * T_CREATE, run: N_TASKS * T_RUN, destroy: N_TASKS * T_DESTROY };
    var POOLED  = { create: POOL_N * T_CREATE, run: N_TASKS * T_RUN, destroy: POOL_N * T_DESTROY };
    function sum3(o) { return o.create + o.run + o.destroy; }
    var MAX_TOTAL = Math.max(sum3(PER_REQ), sum3(POOLED));

    var CREATE_STEPS = [
        { k: 0, log: '요청 ' + N_TASKS + '개를 처리합니다. 스레드 하나를 만드는 데 ' + T_CREATE + ', 없애는 데 ' + T_DESTROY + ', 작업 하나를 실행하는 데 ' + T_RUN + '만큼 든다고 가정합니다(설명용 단위).' },
        { k: 1, log: '요청마다 스레드 — 요청 ' + N_TASKS + '개에 스레드를 ' + N_TASKS + '번 만들고 없앱니다. 생성 ' + PER_REQ.create + ' + 소멸 ' + PER_REQ.destroy + ' = ' + (PER_REQ.create + PER_REQ.destroy) + '를 일 아닌 곳에 씁니다. 요청이 한꺼번에 몰리면 스레드도 그만큼 동시에 생깁니다.' },
        { k: 2, log: '스레드 풀 — 스레드 ' + POOL_N + '개를 미리 만들어 두고 재사용합니다. 생성 ' + POOLED.create + ' + 소멸 ' + POOLED.destroy + ' = ' + (POOLED.create + POOLED.destroy) + '만 듭니다. 동시에 존재하는 스레드는 최대 ' + POOL_N + '개입니다.' },
        { k: 3, log: '같은 일(실행 ' + PER_REQ.run + ')을 하는 데 요청마다 스레드는 총 ' + sum3(PER_REQ) + ', 스레드 풀은 총 ' + sum3(POOLED) + '입니다. 스레드 시간의 합으로 본 값이며 실제 소요 시간은 병렬 실행에 따라 다릅니다.' },
        { k: 3, log: '정리 — 풀은 생성·소멸 비용을 줄이고 스레드 수의 상한을 둡니다. 이 수치는 가정한 값이며 실제 비용은 운영체제와 환경마다 다릅니다.' }
    ];

    /* ===================== 데이터: 작업 큐 ===================== */
    var WORKERS = 3;
    var TASKS = [
        { id: 1, at: 0, dur: 3 }, { id: 2, at: 0, dur: 3 }, { id: 3, at: 0, dur: 3 },
        { id: 4, at: 1, dur: 2 }, { id: 5, at: 1, dur: 2 }, { id: 6, at: 2, dur: 1 }, { id: 7, at: 3, dur: 2 }
    ];
    function simulate() {
        var workers = [];
        for (var i = 0; i < WORKERS; i++) workers.push({ id: 0, left: 0 });
        var queue = [];
        var snaps = [];
        var done = 0;
        for (var t = 0; done < TASKS.length && t < 100; t++) {
            TASKS.forEach(function (tk) { if (tk.at === t) queue.push(tk); });
            workers.forEach(function (w) {
                if (w.left === 0 && queue.length) {
                    var tk = queue.shift();
                    w.id = tk.id;
                    w.left = tk.dur;
                }
            });
            snaps.push({ t: t, workers: workers.map(function (w) { return w.left > 0 ? w.id : 0; }), queue: queue.map(function (q) { return q.id; }), done: done });
            workers.forEach(function (w) {
                if (w.left > 0) {
                    w.left--;
                    if (w.left === 0) { done++; w.id = 0; }
                }
            });
        }
        return snaps;
    }
    var SNAPS = simulate();
    var MAX_Q = SNAPS.reduce(function (m, s) { return Math.max(m, s.queue.length); }, 0);
    function snapLog(s) {
        var busy = s.workers.filter(function (id) { return id > 0; }).length;
        var q = s.queue.length ? ' 대기 큐 ' + s.queue.length + '개(작업 ' + s.queue.join(', ') + ')' : ' 대기 큐 비어 있음';
        return 't=' + s.t + ' — 일하는 스레드 ' + busy + '/' + WORKERS + ',' + q + ', 완료 ' + s.done + '개.';
    }
    var QUEUE_STEPS = [{ s: null, log: '스레드 풀 — 스레드 ' + WORKERS + '개와 작업 큐가 있습니다. 작업 ' + TASKS.length + '개가 시간에 맞춰 들어옵니다(작업 길이는 예시 값).' }]
        .concat(SNAPS.map(function (s) { return { s: s, log: snapLog(s) }; }))
        .concat([{ s: SNAPS[SNAPS.length - 1], log: '정리 — 스레드가 모두 일하는 동안 새 작업은 큐에서 순서를 기다리고(최대 ' + MAX_Q + '개), 스레드가 비면 큐 앞의 작업부터 꺼내 실행합니다.' }]);

    /* ===================== 데이터: 풀 크기 ===================== */
    var CORES  = 4;
    var C_TIME = 1;
    var W_TIME = 3;
    var SIZES  = [2, 4, 8, 16, 32];
    function utilCpu(n) { return Math.min(CORES, n) / CORES; }
    function utilIo(n) { return Math.min(CORES, n * C_TIME / (C_TIME + W_TIME)) / CORES; }
    var NEED_IO = CORES * (C_TIME + W_TIME) / C_TIME;
    function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }

    var SIZE_STEPS = [
        { k: 0, log: 'CPU 코어 ' + CORES + '개에서 풀 크기를 정합니다. 작업이 계산만 하는지, 입출력을 기다리는 시간이 긴지에 따라 알맞은 크기가 달라집니다.' },
        { k: 1, log: 'CPU 바운드 작업(계산만) — 스레드가 ' + CORES + '개면 코어가 모두 찹니다(' + pct(utilCpu(CORES)) + '). 그 이상은 코어를 더 쓰지 못하고 전환 비용만 늘립니다.' },
        { k: 2, log: 'I/O 바운드 작업 — 계산 ' + C_TIME + ' 뒤 입출력 대기 ' + W_TIME + '인 작업이라면 스레드 하나가 CPU를 쓰는 비율은 ' + pct(C_TIME / (C_TIME + W_TIME)) + '뿐입니다. 스레드 ' + CORES + '개의 코어 사용률은 ' + pct(utilIo(CORES)) + '입니다.' },
        { k: 3, log: '코어를 채우려면 코어 수 × (1 + 대기/계산) = ' + CORES + ' × (1 + ' + W_TIME + '/' + C_TIME + ') = ' + NEED_IO + '개 정도가 필요합니다. 대기 시간이 길수록 더 큰 풀이 도움이 됩니다.' },
        { k: 3, log: '정리 — CPU 바운드는 코어 수 안팎, I/O 바운드는 대기 비율만큼 더 크게 잡는 것이 출발점입니다. 최종 크기는 측정으로 정합니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'queue') return QUEUE_STEPS;
        if (mode === 'size') return SIZE_STEPS;
        return CREATE_STEPS;
    }
    function defaultLog() {
        if (mode === 'queue') return '스레드가 모두 일하는 동안 새 작업이 작업 큐에서 순서를 기다리는 과정을 봅니다.';
        if (mode === 'size') return 'CPU 바운드와 I/O 바운드 작업에서 풀 크기에 따라 코어 사용률이 어떻게 달라지는지 봅니다.';
        return '요청마다 스레드를 만들 때와 스레드 풀을 쓸 때 생성·소멸에 드는 시간을 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var total = mode === 'queue' ? 232 : (mode === 'size' ? (mob ? 304 : 306) : (mob ? 266 : 278));
        return { fs: mob ? 11 : 12, total: total };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 생성 비용 비교 ===================== */
    function drawCreate(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var bh = mob ? 30 : 36;
        var unit = (w - 2) / MAX_TOTAL;
        var segs = [['create', '생성', P.orange], ['run', '실행', P.teal], ['destroy', '소멸', P.red]];
        var rows = [
            [1, mob ? '요청마다 스레드' : '요청마다 스레드 생성·소멸', PER_REQ, top + 36, N_TASKS],
            [2, mob ? '스레드 풀' : '스레드 풀(' + POOL_N + '개 재사용)', POOLED, top + 36 + bh + 64, POOL_N]
        ];
        tx('스레드 시간의 합 (작업 ' + N_TASKS + '개)', x0, top + 10, fs, P.sub + 'ff', 'left', false);
        rows.forEach(function (row) {
            var on = k >= row[0];
            var y = row[3];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ff' : P.sub + 'ff', 'left', true);
            if (!on) { rr(x0, y + 4, w - 2, bh, 4, 'none', P.sub + '55', 1); return; }
            var fresh = pk < row[0];
            var g = fresh ? ez(e) : 1;
            var totalW = sum3(row[2]) * unit;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, y, totalW * g + 1, bh + 12);
            ctx.clip();
            var x = x0;
            segs.forEach(function (sg) {
                var v = row[2][sg[0]];
                if (v <= 0) return;
                rr(x, y + 4, v * unit - 2, bh, 4, sg[2] + '30', sg[2] + 'ff', 1.4);
                if (v * unit > 26) tx(String(v), x + (v * unit) / 2 - 1, y + 4 + bh / 2, fs, sg[2] + 'ff', 'center', true);
                x += v * unit;
            });
            ctx.restore();
            if (fresh && e < 1) circ(x0 + totalW * g, y + 4 + bh / 2, 5, P.yellow + 'ff', 'none');
            var nth = Math.min(row[4], Math.ceil(row[4] * g));
            for (var t = 0; t < row[4]; t++) {
                var on2 = t < nth;
                rr(x0 + w - 10 - (row[4] - t) * 12, y - 16, 9, 9, 2, on2 ? P.purple + '66' : 'none', on2 ? P.purple + 'ff' : P.sub + '55', 1.2);
            }
            ctx.globalAlpha = fresh ? clamp01((g - 0.8) / 0.2) : 1;
            tx('합계 ' + sum3(row[2]), x0, y + bh + 22, fs, P.text + 'ff', 'left', true);
            tx(row[0] === 1 ? '동시 스레드 최대 ' + N_TASKS + '개' : '동시 스레드 최대 ' + POOL_N + '개', x0 + w, y + bh + 22, fs - 0.5, P.sub + 'ff', 'right', false);
            ctx.globalAlpha = 1;
        });
        if (k >= 3) {
            var sv = sum3(PER_REQ) - sum3(POOLED);
            var pc = Math.round(sv * 100 / sum3(PER_REQ));
            ctx.globalAlpha = pk >= 3 ? 1 : clamp01((e - 0.2) / 0.5);
            tx('풀이 ' + sv + ' (' + pc + '%) 적다', x0 + w / 2, top + 36 + bh + 40, fs - 0.5, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        var ly = top + 36 + 2 * bh + 64 + 56;
        var lx = x0;
        segs.forEach(function (sg) {
            rr(lx, ly - 6, 12, 12, 3, sg[2] + '30', sg[2] + 'ff', 1.2);
            tx(sg[1], lx + 18, ly, fs - 0.5, P.sub + 'ff', 'left', false);
            lx += mob ? 64 : 80;
        });
    }

    /* ===================== 작업 큐 ===================== */
    function locOf(sn, id) {
        if (!sn) return { t: 'none' };
        var qi = sn.queue.indexOf(id);
        if (qi >= 0) return { t: 'q', i: qi };
        var wi = sn.workers.indexOf(id);
        if (wi >= 0) return { t: 'w', i: wi };
        return TASKS[id - 1].at <= sn.t ? { t: 'done' } : { t: 'none' };
    }
    function drawQueue(x0, top, w, mob, s, p, e, fs) {
        var sn = s.s, pn = p.s;
        var cw = mob ? 30 : 40;
        var q = ez(e);
        tx('작업 큐 (대기 중인 작업)', x0, top + 10, fs, P.text + 'ff', 'left', true);
        for (var i = 0; i < 8; i++) rr(x0 + i * (cw + 6), top + 22, cw, 30, 5, 'none', P.sub + '55', 1.3);
        tx('스레드 풀 (' + WORKERS + '개)', x0, top + 82, fs, P.text + 'ff', 'left', true);
        var bw = Math.min(110, (w - 2 * 12) / WORKERS);
        for (var j = 0; j < WORKERS; j++) {
            var bx = x0 + j * (bw + 12);
            var wid = sn ? sn.workers[j] : 0;
            rr(bx, top + 94, bw, 50, 6, wid ? P.teal + '22' : 'none', wid ? P.teal + 'cc' : P.sub + '77', 1.5);
            tx('스레드 ' + (j + 1), bx + bw / 2, top + 106, fs - 1.5, P.sub + 'ff', 'center', false);
            if (!wid) tx('쉬는 중', bx + bw / 2, top + 128, fs, P.sub + 'ff', 'center', true);
        }
        var doneBar = { x: x0 + w, y: top + 196 };
        var spot = function (l) {
            if (l.t === 'q') return { x: x0 + l.i * (cw + 6) + cw / 2, y: top + 37 };
            if (l.t === 'w') return { x: x0 + l.i * (bw + 12) + bw / 2, y: top + 128 };
            return doneBar;
        };
        for (var id = 1; id <= TASKS.length; id++) {
            var to = locOf(sn, id), from = locOf(pn, id);
            if (to.t === 'none') continue;
            if (to.t === 'done' && from.t === 'done') continue;
            var a = 1;
            var pos;
            var tp = spot(to);
            if (from.t === 'none') {
                var fp = { x: x0 - 30, y: top + 37 };
                pos = { x: lerp(fp.x, tp.x, q), y: lerp(fp.y, tp.y, q) };
                a = clamp01(e * 3);
            } else if (to.t === 'done') {
                var fp2 = spot(from);
                pos = { x: lerp(fp2.x, tp.x, q), y: lerp(fp2.y, tp.y, q) };
                a = 1 - q;
            } else {
                var fp3 = spot(from);
                pos = { x: lerp(fp3.x, tp.x, q), y: lerp(fp3.y, tp.y, q) };
            }
            var inW = to.t === 'w';
            var col = inW ? P.teal : (to.t === 'done' ? P.green : P.purple);
            var cwid = inW ? 62 : cw - 4;
            ctx.globalAlpha = a;
            rr(pos.x - cwid / 2, pos.y - (inW ? 12 : 13), cwid, inW ? 24 : 26, 4, col + '40', col + 'ff', 1.6);
            tx(inW ? '작업 ' + id : 'T' + id, pos.x, pos.y, fs - (inW ? 1 : 0), col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        var doneN = sn ? sn.done : 0;
        var pDone = pn ? pn.done : 0;
        var shown = e >= 1 ? doneN : pDone;
        tx('완료 ' + shown + ' / ' + TASKS.length + (sn ? '   (t=' + sn.t + ')' : ''), x0, top + 176, fs + 0.5, shown === TASKS.length ? P.green + 'ff' : P.text + 'ff', 'left', true);
        var pw = w - 2;
        rr(x0, top + 192, pw, 8, 4, 'none', P.sub + '55', 1);
        var dw = pw * lerp(pDone, doneN, q) / TASKS.length;
        if (dw > 0) rr(x0, top + 192, dw, 8, 4, P.green + '55', P.green + 'ff', 1);
    }

    /* ===================== 풀 크기 ===================== */
    function drawSize(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var lw = mob ? 62 : 84;
        var barX = x0 + lw;
        var maxW = w - lw - (mob ? 46 : 56);
        var bh = mob ? 12 : 14;
        tx('코어 사용률  (코어 ' + CORES + '개)', x0, top + 10, fs, P.text + 'ff', 'left', true);
        var lg = x0 + w;
        var off = mob ? 16 : 0;
        tx('I/O 바운드', lg, top + 10 + off, fs - 1, P.orange + 'ff', 'right', true);
        tx('CPU 바운드', lg - (mob ? 70 : 82), top + 10 + off, fs - 1, P.teal + 'ff', 'right', true);
        SIZES.forEach(function (n, i) {
            var y = top + 30 + off + i * (2 * bh + 16);
            var hot = k >= 3 && n === NEED_IO;
            if (hot) rr(x0 - 4, y - 5, w + 8, 2 * bh + 13, 6, P.yellow + '14', P.yellow + 'ff', 1.8);
            tx('스레드 ' + n, x0, y + bh, fs, P.text + 'ff', 'left', true);
            [[1, utilCpu(n), P.teal], [2, utilIo(n), P.orange]].forEach(function (b, bi) {
                var by = y + bi * (bh + 3);
                rr(barX, by, maxW, bh, 3, 'none', P.sub + '55', 1);
                if (k >= b[0]) {
                    var g = pk < b[0] ? ez((e - i * 0.1) / 0.6) : 1;
                    rr(barX, by, Math.max(2, maxW * b[1] * g), bh, 3, b[2] + '38', b[2] + 'ff', 1.2);
                    ctx.globalAlpha = g;
                    tx(pct(b[1]), barX + maxW + 6, by + bh / 2, fs - 1.5, b[2] + 'ff', 'left', true);
                    ctx.globalAlpha = 1;
                }
            });
        });
        if (k >= 3) {
            var fy = top + 30 + off + SIZES.length * (2 * bh + 16) + 6;
            ctx.globalAlpha = pk >= 3 ? 1 : clamp01((e - 0.3) / 0.5);
            var fl = lines(CORES + ' × (1 + ' + W_TIME + '/' + C_TIME + ') = ' + NEED_IO + '개 (I/O 바운드 기준)', w, fs + 0.5);
            fl.forEach(function (l, li) { tx(l, x0, fy + li * (fs + 5), fs + 0.5, P.yellow + 'ff', 'left', true); });
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'queue') drawQueue(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'size') drawSize(x0, top, w, mob, s, p, e, L.fs);
        else drawCreate(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('tp-viz__speed-btn--active'); });
        btn.classList.add('tp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tp-viz__mode-btn--active', d.key === m); });
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