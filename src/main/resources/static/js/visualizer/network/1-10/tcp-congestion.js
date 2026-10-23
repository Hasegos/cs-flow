/**
 * TCP 혼잡 제어 시각화
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
    var root    = el('div', 'tc-viz');
    var toolbar = el('div', 'tc-viz__toolbar');
    var tbLeft  = el('div', 'tc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tc-viz__title', 'TCP Congestion Control'));

    var modeWrap = el('div', 'tc-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tc-viz__mode-btn' + (i === 0 ? ' tc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tc-viz__speed');
    speedWrap.appendChild(el('span', 'tc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tc-viz__speed-btn' + (i === 0 ? ' tc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tc-viz__controls');
    var btnPlay  = el('button', 'tc-viz__btn tc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tc-viz__btn', '↺ RESET');
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
    var mode    = '';
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

    /* ===================== 시나리오 정의 ===================== */
    var STEPS = [
        { rtt:  1, cwnd:  1, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 1 — Slow Start 시작. cwnd=1 MSS. 연결 초기에는 네트워크 상태를 모르므로 작게 시작합니다. ACK를 받을 때마다 cwnd를 1씩 늘려 RTT마다 2배 증가합니다.' },
        { rtt:  2, cwnd:  2, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 2 — cwnd=2. Slow Start: ACK 1개당 cwnd+1. RTT 내 2개 ACK → cwnd 2 증가(1→2). 지수적 증가 시작.' },
        { rtt:  3, cwnd:  4, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 3 — cwnd=4. 지수 증가 계속. 아직 ssthresh(16)에 못 미쳐 Slow Start 유지.' },
        { rtt:  4, cwnd:  8, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 4 — cwnd=8. 2배씩 빠르게 증가. ssthresh=16까지 2배 더 가면 도달합니다.' },
        { rtt:  5, cwnd: 16, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 5 — cwnd=16, ssthresh=16 도달! Slow Start에서 Congestion Avoidance로 전환합니다. 이제부터 선형 증가합니다.' },

        { rtt:  6, cwnd: 17, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 6 — Congestion Avoidance 시작. cwnd=17. RTT마다 +1 MSS씩만 증가합니다. 네트워크 한계에 조심스럽게 접근합니다.' },
        { rtt:  7, cwnd: 18, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 7 — cwnd=18. 선형 증가 중. 천천히 네트워크 용량 탐색.' },
        { rtt:  8, cwnd: 19, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 8 — cwnd=19. 계속 선형 증가.' },
        { rtt:  9, cwnd: 20, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 9 — cwnd=20.' },

        { rtt: 10, cwnd: 21, ssthresh: 16, phase: 'CA', event: '3dup',
          log: 'RTT 10 — ⚠ 3개 중복 ACK 감지! 패킷 손실 발생. Fast Retransmit: 즉시 재전송. ssthresh = cwnd/2 = 10, cwnd = ssthresh = 10으로 감소. Fast Recovery로 진입합니다.' },
        { rtt: 11, cwnd: 10, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 11 — Fast Recovery 후 cwnd=10, ssthresh=10. Slow Start 없이 바로 Congestion Avoidance로 복귀. 선형 증가 재개.' },
        { rtt: 12, cwnd: 11, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 12 — cwnd=11. CA 선형 증가.' },
        { rtt: 13, cwnd: 12, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 13 — cwnd=12.' },
        { rtt: 14, cwnd: 13, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 14 — cwnd=13. 안정적으로 증가 중.' },

        { rtt: 15, cwnd: 14, ssthresh: 10, phase: 'CA', event: 'timeout',
          log: 'RTT 15 — ⚠ 타임아웃 발생! 더 심각한 혼잡 신호. 다음 RTT에 ssthresh = cwnd/2 = 7, cwnd = 1로 리셋하고 Slow Start부터 재시작합니다. 3-Dup ACK보다 훨씬 큰 패널티입니다.' },
        { rtt: 16, cwnd:  1, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 16 — Slow Start 재시작. cwnd=1, ssthresh=7. 타임아웃 후에는 항상 cwnd=1부터 시작합니다.' },
        { rtt: 17, cwnd:  2, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 17 — cwnd=2. 지수 증가 재개.' },
        { rtt: 18, cwnd:  4, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 18 — cwnd=4.' },
        { rtt: 19, cwnd:  7, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 19 — cwnd=7, ssthresh=7 도달. 다시 CA로 전환. AIMD 사이클이 반복됩니다 ✓' ,
          done: true },
    ];

    var MAX_RTT  = STEPS[STEPS.length - 1].rtt;
    var MAX_CWND = 24; /* Y축 최대값 */

    let pktMoving = false;
    let animProg  = 1;

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 TCP 혼잡 제어 동작을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function tcIn(fresh, t, a, b) {
        return fresh ? ez(seg(t, a, b)) : 1;
    }

    /* ===================== 단계 해석 ===================== */
    function tcFr(i) {
        return STEPS[i].event === '3dup' || (i > 0 && STEPS[i - 1].event === '3dup');
    }
    function tcKey(i) {
        if (tcFr(i)) return 'fr';
        return STEPS[i].phase === 'SS' ? 'ss' : 'ca';
    }
    function tcCol(key) {
        if (key === 'ss') return P.purple;
        if (key === 'fr') return P.orange;
        return P.teal;
    }
    function tcRuns(cur) {
        var runs = [];
        for (var i = 0; i < cur; i++) {
            var k = tcKey(i);
            var last = runs[runs.length - 1];
            if (last && last.key === k) last.to = i + 1;
            else runs.push({ key: k, from: i + 1, to: i + 1 });
        }
        return runs;
    }
    function tcNote(i) {
        var s = STEPS[i];
        var p = i > 0 ? STEPS[i - 1] : s;
        if (s.event === '3dup') return ['3-Dup ACK → 빠른 재전송', P.red];
        if (s.event === 'timeout') return ['Timeout → 다음 RTT에 cwnd 1로 리셋', P.red];
        if (p.ssthresh !== s.ssthresh) return ['ssthresh ' + p.ssthresh + ' → ' + s.ssthresh, P.orange];
        if (p.phase === 'SS' && s.phase === 'CA') return ['cwnd ≥ ssthresh → CA 진입', P.teal];
        if (s.phase === 'SS') return ['Slow Start: ACK마다 +1', P.purple];
        return ['CA: RTT마다 +1', P.teal];
    }

    /* ===================== 레이아웃 ===================== */
    function tcLegend(w, mob) {
        var fs = mob ? 11 : 12;
        var list = [['ss', 'Slow Start'], ['ca', 'Congestion Avoidance'], ['fr', 'Fast Recovery'], ['sst', 'ssthresh=00']];
        ctx.font = '500 ' + fs + 'px "JetBrains Mono",monospace';
        var items = [];
        var x = 0;
        var row = 0;
        list.forEach(function (it) {
            var iw = ctx.measureText(it[1]).width + 18;
            if (x > 0 && x + iw > w) { x = 0; row++; }
            items.push({ key: it[0], label: it[1], x: x, row: row });
            x += iw + 12;
        });
        return { items: items, rows: row + 1 };
    }
    function layout(w, mob) {
        var lg = tcLegend(w, mob);
        var capH = mob ? 16 : 18;
        var cellH = mob ? 14 : 18;
        var ackH = mob ? 12 : 14;
        var noteH = mob ? 16 : 18;
        var legH = mob ? 16 : 18;
        var gh = mob ? 120 : 184;
        var yCell = capH + 6;
        var yAck = yCell + cellH + 6;
        var yNote = yAck + ackH + 4;
        var yPlot = yNote + noteH + 8;
        var yTick = yPlot + gh + 9;
        var yAxis = yTick + (mob ? 14 : 16);
        var yLeg = yAxis + (mob ? 14 : 16) + 4;
        return {
            mob: mob, padL: mob ? 26 : 44, padR: mob ? 8 : 14, strip: 14,
            capH: capH, cellH: cellH, ackH: ackH, noteH: noteH, legH: legH, gh: gh,
            yCell: yCell, yAck: yAck, yNote: yNote, yPlot: yPlot,
            yTick: yTick, yAxis: yAxis, yLeg: yLeg,
            total: yLeg + lg.rows * legH + 4
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var s = step || STEPS[0];
        var fresh = !!step && !!prev && prev !== step;
        var p = fresh ? prev : s;
        var e = fresh ? ez(t) : 1;
        var cur = s.rtt;
        var fs = mob ? 11 : 12;
        var fsAx = 11;
        var gx = x0 + L.padL;
        var gW = w - L.padL - L.padR;
        var y0 = top + L.yPlot;
        var gy = y0 + L.strip;
        var gH = L.gh - L.strip;
        var gB = gy + gH;
        var slot = gW / MAX_CWND;
        var half = gW / (MAX_RTT - 1) / 2;
        function toX(r) { return gx + (r - 1) / (MAX_RTT - 1) * gW; }
        function toY(c) { return gy + (1 - c / MAX_CWND) * gH; }

        var cwndNow = lerp(p.cwnd, s.cwnd, e);
        var sstNow = lerp(p.ssthresh, s.ssthresh, e);
        var col = tcCol(tcKey(cur - 1));
        var lossA = s.event ? tcIn(fresh, t, 0.25, 0.7) : (fresh && p.event ? 1 - ez(seg(t, 0, 0.5)) : 0);
        var ackA = s.event === '3dup' ? tcIn(fresh, t, 0.05, 0.3) : (fresh && p.event === '3dup' ? 1 - ez(seg(t, 0, 0.4)) : 0);
        var ghost = !step;

        tx('송신 윈도우 (MSS)', x0, top + L.capH / 2, fs, P.sub + 'ff', 'left', false);
        tx('cwnd=' + Math.round(cwndNow), x0 + w, top + L.capH / 2, fs, col + 'ff', 'right', true);

        var cy = top + L.yCell;
        for (var i = 0; i < MAX_CWND; i++) {
            var cx = gx + i * slot + 0.8;
            var cw = slot - 1.6;
            rr(cx, cy, cw, L.cellH, 2, null, P.muted + '99', 1);
            if (ghost) {
                ctx.globalAlpha = 0.12;
                rr(cx, cy, cw, L.cellH, 2, P.muted + 'ff', null);
                ctx.globalAlpha = 1;
            }
            var f = clamp01(cwndNow - i);
            if (f > 0) {
                ctx.globalAlpha = f;
                rr(cx, cy, cw, L.cellH, 2, col + 'ff', null);
                ctx.globalAlpha = 1;
            }
        }
        if (lossA > 0) {
            ctx.globalAlpha = lossA;
            rr(gx - 1.5, cy - 2, slot + 1, L.cellH + 4, 3, null, P.red + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        var yAck = top + L.yAck + L.ackH / 2;
        if (ackA > 0) {
            ctx.globalAlpha = ackA;
            ln(gx, yAck, gx + gW, yAck, P.muted + 'aa', 1, [3, 3]);
            for (var k = 0; k < 3; k++) {
                var q = s.event === '3dup' && fresh ? ez(seg(t, 0.1 + k * 0.12, 0.6 + k * 0.12)) : 1;
                var xs = gx + gW - slot * 0.5;
                var xe = gx + slot * 0.5 + k * 7;
                circ(lerp(xs, xe, q), yAck, mob ? 4 : 5, P.yellow + 'ff', null);
            }
            ctx.globalAlpha = 1;
        }

        var nt = tcNote(cur - 1);
        var noteA = s.event ? tcIn(fresh, t, 0.3, 0.75) : 1;
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        var nw = ctx.measureText(nt[0]).width + 18;
        var ny = top + L.yNote;
        ctx.globalAlpha = noteA;
        rr(x0 + (w - nw) / 2, ny, nw, L.noteH, 6, nt[1] + '22', nt[1] + '99', 1.2);
        tx(nt[0], x0 + w / 2, ny + L.noteH / 2, fs, nt[1] + 'ff', 'center', true);
        ctx.globalAlpha = 1;

        var runs = tcRuns(ghost ? MAX_RTT : cur);
        runs.forEach(function (rn) {
            var bc = tcCol(rn.key);
            var bx1 = Math.max(gx, toX(rn.from) - half);
            var bx2 = Math.min(gx + gW, toX(rn.to) + half);
            ctx.fillStyle = bc + '18';
            ctx.fillRect(bx1, y0, bx2 - bx1, L.gh);
            var full = rn.key === 'ss' ? 'Slow Start' : (rn.key === 'fr' ? 'Fast Recovery' : 'Congestion Avoidance');
            var short = rn.key === 'ss' ? 'SS' : (rn.key === 'fr' ? 'FR' : 'CA');
            ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
            var nm = ctx.measureText(full).width + 8 <= bx2 - bx1 ? full : short;
            var nhw = ctx.measureText(nm).width / 2;
            var ncx = Math.max(gx + nhw, Math.min(gx + gW - nhw, (bx1 + bx2) / 2));
            tx(nm, ncx, y0 + L.strip / 2, fs, bc + 'ff', 'center', true);
        });

        [8, 16, 24].forEach(function (v) {
            var yv = toY(v);
            ln(gx, yv, gx + gW, yv, P.muted + '55', 1, [3, 4]);
            tx(String(v), gx - 4, yv, fsAx, P.sub + 'ff', 'right', false);
        });
        tx('0', gx - 4, gB, fsAx, P.sub + 'ff', 'right', false);
        ln(gx, y0, gx, gB, P.muted + 'cc', 1.5);
        ln(gx, gB, gx + gW, gB, P.muted + 'cc', 1.5);

        var sy = toY(sstNow);
        ln(gx, sy, gx + gW, sy, P.orange + (ghost ? 'cc' : 'aa'), 1.5, [6, 4]);

        if (ghost) {
            for (var gr = 1; gr < MAX_RTT; gr++) {
                ln(toX(gr), toY(STEPS[gr - 1].cwnd), toX(gr + 1), toY(STEPS[gr].cwnd), P.muted + '77', 1.5, [4, 4]);
            }
            for (var gq = 1; gq <= MAX_RTT; gq++) {
                circ(toX(gq), toY(STEPS[gq - 1].cwnd), 3, P.muted + '99', null);
            }
        }

        for (var r = 1; r < cur; r++) {
            var a = STEPS[r - 1];
            var g = r === cur - 1 ? e : 1;
            var x1 = toX(r), y1 = toY(a.cwnd), x2 = toX(r + 1), y2 = toY(STEPS[r].cwnd);
            if (a.event) ln(x1, y1, x1 + (x2 - x1) * g, y1 + (y2 - y1) * g, P.red + 'cc', 2, [4, 3]);
            else ln(x1, y1, x1 + (x2 - x1) * g, y1 + (y2 - y1) * g, tcCol(tcKey(r - 1)) + 'ee', 2.5);
        }
        for (var q2 = 1; q2 < cur; q2++) {
            var pt = STEPS[q2 - 1];
            circ(toX(q2), toY(pt.cwnd), pt.event ? 6 : 4, (pt.event ? P.red : tcCol(tcKey(q2 - 1))) + 'cc', null);
        }
        var hx = toX(cur - (1 - e));
        var hy = toY(cwndNow);
        var hc = s.event ? P.red : col;
        circ(hx, hy, 9, null, hc + '55', 2);
        circ(hx, hy, 4.5, hc + 'ff', null);

        [1, 5, 10, 15, 19].forEach(function (r) {
            tx(String(r), toX(r), top + L.yTick + 6, fsAx, P.sub + 'ff', 'center', false);
        });
        tx('RTT', gx + gW / 2, top + L.yAxis + 6, fsAx, P.sub + 'ff', 'center', false);

        var lg = tcLegend(w, mob);
        var ly0 = top + L.yLeg;
        lg.items.forEach(function (it) {
            var lx = x0 + it.x;
            var ly = ly0 + it.row * L.legH + L.legH / 2;
            if (it.key === 'sst') {
                ln(lx, ly, lx + 12, ly, P.orange + 'ff', 2, [4, 3]);
                tx('ssthresh=' + Math.round(sstNow), lx + 18, ly, fs, P.sub + 'ff', 'left', false);
            } else {
                rr(lx, ly - 4, 9, 9, 2, tcCol(it.key) + 'ff', null);
                tx(it.label, lx + 18, ly, fs, P.sub + 'ff', 'left', false);
            }
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
        speedBtns.forEach(function (b) { b.classList.remove('tc-viz__speed-btn--active'); });
        btn.classList.add('tc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tc-viz__mode-btn--active', d.key === m); });
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