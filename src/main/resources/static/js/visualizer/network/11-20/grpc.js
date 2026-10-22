/**
 * gRPC 통신 시각화
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
    var root    = el('div', 'gr-viz');
    var toolbar = el('div', 'gr-viz__toolbar');
    var tbLeft  = el('div', 'gr-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'gr-viz__title', 'GRPC'));

    var modeWrap = el('div', 'gr-viz__mode');
    var modeDefs = [
        { key: 'calls', label: '호출 방식' },
        { key: 'wire', label: '직렬화 크기' },
        { key: 'mux', label: 'HTTP/2 다중화' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'gr-viz__mode-btn' + (i === 0 ? ' gr-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'gr-viz__speed');
    speedWrap.appendChild(el('span', 'gr-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'gr-viz__speed-btn' + (i === 0 ? ' gr-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'gr-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'gr-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'gr-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'gr-viz__controls');
    var btnPlay  = el('button', 'gr-viz__btn gr-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'gr-viz__btn', '▶| STEP');
    var btnReset = el('button', 'gr-viz__btn', '↺ RESET');
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
    var mode    = 'calls';
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

    /* ===================== 데이터: 호출 방식 ===================== */
    var CALLS = [
        { name: '단항 (Unary)', ex: '사용자 조회', c: 1, s: 1 },
        { name: '서버 스트리밍', ex: '시세 구독', c: 1, s: 3 },
        { name: '클라이언트 스트리밍', ex: '파일 업로드', c: 3, s: 1 },
        { name: '양방향 스트리밍', ex: '채팅', c: 3, s: 3 }
    ];
    var CALL_STEPS = [
        { k: 0, log: 'gRPC는 원격 서버의 함수를 로컬 함수처럼 부르는 RPC(원격 프로시저 호출) 프레임워크입니다. 요청과 응답 메시지가 몇 개 오가느냐에 따라 네 가지 호출 방식이 있습니다.' },
        { k: 1, log: '단항(Unary) — 요청 메시지 ' + CALLS[0].c + '개를 보내면 응답 메시지 ' + CALLS[0].s + '개가 돌아옵니다. 일반적인 함수 호출과 같고 가장 흔한 방식입니다. 예: ' + CALLS[0].ex + '.' },
        { k: 2, log: '서버 스트리밍 — 요청 ' + CALLS[1].c + '개에 서버가 응답 메시지를 ' + CALLS[1].s + '개 이상 이어서 보냅니다. 서버가 보내는 흐름이 끝날 때까지 연결이 유지됩니다. 예: ' + CALLS[1].ex + '.' },
        { k: 3, log: '클라이언트 스트리밍 — 클라이언트가 요청 메시지를 ' + CALLS[2].c + '개 이상 이어서 보내고, 서버는 다 받은 뒤 응답 ' + CALLS[2].s + '개를 돌려줍니다. 예: ' + CALLS[2].ex + '.' },
        { k: 4, log: '양방향 스트리밍 — 양쪽이 각자 메시지 흐름을 독립적으로 주고받습니다. 한쪽이 보내기를 끝낼 때까지 기다릴 필요가 없습니다. 예: ' + CALLS[3].ex + '.' },
        { k: 5, log: '정리 — 요청과 응답이 1:1일 필요가 없다는 것이 HTTP/2 스트림 위에서 동작하는 gRPC의 특징입니다. 호출 방식은 .proto 파일의 rpc 정의에서 stream 키워드로 정합니다.' }
    ];

    /* ===================== 데이터: 직렬화 크기 ===================== */
    function varint(n) {
        var out = [];
        for (;;) {
            var b = n & 0x7F;
            n = n >>> 7;
            if (n) out.push(b | 0x80);
            else { out.push(b); return out; }
        }
    }
    var USER_ID = 150;
    var USER_NAME = 'kim';
    var NAME_BYTES = [];
    for (var ci = 0; ci < USER_NAME.length; ci++) NAME_BYTES.push(USER_NAME.charCodeAt(ci));
    var JSON_S = JSON.stringify({ id: USER_ID, name: USER_NAME });
    var PB_GROUPS = [
        { t: 'tag', label: '태그', bytes: [(1 << 3) | 0] },
        { t: 'val', label: String(USER_ID), bytes: varint(USER_ID) },
        { t: 'tag', label: '태그', bytes: [(2 << 3) | 2] },
        { t: 'len', label: '길이', bytes: [NAME_BYTES.length] },
        { t: 'data', label: USER_NAME, bytes: NAME_BYTES }
    ];
    var PB_LEN = 0;
    PB_GROUPS.forEach(function (g) { PB_LEN += g.bytes.length; });
    var JSON_LEN = JSON_S.length;
    var SAVE_PCT = Math.round((1 - PB_LEN / JSON_LEN) * 100);
    var WIRE_STEPS = [
        { k: 0, log: 'gRPC는 메시지를 Protocol Buffers로 직렬화합니다. 같은 사용자 정보(id ' + USER_ID + ', name ' + USER_NAME + ')를 JSON과 Protocol Buffers로 표현했을 때 크기를 비교합니다.' },
        { k: 1, log: 'JSON은 필드 이름(id, name)과 구분 기호가 문자 그대로 들어가 ' + JSON_LEN + '바이트입니다. 사람이 읽기 쉽지만 모든 메시지에 필드 이름이 반복됩니다.' },
        { k: 2, log: 'Protocol Buffers는 필드 이름 대신 .proto에서 정한 필드 번호를 씁니다. 첫 바이트 태그는 (필드 번호 << 3) | 와이어 타입으로 ' + PB_GROUPS[0].bytes[0] + '(0x08)이고, 값 ' + USER_ID + '은 가변 길이 정수(varint)로 ' + PB_GROUPS[1].bytes.length + '바이트(0x96 0x01)입니다.' },
        { k: 3, log: '두 번째 필드는 문자열이어서 태그가 (2 << 3) | 2 = ' + PB_GROUPS[2].bytes[0] + '(0x12), 이어서 길이 ' + PB_GROUPS[3].bytes[0] + ', 문자 ' + NAME_BYTES.length + '바이트가 따라옵니다. 합쳐서 ' + PB_LEN + '바이트입니다.' },
        { k: 4, log: '정리 — 같은 정보가 JSON ' + JSON_LEN + '바이트, Protocol Buffers ' + PB_LEN + '바이트로 약 ' + SAVE_PCT + '% 작습니다. 필드 이름이 없는 대신 양쪽이 같은 .proto 스키마를 가지고 있어야 해석할 수 있습니다.' }
    ];

    /* ===================== 데이터: HTTP/2 다중화 ===================== */
    var STREAM_INFO = {
        1: { name: 'GetUser', col: 'orange' },
        3: { name: 'Upload', col: 'teal' },
        5: { name: 'Talk', col: 'purple' }
    };
    var FRAMES = [['H', 1], ['H', 3], ['H', 5], ['D', 3], ['D', 1], ['D', 5], ['D', 1], ['D', 3], ['D', 5]];
    var MUX_STEPS = [
        { n: 0, lines: [], lab: '', val: '',
          log: 'gRPC는 HTTP/2 위에서 동작합니다. 연결 하나 안에 스트림 여러 개를 두고, 각 스트림이 RPC 하나를 맡습니다. 클라이언트가 시작하는 스트림은 번호가 홀수(1, 3, 5)입니다.' },
        { n: 1, lines: ['스트림 1: GetUser 요청 시작', 'HEADERS 프레임에 호출 경로 포함'], lab: '연결 상태', val: '연결 1개 · 스트림 1개 · 프레임 1개',
          log: 'RPC GetUser를 위해 스트림 1이 열립니다. 요청 헤더는 HEADERS 프레임에 담기고, 호출할 메서드는 패키지를 선언했다면 /패키지.서비스/메서드 형태의 경로로 전달됩니다.' },
        { n: 3, lines: ['스트림 3, 5도 같은 연결에서 시작', '앞의 응답을 기다리지 않음'], lab: '연결 상태', val: '연결 1개 · 스트림 3개 · 프레임 3개',
          log: 'Upload(스트림 3)와 Talk(스트림 5)도 같은 연결에서 바로 시작합니다. 앞선 호출의 응답이 끝나기를 기다릴 필요가 없습니다.' },
        { n: 6, lines: ['요청 데이터 프레임이 뒤섞여 전송', '프레임마다 스트림 번호가 붙음'], lab: '연결 상태', val: '연결 1개 · 스트림 3개 · 프레임 6개',
          log: '세 호출의 DATA 프레임이 한 연결 위에서 번갈아 전송됩니다. 각 프레임에는 스트림 번호가 붙어 있어 받는 쪽이 호출별로 다시 모읍니다.' },
        { n: 9, lines: ['응답 데이터 프레임도 교차해 도착', '각 호출은 서로를 막지 않음'], lab: '연결 상태', val: '연결 1개 · 스트림 3개 · 프레임 9개',
          log: '응답 DATA 프레임도 스트림 번호를 달고 교차해서 도착합니다. 호출 3개가 연결 하나로 동시에 진행되었습니다. 시각화는 단순화해 요청과 응답의 DATA 프레임만 그렸고, 실제로는 응답 HEADERS와 grpc-status를 담은 trailers 프레임도 오갑니다.' },
        { n: 9, lines: ['연결 1개로 호출 3개를 동시에 처리', 'HTTP/1.1은 보통 연결이 더 필요'], lab: '동시 호출 3개에 필요한 연결', val: 'HTTP/2 1개 · HTTP/1.1 보통 3개',
          log: '정리 — HTTP/2 멀티플렉싱 덕분에 gRPC는 연결 하나로 여러 호출을 동시에 처리합니다. HTTP/1.1에서는 한 연결이 보통 요청 하나씩 차례로 처리하므로 동시 호출마다 연결이 하나씩 더 필요합니다. 파이프라이닝이 있지만 응답이 요청 순서대로 와야 합니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'wire') return WIRE_STEPS;
        if (mode === 'mux') return MUX_STEPS;
        return CALL_STEPS;
    }
    function defaultLog() {
        if (mode === 'wire') return '같은 정보를 JSON과 Protocol Buffers로 나타냈을 때 바이트 크기를 비교합니다.';
        if (mode === 'mux') return '하나의 HTTP/2 연결 위에서 여러 호출의 프레임이 섞여 전송되는 모습을 봅니다.';
        return '요청과 응답 메시지가 몇 개 오가는지에 따른 gRPC의 네 가지 호출 방식을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'wire' ? (mob ? 206 : 214) : (mode === 'mux' ? (mob ? 292 : 296) : (mob ? 272 : 268));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function hex2(b) { return ('0' + b.toString(16)).slice(-2); }

    /* ===================== 호출 방식 ===================== */
    function drawCalls(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var rowH = 62;
        var bw = mob ? 66 : 64;
        var laneX1 = x0 + bw + 6, laneX2 = x0 + w - bw - 6;
        CALLS.forEach(function (c, i) {
            if (k < i + 1) return;
            var y = top + i * rowH;
            var cur = k === i + 1;
            var fresh = cur && pk < k;
            ctx.globalAlpha = fresh ? clamp01(e * 5) : 1;
            tx(c.name, x0, y + 8, fs - 0.5, (cur ? P.text : P.sub) + 'ff', 'left', true);
            tx('예: ' + c.ex, x0 + w, y + 8, fs - 1.5, P.yellow + 'ff', 'right', false);
            ctx.globalAlpha = 1;
            [['클라이언트', c.c, P.orange, 0], ['서버', c.s, P.teal, 1]].forEach(function (ln2) {
                var j = ln2[3];
                var ly = y + 20 + j * 20;
                var col = ln2[2];
                rr(j === 0 ? x0 : x0 + w - bw, ly, bw, 18, 4, col + '22', col + 'ff', 1.2);
                tx(ln2[0], (j === 0 ? x0 : x0 + w - bw) + bw / 2, ly + 9, fs - 1.5, col + 'ff', 'center', true);
                ln(laneX1, ly + 9, laneX2, ly + 9, P.sub + '44', 1, [3, 4]);
                var n2 = ln2[1];
                var respStart = c.c > 1 && c.s === 1 ? 0.62 : (c.s > 1 && c.c > 1 ? 0.2 : 0.4);
                for (var m = 0; m < n2; m++) {
                    var start = j === 0 ? 0.05 + m * 0.14 : respStart + m * 0.14;
                    var u = fresh ? ez(seg(e, start, start + 0.3)) : 1;
                    var from = j === 0 ? laneX1 : laneX2 - 28;
                    var to = j === 0 ? laneX2 - 28 - m * 30 : laneX1 + m * 30;
                    var px = lerp(from, to, u);
                    if (fresh && u <= 0) continue;
                    rr(px, ly + 1, 26, 16, 3, col + (cur ? '55' : '30'), col + 'ff', cur ? 1.6 : 1.1);
                    tx(String(m + 1), px + 13, ly + 9, fs - 1.5, P.text + 'ff', 'center', true);
                }
            });
        });
    }

    /* ===================== 직렬화 크기 ===================== */
    function drawWire(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var unit = w / JSON_LEN;
        if (k >= 1) {
            var f1 = k === 1 && pk < 1;
            var typed = f1 ? Math.ceil(JSON_S.length * ez(seg(e, 0.1, 0.8))) : JSON_S.length;
            tx('JSON  ' + JSON_LEN + '바이트', x0, top + 8, fs, P.orange + 'ff', 'left', true);
            rr(x0, top + 20, w, 26, 4, P.orange + '18', P.orange + 'ff', 1.3);
            tx(JSON_S.slice(0, typed), x0 + w / 2, top + 33, fs, P.text + 'ff', 'center', false);
            rr(x0, top + 52, JSON_LEN * unit * (f1 ? ez(seg(e, 0.1, 0.8)) : 1), 7, 2, P.orange + '66', P.orange + 'ff', 1);
        }
        var fresh2 = k === 2 && pk < 2, fresh3 = k === 3 && pk < 3;
        var shown = k >= 3 ? PB_GROUPS.length : (k >= 2 ? 2 : 0);
        if (shown > 0) {
            var py = top + 82;
            var colors = { tag: P.orange, val: P.green, len: P.purple, data: P.teal };
            var gap = 3;
            var bw = (w - gap * (PB_LEN - 1)) / PB_LEN;
            var bi = 0;
            var total = 0;
            for (var g = 0; g < shown; g++) {
                var grp = PB_GROUPS[g];
                var c = colors[grp.t];
                var firstNew = (fresh2 && g < 2) || (fresh3 && g >= 2);
                var order = fresh3 ? g - 2 : g;
                var a = firstNew ? ez(seg(e, 0.1 + order * 0.22, 0.45 + order * 0.22)) : 1;
                var gx = x0 + bi * (bw + gap);
                var gw = grp.bytes.length * bw + (grp.bytes.length - 1) * gap;
                ctx.globalAlpha = a;
                grp.bytes.forEach(function (b, bj) {
                    var bx = x0 + (bi + bj) * (bw + gap);
                    var dy = (1 - a) * -16;
                    rr(bx, py + 12 + dy, bw, 28, 4, c + '30', c + 'ff', 1.5);
                    tx(hex2(b), bx + bw / 2, py + 26 + dy, fs - 1, P.text + 'ff', 'center', true);
                });
                tx(grp.label, gx + gw / 2, py + 52, fs - 1.5, c + 'ff', 'center', true);
                ctx.globalAlpha = 1;
                total += grp.bytes.length * a;
                bi += grp.bytes.length;
            }
            tx('Protocol Buffers  ' + (k >= 3 ? PB_LEN : PB_GROUPS[0].bytes.length + PB_GROUPS[1].bytes.length) + '바이트', x0, py, fs, P.teal + 'ff', 'left', true);
            rr(x0, py + 64, total * unit, 7, 2, P.teal + '66', P.teal + 'ff', 1);
        }
        if (k >= 4) {
            var fresh4 = pk < 4;
            var ga = fresh4 ? ez(seg(e, 0.1, 0.7)) : 1;
            ctx.globalAlpha = ga;
            var bx1 = x0 + PB_LEN * unit, bx2 = x0 + JSON_LEN * unit;
            var by = top + 52;
            ln(bx1, by + 3, bx1, top + 146, P.yellow + 'ff', 1.4, [3, 3]);
            rr(bx1, by, bx2 - bx1, 7, 2, P.green + '44', P.green + 'ff', 1);
            tx('절약', (bx1 + bx2) / 2, by + 17, fs - 1, P.green + 'ff', 'center', true);
            lines('JSON ' + JSON_LEN + ' → Protocol Buffers ' + PB_LEN + ' (약 ' + SAVE_PCT + '% 작음)', w, fs).forEach(function (l, li) {
                tx(l, x0 + w / 2, top + 178 + li * (fs + 3), fs, P.yellow + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== HTTP/2 다중화 ===================== */
    function drawMux(x0, top, w, mob, s, p, e, fs) {
        var n = s.n, pn = p.n;
        var ids = [1, 3, 5];
        var lw = w / 3;
        ids.forEach(function (id, i) {
            var c = P[STREAM_INFO[id].col];
            var open = FRAMES.slice(0, n).some(function (f) { return f[1] === id; });
            rr(x0 + i * lw + 2, top, lw - 4, 24, 5, c + (open ? '25' : '10'), c + (open ? 'ff' : '88'), 1.5);
            tx((mob ? '#' : '스트림 ') + id + ' ' + STREAM_INFO[id].name, x0 + i * lw + lw / 2, top + 12, fs - 1.5, c + 'ff', 'center', true);
        });
        var y = top + 38;
        tx('연결 1개 (프레임이 한 줄로 전송)', x0, y, fs - 1, P.sub + 'ff', 'left', true);
        var gap = 3;
        var bw = (w - gap * (FRAMES.length - 1)) / FRAMES.length;
        FRAMES.forEach(function (f, i) {
            var bx = x0 + i * (bw + gap);
            rr(bx, y + 12, bw, 28, 4, 'none', P.sub + '66', 1);
        });
        FRAMES.forEach(function (f, i) {
            if (i >= n) return;
            var bx = x0 + i * (bw + gap);
            var c = P[STREAM_INFO[f[1]].col];
            var isNew = i >= pn;
            var order = i - pn;
            var u = isNew ? ez(seg(e, 0.05 + order * 0.07, 0.45 + order * 0.07)) : 1;
            var sIdx = ids.indexOf(f[1]);
            var sx = x0 + sIdx * lw + lw / 2 - bw / 2;
            var fx = lerp(sx, bx, u), fy = lerp(top + 20, y + 12, u);
            if (isNew && u <= 0) return;
            rr(fx, fy, bw, 28, 4, c + (f[0] === 'H' ? '66' : '30'), c + 'ff', 1.6);
            tx(f[0] + f[1], fx + bw / 2, fy + 14, fs - 1.5, P.text + 'ff', 'center', true);
        });
        tx('H = HEADERS 프레임 · D = DATA 프레임', x0, y + 54, fs - 1.5, P.sub + 'ff', 'left', false);
        var py = y + 70;
        var lh = mob ? 15 : 17;
        var ph = lh * 3 + 14;
        rr(x0, py, w, ph, 6, 'none', P.sub + '66', 1.2);
        tx('진행 상황', x0 + 10, py + 12, fs - 1, P.sub + 'ff', 'left', true);
        var same = s.lines.join('|') === p.lines.join('|');
        var ca = same ? 1 : ez(seg(e, 0.2, 0.6));
        if (s.lines.length) {
            ctx.globalAlpha = ca;
            var yy = py + 12 + lh;
            s.lines.forEach(function (l, i) {
                lines(l, w - 20, fs - 1).forEach(function (m, mi) {
                    tx(m, x0 + 10, yy, fs - 1, (i === 0 ? P.text : P.yellow) + 'ff', 'left', false);
                    yy += lh;
                });
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 호출이 없습니다)', x0 + 10, py + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }
        var ty = py + ph + 12;
        var th = 24 + lh * 2;
        rr(x0, ty, w, th, 6, 'none', P.sub + '66', 1.2);
        tx(s.lab || '확인할 값', x0 + 10, ty + 12, fs - 1, P.sub + 'ff', 'left', true);
        var va = s.val === p.val ? 1 : ez(seg(e, 0.3, 0.7));
        ctx.globalAlpha = s.val ? va : 1;
        lines(s.val || '(없음)', w - 20, fs - 1).forEach(function (l, li) {
            tx(l, x0 + 10, ty + 12 + lh * (li + 1), fs - 1, (s.val ? P.green : P.sub) + 'ff', 'left', false);
        });
        ctx.globalAlpha = 1;
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'wire') drawWire(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'mux') drawMux(x0, top, w, mob, s, p, e, L.fs);
        else drawCalls(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('gr-viz__speed-btn--active'); });
        btn.classList.add('gr-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('gr-viz__mode-btn--active', d.key === m); });
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