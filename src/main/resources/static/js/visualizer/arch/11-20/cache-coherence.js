/**
 * 캐시 일관성(MESI) 시각화
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
    var root    = el('div', 'coh-viz');
    var toolbar = el('div', 'coh-viz__toolbar');
    var tbLeft  = el('div', 'coh-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'coh-viz__title', 'CACHE COHERENCE'));

    var modeWrap = el('div', 'coh-viz__mode');
    var modeDefs = [
        { key: 'problem', label: '일관성 문제' },
        { key: 'mesi', label: 'MESI 상태 전이' },
        { key: 'false', label: '거짓 공유' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'coh-viz__mode-btn' + (i === 0 ? ' coh-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'coh-viz__speed');
    speedWrap.appendChild(el('span', 'coh-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'coh-viz__speed-btn' + (i === 0 ? ' coh-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'coh-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'coh-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'coh-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'coh-viz__controls');
    var btnPlay  = el('button', 'coh-viz__btn coh-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'coh-viz__btn', '▶| STEP');
    var btnReset = el('button', 'coh-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 일관성 문제 ===================== */
    var V0 = 5;
    var V1 = 7;
    var V2 = 9;
    var ST_LABEL = { N: '캐시에 없음', C: '복사본', M: 'M 수정됨', E: 'E 단독', S: 'S 공유', I: 'I 무효' };
    function stCol(s) {
        if (s === 'M') return P.orange;
        if (s === 'E') return P.green;
        if (s === 'S') return P.teal;
        if (s === 'C') return P.purple;
        return P.muted;
    }
    function cs(s, v, stale) { return { s: s, v: v, stale: !!stale }; }

    var PROB_STEPS = [
        { c: [cs('N', null), cs('N', null)], mem: V0, msg: '', act: -1, log: '메모리의 변수 X는 ' + V0 + '입니다. 코어 0과 코어 1은 각자 캐시를 가지고 있고 아직 X를 읽지 않았습니다.' },
        { c: [cs('C', V0), cs('N', null)], mem: V0, msg: '읽기 요청', act: 0, log: '코어 0이 X를 읽습니다. 메모리에서 가져와 자기 캐시에 복사본을 둡니다.' },
        { c: [cs('C', V0), cs('C', V0)], mem: V0, msg: '읽기 요청', act: 1, log: '코어 1도 X를 읽습니다. 이제 같은 주소의 복사본이 두 캐시에 하나씩 있습니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '신호 없음', act: 0, log: '코어 0이 X에 ' + V1 + '을 씁니다. 일관성 프로토콜이 없다면 코어 1의 복사본은 그대로 ' + V0 + '입니다. 낡은 값입니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '', act: 1, log: '코어 1이 X를 읽으면 자기 캐시의 낡은 값 ' + V0 + '을 얻습니다. 같은 변수를 코어마다 다른 값으로 보게 됩니다.' },
        { c: [cs('C', V1), cs('C', V0, true)], mem: V0, msg: '', act: -1, log: '정리 — 이것이 캐시 일관성 문제입니다. 일관성 프로토콜은 한 코어가 쓰면 다른 코어의 복사본을 무효화하거나 갱신해 모든 코어가 같은 값을 보게 합니다.' }
    ];

    /* ===================== 데이터: MESI 상태 전이 ===================== */
    var MESI_STEPS = [
        { c: [cs('I', null), cs('I', null)], mem: V0, ms: false, msg: '', act: -1, log: '모든 캐시 라인이 무효(I) 상태입니다. 메모리의 X는 ' + V0 + '입니다.' },
        { c: [cs('E', V0), cs('I', null)], mem: V0, ms: false, msg: '읽기 요청', act: 0, log: '코어 0이 X를 읽습니다. 다른 캐시에 복사본이 없으므로 단독(E) 상태로 들어옵니다.' },
        { c: [cs('M', V1), cs('I', null)], mem: V0, ms: true, msg: '신호 없음', act: 0, log: '코어 0이 X에 ' + V1 + '을 씁니다. 단독(E) 라인은 다른 캐시에 알릴 필요 없이 수정됨(M)으로 바뀝니다. 메모리 값 ' + V0 + '은 낡은 값이 됩니다.' },
        { c: [cs('S', V1), cs('S', V1)], mem: V1, ms: false, msg: '데이터 제공(코어 0)', act: 1, log: '코어 1이 X를 읽습니다. 수정됨(M) 라인을 가진 코어 0이 최신 값 ' + V1 + '을 내주고(기본 MESI에서는 메모리에도 반영) 두 라인 모두 공유(S)가 됩니다.' },
        { c: [cs('M', V2), cs('I', null)], mem: V1, ms: true, msg: '무효화 신호', act: 0, log: '코어 0이 공유(S) 라인에 ' + V2 + '를 씁니다. 먼저 무효화 신호를 보내 코어 1의 복사본을 무효(I)로 만든 뒤 자신의 라인을 수정됨(M)으로 바꿉니다.' },
        { c: [cs('M', V2), cs('I', null)], mem: V1, ms: true, msg: '', act: -1, log: '정리 — 쓰기 전에는 반드시 다른 복사본이 무효화되므로, 한 시점에 수정됨(M) 라인은 한 캐시에만 있습니다. 코어 1이 다시 읽으면 코어 0이 최신 값을 내줍니다.' }
    ];

    /* ===================== 데이터: 거짓 공유 ===================== */
    var FS_SEQ = [0, 1, 0, 1];
    function fsMoves(split, n) {
        var moves = 0;
        if (split) return 0;
        for (var i = 1; i < n; i++) if (FS_SEQ[i] !== FS_SEQ[i - 1]) moves++;
        return moves;
    }
    var FS_N = FS_SEQ.length;

    var FALSE_STEPS = [
        { split: false, n: 0, log: '코어 0은 변수 a만, 코어 1은 변수 b만 씁니다. 둘은 서로 다른 변수지만 메모리에서 나란히 놓여 같은 캐시 라인에 들어 있습니다.' },
        { split: false, n: 1, log: '코어 0이 a에 씁니다. 라인을 가져와 수정됨(M)으로 만듭니다.' },
        { split: false, n: 2, log: '코어 1이 b에 씁니다. a와 b는 다른 변수지만 같은 라인이므로, 코어 0의 라인을 무효화하고 가져와야 합니다. 라인 이동 ' + fsMoves(false, 2) + '회.' },
        { split: false, n: 3, log: '코어 0이 a에 다시 씁니다. 이번에는 코어 1의 라인을 되가져옵니다. 라인 이동 ' + fsMoves(false, 3) + '회. 서로 공유하는 데이터가 없는데도 라인이 오갑니다.' },
        { split: false, n: 4, log: '쓰기 ' + FS_N + '번에 라인 이동 ' + fsMoves(false, 4) + '회가 일어났습니다. 이것이 거짓 공유(false sharing)입니다.' },
        { split: true, n: 4, log: 'a와 b를 서로 다른 캐시 라인에 두면(패딩, 정렬) 같은 쓰기 ' + FS_N + '번에도 각 코어가 자기 라인을 수정됨(M)으로 유지해 라인 이동이 ' + fsMoves(true, 4) + '회입니다.' },
        { split: true, n: 4, sum: true, log: '정리 — 같은 라인에 놓인 변수는 서로 무관해도 캐시 라인 단위로 일관성이 관리됩니다. 쓰기 ' + FS_N + '번 기준 라인 이동은 ' + fsMoves(false, 4) + '회 대 ' + fsMoves(true, 4) + '회입니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'problem';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'mesi') return MESI_STEPS;
        if (mode === 'false') return FALSE_STEPS;
        return PROB_STEPS;
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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 코어 상자와 버스 ===================== */
    function geom(x0, top, w, mob) {
        var gap = mob ? 12 : 40;
        var bw  = Math.min(250, (w - gap) / 2);
        var bh  = mob ? 124 : 134;
        var sx  = x0 + (w - 2 * bw - gap) / 2;
        var by  = top + 6;
        return { bw: bw, bh: bh, by: by, xs: [sx, sx + bw + gap], busY: by + bh + 26 };
    }

    function drawFrame(g, i, col, active, mob) {
        var fs = mob ? 10.5 : 12;
        rr(g.xs[i], g.by, g.bw, g.bh, 8, col + '14', active ? P.purple + 'ee' : col + '77', active ? 2.6 : 1.4);
        tx('Core ' + i, g.xs[i] + 12, g.by + 16, fs + 1, P.text + 'ee', 'left', true);
        tx('L1 캐시', g.xs[i] + g.bw - 12, g.by + 16, fs - 1, P.muted + 'cc', 'right', false);
    }

    function drawBus(g, label, memTxt, memStale, mob) {
        var fs  = mob ? 10 : 11.5;
        var cx0 = g.xs[0] + g.bw / 2;
        var cx1 = g.xs[1] + g.bw / 2;
        var bx  = cx0 - 14;
        var bwd = cx1 - cx0 + 28;
        ctx.strokeStyle = P.muted + '99';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx0, g.by + g.bh);
        ctx.lineTo(cx0, g.busY);
        ctx.moveTo(cx1, g.by + g.bh);
        ctx.lineTo(cx1, g.busY);
        ctx.stroke();
        rr(bx, g.busY, bwd, 26, 6, label ? P.orange + '26' : P.muted + '12', label ? P.orange + 'cc' : P.muted + '66', 1.4);
        tx(label || '버스', bx + bwd / 2, g.busY + 13, fs, label ? P.orange + 'ee' : P.muted + 'aa', 'center', true);
        if (memTxt === null) return;
        var mx = (cx0 + cx1) / 2;
        var mw = Math.min(230, bwd);
        ctx.beginPath();
        ctx.moveTo(mx, g.busY + 26);
        ctx.lineTo(mx, g.busY + 44);
        ctx.stroke();
        var mc = memStale ? P.red : P.green;
        rr(mx - mw / 2, g.busY + 44, mw, 44, 6, mc + '14', mc + 'aa', 1.4);
        tx('Memory', mx, g.busY + 44 + 14, fs, P.muted + 'dd', 'center', true);
        tx(memTxt + (memStale ? ' (낡음)' : ''), mx, g.busY + 44 + 31, fs + 1, mc + 'ee', 'center', true);
    }

    /* ===================== 모드: 일관성 문제 · MESI ===================== */
    function drawCoh(x0, top, w, mob, step, mesi) {
        var fs = mob ? 10.5 : 12;
        var g  = geom(x0, top, w, mob);
        for (var i = 0; i < 2; i++) {
            var c      = step ? step.c[i] : (mesi ? cs('I', null) : cs('N', null));
            var col    = c.stale ? P.red : stCol(c.s);
            var active = step && step.act === i;
            drawFrame(g, i, col, active, mob);
            var x = g.xs[i];
            rr(x + 12, g.by + 34, g.bw - 24, 32, 6, col + '26', col + 'cc', 1.4);
            tx(ST_LABEL[c.s], x + g.bw / 2, g.by + 50, fs + 1, col + 'ee', 'center', true);
            var val = c.v === null ? 'X = —' : 'X = ' + c.v;
            tx(val, x + g.bw / 2, g.by + 88, fs + 4, c.v === null ? P.muted + '99' : P.text + 'ee', 'center', true);
            if (c.stale) tx('낡은 값', x + g.bw / 2, g.by + 112, fs, P.red + 'ee', 'center', true);
        }
        var label = step ? step.msg : '';
        var memTxt = 'X = ' + (step ? step.mem : V0);
        drawBus(g, label, memTxt, !!(step && step.ms), mob);
    }

    /* ===================== 모드: 거짓 공유 ===================== */
    function drawFalse(x0, top, w, mob, step) {
        var fs    = mob ? 10.5 : 12;
        var n     = step ? step.n : 0;
        var split = step ? step.split : false;
        var g     = geom(x0, top, w, mob);
        var last  = n > 0 ? FS_SEQ[n - 1] : -1;
        var wrote = [false, false];
        for (var k = 0; k < n; k++) wrote[FS_SEQ[k]] = true;

        for (var i = 0; i < 2; i++) {
            var st = 'N';
            if (split) st = n > 0 ? 'M' : 'N';
            else if (i === last) st = 'M';
            else if (wrote[i]) st = 'I';
            var col = stCol(st);
            drawFrame(g, i, col, n > 0 && i === last, mob);
            var x = g.xs[i];
            tx(split ? '라인 ' + (i === 0 ? 'A' : 'B') : '같은 캐시 라인', x + 12, g.by + 38, fs - 0.5, P.muted + 'dd', 'left', false);
            var vars = split ? [i === 0 ? 'a' : 'b'] : ['a', 'b'];
            var cw = (g.bw - 24 - 8 * (vars.length - 1)) / vars.length;
            vars.forEach(function (v, vi) {
                var own = (v === 'a' && i === 0) || (v === 'b' && i === 1);
                var cx  = x + 12 + vi * (cw + 8);
                rr(cx, g.by + 50, cw, 30, 5, own ? P.purple + '30' : P.muted + '14', own ? P.purple + 'cc' : P.muted + '66', own ? 1.8 : 1.1);
                tx(v + (own && !mob ? ' (쓰기)' : ''), cx + cw / 2, g.by + 65, fs - 0.5, own ? P.text + 'ee' : P.muted + 'cc', 'center', own);
            });
            rr(x + 12, g.by + 92, g.bw - 24, 28, 6, col + '26', col + 'cc', 1.4);
            tx(ST_LABEL[st], x + g.bw / 2, g.by + 106, fs, col + 'ee', 'center', true);
        }

        var moved = !split && n >= 2 && FS_SEQ[n - 1] !== FS_SEQ[n - 2];
        drawBus(g, moved ? '캐시 라인 이동' : '', null, false, mob);

        var cy  = g.busY + 52;
        var cnt = fsMoves(split, n);
        tx('캐시 라인 이동: ' + cnt + '회', x0, cy, fs + 2, cnt > 0 ? P.orange + 'ee' : P.green + 'ee', 'left', true);
        if (step && step.sum) {
            tx('같은 라인 ' + fsMoves(false, FS_N) + '회 → 라인 분리 ' + fsMoves(true, FS_N) + '회', x0, cy + 24, fs, P.green + 'ee', 'left', true);
        }
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

        if (mode === 'false') drawFalse(padX, top, fullW, mob, step);
        else drawCoh(padX, top, fullW, mob, step, mode === 'mesi');

        if (!step) {
            var hint = '아래 STEP을 눌러 캐시 일관성이 어떻게 유지되는지 확인하세요.';
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
        if (mode === 'false') neededH = mob ? 360 : 380;
        else neededH = mob ? 330 : 350;
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
        if (mode === 'mesi') return '캐시 라인 상태(M, E, S, I)가 읽기와 쓰기에 따라 어떻게 바뀌는지 코어 0과 코어 1로 따라가 봅니다.';
        if (mode === 'false') return '서로 다른 변수인데 같은 캐시 라인에 있어서 라인이 코어 사이를 오가는 거짓 공유를 봅니다.';
        return '일관성 프로토콜이 없다면 코어마다 같은 변수의 값이 달라질 수 있습니다. 읽기와 쓰기를 따라가 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('coh-viz__speed-btn--active'); });
        btn.classList.add('coh-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('coh-viz__mode-btn--active', d.key === m); });
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