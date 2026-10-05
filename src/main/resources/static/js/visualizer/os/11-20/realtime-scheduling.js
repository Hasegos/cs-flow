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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'rm';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'edf') return EDF_STEPS;
        if (mode === 'bound') return BOUND_STEPS;
        return RM_STEPS;
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

    /* ===================== 공통: 간트 차트 ===================== */
    function drawGantt(x0, top, w, mob, step, pol) {
        var fs = mob ? 10 : 11.5;
        var upTo = step ? step.up : -1;
        var sim = step ? step.sim : (pol === 'edf' ? SIM_EDF : SIM_RM);
        var lw = mob ? 30 : 44;
        var cw = (w - lw) / HORIZON;
        var rh = mob ? 30 : 36;
        var gap = 26;
        var colOf = [P.orange, P.teal];
        var info = pol === 'edf' ? '우선순위: 마감이 가까운 작업이 높음 (동적)' : '우선순위: 주기가 짧은 작업이 높음 (고정, T1 > T2)';
        tx(info, x0, top + 6, fs - 0.5, P.text + 'ee', 'left', true);
        var y0 = top + 34;
        TASKS.forEach(function (tk, ri) {
            var y = y0 + ri * (rh + gap);
            var col = colOf[ri];
            tx(tk.id, x0, y + rh / 2, fs, col + 'ee', 'left', true);
            for (var t = 0; t < HORIZON; t++) {
                var cx = x0 + lw + t * cw;
                var e = t <= upTo ? sim.timeline[t] : null;
                if (e && e.run === tk.id) {
                    if (e.late) rr(cx + 1, y, cw - 2, rh, 3, P.red + '40', P.red + 'ff', 1.6);
                    else rr(cx + 1, y, cw - 2, rh, 3, col + '55', col + 'ff', 1.4);
                    tx(String(e.job + 1), cx + cw / 2, y + rh / 2, fs - 1.5, P.text + 'ee', 'center', true);
                } else if (e && e.ready[tk.id]) {
                    rr(cx + 1, y, cw - 2, rh, 3, 'none', P.muted + '99', 1.1);
                } else {
                    rr(cx + 1, y, cw - 2, rh, 3, 'none', P.muted + '22', 1);
                }
            }
            for (var k = 0; k * tk.P <= HORIZON; k++) {
                var rx = x0 + lw + k * tk.P * cw;
                if (k * tk.P < HORIZON) tx('▲', rx, y + rh + 8, fs - 3, P.green + 'ff', 'center', true);
                var dx = x0 + lw + (k + 1) * tk.P * cw;
                if ((k + 1) * tk.P <= HORIZON) {
                    var missed = sim.misses.some(function (j) { return TASKS[j.ti].id === tk.id && j.n === k; });
                    var shown = upTo >= (k + 1) * tk.P - 1;
                    tx('▼', dx, y - 8, fs - 3, (missed && shown ? P.red : P.yellow) + 'ff', 'center', true);
                }
            }
        });
        var ay = y0 + 2 * (rh + gap) - gap + 14;
        for (var t2 = 0; t2 <= HORIZON; t2 += 1) {
            if (mob && t2 % 2 === 1) continue;
            tx(String(t2), x0 + lw + t2 * cw, ay, fs - 3, P.muted + 'cc', 'center', false);
        }
        tx('▲ 도착   ▼ 마감 (빨강 = 마감 실패)', x0, ay + 22, fs - 1.5, P.muted + 'ee', 'left', false);
        tx('채움 = 실행(숫자는 몇 번째 작업), 회색 테두리 = CPU 대기', x0, ay + 40, fs - 1.5, P.muted + 'ee', 'left', false);
    }

    /* ===================== 모드: 이용률 한계 ===================== */
    function drawBound(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k = step ? step.k : 0;
        var bh = mob ? 28 : 34;
        var lw = mob ? 96 : 150;
        var maxW = w - lw - (mob ? 50 : 64);
        tx('CPU 이용률 (0% ~ 100%)', x0, top + 12, fs, P.text + 'ee', 'left', true);
        var rows = [
            ['작업 집합 U', UTIL, P.orange, 1],
            ['RM 보장 한계(n=' + TASKS.length + ')', RM_BOUND, P.teal, 2],
            ['EDF 한계', 1, P.green, 3]
        ];
        var rowsTop = top + 30;
        rows.forEach(function (r, i) {
            var y = rowsTop + i * (bh + 22);
            var on = k >= r[3];
            tx(r[0], x0, y + bh / 2, fs - (mob ? 1.5 : 0.5), on ? r[2] + 'ee' : P.muted + '77', 'left', true);
            rr(x0 + lw, y, maxW, bh, 4, 'none', P.muted + '33', 1);
            if (on) {
                var bw = maxW * r[1];
                var bad = i === 0 && k >= 2 && UTIL > RM_BOUND;
                rr(x0 + lw, y, bw, bh, 4, r[2] + '30', r[2] + 'cc', 1.5);
                tx(pct(r[1]), x0 + lw + bw + 8, y + bh / 2, fs, r[2] + 'ee', 'left', true);
                if (bad) tx('RM 한계 초과', x0 + lw + 8, y + bh / 2, fs - 2, P.red + 'ee', 'left', true);
            }
        });
        if (k >= 4) {
            var yR = rowsTop + (bh + 22);
            var lx = x0 + lw + maxW * RM_LIMIT;
            ctx.beginPath();
            ctx.moveTo(lx, yR - 4);
            ctx.lineTo(lx, yR + bh + 4);
            ctx.strokeStyle = P.yellow + 'cc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            tx('n→∞: ' + pct(RM_LIMIT), lx, yR + bh + 11, fs - 2, P.yellow + 'ee', 'center', true);
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

        if (mode === 'bound') drawBound(padX, top, fullW, mob, step);
        else drawGantt(padX, top, fullW, mob, step, mode);

        if (!step) {
            tx('아래 STEP을 눌러 RM과 EDF가 같은 작업을 어떻게 다르게 실행하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'bound') neededH = mob ? 220 : 230;
        else neededH = mob ? 250 : 260;
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
        if (mode === 'edf') return '마감이 가장 가까운 작업을 먼저 실행하는 EDF의 동적 우선순위를 봅니다.';
        if (mode === 'bound') return 'RM과 EDF가 마감을 보장하는 CPU 이용률 한계를 비교합니다.';
        return '주기가 짧은 작업에 고정 우선순위를 주는 RM이 마감을 지키는지 봅니다.';
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