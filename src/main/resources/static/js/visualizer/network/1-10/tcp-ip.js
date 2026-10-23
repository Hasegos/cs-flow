/**
 * TCP/IP 시각화
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
    var root    = el('div', 'tcp-viz');
    var toolbar = el('div', 'tcp-viz__toolbar');
    var tbLeft  = el('div', 'tcp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tcp-viz__title', 'TCP Connection'));

    var modeWrap = el('div', 'tcp-viz__mode');
    var modeDefs = [
        { key: 'handshake', label: '3-way Handshake' },
        { key: 'termination', label: '4-way Termination' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tcp-viz__mode-btn' + (i === 0 ? ' tcp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tcp-viz__speed');
    speedWrap.appendChild(el('span', 'tcp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tcp-viz__speed-btn' + (i === 0 ? ' tcp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tcp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tcp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tcp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tcp-viz__controls');
    var btnPlay  = el('button', 'tcp-viz__btn tcp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tcp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tcp-viz__btn', '↺ RESET');
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
    var mode    = 'handshake';
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
    const SCENARIOS = {
        handshake: [
            {
                log: '초기 상태. 클라이언트는 CLOSED, 서버는 LISTEN 상태입니다. 서버는 클라이언트의 연결 요청을 기다리고 있습니다.',
                pkt: null,
                clientState: 'CLOSED', serverState: 'LISTEN',
            },
            {
                log: 'Step 1 — SYN. 클라이언트가 연결을 요청합니다. 임의의 초기 시퀀스 번호(ISN=100)를 선택하고 SYN 플래그를 설정해 전송합니다. 클라이언트는 SYN_SENT 상태가 됩니다.',
                pkt: { dir: 'c2s', flag: 'SYN', detail: 'seq=100', color: 'purple' },
                clientState: 'SYN_SENT', serverState: 'LISTEN',
            },
            {
                log: 'Step 2 — SYN + ACK. 서버가 SYN을 수신했습니다. 자신의 ISN(seq=300)을 선택하고, 클라이언트 seq+1(ack=101)을 확인 번호로 설정해 SYN+ACK를 전송합니다. 서버는 SYN_RECEIVED 상태가 됩니다.',
                pkt: { dir: 's2c', flag: 'SYN + ACK', detail: 'seq=300, ack=101', color: 'teal' },
                clientState: 'SYN_SENT', serverState: 'SYN_RECEIVED',
            },
            {
                log: 'Step 3 — ACK. 클라이언트가 서버의 SYN+ACK를 수신했습니다. 서버 seq+1(ack=301)을 확인 번호로 설정해 ACK를 전송합니다. 양쪽 모두 ESTABLISHED 상태가 되어 데이터 전송이 가능합니다.',
                pkt: { dir: 'c2s', flag: 'ACK', detail: 'seq=101, ack=301', color: 'green' },
                clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
                done: true,
            },
        ],
        termination: [
            {
                log: '연결 종료 전. 양쪽 모두 ESTABLISHED 상태로 데이터 전송 중입니다. 클라이언트가 연결 종료를 시작합니다.',
                pkt: null,
                clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
            },
            {
                log: 'Step 1 — FIN. 클라이언트가 더 이상 보낼 데이터가 없어 연결 종료를 요청합니다. FIN 플래그를 설정해 전송합니다. 클라이언트는 FIN_WAIT_1 상태가 됩니다.',
                pkt: { dir: 'c2s', flag: 'FIN', detail: 'seq=200', color: 'orange' },
                clientState: 'FIN_WAIT_1', serverState: 'ESTABLISHED',
            },
            {
                log: 'Step 2 — ACK. 서버가 FIN을 수신하고 ACK를 전송합니다. 서버는 CLOSE_WAIT 상태가 됩니다. 클라이언트는 FIN_WAIT_2 상태가 됩니다. 서버는 아직 전송 중인 데이터가 있으면 계속 전송할 수 있습니다.',
                pkt: { dir: 's2c', flag: 'ACK', detail: 'ack=201', color: 'teal' },
                clientState: 'FIN_WAIT_2', serverState: 'CLOSE_WAIT',
            },
            {
                log: 'Step 3 — FIN. 서버가 남은 데이터를 모두 전송하고 연결 종료를 알립니다. FIN 플래그를 설정해 전송합니다. 서버는 LAST_ACK 상태가 됩니다.',
                pkt: { dir: 's2c', flag: 'FIN', detail: 'seq=500', color: 'orange' },
                clientState: 'FIN_WAIT_2', serverState: 'LAST_ACK',
            },
            {
                log: 'Step 4 — ACK. 클라이언트가 서버의 FIN을 수신하고 ACK를 전송합니다. 클라이언트는 TIME_WAIT(2MSL) 상태를 거쳐 CLOSED됩니다. 서버는 ACK 수신 즉시 CLOSED됩니다.',
                pkt: { dir: 'c2s', flag: 'ACK', detail: 'ack=501', color: 'green' },
                clientState: 'TIME_WAIT', serverState: 'CLOSED',
                done: true,
            },
        ],
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return SCENARIOS[mode];
    }
    function defaultLog() {
        return mode === 'termination'
            ? '▶ PLAY를 눌러 TCP 4-way Termination 과정을 확인하세요.'
            : '▶ PLAY를 눌러 TCP 3-way Handshake 과정을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 단계 설명 ===================== */
    function tpNote(i) {
        var hs = [
            '초기 상태. 서버는 LISTEN으로 연결 요청을 기다립니다.',
            'SYN은 번호를 1 차지합니다. 클라이언트 seq 100 → 다음 seq 101',
            '서버 ack = 클라이언트 seq + 1 = 101. 서버는 자신의 seq 300을 보냅니다.',
            '클라이언트 ack = 서버 seq + 1 = 301로 확인합니다. 양쪽 ESTABLISHED.',
        ];
        var td = [
            '양쪽 ESTABLISHED. 데이터 전송 후 클라이언트가 FIN으로 종료를 시작합니다.',
            'FIN도 번호를 1 차지합니다. 클라이언트 seq 200.',
            'ack = 200 + 1 = 201. 서버는 아직 보낼 데이터가 남았을 수 있습니다.',
            '서버 seq 500. 남은 데이터를 보낸 뒤 FIN을 보냅니다. 서버 LAST_ACK.',
            'ack = 500 + 1 = 501. 클라이언트는 TIME_WAIT 후 닫히고 서버는 바로 닫힙니다.',
        ];
        var list = mode === 'termination' ? td : hs;
        return list[i] || '';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var noteFs = mob ? 11 : 13;
        var lh = mob ? 16 : 19;
        var steps = currentSteps();
        var nLines = 1;
        for (var i = 0; i < steps.length; i++) {
            var cnt = lines(tpNote(i), w - 8, noteFs).length;
            if (cnt > nLines) nLines = cnt;
        }
        var hostH = mob ? 44 : 52;
        var rowH = mob ? 44 : 54;
        var chipH = mob ? 18 : 20;
        var yLad = hostH + (mob ? 12 : 16);
        var yLadBot = yLad + (steps.length - 1) * rowH;
        var yChip = yLadBot + 10;
        var yNum = yChip + chipH + 6;
        var yNote = yNum + chipH + 10;
        var yBar = yNote + nLines * lh + 8;
        var barH = mob ? 6 : 8;
        return {
            mob: mob, hostW: mob ? 92 : 124, hostH: hostH, rowH: rowH, rows: steps.length - 1,
            chipH: chipH, noteFs: noteFs, lh: lh, fsF: mob ? 11 : 12,
            yLad: yLad, yLadBot: yLadBot, yChip: yChip, yNum: yNum, yNote: yNote,
            yBar: yBar, barH: barH, total: yBar + barH + 6
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function tpStateCol(state, side) {
        if (state === 'ESTABLISHED') return P.green;
        if (state === 'CLOSED') return P.muted;
        if (state === 'LISTEN' || state.indexOf('SYN') === 0) return side === 'client' ? P.purple : P.teal;
        return P.orange;
    }
    function tpRowY(L, top, r) {
        return top + L.yLad + r * L.rowH + L.rowH / 2;
    }
    function tpHost(L, cx, top, name, side, from, to, k) {
        var hw = L.hostW, hh = L.hostH, x = cx - hw / 2, y = top;
        var same = from === to;
        var colA = tpStateCol(from, side), colB = tpStateCol(to, side);
        var nameCol = side === 'client' ? P.purple : P.teal;
        ctx.globalAlpha = same ? 1 : 1 - k;
        rr(x, y, hw, hh, 6, colA + '22', colA + 'cc', 2);
        tx(name, cx, y + hh * 0.34, L.mob ? 12 : 14, nameCol + 'ff', 'center', true);
        tx(from, cx, y + hh * 0.74, L.mob ? 11 : 12, colA + 'ff', 'center', true);
        if (!same) {
            ctx.globalAlpha = k;
            rr(x, y, hw, hh, 6, colB + '22', colB + 'cc', 2);
            tx(to, cx, y + hh * 0.74, L.mob ? 11 : 12, colB + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
    }
    function tpArrow(L, fx, tox, y, pk, alpha) {
        var cc = colorOf(pk.color);
        var mid = (fx + tox) / 2;
        ctx.globalAlpha = alpha;
        arrow(fx, y, tox, y, cc + 'cc', 2);
        tx(pk.flag, mid, y - 11, L.fsF, cc + 'ff', 'center', true);
        tx(pk.detail, mid, y + 11, L.fsF, P.sub + 'ff', 'center', false);
        ctx.globalAlpha = 1;
    }
    function tpChip(L, cx, cy, pk, cc) {
        ctx.font = '700 ' + L.fsF + 'px "JetBrains Mono",monospace';
        var cw = ctx.measureText(pk.flag).width + 14;
        rr(cx - cw / 2, cy - L.chipH / 2, cw, L.chipH, L.chipH / 2, cc + 'ff', null);
        tx(pk.flag, cx, cy, L.fsF, '#111111ff', 'center', true);
        tx(pk.detail, cx, cy + L.chipH / 2 + 9, L.fsF, P.sub + 'ff', 'center', false);
    }

    /* ===================== 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var ghost = !step;
        var s = step || steps[0];
        var idx = ghost ? 0 : steps.indexOf(step);
        var fresh = !ghost && !!prev && prev !== step;
        var pv = fresh ? prev : s;
        var pk = s.pkt || null;
        var cX = x0 + L.hostW / 2;
        var sX = x0 + w - L.hostW / 2;
        var sender = pk && pk.dir === 'c2s' ? 'client' : 'server';
        var moveP = fresh && pk ? ez(seg(t, 0, 0.8)) : 1;
        var arrive = fresh && pk ? ez(seg(t, 0.8, 1)) : 1;
        var kC = fresh && pv.clientState !== s.clientState
            ? (sender === 'client' ? ez(seg(t, 0, 0.3)) : ez(seg(t, 0.8, 1))) : 1;
        var kS = fresh && pv.serverState !== s.serverState
            ? (sender === 'server' ? ez(seg(t, 0, 0.3)) : ez(seg(t, 0.8, 1))) : 1;

        tpHost(L, cX, top, 'CLIENT', 'client', pv.clientState, s.clientState, kC);
        tpHost(L, sX, top, 'SERVER', 'server', pv.serverState, s.serverState, kS);

        var yTop = top + L.hostH;
        var yBot = top + L.yLadBot;
        ln(cX, yTop, cX, yBot, P.muted + '99', 1.5, [6, 4]);
        ln(sX, yTop, sX, yBot, P.muted + '99', 1.5, [6, 4]);

        if (pk && !ghost) {
            ctx.fillStyle = colorOf(pk.color) + '14';
            ctx.fillRect(x0, tpRowY(L, top, idx - 1) - L.rowH / 2, w, L.rowH);
        }

        for (var r = 0; r < L.rows; r++) {
            var rp = steps[r + 1].pkt;
            var ry = tpRowY(L, top, r);
            var rfx = rp.dir === 'c2s' ? cX : sX;
            var rtx = rp.dir === 'c2s' ? sX : cX;
            if (ghost) {
                tpArrow(L, rfx, rtx, ry, rp, 0.3);
            } else if (r + 1 < idx) {
                tpArrow(L, rfx, rtx, ry, rp, 1);
            } else if (r + 1 > idx) {
                ln(rfx, ry, rtx, ry, P.muted + '88', 1.2, [4, 4]);
            }
        }

        if (pk && !ghost) {
            var cc = colorOf(pk.color);
            var cy = tpRowY(L, top, idx - 1);
            var afx = pk.dir === 'c2s' ? cX : sX;
            var atx = pk.dir === 'c2s' ? sX : cX;
            if (moveP < 1) {
                var px = afx + (atx - afx) * moveP;
                ln(afx, cy, px, cy, cc + '88', 2);
                tpChip(L, px, cy, pk, cc);
            } else {
                tpArrow(L, afx, atx, cy, pk, 1);
                if (fresh) {
                    ctx.globalAlpha = 1 - arrive;
                    circ(atx, cy, 6 + 10 * arrive, null, cc + 'ff', 2);
                    ctx.globalAlpha = 1;
                }
            }
        }

        var hdr = fresh && t < 0.8 ? (prev.pkt || null) : pk;
        var names = ['SYN', 'ACK', 'FIN'];
        var cwF = L.mob ? 50 : 64;
        var gapF = 6;
        var totF = names.length * cwF + (names.length - 1) * gapF;
        var fx0 = x0 + (w - totF) / 2;
        var hf = hdr ? hdr.flag.split(' + ') : [];
        for (var n = 0; n < names.length; n++) {
            var on = hf.indexOf(names[n]) >= 0;
            var bx = fx0 + n * (cwF + gapF);
            var fc = on ? colorOf(hdr.color) : P.muted;
            rr(bx, top + L.yChip, cwF, L.chipH, L.chipH / 2, on ? fc + '33' : null, fc + (on ? 'ff' : '88'), 1.2);
            tx(names[n], bx + cwF / 2, top + L.yChip + L.chipH / 2, L.fsF, (on ? fc : P.sub) + 'ff', 'center', true);
        }

        var parts = hdr ? hdr.detail.split(', ') : [];
        var yN = top + L.yNum;
        if (parts.length) {
            var nc = colorOf(hdr.color);
            ctx.font = '700 ' + L.fsF + 'px "JetBrains Mono",monospace';
            var widths = [];
            var totN = 0;
            for (var q = 0; q < parts.length; q++) {
                var pw = ctx.measureText(parts[q]).width + 16;
                widths.push(pw);
                totN += pw + (q > 0 ? 6 : 0);
            }
            var nx = x0 + (w - totN) / 2;
            for (var q2 = 0; q2 < parts.length; q2++) {
                rr(nx, yN, widths[q2], L.chipH, L.chipH / 2, nc + '22', nc + 'cc', 1.2);
                tx(parts[q2], nx + widths[q2] / 2, yN + L.chipH / 2, L.fsF, nc + 'ff', 'center', true);
                nx += widths[q2] + 6;
            }
        } else {
            tx('아직 도착한 패킷 없음', x0 + w / 2, yN + L.chipH / 2, L.fsF, P.sub + 'ff', 'center', false);
        }

        var ni = fresh && t < 0.5 ? idx - 1 : idx;
        var nl = lines(tpNote(ni), w - 8, L.noteFs);
        for (var li = 0; li < nl.length; li++) {
            tx(nl[li], x0 + w / 2, top + L.yNote + li * L.lh + L.lh / 2, L.noteFs, P.text + 'ff', 'center', false);
        }

        var arrD = pk && fresh ? arrive : 1;
        var frac = idx > 0 ? (idx - 1 + arrD) / L.rows : 0;
        rr(x0, top + L.yBar, w, L.barH, L.barH / 2, P.muted + '33', null);
        if (frac > 0) rr(x0, top + L.yBar, w * frac, L.barH, L.barH / 2, P.teal + 'ff', null);
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
        speedBtns.forEach(function (b) { b.classList.remove('tcp-viz__speed-btn--active'); });
        btn.classList.add('tcp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tcp-viz__mode-btn--active', d.key === m); });
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