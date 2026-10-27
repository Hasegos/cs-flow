/**
 * 우선순위 역전 시각화
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
    var root    = el('div', 'pi-viz');
    var toolbar = el('div', 'pi-viz__toolbar');
    var tbLeft  = el('div', 'pi-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'pi-viz__title', 'PRIORITY'));

    var modeWrap = el('div', 'pi-viz__mode');
    var modeDefs = [
        { key: 'inv', label: '우선순위 역전' },
        { key: 'inherit', label: '우선순위 상속' },
        { key: 'compare', label: '비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'pi-viz__mode-btn' + (i === 0 ? ' pi-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'pi-viz__speed');
    speedWrap.appendChild(el('span', 'pi-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'pi-viz__speed-btn' + (i === 0 ? ' pi-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'pi-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'pi-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'pi-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'pi-viz__controls');
    var btnPlay  = el('button', 'pi-viz__btn pi-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'pi-viz__btn', '▶| STEP');
    var btnReset = el('button', 'pi-viz__btn', '↺ RESET');
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
    var mode    = 'inv';
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

    /* ===================== 데이터: 작업과 시뮬레이션 ===================== */
    var PRIO = { H: 3, M: 2, L: 1 };
    var NAME = { H: '높음', M: '중간', L: '낮음' };
    var TASKS = {
        L: { at: 0, prog: ['n', 'L', 'L', 'L', 'n'] },
        H: { at: 2, prog: ['n', 'L', 'n'] },
        M: { at: 3, prog: ['n', 'n', 'n', 'n'] }
    };
    var IDS = ['H', 'M', 'L'];

    function simulate(inherit) {
        var pc = { H: 0, M: 0, L: 0 };
        var owner = null;
        var timeline = [];
        var finish = {};
        var left = IDS.length;
        for (var t = 0; left > 0 && t < 60; t++) {
            var st = {};
            var blockedPrios = [];
            IDS.forEach(function (id) {
                var tk = TASKS[id];
                if (pc[id] >= tk.prog.length) { st[id] = 'done'; return; }
                if (t < tk.at) { st[id] = 'none'; return; }
                var next = tk.prog[pc[id]];
                if (next === 'L' && owner !== null && owner !== id) {
                    st[id] = 'blocked';
                    blockedPrios.push(PRIO[id]);
                } else {
                    st[id] = 'ready';
                }
            });
            var eff = { H: PRIO.H, M: PRIO.M, L: PRIO.L };
            if (inherit && owner && blockedPrios.length) {
                eff[owner] = Math.max(eff[owner], Math.max.apply(null, blockedPrios));
            }
            var run = null;
            IDS.forEach(function (id) {
                if (st[id] !== 'ready') return;
                if (run === null || eff[id] > eff[run]) run = id;
            });
            var ownerNow = owner;
            if (run) {
                var tk2 = TASKS[run];
                var cur = tk2.prog[pc[run]];
                if (cur === 'L' && owner === null) owner = run;
                ownerNow = owner;
                pc[run]++;
                var nxt = tk2.prog[pc[run]];
                if (cur === 'L' && nxt !== 'L') owner = null;
                if (pc[run] >= tk2.prog.length) { finish[run] = t + 1; left--; }
            }
            timeline.push({ run: run, st: st, owner: ownerNow, eff: eff });
        }
        return { timeline: timeline, finish: finish, len: timeline.length };
    }
    var SIM_INV = simulate(false);
    var SIM_INH = simulate(true);
    var TT = Math.max(SIM_INV.len, SIM_INH.len);

    function firstT(sim, fn) {
        for (var i = 0; i < sim.timeline.length; i++) if (fn(sim.timeline[i], i)) return i;
        return -1;
    }
    function lastT(sim, fn) {
        var r = -1;
        sim.timeline.forEach(function (e, i) { if (fn(e, i)) r = i; });
        return r;
    }
    function events(sim) {
        return {
            lockAcq: firstT(sim, function (e) { return e.owner === 'L'; }),
            hBlock: firstT(sim, function (e) { return e.st.H === 'blocked'; }),
            mStart: firstT(sim, function (e) { return e.run === 'M'; }),
            mEnd: lastT(sim, function (e) { return e.run === 'M'; }),
            hLock: firstT(sim, function (e) { return e.owner === 'H'; }),
            lastLockL: lastT(sim, function (e) { return e.owner === 'L'; })
        };
    }
    var EV_INV = events(SIM_INV);
    var EV_INH = events(SIM_INH);
    var H_ARR = TASKS.H.at;
    var M_ARR = TASKS.M.at;
    function resp(sim) { return sim.finish.H - H_ARR; }

    var INV_STEPS = [
        { up: -1, sim: SIM_INV, log: '단일 CPU에서 우선순위가 높음(H) · 중간(M) · 낮음(L)인 작업 3개가 실행됩니다. H와 L은 같은 락(자물쇠)을 씁니다. 칸 하나가 시간 1입니다(값은 예시).' },
        { up: EV_INV.lockAcq, sim: SIM_INV, log: 't=' + EV_INV.lockAcq + ' — 낮은 우선순위 L이 락을 잡고 임계 구역을 실행합니다.' },
        { up: EV_INV.hBlock, sim: SIM_INV, log: 't=' + H_ARR + '에 H가 도착해 먼저 실행하다가 t=' + EV_INV.hBlock + '에 같은 락이 필요해집니다. 락은 L이 쥐고 있어 H가 기다립니다(블록).' },
        { up: EV_INV.mEnd, sim: SIM_INV, log: 't=' + M_ARR + '에 도착한 중간 우선순위 M은 락이 필요 없습니다. 실행 가능한 작업 중 M이 L보다 우선순위가 높아 M이 t=' + EV_INV.mStart + '~' + EV_INV.mEnd + ' 동안 CPU를 차지하고, L은 락을 쥔 채 밀립니다. H는 M이 끝나기까지 기다립니다.' },
        { up: EV_INV.hLock, sim: SIM_INV, log: 'M이 끝난 뒤에야 L이 실행되어 락을 풀고, t=' + EV_INV.hLock + '에 H가 락을 얻습니다. 우선순위가 가장 높은 H가 중간인 M보다도 늦게 진행했습니다. 이것이 우선순위 역전입니다.' },
        { up: SIM_INV.len - 1, sim: SIM_INV, log: 'H가 t=' + SIM_INV.finish.H + '에 끝납니다. 도착(t=' + H_ARR + ') 뒤 응답 시간은 ' + resp(SIM_INV) + '입니다. 정리 — 낮은 작업이 락을 쥔 채 중간 작업에 밀리면 높은 작업이 불필요하게 길게 기다립니다.' }
    ];

    var INH_STEPS = [
        { up: -1, sim: SIM_INH, log: '같은 작업과 같은 락이지만 우선순위 상속을 씁니다. 락을 쥔 작업은 그 락을 기다리는 더 높은 우선순위 작업의 우선순위를 임시로 물려받습니다.' },
        { up: EV_INH.hBlock, sim: SIM_INH, log: 't=' + EV_INH.hBlock + ' — H가 L이 쥔 락을 기다리며 블록됩니다. 이때 L이 H의 우선순위를 상속합니다(L의 칸 위 ▲ 표시).' },
        { up: EV_INH.lastLockL, sim: SIM_INH, log: '상속한 L은 M보다 우선순위가 높아져 M에게 밀리지 않고 임계 구역을 끝내 락을 풉니다(t=' + EV_INH.lastLockL + '까지).' },
        { up: EV_INH.hLock, sim: SIM_INH, log: '락이 풀리자 t=' + EV_INH.hLock + '에 H가 락을 얻어 실행합니다. L의 우선순위는 원래대로 돌아갑니다.' },
        { up: SIM_INH.len - 1, sim: SIM_INH, log: 'H는 t=' + SIM_INH.finish.H + '에 끝납니다. 도착 뒤 ' + resp(SIM_INH) + '만에 끝났고, 상속이 없을 때의 ' + resp(SIM_INV) + '보다 짧습니다. M은 대신 늦게 끝나지만 우선순위가 낮은 쪽이 미뤄지는 것은 정상입니다.' }
    ];

    var COMPARE_STEPS = [
        { k: 0, log: 'H가 도착해서 끝날 때까지 걸린 시간(응답 시간)을 두 방식에서 비교합니다.' },
        { k: 1, log: '상속 없음 — H의 응답 시간은 ' + resp(SIM_INV) + '입니다. L이 락을 쥔 채 M에 밀린 시간이 모두 H의 지연이 됩니다.' },
        { k: 2, log: '우선순위 상속 — H의 응답 시간은 ' + resp(SIM_INH) + '입니다. L이 임시로 높은 우선순위를 얻어 락을 빨리 풀었기 때문입니다.' },
        { k: 2, log: '정리 — 우선순위 상속은 락을 쥔 낮은 작업을 빨리 끝내게 해 높은 작업의 지연을 락의 임계 구역 길이로 줄입니다. 해결책에는 우선순위 상한(ceiling) 프로토콜 같은 방법도 있습니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'inherit') return INH_STEPS;
        if (mode === 'compare') return COMPARE_STEPS;
        return INV_STEPS;
    }
    function defaultLog() {
        if (mode === 'inherit') return '락을 쥔 작업이 기다리는 높은 작업의 우선순위를 물려받는 과정을 봅니다.';
        if (mode === 'compare') return 'H의 응답 시간을 상속이 없을 때와 있을 때로 비교합니다.';
        return '낮은 작업이 락을 쥔 채 중간 작업에 밀려 높은 작업이 기다리는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 10.5 : 12, total: mode === 'compare' ? (mob ? 136 : 146) : (mob ? 306 : 304) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 간트 차트 ===================== */
    function drawGantt(x0, top, w, mob, s, p, e, fs) {
        var sim = s.sim;
        var upTo = s.up;
        var pUp = p.sim === sim ? p.up : upTo;
        var q = ez(e);
        var revealF = lerp(pUp, upTo, q);
        var lw = mob ? 50 : 52;
        var cw = (w - lw) / TT;
        var rh = mob ? 30 : 34;
        var gap = 8;
        var colOf = { H: P.orange, M: P.teal, L: P.purple };
        var baseY = top + 36;
        var visA = function (t) { return t <= pUp ? 1 : clamp01(revealF - (t - 1)); };

        var curT = Math.max(-1, Math.min(upTo, Math.floor(revealF + 0.0001)));
        var cur = curT >= 0 ? sim.timeline[curT] : null;
        tx('CPU', x0, top + 12, fs - 0.5, P.sub + 'ff', 'left', true);
        var cc = cur && cur.run ? colOf[cur.run] : P.sub;
        rr(x0 + lw, top + 1, mob ? 110 : 140, 22, 5, cc + '30', cc + 'ff', 1.6);
        tx(cur && cur.run ? cur.run + ' ' + NAME[cur.run] + ' 실행' : (curT >= 0 ? '쉬는 중' : '대기'), x0 + lw + (mob ? 55 : 70), top + 12, fs - 0.5, cc + 'ff', 'center', true);
        if (curT >= 0) tx('t=' + curT, x0 + lw + (mob ? 120 : 152), top + 12, fs - 1, P.sub + 'ff', 'left', true);

        IDS.forEach(function (id, ri) {
            var y = baseY + ri * (rh + gap);
            tx(id + ' ' + NAME[id], x0, y + rh / 2, fs - (mob ? 1.5 : 0.5), colOf[id] + 'ff', 'left', true);
            for (var t = 0; t < TT; t++) {
                var cx = x0 + lw + t * cw;
                var a = t <= upTo ? visA(t) : 0;
                var ev = a > 0 ? sim.timeline[t] : null;
                var st = ev ? ev.st[id] : null;
                var running = ev && ev.run === id;
                var col = colOf[id];
                rr(cx + 1, y, cw - 2, rh, 3, 'none', P.sub + '33', 1);
                if (!ev) continue;
                ctx.globalAlpha = a;
                if (running) {
                    rr(cx + 1, y, cw - 2, rh, 3, col + '66', col + 'ff', 1.6);
                    if (ev.owner === id) tx('락', cx + cw / 2, y + rh / 2, fs - 0.5, P.text + 'ff', 'center', true);
                    if (ev.eff[id] > PRIO[id]) tx('▲', cx + cw / 2, y + 7, fs - 2, P.yellow + 'ff', 'center', true);
                } else if (st === 'blocked') {
                    var pulse = e < 1 && t > pUp ? 0.5 + 0.5 * Math.sin(e * 18) : 1;
                    rr(cx + 1, y, cw - 2, rh, 3, P.red + '44', P.red + 'ff', 1.2 + pulse);
                } else if (st === 'ready') {
                    rr(cx + 1, y, cw - 2, rh, 3, 'none', P.sub + 'dd', 1.4);
                }
                ctx.globalAlpha = 1;
            }
        });
        var ly = baseY + 3 * (rh + gap);
        tx('락', x0, ly + 9, fs - 0.5, P.sub + 'ff', 'left', true);
        for (var t2 = 0; t2 < TT; t2++) {
            var a2 = t2 <= upTo ? visA(t2) : 0;
            var ce = a2 > 0 ? sim.timeline[t2] : null;
            var cxx = x0 + lw + t2 * cw;
            rr(cxx + 1, ly, cw - 2, 18, 3, 'none', P.sub + '33', 1);
            if (ce && ce.owner) {
                ctx.globalAlpha = a2;
                rr(cxx + 1, ly, cw - 2, 18, 3, colOf[ce.owner] + '55', colOf[ce.owner] + 'ff', 1.4);
                tx(ce.owner, cxx + cw / 2, ly + 9, fs - 1.5, colOf[ce.owner] + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
            tx(String(t2), cxx + cw / 2, ly + 32, fs - 1.5, P.sub + 'ff', 'center', false);
        }
        if (e < 1 && upTo > pUp) {
            var cxr = x0 + lw + (revealF + 1) * cw;
            ln(cxr, baseY - 6, cxr, ly + 20, P.yellow + 'ff', 2);
        }
        lines('채움 = 실행, 빨강 = 락 대기, 회색 테두리 = CPU 대기', w, fs - 0.5).forEach(function (l, li) {
            tx(l, x0, ly + 52 + li * (fs + 3), fs - 0.5, P.sub + 'ff', 'left', false);
        });
    }

    /* ===================== 비교 ===================== */
    function drawCompare(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var bh = mob ? 30 : 36;
        var lw = mob ? 92 : 110;
        var maxW = w - lw - (mob ? 40 : 60);
        var vals = [['상속 없음', resp(SIM_INV), P.red, 1], ['우선순위 상속', resp(SIM_INH), P.green, 2]];
        var mx = Math.max(resp(SIM_INV), resp(SIM_INH));
        tx('H의 응답 시간 (도착 → 완료)', x0, top + 12, fs, P.text + 'ff', 'left', true);
        vals.forEach(function (v, i) {
            var y = top + 30 + i * (bh + 18);
            var on = k >= v[3];
            tx(v[0], x0, y + bh / 2, fs - 0.5, on ? v[2] + 'ff' : P.sub + 'ff', 'left', true);
            rr(x0 + lw, y, maxW, bh, 4, 'none', P.sub + '55', 1);
            if (on) {
                var g = pk >= v[3] ? 1 : ez(e);
                var bw = maxW * v[1] / mx * g;
                rr(x0 + lw, y, bw, bh, 4, v[2] + '30', v[2] + 'ff', 1.6);
                tx(String(Math.round(v[1] * g)), x0 + lw + bw + 8, y + bh / 2, fs, v[2] + 'ff', 'left', true);
            }
        });
        if (k >= 2) {
            var dv = resp(SIM_INV) - resp(SIM_INH);
            ctx.globalAlpha = pk >= 2 ? 1 : clamp01((e - 0.5) / 0.5);
            tx('−' + dv + ' 단축', x0 + w, top + 12, fs, P.green + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'compare') drawCompare(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('pi-viz__speed-btn--active'); });
        btn.classList.add('pi-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('pi-viz__mode-btn--active', d.key === m); });
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