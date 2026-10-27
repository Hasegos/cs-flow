/**
 * I/O 방식 인터랙티브 시각화 시각화
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
    var root    = el('div', 'io-viz');
    var toolbar = el('div', 'io-viz__toolbar');
    var tbLeft  = el('div', 'io-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'io-viz__title', 'I/O Methods'));

    var modeWrap = el('div', 'io-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'io-viz__mode-btn' + (i === 0 ? ' io-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'io-viz__speed');
    speedWrap.appendChild(el('span', 'io-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'io-viz__speed-btn' + (i === 0 ? ' io-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'io-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'io-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'io-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'io-viz__controls');
    var btnPlay  = el('button', 'io-viz__btn io-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'io-viz__btn', '▶| STEP');
    var btnReset = el('button', 'io-viz__btn', '↺ RESET');
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

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n명령어를 실행하고 I/O를 요청하는 프로세서',
        BUS:  'System Bus\nCPU·메모리·장치가 데이터를 주고받는 통로',
        DEV:  'Device Controller\n실제 I/O 장치(디스크·키보드 등)를 제어하는 하드웨어',
        MEM:  'Memory (RAM)\n데이터가 최종적으로 저장되는 주기억장치',
        INTC: 'Interrupt Controller\n장치가 보내는 인터럽트 신호를 CPU에 전달하는 회로',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'PROGRAMMED I/O',
            result: 'pio',
            log:    'Step 1 — Programmed I/O: CPU가 장치 레지스터를 직접 반복 폴링합니다. I/O 완료까지 CPU는 다른 일을 못 하고 대기(Busy-Wait)합니다.',
            path:   ['CPU', 'BUS', 'DEV', 'BUS', 'CPU'],
            cols:   [P.purple, P.purple, P.orange, P.orange, P.purple],
            note:   'CPU BUSY-WAIT',
        },
        {
            badge:  'INTERRUPT-DRIVEN',
            result: 'irq',
            log:    'Step 2 — Interrupt-Driven I/O: CPU가 I/O를 요청한 뒤 다른 작업을 계속합니다. 장치가 완료되면 Interrupt Controller를 통해 CPU에 인터럽트를 보냅니다.',
            path:   ['CPU', 'BUS', 'DEV', 'DEV', 'INTC', 'CPU'],
            cols:   [P.purple, P.teal, P.teal, P.green, P.green, P.green],
            note:   'CPU FREE → IRQ',
        },
        {
            badge:  'DMA TRANSFER',
            result: 'dma-run',
            log:    'Step 3 — DMA: CPU는 DMA 컨트롤러(Device Controller 내장)에 전송을 위임합니다. DMA가 장치↔메모리 직접 전송을 수행하는 동안 CPU는 자유롭습니다.',
            path:   ['CPU', 'BUS', 'DEV', 'BUS', 'MEM'],
            cols:   [P.purple, P.yellow, P.yellow, P.yellow, P.yellow],
            note:   'CPU FREE → DMA runs',
        },
        {
            badge:  'DMA COMPLETE',
            result: 'dma-done',
            log:    'Step 4 — DMA 완료: 전송이 끝나면 DMA가 Interrupt Controller를 통해 CPU에 완료 인터럽트를 보냅니다. CPU는 결과만 확인합니다.',
            path:   ['DEV', 'INTC', 'CPU'],
            cols:   [P.green, P.green, P.purple],
            note:   'DMA DONE → IRQ',
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = TOOLTIPS;
    var IO_BLOCKS = 4;
    var IO_SUB = ['BUSY-WAIT', 'FREE → IRQ', 'FREE', 'IRQ만 처리'];
    var IO_BAR = ['orange', 'purple', 'purple', 'green'];
    var IO_NOTE = ['orange', 'green', 'yellow', 'green'];
    var IO_LBL = ['방식', 'CPU', '전송'];
    var IO_INFO = [
        ['Programmed I/O', 'Busy-Wait', 'CPU 직접'],
        ['Interrupt-Driven', 'Free→IRQ', 'CPU 직접'],
        ['DMA', 'Free', 'DMA 직접'],
        ['DMA', 'IRQ만 처리', '완료']
    ];

    /* ===================== 단계 계산 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 I/O 방식별 동작 과정을 확인하세요.'; }
    function ez(q) { var c = clamp01(q); return c * c * (3 - 2 * c); }
    function ioW(str, fs) {
        var n = 0, i;
        for (i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? fs : fs * 0.62;
        return n;
    }
    function ioState(idx, tt) {
        var o = { chips: [], cpuF: 0, devF: 0, slots: 0, polls: 0 };
        var i, k, a;
        if (idx === 0) {
            for (k = 0; k < 3; k++) {
                a = 0.05 + k * 0.3;
                if (tt >= a) o.polls++;
                if (tt >= a && tt < a + 0.14) o.chips.push({ r: 'down', f: ez(seg(tt, a, a + 0.14)), l: '요청', c: 'purple' });
                if (tt >= a + 0.16 && tt < a + 0.3) o.chips.push({ r: 'up', f: ez(seg(tt, a + 0.16, a + 0.3)), l: '대기', c: 'orange' });
            }
            o.cpuF = 1;
            o.devF = 0.5 * tt;
        } else if (idx === 1) {
            if (tt < 0.22) o.chips.push({ r: 'down', f: ez(seg(tt, 0, 0.22)), l: '요청', c: 'purple' });
            if (tt >= 0.6 && tt < 0.78) o.chips.push({ r: 'di', f: ez(seg(tt, 0.6, 0.78)), l: 'IRQ', c: 'green' });
            if (tt >= 0.78 && tt < 0.95) o.chips.push({ r: 'irq', f: ez(seg(tt, 0.78, 0.95)), l: 'IRQ', c: 'green' });
            o.devF = seg(tt, 0.22, 0.6);
            o.cpuF = 0.2 + 0.5 * seg(tt, 0.2, 0.9);
        } else if (idx === 2) {
            if (tt < 0.2) o.chips.push({ r: 'down', f: ez(seg(tt, 0, 0.2)), l: '설정', c: 'purple' });
            for (i = 0; i < IO_BLOCKS; i++) {
                a = 0.25 + i * 0.15;
                if (tt >= a && tt < a + 0.22) o.chips.push({ r: 'dm', f: ez(seg(tt, a, a + 0.22)), l: '블록', c: 'yellow' });
                if (tt >= a + 0.22) o.slots++;
                o.devF += seg(tt, a, a + 0.22) / IO_BLOCKS;
            }
            o.cpuF = 0.25 + 0.5 * seg(tt, 0.2, 1);
        } else if (idx === 3) {
            if (tt < 0.4) o.chips.push({ r: 'di', f: ez(seg(tt, 0, 0.4)), l: 'IRQ', c: 'green' });
            else if (tt < 0.8) o.chips.push({ r: 'irq', f: ez(seg(tt, 0.4, 0.8)), l: 'IRQ', c: 'green' });
            o.devF = 1;
            o.slots = IO_BLOCKS;
            o.cpuF = 0.25 + 0.25 * seg(tt, 0.8, 1);
        }
        return o;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var gx = mob ? 18 : 56;
        var cw = (w - gx) / 2;
        var hB = mob ? 50 : 58;
        var yT = (mob ? 20 : 24) + (mob ? 22 : 30);
        var busH = mob ? 16 : 18;
        var gapV = mob ? 20 : 26;
        var busY = yT + hB + gapV;
        var yB = busY + busH + gapV;
        var noteY = yB + hB + (mob ? 14 : 18);
        var infoY = noteY + (mob ? 12 : 14);
        var rowH = mob ? 18 : 22;
        return {
            mob: mob, w: w, hB: hB, busH: busH, busY: busY, busMid: busY + busH / 2,
            xL: cw / 2, xR: cw + gx + cw / 2, noteY: noteY, infoY: infoY,
            rowH: rowH, infoH: rowH * 3 + (mob ? 10 : 14),
            CPU:  { x: 0, y: yT, w: cw, h: hB },
            INTC: { x: cw + gx, y: yT, w: cw, h: hB },
            DEV:  { x: 0, y: yB, w: cw, h: hB },
            MEM:  { x: cw + gx, y: yB, w: cw, h: hB }
        };
    }
    function sceneH(w, mob) {
        var L = layout(w, mob);
        return L.infoY + L.infoH;
    }
    function ioShift(L, x0, top) {
        var o = {}, k;
        for (k in L) o[k] = L[k];
        o.xL = L.xL + x0; o.xR = L.xR + x0;
        o.busY = L.busY + top; o.busMid = L.busMid + top;
        o.noteY = L.noteY + top; o.infoY = L.infoY + top;
        ['CPU', 'INTC', 'DEV', 'MEM'].forEach(function (n) {
            o[n] = { x: L[n].x + x0, y: L[n].y + top, w: L[n].w, h: L[n].h };
        });
        return o;
    }
    function ioRoutes(L) {
        var xl = L.xL, xr = L.xR, bm = L.busMid;
        var ct = L.CPU.y + L.hB, dt = L.DEV.y, it = L.INTC.y + L.hB;
        return {
            down: [[xl, ct], [xl, dt]],
            up:   [[xl, dt], [xl, ct]],
            dm:   [[xl, dt], [xl, bm], [xr, bm], [xr, dt]],
            di:   [[xl, dt], [xl, bm], [xr, bm], [xr, it]],
            irq:  [[xr, it], [xr, bm], [xl, bm], [xl, ct]]
        };
    }
    function ioPolyAt(pts, f) {
        var lens = [], total = 0, i;
        for (i = 0; i < pts.length - 1; i++) {
            lens.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
            total += lens[i];
        }
        var want = clamp01(f) * total;
        for (i = 0; i < lens.length; i++) {
            if (want <= lens[i] || i === lens.length - 1) {
                var k = lens[i] ? Math.min(1, want / lens[i]) : 0;
                return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
            }
            want -= lens[i];
        }
        return pts[0];
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function ioNode(n, key, title, sub, colKey, isOn, mob) {
        var c = P[colKey];
        var hov = hoveredKey === key;
        rr(n.x, n.y, n.w, n.h, 8, isOn ? c + '28' : P.surf, hov ? P.purple : (isOn ? c : P.border), isOn ? 2.2 : 1.4);
        tx(title, n.x + (mob ? 8 : 12), n.y + (mob ? 9 : 14), mob ? 12 : 15, (isOn ? c : P.text) + 'ff', 'left', true);
        tx(sub, n.x + (mob ? 8 : 12), n.y + (mob ? 22 : 31), mob ? 11 : 12, P.sub + 'ff', 'left', false);
    }
    function ioBar(x, y, bw, bh, f, colKey) {
        rr(x, y, bw, bh, bh / 2, P.surf2, null);
        if (f > 0.005) rr(x, y, bw * clamp01(f), bh, bh / 2, P[colKey] + 'ff', null);
    }
    function ioSlots(n, filled, mob) {
        var sz = mob ? 8 : 12, gp = mob ? 4 : 6;
        var y = n.y + (mob ? 36 : 42), x = n.x + (mob ? 8 : 12);
        for (var i = 0; i < IO_BLOCKS; i++) {
            var full = i < filled;
            rr(x + i * (sz + gp), y, sz, sz, 2, full ? P.yellow + 'ff' : P.surf2, full ? null : P.border, 1);
        }
    }
    function ioChip(x, y, label, colKey) {
        var cw2 = ioW(label, 11) + 12;
        rr(x - cw2 / 2, y - 8, cw2, 16, 8, P[colKey] + 'ff', null);
        tx(label, x, y, 11, '#111111', 'center', true);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var idx = step ? steps.indexOf(step) : -1;
        var s = step || steps[0];
        var tt = step && prev !== step ? t : 1;
        var idle = idx < 0;
        var L = ioShift(layout(w, mob), x0, top);
        var R = ioRoutes(L);
        var st = ioState(idx, tt);
        var px = mob ? 8 : 12;
        var by = mob ? 37 : 44;
        var bht = mob ? 5 : 6;
        var bh = mob ? 20 : 24;
        var bt = idle ? 'IDLE' : s.badge;
        var bw = ioW(bt, 11) + 28;
        var i, p, ry;
        var on = function (k) { return !idle && s.path.indexOf(k) >= 0; };

        rr(x0 + (w - bw) / 2, top, bw, bh, bh / 2, idle ? P.surf2 : P.purple + '33', idle ? P.border : P.purple + '99', 1);
        tx(bt, x0 + w / 2, top + bh / 2, 11, (idle ? P.sub : P.text) + 'ff', 'center', true);

        rr(x0, L.busY, w, L.busH, L.busH / 2, P.teal + '22', hoveredKey === 'BUS' ? P.purple : (on('BUS') ? P.teal : P.border), 1.2);
        tx('System Bus', x0 + w / 2, L.busY + L.busH + (mob ? 10 : 13), 11, P.teal + 'ff', 'center', true);

        ln(L.xL, L.CPU.y + L.hB, L.xL, L.busY, P.border, 1.4, [4, 4]);
        ln(L.xL, L.busY + L.busH, L.xL, L.DEV.y, P.border, 1.4, [4, 4]);
        ln(L.xR, L.INTC.y + L.hB, L.xR, L.busY, P.border, 1.4, [4, 4]);
        ln(L.xR, L.busY + L.busH, L.xR, L.MEM.y, P.border, 1.4, [4, 4]);

        ioNode(L.CPU, 'CPU', 'CPU', idle ? 'Processor' : IO_SUB[idx], 'purple', on('CPU'), mob);
        ioBar(L.CPU.x + px, L.CPU.y + by, L.CPU.w - px * 2, bht, st.cpuF, idle ? 'purple' : IO_BAR[idx]);
        ioNode(L.INTC, 'INTC', 'INTC', mob ? 'IRQ Ctrl' : 'Interrupt Ctrl', 'green', on('INTC'), mob);
        ioNode(L.DEV, 'DEV', 'DEV', mob ? 'Dev Ctrl' : 'Device Controller', 'orange', on('DEV'), mob);
        ioBar(L.DEV.x + px, L.DEV.y + by, L.DEV.w - px * 2, bht, st.devF, 'orange');
        ioNode(L.MEM, 'MEM', 'MEM', mob ? 'RAM' : 'Memory (RAM)', 'yellow', on('MEM'), mob);
        ioSlots(L.MEM, st.slots, mob);

        for (i = 0; i < st.chips.length; i++) {
            p = ioPolyAt(R[st.chips[i].r], st.chips[i].f);
            ioChip(p[0], p[1], st.chips[i].l, st.chips[i].c);
        }
        if (idx === 0) tx('폴링 ' + Math.max(1, st.polls) + '회', L.xL + 22, (L.CPU.y + L.hB + L.busY) / 2, 11, P.orange + 'ff', 'left', true);
        if (!idle) tx(s.note, x0 + w / 2, L.noteY, mob ? 11 : 12, P[IO_NOTE[idx]] + 'ff', 'center', true);

        rr(x0, L.infoY, w, L.infoH, 8, P.surf2, P.purple + '55', 1.2);
        for (i = 0; i < 3; i++) {
            ry = L.infoY + (mob ? 5 : 7) + L.rowH * i + L.rowH / 2;
            tx(IO_LBL[i], x0 + 12, ry, mob ? 11 : 12, P.sub + 'ff', 'left', false);
            tx(idle ? '—' : IO_INFO[idx][i], x0 + w - 12, ry, mob ? 11 : 13, P.text + 'ff', 'right', true);
        }

        tipBadge(L.CPU.x + L.CPU.w - 11, L.CPU.y + 11, 'CPU');
        tipBadge(L.INTC.x + L.INTC.w - 11, L.INTC.y + 11, 'INTC');
        tipBadge(L.DEV.x + L.DEV.w - 11, L.DEV.y + 11, 'DEV');
        tipBadge(L.MEM.x + L.MEM.w - 11, L.MEM.y + 11, 'MEM');
        tipBadge(x0 + w - 10, L.busMid, 'BUS');
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
        speedBtns.forEach(function (b) { b.classList.remove('io-viz__speed-btn--active'); });
        btn.classList.add('io-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('io-viz__mode-btn--active', d.key === m); });
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