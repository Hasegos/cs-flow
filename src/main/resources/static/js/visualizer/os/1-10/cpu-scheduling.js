/**
 * CPU 스케줄링 시각화
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
    var root    = el('div', 'sched-viz');
    var toolbar = el('div', 'sched-viz__toolbar');
    var tbLeft  = el('div', 'sched-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sched-viz__title', 'CPU Scheduling'));

    var modeWrap = el('div', 'sched-viz__mode');
    var modeDefs = [
        { key: 'fcfs', label: 'FCFS' },
        { key: 'sjf', label: 'SJF' },
        { key: 'rr', label: 'RR (q=2)' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sched-viz__mode-btn' + (i === 0 ? ' sched-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sched-viz__speed');
    speedWrap.appendChild(el('span', 'sched-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sched-viz__speed-btn' + (i === 0 ? ' sched-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sched-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sched-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sched-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sched-viz__controls');
    var btnPlay  = el('button', 'sched-viz__btn sched-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sched-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sched-viz__btn', '↺ RESET');
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
        var tl = window.CsFlow.wrapText(ctx, title, maxIn);
        var titleW = 0;
        tl.forEach(function (l) { titleW = Math.max(titleW, ctx.measureText(l).width); });
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 24 + tl.length * 18 + dl.length * 18 : 18 + tl.length * 18;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tl.forEach(function (l, i) { tx(l, bx + pad, by + 18 + i * 18, 14, P.text + 'ff', 'left', true); });
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 24 + tl.length * 18 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 프로세스 데이터 ===================== */
    const PROCS = [
        { id: 'P1', arrival: 0, burst: 6 },
        { id: 'P2', arrival: 1, burst: 3 },
        { id: 'P3', arrival: 2, burst: 4 },
        { id: 'P4', arrival: 3, burst: 2 },
    ];

    const PROC_COLS = { P1: null, P2: null, P3: null, P4: null };

    /* ===================== 알고리즘별 간트 슬롯 계산 ===================== */
    function calcFCFS(procs) {
        const slots = [];
        let t = 0;
        const sorted = procs.slice().sort(function (a, b) { return a.arrival - b.arrival; });
        sorted.forEach(function (p) {
            if (t < p.arrival) t = p.arrival;
            slots.push({ id: p.id, start: t, end: t + p.burst });
            t += p.burst;
        });
        return slots;
    }

    function calcSJF(procs) {
        const slots = [];
        let t = 0;
        const remaining = procs.map(function (p) { return Object.assign({}, p); });
        const done = [];
        while (done.length < procs.length) {
            const avail = remaining.filter(function (p) {
                return done.indexOf(p.id) === -1 && p.arrival <= t;
            });
            if (!avail.length) {
                const next = remaining
                    .filter(function (p) { return done.indexOf(p.id) === -1; })
                    .reduce(function (mn, p) { return p.arrival < mn ? p.arrival : mn; }, Infinity);
                t = next;
                continue;
            }
            avail.sort(function (a, b) { return a.burst - b.burst || a.arrival - b.arrival; });
            const sel = avail[0];
            slots.push({ id: sel.id, start: t, end: t + sel.burst });
            t += sel.burst;
            done.push(sel.id);
        }
        return slots;
    }

    function calcRR(procs, quantum) {
        const slots = [];
        const q = quantum || 2;
        let t = 0;
        const rem = procs.map(function (p) {
            return { id: p.id, arrival: p.arrival, rem: p.burst };
        });
        const queue = [];
        const enqueued = {};
        let safety = 0;

        while (true) {
            rem.forEach(function (p) {
                if (p.arrival <= t && !enqueued[p.id] && p.rem > 0) {
                    queue.push(p.id);
                    enqueued[p.id] = true;
                }
            });

            if (!queue.length) {
                const next = rem.filter(function (p) { return p.rem > 0; });
                if (!next.length) break;
                t = next.reduce(function (mn, p) { return p.arrival < mn ? p.arrival : mn; }, Infinity);
                continue;
            }

            const cur = queue.shift();
            const proc = rem.find(function (p) { return p.id === cur; });
            const run  = Math.min(q, proc.rem);
            slots.push({ id: proc.id, start: t, end: t + run });
            t += run;
            proc.rem -= run;

            rem.forEach(function (p) {
                if (p.arrival <= t && !enqueued[p.id] && p.rem > 0) {
                    queue.push(p.id);
                    enqueued[p.id] = true;
                }
            });
            if (proc.rem > 0) queue.push(proc.id);

            if (++safety > 500) break;
        }
        return slots;
    }

    /* ===================== 통계 계산 ===================== */
    function calcStats(procs, slots) {
        return procs.map(function (p) {
            const mySlots = slots.filter(function (s) { return s.id === p.id; });
            const finish  = mySlots.reduce(function (mx, s) { return s.end > mx ? s.end : mx; }, 0);
            const turnaround = finish - p.arrival;
            const waiting = turnaround - p.burst;
            return { id: p.id, arrival: p.arrival, burst: p.burst, finish, turnaround, waiting };
        });
    }

    /* ===================== 알고리즘 데이터 ===================== */
    const ALGOS = [
        {
            name: 'FCFS',
            desc: 'First-Come, First-Served — 도착 순서대로 비선점 실행',
            slots: calcFCFS(PROCS),
        },
        {
            name: 'SJF',
            desc: 'Shortest Job First — 도착한 프로세스 중 버스트가 가장 짧은 것 먼저',
            slots: calcSJF(PROCS),
        },
        {
            name: 'RR (q=2)',
            desc: 'Round Robin (Quantum=2) — 타임 퀀텀 2단위마다 선점',
            slots: calcRR(PROCS, 2),
        },
    ];

    const MAX_T = ALGOS.reduce(function (mx, a) {
        const end = a.slots.reduce(function (m, s) { return s.end > m ? s.end : m; }, 0);
        return end > mx ? end : mx;
    }, 0);

    /* ===================== 상태 ===================== */
    var TIPS = {};
    var OCS_MODE_IDX = { fcfs: 0, sjf: 1, rr: 2 };
    var ocsStepCache = {};
    var ocsWaitCache = {};

    /* ===================== 단계와 대기 큐 ===================== */
    function ocsIdx() { return OCS_MODE_IDX[mode] || 0; }
    function ocsCol(id) { return id === 'P1' ? P.teal : id === 'P2' ? P.purple : id === 'P3' ? P.orange : P.green; }
    function ocsLast(id, slots) {
        var r = -1;
        slots.forEach(function (s, k) { if (s.id === id) r = k; });
        return r;
    }
    function ocsLog(idx, i) {
        var s = ALGOS[idx].slots[i];
        var p = PROCS.find(function (x) { return x.id === s.id; });
        var algo = ALGOS[idx].name;
        if (algo === 'FCFS') {
            return 'T=' + s.start + ' — ' + s.id + ' 실행 시작 (버스트: ' + p.burst +
                   '). FCFS: 도착 순서대로 선점 없이 완료까지 실행합니다. → T=' + s.end + ' 완료.';
        }
        if (algo === 'SJF') {
            return 'T=' + s.start + ' — 도착한 프로세스 중 버스트 최소인 ' + s.id +
                   ' 선택 (버스트: ' + p.burst + '). 비선점 실행 → T=' + s.end + ' 완료.';
        }
        var sliceLen = s.end - s.start;
        return 'T=' + s.start + ' — ' + s.id + ' 에 퀀텀 ' + sliceLen +
               ' 단위 할당' + (ocsLast(s.id, ALGOS[idx].slots) !== i ? ' (선점 후 Ready Queue 재삽입)' : ' (완료)') +
               '. → T=' + s.end + '.';
    }
    function ocsSteps(idx) {
        if (!ocsStepCache[idx]) {
            var arr = [];
            ALGOS[idx].slots.forEach(function (s, i) { arr.push({ log: ocsLog(idx, i) }); });
            arr.push({ log: ALGOS[idx].name + ' 완료 — 통계 테이블에서 각 프로세스의 대기·반환 시간을 확인하세요.' });
            ocsStepCache[idx] = arr;
        }
        return ocsStepCache[idx];
    }
    function ocsWait(idx) {
        if (ocsWaitCache[idx]) return ocsWaitCache[idx];
        var slots = ALGOS[idx].slots;
        var out;
        if (idx === 2) {
            var queue = [], enq = {}, rem = {};
            PROCS.forEach(function (p) { rem[p.id] = p.burst; });
            var pushArr = function (at) {
                PROCS.forEach(function (p) {
                    if (p.arrival <= at && !enq[p.id] && rem[p.id] > 0) { queue.push(p.id); enq[p.id] = true; }
                });
            };
            out = slots.map(function (s) {
                pushArr(s.start);
                var qi = queue.indexOf(s.id);
                if (qi >= 0) queue.splice(qi, 1);
                rem[s.id] -= s.end - s.start;
                pushArr(s.end);
                if (rem[s.id] > 0) queue.push(s.id);
                return queue.slice();
            });
        } else {
            var lastEnd = {};
            slots.forEach(function (s) { lastEnd[s.id] = Math.max(lastEnd[s.id] || 0, s.end); });
            out = slots.map(function (s) {
                var w2 = PROCS.filter(function (p) { return p.arrival <= s.end && lastEnd[p.id] > s.end; });
                if (idx === 0) w2.sort(function (a, b) { return a.arrival - b.arrival; });
                else w2.sort(function (a, b) { return a.burst - b.burst || a.arrival - b.arrival; });
                return w2.map(function (p) { return p.id; });
            });
        }
        ocsWaitCache[idx] = out;
        return out;
    }

    /* ===================== 장면 ===================== */
    function currentSteps() { return ocsSteps(ocsIdx()); }
    function defaultLog() { return '▶ PLAY를 눌러 스케줄링 과정을 확인하세요. 상단 버튼으로 알고리즘을 바꿀 수 있습니다.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function layout(w, mob) {
        var fsS = mob ? 11 : 12;
        var lh = fsS + 6;
        var hdrN = 1;
        [0, 1, 2].forEach(function (k) {
            var n = lines(ALGOS[k].desc, w, fsS).length;
            if (n > hdrN) hdrN = n;
        });
        var hdrH = hdrN * lh + 6;
        var cpuW = mob ? 56 : 100, cpuH = mob ? 54 : 60;
        var chipW = mob ? 32 : 48, chipH = mob ? 22 : 24;
        var rowTop = hdrH + 14;
        var qTop = rowTop + cpuH - chipH - 6;
        var qX = cpuW + (mob ? 22 : 34);
        var labelW = mob ? 26 : 34;
        var cX = labelW, cW = w - labelW;
        var clockY = rowTop + cpuH + 10;
        var axisY = clockY + 16;
        var rowsY = axisY + 16;
        var rowH = mob ? 22 : 26, rowGap = mob ? 6 : 8;
        var ganttH = PROCS.length * (rowH + rowGap);
        var statY = rowsY + ganttH + 16;
        var sRowH = mob ? 20 : 24;
        var avgH = (mob ? 2 : 1) * lh + 8;
        var avgY = statY + sRowH * (PROCS.length + 1) + 6;
        return {
            fsS: fsS, lh: lh, cpuW: cpuW, cpuH: cpuH, chipW: chipW, chipH: chipH, gap: mob ? 4 : 6,
            rowTop: rowTop, qTop: qTop, qX: qX, qW: w - qX,
            labelW: labelW, cX: cX, cW: cW, unit: cW / MAX_T,
            clockY: clockY, axisY: axisY, rowsY: rowsY, rowH: rowH, rowGap: rowGap, ganttH: ganttH,
            statY: statY, sRowH: sRowH, avgY: avgY, avgH: avgH,
            total: avgY + avgH + 4
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fsS = L.fsS, lh = L.lh;
        var fsM = mob ? 12 : 13;
        var idx = ocsIdx();
        var steps = currentSteps();
        var slots = ALGOS[idx].slots;
        var N = slots.length;
        var si = step ? steps.indexOf(step) : -1;
        var ghost = si < 0;
        var waitAfter = ocsWait(idx);
        var stats = calcStats(PROCS, slots);
        var pA = seg(t, 0, 0.3), pB = seg(t, 0.3, 0.85), pC = seg(t, 0.85, 1);
        var run = si >= 0 && si < N ? slots[si] : null;
        var preQ = si > 0 ? waitAfter[si - 1] : [];
        var postQ = run ? waitAfter[si] : [];
        var alphaMul = ghost ? 0.22 : 1;
        var curT = si < 0 ? 0 : (si >= N ? slots[N - 1].end : run.start + (run.end - run.start) * pB);

        function ocsA(a) { ctx.globalAlpha = a * alphaMul; }
        function ocsLaneX(k) { return x0 + L.qX + 6 + k * (L.chipW + L.gap); }
        function ocsChip(x, y, id, a) {
            ctx.globalAlpha = a;
            rr(x, y, L.chipW, L.chipH, 6, ocsCol(id) + 'ff');
            tx(id, x + L.chipW / 2, y + L.chipH / 2, fsS, '#111111', 'center', true);
            ctx.globalAlpha = 1;
        }

        TIPS = {};
        stats.forEach(function (st) {
            TIPS[st.id] = st.id + ' — 도착: ' + st.arrival + '   버스트: ' + st.burst + '\n' +
                          '반환 시간: ' + st.turnaround + '   대기 시간: ' + st.waiting;
        });

        lines(ALGOS[idx].desc, w, fsS).forEach(function (s2, i2) {
            tx(s2, x0 + w / 2, top + i2 * lh + lh / 2, fsS, P.sub, 'center', false);
        });

        rr(x0 + L.qX, top + L.qTop - 6, L.qW, L.chipH + 12, 6, P.surf2, P.border, 1);
        tx('Ready Queue', x0 + L.qX + 6, top + L.rowTop + 6, fsS, P.sub, 'left', true);
        if (!preQ.length && !postQ.length) {
            tx('비어 있음', x0 + L.qX + L.qW / 2, top + L.qTop + L.chipH / 2, fsS, P.sub, 'center', false);
        }
        var qIds = preQ.concat(postQ).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
        qIds.forEach(function (id) {
            if (run && id === run.id) return;
            var ip = preQ.indexOf(id), iq = postQ.indexOf(id);
            var x, a;
            if (ip >= 0 && iq >= 0) { x = lerp(ocsLaneX(ip), ocsLaneX(iq), ez(pA)); a = 1; }
            else if (iq >= 0) { x = ocsLaneX(iq); a = ez(pC); }
            else { x = ocsLaneX(ip); a = 1 - ez(pC); }
            ocsChip(x, top + L.qTop, id, a);
        });

        arrow(x0 + L.qX - 3, top + L.qTop + L.chipH / 2, x0 + L.cpuW + 4, top + L.qTop + L.chipH / 2,
              P.sub + '99', 1.2, [3, 3]);

        var cpuChipX = x0 + (L.cpuW - L.chipW) / 2;
        var chipY = top + L.qTop;
        var runAlpha = 0, runX = cpuChipX;
        if (run) {
            var ipr = preQ.indexOf(run.id), iwr = postQ.indexOf(run.id);
            if (ipr >= 0) { runX = lerp(ocsLaneX(ipr), cpuChipX, ez(pA)); runAlpha = 1; }
            else { runX = cpuChipX; runAlpha = ez(pA); }
            if (iwr >= 0) runX = lerp(runX, ocsLaneX(iwr), ez(pC));
            else runAlpha = runAlpha * (1 - ez(pC));
        }
        rr(x0, top + L.rowTop, L.cpuW, L.cpuH, 8, P.surf2,
           run && pB > 0 ? ocsCol(run.id) + 'cc' : P.border, 1.8);
        tx('CPU', x0 + L.cpuW / 2, top + L.rowTop + 11, fsS, P.sub, 'center', true);
        if (runAlpha > 0.01) ocsChip(runX, chipY, run.id, runAlpha);
        else tx('IDLE', cpuChipX + L.chipW / 2, chipY + L.chipH / 2, fsS, P.sub, 'center', true);
        tx('T = ' + Math.round(curT), x0 + L.cpuW / 2, top + L.clockY, fsS, P.sub, 'center', true);

        var ax0 = x0 + L.cX, axY = top + L.axisY;
        var every = L.unit >= 22 ? 1 : 2;
        ln(ax0, axY + 9, ax0 + L.cW, axY + 9, P.border, 1);
        for (var tt = 0; tt <= MAX_T; tt++) {
            var tkx = ax0 + tt * L.unit;
            ln(tkx, axY + 9, tkx, axY + 13, P.border, 1);
            if ((tt % every === 0 && (every === 1 || tt < MAX_T - 1)) || tt === MAX_T) {
                tx(String(tt), tkx, axY, fsS, P.sub, 'center', false);
            }
        }

        var rowY0 = top + L.rowsY;
        var rowStep = L.rowH + L.rowGap;
        PROCS.forEach(function (p, i) {
            var y = rowY0 + i * rowStep;
            var c = ocsCol(p.id);
            var hov = hoveredKey === p.id;
            rr(ax0, y, L.cW, L.rowH, 4, P.surf + 'aa', hov ? c + 'cc' : P.border, hov ? 1.8 : 1);
            tx(p.id, x0 + L.labelW - 6, y + L.rowH / 2, fsM, c, 'right', true);
            if (p.arrival > 0) {
                ln(ax0 + p.arrival * L.unit, y + 2, ax0 + p.arrival * L.unit, y + L.rowH - 2, c + '77', 1, [3, 3]);
            }
            tipHit(x0, y, w, L.rowH, p.id);
        });

        slots.forEach(function (s, k) {
            var pi = PROCS.findIndex(function (x) { return x.id === s.id; });
            var y = rowY0 + pi * rowStep;
            var frac = ghost ? 1 : (k < si ? 1 : (k === si ? pB : 0));
            if (frac <= 0) return;
            var bx = ax0 + s.start * L.unit, bw = (s.end - s.start) * L.unit * frac;
            ocsA(1);
            rr(bx, y + 2, bw, L.rowH - 4, 4, ocsCol(s.id) + 'ff');
            if (bw > 20) {
                ctx.save();
                ctx.beginPath(); ctx.rect(bx, y, bw, L.rowH); ctx.clip();
                tx(s.id, bx + bw / 2, y + L.rowH / 2, fsS, '#111111', 'center', true);
                ctx.restore();
            }
            if (!ghost && k === si && frac < 1) circ(bx + bw, y + L.rowH / 2, 4, P.text + 'ff');
            ctx.globalAlpha = 1;
        });

        if (!ghost) {
            var cx = ax0 + curT * L.unit;
            ln(cx, axY + 9, cx, rowY0 + L.ganttH - L.rowGap, P.text + '99', 1.2, [2, 3]);
        }

        var tblX = ax0, tblW = L.cW, sY = top + L.statY, sRowH = L.sRowH;
        var fsV = mob ? fsS : fsM;
        var cols = mob ? [0, 0.2, 0.42, 0.63, 0.82] : [0, 0.18, 0.36, 0.54, 0.72, 0.88];
        var heads = mob ? ['PID', 'Arr', 'Burst', 'Wait', 'TAT'] : ['Process', 'Arrival', 'Burst', 'Finish', 'Waiting', 'Turnaround'];
        rr(tblX, sY, tblW, sRowH, 4, P.surf2, P.border, 1);
        heads.forEach(function (h, ci) {
            tx(h, tblX + tblW * cols[ci] + (mob ? 4 : 6), sY + sRowH / 2, fsS, P.sub, 'left', true);
        });
        stats.forEach(function (st, i) {
            var ry = sY + sRowH * (i + 1);
            var c = ocsCol(st.id);
            var last = ocsLast(st.id, slots);
            var da = ghost ? 0 : (si >= N || si > last ? 1 : (si === last ? ez(pC) : 0));
            rr(tblX, ry, tblW, sRowH - 2, 2, P.surf, P.border, 1);
            if (da > 0) {
                ctx.globalAlpha = da;
                rr(tblX, ry, tblW, sRowH - 2, 2, c + '22', c + '77', 1);
                ctx.globalAlpha = 1;
            }
            var vals = mob ? [st.id, st.arrival, st.burst, st.waiting, st.turnaround]
                           : [st.id, st.arrival, st.burst, st.finish, st.waiting, st.turnaround];
            vals.forEach(function (v, ci) {
                var vx = tblX + tblW * cols[ci] + (mob ? 4 : 6), vy = ry + (sRowH - 2) / 2;
                if (ci === 0) { tx(String(v), vx, vy, fsV, c, 'left', true); return; }
                if (ci < 3) { tx(String(v), vx, vy, fsV, P.text, 'left', false); return; }
                if (da < 1) { ctx.globalAlpha = 1 - da; tx('-', vx, vy, fsV, P.sub, 'left', false); }
                if (da > 0) { ctx.globalAlpha = da; tx(String(v), vx, vy, fsV, P.text, 'left', false); }
                ctx.globalAlpha = 1;
            });
        });

        var avgA = !ghost && si >= N ? ez(t) : 0;
        if (avgA > 0) {
            var avgW = stats.reduce(function (s0, r) { return s0 + r.waiting; }, 0) / stats.length;
            var avgT = stats.reduce(function (s0, r) { return s0 + r.turnaround; }, 0) / stats.length;
            var ca = idx === 0 ? P.orange : idx === 1 ? P.green : P.purple;
            var ay = top + L.avgY;
            ctx.globalAlpha = avgA;
            rr(tblX, ay, tblW, L.avgH, 4, ca + '18', ca, 1.5);
            var al = lines('평균 대기: ' + avgW.toFixed(1) + 'ms    평균 반환: ' + avgT.toFixed(1) + 'ms', tblW - 12, fsS);
            var ay0 = ay + L.avgH / 2 - (al.length - 1) * L.lh / 2;
            al.forEach(function (s2, i2) { tx(s2, tblX + tblW / 2, ay0 + i2 * L.lh, fsS, ca, 'center', true); });
            ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('sched-viz__speed-btn--active'); });
        btn.classList.add('sched-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sched-viz__mode-btn--active', d.key === m); });
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