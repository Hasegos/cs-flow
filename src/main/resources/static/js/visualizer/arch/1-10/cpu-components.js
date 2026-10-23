/**
 * CPU 구성 요소 인터랙티브 시각화 시각화
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
    var root    = el('div', 'cpu');
    var toolbar = el('div', 'cpu__toolbar');
    var tbLeft  = el('div', 'cpu__toolbar-left');
    tbLeft.appendChild(el('span', 'cpu__title', 'CPU Components'));

    var modeWrap = el('div', 'cpu__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cpu__mode-btn' + (i === 0 ? ' cpu__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cpu__speed');
    speedWrap.appendChild(el('span', 'cpu__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cpu__speed-btn' + (i === 0 ? ' cpu__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cpu__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cpu__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cpu__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cpu__controls');
    var btnPlay  = el('button', 'cpu__btn cpu__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cpu__btn', '▶| STEP');
    var btnReset = el('button', 'cpu__btn', '↺ RESET');
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

    /* ===================== 시뮬레이션 데이터 ===================== */
    const STEPS = [
        { active:'PC',  flow:null,                   regs:{PC:'0x04',IR:'—',      MAR:'—',    MDR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[PC] 다음 명령어 주소 0x04를 MAR로 전달합니다.' },
        { active:'MAR', flow:{from:'PC',  to:'MAR'}, regs:{PC:'0x04',IR:'—',      MAR:'0x04', MDR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MAR] 메모리 주소 0x04 저장 완료. 메모리에서 명령어를 읽습니다.' },
        { active:'MDR', flow:{from:'MEM', to:'MDR'}, regs:{PC:'0x04',IR:'—',      MAR:'0x04', MDR:'ADD 0x10',ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MDR] 메모리[0x04]에서 명령어 "ADD 0x10"을 읽어 MDR에 저장했습니다.' },
        { active:'IR',  flow:{from:'MDR', to:'IR'},  regs:{PC:'0x05',IR:'ADD 0x10', MAR:'0x04', MDR:'ADD 0x10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[IR → CU] 명령어를 IR에 적재. CU가 명령어를 해석합니다.' },
        { active:'MAR', flow:{from:'CU',  to:'MAR'}, regs:{PC:'0x05',IR:'ADD 0x10', MAR:'0x10', MDR:'ADD 0x10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[CU → MAR] CU가 피연산자 주소 0x10을 MAR로 전달합니다.' },
        { active:'MDR', flow:{from:'MEM', to:'MDR'}, regs:{PC:'0x05',IR:'ADD 0x10', MAR:'0x10', MDR:'3',     ACC:'5'}, alu:false, cu:false, badge:'EXECUTE', log:'[메모리 → MDR] 메모리[0x10] = 3 읽기 완료.' },
        { active:'ALU', flow:{from:'MDR', to:'ALU'}, regs:{PC:'0x05',IR:'ADD 0x10', MAR:'0x10', MDR:'3',     ACC:'5'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU] ACC(5) + MDR(3) 덧셈 연산 수행 중...' },
        { active:'ACC', flow:{from:'ALU', to:'ACC'}, regs:{PC:'0x05',IR:'ADD 0x10', MAR:'0x10', MDR:'3',     ACC:'8'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU → ACC] 연산 결과 8이 ACC에 저장되었습니다. 완료!', done:true },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = {
        'PC':  'Program Counter\n다음에 실행할 명령어의 메모리 주소를 보관',
        'IR':  'Instruction Register\n인출한 명령어를 보관',
        'MAR': 'Memory Address Register\n메모리에 접근할 주소를 임시 저장',
        'MDR': 'Memory Data Register\n메모리와 주고받는 데이터를 임시 저장',
        'ACC': 'Accumulator\n연산 중간 결과를 임시 저장',
        'ALU': 'Arithmetic Logic Unit\n산술·논리 연산을 수행하는 회로',
        'CU':  'Control Unit\n명령어를 해석하고 각 장치를 제어'
    };
    var CPU_PH = ['FETCH', 'DECODE', 'EXECUTE'];
    var CPU_REGS = [
        { id: 'PC',  lbl: 'PC',  ck: 'orange' },
        { id: 'IR',  lbl: 'IR',  ck: 'teal' },
        { id: 'MAR', lbl: 'MAR', ck: 'purple' },
        { id: 'MDR', lbl: 'MDR', ck: 'purple' },
        { id: 'ACC', lbl: 'ACC', ck: 'teal' }
    ];
    var CPU_MEM = [
        { addr: '0x04', val: 'ADD 0x10' },
        { addr: '0x10', val: '3' }
    ];
    var CPU_ARR = 0.8;

    /* ===================== 단계 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 CPU 구성 요소의 동작을 확인하세요.'; }
    function ez(q) { var c = clamp01(q); return c * c * (3 - 2 * c); }
    function cpuHx(a) { var v = Math.round(clamp01(a) * 255); return (v < 16 ? '0' : '') + v.toString(16); }
    function cpuTw(str, sz) {
        var w = 0;
        for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 127 ? sz : sz * 0.62;
        return w;
    }
    function cpuPhaseA(name, idle, cur, pv, tt) {
        if (idle) return 0;
        if (pv && pv.badge !== cur.badge) {
            if (name === cur.badge) return tt;
            if (name === pv.badge) return 1 - tt;
            return 0;
        }
        return name === cur.badge ? 1 : 0;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var g = { w: w, mob: mob };
        g.cpuTop = mob ? 30 : 38;
        g.hdrH = mob ? 22 : 26;
        g.rH = mob ? 34 : 46;
        g.rVGap = 6;
        g.rp = 8;
        g.rGap = 6;
        g.lblW = mob ? 34 : 46;
        g.rTop = g.cpuTop + g.hdrH + 8;
        g.cpuW = mob ? w - 22 : Math.floor(w * 0.6);
        g.rW = (g.cpuW - g.rp * 2 - g.rGap) / 2;
        var rowY = function (i) { return g.rTop + i * (g.rH + g.rVGap); };
        g.reg = {
            PC:  { x: g.rp,                 y: rowY(0), w: g.rW },
            IR:  { x: g.rp + g.rW + g.rGap, y: rowY(0), w: g.rW },
            MAR: { x: g.rp,                 y: rowY(1), w: g.rW },
            MDR: { x: g.rp + g.rW + g.rGap, y: rowY(1), w: g.rW },
            ACC: { x: g.rp,                 y: rowY(2), w: g.cpuW - g.rp * 2 }
        };
        g.uH = mob ? 32 : 40;
        g.uTop = rowY(3);
        g.unit = {
            ALU: { x: g.rp,                 y: g.uTop, w: g.rW, h: g.uH },
            CU:  { x: g.rp + g.rW + g.rGap, y: g.uTop, w: g.rW, h: g.uH }
        };
        g.cpuBot = g.uTop + g.uH + 8;
        g.mdrCy = g.reg.MDR.y + g.rH / 2;
        g.mHdr = mob ? 22 : 26;
        g.mRowH = mob ? 30 : 40;
        g.mRowGap = mob ? 6 : 8;
        g.mH = g.mHdr + 2 * g.mRowH + g.mRowGap + 10;
        if (mob) {
            g.memX = 0;
            g.memW = w;
            g.memY = g.cpuBot + 30;
            g.busX = w - 11;
            g.rowX = 8;
            g.rowW = w - 38;
            g.mAx = g.rowX + g.rowW;
        } else {
            g.memX = g.cpuW + 64;
            g.memW = w - g.memX;
            g.memY = g.mdrCy - g.mH / 2;
            g.busX = g.cpuW + 32;
            g.rowX = g.memX + 6;
            g.rowW = g.memW - 12;
            g.mAx = g.rowX;
        }
        g.mRows = [];
        for (var i = 0; i < 2; i++) g.mRows.push(g.memY + g.mHdr + 4 + i * (g.mRowH + g.mRowGap));
        g.H = Math.max(g.cpuBot, g.memY + g.mH) + 8;
        return g;
    }
    function sceneH(w, mob) { return layout(w, mob).H; }

    /* ===================== 선과 경로 ===================== */
    function cpuPoly(pts, col, lw, dash) {
        ctx.beginPath();
        ctx.setLineDash(dash || []);
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function cpuAlong(pts, p) {
        var total = 0, i, sl;
        for (i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        var d = p * total;
        for (i = 1; i < pts.length; i++) {
            sl = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (d <= sl || i === pts.length - 1) {
                var q = sl > 0 ? clamp01(d / sl) : 1;
                return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * q, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * q };
            }
            d -= sl;
        }
        return pts[pts.length - 1];
    }
    function cpuEnd(g, ox, oy, key) {
        if (g.reg[key]) return { x: ox + g.reg[key].x + g.reg[key].w / 2, y: oy + g.reg[key].y + g.rH / 2 };
        var u = g.unit[key];
        return { x: ox + u.x + u.w / 2, y: oy + u.y + u.h / 2 };
    }
    function cpuRoute(g, ox, oy, fl, cur) {
        if (fl.from === 'MEM') {
            var ri = cur.regs.MAR === CPU_MEM[1].addr ? 1 : 0;
            var rY = oy + g.mRows[ri] + g.mRowH / 2;
            var mdrR = ox + g.reg.MDR.x + g.reg.MDR.w;
            var mdrY = oy + g.mdrCy;
            return [
                { x: ox + g.mAx, y: rY },
                { x: ox + g.busX, y: rY },
                { x: ox + g.busX, y: mdrY },
                { x: mdrR, y: mdrY }
            ];
        }
        return [cpuEnd(g, ox, oy, fl.from), cpuEnd(g, ox, oy, fl.to)];
    }

    /* ===================== 노드 그리기 ===================== */
    function cpuDrawPhase(g, ox, oy, idle, cur, pv, tt) {
        var cw = (g.w - 8) / 3;
        CPU_PH.forEach(function (name, i) {
            var a = cpuPhaseA(name, idle, cur, pv, tt);
            var x = ox + i * (cw + 4);
            rr(x, oy, cw, 22, 6, P.surf2, P.border, 1);
            if (a > 0) rr(x, oy, cw, 22, 6, P.teal + cpuHx(a * 0.3), P.teal + cpuHx(a), 1.5);
            tx(name, x + cw / 2, oy + 11, 10, a > 0.5 ? P.text : P.sub, 'center', a > 0.5);
        });
    }
    function cpuDrawCpu(g, ox, oy) {
        var y = oy + g.cpuTop;
        rr(ox, y, g.cpuW, g.cpuBot - g.cpuTop, 10, P.surf, P.purple, 2);
        rr(ox, y, g.cpuW, g.hdrH, 10, P.purple, null);
        tx('CPU', ox + g.cpuW / 2, y + g.hdrH / 2, 10, '#111111', 'center', true);
    }
    function cpuDrawReg(g, ox, oy, def, on, flash, v) {
        var rg = g.reg[def.id];
        var rx = ox + rg.x, ry = oy + rg.y, rw = rg.w, rh = g.rH;
        var c = P[def.ck];
        var hov = hoveredKey === def.id;
        rr(rx, ry, rw, rh, 6, on ? c + '22' : P.surf2, on ? c : hov ? P.purple : P.border, on ? 2.5 : hov ? 2 : 1);
        if (flash > 0) rr(rx, ry, rw, rh, 6, c + cpuHx(flash * 0.4), null);
        rr(rx, ry, g.lblW, rh, 6, on ? c + '33' : P.bg, null);
        ln(rx + g.lblW, ry + 6, rx + g.lblW, ry + rh - 6, on ? c + '88' : P.border, 1);
        tx(def.lbl, rx + g.lblW / 2, ry + rh / 2, 10, on ? c : P.sub, 'center', true);
        tx(v, rx + g.lblW + (rw - g.lblW - 14) / 2, ry + rh / 2, 11, on ? c : P.text, 'center', on);
        tipBadge(rx + rw - 8, ry + 9, def.id);
    }
    function cpuDrawUnit(g, ox, oy, key, on, op) {
        var u = g.unit[key];
        var ux = ox + u.x, uy = oy + u.y, uw = u.w, uh = u.h;
        var c = P[key === 'ALU' ? 'teal' : 'orange'];
        var hov = hoveredKey === key;
        rr(ux, uy, uw, uh, 6, on ? c + '1a' : P.surf2, on ? c : hov ? P.purple : P.border, on ? 2.5 : hov ? 2 : 1);
        tx(key, ux + 8, uy + uh / 2, 10, on ? c : P.sub, 'left', on);
        if (op) tx(op, ux + 32 + (uw - 50) / 2, uy + uh / 2, 11, c, 'center', true);
        tipBadge(ux + uw - 8, uy + uh / 2, key);
    }
    function cpuDrawMem(g, ox, oy, hlAddr) {
        var mx = ox + g.memX, my = oy + g.memY;
        rr(mx, my, g.memW, g.mH, 8, P.surf, P.teal, 1.5);
        rr(mx, my, g.memW, g.mHdr, 8, P.teal + '28', null);
        tx('MEMORY', mx + g.memW / 2, my + g.mHdr / 2, 10, P.teal, 'center', true);
        CPU_MEM.forEach(function (m, i) {
            var rx = ox + g.rowX, ry = oy + g.mRows[i], rw = g.rowW, rh = g.mRowH;
            var hl = m.addr === hlAddr;
            var addrW = 44;
            rr(rx, ry, rw, rh, 4, hl ? P.teal + '18' : P.surf2, hl ? P.teal : P.border, hl ? 2 : 1);
            tx(m.addr, rx + addrW / 2, ry + rh / 2, 10, P.teal, 'center', true);
            ln(rx + addrW, ry + 5, rx + addrW, ry + rh - 5, hl ? P.teal + '88' : P.border, 1);
            tx(m.val, rx + addrW + (rw - addrW) / 2, ry + rh / 2, 11, hl ? P.text : P.sub, 'center', hl);
        });
    }
    function cpuDrawBus(g, ox, oy, mdrR, mdrY) {
        var pts = g.mob
            ? [{ x: mdrR, y: mdrY }, { x: ox + g.busX, y: mdrY }, { x: ox + g.busX, y: oy + g.memY }]
            : [{ x: mdrR, y: mdrY }, { x: ox + g.memX, y: mdrY }];
        cpuPoly(pts, P.purple + '88', 2.5, [7, 4]);
        var lbl = 'DATA BUS';
        var lw = cpuTw(lbl, 9.5) + 12;
        var lx, ly;
        if (g.mob) {
            lx = ox + g.busX - 40 - lw / 2;
            ly = oy + (g.cpuBot + g.memY) / 2 - 8;
        } else {
            lx = ox + g.busX - lw / 2;
            ly = mdrY - 24;
        }
        rr(lx, ly, lw, 16, 4, P.surf2, P.purple, 1.2);
        tx(lbl, lx + lw / 2, ly + 8, 9.5, P.purple, 'center', true);
    }
    function cpuDrawChip(pts, p, a, v) {
        var q = cpuAlong(pts, p);
        var cw = cpuTw(v, 10) + 12;
        rr(q.x - cw / 2, q.y - 9, cw, 18, 9, P.purple + cpuHx(a), null);
        tx(v, q.x, q.y, 10, '#111111' + cpuHx(a), 'center', true);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var idle = step === null || step === undefined;
        var cur = idle ? steps[0] : step;
        var pv = !idle && prev && prev !== cur ? prev : null;
        var tt = clamp01(t);
        var g = layout(w, mob);
        var ox = x0, oy = top;
        var fl = !idle && cur.flow ? cur.flow : null;
        var act = idle ? null : cur.active;
        var hlAddr = idle ? null : cur.regs.MAR;
        var mdrR = ox + g.reg.MDR.x + g.reg.MDR.w;
        var mdrY = oy + g.mdrCy;

        cpuDrawPhase(g, ox, oy, idle, cur, pv, tt);
        cpuDrawCpu(g, ox, oy);
        if (fl) cpuPoly(cpuRoute(g, ox, oy, fl, cur), P.purple + '66', 1.5, [5, 4]);
        cpuDrawBus(g, ox, oy, mdrR, mdrY);
        cpuDrawMem(g, ox, oy, hlAddr);

        CPU_REGS.forEach(function (def) {
            var on = act === def.id;
            var v = idle ? '—' : (pv && fl && fl.to === def.id && tt < CPU_ARR ? pv.regs[def.id] : cur.regs[def.id]);
            var fa = 0;
            if (pv && pv.regs[def.id] !== cur.regs[def.id]) {
                fa = fl && fl.to === def.id ? (tt < CPU_ARR ? 0 : 1 - seg(tt, CPU_ARR, 1)) : 1 - tt;
            }
            cpuDrawReg(g, ox, oy, def, on, fa, v);
        });

        var aluOn = !idle && cur.alu;
        var cuOn = !idle && cur.cu;
        var op = '';
        if (aluOn) op = fl && fl.from === 'ALU' ? '= ' + cur.regs.ACC : cur.regs.ACC + ' + ' + cur.regs.MDR;
        cpuDrawUnit(g, ox, oy, 'ALU', aluOn, op);
        cpuDrawUnit(g, ox, oy, 'CU', cuOn, '');

        if (pv && fl && tt < 1) {
            var carry = g.reg[fl.to] ? cur.regs[fl.to] : cur.regs[fl.from];
            cpuDrawChip(cpuRoute(g, ox, oy, fl, cur), ez(tt / CPU_ARR), 1 - seg(tt, CPU_ARR, 1), carry);
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
        speedBtns.forEach(function (b) { b.classList.remove('cpu__speed-btn--active'); });
        btn.classList.add('cpu__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cpu__mode-btn--active', d.key === m); });
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