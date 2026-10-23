/**
 * HTTPS / TLS 시각화 시각화
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
    var root    = el('div', 'tls-viz');
    var toolbar = el('div', 'tls-viz__toolbar');
    var tbLeft  = el('div', 'tls-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tls-viz__title', 'TLS 1.3 Handshake'));

    var modeWrap = el('div', 'tls-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tls-viz__mode-btn' + (i === 0 ? ' tls-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tls-viz__speed');
    speedWrap.appendChild(el('span', 'tls-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tls-viz__speed-btn' + (i === 0 ? ' tls-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tls-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tls-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tls-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tls-viz__controls');
    var btnPlay  = el('button', 'tls-viz__btn tls-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tls-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tls-viz__btn', '↺ RESET');
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

    /* ===================== 시나리오 정의 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저가 https://example.com에 접속합니다. TLS 핸드셰이크 전에 TCP 3-way handshake로 연결을 수립합니다.',
            pkt: null,
            clientState: 'CLOSED', serverState: 'LISTEN',
            phase: 'init',
        },
        {
            log: 'Step 1 — TCP SYN. TCP 연결 수립 시작. TLS는 TCP 위에서 동작합니다.',
            pkt: { dir: 'c2s', label: 'TCP SYN', sub: 'port 443', color: 'muted', phase: 'tcp' },
            clientState: 'SYN_SENT', serverState: 'LISTEN',
        },
        {
            log: 'Step 2 — TCP SYN+ACK / ACK. TCP 연결 수립 완료. 이제 TLS 핸드셰이크를 시작합니다.',
            pkt: { dir: 's2c', label: 'TCP SYN+ACK', sub: 'TCP 연결 수립', color: 'muted', phase: 'tcp' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 3 — ClientHello. 클라이언트가 지원하는 TLS 버전, 암호 스위트 목록, 클라이언트 랜덤값, ECDHE 공개키를 전송합니다. 이 메시지는 평문입니다.',
            pkt: { dir: 'c2s', label: 'ClientHello', sub: 'TLS 1.3 | ECDHE 공개키 | 암호 스위트', color: 'purple', phase: 'hello' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 4 — ServerHello. 서버가 선택한 암호 스위트, 서버 랜덤값, ECDHE 공개키를 응답합니다. 클라이언트와 서버 모두 이 시점에 동일한 세션 키를 계산할 수 있습니다.',
            pkt: { dir: 's2c', label: 'ServerHello', sub: 'TLS_AES_256_GCM | ECDHE 공개키', color: 'teal', phase: 'hello' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 5 — Certificate + CertificateVerify. 서버가 인증서(공개키 + CA 서명)와 서명을 전송합니다. 클라이언트는 CA 체인을 검증해 서버 신원을 확인합니다. 이미 암호화됩니다.',
            pkt: { dir: 's2c', label: 'Certificate', sub: 'example.com 인증서 | CA 서명 검증', color: 'green', phase: 'cert', encrypted: true },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 6 — Server Finished. 서버가 핸드셰이크 메시지의 MAC을 전송합니다. 클라이언트는 이를 검증해 핸드셰이크 무결성을 확인합니다. 서버 측 핸드셰이크 완료.',
            pkt: { dir: 's2c', label: 'Finished', sub: 'HMAC 검증 | 서버 핸드셰이크 완료', color: 'green', phase: 'fin', encrypted: true },
            clientState: 'ESTABLISHED', serverState: 'TLS_READY',
        },
        {
            log: 'Step 7 — Client Finished. 클라이언트가 핸드셰이크 MAC을 전송하며 핸드셰이크를 완료합니다. 총 1-RTT 핸드셰이크 완료. 양쪽 모두 동일한 세션 키를 보유합니다.',
            pkt: { dir: 'c2s', label: 'Finished', sub: 'HMAC 검증 | 1-RTT 핸드셰이크 완료', color: 'purple', phase: 'fin', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
        },
        {
            log: 'Step 8 — 암호화된 HTTP 요청. TLS 터널이 수립됐습니다. 이제 모든 HTTP 데이터가 AES-256-GCM으로 암호화됩니다. 도청자는 암호문만 볼 수 있습니다.',
            pkt: { dir: 'c2s', label: '🔒 GET /index.html', sub: 'AES-256-GCM 암호화', color: 'yellow', phase: 'data', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
        },
        {
            log: 'Step 9 — 암호화된 HTTP 응답 ✓  서버가 암호화된 응답을 전송합니다. HTTPS 통신 완료. 인증(Certificate) + 기밀성(AES) + 무결성(HMAC)이 모두 보장됩니다.',
            pkt: { dir: 's2c', label: '🔒 200 OK', sub: 'AES-256-GCM 암호화 | 통신 완료 ✓', color: 'yellow', phase: 'data', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
            done: true,
        },
    ];

    let pktMoving = false;
    let pktProg   = 1;
    let history   = [];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 TLS 1.3 핸드셰이크 과정을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 단계 구성 ===================== */
    var tlStages = [
        { name: 'TCP',  long: 'TCP 연결',           start: 1, end: 2, tone: 'teal' },
        { name: 'TLS',  long: 'TLS 1.3 핸드셰이크', start: 3, end: 7, tone: 'purple' },
        { name: 'HTTP', long: 'HTTP 암호화 통신',   start: 8, end: 9, tone: 'green' }
    ];
    function tlStageState(k, si) {
        var g = tlStages[si];
        if (k >= g.end) return 2;
        if (k >= g.start) return 1;
        return 0;
    }
    function tlBothReady(st) {
        return st.clientState === 'TLS_READY' && st.serverState === 'TLS_READY';
    }
    function tlCol(name) {
        return name === 'muted' ? P.sub : (P[name] || P.purple);
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fsL = mob ? 11 : 13;
        var fsS = mob ? 11 : 12;
        var lhL = mob ? 14 : 17;
        var lhS = mob ? 13 : 16;
        var hostW = mob ? 84 : 120;
        var hostH = mob ? 46 : 54;
        var stripH = mob ? 20 : 24;
        var txtW = w - hostW - 8;
        var rows = [];
        var y = 0;
        STEPS.forEach(function (st, i) {
            if (!st.pkt) return;
            var nl = lines(st.pkt.label, txtW, fsL).length;
            var ns = lines(st.pkt.sub || '', txtW - 6, fsS).length;
            rows[i] = { top: y, nl: nl };
            y += nl * lhL + 6 + 8 + ns * lhS + 10;
        });
        var hostY = stripH + 10;
        var rowsY = hostY + hostH + 12;
        var legY = rowsY + y + 6;
        return {
            mob: mob, fsL: fsL, fsS: fsS, lhL: lhL, lhS: lhS,
            hostW: hostW, hostH: hostH, stripH: stripH, txtW: txtW,
            hostY: hostY, rowsY: rowsY, legY: legY, rows: rows, rowsEnd: y,
            total: legY + lhS + 8
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function tlLock(x, y, s, col) {
        ctx.beginPath();
        ctx.arc(x, y - s * 0.15, s * 0.32, Math.PI, 0);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.4, s * 0.16);
        ctx.stroke();
        rr(x - s / 2, y - s * 0.15, s, s * 0.85, s * 0.15, col, null);
    }
    function tlHead(x, y, dir, col) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dir * 9, y - 5);
        ctx.lineTo(x - dir * 9, y + 5);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }
    function tlHost(x, y, L, name, state, tone, a) {
        var ready = state === 'TLS_READY';
        var col = ready ? P.green : P[tone];
        var tc = ready ? P.green : P.sub;
        ctx.globalAlpha = a;
        rr(x, y, L.hostW, L.hostH, 6, col + '22', col + 'ff', 2);
        tx(name, x + L.hostW / 2, y + L.hostH * 0.34, L.fsL, col + 'ff', 'center', true);
        tx(state, x + L.hostW / 2, y + L.hostH * 0.74, L.fsS, tc + 'ff', 'center', false);
        ctx.globalAlpha = 1;
    }
    function tlChip(x, y, cw, L, si, st, a) {
        var g = tlStages[si];
        var col = tlCol(g.tone);
        ctx.globalAlpha = a;
        if (st === 2) rr(x, y, cw, L.stripH, 5, col + '30', col + 'ff', 1.6);
        else if (st === 1) rr(x, y, cw, L.stripH, 5, col + '22', col + 'ff', 2.4);
        else rr(x, y, cw, L.stripH, 5, 'none', P.sub + '66', 1.2);
        tx(L.mob ? g.name : g.long, x + cw / 2, y + L.stripH / 2, L.fsL,
           st === 0 ? P.sub + 'ff' : P.text + 'ff', 'center', st !== 0);
        ctx.globalAlpha = 1;
    }

    /* ===================== 패킷 행 ===================== */
    function tlPkt(L, cX, sX, midX, ry, R, pkt, mode, e, baseA) {
        var col = tlCol(pkt.color);
        var enc = !!pkt.encrypted;
        var dir = pkt.dir === 'c2s' ? 1 : -1;
        var fromX = dir === 1 ? cX : sX;
        var toX = dir === 1 ? sX : cX;
        var ay = ry + R.nl * L.lhL + 6;
        var head = toX;
        var labA = 1;
        var subA = 1;
        if (mode === 'move') {
            head = fromX + (toX - fromX) * ez(seg(e, 0.05, 0.85));
            labA = seg(e, 0.45, 0.9);
            subA = seg(e, 0.55, 0.95);
        }
        ctx.globalAlpha = baseA;
        ln(fromX, ay, head, ay, col + 'ff', enc ? 2.2 : 1.5, enc ? [] : [4, 3]);
        if (mode !== 'move' || e >= 0.8) {
            ctx.globalAlpha = baseA * (mode === 'move' ? seg(e, 0.8, 1) : 1);
            tlHead(toX, ay, dir, col + 'ff');
        }
        if (mode === 'move' && e < 1) {
            var cw = L.mob ? 30 : 38;
            var ch = L.mob ? 16 : 20;
            ctx.globalAlpha = baseA;
            rr(head - cw / 2, ay - ch / 2, cw, ch, ch / 2, col + '33', col + 'ff', 1.6);
            if (enc) tlLock(head, ay + 1, L.mob ? 9 : 11, col + 'ff');
            else tx(pkt.phase === 'tcp' ? 'TCP' : 'TLS', head, ay, L.fsS, col + 'ff', 'center', true);
        }
        ctx.globalAlpha = baseA * labA;
        lines(pkt.label, L.txtW, L.fsL).forEach(function (str, li) {
            tx(str, midX, ry + L.lhL / 2 + li * L.lhL, L.fsL, col + 'ff', 'center', true);
        });
        ctx.globalAlpha = baseA * subA;
        lines(pkt.sub || '', L.txtW - 6, L.fsS).forEach(function (str, j) {
            tx(str, midX, ay + 8 + L.lhS / 2 + j * L.lhS, L.fsS, P.sub + 'ff', 'center', false);
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var k = steps.indexOf(s);
        var kp = steps.indexOf(p);
        var fresh = !!step && !!prev && prev !== step;
        var e = fresh ? ez(t) : 1;
        var cX = x0 + L.hostW / 2;
        var sX = x0 + w - L.hostW / 2;
        var midX = x0 + w / 2;
        var hostY = top + L.hostY;
        var rowsY = top + L.rowsY;
        var lifeEnd = rowsY + L.rowsEnd + 4;

        var gap = 6;
        var cw = (w - gap * 2) / 3;
        for (var si = 0; si < tlStages.length; si++) {
            var sx = x0 + si * (cw + gap);
            var st1 = tlStageState(k, si);
            var st0 = tlStageState(kp, si);
            if (fresh && st1 !== st0) {
                tlChip(sx, top, cw, L, si, st0, 1 - e);
                tlChip(sx, top, cw, L, si, st1, e);
            } else {
                tlChip(sx, top, cw, L, si, st1, 1);
            }
        }

        ln(cX, hostY + L.hostH, cX, lifeEnd, P.border + 'cc', 1.5, [5, 4]);
        ln(sX, hostY + L.hostH, sX, lifeEnd, P.border + 'cc', 1.5, [5, 4]);

        var hosts = [
            { x: x0, key: 'clientState', def: 'CLOSED', name: 'BROWSER', tone: 'purple' },
            { x: x0 + w - L.hostW, key: 'serverState', def: 'LISTEN', name: 'SERVER', tone: 'teal' }
        ];
        hosts.forEach(function (h) {
            var ns = s[h.key] || h.def;
            var os = p[h.key] || h.def;
            if (fresh && os !== ns) {
                tlHost(h.x, hostY, L, h.name, os, h.tone, 1 - e);
                tlHost(h.x, hostY, L, h.name, ns, h.tone, e);
            } else {
                tlHost(h.x, hostY, L, h.name, ns, h.tone, 1);
            }
        });

        var bothNow = tlBothReady(s);
        var bothPrev = tlBothReady(p);
        var lockA = bothNow ? (fresh && !bothPrev ? e : 1) : (fresh && bothPrev ? 1 - e : 0);
        if (lockA > 0) {
            ctx.globalAlpha = lockA;
            tlLock(x0 + L.hostW - 10, hostY + 10, 8, P.green + 'ff');
            tlLock(x0 + w - 10, hostY + 10, 8, P.green + 'ff');
            ctx.globalAlpha = 1;
        }

        if (fresh && s.pkt) {
            var fromClient = s.pkt.dir === 'c2s';
            var sendX = fromClient ? x0 : x0 + w - L.hostW;
            var recvX = fromClient ? x0 + w - L.hostW : x0;
            ctx.globalAlpha = 1 - seg(e, 0.2, 0.5);
            rr(sendX - 4, hostY - 4, L.hostW + 8, L.hostH + 8, 8, null, P.yellow + 'ff', 2);
            ctx.globalAlpha = seg(e, 0.4, 0.7) * (1 - seg(e, 0.9, 1));
            rr(recvX - 4, hostY - 4, L.hostW + 8, L.hostH + 8, 8, null, P.yellow + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        for (var i = 1; i < steps.length; i++) {
            var pst = steps[i];
            if (!pst.pkt) continue;
            var R = L.rows[i];
            var ry = rowsY + R.top;
            if (i < k || (i === k && !fresh)) {
                tlPkt(L, cX, sX, midX, ry, R, pst.pkt, 'done', 1, 1);
            } else if (i === k) {
                tlPkt(L, cX, sX, midX, ry, R, pst.pkt, 'move', e, 1);
            } else {
                tlPkt(L, cX, sX, midX, ry, R, pst.pkt, 'future', 0, 0.3);
            }
        }

        var ly = top + L.legY + L.lhS / 2;
        ln(x0, ly, x0 + 22, ly, P.sub + 'aa', 1.5, [4, 3]);
        tx('평문', x0 + 28, ly, L.fsS, P.sub + 'ff', 'left', false);
        var lx = x0 + (mob ? 84 : 110);
        ln(lx, ly, lx + 22, ly, P.sub + 'ff', 2.2, []);
        tx('암호화', lx + 28, ly, L.fsS, P.sub + 'ff', 'left', false);
        if (s.done) tx('✓ 통신 완료', x0 + w, ly, L.fsS, P.green + 'ff', 'right', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('tls-viz__speed-btn--active'); });
        btn.classList.add('tls-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tls-viz__mode-btn--active', d.key === m); });
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