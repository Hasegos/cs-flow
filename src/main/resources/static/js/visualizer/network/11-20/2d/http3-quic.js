/**
 * HTTP/3와 QUIC 시각화
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
    var root    = el('div', 'h3-viz');
    var toolbar = el('div', 'h3-viz__toolbar');
    var tbLeft  = el('div', 'h3-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'h3-viz__title', 'HTTP3'));

    var modeWrap = el('div', 'h3-viz__mode');
    var modeDefs = [
        { key: 'hs', label: '연결 수립' },
        { key: 'loss', label: '패킷 유실' },
        { key: 'mig', label: '연결 이동' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'h3-viz__mode-btn' + (i === 0 ? ' h3-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'h3-viz__speed');
    speedWrap.appendChild(el('span', 'h3-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'h3-viz__speed-btn' + (i === 0 ? ' h3-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'h3-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'h3-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'h3-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'h3-viz__controls');
    var btnPlay  = el('button', 'h3-viz__btn h3-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'h3-viz__btn', '▶| STEP');
    var btnReset = el('button', 'h3-viz__btn', '↺ RESET');
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
    var mode    = 'hs';
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

    /* ===================== 데이터: 연결 수립 ===================== */
    var RTT = 50;
    var HS_ROWS = [
        { name: 'TCP + TLS 1.3', segs: [['TCP', 'orange'], ['TLS', 'purple'], ['요청·응답', 'green']] },
        { name: 'QUIC (처음 연결)', segs: [['QUIC+TLS', 'teal'], ['요청·응답', 'green']] },
        { name: 'QUIC 0-RTT (재연결)', segs: [['요청·응답', 'green']] }
    ];
    function hsTotal(i) { return HS_ROWS[i].segs.length * RTT; }
    var HS_STEPS = [
        { k: 0, log: 'RTT(왕복 시간)를 ' + RTT + 'ms로 가정하고 서버 처리 시간은 제외합니다. 연결 방식에 따라 첫 응답이 도착할 때까지 걸리는 시간이 어떻게 달라지는지 비교합니다.' },
        { k: 1, log: 'TCP + TLS 1.3(처음 연결) — TCP 핸드셰이크에 1 RTT, TLS 1.3 핸드셰이크에 1 RTT가 필요해 요청은 ' + (RTT * 2) + 'ms 뒤에야 보낼 수 있고, 첫 응답은 ' + hsTotal(0) + 'ms 뒤에 도착합니다.' },
        { k: 2, log: 'QUIC — 전송 연결과 TLS 1.3 핸드셰이크를 하나로 합쳐 1 RTT에 끝냅니다. 요청은 ' + RTT + 'ms에 보내고 첫 응답은 ' + hsTotal(1) + 'ms에 도착합니다.' },
        { k: 3, log: 'QUIC 0-RTT — 전에 접속한 서버와는 저장해 둔 정보로 첫 패킷에 요청 데이터를 실어 보냅니다. 첫 응답은 ' + hsTotal(2) + 'ms에 도착합니다. 0-RTT 데이터는 재전송 공격에 노출될 수 있어 안전한 요청에만 쓰는 것이 일반적입니다.' },
        { k: 4, log: '정리 — 첫 응답까지 TCP + TLS 1.3은 ' + hsTotal(0) + 'ms, QUIC은 ' + hsTotal(1) + 'ms, QUIC 0-RTT는 ' + hsTotal(2) + 'ms입니다. RTT가 길수록(모바일, 먼 거리) 차이가 더 커집니다.' }
    ];

    /* ===================== 데이터: 패킷 유실 ===================== */
    var STREAMS = ['A', 'B', 'C'];
    var LOSS_IDX = 3;
    function pktState(lane, step, s, p) {
        if (step < p + 1) return 'pending';
        if (step >= 4) return 'ok';
        if (s === 0 && p === 1) return 'lost';
        if (lane === 'tcp') return (p * 3 + s) > LOSS_IDX ? 'wait' : 'ok';
        return (s === 0 && p > 1) ? 'wait' : 'ok';
    }
    function countWait(lane, step) {
        var n = 0;
        for (var s = 0; s < 3; s++) {
            for (var p = 0; p < 3; p++) {
                if (pktState(lane, step, s, p) === 'wait') n++;
            }
        }
        return n;
    }
    var TCP_WAIT = countWait('tcp', 3);
    var QUIC_WAIT = countWait('quic', 3);
    var LOSS_STEPS = [
        { k: 0, log: 'HTTP/2는 TCP 연결 하나에 스트림 A, B, C를 함께 태우고, HTTP/3는 QUIC 연결에서 스트림마다 독립적으로 순서를 관리합니다. 스트림마다 패킷 3개를 보냈을 때 패킷 하나가 유실되면 어떻게 되는지 봅니다.' },
        { k: 1, log: '첫 패킷 A1, B1, C1이 도착합니다. 두 방식 모두 애플리케이션에 바로 전달됩니다.' },
        { k: 2, log: 'A2가 유실됩니다. B2와 C2는 도착했지만, TCP는 바이트 순서를 연결 전체로 보장하므로 A2를 받을 때까지 B2, C2를 애플리케이션에 주지 못하고 기다립니다. QUIC은 스트림별로 순서를 지켜 B2와 C2를 바로 전달합니다.' },
        { k: 3, log: 'A3, B3, C3이 도착합니다. TCP에서는 유실 뒤에 도착한 ' + TCP_WAIT + '개 패킷이 모두 대기하고, QUIC에서는 같은 스트림 A의 A3 ' + QUIC_WAIT + '개만 대기합니다. 이것이 TCP 위의 HTTP/2에서 생기는 HOL(Head-of-Line) 블로킹입니다.' },
        { k: 4, log: '유실된 A2가 재전송되어 도착합니다. TCP는 기다리던 패킷이 한꺼번에 전달되고, QUIC은 A2와 A3이 전달됩니다. 재전송을 기다린 시간만큼 TCP는 스트림 B, C도 늦어진 셈입니다.' },
        { k: 5, log: '정리 — 패킷 유실이 있을 때 TCP는 유실 뒤의 패킷 ' + TCP_WAIT + '개가, QUIC은 같은 스트림의 ' + QUIC_WAIT + '개만 지연됩니다. 전송 계층에서 한 스트림의 유실이 다른 스트림의 전달을 막지 않는 것이 HTTP/3의 큰 장점입니다.' }
    ];

    /* ===================== 데이터: 연결 이동 ===================== */
    var S_IP = '203.0.113.50';
    var WIFI_IP = '192.0.2.10';
    var CELL_IP = '198.51.100.30';
    var CID = '0xA1B2';
    var MIG_STEPS = [
        { a: [], cip: WIFI_IP, hot: [], lines: [], lab: '', val: '', ver: '', vc: 'green',
          log: 'TCP 연결은 출발지 · 목적지 주소와 포트 4개 값으로 식별되고, QUIC 연결은 연결 ID로 식별됩니다. 스마트폰이 Wi-Fi에서 모바일 네트워크로 옮겨 가는 상황을 비교합니다. 서버는 ' + S_IP + '입니다.' },
        { a: [[0, 1, 'yellow']], cip: WIFI_IP, hot: [0], lines: ['Wi-Fi ' + WIFI_IP + '로 접속 중', 'TCP는 주소 4개, QUIC은 ID ' + CID], lab: '서버가 연결을 찾는 키', val: 'TCP는 주소와 포트, QUIC은 연결 ID', ver: '', vc: 'green',
          log: '클라이언트가 Wi-Fi 주소 ' + WIFI_IP + '로 서버에 연결되어 있습니다. TCP 서버는 주소와 포트 4개로, QUIC 서버는 패킷에 든 연결 ID ' + CID + '로 연결을 찾습니다.' },
        { a: [], cip: CELL_IP, hot: [0], lines: ['Wi-Fi에서 모바일 네트워크로 이동', '클라이언트 주소가 바뀜'], lab: '클라이언트 주소', val: WIFI_IP + ' → ' + CELL_IP, ver: '', vc: 'green',
          log: '사용자가 Wi-Fi 범위를 벗어나 모바일 네트워크로 옮겨 갑니다. 클라이언트의 IP 주소가 ' + WIFI_IP + '에서 ' + CELL_IP + '로 바뀝니다.' },
        { a: [[0, 1, 'red']], cip: CELL_IP, hot: [1], lines: ['TCP: 출발지 주소가 달라짐', '서버가 이 패킷의 연결을 못 찾음'], lab: '서버가 연결을 찾는 키', val: '주소 4개 중 1개가 바뀜', ver: 'TCP 연결이 끊어짐', vc: 'red',
          log: 'TCP 패킷이 새 주소로 서버에 도착하면 4개 값이 이전 연결과 달라 서버는 해당 연결을 찾지 못합니다. 연결이 끊어지고 클라이언트는 새로 연결해야 합니다.' },
        { a: [[0, 1, 'green']], cip: CELL_IP, hot: [1], lines: ['QUIC: 연결 ID로 같은 연결을 식별', '새 경로를 확인하며 같은 연결로 계속'], lab: '서버가 연결을 찾는 키', val: '연결 ID로 같은 연결 식별', ver: 'QUIC 연결이 유지됨', vc: 'green',
          log: 'QUIC 패킷은 연결 ID로 연결을 식별하므로 주소가 바뀌어도 서버가 같은 연결로 인식합니다(이동할 때는 미리 받아 둔 새 연결 ID를 쓰는 것이 원칙입니다). 서버는 새 주소로 응답을 보내면서 PATH_CHALLENGE로 그 경로가 실제로 쓰이는지 확인합니다.' },
        { a: [[0, 1, 'yellow'], [1, 0, 'yellow']], cip: CELL_IP, hot: [0, 1], lines: ['TCP: 새 연결을 처음부터 맺음', 'TCP + TLS 1.3 핸드셰이크 2 RTT'], lab: 'TCP 재연결 지연', val: (RTT * 2) + 'ms (RTT ' + RTT + 'ms 기준)', ver: '', vc: 'green',
          log: 'TCP는 새 연결을 처음부터 맺어야 합니다. TCP와 TLS 1.3 핸드셰이크에 2 RTT가 필요해 RTT가 ' + RTT + 'ms이면 새 연결에 ' + (RTT * 2) + 'ms가 걸립니다(끊김을 알아채는 시간은 제외).' },
        { a: [], cip: CELL_IP, hot: [], lines: ['QUIC: 연결 유지, 재핸드셰이크 불필요', 'TCP: 끊김과 재연결 발생'], lab: '네트워크 전환의 영향', val: 'QUIC 연결 유지 · TCP 끊김', ver: '', vc: 'green',
          log: '정리 — 연결을 주소가 아니라 연결 ID로 식별하는 QUIC은 네트워크가 바뀌어도 연결을 유지할 수 있습니다(전송 속도는 새 경로에 맞게 다시 올라가야 합니다). 이동이 잦은 환경에서 유리한 점입니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'loss') return LOSS_STEPS;
        if (mode === 'mig') return MIG_STEPS;
        return HS_STEPS;
    }
    function defaultLog() {
        if (mode === 'loss') return '패킷 하나가 유실됐을 때 TCP와 QUIC에서 다른 스트림이 얼마나 지연되는지 봅니다.';
        if (mode === 'mig') return '네트워크가 바뀔 때 TCP 연결은 끊기고 QUIC 연결은 유지되는 차이를 봅니다.';
        return '첫 응답이 도착할 때까지 연결 방식별로 걸리는 시간을 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'loss' ? (mob ? 292 : 292) : (mode === 'mig' ? (mob ? 262 : 252) : (mob ? 210 : 210));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 연결 수립 ===================== */
    function drawHandshake(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var unit = w / (RTT * 3);
        var rowH = 58;
        HS_ROWS.forEach(function (r, i) {
            if (k < i + 1) return;
            var y = top + i * rowH;
            var cur = k === i + 1;
            var fresh = cur && pk < k;
            var total = hsTotal(i);
            var tNow = fresh ? ez(seg(e, 0.05, 0.85)) * total : total;
            var flagA = fresh ? seg(e, 0.8, 1) : 1;
            ctx.globalAlpha = fresh ? clamp01(e * 5) : 1;
            tx(r.name, x0, y + 8, fs - 0.5, (cur ? P.text : P.sub) + 'ff', 'left', true);
            ctx.globalAlpha = 1;
            r.segs.forEach(function (sg, j) {
                var sx = x0 + j * RTT * unit;
                var sw = RTT * unit - 2;
                var c = P[sg[1]];
                var fill = clamp01((tNow - j * RTT) / RTT);
                rr(sx, y + 20, sw, 26, 4, 'none', c + '66', 1.2);
                if (fill > 0) {
                    rr(sx, y + 20, sw * fill, 26, 4, c + (cur ? '40' : '22'), c + (cur ? 'ff' : '99'), cur ? 1.8 : 1.2);
                    if (fill > 0.55) tx(sg[0], sx + sw / 2, y + 33, fs - 1.5, c + 'ff', 'center', true);
                }
            });
            if (fresh && tNow < total) {
                var cx = x0 + tNow * unit;
                ln(cx, y + 14, cx, y + 52, P.yellow + 'ff', 2);
            }
            if (flagA > 0) {
                ctx.globalAlpha = flagA;
                tx('첫 응답 ' + total + 'ms', x0 + w, y + 8, fs - 0.5, P.yellow + 'ff', 'right', true);
                ctx.globalAlpha = 1;
            }
            if (k === 4 && pk < 4) {
                var pulse = ez(seg(e, i * 0.18, i * 0.18 + 0.3));
                if (pulse > 0 && pulse < 1) {
                    ctx.globalAlpha = 1 - pulse;
                    rr(x0 - 2, y + 18, total * unit + 2, 30, 6, 'none', P.yellow + 'ff', 2);
                    ctx.globalAlpha = 1;
                }
            }
        });
        var ay = top + HS_ROWS.length * rowH + 4;
        ln(x0, ay, x0 + w, ay, P.sub + 'aa', 1);
        for (var t = 0; t <= 3; t++) {
            var tx0 = x0 + t * RTT * unit;
            ln(tx0, ay, tx0, ay + 4, P.sub + 'aa', 1);
            tx(t * RTT + 'ms', Math.min(Math.max(tx0, x0 + 14), x0 + w - 14), ay + 14, fs - 1.5, P.sub + 'ff', 'center', false);
        }
    }

    /* ===================== 패킷 유실 ===================== */
    function drawLoss(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var lanes = [
            { key: 'tcp', title: 'HTTP/2 · TCP: 연결 전체가 한 줄', col: P.orange },
            { key: 'quic', title: 'HTTP/3 · QUIC: 스트림별로 독립', col: P.teal }
        ];
        var lx = 22, gap = 6;
        var bw = (w - lx - gap * 2) / 3;
        var rh = 26;
        var laneH = 22 + 3 * (rh + 4) + 8;
        lanes.forEach(function (lane, li) {
            var y0 = top + li * laneH;
            tx(lane.title, x0, y0 + 8, fs - 1, lane.col + 'ff', 'left', true);
            var order = 0;
            STREAMS.forEach(function (sn, st) {
                var y = y0 + 22 + st * (rh + 4);
                tx(sn, x0 + 8, y + rh / 2, fs, P.text + 'ff', 'center', true);
                for (var pi = 0; pi < 3; pi++) {
                    var cs = pktState(lane.key, k, st, pi);
                    var ps = pktState(lane.key, pk, st, pi);
                    var x = x0 + lx + pi * (bw + gap);
                    var arrived = cs !== 'pending' && ps === 'pending';
                    var retrans = cs === 'ok' && ps === 'lost';
                    var changed = cs !== ps;
                    var d = (arrived || retrans) ? order++ * 0.08 : 0;
                    var u = (arrived || retrans) ? ez(seg(e, d, d + 0.45)) : 1;
                    var c = cs === 'ok' ? P.green : cs === 'wait' ? P.yellow : cs === 'lost' ? P.red : P.sub;
                    var shake = cs === 'lost' && arrived && e > 0.5 && e < 0.9 ? Math.sin(e * 60) * 3 : 0;
                    var px = x - (1 - u) * 70 + shake;
                    rr(x, y, bw, rh, 4, 'none', P.sub + '55', 1.2);
                    if (cs === 'pending') continue;
                    ctx.globalAlpha = u;
                    rr(px, y, bw, rh, 4, c + '30', c + 'ff', 1.6);
                    tx(sn + (pi + 1) + (cs === 'lost' ? ' 유실' : cs === 'wait' ? ' 대기' : ''), px + bw / 2, y + rh / 2, fs - 1, c + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                    if (cs === 'lost' && u >= 1) {
                        ln(px + bw - 14, y + 6, px + bw - 6, y + rh - 6, P.red + 'ff', 2.4);
                        ln(px + bw - 6, y + 6, px + bw - 14, y + rh - 6, P.red + 'ff', 2.4);
                    }
                    if (changed && !arrived && !retrans && e < 1) {
                        ctx.globalAlpha = 1 - e;
                        rr(px - 2, y - 2, bw + 4, rh + 4, 6, 'none', c + 'ff', 2.2);
                        ctx.globalAlpha = 1;
                    }
                }
            });
        });
        var ly = top + 2 * laneH + 6;
        var items = [['■ 전달', P.green], ['■ 대기', P.yellow], ['■ 유실', P.red], ['□ 도착 전', P.sub]];
        items.forEach(function (it, i) {
            tx(it[0], x0 + (w / 4) * i, ly, fs - 1.5, it[1] + 'ff', 'left', true);
        });
        if (k >= 3 && k <= 5) {
            var fresh = pk < 3;
            var q = fresh ? ez(seg(e, 0.4, 0.9)) : 1;
            lines('지연된 패킷: TCP ' + Math.round(TCP_WAIT * q) + '개 · QUIC ' + Math.round(QUIC_WAIT * q) + '개', w, fs).forEach(function (l, li) {
                tx(l, x0 + w / 2, ly + 24 + li * (fs + 3), fs, P.yellow + 'ff', 'center', true);
            });
        }
    }

    /* ===================== 연결 이동 ===================== */
    function drawMigration(x0, top, w, mob, s, p, e, fs) {
        var bw = mob ? 100 : 150, bh = 54;
        var areaH = 84;
        var q = ez(seg(e, 0.1, 0.7));
        var y = top + 6 + (areaH - bh) / 2;
        var nodes = [
            { t: '클라이언트', c: 'orange', x: x0 },
            { t: '서버', c: 'teal', x: x0 + w - bw }
        ];
        nodes.forEach(function (n, i) {
            var c = P[n.c];
            var on = s.hot.indexOf(i) >= 0;
            rr(n.x, y, bw, bh, 6, c + (on ? '30' : '18'), c + (on ? 'ff' : 'aa'), on ? 2 : 1.3);
            tx(n.t, n.x + bw / 2, y + 16, fs, c + 'ff', 'center', true);
            if (i === 1) {
                tx(S_IP, n.x + bw / 2, y + 38, fs - 1.5, P.sub + 'ff', 'center', false);
            } else if (s.cip !== p.cip) {
                ctx.globalAlpha = 1 - q;
                tx(p.cip, n.x + bw / 2, y + 38 - q * 10, fs - 1.5, P.sub + 'ff', 'center', false);
                ctx.globalAlpha = q;
                tx(s.cip, n.x + bw / 2, y + 38 + (1 - q) * 10, fs - 1.5, P.yellow + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            } else {
                tx(s.cip, n.x + bw / 2, y + 38, fs - 1.5, P.sub + 'ff', 'center', false);
            }
        });
        var sameA = JSON.stringify(s.a) === JSON.stringify(p.a);
        s.a.forEach(function (ar, ai) {
            var fwd = ar[0] < ar[1];
            var off = fwd ? -7 : 7;
            var xa = fwd ? nodes[0].x + bw : nodes[1].x;
            var xb = fwd ? nodes[1].x : nodes[0].x + bw;
            var yy = y + bh / 2 + off;
            var col = P[ar[2]] + 'ff';
            var u = sameA ? 1 : ez(seg(e, 0.05 + ai * 0.1, 0.6 + ai * 0.1));
            var xe = lerp(xa, xb, u);
            if (u >= 1) arrow(xa, yy, xb, yy, col, 2.6);
            else if (u > 0) ln(xa, yy, xe, yy, col, 2.6);
            if (u > 0 && u < 1) circ(xe, yy, 5, col, 'none', 1);
            if (u >= 1 && ar[2] === 'red') {
                var xm = (xa + xb) / 2;
                ctx.globalAlpha = sameA ? 1 : seg(e, 0.6, 0.8);
                ln(xm - 8, yy - 10, xm + 8, yy + 10, P.red + 'ff', 3.4);
                ln(xm - 8, yy + 10, xm + 8, yy - 10, P.red + 'ff', 3.4);
                ctx.globalAlpha = 1;
            }
        });

        var py = top + 6 + areaH + 10;
        var lh = mob ? 15 : 17;
        var ph = lh * 3 + 14;
        var same = s.lines.join('|') === p.lines.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        rr(x0, py, w, ph, 6, 'none', P.sub + '66', 1.2);
        tx('패킷과 판단', x0 + 10, py + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.lines.length) {
            ctx.globalAlpha = ca;
            var yy2 = py + 12 + lh;
            s.lines.forEach(function (l, i) {
                lines(l, w - 20, fs - 1).forEach(function (m) {
                    tx(m, x0 + 10, yy2, fs - 1, (i === 0 ? P.text : P.yellow) + 'ff', 'left', false);
                    yy2 += lh;
                });
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 패킷이 없습니다)', x0 + 10, py + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }
        var ty = py + ph + 12;
        var th = 24 + lh;
        rr(x0, ty, w, th, 6, 'none', P.sub + '66', 1.2);
        tx(s.lab || '확인할 값', x0 + 10, ty + 12, fs - 1, P.sub + 'ff', 'left', true);
        var va = s.val === p.val ? 1 : ez(seg(e, 0.3, 0.7));
        ctx.globalAlpha = s.val ? va : 1;
        tx(s.val || '(없음)', x0 + 10, ty + 12 + lh, fs - 1, (s.val ? P.green : P.sub) + 'ff', 'left', false);
        ctx.globalAlpha = 1;
        if (s.ver) {
            var vp = s.ver === p.ver ? 1 : ez(seg(e, 0.6, 0.95));
            var vc = P[s.vc];
            var label = '결과: ' + s.ver;
            var vw = label.length * 10 + 24;
            ctx.globalAlpha = vp;
            rr(x0 + w / 2 - vw / 2 * vp, ty + th + 6, vw * vp, 24, 8, vc + '30', vc + 'ff', 1.8);
            if (vp > 0.7) tx(label, x0 + w / 2, ty + th + 18, fs, vc + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'loss') drawLoss(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'mig') drawMigration(x0, top, w, mob, s, p, e, L.fs);
        else drawHandshake(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('h3-viz__speed-btn--active'); });
        btn.classList.add('h3-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('h3-viz__mode-btn--active', d.key === m); });
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

    setTimeout(resize, 60);
})();