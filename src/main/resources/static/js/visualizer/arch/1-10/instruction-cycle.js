/**
 * 명령어 사이클 인터랙티브 시각화 시각화
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
    var root    = el('div', 'ic');
    var toolbar = el('div', 'ic__toolbar');
    var tbLeft  = el('div', 'ic__toolbar-left');
    tbLeft.appendChild(el('span', 'ic__title', 'Instruction Cycle'));

    var modeWrap = el('div', 'ic__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ic__mode-btn' + (i === 0 ? ' ic__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ic__speed');
    speedWrap.appendChild(el('span', 'ic__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ic__speed-btn' + (i === 0 ? ' ic__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ic__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ic__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ic__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ic__controls');
    var btnPlay  = el('button', 'ic__btn ic__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ic__btn', '▶| STEP');
    var btnReset = el('button', 'ic__btn', '↺ RESET');
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

    /* ===================== 시뮬레이션 데이터 ===================== */
    const MEM_INIT = [
        { addr: '0x00', label: 'LOAD  [0x05]', type: 'i' },
        { addr: '0x01', label: 'ADD   [0x06]', type: 'i' },
        { addr: '0x02', label: 'STORE [0x07]', type: 'i' },
        { addr: '0x03', label: 'HALT',         type: 'i' },
        { addr: '0x04', label: '',             type: 'i' },
        { addr: '0x05', label: '10',           type: 'd' },
        { addr: '0x06', label: '20',           type: 'd' },
        { addr: '0x07', label: '?',            type: 'd' },
    ];

    const STEPS = [
        { ph:'f', mh:0, reg:{PC:'0x00', MAR:'0x00', MDR:'—',  IR:'—',    ACC:'—'}, log:'[FETCH-1] PC=0x00 → MAR=0x00, ADDR BUS로 메모리에 주소 전달',       bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:0, reg:{PC:'0x01', MAR:'0x00', MDR:'LOAD',IR:'—',   ACC:'—'}, log:'[FETCH-2] MEM[0x00]=LOAD → CTRL BUS로 MDR에 전달, PC→0x01',         bus:{toMem:false, label:'I'} },
        { ph:'d', mh:0, reg:{PC:'0x01', MAR:'0x00', MDR:'LOAD',IR:'LOAD',ACC:'—'}, log:'[DECODE]  IR ← LOAD [0x05] — CU가 명령어 해석, 피연산자=0x05',       bus:null },
        { ph:'e', mh:5, reg:{PC:'0x01', MAR:'0x05', MDR:'LOAD',IR:'LOAD',ACC:'—'}, log:'[EXEC-1]  피연산자 주소 0x05 → ADDR BUS로 메모리 전달',              bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:5, reg:{PC:'0x01', MAR:'0x05', MDR:'10',  IR:'LOAD',ACC:'10'},log:'[EXEC-2]  MEM[0x05]=10 → DATA BUS로 ACC에 전달, ACC=10',             bus:{toMem:false, label:'D'} },

        { ph:'f', mh:1, reg:{PC:'0x01', MAR:'0x01', MDR:'10',  IR:'LOAD',ACC:'10'},log:'[FETCH-1] PC=0x01 → MAR=0x01, ADDR BUS로 메모리에 주소 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:1, reg:{PC:'0x02', MAR:'0x01', MDR:'ADD', IR:'LOAD',ACC:'10'},log:'[FETCH-2] MEM[0x01]=ADD → CTRL BUS로 MDR에 전달, PC→0x02',           bus:{toMem:false, label:'I'} },
        { ph:'d', mh:1, reg:{PC:'0x02', MAR:'0x01', MDR:'ADD', IR:'ADD', ACC:'10'},log:'[DECODE]  IR ← ADD [0x06] — CU가 명령어 해석, 피연산자=0x06',        bus:null },
        { ph:'e', mh:6, reg:{PC:'0x02', MAR:'0x06', MDR:'ADD', IR:'ADD', ACC:'10'},log:'[EXEC-1]  피연산자 주소 0x06 → ADDR BUS로 메모리 전달',              bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:6, reg:{PC:'0x02', MAR:'0x06', MDR:'20',  IR:'ADD', ACC:'30'},log:'[EXEC-2]  MEM[0x06]=20 → DATA BUS, ACC=10+20=30',                    bus:{toMem:false, label:'D'} },

        { ph:'f', mh:2, reg:{PC:'0x02', MAR:'0x02', MDR:'20',  IR:'ADD', ACC:'30'},log:'[FETCH-1] PC=0x02 → MAR=0x02, ADDR BUS로 메모리에 주소 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:2, reg:{PC:'0x03', MAR:'0x02', MDR:'STORE',IR:'ADD',ACC:'30'},log:'[FETCH-2] MEM[0x02]=STORE → CTRL BUS로 MDR에 전달, PC→0x03',         bus:{toMem:false, label:'I'} },
        { ph:'d', mh:2, reg:{PC:'0x03', MAR:'0x02', MDR:'STORE',IR:'STORE',ACC:'30'},log:'[DECODE] IR ← STORE [0x07] — CU가 명령어 해석, 피연산자=0x07',     bus:null },
        { ph:'e', mh:7, reg:{PC:'0x03', MAR:'0x07', MDR:'STORE',IR:'STORE',ACC:'30'},log:'[EXEC-1] 저장 주소 0x07 → ADDR BUS로 메모리 전달',                 bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:7, reg:{PC:'0x03', MAR:'0x07', MDR:'30',   IR:'STORE',ACC:'30'},log:'[EXEC-2] ACC=30 → DATA BUS로 MEM[0x07]에 쓰기',                    bus:{toMem:true,  label:'D'} },

        { ph:'f', mh:3, reg:{PC:'0x03', MAR:'0x03', MDR:'30',  IR:'STORE',ACC:'30'},log:'[FETCH-1] PC=0x03 → MAR=0x03, ADDR BUS로 메모리에 주소 전달',       bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:3, reg:{PC:'0x04', MAR:'0x03', MDR:'HALT',IR:'STORE',ACC:'30'},log:'[FETCH-2] MEM[0x03]=HALT → CTRL BUS로 MDR에 전달',                  bus:{toMem:false, label:'I'} },
        { ph:'d', mh:3, reg:{PC:'0x04', MAR:'0x03', MDR:'HALT',IR:'HALT', ACC:'30'},log:'[DECODE]  IR ← HALT — CU가 명령어 해석',                            bus:null },
        { ph:'e', mh:7, reg:{PC:'HALT', MAR:'0x03', MDR:'HALT',IR:'HALT', ACC:'30'},log:'[EXECUTE] HALT — 실행 완료! MEM[0x07]=30 저장됨 ✓',                 bus:null, done:true },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = {
        'PC':  'Program Counter\n다음에 실행할 명령어의 메모리 주소를 보관',
        'MAR': 'Memory Address Register\n메모리에 접근할 주소를 임시 저장',
        'MDR': 'Memory Data Register\n메모리와 주고받는 데이터를 임시 저장',
        'IR':  'Instruction Register\n인출한 명령어를 보관',
        'ACC': 'Accumulator\n연산 중간 결과를 임시 저장',
        'ALU': 'Arithmetic Logic Unit\n산술·논리 연산을 수행하는 회로',
        'CU':  'Control Unit\n명령어를 해석하고 각 장치를 제어',
    };

    /* ===================== 장면 ===================== */
    var IC_KEYS  = ['PC', 'MAR', 'MDR', 'IR', 'ACC'];
    var IC_INIT  = { PC: '—', MAR: '—', MDR: '—', IR: '—', ACC: '—' };
    var IC_PHI   = { f: 0, d: 1, e: 2 };
    var IC_PHN   = ['FETCH', 'DECODE', 'EXECUTE'];
    var IC_PHC   = ['orange', 'teal', 'purple'];
    var IC_LANES = ['A', 'D', 'I'];
    var IC_BUSC  = { A: 'teal', I: 'orange', D: 'purple' };
    var IC_BUSL  = { A: 'ADDR BUS', I: 'CTRL BUS', D: 'DATA BUS' };
    var IC_BUSS  = { A: 'ADDR', I: 'CTRL', D: 'DATA' };
    var IC_CAP   = {
        f: 'FETCH: PC가 가리키는 명령어를 메모리에서 가져온다',
        d: 'DECODE: CU가 IR의 명령어를 해석한다',
        e: 'EXECUTE: 피연산자 주소로 메모리를 읽거나 쓰고 ALU로 계산한다',
        none: 'FETCH → DECODE → EXECUTE를 반복해 명령어 하나를 처리한다'
    };

    function currentSteps() { return STEPS; }
    function defaultLog() { return '시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function icTxtW(str, sz) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? 1 : 0.62;
        return n * sz;
    }

    function icUpdT(s, k) {
        var b = s.bus;
        if (b && !b.toMem && (k === 'MDR' || k === 'ACC' || k === 'IR')) return 0.85;
        if (b && b.toMem) return 0.04;
        if (!b && k === 'IR') return 0.25;
        return 0.12;
    }

    function icMemVal(j, idx, T) {
        var v = MEM_INIT[j].label;
        for (var i = 0; i < STEPS.length; i++) {
            var b = STEPS[i].bus;
            if (!b || !b.toMem || b.label !== 'D') continue;
            if (parseInt(STEPS[i].reg.MAR, 16) !== j) continue;
            if (i < idx || (i === idx && T >= 0.85)) v = STEPS[i].reg.MDR;
        }
        return v;
    }

    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 5;
        var capN = 1;
        Object.keys(IC_CAP).forEach(function (k) { capN = Math.max(capN, lines(IC_CAP[k], w - 8, fs).length); });
        var mainY = 36 + capN * lh + 10;
        if (mob) {
            var memY = mainY + 106 + 56;
            return {
                mob: true, fs: fs, lh: lh, mainY: mainY,
                cpu: { x: 0, y: mainY, w: w, h: 106 },
                mem: { x: 0, y: memY, w: w, h: 214 },
                H: memY + 214 + 4
            };
        }
        var mainH = 256;
        var cpuW = Math.min(250, Math.round(w * 0.36));
        var memW = Math.min(230, Math.round(w * 0.32));
        return {
            mob: false, fs: fs, lh: lh, mainY: mainY,
            cpu: { x: 0, y: mainY, w: cpuW, h: mainH },
            mem: { x: w - memW, y: mainY, w: memW, h: mainH },
            H: mainY + mainH + 4
        };
    }

    function sceneH(w, mob) { return layout(w, mob).H; }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var idx = step ? steps.indexOf(step) : -1;
        var s = idx >= 0 ? steps[idx] : null;
        var pre = idx > 0 ? steps[idx - 1] : null;
        var fresh = !!(s && prev && prev !== step);
        var T = fresh ? t : 1;
        var L = layout(w, mob);
        var fs = L.fs;
        var cur = s ? s.reg : IC_INIT;
        var before = pre ? pre.reg : IC_INIT;
        var cI = s ? IC_PHI[s.ph] : -1;
        var pI = pre ? IC_PHI[pre.ph] : -1;
        var acc = cI >= 0 ? P[IC_PHC[cI]] : P.border;
        var changed = {}, vals = {};
        IC_KEYS.forEach(function (k) {
            changed[k] = !!s && cur[k] !== before[k];
            vals[k] = changed[k] && T < icUpdT(s, k) ? before[k] : cur[k];
        });
        var i, px, on, lab, lwd, c, key;

        var pw = mob ? Math.floor((w - 32) / 3) : Math.min(150, Math.floor((w - 60) / 3));
        var pg = (w - pw * 3) / 2;
        var fi = cI;
        if (cI >= 0 && pI >= 0 && pI !== cI) fi = pI + (cI - pI) * ez(seg(T, 0, 0.35));
        for (i = 0; i < 3; i++) rr(x0 + i * (pw + pg), top, pw, 26, 13, P.surf2, P.border, 1.2);
        if (cI >= 0) rr(x0 + fi * (pw + pg), top, pw, 26, 13, acc + '33', acc + 'ff', 1.8);
        for (i = 0; i < 3; i++) {
            px = x0 + i * (pw + pg);
            on = cI >= 0 && Math.round(fi) === i;
            tx(IC_PHN[i], px + pw / 2, top + 13, fs, (on ? P[IC_PHC[i]] : P.sub) + 'ff', 'center', on);
            if (i < 2) tx('→', px + pw + pg / 2, top + 13, fs, P.sub + 'ff', 'center', false);
        }

        lines(IC_CAP[s ? s.ph : 'none'], w - 8, fs).forEach(function (cl, j) {
            tx(cl, x0 + w / 2, top + 36 + j * L.lh + L.lh / 2, fs, P.text + 'ff', 'center', false);
        });

        var cpu = L.cpu, mem = L.mem;
        var cx0 = x0 + cpu.x, cy0 = top + cpu.y, cw = cpu.w, chh = cpu.h;
        var mx0 = x0 + mem.x, my0 = top + mem.y, mw = mem.w, mhh = mem.h;
        var lx1 = cx0 + cw, lx2 = mx0, ya = cy0 + chh, yb = my0;
        var midY = cy0 + chh / 2;
        var laneY = { I: midY - 26, D: midY, A: midY + 26 };
        var laneX = { A: x0 + w * 0.2, D: x0 + w * 0.5, I: x0 + w * 0.8 };

        IC_LANES.forEach(function (key) {
            c = P[IC_BUSC[key]];
            if (mob) {
                ln(laneX[key], ya, laneX[key], yb, c + '99', 1.6, [5, 4]);
                lab = IC_BUSS[key];
                lwd = icTxtW(lab, fs) + 10;
                rr(laneX[key] - lwd / 2, (ya + yb) / 2 - 8, lwd, 16, 8, P.surf, c + '99', 1);
                tx(lab, laneX[key], (ya + yb) / 2, fs, c + 'ff', 'center', true);
            } else {
                ln(lx1, laneY[key], lx2, laneY[key], c + '99', 1.6, [5, 4]);
                lab = IC_BUSL[key];
                lwd = icTxtW(lab, fs) + 12;
                rr((lx1 + lx2) / 2 - lwd / 2, laneY[key] - 8, lwd, 16, 8, P.surf, c + '99', 1);
                tx(lab, (lx1 + lx2) / 2, laneY[key], fs, c + 'ff', 'center', true);
            }
        });

        rr(cx0, cy0, cw, chh, 10, P.surf, s ? acc : P.border, s ? 2 : 1.5);
        tx('CPU', cx0 + (mob ? 8 : 12), cy0 + (mob ? 11 : 18), mob ? 11 : 14, P.text + 'ff', 'left', true);

        var rise = 6 * seg(T, 0.12, 0.9);
        var pcA = (fresh && changed.PC && parseInt(cur.PC, 16) - parseInt(before.PC, 16) === 1)
            ? ez(seg(T, 0.12, 0.3)) * (1 - ez(seg(T, 0.7, 0.95))) : 0;
        var pcPos = null;
        if (mob) {
            var chW = (cw - 32) / 5;
            IC_KEYS.forEach(function (k, q) {
                var rx = cx0 + 6 + q * (chW + 5), ry = cy0 + 28, hl = changed[k];
                rr(rx, ry, chW, 38, 5, hl ? acc + '1f' : P.surf2, hl ? acc : P.border, hl ? 1.8 : 1);
                tx(k, rx + chW / 2, ry + 10, fs, (hl ? acc : P.sub) + 'ff', 'center', true);
                tx(vals[k], rx + chW / 2, ry + 27, fs, P.text + 'ff', 'center', hl);
                if (k === 'PC') pcPos = [rx + chW - 2, ry - 7];
            });
        } else {
            IC_KEYS.forEach(function (k, q) {
                var rx = cx0 + 12, ry = cy0 + 38 + q * 31, rw = cw - 24, hl = changed[k], hov = hoveredKey === k;
                rr(rx, ry, rw, 26, 6, hl ? acc + '1f' : P.surf2, hl ? acc : (hov ? P.purple : P.border), hl || hov ? 1.8 : 1);
                rr(rx, ry, 52, 26, 6, hl ? acc + '33' : P.bg, null);
                tx(k, rx + 26, ry + 13, fs, (hl ? acc : P.sub) + 'ff', 'center', true);
                tx(vals[k], rx + 52 + (rw - 76) / 2, ry + 13, fs, P.text + 'ff', 'center', hl);
                tipBadge(rx + rw - 12, ry + 13, k);
                if (k === 'PC') pcPos = [rx + rw - 30, ry + 13];
            });
        }
        if (pcA > 0.01 && pcPos) {
            ctx.globalAlpha = pcA;
            tx('+1', pcPos[0], pcPos[1] - rise, fs, P.green + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }

        var aY = cy0 + chh - (mob ? 36 : 44), aH = mob ? 28 : 34, bw = (cw - 32) / 2;
        var aluOn = !!s && s.ph === 'e', cuOn = !!s && s.ph === 'd';
        rr(cx0 + 12, aY, bw, aH, 6, aluOn ? P.purple + '1f' : P.surf2, aluOn ? P.purple : P.border, aluOn ? 2 : 1);
        tx('ALU', cx0 + 12 + bw / 2, aY + aH / 2, fs, (aluOn ? P.purple : P.sub) + 'ff', 'center', aluOn);
        tipBadge(cx0 + 12 + bw - 10, aY + aH / 2, 'ALU');
        rr(cx0 + 20 + bw, aY, bw, aH, 6, cuOn ? P.teal + '1f' : P.surf2, cuOn ? P.teal : P.border, cuOn ? 2 : 1);
        tx('CU', cx0 + 20 + bw + bw / 2, aY + aH / 2, fs, (cuOn ? P.teal : P.sub) + 'ff', 'center', cuOn);
        tipBadge(cx0 + 20 + bw * 2 - 10, aY + aH / 2, 'CU');

        var accM = s ? acc : P.border;
        var glow = s ? (fresh ? ez(seg(T, 0.05, 0.25)) : 1) : 0;
        rr(mx0, my0, mw, mhh, 10, P.surf, P.border, 1.5);
        tx('MEMORY', mx0 + (mob ? 8 : 12), my0 + (mob ? 13 : 16), mob ? 11 : 13, P.teal + 'ff', 'left', true);
        var cY0 = my0 + (mob ? 26 : 32), rowS = mob ? 23 : 27, cH = mob ? 20 : 22, addrW = mob ? 40 : 50;
        for (var j = 0; j < 8; j++) {
            var cyj = cY0 + j * rowS, cxj = mx0 + 8, cwj = mw - 16;
            var typeC = MEM_INIT[j].type === 'd' ? P.teal : P.orange;
            rr(cxj, cyj, cwj, cH, 5, P.surf2, P.border, 1);
            if (s && j === s.mh && glow > 0.01) {
                ctx.globalAlpha = glow;
                rr(cxj, cyj, cwj, cH, 5, accM + '2a', accM, 1.8);
                ctx.globalAlpha = 1;
            }
            rr(cxj, cyj, addrW, cH, 5, P.bg, null);
            tx(MEM_INIT[j].addr, cxj + addrW / 2, cyj + cH / 2, fs, typeC + 'ff', 'center', true);
            var mv = icMemVal(j, idx, T).replace(/\s+/g, ' ');
            if (mv) tx(mv, cxj + addrW + (cwj - addrW) / 2, cyj + cH / 2, fs, P.text + 'ff', 'center', false);
        }

        if (fresh && s && s.bus && T < 0.9) {
            var b = s.bus, pos = ez(seg(T, 0.05, 0.85));
            var ptxt = b.label === 'A' ? cur.MAR : cur.MDR;
            var pwid = icTxtW(ptxt, fs) + 12, ppx, ppy;
            if (mob) {
                ppx = laneX[b.label];
                ppy = b.toMem ? ya + (yb - ya) * pos : yb + (ya - yb) * pos;
            } else {
                ppy = laneY[b.label];
                ppx = b.toMem ? lx1 + (lx2 - lx1) * pos : lx2 + (lx1 - lx2) * pos;
            }
            rr(ppx - pwid / 2, ppy - 9, pwid, 18, 9, P[IC_BUSC[b.label]] + 'ff', P.bg, 1.5);
            tx(ptxt, ppx, ppy, fs, '#111111', 'center', true);
        }
        ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('ic__speed-btn--active'); });
        btn.classList.add('ic__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ic__mode-btn--active', d.key === m); });
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