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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'calls';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'wire') return WIRE_STEPS;
        if (mode === 'mux') return MUX_STEPS;
        return CALL_STEPS;
    }

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

    /* ===================== 공통 ===================== */
    function hex2(b) { return ('0' + b.toString(16)).slice(-2); }

    /* ===================== 모드: 호출 방식 ===================== */
    function drawCalls(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var rowH = 62;
        var lab = 62;
        CALLS.forEach(function (c, i) {
            if (k < i + 1) return;
            var y = top + i * rowH;
            var cur = k === i + 1;
            tx(c.name, x0, y + 8, fs - 0.5, (cur ? P.text : P.sub) + 'ee', 'left', true);
            tx('예: ' + c.ex, x0 + w, y + 8, fs - 1.5, P.yellow + (cur ? 'ff' : 'cc'), 'right', false);
            [['클라이언트', c.c, P.orange], ['서버', c.s, P.teal]].forEach(function (ln, j) {
                var ly = y + 18 + j * 20;
                tx(ln[0], x0, ly + 8, fs - 1.5, ln[2] + 'ff', 'left', true);
                for (var m = 0; m < ln[1]; m++) {
                    rr(x0 + lab + m * 40, ly, 34, 16, 3, ln[2] + (cur ? '40' : '22'), ln[2] + (cur ? 'ff' : '99'), cur ? 1.6 : 1.1);
                    tx(String(m + 1), x0 + lab + m * 40 + 17, ly + 8, fs - 1.5, ln[2] + 'ff', 'center', true);
                }
                tx(ln[1] + '개', x0 + lab + 3 * 40 + 6, ly + 8, fs - 1.5, P.sub + 'ee', 'left', false);
            });
        });
    }

    /* ===================== 모드: 직렬화 크기 ===================== */
    function drawWire(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var unit = w / JSON_LEN;
        if (k >= 1) {
            tx('JSON  ' + JSON_LEN + '바이트', x0, top + 8, fs, P.orange + 'ff', 'left', true);
            rr(x0, top + 20, w, 26, 4, P.orange + '18', P.orange + 'aa', 1.3);
            tx(JSON_S, x0 + w / 2, top + 33, fs, P.text + 'ee', 'center', false);
            rr(x0, top + 52, JSON_LEN * unit, 7, 2, P.orange + '66', P.orange + 'ff', 1);
        }
        var shown = k >= 3 ? PB_GROUPS.length : (k >= 2 ? 2 : 0);
        if (shown > 0) {
            var py = top + 82;
            tx('Protocol Buffers  ' + (k >= 3 ? PB_LEN : PB_GROUPS[0].bytes.length + PB_GROUPS[1].bytes.length) + '바이트', x0, py, fs, P.teal + 'ff', 'left', true);
            var colors = { tag: P.orange, val: P.green, len: P.purple, data: P.teal };
            var gap = 3;
            var bw = (w - gap * (PB_LEN - 1)) / PB_LEN;
            var bi = 0;
            for (var g = 0; g < shown; g++) {
                var grp = PB_GROUPS[g];
                var c = colors[grp.t];
                var gx = x0 + bi * (bw + gap);
                var gw = grp.bytes.length * bw + (grp.bytes.length - 1) * gap;
                grp.bytes.forEach(function (b, bj) {
                    var bx = x0 + (bi + bj) * (bw + gap);
                    rr(bx, py + 12, bw, 28, 4, c + '30', c + 'ff', 1.5);
                    tx(hex2(b), bx + bw / 2, py + 26, fs - 1, P.text + 'ee', 'center', true);
                });
                tx(grp.label, gx + gw / 2, py + 52, fs - 1.5, c + 'ff', 'center', true);
                bi += grp.bytes.length;
            }
            var done = bi;
            rr(x0, py + 64, done * unit, 7, 2, P.teal + '66', P.teal + 'ff', 1);
        }
        if (k >= 4) {
            tx('JSON ' + JSON_LEN + ' → Protocol Buffers ' + PB_LEN + ' (약 ' + SAVE_PCT + '% 작음)', x0 + w / 2, top + 178, fs, P.yellow + 'ff', 'center', true);
        }
    }

    /* ===================== 모드: HTTP/2 다중화 ===================== */
    function drawMux(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var n = step ? step.n : 0;
        var ids = [1, 3, 5];
        var lw = w / 3;
        ids.forEach(function (id, i) {
            var c = P[STREAM_INFO[id].col];
            rr(x0 + i * lw + 2, top, lw - 4, 24, 5, c + '25', c + 'ff', 1.5);
            tx('스트림 ' + id + ' ' + STREAM_INFO[id].name, x0 + i * lw + lw / 2, top + 12, fs - 2, c + 'ff', 'center', true);
        });
        var y = top + 38;
        tx('연결 1개 (프레임이 한 줄로 전송)', x0, y, fs - 1, P.sub + 'ee', 'left', true);
        var gap = 3;
        var bw = (w - gap * (FRAMES.length - 1)) / FRAMES.length;
        FRAMES.forEach(function (f, i) {
            var bx = x0 + i * (bw + gap);
            if (i >= n) {
                rr(bx, y + 12, bw, 28, 4, 'none', P.muted + '66', 1);
                return;
            }
            var c = P[STREAM_INFO[f[1]].col];
            rr(bx, y + 12, bw, 28, 4, c + (f[0] === 'H' ? '55' : '25'), c + 'ff', 1.6);
            tx(f[0] + f[1], bx + bw / 2, y + 26, fs - 1.5, P.text + 'ee', 'center', true);
        });
        tx('H = HEADERS 프레임 · D = DATA 프레임', x0, y + 54, fs - 2, P.sub + 'ee', 'left', false);
        var py = y + 70;
        var lh = mob ? 15 : 17;
        var ph = lh * 3 + 14;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('진행 상황', x0 + 10, py + 11, fs - 2, P.sub + 'ee', 'left', true);
        if (step && step.lines.length) {
            step.lines.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 11 + lh * (i + 1), fs - 1.5, (i === 0 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 호출이 없습니다)', x0 + 10, py + 11 + lh, fs - 1.5, P.sub + 'ee', 'left', false);
        }
        var ty = py + ph + 12;
        var th = 24 + lh;
        rr(x0, ty, w, th, 6, 'none', P.muted + '55', 1.2);
        tx(step && step.lab ? step.lab : '확인할 값', x0 + 10, ty + 11, fs - 2, P.sub + 'ee', 'left', true);
        tx(step && step.val ? step.val : '(없음)', x0 + 10, ty + 11 + lh, fs - 1.5, (step && step.val ? P.green : P.sub) + 'ee', 'left', false);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        if (mode === 'wire') drawWire(padX, top, fullW, mob, step);
        else if (mode === 'mux') drawMux(padX, top, fullW, mob, step);
        else drawCalls(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 gRPC의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = (mob ? 11 : 12.5) * Math.min(1, (W - 16) / ctx.measureText(hint).width);
            tx(hint, W / 2, GH() - (mob ? 12 : 14), hs, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'wire') neededH = mob ? 210 : 220;
        else if (mode === 'mux') neededH = mob ? 290 : 300;
        else neededH = mob ? 270 : 280;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'wire') return '같은 메시지를 JSON과 Protocol Buffers로 표현했을 때의 크기를 비교합니다.';
        if (mode === 'mux') return 'HTTP/2 연결 하나에서 여러 gRPC 호출이 동시에 진행되는 모습을 봅니다.';
        return 'gRPC의 네 가지 호출 방식을 요청과 응답 메시지 수로 비교합니다.';
    }

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
        running = false; stepIdx = -1;
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