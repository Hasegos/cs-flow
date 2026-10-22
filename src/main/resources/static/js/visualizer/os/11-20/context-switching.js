/**
 * 컨텍스트 스위칭 시각화
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
    var root    = el('div', 'ctx-viz');
    var toolbar = el('div', 'ctx-viz__toolbar');
    var tbLeft  = el('div', 'ctx-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ctx-viz__title', 'CONTEXT SWITCH'));

    var modeWrap = el('div', 'ctx-viz__mode');
    var modeDefs = [
        { key: 'state', label: '저장과 복원' },
        { key: 'cost', label: '전환 비용' },
        { key: 'thread', label: '프로세스 vs 스레드' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ctx-viz__mode-btn' + (i === 0 ? ' ctx-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ctx-viz__speed');
    speedWrap.appendChild(el('span', 'ctx-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ctx-viz__speed-btn' + (i === 0 ? ' ctx-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ctx-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ctx-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ctx-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ctx-viz__controls');
    var btnPlay  = el('button', 'ctx-viz__btn ctx-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ctx-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ctx-viz__btn', '↺ RESET');
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
    var mode    = 'state';
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

    /* ===================== 데이터: 저장과 복원 ===================== */
    var REG_NAMES = ['PC', 'SP', 'R0'];
    var STATE_A = [0x4010, 0x7ff0, 5];
    var STATE_B = [0x8200, 0x6ff0, 9];
    function hx(n) { return '0x' + n.toString(16); }
    function fmtReg(i, v) { return i < 2 ? hx(v) : String(v); }

    var STATE_STEPS = [
        { cpu: STATE_A, a: null, b: STATE_B, run: 'A', log: '프로세스 A가 CPU에서 실행 중입니다. CPU 레지스터에 A의 실행 상태(PC ' + hx(STATE_A[0]) + ', SP ' + hx(STATE_A[1]) + ', R0 ' + STATE_A[2] + ')가 들어 있습니다. B는 이전에 멈춘 상태가 PCB에 저장돼 있습니다(값은 예시).' },
        { cpu: STATE_A, a: null, b: STATE_B, run: 'switch', log: '타이머 인터럽트 — 할당된 시간이 끝났거나 A가 입출력을 기다리게 되면 커널이 개입해 다른 프로세스로 바꿀 준비를 합니다.' },
        { cpu: STATE_A, a: STATE_A, b: STATE_B, run: 'switch', log: '저장 — 커널이 CPU 레지스터의 현재 값을 A의 PCB에 저장합니다. 나중에 PC ' + hx(STATE_A[0]) + '부터 이어서 실행할 수 있어야 하기 때문입니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'switch', log: '복원 — 다음에 실행할 B의 PCB에서 저장된 값을 꺼내 CPU 레지스터에 채웁니다. PC가 ' + hx(STATE_B[0]) + '로 바뀝니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'B', log: 'B가 멈췄던 지점(PC ' + hx(STATE_B[0]) + ')부터 이어서 실행합니다. 이 과정이 컨텍스트 스위칭이며, A도 나중에 PCB의 값으로 같은 방식으로 이어집니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'B', log: '정리 — 컨텍스트 스위칭은 실행 중이던 작업의 상태를 PCB(스레드는 보통 TCB)에 저장하고, 다음 작업의 상태를 복원하는 일입니다. 이 사이에는 사용자 작업이 실행되지 못합니다.' }
    ];

    /* ===================== 데이터: 전환 비용 ===================== */
    var SWITCH_T = 1;
    var WINDOW_T = 33;
    var SLICES = [2, 5, 10];
    function buildTimeline(q) {
        var segs = [];
        var t = 0;
        var useful = 0;
        while (t < WINDOW_T) {
            var run = Math.min(q, WINDOW_T - t);
            segs.push({ kind: 'run', len: run });
            useful += run;
            t += run;
            if (t >= WINDOW_T) break;
            var sw = Math.min(SWITCH_T, WINDOW_T - t);
            segs.push({ kind: 'sw', len: sw });
            t += sw;
        }
        return { q: q, segs: segs, useful: useful };
    }
    var TIMELINES = SLICES.map(buildTimeline);
    function usefulPct(tl) { return Math.round(tl.useful / WINDOW_T * 1000) / 10; }

    var COST_STEPS = [
        { n: 0, log: '시간 ' + WINDOW_T + ' 동안의 CPU를 봅니다. 전환 한 번에 ' + SWITCH_T + '만큼의 시간이 들고 그동안은 사용자 작업이 실행되지 않는다고 가정합니다(설명용 값).' },
        { n: 1, log: '시간 조각 ' + SLICES[0] + ' — 전환이 자주 일어나 사용자 작업을 한 시간이 ' + TIMELINES[0].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[0]) + '%)입니다.' },
        { n: 2, log: '시간 조각 ' + SLICES[1] + ' — 전환 횟수가 줄어 사용자 작업 시간이 ' + TIMELINES[1].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[1]) + '%)입니다.' },
        { n: 3, log: '시간 조각 ' + SLICES[2] + ' — 전환이 드물어 사용자 작업 시간이 ' + TIMELINES[2].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[2]) + '%)입니다.' },
        { n: 3, log: '정리 — 시간 조각이 짧을수록 응답은 빨라지지만 전환 비용의 비율이 커집니다. 길수록 비용은 줄지만 다른 작업이 기다리는 시간이 늘어납니다.' }
    ];

    /* ===================== 데이터: 프로세스 vs 스레드 ===================== */
    var ITEMS = [
        { name: '실행 상태(레지스터, PC) 저장·복원', proc: true, thr: true },
        { name: '커널이 개입해 CPU를 넘김', proc: true, thr: true },
        { name: '주소 공간(페이지 테이블) 전환', proc: true, thr: false },
        { name: 'TLB 내용 무효화 또는 구분 필요', proc: true, thr: false }
    ];
    var PROC_COUNT = ITEMS.filter(function (it) { return it.proc; }).length;
    var THR_COUNT  = ITEMS.filter(function (it) { return it.thr; }).length;

    var THREAD_STEPS = [
        { k: 0, log: '컨텍스트 스위칭이 해야 하는 일을 항목별로 봅니다. 서로 다른 프로세스 사이의 전환과 같은 프로세스 안의 스레드 사이 전환을 비교합니다.' },
        { k: 1, log: '실행 상태 저장·복원 — 두 경우 모두 현재 실행 상태를 저장하고 다음 실행 상태를 복원해야 합니다.' },
        { k: 2, log: '커널 개입 — 두 경우 모두 운영체제가 개입해 CPU를 넘깁니다.' },
        { k: 3, log: '주소 공간 전환 — 다른 프로세스로 바꾸면 페이지 테이블을 바꿔야 합니다. 같은 프로세스의 스레드는 주소 공간을 공유해 필요 없습니다.' },
        { k: 4, log: 'TLB — 주소 공간이 바뀌면 이전 주소 변환 결과가 맞지 않으므로 TLB를 비우거나 주소 공간 식별자로 구분해야 합니다. 스레드 전환에는 이 일이 없습니다.' },
        { k: 4, log: '정리 — 해야 할 일이 프로세스 전환은 ' + PROC_COUNT + '개, 같은 프로세스 안의 스레드 전환은 ' + THR_COUNT + '개라서 스레드 전환이 보통 더 가볍습니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'thread') return THREAD_STEPS;
        return STATE_STEPS;
    }
    function defaultLog() {
        if (mode === 'cost') return '시간 조각 길이에 따라 전환 비용이 차지하는 비율이 달라지는 모습을 봅니다.';
        if (mode === 'thread') return '프로세스 전환과 스레드 전환이 해야 하는 일을 비교합니다.';
        return 'CPU 레지스터의 값이 PCB로 저장되고 다른 PCB에서 복원되는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'cost' ? (mob ? 270 : 270) : (mode === 'thread' ? (mob ? 278 : 246) : 220);
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 저장과 복원 ===================== */
    function stageOf(st) {
        if (st.run === 'A') return 0;
        if (st.run === 'B') return 4;
        if (!st.a) return 1;
        return st.cpu === STATE_A ? 2 : 3;
    }

    function drawState(x0, top, w, mob, s, p, e, fs) {
        var q = ez(e);
        var gap = mob ? 8 : 44;
        var cw = Math.min(200, (w - 2 * gap) / 3);
        var sx = x0 + (w - (3 * cw + 2 * gap)) / 2;
        var cx = [sx, sx + cw + gap, sx + 2 * (cw + gap)];
        var by = top + 28, rowH = 26, bh = 34 + 3 * rowH;
        var runCol = s.run === 'A' ? P.orange : (s.run === 'B' ? P.teal : P.red);
        var saving = !!s.a && !p.a;
        var restoring = s.cpu !== p.cpu;
        var cols = [P.orange, runCol, P.teal];
        var titles = ['PCB A', 'CPU 레지스터', 'PCB B'];
        var qi = function (i) { return ez((e - i * 0.14) / 0.6); };

        if (s.run === 'switch' && !s.a) {
            ctx.globalAlpha = clamp01(e * 2);
            tx('타이머 인터럽트', cx[1] + cw / 2, by - 10, fs - 0.5, P.red + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            if (e < 1) {
                ctx.globalAlpha = 1 - e;
                circ(cx[1] + cw / 2, by + bh / 2, 14 + e * 56, 'none', P.red + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }

        for (var c = 0; c < 3; c++) {
            var glow = c === 1 && e < 1 && (saving || restoring);
            rr(cx[c], by, cw, bh, 6, cols[c] + (c === 1 ? '1c' : '14'), cols[c] + 'ff', glow ? 2.8 : 1.6);
            tx(titles[c], cx[c] + cw / 2, by + 16, fs, cols[c] + 'ff', 'center', true);
            for (var i = 0; i < 3; i++) {
                var ry = by + 30 + i * rowH;
                var val = '—';
                var flash = false;
                if (c === 0) {
                    if (s.a) {
                        if (saving && qi(i) < 1) val = '—';
                        else { val = fmtReg(i, s.a[i]); flash = saving && e < 1; }
                    }
                } else if (c === 1) {
                    if (restoring && qi(i) < 1) val = fmtReg(i, p.cpu[i]);
                    else { val = fmtReg(i, s.cpu[i]); flash = restoring && e < 1; }
                } else {
                    val = fmtReg(i, s.b[i]);
                }
                rr(cx[c] + 4, ry + 2, cw - 8, rowH - 4, 4, flash ? P.yellow + '40' : 'none', flash ? P.yellow + 'ff' : P.sub + '55', 1.2);
                tx(REG_NAMES[i], cx[c] + 9, ry + rowH / 2, fs - 0.5, P.sub + 'ff', 'left', true);
                tx(val, cx[c] + cw - 9, ry + rowH / 2, fs, val === '—' ? P.sub + 'ff' : P.text + 'ff', 'right', true);
            }
        }

        for (var j = 0; j < 3; j++) {
            if (!saving && !restoring) break;
            var qj = qi(j);
            if (qj <= 0 || qj >= 1) continue;
            var fromC = saving ? cx[1] : cx[2];
            var toC = saving ? cx[0] : cx[1];
            var chipCol = saving ? P.orange : P.teal;
            var chipTxt = saving ? fmtReg(j, s.a[j]) : fmtReg(j, s.cpu[j]);
            var mx = lerp(fromC + cw / 2, toC + cw / 2, qj);
            var my = by + 30 + j * rowH + rowH / 2 - Math.sin(qj * Math.PI) * 10;
            var chipW = Math.min(64, cw - 20);
            rr(mx - chipW / 2, my - 10, chipW, 20, 5, chipCol + '99', chipCol + 'ff', 1.8);
            tx(chipTxt, mx, my, fs - 0.5, P.text + 'ff', 'center', true);
        }

        var sy = by + bh + 16;
        var ws = [w * 0.36 - 4, w * 0.28 - 4, w * 0.36 - 4];
        var xs = [x0, x0 + w * 0.36, x0 + w * 0.64];
        var stage = stageOf(s), pstage = stageOf(p);
        var fillSw = lerp(Math.min(pstage, 3) / 3, Math.min(stage, 3) / 3, q);
        var fillB = stage === 4 ? (pstage === 4 ? 1 : q) : 0;
        var fills = [1, stage >= 4 ? 1 : fillSw, fillB];
        var labels = ['A 실행', '전환', 'B 실행'];
        var bcols = [P.orange, P.red, P.teal];
        var active = stage === 0 ? 0 : (stage === 4 ? 2 : 1);
        for (var b = 0; b < 3; b++) {
            rr(xs[b], sy, ws[b], 24, 4, 'none', bcols[b] + '66', 1.2);
            if (fills[b] > 0) rr(xs[b], sy, ws[b] * fills[b], 24, 4, bcols[b] + '44', bcols[b] + 'ff', b === active ? 2 : 1.2);
            tx(labels[b], xs[b] + ws[b] / 2, sy + 12, fs - 0.5, fills[b] > 0 ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        }
        var cap = s.run === 'switch' ? '전환 중 — 사용자 작업이 실행되지 못함' : (s.run === 'A' ? 'A가 CPU를 사용 중' : 'B가 CPU를 사용 중');
        var capCol = s.run === 'switch' ? P.red : runCol;
        tx(cap, x0 + w / 2, sy + 40, fs, capCol + 'ff', 'center', true);
    }

    /* ===================== 전환 비용 ===================== */
    function drawCost(x0, top, w, mob, s, p, e, fs) {
        var n = s.n, pn = p.n;
        var unit = w / WINDOW_T;
        var rowY0 = top + 34, pitch = 64, bh = 26;
        rr(x0, top + 4, 12, 12, 2, P.teal + '66', P.teal + 'ff', 1.2);
        tx('사용자 작업', x0 + 18, top + 10, fs - 0.5, P.sub + 'ff', 'left', true);
        var lx = x0 + (mob ? 100 : 120);
        rr(lx, top + 4, 12, 12, 2, P.red + '66', P.red + 'ff', 1.2);
        tx('전환 (실행 못함)', lx + 18, top + 10, fs - 0.5, P.sub + 'ff', 'left', true);

        TIMELINES.forEach(function (tl, i) {
            var y = rowY0 + i * pitch;
            var on = n >= i + 1;
            var fresh = on && pn < i + 1;
            var g = on ? (fresh ? ez(e) : 1) : 0;
            tx('시간 조각 ' + tl.q, x0, y, fs, on ? P.text + 'ff' : P.sub + 'ff', 'left', true);
            rr(x0, y + 12, w, bh, 3, 'none', P.sub + '55', 1);
            var shown = g * WINDOW_T, start = 0, useful = 0, swTotal = 0;
            tl.segs.forEach(function (sg) {
                var vis = Math.min(sg.len, shown - start);
                if (sg.kind === 'sw') swTotal++;
                if (vis > 0) {
                    var col = sg.kind === 'run' ? P.teal : P.red;
                    rr(x0 + start * unit + 0.5, y + 12, vis * unit - 1, bh, 2, col + (sg.kind === 'run' ? '44' : '88'), col + 'ff', 1);
                    if (sg.kind === 'run') useful += vis;
                }
                start += sg.len;
            });
            if (fresh && e < 1) {
                var cxp = x0 + g * w;
                ln(cxp, y + 8, cxp, y + 12 + bh + 4, P.yellow + 'ff', 2);
            }
            if (on) {
                tx(Math.round(useful) + '/' + WINDOW_T + ' · ' + (useful / WINDOW_T * 100).toFixed(1) + '%', x0 + w, y, fs - 0.5, P.teal + 'ff', 'right', true);
                if (g > 0.98) tx('전환 ' + swTotal + '회', x0, y + 12 + bh + 12, fs - 0.5, P.red + 'ff', 'left', true);
            }
        });

        var steps = currentSteps();
        if (steps.indexOf(s) === steps.length - 1) {
            ctx.globalAlpha = p === s ? 1 : ez(e);
            var ty = rowY0 + 3 * pitch + 6;
            tx('조각 짧음: 응답 빠름 · 전환 비용 큼', x0, ty, fs - 0.5, P.orange + 'ff', 'left', true);
            tx('조각 김: 비용 작음 · 대기 길어짐', x0, ty + 18, fs - 0.5, P.teal + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 프로세스 vs 스레드 ===================== */
    function drawThread(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k, q = ez(e);
        var lw = mob ? 142 : Math.min(300, w * 0.42);
        var cw = (w - lw - 8) / 2;
        var rowH = mob ? 46 : 38, pitch = rowH + 6;
        var y0 = top + 30;
        var cx = [x0 + lw + 4, x0 + lw + 4 + cw];
        var ccol = [P.orange, P.teal];
        var steps = currentSteps();
        var isLast = steps.indexOf(s) === steps.length - 1;
        tx('전환할 때 하는 일', x0, top + 12, fs - 0.5, P.sub + 'ff', 'left', true);
        tx('프로세스', cx[0] + (cw - 4) / 2, top + 12, fs - 0.5, ccol[0] + 'ff', 'center', true);
        tx('스레드', cx[1] + (cw - 4) / 2, top + 12, fs - 0.5, ccol[1] + 'ff', 'center', true);

        ITEMS.forEach(function (it, j) {
            var y = y0 + j * pitch;
            var on = k > j;
            var fresh = k === j + 1 && pk < j + 1;
            var cur = k === j + 1 && !isLast;
            rr(x0, y, w, rowH, 4, 'none', cur ? P.yellow + 'ff' : P.sub + '33', cur ? 1.6 : 1);
            ctx.globalAlpha = on ? (fresh ? clamp01(e * 3) : 1) : 0.3;
            var ls = lines(it.name, lw - 12, fs - 0.5);
            var lh = fs + 2;
            ls.forEach(function (l, li) {
                tx(l, x0 + 6, y + rowH / 2 + (li - (ls.length - 1) / 2) * lh, fs - 0.5, P.text + 'ff', 'left', true);
            });
            ctx.globalAlpha = 1;
            [it.proc, it.thr].forEach(function (need, ci) {
                var col = ccol[ci];
                var cwid = cw - 4, chei = rowH - 8;
                var mx = cx[ci] + cwid / 2, my = y + rowH / 2;
                if (!on) {
                    ctx.globalAlpha = 0.3;
                    rr(cx[ci], y + 4, cwid, chei, 4, 'none', P.sub + '66', 1.2);
                    ctx.globalAlpha = 1;
                    return;
                }
                var sp = fresh ? 0.6 + 0.4 * ez((e - 0.1 - ci * 0.15) / 0.5) : 1;
                var sa = fresh ? clamp01((e - ci * 0.15) / 0.4) : 1;
                ctx.globalAlpha = sa;
                var rw = cwid * sp, rh2 = chei * sp;
                if (need) {
                    rr(mx - rw / 2, my - rh2 / 2, rw, rh2, 4, col + '33', col + 'ff', 1.6);
                    ln(mx - 7 * sp, my, mx - 2 * sp, my + 6 * sp, col + 'ff', 3);
                    ln(mx - 2 * sp, my + 6 * sp, mx + 8 * sp, my - 6 * sp, col + 'ff', 3);
                } else {
                    rr(mx - rw / 2, my - rh2 / 2, rw, rh2, 4, 'none', P.sub + '88', 1.2);
                    tx('없음', mx, my, fs - 0.5, P.sub + 'ff', 'center', true);
                }
                ctx.globalAlpha = 1;
            });
        });

        var cnt = function (kk, key) {
            var c = 0;
            for (var i = 0; i < Math.min(kk, ITEMS.length); i++) if (ITEMS[i][key]) c++;
            return c;
        };
        var sy = y0 + ITEMS.length * pitch + 6;
        tx('할 일 개수', x0, sy + 12, fs - 0.5, P.sub + 'ff', 'left', true);
        ['proc', 'thr'].forEach(function (key, ci) {
            var v = lerp(cnt(pk, key), cnt(k, key), q);
            var bw = cw - 4;
            rr(cx[ci], sy, bw, 24, 4, 'none', P.sub + '55', 1);
            if (v > 0) rr(cx[ci], sy, bw * v / ITEMS.length, 24, 4, ccol[ci] + '44', ccol[ci] + 'ff', 1.6);
            tx(Math.round(v * 10) / 10 + '개', cx[ci] + bw / 2, sy + 12, fs - 0.5, P.text + 'ff', 'center', true);
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'cost') drawCost(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'thread') drawThread(x0, top, w, mob, s, p, e, L.fs);
        else drawState(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('ctx-viz__speed-btn--active'); });
        btn.classList.add('ctx-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ctx-viz__mode-btn--active', d.key === m); });
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