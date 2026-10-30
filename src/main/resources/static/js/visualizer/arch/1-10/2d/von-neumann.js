/**
 * 폰 노이만 구조 인터랙티브 시각화
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
    var root    = el('div', 'vn');
    var toolbar = el('div', 'vn__toolbar');
    var tbLeft  = el('div', 'vn__toolbar-left');
    tbLeft.appendChild(el('span', 'vn__title', 'Von Neumann Architecture'));

    var modeWrap = el('div', 'vn__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'vn__mode-btn' + (i === 0 ? ' vn__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'vn__speed');
    speedWrap.appendChild(el('span', 'vn__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'vn__speed-btn' + (i === 0 ? ' vn__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'vn__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'vn__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'vn__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'vn__controls');
    var btnPlay  = el('button', 'vn__btn vn__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'vn__btn', '▶| STEP');
    var btnReset = el('button', 'vn__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    /* ===================== 3D 외길 다리 전환 ===================== */
    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'vn__btn vn__btn--primary',
        label: '3D 외길 다리',
        onOpen: function () {
            vizReset();
            root.classList.add('vn--hidden');
        },
        onExit: function () {
            root.classList.remove('vn--hidden');
            resize();
        }
    });

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
    const MEM_INIT = [
        { addr: '0x00', label: 'LOAD R1,[10]',  type: 'i' },
        { addr: '0x02', label: 'LOAD R2,[11]',  type: 'i' },
        { addr: '0x04', label: 'ADD  R1, R2',   type: 'i' },
        { addr: '0x06', label: 'STORE R1,[12]', type: 'i' },
        { addr: '0x08', label: 'HALT',          type: 'i' },
        { addr: '0x10', label: '7',             type: 'd' },
        { addr: '0x11', label: '3',             type: 'd' },
        { addr: '0x12', label: '?',             type: 'd' },
    ];

    const STEPS = [
        { ph:'f', mh:0, reg:{PC:'0x00',IR:'—',   R1:'—', R2:'—'}, log:'[FETCH-1] PC=0x00 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:0, reg:{PC:'0x00',IR:'—',   R1:'—', R2:'—'}, log:'[FETCH-2] 메모리[0x00] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:0, reg:{PC:'0x00',IR:'LOAD', R1:'—', R2:'—'}, log:'[DECODE]  IR ← LOAD R1,[0x10] — CU가 명령어 해석',          bus:null },
        { ph:'e', mh:5, reg:{PC:'0x02',IR:'LOAD', R1:'—', R2:'—'}, log:'[EXECUTE-1] 피연산자 주소 0x10 → ADDR BUS로 메모리 전달',   bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:5, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[EXECUTE-2] Mem[0x10]=7 → DATA BUS로 CPU R1에 전달',        bus:{toMem:false, label:'D'} },

        { ph:'f', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[FETCH-1] PC=0x02 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[FETCH-2] 메모리[0x02] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[DECODE]  IR ← LOAD R2,[0x11] — CU가 명령어 해석',          bus:null },
        { ph:'e', mh:6, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'—'}, log:'[EXECUTE-1] 피연산자 주소 0x11 → ADDR BUS로 메모리 전달',   bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:6, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[EXECUTE-2] Mem[0x11]=3 → DATA BUS로 CPU R2에 전달',        bus:{toMem:false, label:'D'} },

        { ph:'f', mh:2, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[FETCH-1] PC=0x04 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:2, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[FETCH-2] 메모리[0x04] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:2, reg:{PC:'0x04',IR:'ADD',  R1:'7', R2:'3'}, log:'[DECODE]  IR ← ADD R1,R2 — CU가 명령어 해석',               bus:null },
        { ph:'e', mh:2, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[EXECUTE] R1 ← R1+R2=10 — ALU 내부 연산 (버스 사용 없음)',  bus:null },

        { ph:'f', mh:3, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[FETCH-1] PC=0x06 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:3, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[FETCH-2] 메모리[0x06] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:3, reg:{PC:'0x06',IR:'STORE',R1:'10',R2:'3'}, log:'[DECODE]  IR ← STORE R1,[0x12] — CU가 명령어 해석',         bus:null },
        { ph:'e', mh:7, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[EXECUTE-1] 저장 주소 0x12 → ADDR BUS로 메모리 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:7, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[EXECUTE-2] R1=10 → DATA BUS로 메모리[0x12]에 쓰기',         bus:{toMem:true,  label:'D'} },

        { ph:'f', mh:4, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[FETCH-1] PC=0x08 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:4, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[FETCH-2] 메모리[0x08] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:4, reg:{PC:'0x08',IR:'HALT', R1:'10',R2:'3'}, log:'[DECODE]  IR ← HALT — CU가 명령어 해석',                    bus:null },
        { ph:'e', mh:7, reg:{PC:'HALT',IR:'HALT', R1:'10',R2:'3'}, log:'[EXECUTE] HALT — 실행 완료! Mem[0x12]=10 저장됨 ✓',          bus:null, done:true },
    ];

    /* ===================== 상태 ===================== */
    window.CsFlow.vnData = { MEM: MEM_INIT, STEPS: STEPS };

    /* ===================== 툴팁 데이터 ===================== */
    var TIPS = {
        'PC':  'Program Counter\n다음에 실행할 명령어의 메모리 주소를 보관',
        'IR':  'Instruction Register\n인출한 명령어를 보관',
        'R1':  'Register 1\n범용 레지스터 — 연산에 사용되는 데이터 임시 저장',
        'R2':  'Register 2\n범용 레지스터 — 연산에 사용되는 데이터 임시 저장',
        'ALU': 'Arithmetic Logic Unit\n산술·논리 연산을 수행하는 회로',
        'CU':  'Control Unit\n명령어를 해석하고 각 장치를 제어',
    };

    /* ===================== 장면 ===================== */
    var VN_PH_KEY  = ['f', 'd', 'e'];
    var VN_PH_NAME = ['FETCH', 'DECODE', 'EXECUTE'];
    var VN_LANES   = [['CTRL', 'I', -1, 'orange'], ['ADDR', 'A', 0, 'teal'], ['DATA', 'D', 1, 'purple']];

    function currentSteps() { return STEPS; }
    function defaultLog() { return '시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function vnTxtW(str, sz) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? 1 : 0.6;
        return n * sz;
    }

    function vnPhCol(ph) { return ph === 'f' ? P.orange : (ph === 'd' ? P.teal : P.purple); }

    function vnCap(s) {
        if (s.done) return 'HALT 명령어로 실행을 멈춘다';
        if (s.ph === 'd') return 'CU가 ' + s.reg.IR + ' 명령어를 해석한다';
        if (s.ph === 'f') return s.bus && s.bus.toMem ? 'PC의 주소를 ADDR 버스로 메모리에 보낸다' : '메모리가 명령어를 CTRL 버스로 CPU에 돌려준다';
        if (!s.bus) return 'ALU가 R1과 R2를 더해 결과를 R1에 넣는다';
        if (s.bus.label === 'A') return s.reg.IR === 'STORE' ? '저장할 주소를 ADDR 버스로 메모리에 보낸다' : '피연산자 주소를 ADDR 버스로 메모리에 보낸다';
        if (s.bus.toMem) return 'R1의 값을 DATA 버스로 메모리에 쓴다';
        return '읽은 값을 DATA 버스로 받아 레지스터에 넣는다';
    }

    function vnCapMax(bw) {
        var st = currentSteps(), m = 1;
        for (var i = 0; i < st.length; i++) m = Math.max(m, lines(vnCap(st[i]), bw, 11).length);
        return m;
    }

    function layout(w, mob) {
        var bw = Math.min(w, 520), bx = (w - bw) / 2, colW = (bw - 30) / 2;
        var cpuY = 40 + vnCapMax(bw) * 15;
        var memY = cpuY + 183;
        return {
            bw: bw, bx: bx, cx: bx + bw / 2, lane: Math.min(76, bw / 2 - 40),
            colW: colW, colL: bx + 10, colR: bx + 20 + colW,
            cpuY: cpuY, cpuH: 119, row1: cpuY + 26, row2: cpuY + 55, row3: cpuY + 87,
            memY: memY, memH: 172, h: memY + 172
        };
    }

    function sceneH(w, mob) { return layout(w, mob).h; }

    function vnRegVal(k, s, pr, t) { return pr && pr[k] !== s.reg[k] && t < 0.85 ? pr[k] : s.reg[k]; }
    function vnChanged(k, s, pr, t) { return !!pr && pr[k] !== s.reg[k] && t >= 0.85; }
    function vnMemVal7(idx, t) { return idx > 18 || (idx === 18 && t >= 0.85) ? '10' : '?'; }

    function vnLane(lbl) { return lbl === 'I' ? VN_LANES[0] : (lbl === 'A' ? VN_LANES[1] : VN_LANES[2]); }

    function vnPktVal(s) {
        var m = MEM_INIT[s.mh];
        if (s.bus.label === 'A') return m.addr;
        if (s.bus.label === 'I') return m.label.split(' ')[0];
        if (s.bus.toMem) return s.reg.R1;
        return m.label;
    }

    function vnChip(x, y, val, col, alpha) {
        if (alpha <= 0) return;
        var w = vnTxtW(val, 11) + 12;
        ctx.globalAlpha = alpha;
        rr(x - w / 2, y - 9, w, 18, 6, col, null);
        tx(val, x, y, 11, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var idx = steps.indexOf(s);
        var pr = prev && prev !== s ? prev.reg : null;
        var L = layout(w, mob);
        var bx = x0 + L.bx, bw = L.bw, cx = x0 + L.cx, cw = L.colW;
        var lc = x0 + L.colL, rc = x0 + L.colR;
        var cpuY = top + L.cpuY, cpuB = cpuY + L.cpuH, memY = top + L.memY;
        var r1 = top + L.row1, r2 = top + L.row2, r3 = top + L.row3;
        var pc2 = vnPhCol(s.ph);
        var cuOn = s.ph === 'd', aluOn = s.ph === 'e' && !s.bus && !s.done;
        var k, i, px;

        var pw = [], total = 36;
        for (k = 0; k < 3; k++) { pw[k] = vnTxtW(VN_PH_NAME[k], 11) + 16; total += pw[k]; }
        px = cx - total / 2;
        for (k = 0; k < 3; k++) {
            var on = s.ph === VN_PH_KEY[k], pc = vnPhCol(VN_PH_KEY[k]);
            rr(px, top, pw[k], 22, 11, on ? pc : P.surf2, on ? pc : P.border, 1);
            tx(VN_PH_NAME[k], px + pw[k] / 2, top + 11, 11, on ? '#111111' : P.sub + 'ff', 'center', true);
            px += pw[k];
            if (k < 2) { tx('→', px + 18, top + 11, 11, P.sub + 'ff', 'center', false); px += 36; }
        }

        var cl = lines(vnCap(s), bw, 11);
        for (k = 0; k < cl.length; k++) tx(cl[k], cx, top + 37 + k * 15, 11, P.sub + 'ff', 'center', false);

        rr(bx, cpuY, bw, L.cpuH, 10, P.surf, P.border, 1.5);
        rr(bx, cpuY, bw, 20, 6, pc2 + '33', null);
        tx('CPU', cx, cpuY + 10, 11, P.text + 'ff', 'center', true);
        var regs = [['PC', lc, r1], ['IR', rc, r1], ['R1', lc, r2], ['R2', rc, r2]];
        for (k = 0; k < 4; k++) {
            var key = regs[k][0], rx = regs[k][1], ry = regs[k][2];
            var hi = (key === 'PC' && s.ph === 'f') || (key === 'IR' && s.ph === 'd') ||
                (key === 'R1' && !!s.bus && !!s.bus.toMem && s.bus.label === 'D') || vnChanged(key, s, pr, t);
            var hov = hoveredKey === key;
            rr(rx, ry, cw, 24, 5, hi ? pc2 + '1a' : (hov ? P.purple + '1a' : P.surf2), hi ? pc2 : (hov ? P.purple : P.border), hi || hov ? 2 : 1);
            rr(rx, ry, 30, 24, 5, hi ? pc2 + '33' : P.bg, null);
            tx(key, rx + 15, ry + 12, 11, (hi ? pc2 : P.sub) + 'ff', 'center', true);
            var rv = vnRegVal(key, s, pr, t);
            if (aluOn && (key === 'R1' || key === 'R2') && t >= 0.1 && t < 0.85) rv = '';
            tx(rv, rx + 30 + (cw - 44) / 2, ry + 12, 11, (hi ? pc2 : P.text) + 'ff', 'center', true);
            tipBadge(rx + cw - 9, ry + 12, key);
        }

        rr(lc, r3, cw, 26, 5, cuOn ? P.teal + '1a' : P.surf2, cuOn ? P.teal : P.border, cuOn ? 2 : 1);
        tx('CU', lc + 8, r3 + 13, 11, (cuOn ? P.teal : P.sub) + 'ff', 'left', cuOn);
        tipBadge(lc + cw - 9, r3 + 13, 'CU');
        rr(rc, r3, cw, 26, 5, aluOn ? P.purple + '1a' : P.surf2, aluOn ? P.purple : P.border, aluOn ? 2 : 1);
        tx('ALU', rc + 8, r3 + 13, 11, (aluOn ? P.purple : P.sub) + 'ff', 'left', aluOn);
        tipBadge(rc + cw - 9, r3 + 13, 'ALU');

        var bl = s.bus ? s.bus.label : '';
        for (k = 0; k < 3; k++) {
            var lk = VN_LANES[k], lx = cx + lk[2] * L.lane, lcol = P[lk[3]], on2 = bl === lk[1];
            ln(lx, cpuB + 16, lx, memY - 2, lcol + (on2 ? 'ff' : '66'), on2 ? 2.5 : 1.4, [5, 4]);
            tx(lk[0], lx, cpuB + 8, 11, lcol + (on2 ? 'ff' : 'aa'), 'center', on2);
        }

        if (s.bus) {
            var pl = vnLane(s.bus.label), yA = cpuB + 24, yB = memY - 12;
            var yc = s.bus.toMem ? lerp(yA, yB, t) : lerp(yB, yA, t);
            vnChip(cx + pl[2] * L.lane, yc, vnPktVal(s), P[pl[3]], t > 0.9 ? 1 - seg(t, 0.9, 1) : 1);
        }

        rr(bx, memY, bw, L.memH, 10, P.surf, P.border, 1.5);
        rr(bx, memY, bw, 20, 6, P.teal + '33', null);
        tx('MEMORY', cx, memY + 10, 11, P.teal + 'ff', 'center', true);
        for (i = 0; i < 8; i++) {
            var my = memY + 24 + i * 18, hl = i === s.mh, hc = MEM_INIT[i].type === 'd' ? P.teal : P.orange;
            rr(bx + 8, my, bw - 16, 16, 4, hl ? hc + '1a' : P.surf2, hl ? hc : P.border, hl ? 2 : 1);
            rr(bx + 8, my, 44, 16, 4, hl ? hc + '33' : P.bg, null);
            tx(MEM_INIT[i].addr, bx + 30, my + 8, 11, hc + 'ff', 'center', true);
            tx(i === 7 ? vnMemVal7(idx, t) : MEM_INIT[i].label, bx + 52 + (bw - 60) / 2, my + 8, 11, (hl ? P.text : P.sub) + 'ff', 'center', hl);
        }

        if (aluOn) {
            var c1x = lc + cw / 2, c2x = rc + cw / 2, cAy = r3 + 13;
            if (t < 0.45) {
                var u = ez(seg(t, 0, 0.45));
                vnChip(lerp(c1x, c2x, u), lerp(r2 + 12, cAy, u), pr ? pr.R1 : s.reg.R1, P.purple, 1);
                vnChip(c2x, lerp(r2 + 12, cAy, u), pr ? pr.R2 : s.reg.R2, P.purple, 1);
            } else if (t < 0.85) {
                var v = ez(seg(t, 0.45, 0.85));
                vnChip(lerp(c2x, c1x, v), lerp(cAy, r2 + 12, v), s.reg.R1, P.purple, 1);
            }
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
        speedBtns.forEach(function (b) { b.classList.remove('vn__speed-btn--active'); });
        btn.classList.add('vn__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('vn__mode-btn--active', d.key === m); });
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