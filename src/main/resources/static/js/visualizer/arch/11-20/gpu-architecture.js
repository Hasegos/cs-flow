/**
 * GPU 아키텍처 시각화 시각화
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
    var root    = el('div', 'gpu-viz');
    var toolbar = el('div', 'gpu-viz__toolbar');
    var tbLeft  = el('div', 'gpu-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'gpu-viz__title', 'GPU ENGINE'));

    var modeWrap = el('div', 'gpu-viz__mode');
    var modeDefs = [
        { key: 'cpugpu', label: 'CPU vs GPU' },
        { key: 'warp', label: '워프와 분기' },
        { key: 'latency', label: '지연 숨기기' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'gpu-viz__mode-btn' + (i === 0 ? ' gpu-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'gpu-viz__speed');
    speedWrap.appendChild(el('span', 'gpu-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'gpu-viz__speed-btn' + (i === 0 ? ' gpu-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'gpu-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'gpu-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'gpu-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'gpu-viz__controls');
    var btnPlay  = el('button', 'gpu-viz__btn gpu-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'gpu-viz__btn', '▶| STEP');
    var btnReset = el('button', 'gpu-viz__btn', '↺ RESET');
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
    var mode    = 'cpugpu';
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

    /* ===================== 데이터: CPU vs GPU ===================== */
    var ELEMS     = 64;
    var CPU_CORES = 4;
    var GPU_CORES = 64;
    var CPU_ROUNDS = Math.ceil(ELEMS / CPU_CORES);
    var GPU_ROUNDS = Math.ceil(ELEMS / GPU_CORES);

    var CG_STEPS = [
        { c: false, g: false, log: '같은 일 — 원소 ' + ELEMS + '개짜리 두 배열을 원소끼리 더합니다. 원소마다 하는 일은 같고 서로 독립입니다. 코어 수는 설명을 위한 가정입니다.' },
        { c: true, g: false, log: 'CPU — 크고 복잡한 코어 ' + CPU_CORES + '개가 한 번에 ' + CPU_CORES + '개씩 처리하면 ' + CPU_ROUNDS + '번 반복해야 합니다. 코어마다 큰 캐시와 복잡한 제어 장치를 갖춰 한 코어는 빠르고 영리합니다.' },
        { c: true, g: true, log: 'GPU — 단순한 코어 ' + GPU_CORES + '개가 한 번에 ' + GPU_CORES + '개씩 처리하면 ' + GPU_ROUNDS + '번에 끝납니다. 코어마다 제어 장치와 캐시를 줄이고 연산 장치를 많이 둔 구조입니다.' },
        { c: true, g: true, log: '단, 이 이득은 원소가 많고 서로 독립일 때 생깁니다. 원소가 몇 개뿐이거나 앞 결과에 의존하면 GPU 코어 대부분이 놀고, 코어 하나의 속도는 CPU가 빠를 수 있습니다.' },
        { c: true, g: true, log: '정리 — CPU는 지연(한 작업을 빨리)에, GPU는 처리량(많은 작업을 한꺼번에)에 맞춘 설계입니다. 어느 쪽이 낫다기보다 알맞은 일이 다릅니다.' }
    ];

    /* ===================== 데이터: 워프와 분기 ===================== */
    var LANES = 32;
    var PRED = [];
    for (var li = 0; li < LANES; li++) PRED.push(((li * 5) % 8) < 3 ? 'A' : 'B');
    var CNT_A = PRED.filter(function (p) { return p === 'A'; }).length;
    var CNT_B = LANES - CNT_A;

    var WARP_STEPS = [
        { ph: 'none', log: '워프(warp) — NVIDIA GPU는 스레드 ' + LANES + '개를 묶어 한 번에 같은 명령어를 실행합니다. 한 칸이 스레드 하나입니다.' },
        { ph: 'all', passes: 1, log: '분기가 없으면 ' + LANES + '개 스레드가 모두 같은 명령을 실행해 한 번에 끝납니다.' },
        { ph: 'split', passes: 1, log: '조건문(if x < 0 … else …) — 스레드마다 데이터가 달라 ' + CNT_A + '개는 경로 A, ' + CNT_B + '개는 경로 B로 갈립니다.' },
        { ph: 'A', passes: 1, log: '경로 A 실행 — 경로 A의 스레드만 일하고 나머지 ' + CNT_B + '개는 꺼진 채(마스크) 기다립니다.' },
        { ph: 'B', passes: 2, log: '경로 B 실행 — 이번에는 경로 B의 스레드만 일하고 ' + CNT_A + '개가 기다립니다. 두 경로가 차례로 실행되어 2번이 걸립니다.' },
        { ph: 'B', passes: 2, log: '정리 — 한 워프 안에서 분기가 갈리면 각 경로가 차례로 실행되어 시간이 늘어납니다(워프 분기). 같은 워프의 스레드가 같은 경로를 타도록 데이터를 정리하면 피할 수 있습니다.' }
    ];

    /* ===================== 데이터: 지연 숨기기 ===================== */
    var C_RUN  = 4;
    var M_WAIT = 12;
    var T_MAX  = 32;
    function simulate(nw) {
        var st = [];
        var left = [];
        var wait = [];
        var i;
        for (i = 0; i < nw; i++) { st.push('run'); left.push(C_RUN); wait.push(0); }
        var grid = [];
        for (i = 0; i < nw; i++) grid.push([]);
        var busy = 0;
        for (var t = 0; t < T_MAX; t++) {
            var picked = -1;
            for (i = 0; i < nw; i++) {
                if (st[i] === 'wait' && wait[i] === 0) { st[i] = 'run'; left[i] = C_RUN; }
            }
            for (i = 0; i < nw; i++) if (picked < 0 && st[i] === 'run') picked = i;
            for (i = 0; i < nw; i++) {
                if (i === picked) {
                    grid[i].push('C');
                    left[i]--;
                    if (left[i] === 0) { st[i] = 'wait'; wait[i] = M_WAIT; }
                } else if (st[i] === 'wait') {
                    grid[i].push('M');
                    wait[i]--;
                } else {
                    grid[i].push('R');
                }
            }
            if (picked >= 0) busy++;
        }
        return { grid: grid, util: Math.round(busy * 100 / T_MAX) };
    }
    var SIM1 = simulate(1);
    var SIM2 = simulate(2);
    var SIM4 = simulate(4);
    var SIMS = { 1: SIM1, 2: SIM2, 4: SIM4 };

    var LAT_STEPS = [
        { w: 0, log: '워프는 계산 ' + C_RUN + '사이클 뒤에 메모리를 읽고 ' + M_WAIT + '사이클을 기다린다고 가정합니다(예시 값). 한 사이클에 한 워프만 계산할 수 있습니다.' },
        { w: 1, log: '워프 1개 — 메모리를 기다리는 동안 할 일이 없어 계산 유닛이 쉽니다. 활용률 ' + SIM1.util + '%.' },
        { w: 2, log: '워프 2개 — 한 워프가 기다리는 동안 다른 워프가 계산합니다. 활용률 ' + SIM2.util + '%.' },
        { w: 4, log: '워프 4개 — 기다리는 시간이 다른 워프의 계산으로 채워져 계산 유닛이 쉬지 않습니다. 활용률 ' + SIM4.util + '%.' },
        { w: 4, log: '정리 — GPU는 캐시로 지연을 줄이는 대신 많은 워프를 번갈아 실행해 메모리 지연을 숨깁니다. 이 모델에서는 활용률이 ' + SIM1.util + '% → ' + SIM2.util + '% → ' + SIM4.util + '%로 늘어납니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'warp') return WARP_STEPS;
        if (mode === 'latency') return LAT_STEPS;
        return CG_STEPS;
    }
    function defaultLog() {
        if (mode === 'warp') return '스레드 32개가 묶인 워프가 같은 명령을 실행할 때 분기가 갈리면 어떻게 되는지 봅니다.';
        if (mode === 'latency') return '메모리를 기다리는 동안 다른 워프를 실행해 지연을 숨기는 GPU의 방식을 봅니다.';
        return '같은 덧셈을 큰 코어 몇 개인 CPU와 단순한 코어가 많은 GPU가 처리하는 방식을 비교합니다.';
    }
    var GP_FEW  = 3;
    var GP_CAVE = '예: 원소 ' + GP_FEW + '개뿐이면 GPU 코어 ' + (GPU_CORES - GP_FEW) + '개는 놀고 ' + GP_FEW + '개만 일합니다';
    var GP_SUMM = 'CPU는 지연, GPU는 처리량에 맞춘 설계입니다';
    var GP_CONC = '원소 ' + ELEMS + '개 덧셈 (개념도)';

    /* ===================== 드로우 헬퍼 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function gpAl(v) { var n = Math.round(clamp01(v) * 255).toString(16); return n.length < 2 ? '0' + n : n; }
    function gpTextBlock(arr, x, y, lh, sz, color, align, bold) {
        arr.forEach(function (str, j) { tx(str, x, y + j * lh + lh / 2, sz, color, align, bold); });
    }
    function gpBar(x, y, bw, lh, fs, label, frac, col) {
        tx(label, x, y + lh / 2, fs, P.sub + 'ff', 'left', false);
        rr(x, y + lh + 2, bw, 8, 4, P.muted + '22', P.muted + '33', 1);
        rr(x, y + lh + 2, bw * clamp01(frac), 8, 4, col + 'cc', 'none');
    }
    function gpTl(st) {
        if (!st.passes || st.ph === 'none' || st.ph === 'split') return [];
        if (st.ph === 'all') return ['all'];
        if (st.passes === 2) return ['A', 'B'];
        return [st.ph];
    }
    function gpLaneSt(st, i) {
        var isA = PRED[i] === 'A';
        if (st.ph === 'none') return { col: P.muted, lvl: 0 };
        if (st.ph === 'all') return { col: P.teal, lvl: 1 };
        var col = isA ? P.purple : P.orange;
        if (st.ph === 'split') return { col: col, lvl: 1 };
        var on = st.ph === 'A' ? isA : !isA;
        return { col: col, lvl: on ? 1 : 0.28 };
    }
    function gpLaneTxt(st, i) {
        if (st.ph === 'split') return PRED[i];
        if (gpLaneSt(st, i).lvl === 1 && st.ph !== 'none') return '▶';
        return '';
    }
    function gpWarpCell(x, y, cw, chh, st, a, fs, txt) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        if (st.lvl <= 0) {
            rr(x, y, cw, chh, 4, P.muted + '10', P.muted + '44', 1);
        } else {
            rr(x, y, cw, chh, 4, st.col + gpAl(0.19 * st.lvl), st.col + gpAl(0.8 * st.lvl), st.lvl >= 1 ? 1.6 : 1);
            if (txt) tx(txt, x + cw / 2, y + chh / 2, fs, st.col + 'ee', 'center', true);
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 레이아웃 ===================== */
    function gpCgLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 4;
        var gap = mob ? 14 : 30;
        var pw = (w - gap) / 2;
        var hdrN = Math.max(lines('CPU — 큰 코어 ' + CPU_CORES + '개', pw, fs).length, lines('GPU — 단순한 코어 ' + GPU_CORES + '개', pw, fs).length);
        var gridY = hdrN * lh + 8;
        var gridH = mob ? 120 : 150;
        var stY = gridY + gridH + 14;
        var stN = Math.max(lines('한 번에 ' + CPU_CORES + '개 → ' + CPU_ROUNDS + '번', pw, fs + 1).length, lines('한 번에 ' + GPU_CORES + '개 → ' + GPU_ROUNDS + '번', pw, fs + 1).length);
        var barY = stY + stN * lh + 8;
        var capY = barY + lh + 22;
        var capN = Math.max(lines(GP_CAVE, w, fs).length, lines(GP_SUMM, w, fs).length, lines(GP_CONC, w, fs).length);
        return { fs: fs, lh: lh, gap: gap, pw: pw, gridY: gridY, gridH: gridH, stY: stY, barY: barY, capY: capY, total: capY + capN * lh + 4 };
    }
    function gpWarpLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 4;
        var cols = mob ? 8 : 16;
        var rows = LANES / cols;
        var gap = 4;
        var cw = Math.min(40, (w - gap * (cols - 1)) / cols);
        var chh = mob ? 30 : 34;
        var gridY = lh + 12;
        var gridH = rows * (chh + gap) - gap;
        var capY = gridY + gridH + 14;
        var capN = lines('경로 A: ' + CNT_A + '개 · 경로 B: ' + CNT_B + '개', w, fs).length;
        var cntY = capY + capN * lh + 10;
        var cntN = lines('실행 횟수: 2번 (분기 때문에 2배)', w, fs + 2).length;
        var tlY = cntY + cntN * lh + 8;
        var tlH = mob ? 22 : 26;
        return { fs: fs, lh: lh, cols: cols, cw: cw, gap: gap, chh: chh, gridY: gridY, capY: capY, cntY: cntY, tlY: tlY, tlH: tlH, total: tlY + tlH + 4 };
    }
    function gpLatLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 4;
        var labelW = mob ? 40 : 50;
        var rh = mob ? 26 : 30;
        var hdrN = lines('가로: 사이클 0~' + (T_MAX - 1) + ' · C 계산 · M 메모리 대기', w, fs).length;
        var rowsY = hdrN * lh + 10;
        var rowsH = 4 * (rh + 6) - 6;
        var uy = rowsY + rowsH + 14;
        var uN = lines('계산 유닛 활용률: 100%', w, fs + 2).length;
        var barY = uy + uN * lh + 6;
        return { fs: fs, lh: lh, labelW: labelW, rh: rh, rowsY: rowsY, uy: uy, barY: barY, total: barY + 12 };
    }
    function layout(w, mob) {
        if (mode === 'warp') return gpWarpLayout(w, mob);
        if (mode === 'latency') return gpLatLayout(w, mob);
        return gpCgLayout(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 모드: CPU vs GPU ===================== */
    function gpDrawCg(x0, top, w, mob, s, p, e) {
        var L = gpCgLayout(w, mob);
        var fs = L.fs;
        var lh = L.lh;
        var pw = L.pw;
        var x1 = x0 + pw + L.gap;
        var fresh = s !== p;
        var k = fresh ? ez(e) : 1;
        var cIdx = CG_STEPS.indexOf(s);
        var cFrac = !s.c ? 0 : (p.c ? 1 : Math.floor(e * CPU_ROUNDS) / CPU_ROUNDS);
        var flash = (s.c && !p.c && e < 1) ? 1 - ((e * CPU_ROUNDS) % 1) : 0;
        var gFrom = p.g ? (CG_STEPS.indexOf(p) === 3 ? GP_FEW : GPU_CORES) : 0;
        var gTgt = s.g ? (cIdx === 3 ? GP_FEW : GPU_CORES) : 0;
        var gN = fresh ? Math.round(lerp(gFrom, gTgt, k)) : gTgt;

        gpTextBlock(lines('CPU — 큰 코어 ' + CPU_CORES + '개', pw, fs), x0, top, lh, fs, s.c ? P.orange + 'ee' : P.sub + 'ff', 'left', true);
        gpTextBlock(lines('GPU — 단순한 코어 ' + GPU_CORES + '개', pw, fs), x1, top, lh, fs, s.g ? P.teal + 'ee' : P.sub + 'ff', 'left', true);

        var gcC = 8;
        var ccw = (pw - gcC) / 2;
        var cch = (L.gridH - gcC) / 2;
        for (var i = 0; i < CPU_CORES; i++) {
            var cx = x0 + (i % 2) * (ccw + gcC);
            var cy = top + L.gridY + Math.floor(i / 2) * (cch + gcC);
            var on = cFrac > 0 || flash > 0;
            rr(cx, cy, ccw, cch, 6, on ? P.orange + gpAl(0.19 + flash * 0.3) : P.muted + '14', on ? P.orange + gpAl(0.8 + flash * 0.2) : P.muted + '55', 1.2);
        }

        var gcols = mob ? 8 : 16;
        var grows = GPU_CORES / gcols;
        var gg = 3;
        var gw = (pw - gg * (gcols - 1)) / gcols;
        var gh = (L.gridH - gg * (grows - 1)) / grows;
        for (var j = 0; j < GPU_CORES; j++) {
            var qx = x1 + (j % gcols) * (gw + gg);
            var qy = top + L.gridY + Math.floor(j / gcols) * (gh + gg);
            var lit = j < gN;
            rr(qx, qy, gw, gh, 2, lit ? P.teal + '30' : P.muted + '14', lit ? P.teal + 'cc' : P.muted + '55', 1);
        }

        if (s.c) {
            ctx.globalAlpha = (!p.c) ? k : 1;
            gpTextBlock(lines('한 번에 ' + CPU_CORES + '개 → ' + CPU_ROUNDS + '번', pw, fs + 1), x0, top + L.stY, lh, fs + 1, P.orange + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }
        if (s.g) {
            ctx.globalAlpha = (!p.g) ? k : 1;
            gpTextBlock(lines('한 번에 ' + GPU_CORES + '개 → ' + GPU_ROUNDS + '번', pw, fs + 1), x1, top + L.stY, lh, fs + 1, P.teal + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }

        gpBar(x0, top + L.barY, pw, lh, fs, '처리 ' + Math.round(cFrac * ELEMS) + '/' + ELEMS, cFrac, P.orange);
        gpBar(x1, top + L.barY, pw, lh, fs, '활성 코어 ' + gN + '/' + GPU_CORES, gN / GPU_CORES, P.teal);

        var capTxt = null;
        var capCol = P.sub + 'ff';
        var capBold = false;
        var capA = 1;
        if (cIdx === 3) { capTxt = GP_CAVE; capCol = P.yellow + 'ff'; capA = k; }
        else if (cIdx === 4) { capTxt = GP_SUMM; capCol = P.text + 'ff'; capBold = true; capA = k; }
        else if (s.g) { capTxt = GP_CONC; capA = (!p.g) ? k : 1; }
        if (capTxt) {
            ctx.globalAlpha = fresh ? capA : 1;
            gpTextBlock(lines(capTxt, w, fs), x0 + w / 2, top + L.capY, lh, fs, capCol, 'center', capBold);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 워프와 분기 ===================== */
    function gpDrawWarp(x0, top, w, mob, s, p, e) {
        var L = gpWarpLayout(w, mob);
        var fs = L.fs;
        var lh = L.lh;
        var fresh = s.ph !== p.ph || s.passes !== p.passes;
        var k = fresh ? ez(e) : 1;

        tx('워프 1개 = 스레드 ' + LANES, x0, top + lh / 2, fs + 1, P.text + 'ee', 'left', true);
        for (var i = 0; i < LANES; i++) {
            var cx = x0 + (i % L.cols) * (L.cw + L.gap);
            var cy = top + L.gridY + Math.floor(i / L.cols) * (L.chh + L.gap);
            var ki = fresh ? ez(clamp01((e - (i / LANES) * 0.5) / 0.5)) : 1;
            gpWarpCell(cx, cy, L.cw, L.chh, gpLaneSt(p, i), 1 - ki, fs, gpLaneTxt(p, i));
            gpWarpCell(cx, cy, L.cw, L.chh, gpLaneSt(s, i), ki, fs, gpLaneTxt(s, i));
        }

        if (s.ph === 'split' || s.ph === 'A' || s.ph === 'B') {
            var capK = (p.ph === 'split' || p.ph === 'A' || p.ph === 'B') ? 1 : k;
            ctx.globalAlpha = capK;
            gpTextBlock(lines('경로 A: ' + CNT_A + '개 · 경로 B: ' + CNT_B + '개', w, fs), x0, top + L.capY, lh, fs, P.sub + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }

        if (s.passes) {
            ctx.globalAlpha = p.passes ? 1 : k;
            gpTextBlock(lines('실행 횟수: ' + s.passes + '번' + (s.passes === 2 ? ' (분기 때문에 2배)' : ''), w, fs + 2), x0, top + L.cntY, lh, fs + 2, s.passes === 2 ? P.orange + 'ee' : P.green + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }

        var tl = gpTl(s);
        var tp = gpTl(p);
        var n = tl.length;
        for (var j = 0; j < n; j++) {
            var lb = tl[j];
            var col = lb === 'all' ? P.teal : (lb === 'A' ? P.purple : P.orange);
            var sw = (w - 6 * (n - 1)) / n;
            var sx = x0 + j * (sw + 6);
            var grow = tp.indexOf(lb) >= 0 ? 1 : k;
            rr(sx, top + L.tlY, sw, L.tlH, 5, P.muted + '18', P.muted + '55', 1);
            rr(sx, top + L.tlY, sw * grow, L.tlH, 5, col + '55', col + 'cc', 1.2);
            tx(lb === 'all' ? '전체 실행' : (lb === 'A' ? '경로 A 실행' : '경로 B 실행'), sx + sw / 2, top + L.tlY + L.tlH / 2, fs, col + 'ff', 'center', true);
        }
    }

    /* ===================== 모드: 지연 숨기기 ===================== */
    function gpDrawLat(x0, top, w, mob, s, p, e) {
        var L = gpLatLayout(w, mob);
        var fs = L.fs;
        var lh = L.lh;
        var fresh = s.w !== p.w;
        var k = fresh ? ez(e) : 1;
        var cwT = (w - L.labelW) / T_MAX;

        gpTextBlock(lines('가로: 사이클 0~' + (T_MAX - 1) + ' · C 계산 · M 메모리 대기', w, fs), x0, top, lh, fs, P.sub + 'ff', 'left', false);
        if (!s.w) return;

        var sim = SIMS[s.w];
        var nP = p.w;
        var rowsTop = top + L.rowsY;
        for (var i = 0; i < s.w; i++) {
            var y = rowsTop + i * (L.rh + 6);
            var newRow = fresh && i >= nP;
            tx('워프 ' + i, x0, y + L.rh / 2, fs, P.text + 'dd', 'left', true);
            for (var q = 0; q < T_MAX; q++) {
                var g = sim.grid[i][q];
                var a = newRow ? clamp01(e * (T_MAX + 1) - q) : 1;
                if (a <= 0) continue;
                var col = g === 'C' ? P.teal : (g === 'M' ? P.orange : P.muted);
                ctx.globalAlpha = a;
                rr(x0 + L.labelW + q * cwT, y, cwT - 1, L.rh, 2, col + (g === 'R' ? '18' : '38'), col + (g === 'R' ? '44' : 'aa'), 1);
            }
            ctx.globalAlpha = 1;
        }
        if (fresh && s.w > nP && e < 1) {
            var px = x0 + L.labelW + e * T_MAX * cwT;
            ln(px, rowsTop - 3, px, rowsTop + s.w * (L.rh + 6) - 3, P.text + '88', 1, [3, 3]);
        }

        var uPrev = nP ? SIMS[nP].util : 0;
        var uVal = lerp(uPrev, sim.util, k);
        var uCol = sim.util === 100 ? P.green : P.orange;
        gpTextBlock(lines('계산 유닛 활용률: ' + Math.round(uVal) + '%', w, fs + 2), x0, top + L.uy, lh, fs + 2, uCol + 'ee', 'left', true);
        rr(x0, top + L.barY, w, 8, 4, P.muted + '22', P.muted + '33', 1);
        rr(x0, top + L.barY, w * clamp01(uVal / 100), 8, 4, uCol + 'cc', 'none');
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var e = clamp01(t);
        if (mode === 'warp') gpDrawWarp(x0, top, w, mob, s, p, e);
        else if (mode === 'latency') gpDrawLat(x0, top, w, mob, s, p, e);
        else gpDrawCg(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('gpu-viz__speed-btn--active'); });
        btn.classList.add('gpu-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('gpu-viz__mode-btn--active', d.key === m); });
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