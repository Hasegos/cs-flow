/**
 * 실시간 스케줄링(RM/EDF) 시각화
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
    var root    = el('div', 'rt-viz');
    var toolbar = el('div', 'rt-viz__toolbar');
    var tbLeft  = el('div', 'rt-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'rt-viz__title', 'REALTIME'));

    var modeWrap = el('div', 'rt-viz__mode');
    var modeDefs = [
        { key: 'rm', label: 'RM' },
        { key: 'edf', label: 'EDF' },
        { key: 'bound', label: '이용률 한계' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'rt-viz__mode-btn' + (i === 0 ? ' rt-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'rt-viz__speed');
    speedWrap.appendChild(el('span', 'rt-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'rt-viz__speed-btn' + (i === 0 ? ' rt-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'rt-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'rt-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'rt-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'rt-viz__controls');
    var btnPlay  = el('button', 'rt-viz__btn rt-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'rt-viz__btn', '▶| STEP');
    var btnReset = el('button', 'rt-viz__btn', '↺ RESET');
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
    var mode    = 'rm';
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

    /* ===================== 데이터: 작업 집합과 시뮬레이션 ===================== */
    var TASKS = [
        { id: 'T1', C: 2, P: 5 },
        { id: 'T2', C: 4, P: 7 }
    ];
    var HORIZON = 14;
    var UTIL = TASKS.reduce(function (a, t) { return a + t.C / t.P; }, 0);
    var RM_BOUND = TASKS.length * (Math.pow(2, 1 / TASKS.length) - 1);
    var RM_LIMIT = Math.LN2;
    function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }

    function simulate(policy) {
        var jobs = [];
        TASKS.forEach(function (tk, ti) {
            for (var k = 0; k * tk.P < HORIZON; k++) {
                jobs.push({ ti: ti, n: k, rel: k * tk.P, dl: (k + 1) * tk.P, rem: tk.C, fin: -1 });
            }
        });
        var timeline = [];
        for (var t = 0; t < HORIZON; t++) {
            var best = null;
            var ready = {};
            jobs.forEach(function (j) {
                if (j.rem <= 0 || j.rel > t) return;
                ready[TASKS[j.ti].id] = true;
                if (best === null) { best = j; return; }
                var a = policy === 'rm' ? [TASKS[j.ti].P, j.rel] : [j.dl, j.ti];
                var b = policy === 'rm' ? [TASKS[best.ti].P, best.rel] : [best.dl, best.ti];
                if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) best = j;
            });
            var entry = { run: null, job: -1, late: false, ready: ready };
            if (best) {
                entry.run = TASKS[best.ti].id;
                entry.job = best.n;
                entry.late = t >= best.dl;
                best.rem--;
                if (best.rem === 0) best.fin = t + 1;
            }
            timeline.push(entry);
        }
        var misses = jobs.filter(function (j) {
            return j.fin >= 0 ? j.fin > j.dl : j.dl <= HORIZON;
        });
        return { timeline: timeline, misses: misses, jobs: jobs };
    }
    var SIM_RM = simulate('rm');
    var SIM_EDF = simulate('edf');

    function segsOf(sim, id, job) {
        var out = [];
        var cur = null;
        sim.timeline.forEach(function (e, t) {
            if (e.run === id && e.job === job) {
                if (cur && cur.to === t) cur.to = t + 1;
                else { cur = { from: t, to: t + 1 }; out.push(cur); }
            }
        });
        return out;
    }
    function jobOf(sim, id, n) {
        var r = null;
        sim.jobs.forEach(function (j) { if (TASKS[j.ti].id === id && j.n === n) r = j; });
        return r;
    }

    var RM_T1A = segsOf(SIM_RM, 'T1', 0)[0];
    var RM_T2A = segsOf(SIM_RM, 'T2', 0);
    var RM_T1B = segsOf(SIM_RM, 'T1', 1)[0];
    var EDF_T1A = segsOf(SIM_EDF, 'T1', 0)[0];
    var EDF_T2A = segsOf(SIM_EDF, 'T2', 0)[0];
    var EDF_T1B = segsOf(SIM_EDF, 'T1', 1)[0];
    var T2_FIRST_DL = jobOf(SIM_RM, 'T2', 0).dl;
    var T1_SECOND_REL = jobOf(SIM_RM, 'T1', 1).rel;
    var T1_SECOND_DL = jobOf(SIM_RM, 'T1', 1).dl;
    var T2_FIRST_FIN_EDF = jobOf(SIM_EDF, 'T2', 0).fin;
    var T2_DONE_RM = RM_T2A[0].to - RM_T2A[0].from;

    var RM_STEPS = [
        { up: -1, sim: SIM_RM, log: '주기 작업 두 개가 있습니다. T1은 실행 시간 ' + TASKS[0].C + '에 주기 ' + TASKS[0].P + ', T2는 실행 시간 ' + TASKS[1].C + '에 주기 ' + TASKS[1].P + '이고, 마감은 다음 주기가 시작될 때입니다. CPU 이용률은 ' + TASKS[0].C + '/' + TASKS[0].P + ' + ' + TASKS[1].C + '/' + TASKS[1].P + ' = ' + pct(UTIL) + '입니다(값은 예시).' },
        { up: RM_T1A.to - 1, sim: SIM_RM, log: 'RM은 주기가 짧을수록 높은 고정 우선순위를 줍니다. 주기 ' + TASKS[0].P + '인 T1이 주기 ' + TASKS[1].P + '인 T2보다 항상 높아, t=' + RM_T1A.from + '~' + RM_T1A.to + '에 T1이 먼저 실행합니다.' },
        { up: RM_T2A[0].to - 1, sim: SIM_RM, log: 'T1이 끝나면 T2가 t=' + RM_T2A[0].from + '~' + RM_T2A[0].to + '에 실행합니다(' + T2_DONE_RM + '단위).' },
        { up: RM_T1B.to - 1, sim: SIM_RM, log: 't=' + T1_SECOND_REL + '에 T1의 두 번째 작업이 도착합니다. T1은 우선순위가 더 높아 ' + (TASKS[1].C - T2_DONE_RM) + '단위가 남은 T2를 선점하고 t=' + RM_T1B.from + '~' + RM_T1B.to + '에 실행합니다.' },
        { up: RM_T2A[1].to - 1, sim: SIM_RM, log: 't=' + T2_FIRST_DL + '은 T2 첫 작업의 마감입니다. ' + TASKS[1].C + '단위 중 ' + T2_DONE_RM + '단위만 끝나 마감을 지키지 못했습니다. 이 작업은 t=' + RM_T2A[1].from + '~' + RM_T2A[1].to + '에 늦게 끝납니다(빨강).' },
        { up: HORIZON - 1, sim: SIM_RM, log: '정리 — 이용률 ' + pct(UTIL) + '는 RM의 보장 한계 ' + pct(RM_BOUND) + '(작업 ' + TASKS.length + '개)를 넘고, 이 작업 집합은 RM에서 마감 실패가 ' + SIM_RM.misses.length + '번 생겼습니다. 같은 작업을 EDF로 실행하면 어떨지 "EDF" 탭에서 확인하세요.' }
    ];

    var EDF_STEPS = [
        { up: -1, sim: SIM_EDF, log: '같은 작업 집합을 EDF로 실행합니다. EDF는 지금 가장 가까운 마감(deadline)을 가진 작업에 가장 높은 우선순위를 주고, 작업이 도착할 때마다 다시 정합니다(동적 우선순위).' },
        { up: EDF_T1A.to - 1, sim: SIM_EDF, log: 't=0에 마감은 T1이 ' + jobOf(SIM_EDF, 'T1', 0).dl + ', T2가 ' + jobOf(SIM_EDF, 'T2', 0).dl + '이라 T1이 먼저 t=' + EDF_T1A.from + '~' + EDF_T1A.to + '에 실행합니다.' },
        { up: T1_SECOND_REL - 1, sim: SIM_EDF, log: '이어서 T2가 t=' + EDF_T2A.from + '부터 실행합니다.' },
        { up: T1_SECOND_REL, sim: SIM_EDF, log: 't=' + T1_SECOND_REL + '에 T1의 두 번째 작업이 도착하지만 마감이 ' + T1_SECOND_DL + '입니다. T2의 마감 ' + T2_FIRST_DL + '이 더 가까워 EDF는 T2를 선점하지 않고 계속 실행합니다(RM과 다른 점).' },
        { up: EDF_T1B.to - 1, sim: SIM_EDF, log: 'T2 첫 작업은 t=' + T2_FIRST_FIN_EDF + '에 끝나 마감 ' + T2_FIRST_DL + '을 지켰습니다. 이어 T1이 t=' + EDF_T1B.from + '~' + EDF_T1B.to + '에 실행합니다.' },
        { up: HORIZON - 1, sim: SIM_EDF, log: '정리 — 같은 작업 집합이 EDF에서는 t=' + HORIZON + '까지 마감 실패 ' + SIM_EDF.misses.length + '번입니다. 마감이 임박한 작업을 먼저 실행해 이용률 ' + pct(UTIL) + '를 소화했습니다. 단일 프로세서에서 주기와 마감이 같으면 이용률 100% 이하가 EDF의 조건입니다.' }
    ];

    var BOUND_STEPS = [
        { k: 0, log: '스케줄 가능성을 CPU 이용률 U(작업별 실행 시간 ÷ 주기의 합)로 판단합니다. 알고리즘마다 마감을 보장하는 이용률 한계가 다릅니다.' },
        { k: 1, log: '이 작업 집합의 이용률은 ' + pct(UTIL) + '입니다.' },
        { k: 2, log: 'RM은 작업 ' + TASKS.length + '개일 때 이용률이 n(2^(1/n) − 1) = ' + pct(RM_BOUND) + ' 이하면 마감을 보장합니다. ' + pct(UTIL) + '는 이를 넘어 보장이 없고, 실제로 앞의 RM 실행에서 마감 실패가 생겼습니다.' },
        { k: 3, log: 'EDF는 주기와 마감이 같은 작업 집합에서 이용률이 100% 이하면 마감을 모두 지킬 수 있습니다. ' + pct(UTIL) + '는 100% 이하라 가능하고, 앞의 EDF 실행에서 실패가 없었습니다.' },
        { k: 4, log: '정리 — RM의 한계는 충분 조건이라 넘는다고 항상 실패하지는 않지만 보장은 없습니다. 작업 수가 늘면 한계는 ln 2 = ' + pct(RM_LIMIT) + '로 줄어듭니다. 대신 RM은 우선순위가 고정이라 구현이 단순합니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'edf') return EDF_STEPS;
        if (mode === 'bound') return BOUND_STEPS;
        return RM_STEPS;
    }
    function defaultLog() {
        if (mode === 'edf') return '같은 작업 집합을 마감이 가까운 순서(EDF)로 실행하는 모습을 봅니다.';
        if (mode === 'bound') return 'CPU 이용률과 알고리즘별 보장 한계를 비교합니다.';
        return '주기가 짧은 작업에 높은 고정 우선순위를 주는 RM 실행을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'bound' ? (mob ? 224 : 214) : (mob ? 244 : 256);
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function head(x, y, down, col) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + (down ? -7 : 7));
        ctx.lineTo(x + 4, y + (down ? -7 : 7));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 간트 차트 ===================== */
    function drawGantt(x0, top, w, mob, s, p, e, fs) {
        var sim = s.sim;
        var upTo = s.up;
        var pUp = p.sim === sim ? p.up : upTo;
        var q = ez(e);
        var revealF = lerp(pUp, upTo, q);
        var lw = mob ? 34 : 44;
        var cw = (w - lw) / HORIZON;
        var rh = mob ? 30 : 34;
        var pitch = rh + 14;
        var y0 = top + 46;
        var colOf = [P.orange, P.teal];
        var visA = function (t) { return t > upTo ? 0 : (t <= pUp ? 1 : clamp01(revealF - (t - 1))); };

        var curT = Math.max(-1, Math.min(upTo, Math.floor(revealF + 0.0001)));
        var cur = curT >= 0 ? sim.timeline[curT] : null;
        var cc = cur && cur.run ? colOf[cur.run === TASKS[0].id ? 0 : 1] : P.sub;
        tx('CPU', x0, top + 12, fs - 0.5, P.sub + 'ff', 'left', true);
        rr(x0 + lw, top + 1, mob ? 96 : 120, 22, 5, cc + '30', cc + 'ff', 1.6);
        tx(cur && cur.run ? cur.run + ' 실행' : (curT >= 0 ? '쉬는 중' : '대기'), x0 + lw + (mob ? 48 : 60), top + 12, fs - 0.5, cc + 'ff', 'center', true);
        if (curT >= 0) tx('t=' + curT, x0 + lw + (mob ? 106 : 132), top + 12, fs - 1, P.sub + 'ff', 'left', true);

        TASKS.forEach(function (tk, ri) {
            var y = y0 + ri * pitch;
            var col = colOf[ri];
            tx(tk.id, x0, y + rh / 2, fs, col + 'ff', 'left', true);
            for (var t = 0; t < HORIZON; t++) {
                var cx = x0 + lw + t * cw;
                rr(cx + 1, y, cw - 2, rh, 3, 'none', P.sub + '33', 1);
                var a = visA(t);
                if (a <= 0) continue;
                var ev = sim.timeline[t];
                ctx.globalAlpha = a;
                if (ev.run === tk.id) {
                    var c2 = ev.late ? P.red : col;
                    rr(cx + 1, y, cw - 2, rh, 3, c2 + '66', c2 + 'ff', 1.6);
                } else if (ev.ready[tk.id]) {
                    rr(cx + 1, y, cw - 2, rh, 3, 'none', P.sub + 'dd', 1.4);
                }
                ctx.globalAlpha = 1;
            }
            for (var kk = 0; kk * tk.P < HORIZON; kk++) {
                var rx = x0 + lw + kk * tk.P * cw;
                ln(rx, y + rh + 1, rx, y + rh + 12, col + 'ff', 1.6);
                head(rx, y + rh + 1, false, col + 'ff');
            }
            for (var dk = 1; dk * tk.P <= HORIZON; dk++) {
                var dx = x0 + lw + dk * tk.P * cw;
                var missed = sim.misses.some(function (j) { return j.ti === ri && j.dl === dk * tk.P; });
                var seen = revealF + 1 >= dk * tk.P;
                var dc = missed && seen ? P.red : P.sub;
                ln(dx, y - 12, dx, y - 1, dc + 'ff', missed && seen ? 2.2 : 1.4);
                head(dx, y - 1, true, dc + 'ff');
                if (missed && seen) {
                    var pulse = e < 1 && revealF + 1 - dk * tk.P < 1.2 ? 1 - e : 0;
                    if (pulse > 0) {
                        ctx.globalAlpha = pulse;
                        circ(dx, y - 6, 6 + (1 - pulse) * 14, 'none', P.red + 'ff', 2);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        });

        var cy = y0 + 2 * pitch;
        tx('CPU', x0, cy + rh / 2, fs - 0.5, P.sub + 'ff', 'left', true);
        for (var t2 = 0; t2 < HORIZON; t2++) {
            var cx2 = x0 + lw + t2 * cw;
            rr(cx2 + 1, cy, cw - 2, rh, 3, 'none', P.sub + '33', 1);
            var a2 = visA(t2);
            var ev2 = a2 > 0 ? sim.timeline[t2] : null;
            if (ev2 && ev2.run) {
                var ci = ev2.run === TASKS[0].id ? 0 : 1;
                var c3 = ev2.late ? P.red : colOf[ci];
                ctx.globalAlpha = a2;
                rr(cx2 + 1, cy, cw - 2, rh, 3, c3 + '66', c3 + 'ff', 1.6);
                tx(ev2.run, cx2 + cw / 2, cy + rh / 2, fs - 1.5, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
            tx(String(t2), cx2 + cw / 2, cy + rh + 12, fs - 1.5, P.sub + 'ff', 'center', false);
        }
        if (e < 1 && upTo > pUp) {
            var cxr = x0 + lw + (revealF + 1) * cw;
            ln(cxr, y0 - 6, cxr, cy + rh + 3, P.yellow + 'ff', 2);
        }

        var missN = sim.misses.filter(function (j) { return revealF + 1 >= j.dl; }).length;
        var done = revealF >= HORIZON - 1.01;
        var ly = cy + rh + 36;
        var txt = '↑ 도착  ↓ 마감  채움 = 실행  테두리 = 대기  빨강 = 마감 후 실행';
        lines(txt, w, fs - 0.5).forEach(function (l, li) {
            tx(l, x0, ly + li * (fs + 3), fs - 0.5, P.sub + 'ff', 'left', false);
        });
        if (missN > 0 || done) {
            var mc = missN > 0 ? P.red : P.green;
            tx('마감 실패 ' + missN + '번', x0 + w, top + 12, fs, mc + 'ff', 'right', true);
        }
    }

    /* ===================== 이용률 한계 ===================== */
    function drawBound(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k, q = ez(e);
        var bw = w - 24;
        var xAt = function (u) { return x0 + 4 + bw * u; };
        var by = top + 64, bh = mob ? 34 : 40;
        var ccols = [P.orange, P.teal];
        var g = k >= 1 ? (pk >= 1 ? 1 : q) : 0;

        tx('CPU 이용률 U = ΣC/P', x0, top + 12, fs, P.text + 'ff', 'left', true);
        if (k >= 1) tx('U = ' + pct(UTIL * g), x0 + w, top + 12, fs, P.text + 'ff', 'right', true);
        rr(x0 + 4, by, bw, bh, 4, 'none', P.sub + '66', 1.2);
        var acc = 0;
        TASKS.forEach(function (tk, i) {
            var u = tk.C / tk.P;
            var vis = Math.min(u, Math.max(0, UTIL * g - acc));
            if (vis > 0) {
                rr(xAt(acc) + 0.5, by, bw * vis - 1, bh, 3, ccols[i] + '44', ccols[i] + 'ff', 1.5);
                if (vis >= u * 0.98) tx(tk.id + ' ' + pct(u), xAt(acc) + bw * u / 2, by + bh / 2, fs - 0.5, ccols[i] + 'ff', 'center', true);
            }
            acc += u;
        });

        if (k >= 2) {
            var fresh2 = pk < 2;
            var a2 = fresh2 ? clamp01(e * 2) : 1;
            var rmPos = k >= 4 ? lerp(RM_BOUND, RM_LIMIT, pk >= 4 ? 1 : q) : RM_BOUND;
            ctx.globalAlpha = a2;
            if (UTIL > rmPos) {
                var ox = xAt(rmPos), ow = bw * (UTIL - rmPos);
                rr(ox, by, ow, bh, 3, P.red + '40', 'none', 1);
            }
            if (k >= 4) {
                ln(xAt(RM_BOUND), by - 4, xAt(RM_BOUND), by + bh + 4, P.yellow + '66', 1.2);
            }
            ln(xAt(rmPos), by - 8, xAt(rmPos), by + bh + 8, P.yellow + 'ff', 2.2);
            tx(k >= 4 ? 'n↑ → ln2 ' + pct(RM_LIMIT) : 'RM 한계 ' + pct(RM_BOUND), xAt(rmPos), by - 18, fs - 0.5, P.yellow + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (k >= 3) {
            var a3 = pk < 3 ? clamp01(e * 2) : 1;
            ctx.globalAlpha = a3;
            ln(xAt(1), by - 8, xAt(1), by + bh + 8, P.green + 'ff', 2.2);
            tx('EDF 100%', x0 + w, by + bh + 22, fs - 0.5, P.green + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }

        var vy = by + bh + 44;
        var lh = fs + 3;
        if (k >= 2) {
            ctx.globalAlpha = pk >= 2 ? 1 : clamp01((e - 0.3) / 0.7);
            var rmTxt = 'RM: 한계 초과 · 실패 ' + SIM_RM.misses.length + '번';
            var rl = lines(rmTxt, w, fs - 0.5);
            rl.forEach(function (l, li) { tx(l, x0, vy + li * lh, fs - 0.5, P.red + 'ff', 'left', true); });
            vy += rl.length * lh + 6;
            ctx.globalAlpha = 1;
        }
        if (k >= 3) {
            ctx.globalAlpha = pk >= 3 ? 1 : clamp01((e - 0.3) / 0.7);
            var edfTxt = 'EDF: 100% 이하 · 실패 ' + SIM_EDF.misses.length + '번';
            lines(edfTxt, w, fs - 0.5).forEach(function (l, li) { tx(l, x0, vy + li * lh, fs - 0.5, P.green + 'ff', 'left', true); });
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'bound') drawBound(x0, top, w, mob, s, p, e, L.fs);
        else drawGantt(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('rt-viz__speed-btn--active'); });
        btn.classList.add('rt-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('rt-viz__mode-btn--active', d.key === m); });
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