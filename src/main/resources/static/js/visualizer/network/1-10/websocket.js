/**
 * WebSocket 시각화
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
    var root    = el('div', 'ws-viz');
    var toolbar = el('div', 'ws-viz__toolbar');
    var tbLeft  = el('div', 'ws-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ws-viz__title', 'WebSocket Protocol'));

    var modeWrap = el('div', 'ws-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ws-viz__mode-btn' + (i === 0 ? ' ws-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ws-viz__speed');
    speedWrap.appendChild(el('span', 'ws-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ws-viz__speed-btn' + (i === 0 ? ' ws-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ws-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ws-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ws-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ws-viz__controls');
    var btnPlay  = el('button', 'ws-viz__btn ws-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ws-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ws-viz__btn', '↺ RESET');
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

    /* ===================== 시나리오 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저가 ws://example.com/chat에 접속합니다. WebSocket은 HTTP Upgrade 핸드셰이크로 시작합니다.',
            pkt: null,
            clientState: 'CLOSED', serverState: 'LISTEN',
        },
        {
            log: 'Step 1 — HTTP GET Upgrade 요청. 클라이언트가 HTTP/1.1 GET 요청에 Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Key 헤더를 포함해 전송합니다.',
            pkt: { dir: 'c2s', label: 'GET /chat HTTP/1.1', sub: 'Upgrade: websocket | Sec-WebSocket-Key', color: 'muted', phase: 'http' },
            clientState: 'CONNECTING', serverState: 'LISTEN',
        },
        {
            log: 'Step 2 — 101 Switching Protocols. 서버가 Sec-WebSocket-Accept 헤더와 함께 101로 응답합니다. 이 시점부터 HTTP가 아닌 WebSocket 프로토콜로 전환됩니다.',
            pkt: { dir: 's2c', label: '101 Switching Protocols', sub: 'Upgrade: websocket | Sec-WebSocket-Accept', color: 'teal', phase: 'http' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 3 — WebSocket 연결 수립 ✓  양방향 채널이 열렸습니다. 이제 HTTP 오버헤드 없이 프레임 단위로 데이터를 주고받을 수 있습니다.',
            pkt: null,
            clientState: 'OPEN', serverState: 'OPEN',
            divider: 'ws',
        },
        {
            log: 'Step 4 — 클라이언트 → 서버 메시지. 텍스트 프레임(OpCode: 0x1)으로 채팅 메시지를 전송합니다. 클라이언트 메시지는 반드시 마스킹됩니다.',
            pkt: { dir: 'c2s', label: '💬 "안녕하세요!"', sub: 'Text Frame | OpCode: 0x1 | Masked', color: 'purple', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 5 — 서버 → 클라이언트 메시지. 서버가 다른 사용자의 메시지를 브로드캐스트합니다. 서버 메시지는 마스킹하지 않습니다.',
            pkt: { dir: 's2c', label: '💬 "반갑습니다!"', sub: 'Text Frame | OpCode: 0x1 | Unmasked', color: 'green', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 6 — 서버 Ping. 서버가 연결 유지를 위해 Ping 프레임을 전송합니다. 클라이언트는 즉시 Pong으로 응답해야 합니다.',
            pkt: { dir: 's2c', label: 'Ping 🏓', sub: 'Ping Frame | OpCode: 0x9', color: 'yellow', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 7 — 클라이언트 Pong. Ping에 대한 응답입니다. Pong이 돌아오지 않으면 서버는 연결이 끊겼다고 판단합니다.',
            pkt: { dir: 'c2s', label: 'Pong 🏓', sub: 'Pong Frame | OpCode: 0xA', color: 'yellow', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 8 — 바이너리 데이터 전송. 이미지나 파일도 Binary Frame(OpCode: 0x2)으로 전송할 수 있습니다. HTTP multipart 없이 효율적으로 전송됩니다.',
            pkt: { dir: 'c2s', label: '📁 Binary Data', sub: 'Binary Frame | OpCode: 0x2', color: 'orange', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 9 — 연결 종료. 클라이언트가 Close Frame(OpCode: 0x8)을 전송합니다. 상태 코드 1000은 정상 종료를 의미합니다.',
            pkt: { dir: 'c2s', label: 'Close Frame', sub: 'OpCode: 0x8 | Code: 1000 (Normal)', color: 'muted', phase: 'close' },
            clientState: 'CLOSING', serverState: 'OPEN',
        },
        {
            log: 'Step 10 — 서버 Close 응답 ✓  서버도 Close Frame으로 응답하고 TCP 연결을 닫습니다. WebSocket 세션 종료. HTTP 요청 1회로 수백 개의 메시지를 교환했습니다.',
            pkt: { dir: 's2c', label: 'Close Frame', sub: 'OpCode: 0x8 | TCP 연결 종료', color: 'muted', phase: 'close' },
            clientState: 'CLOSED', serverState: 'CLOSED',
            done: true,
        },
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 WebSocket 연결 과정을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function wsIdx(step) {
        return step ? STEPS.indexOf(step) : -1;
    }
    function wsPhase(i) {
        if (i >= 9) return 2;
        if (i >= 3) return 1;
        if (i >= 1) return 0;
        return -1;
    }
    function wsCol(name) {
        if (name === 'teal')   return P.teal;
        if (name === 'green')  return P.green;
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        if (name === 'muted')  return P.muted;
        return P.purple;
    }
    function wsHostCol(side, st) {
        if (st === 'OPEN') return P.green;
        if (side === 'c') return st === 'CONNECTING' ? P.yellow : P.purple;
        return P.teal;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fsL = mob ? 11 : 13;
        var fsS = mob ? 11 : 12;
        var lblH = fsL + 5;
        var subLH = fsS + 3;
        var barH = mob ? 18 : 22;
        var hostW = mob ? 84 : 124;
        var hostH = mob ? 42 : 52;
        var y = barH + 10 + hostH + 10;
        var rows = [];
        STEPS.forEach(function (s, i) {
            if (!s.divider && !s.pkt) return;
            var h = mob ? 24 : 28;
            if (s.pkt) {
                h = lines(s.pkt.label, w - 12, fsL).length * lblH + 3
                    + lines(s.pkt.sub, w - 12, fsS).length * subLH + 12;
            }
            rows[i] = { top: y, h: h };
            y += h;
        });
        return {
            fsL: fsL, fsS: fsS, lblH: lblH, subLH: subLH,
            barH: barH, hostW: hostW, hostH: hostH,
            rows: rows, total: y + 8
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 보조 ===================== */
    function wsArrow(fx, tgX, y, col, a, solid) {
        ctx.globalAlpha = a;
        ln(fx, y, tgX, y, col + (solid ? 'ff' : '77'), solid ? 2.2 : 1.4, solid ? [] : [4, 3]);
        var ad = tgX > fx ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(tgX, y);
        ctx.lineTo(tgX - ad * 9, y - 5);
        ctx.lineTo(tgX - ad * 9, y + 5);
        ctx.closePath();
        ctx.fillStyle = col + (solid ? 'ff' : '77');
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    function wsChip(px, y, pkt, mob) {
        var tag = pkt.phase === 'http' ? 'HTTP' : (pkt.phase === 'close' ? 'CLOSE' : 'WS');
        var cw = mob ? 42 : 50;
        rr(px - cw / 2, y - 9, cw, 18, 4, wsCol(pkt.color) + 'ff', null);
        tx(tag, px, y, 11, '#111111', 'center', true);
    }
    function wsText(pkt, L, x, blockTop, a, w) {
        var col = wsCol(pkt.color);
        ctx.globalAlpha = a;
        var y = blockTop;
        lines(pkt.label, w - 12, L.fsL).forEach(function (l) {
            tx(l, x, y + L.lblH / 2, L.fsL, col + 'ff', 'center', true);
            y += L.lblH;
        });
        y += 3;
        lines(pkt.sub, w - 12, L.fsS).forEach(function (l) {
            tx(l, x, y + L.subLH / 2, L.fsS, P.sub + 'ff', 'center', false);
            y += L.subLH;
        });
        ctx.globalAlpha = 1;
    }
    function wsHost(cx, y, L, name, side, st, pst, e) {
        var items = st !== pst ? [[pst, 1 - e], [st, e]] : [[st, 1]];
        items.forEach(function (it) {
            var col = wsHostCol(side, it[0]);
            ctx.globalAlpha = it[1];
            rr(cx - L.hostW / 2, y, L.hostW, L.hostH, 6, col + '22', col + 'ff', 2);
            tx(name, cx, y + L.hostH * 0.33, L.fsS + 1, col + 'ff', 'center', true);
            tx(it[0], cx, y + L.hostH * 0.72, L.fsS, col + 'ff', 'center', false);
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var idx = wsIdx(step);
        var fresh = !!step && !!prev && prev !== step;
        var s = step || STEPS[0];
        var p = fresh ? prev : s;
        var pIdx = fresh ? wsIdx(prev) : idx;
        var e = fresh ? ez(t) : 1;
        var hE = fresh ? (s.pkt ? ez(seg(t, 0.7, 1)) : e) : 1;
        var cX = x0 + L.hostW / 2;
        var sX = x0 + w - L.hostW / 2;
        var mid = x0 + w / 2;
        var yHost = top + L.barH + 10;

        var ph = wsPhase(idx), phP = wsPhase(pIdx);
        var starts = [1, 3, 9];
        var names = ['HTTP', 'WebSocket', 'Close'];
        var cols = [P.teal, P.green, P.orange];
        var segW = (w - 4) / 3;
        names.forEach(function (nm, q) {
            var bx = x0 + q * (segW + 2);
            var on = ph === q;
            var reached = idx >= starts[q];
            ctx.globalAlpha = on ? 0.4 * (fresh && phP !== ph ? e : 1) : (reached ? 0.16 : 0.06);
            rr(bx, top, segW, L.barH, 4, cols[q] + 'ff', null);
            ctx.globalAlpha = 1;
            var bc = (on || reached) ? cols[q] + 'ff' : P.sub + '66';
            rr(bx, top, segW, L.barH, 4, null, bc, 1.2);
            tx(nm, bx + segW / 2, top + L.barH / 2, L.fsS, P.text + 'ff', 'center', true);
        });

        var cs = s.clientState || 'CLOSED';
        var ss = s.serverState || 'LISTEN';
        var pcs = fresh ? (p.clientState || 'CLOSED') : cs;
        var pss = fresh ? (p.serverState || 'LISTEN') : ss;
        wsHost(cX, yHost, L, 'CLIENT', 'c', cs, pcs, hE);
        wsHost(sX, yHost, L, 'SERVER', 's', ss, pss, hE);

        var yBot = top + L.total - 6;
        ln(cX, yHost + L.hostH, cX, yBot, P.border + 'cc', 1.5, [5, 4]);
        ln(sX, yHost + L.hostH, sX, yBot, P.border + 'cc', 1.5, [5, 4]);

        var DIV = 'WebSocket 연결 수립';
        STEPS.forEach(function (st, i) {
            var r = L.rows[i];
            if (!r) return;
            var y0 = top + r.top;
            if (st.divider) {
                var dy = y0 + r.h / 2;
                ctx.globalAlpha = idx < i ? 0.5 : (idx === i && fresh ? e : 1);
                ln(cX, dy, sX, dy, P.green + '66', 1, [4, 4]);
                ctx.font = '700 ' + L.fsS + 'px "JetBrains Mono",monospace';
                var dw = ctx.measureText(DIV).width + 16;
                rr(mid - dw / 2, dy - 9, dw, 18, 9, P.green + '22', P.green + '88', 1.2);
                tx(DIV, mid, dy, L.fsS, P.green + 'ff', 'center', true);
                ctx.globalAlpha = 1;
                return;
            }
            var pkt = st.pkt;
            if (!pkt) return;
            var c2s = pkt.dir === 'c2s';
            var fx = c2s ? cX : sX;
            var tgX = c2s ? sX : cX;
            var lineY = c2s ? y0 + r.h - 8 : y0 + 8;
            var blockTop = c2s ? y0 : y0 + 16;
            var col = wsCol(pkt.color);

            if (i > idx) {
                wsArrow(fx, tgX, lineY, col, 0.7, false);
                return;
            }
            if (i < idx) {
                wsArrow(fx, tgX, lineY, col, 0.75, true);
                wsText(pkt, L, mid, blockTop, 0.75, w);
                return;
            }
            if (!fresh) {
                wsArrow(fx, tgX, lineY, col, 1, true);
                wsText(pkt, L, mid, blockTop, 1, w);
                return;
            }

            var u = ez(seg(t, 0, 0.7));
            var px = lerp(fx, tgX, u);
            wsArrow(fx, tgX, lineY, col, 0.7, false);
            if (u < 1) {
                ln(fx, lineY, px, lineY, col + 'ee', 2.2);
                wsChip(px, lineY, pkt, mob);
            } else {
                wsArrow(fx, tgX, lineY, col, 1, true);
            }
            wsText(pkt, L, mid, blockTop, ez(seg(t, 0.6, 1)), w);
            var ring = seg(t, 0.7, 0.8) * (1 - seg(t, 0.8, 1));
            if (ring > 0) {
                ctx.globalAlpha = ring;
                rr(tgX - L.hostW / 2 - 3, yHost - 3, L.hostW + 6, L.hostH + 6, 8, null, col + 'ff', 2.5);
                ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('ws-viz__speed-btn--active'); });
        btn.classList.add('ws-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ws-viz__mode-btn--active', d.key === m); });
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