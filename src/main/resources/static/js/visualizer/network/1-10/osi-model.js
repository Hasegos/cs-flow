/**
 * OSI 7계층 시각화 시각화
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
    var root    = el('div', 'osi-viz');
    var toolbar = el('div', 'osi-viz__toolbar');
    var tbLeft  = el('div', 'osi-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'osi-viz__title', 'OSI 7-Layer Model'));

    var modeWrap = el('div', 'osi-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'osi-viz__mode-btn' + (i === 0 ? ' osi-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'osi-viz__speed');
    speedWrap.appendChild(el('span', 'osi-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'osi-viz__speed-btn' + (i === 0 ? ' osi-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'osi-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'osi-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'osi-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'osi-viz__controls');
    var btnPlay  = el('button', 'osi-viz__btn osi-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'osi-viz__btn', '▶| STEP');
    var btnReset = el('button', 'osi-viz__btn', '↺ RESET');
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

    /* ===================== 계층 정의 ===================== */
    const LAYERS = [
        { num: 7, name: 'Application',  unit: 'Message', proto: 'HTTP / DNS / SMTP'  },
        { num: 6, name: 'Presentation', unit: 'Message', proto: 'SSL/TLS / JPEG'     },
        { num: 5, name: 'Session',      unit: 'Message', proto: 'NetBIOS / RPC'      },
        { num: 4, name: 'Transport',    unit: 'Segment', proto: 'TCP / UDP'          },
        { num: 3, name: 'Network',      unit: 'Packet',  proto: 'IPv4 / IPv6 / ICMP' },
        { num: 2, name: 'Data Link',    unit: 'Frame',   proto: 'Ethernet / Wi-Fi'   },
        { num: 1, name: 'Physical',     unit: 'Bit',     proto: 'Cable / Wi-Fi'      },
    ];

    function layerColor(idx) {
        return [
            '#6C63FF',
            '#9B8FF7',
            '#4ECDC4',
            '#45B7D1',
            '#F7B731',
            '#F59E0B',
            '#EF4444',
        ][idx] || P.purple;
    }

    var HDR_LABEL = ['', '', '', 'TCP', 'IP', 'ETH', ''];

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            log: 'Step 1 — 송신 호스트 Application 계층. 사용자가 HTTP 요청을 생성합니다. 아직 헤더가 없는 순수 데이터(Message) 상태입니다.',
            phase: 'enc', activeLayer: 0,
        },
        {
            log: 'Step 2 — Transport 계층. TCP 헤더(출발지·목적지 포트, 시퀀스 번호)를 앞에 붙입니다. 데이터 단위가 세그먼트(Segment)가 됩니다.',
            phase: 'enc', activeLayer: 3,
        },
        {
            log: 'Step 3 — Network 계층. IP 헤더(출발지·목적지 IP 주소, TTL)를 앞에 붙입니다. 데이터 단위가 패킷(Packet)이 됩니다. 라우터가 이 헤더를 보고 경로를 결정합니다.',
            phase: 'enc', activeLayer: 4,
        },
        {
            log: 'Step 4 — Data Link 계층. Ethernet 헤더(MAC 주소)와 트레일러(FCS)를 붙입니다. 데이터 단위가 프레임(Frame)이 됩니다.',
            phase: 'enc', activeLayer: 5,
        },
        {
            log: 'Step 5 — Physical 계층. 프레임을 전기·광·무선 신호(비트 스트림)로 변환해 전송 매체로 내보냅니다. 캡슐화 완료.',
            phase: 'enc', activeLayer: 6,
        },
        {
            log: 'Step 6 — 비트 스트림이 물리 매체를 통해 수신 호스트로 이동합니다. 라우터가 IP 헤더를 읽어 경로를 결정하며 중간 전달합니다.',
            phase: 'travel', activeLayer: 6,
        },
        {
            log: 'Step 7 — 수신 호스트 Physical → Data Link. 비트를 프레임으로 복원하고 Ethernet 헤더·트레일러를 제거합니다. CRC로 오류를 검사합니다.',
            phase: 'dec', activeLayer: 5,
        },
        {
            log: 'Step 8 — Network → Transport → Application. IP·TCP 헤더를 순서대로 제거하고 순서 재조합·신뢰성 확인 후 Application에 전달 — 역캡슐화 완료 ✓',
            phase: 'dec', activeLayer: 0,
            done: true,
        },
    ];

    let pktProg = 1;

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 OSI 7계층 캡슐화 흐름을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 단계 동작 ===================== */
    var OSI_TAGS = ['ETH', 'IP', 'TCP', 'DATA', 'FCS'];
    var OSI_BEATS = [
        [{ o: 'show' }],
        [{ o: 'slide', to: 3 }, { o: 'add', tag: 'TCP' }],
        [{ o: 'slide', to: 4 }, { o: 'add', tag: 'IP' }],
        [{ o: 'slide', to: 5 }, { o: 'add', tag: 'ETH' }, { o: 'add', tag: 'FCS' }],
        [{ o: 'slide', to: 6 }, { o: 'tobits' }],
        [{ o: 'travel' }],
        [{ o: 'unbits' }, { o: 'slide', to: 5 }, { o: 'crc' }, { o: 'strip', tag: 'ETH' }, { o: 'strip', tag: 'FCS' }],
        [{ o: 'slide', to: 4 }, { o: 'strip', tag: 'IP' }, { o: 'slide', to: 3 }, { o: 'strip', tag: 'TCP' }, { o: 'slide', to: 0 }, { o: 'done' }]
    ];

    function osiApply(st, b, p) {
        if (b.o === 'show') { st.dataA = p; }
        else if (b.o === 'slide') { st.vy = st.lay + (b.to - st.lay) * p; if (p >= 1) st.lay = b.to; }
        else if (b.o === 'add') { st.has[b.tag] = p; }
        else if (b.o === 'strip') { st.has[b.tag] = 1 - p; }
        else if (b.o === 'tobits') { st.bitsP = p; }
        else if (b.o === 'unbits') { st.bitsP = 1 - p; }
        else if (b.o === 'travel') {
            st.travP = p;
            if (p > 0 && p < 1) st.side = 'M';
            if (p >= 1) { st.side = 'R'; st.lay = 6; st.vy = 6; }
        }
        else if (b.o === 'crc') { st.crcP = p; }
        else if (b.o === 'done') { st.doneP = p; }
    }

    /* ===================== 상태 계산 ===================== */
    function osiState(k, t) {
        var st = { side: 'S', lay: 0, vy: 0, dataA: 0, has: { ETH: 0, IP: 0, TCP: 0, FCS: 0 }, bitsP: 0, travP: 0, crcP: 0, doneP: 0 };
        if (k < 0) {
            st.dataA = 1;
            st.has = { ETH: 1, IP: 1, TCP: 1, FCS: 1 };
            return st;
        }
        for (var i = 0; i < k; i++) {
            OSI_BEATS[i].forEach(function (b) { osiApply(st, b, 1); });
        }
        var bs = OSI_BEATS[k];
        for (var j = 0; j < bs.length; j++) {
            var a = j / bs.length;
            var c = (j + 1) / bs.length;
            osiApply(st, bs[j], ez(seg(t, a, c)));
            if (t < c) break;
        }
        return st;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var capH = mob ? 13 : 16;
        var rowH = mob ? 30 : 40;
        var gap = mob ? 4 : 5;
        var medW = mob ? 26 : 96;
        var colW = Math.floor((w - medW) / 2);
        var inset = mob ? 12 : 22;
        var yL = capH + 6;
        var pitch = rowH + gap;
        var ladH = 7 * pitch - gap;
        var lblH = mob ? 14 : 16;
        var yLbl = yL + ladH + 10;
        var yBar = yLbl + lblH + 6;
        var barH = mob ? 26 : 30;
        return {
            mob: mob, capH: capH, rowH: rowH, pitch: pitch, medW: medW, colW: colW,
            inset: inset, rowW: colW - inset, rail: mob ? 6 : 10,
            yL: yL, lblH: lblH, yLbl: yLbl, yBar: yBar, barH: barH,
            total: yBar + barH + 4
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 ===================== */
    function osiRow(x, y, w, h, idx, col, on, mob, fs) {
        var lay = LAYERS[idx];
        if (on) rr(x, y, w, h, 5, col + '2a', col + 'ff', 2);
        else rr(x, y, w, h, 5, P.surf, P.border, 1.2);
        var c = on ? col + 'ff' : P.text + 'ff';
        if (mob) {
            tx(lay.name, x + 6, y + h / 2, fs, c, 'left', on);
        } else {
            tx('L' + lay.num, x + 17, y + h / 2, fs, on ? col + 'ff' : P.sub + 'ff', 'center', true);
            tx(lay.name, x + 38, y + h * 0.36, 13, c, 'left', on);
            tx(lay.proto, x + 38, y + h * 0.74, fs, P.sub + 'ff', 'left', false);
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var k = step ? steps.indexOf(step) : -1;
        var ghost = k < 0;
        var gA = ghost ? 0.3 : 1;
        var st = osiState(k, t);
        var fs = mob ? 11 : 12;
        var sx0 = x0 + L.inset;
        var rx0 = x0 + w - L.colW;
        var cxL = x0 + L.colW + L.medW / 2;
        var sRail = x0 + L.rail;
        var rRail = x0 + w - L.rail;
        function rowY(v) { return top + L.yL + v * L.pitch; }
        var yC6 = rowY(6) + L.rowH / 2;

        tx('송신 호스트', sx0 + L.rowW / 2, top + L.capH / 2, fs, P.purple + 'ff', 'center', true);
        tx('수신 호스트', rx0 + L.rowW / 2, top + L.capH / 2, fs, P.teal + 'ff', 'center', true);
        if (!mob) tx('전송 매체', cxL, top + L.capH / 2, fs, P.sub + 'ff', 'center', false);

        ln(sRail, rowY(0) + L.rowH / 2, sRail, yC6, P.muted + '77', 1.2, [3, 3]);
        ln(rRail, rowY(0) + L.rowH / 2, rRail, yC6, P.muted + '77', 1.2, [3, 3]);
        ln(sx0 + L.rowW, yC6, rx0, yC6, P.muted + '77', 1.5, [4, 4]);

        var rOn = st.side === 'M' ? Math.sin(Math.PI * st.travP) : 0;
        var rY = rowY(4) + L.rowH / 2;
        var rw = mob ? 22 : 64;
        var rh = mob ? 22 : 30;
        var rxL = cxL - rw / 2;
        rr(rxL, rY - rh / 2, rw, rh, 6, P.surf, P.purple + 'cc', 1.5);
        if (rOn > 0) {
            ctx.globalAlpha = rOn;
            rr(rxL, rY - rh / 2, rw, rh, 6, P.purple + '55', P.purple + 'ff', 2);
            ctx.globalAlpha = 1;
        }
        tx(mob ? 'R' : '라우터', cxL, rY, fs, P.text + 'ff', 'center', true);

        for (var i = 0; i < 7; i++) {
            var y = rowY(i);
            var col = layerColor(i);
            var onS = !ghost && st.side === 'S' && Math.round(st.vy) === i;
            var onR = st.side === 'R' && Math.round(st.vy) === i;
            var cR = (onR && i === 0 && st.doneP > 0) ? P.green : col;
            osiRow(sx0, y, L.rowW, L.rowH, i, col, onS, mob, fs);
            osiRow(rx0, y, L.rowW, L.rowH, i, cR, onR, mob, fs);
        }

        var dx, dy;
        if (st.side === 'M') { dx = sRail + (rRail - sRail) * st.travP; dy = yC6; }
        else { dx = st.side === 'R' ? rRail : sRail; dy = rowY(st.vy) + L.rowH / 2; }
        if (st.dataA > 0) {
            var dotCol = (st.side === 'R' && st.doneP > 0.5) ? P.green : P.yellow;
            ctx.globalAlpha = st.dataA * gA;
            circ(dx, dy, mob ? 9 : 12, dotCol + '33', null);
            circ(dx, dy, mob ? 4.5 : 6.5, dotCol + 'ff', null);
            ctx.globalAlpha = 1;
        }

        var lblY = top + L.yLbl + L.lblH / 2;
        tx('단위: ' + LAYERS[st.lay].unit, x0, lblY, fs, P.text + 'ff', 'left', true);
        tx(st.side === 'M' ? '매체 전송 중' : 'L' + LAYERS[st.lay].num + ' ' + LAYERS[st.lay].name,
           x0 + w, lblY, fs, P.sub + 'ff', 'right', false);

        var fsC = mob ? 11 : 12;
        var chipH = L.barH - 8;
        var cy = top + L.yBar + 4;
        var chipsA = Math.max(0, 1 - 2 * st.bitsP);
        var bitsA = Math.max(0, 2 * st.bitsP - 1);
        rr(x0, top + L.yBar, w, L.barH, 6, P.surf, P.border, 1.2);
        ctx.font = '700 ' + fsC + 'px "JetBrains Mono",monospace';
        var cws = OSI_TAGS.map(function (tg) { return ctx.measureText(tg).width + 14; });
        var total = cws.reduce(function (a, b) { return a + b; }, 0) + 4 * (OSI_TAGS.length - 1);
        var cx = x0 + (w - total) / 2;
        var pos = {};
        OSI_TAGS.forEach(function (tg, n) {
            var cw = cws[n];
            var colr = tg === 'DATA' ? ((st.doneP > 0.5) ? P.green : P.yellow)
                     : tg === 'TCP' ? layerColor(3)
                     : tg === 'IP' ? layerColor(4)
                     : layerColor(5);
            pos[tg] = { x: cx, w: cw };
            ctx.globalAlpha = chipsA * gA;
            ctx.setLineDash([3, 3]);
            rr(cx, cy, cw, chipH, 4, null, P.muted + '99', 1);
            ctx.setLineDash([]);
            var a = (tg === 'DATA' ? st.dataA : st.has[tg]) * chipsA * gA;
            if (a > 0) {
                ctx.globalAlpha = a;
                rr(cx, cy, cw, chipH, 4, colr + 'ff', null);
                tx(tg, cx + cw / 2, cy + chipH / 2, fsC, '#111111', 'center', true);
            }
            ctx.globalAlpha = 1;
            cx += cw + 4;
        });
        if (st.crcP > 0 && st.has.FCS > 0.5) {
            ctx.globalAlpha = st.crcP * st.has.FCS * chipsA;
            rr(pos.FCS.x - 2, cy - 2, pos.FCS.w + 4, chipH + 4, 6, null, P.green + 'ff', 2);
            ctx.globalAlpha = 1;
        }
        if (bitsA > 0) {
            ctx.globalAlpha = bitsA * gA;
            rr(x0 + 6, cy, w - 12, chipH, 5, P.yellow + '33', P.yellow + 'bb', 1.2);
            tx('0110100111010010', x0 + w / 2, cy + chipH / 2, fsC, P.text + 'ff', 'center', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('osi-viz__speed-btn--active'); });
        btn.classList.add('osi-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('osi-viz__mode-btn--active', d.key === m); });
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