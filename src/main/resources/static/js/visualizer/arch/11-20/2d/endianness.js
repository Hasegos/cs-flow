/**
 * 엔디언(빅/리틀) 시각화 시각화
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
    var root    = el('div', 'end-viz');
    var toolbar = el('div', 'end-viz__toolbar');
    var tbLeft  = el('div', 'end-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'end-viz__title', 'BYTE ORDER'));

    var modeWrap = el('div', 'end-viz__mode');
    var modeDefs = [
        { key: 'store', label: '바이트 저장 순서' },
        { key: 'net', label: '네트워크 바이트 순서' },
        { key: 'read', label: '같은 바이트 다른 값' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'end-viz__mode-btn' + (i === 0 ? ' end-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'end-viz__speed');
    speedWrap.appendChild(el('span', 'end-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'end-viz__speed-btn' + (i === 0 ? ' end-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'end-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'end-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'end-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'end-viz__controls');
    var btnPlay  = el('button', 'end-viz__btn end-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'end-viz__btn', '▶| STEP');
    var btnReset = el('button', 'end-viz__btn', '↺ RESET');
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
    var mode    = 'store';
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

    /* ===================== 데이터: 공통 ===================== */
    var BYTES = [0x12, 0x34, 0x56, 0x78];
    var VAL   = 0x12345678;
    var BASE  = 0x1000;
    function hx(n, d) {
        var s = n.toString(16).toUpperCase();
        while (s.length < d) s = '0' + s;
        return s;
    }
    function valOf(mem, n, little) {
        var v = 0;
        for (var i = 0; i < n; i++) v = v * 256 + (little ? mem[n - 1 - i] : mem[i]);
        return v;
    }
    function memBig() { return BYTES.slice(); }
    function memLittle() { return BYTES.slice().reverse(); }

    /* ===================== 데이터: 바이트 저장 순서 ===================== */
    var STORE_STEPS = [
        { big: false, little: false, log: '32비트 값 0x' + hx(VAL, 8) + '는 바이트 ' + BYTES.length + '개(' + BYTES.map(function (b) { return hx(b, 2); }).join(' ') + ')로 이뤄집니다. 왼쪽 12가 가장 큰 자릿수(MSB) 바이트, 오른쪽 78이 가장 작은 자릿수(LSB) 바이트입니다.' },
        { big: true, little: false, log: '빅 엔디언 — 가장 큰 자릿수 바이트를 가장 낮은 주소(0x' + hx(BASE, 4) + ')에 먼저 저장합니다. 메모리를 낮은 주소부터 읽으면 ' + memBig().map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 값을 쓴 모양 그대로 보입니다.' },
        { big: true, little: true, log: '리틀 엔디언 — 가장 작은 자릿수 바이트를 가장 낮은 주소(0x' + hx(BASE, 4) + ')에 먼저 저장합니다. 낮은 주소부터 ' + memLittle().map(function (b) { return hx(b, 2); }).join(' ') + ' 순서가 됩니다. x86과 x86-64가 이 방식입니다.' },
        { big: true, little: true, log: '값은 같고 바이트가 놓이는 순서만 다릅니다. 순서가 바뀌는 단위는 바이트이고, 바이트 안의 비트 모양은 그대로입니다.' },
        { big: true, little: true, log: '정리 — 엔디언은 여러 바이트로 이뤄진 값을 메모리에 놓는 순서의 약속입니다. 한 바이트짜리 값에는 순서가 없으므로 영향이 없습니다.' }
    ];

    /* ===================== 데이터: 네트워크 바이트 순서 ===================== */
    var HI = 0x12;
    var LO = 0x34;
    var HOST_MEM = [LO, HI];
    var NET_ORDER = [HI, LO];
    var RAW_AS_BIG = valOf(HOST_MEM, 2, false);
    var GOOD_VAL = valOf(NET_ORDER, 2, false);

    var NET_STEPS = [
        { s: null, w: null, r: null, log: '16비트 값 0x' + hx(GOOD_VAL, 4) + '를 네트워크로 보냅니다. 송신 호스트는 리틀 엔디언, 수신 호스트는 빅 엔디언이라고 가정합니다(변환의 필요를 보이기 위한 예입니다).' },
        { s: HOST_MEM, w: null, r: null, log: '송신 호스트 메모리 — 리틀 엔디언이라 낮은 주소부터 ' + HOST_MEM.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 놓입니다.' },
        { s: HOST_MEM, w: HOST_MEM, r: RAW_AS_BIG, bad: true, log: '변환 없이 메모리 바이트를 그대로 보내면 ' + HOST_MEM.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 전송됩니다. 빅 엔디언 수신자는 먼저 온 바이트를 큰 자릿수로 읽어 0x' + hx(RAW_AS_BIG, 4) + '(' + RAW_AS_BIG + ')를 얻습니다. 값이 달라졌습니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: null, c1: true, log: '그래서 전송 전에 htons로 호스트 순서를 네트워크 바이트 순서(빅 엔디언)로 바꿉니다. 큰 자릿수 바이트가 먼저 나가 ' + NET_ORDER.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서가 됩니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: GOOD_VAL, c1: true, c2: true, log: '수신 호스트는 ntohs로 네트워크 순서를 자기 호스트 순서로 되돌려 0x' + hx(GOOD_VAL, 4) + '(' + GOOD_VAL + ')를 얻습니다. 호스트의 엔디언이 달라도 같은 값이 됩니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: GOOD_VAL, c1: true, c2: true, log: '정리 — 통신 양쪽이 같은 순서를 쓰도록 네트워크 바이트 순서를 빅 엔디언으로 정했고, 호스트와 네트워크 사이에서 htons/htonl, ntohs/ntohl로 변환합니다.' }
    ];

    /* ===================== 데이터: 같은 바이트 다른 값 ===================== */
    var READ_STEPS = [
        { n: 0, log: '메모리 낮은 주소부터 ' + BYTES.map(function (b) { return hx(b, 2); }).join(' ') + ' 네 바이트가 놓여 있습니다. 이 바이트를 정수로 읽을 때 CPU의 엔디언이 값을 정합니다.' },
        { n: 1, log: '1바이트로 읽으면 0x' + hx(valOf(BYTES, 1, true), 2) + '로 어느 엔디언이든 같습니다. 바이트 하나에는 순서가 없기 때문입니다.' },
        { n: 2, log: '16비트로 읽으면 빅 엔디언은 0x' + hx(valOf(BYTES, 2, false), 4) + ', 리틀 엔디언은 0x' + hx(valOf(BYTES, 2, true), 4) + '입니다. 먼저 나오는 바이트를 큰 자릿수로 보느냐 작은 자릿수로 보느냐의 차이입니다.' },
        { n: 4, log: '32비트로 읽으면 빅 엔디언은 0x' + hx(valOf(BYTES, 4, false), 8) + ', 리틀 엔디언은 0x' + hx(valOf(BYTES, 4, true), 8) + '입니다. 같은 네 바이트가 전혀 다른 값이 됩니다.' },
        { n: 4, log: '정리 — 파일이나 네트워크로 여러 바이트 정수를 주고받을 때는 양쪽이 같은 바이트 순서를 쓰기로 약속해야 합니다.' }
    ];

    window.CsFlow.endiannessData = {
        bytes: BYTES, val: VAL, base: BASE, hx: hx, valOf: valOf,
        store: STORE_STEPS, net: NET_STEPS, read: READ_STEPS, hostMem: HOST_MEM, netOrder: NET_ORDER
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'net') return NET_STEPS;
        if (mode === 'read') return READ_STEPS;
        return STORE_STEPS;
    }
    function defaultLog() {
        if (mode === 'net') return '리틀 엔디언 호스트가 빅 엔디언 네트워크 바이트 순서로 값을 보낼 때 일어나는 변환을 봅니다.';
        if (mode === 'read') return '메모리의 같은 바이트를 엔디언이 다른 CPU가 정수로 읽으면 어떤 값이 되는지 봅니다.';
        return '32비트 값을 메모리에 놓는 순서가 빅 엔디언과 리틀 엔디언에서 어떻게 다른지 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function endStoreLay(w, mob) {
        var lw = mob ? 78 : 110;
        var ch = mob ? 34 : 40;
        var cw = Math.min(mob ? 52 : 72, (w - lw) / 4);
        var yV = 42;
        var yB = yV + ch + 40;
        var yL = yB + ch + 44;
        return { lw: lw, ch: ch, cw: cw, yV: yV, yB: yB, yL: yL, total: yL + ch + 40 };
    }
    function endNetLay(w, mob) {
        var ch = mob ? 34 : 40;
        var z = mob ? 64 : 50;
        var yA = 22;
        var yB = yA + ch + z;
        var yC = yB + ch + z;
        return { ch: ch, z: z, cw: mob ? 52 : 72, yA: yA, yB: yB, yC: yC, total: yC + ch + 8 };
    }
    function endReadLay(w, mob) {
        var lw = mob ? 58 : 84;
        var ch = mob ? 34 : 40;
        var cw = Math.min(72, (w - lw) / 4);
        var yM = 18;
        var r0 = yM + ch + 64;
        var r1 = r0 + ch + 30;
        return { lw: lw, ch: ch, cw: cw, yM: yM, r0: r0, r1: r1, total: r1 + ch + 10 };
    }
    function layout(w, mob) {
        if (mode === 'net') return endNetLay(w, mob);
        if (mode === 'read') return endReadLay(w, mob);
        return endStoreLay(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function endCol(i) { return [P.orange, P.purple, P.teal, P.green][i]; }
    function endNetCol(v) { return v === HI ? P.orange : P.purple; }
    function endReadVal(n, little) { return n * 8 + '비트로 읽은 값  0x' + hx(valOf(BYTES, n, little), n * 2); }
    function endCell(x, y, cw, ch, val, col, fillA, edgeA, fs) {
        rr(x + 1, y, cw - 2, ch, 5, col + fillA, col + edgeA, 1.6);
        tx(hx(val, 2), x + cw / 2, y + ch / 2, fs + 1, col + 'ee', 'center', true);
    }
    function endEmpty(x, y, cw, ch) { rr(x + 1, y, cw - 2, ch, 5, 'none', P.muted + '33', 1.2); }
    function endText(str, x, y0, maxW, fs, col) {
        lines(str, maxW, fs).forEach(function (row, li) { tx(row, x, y0 + li * (fs + 3), fs, col, 'left', true); });
    }

    /* ===================== 모드: 바이트 저장 순서 ===================== */
    function endStoreDraw(x0, top, w, mob, s, p, fresh, q) {
        var L = endStoreLay(w, mob);
        var f = mob ? 11 : 12;
        var cw = L.cw, ch = L.ch;
        var bx = x0 + L.lw;
        var yV = top + L.yV, yB = top + L.yB, yL = top + L.yL;
        var both = fresh && !!s.big && !!s.little && !!p.big && !!p.little;
        var k, sw;

        function endRow(y, order, label, on, isNew) {
            var a, idx, cx, qa, mx, my;
            tx(label, x0, y + ch / 2, f, on ? P.text + 'ee' : P.muted + '77', 'left', true);
            for (a = 0; a < 4; a++) {
                idx = order[a];
                cx = bx + a * cw;
                qa = !on ? 0 : (isNew ? ez(seg(q, idx * 0.12, idx * 0.12 + 0.64)) : 1);
                if (qa >= 1) {
                    endCell(cx, y, cw, ch, BYTES[idx], endCol(idx), '26', 'cc', f);
                } else {
                    endEmpty(cx, y, cw, ch);
                    if (qa > 0) {
                        mx = lerp(bx + idx * cw, cx, qa);
                        my = lerp(yV, y, qa);
                        endCell(mx, my, cw, ch, BYTES[idx], endCol(idx), '50', 'ff', f);
                    }
                }
                tx(mob ? '+' + a : '0x' + hx(BASE + a, 4), cx + cw / 2, y + ch + 11, f, P.muted + 'dd', 'center', false);
            }
        }

        tx('32비트 값 0x' + hx(VAL, 8), x0, top + 10, f + 1, P.text + 'ee', 'left', true);
        tx('MSB', bx + cw / 2, yV - 11, f, P.sub + 'ff', 'center', false);
        tx('LSB', bx + cw * 3.5, yV - 11, f, P.sub + 'ff', 'center', false);
        for (k = 0; k < 4; k++) endCell(bx + k * cw, yV, cw, ch, BYTES[k], endCol(k), '26', 'cc', f);
        endRow(yB, [0, 1, 2, 3], '빅 엔디언', !!s.big, fresh && !!s.big && !p.big);
        endRow(yL, [3, 2, 1, 0], '리틀 엔디언', !!s.little, fresh && !!s.little && !p.little);
        if (both && q < 1) {
            sw = Math.min(3, Math.floor(q * 4));
            rr(bx + sw * cw, yV, cw, ch, 5, 'none', P.yellow + 'ff', 2.4);
            rr(bx + sw * cw, yB, cw, ch, 5, 'none', P.yellow + 'ff', 2.4);
            rr(bx + (3 - sw) * cw, yL, cw, ch, 5, 'none', P.yellow + 'ff', 2.4);
        }
        tx('낮은 주소', bx, yL + ch + 27, f, P.muted + 'dd', 'left', false);
        tx('높은 주소', bx + 4 * cw, yL + ch + 27, f, P.muted + 'dd', 'right', false);
    }

    /* ===================== 모드: 네트워크 바이트 순서 ===================== */
    function endNetDraw(x0, top, w, mob, s, p, fresh, q) {
        var L = endNetLay(w, mob);
        var f = mob ? 11 : 12;
        var cw = L.cw, ch = L.ch;
        var yA = top + L.yA, yB = top + L.yB, yC = top + L.yC;
        var z1 = yA + ch, z2 = yB + ch;
        var wChanged = !!s.w && s.w !== p.w;
        var rNew = s.r !== null && s.r !== p.r;
        var dotA = wChanged ? 0.5 : 0;
        var dotEnd = dotA + 0.4;
        var wireE = wChanged && rNew ? seg(q, 0, 0.5) : q;
        var vcol = s.bad ? P.red : P.green;
        var i, j, cx, qa, qj, si, dq, dy, boxQ;

        tx(mob ? '송신 호스트(리틀) 메모리' : '송신 호스트(리틀 엔디언) 메모리', x0, top + 8, f, s.s ? P.text + 'ee' : P.muted + '88', 'left', true);
        for (i = 0; i < 2; i++) {
            cx = x0 + i * cw;
            if (!s.s) {
                endEmpty(cx, yA, cw, ch);
                continue;
            }
            qa = fresh && !p.s ? ez(seg(q, i * 0.3, i * 0.3 + 0.5)) : 1;
            if (qa < 1) endEmpty(cx, yA, cw, ch);
            if (qa > 0) {
                ctx.globalAlpha = qa;
                endCell(cx, yA - 10 * (1 - qa), cw, ch, HOST_MEM[i], endNetCol(HOST_MEM[i]), '26', 'cc', f);
                ctx.globalAlpha = 1;
            }
        }

        tx('네트워크로 나가는 순서', x0, yB - 12, f, s.w ? P.text + 'ee' : P.muted + '88', 'left', true);
        for (j = 0; j < 2; j++) {
            cx = x0 + j * cw;
            if (!wChanged) {
                if (s.w) endCell(cx, yB, cw, ch, s.w[j], endNetCol(s.w[j]), '26', 'cc', f);
                else endEmpty(cx, yB, cw, ch);
                continue;
            }
            qj = ez(seg(wireE, j * 0.2, j * 0.2 + 0.6));
            if (qj >= 1) {
                endCell(cx, yB, cw, ch, s.w[j], endNetCol(s.w[j]), '26', 'cc', f);
                continue;
            }
            endEmpty(cx, yB, cw, ch);
            if (qj > 0) {
                si = p.w ? p.w.indexOf(s.w[j]) : (s.s || HOST_MEM).indexOf(s.w[j]);
                endCell(lerp(x0 + si * cw, cx, qj), lerp(p.w ? yB : yA, yB, qj), cw, ch, s.w[j], endNetCol(s.w[j]), '50', 'ff', f);
            }
        }

        if (s.c1) {
            ctx.globalAlpha = fresh && !p.c1 ? seg(q, 0.3, 0.8) : 1;
            endText('htons — 호스트 순서를 빅 엔디언으로 변환', x0 + 2 * cw + 12, z1 + 7, w - 2 * cw - 12, f, P.yellow + 'ee');
            ctx.globalAlpha = 1;
        }
        if (s.c2) {
            ctx.globalAlpha = fresh && !p.c2 ? seg(q, 0.3, 0.8) : 1;
            endText('ntohs — 네트워크 순서를 호스트 순서로 변환', x0 + 2 * cw + 12, z2 + 7, w - 2 * cw - 12, f, P.yellow + 'ee');
            ctx.globalAlpha = 1;
        }

        if (rNew) {
            dq = seg(q, dotA, dotEnd);
            if (dq > 0 && dq < 1) {
                dy = lerp(yB + ch, yC, dq);
                circ(x0 + cw / 2, dy, 9, vcol + '44', 'none');
                circ(x0 + cw / 2, dy, 5, vcol + 'ff', 'none');
            }
        }
        boxQ = rNew ? seg(q, dotEnd, Math.min(1, dotEnd + 0.1)) : 1;
        tx(mob ? '빅 엔디언 수신자가 읽은 값' : '빅 엔디언 수신 호스트가 읽은 값', x0, yC - 12, f, s.r !== null ? P.text + 'ee' : P.muted + '88', 'left', true);
        if (s.r === null || boxQ < 1) rr(x0, yC, w, ch, 5, 'none', P.muted + '33', 1.2);
        if (s.r !== null && boxQ > 0) {
            ctx.globalAlpha = boxQ;
            rr(x0, yC, w, ch, 5, vcol + '26', vcol + 'cc', 1.6);
            tx('0x' + hx(s.r, 4) + ' (' + s.r + ')' + (s.bad ? '  값이 달라짐' : ''), x0 + 12, yC + ch / 2, f + 1, vcol + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 같은 바이트 다른 값 ===================== */
    function endReadDraw(x0, top, w, mob, s, p, fresh, q) {
        var L = endReadLay(w, mob);
        var f = mob ? 11 : 12;
        var cw = L.cw, ch = L.ch;
        var bx = x0 + L.lw;
        var yM = top + L.yM;
        var nowN = lerp(p.n, s.n, ez(q));
        var res = [[L.r0, '빅 엔디언 CPU', P.teal, false], [L.r1, '리틀 엔디언 CPU', P.orange, true]];
        var i, cx, col, la, yb, bl, br, y, col2, ri, va;

        tx('메모리', x0, yM + ch / 2, f, P.text + 'ee', 'left', true);
        for (i = 0; i < 4; i++) {
            col = endCol(i);
            cx = bx + i * cw;
            rr(cx + 1, yM, cw - 2, ch, 5, col + '22', col + 'aa', 1.4);
            la = 0;
            if (s.n > i) la = fresh && i >= p.n ? ez(seg(q, (i - p.n) * 0.15, (i - p.n) * 0.15 + 0.5)) : 1;
            if (la > 0) {
                ctx.globalAlpha = la;
                rr(cx + 1, yM, cw - 2, ch, 5, col + '40', col + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            tx(hx(BYTES[i], 2), cx + cw / 2, yM + ch / 2, f + 1, la > 0 ? col + 'ee' : col + '88', 'center', true);
            tx(mob ? '+' + i : '0x' + hx(BASE + i, 4), cx + cw / 2, yM + ch + 11, f, P.muted + 'dd', 'center', false);
        }

        if (nowN > 0.05) {
            yb = yM + ch + 25;
            bl = bx + 1;
            br = bx + nowN * cw - 1;
            ln(bl, yb, br, yb, P.yellow + 'ff', 2);
            ln(bl, yb - 5, bl, yb, P.yellow + 'ff', 2);
            ln(br, yb - 5, br, yb, P.yellow + 'ff', 2);
            tx(Math.max(1, Math.round(nowN)) * 8 + '비트 읽기', (bl + br) / 2, yb + 12, f, P.yellow + 'ee', 'center', true);
        }

        for (ri = 0; ri < 2; ri++) {
            y = top + res[ri][0];
            col2 = res[ri][2];
            tx(res[ri][1], x0, y - 10, f, s.n ? col2 + 'ee' : P.muted + '88', 'left', true);
            rr(x0, y, w, ch, 5, s.n ? col2 + '26' : 'none', s.n ? col2 + 'cc' : P.muted + '33', 1.5);
            if (s.n) {
                va = fresh && p.n && p.n !== s.n;
                if (!va) {
                    tx(endReadVal(s.n, res[ri][3]), x0 + 12, y + ch / 2, f + 1, col2 + 'ee', 'left', true);
                } else {
                    if (q < 0.4) {
                        ctx.globalAlpha = 1 - seg(q, 0, 0.4);
                        tx(endReadVal(p.n, res[ri][3]), x0 + 12, y + ch / 2, f + 1, col2 + 'ee', 'left', true);
                    }
                    if (q >= 0.5) {
                        ctx.globalAlpha = seg(q, 0.5, 1);
                        tx(endReadVal(s.n, res[ri][3]), x0 + 12, y + ch / 2, f + 1, col2 + 'ee', 'left', true);
                    }
                }
                ctx.globalAlpha = 1;
            }
        }

        if (s.n) {
            ctx.globalAlpha = fresh && p.n !== s.n ? seg(q, 0.6, 1) : 1;
            tx((mob ? '' : '두 CPU의 ') + (s.n === 1 ? '값이 같음' : '값이 다름'), x0 + w, top + L.r0 - 10, f, s.n === 1 ? P.green + 'ee' : P.yellow + 'ee', 'right', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var q = fresh ? clamp01(t) : 1;
        if (mode === 'net') endNetDraw(x0, top, w, mob, s, p, fresh, q);
        else if (mode === 'read') endReadDraw(x0, top, w, mob, s, p, fresh, q);
        else endStoreDraw(x0, top, w, mob, s, p, fresh, q);
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
        speedBtns.forEach(function (b) { b.classList.remove('end-viz__speed-btn--active'); });
        btn.classList.add('end-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('end-viz__mode-btn--active', d.key === m); });
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

    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'end-viz__btn end-viz__btn--primary',
        label: '3D 서랍장 우체국',
        onOpen: function () {
            vizReset();
            root.classList.add('end-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('end-viz--hidden');
            resize();
        }
    });

    setTimeout(resize, 60);
})();