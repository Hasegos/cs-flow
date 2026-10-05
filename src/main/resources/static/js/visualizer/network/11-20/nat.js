/**
 * NAT 시각화
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
    var root    = el('div', 'nat-viz');
    var toolbar = el('div', 'nat-viz__toolbar');
    var tbLeft  = el('div', 'nat-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'nat-viz__title', 'NAT'));

    var modeWrap = el('div', 'nat-viz__mode');
    var modeDefs = [
        { key: 'pat', label: 'PAT 변환' },
        { key: 'reply', label: '응답과 차단' },
        { key: 'forward', label: '포트 포워딩' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'nat-viz__mode-btn' + (i === 0 ? ' nat-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'nat-viz__speed');
    speedWrap.appendChild(el('span', 'nat-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'nat-viz__speed-btn' + (i === 0 ? ' nat-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'nat-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'nat-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'nat-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'nat-viz__controls');
    var btnPlay  = el('button', 'nat-viz__btn nat-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'nat-viz__btn', '▶| STEP');
    var btnReset = el('button', 'nat-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 주소와 변환 표 ===================== */
    var PUB_IP = '203.0.113.5';
    var A_IP = '192.168.0.10';
    var B_IP = '192.168.0.20';
    var SRV_IP = '198.51.100.7';
    var SRC_PORT = 51000;
    var PORT_A = 40001;
    var PORT_B = 40002;
    var FWD_PORT = 8080;
    var WEB_PORT = 80;
    function ep(ip, port) { return ip + ':' + port; }

    function st(log, o) {
        var s = { log: log, hl: {}, arrows: [], inn: '', out: '', table: [], drop: false };
        for (var k in o) s[k] = o[k];
        return s;
    }
    var T_A = [A_IP + ':' + SRC_PORT, PORT_A, ''];
    var T_B = [B_IP + ':' + SRC_PORT, PORT_B, ''];
    var PAT_STEPS = [
        st('같은 가정 · 사무실의 내부 호스트 A와 B는 사설 IP(' + A_IP + ', ' + B_IP + ')를 씁니다. 사설 주소는 인터넷에서 라우팅되지 않아 그대로는 외부 서버와 통신할 수 없습니다. 공유기(NAT)는 공인 IP ' + PUB_IP + ' 하나를 가지고 있습니다. 예시 주소는 문서용 주소 대역입니다.', {}),
        st('A가 외부 서버 ' + SRV_IP + ':443에 접속합니다. 패킷의 출발지는 사설 주소 ' + ep(A_IP, SRC_PORT) + '이고 NAT 장치로 갑니다.',
            { hl: { A: ['전송', 'orange'] }, arrows: [['A', 'N']], inn: '내부측 ' + ep(A_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443) }),
        st('NAT가 출발지를 공인 주소 ' + ep(PUB_IP, PORT_A) + '로 바꿔 내보내고, 변환 표에 "' + ep(A_IP, SRC_PORT) + ' ↔ 외부 포트 ' + PORT_A + '"를 기록합니다. 서버에는 공유기의 공인 IP에서 온 것으로 보입니다(이 예시는 포트 변환을 보이려고 항상 새 포트를 줍니다. 실제 장비는 충돌할 때만 바꾸기도 합니다).',
            { hl: { A: ['전송', 'orange'], N: ['출발지 변환', 'green'] }, arrows: [['A', 'N'], ['N', 'S']], inn: '내부측 ' + ep(A_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), out: '외부측 ' + ep(PUB_IP, PORT_A) + ' → ' + ep(SRV_IP, 443), table: [T_A] }),
        st('B도 같은 서버에 접속합니다. B의 출발지 포트가 우연히 A와 같은 ' + SRC_PORT + '입니다. 내부 주소가 다르므로 내부에서는 구분되지만, 그대로 내보내면 같은 공인 IP에서 나가는 두 연결이 겹칩니다.',
            { hl: { B: ['전송', 'purple'] }, arrows: [['B', 'N']], inn: '내부측 ' + ep(B_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), table: [T_A] }),
        st('PAT(포트 주소 변환)는 IP 주소와 함께 출발지 포트도 바꿔 이를 해결합니다. B의 연결에는 다른 외부 포트 ' + PORT_B + '를 할당해 ' + ep(PUB_IP, PORT_B) + '로 내보내고 표에 기록합니다. 하나의 공인 IP로 여러 내부 호스트가 동시에 통신합니다.',
            { hl: { B: ['전송', 'purple'], N: ['주소·포트 변환', 'green'] }, arrows: [['B', 'N'], ['N', 'S']], inn: '내부측 ' + ep(B_IP, SRC_PORT) + ' → ' + ep(SRV_IP, 443), out: '외부측 ' + ep(PUB_IP, PORT_B) + ' → ' + ep(SRV_IP, 443), table: [T_A, T_B] }),
        st('정리 — 변환 표가 "내부 주소:포트 ↔ 공인 포트" 대응을 기억하므로 응답이 돌아올 때 어느 내부 호스트로 보낼지 알 수 있습니다. 응답 처리는 "응답과 차단" 탭에서 봅니다.',
            { hl: { N: ['변환 표 유지', 'green'] }, table: [T_A, T_B] })
    ];

    var REPLY_STEPS = [
        st('A와 B의 연결이 이미 변환 표에 기록되어 있는 상태입니다. 서버의 응답이 공인 주소로 돌아올 때 NAT가 어떻게 처리하는지 봅니다.', { table: [T_A, T_B] }),
        st('서버가 ' + ep(PUB_IP, PORT_A) + '로 응답합니다. NAT가 변환 표에서 외부 포트 ' + PORT_A + '를 찾아 목적지를 ' + ep(A_IP, SRC_PORT) + '로 되돌려 A에게 전달합니다.',
            { hl: { S: ['응답', 'teal'], N: ['표에서 찾음', 'green'], A: ['수신', 'orange'] }, arrows: [['S', 'N'], ['N', 'A']], out: '외부측 ' + ep(SRV_IP, 443) + ' → ' + ep(PUB_IP, PORT_A), inn: '내부측 ' + ep(SRV_IP, 443) + ' → ' + ep(A_IP, SRC_PORT), table: [T_A, T_B] }),
        st('이번에는 외부에서 먼저 ' + ep(PUB_IP, 40009) + '로 패킷이 들어옵니다. 변환 표에 이 포트의 항목이 없어 일반적인 NAT는 어느 내부 호스트로 보낼지 알 수 없어 이 패킷을 버립니다. NAT는 내부에서 시작한 연결에만 변환 정보를 만듭니다.',
            { hl: { S: ['먼저 접속 시도', 'teal'], N: ['항목 없어 폐기', 'red'] }, arrows: [['S', 'N']], out: '외부측 ' + ep(SRV_IP, 5555) + ' → ' + ep(PUB_IP, 40009), table: [T_A, T_B], drop: true }),
        st('연결이 오래 쓰이지 않으면 NAT는 변환 표의 항목을 지웁니다(유지 시간은 장비와 프로토콜마다 다릅니다). 항목이 지워진 뒤 들어오는 응답은 위와 같은 이유로 버려집니다.',
            { hl: { N: ['항목 만료', 'yellow'] }, table: [T_B] }),
        st('정리 — NAT 뒤의 호스트는 외부에서 직접 접속할 수 없는 부수 효과가 생기지만, 이것은 NAT의 목적이 아니므로 보안은 방화벽으로 따로 정해야 합니다. 외부에서 내부 서버로 접속하게 하려면 "포트 포워딩" 탭의 방법을 씁니다.',
            { hl: { N: ['방화벽은 별개', 'green'] }, table: [T_B] })
    ];

    var T_F = ['외부 ' + PUB_IP + ':' + FWD_PORT + ' → ' + B_IP + ':' + WEB_PORT, FWD_PORT, 'static'];
    var FWD_STEPS = [
        st('B는 웹 서버(포트 ' + WEB_PORT + ')를 운영합니다. 외부에서 먼저 시작하는 접속은 NAT가 어디로 보낼지 모르므로, 공인 IP의 특정 포트를 내부 서버에 연결해 두는 포트 포워딩 규칙이 필요합니다.', {}),
        st('관리자가 규칙을 등록합니다. "공인 ' + PUB_IP + ' 포트 ' + FWD_PORT + '로 오는 패킷은 ' + ep(B_IP, WEB_PORT) + '로 보낸다." 이 규칙은 미리 정해 둔 고정(static) 항목이라 연결이 오지 않아도 유지됩니다.',
            { hl: { N: ['규칙 등록', 'green'] }, table: [T_F] }),
        st('외부 클라이언트 ' + SRV_IP + '가 ' + ep(PUB_IP, FWD_PORT) + '로 접속을 시작합니다.',
            { hl: { S: ['접속 시작', 'teal'] }, arrows: [['S', 'N']], out: '외부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(PUB_IP, FWD_PORT), table: [T_F] }),
        st('NAT가 규칙에 따라 목적지를 ' + ep(B_IP, WEB_PORT) + '로 바꿔 B에게 전달합니다(목적지 변환). B의 웹 서버가 요청을 받습니다.',
            { hl: { S: ['접속 시작', 'teal'], N: ['목적지 변환', 'green'], B: ['수신', 'purple'] }, arrows: [['S', 'N'], ['N', 'B']], out: '외부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(PUB_IP, FWD_PORT), inn: '내부측 ' + ep(SRV_IP, 50000) + ' → ' + ep(B_IP, WEB_PORT), table: [T_F] }),
        st('B의 응답은 출발지가 ' + ep(B_IP, WEB_PORT) + '입니다. NAT가 출발지를 ' + ep(PUB_IP, FWD_PORT) + '로 되돌려 클라이언트에게 보냅니다. 클라이언트는 공유기의 공인 주소와 통신한 것으로 보입니다.',
            { hl: { B: ['응답', 'purple'], N: ['출발지 복원', 'green'], S: ['수신', 'teal'] }, arrows: [['B', 'N'], ['N', 'S']], inn: '내부측 ' + ep(B_IP, WEB_PORT) + ' → ' + ep(SRV_IP, 50000), out: '외부측 ' + ep(PUB_IP, FWD_PORT) + ' → ' + ep(SRV_IP, 50000), table: [T_F] })
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'pat';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'reply') return REPLY_STEPS;
        if (mode === 'forward') return FWD_STEPS;
        return PAT_STEPS;
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

    /* ===================== 공통: 토폴로지와 변환 표 ===================== */
    function colorOf(key) {
        return P[key] || P.muted;
    }
    function drawArrow(x1, y1, x2, y2, color) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(ang - 0.45), y2 - 9 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 9 * Math.cos(ang + 0.45), y2 - 9 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function drawNat(x0, top, w, mob, step, pol) {
        var fs = mob ? 10 : 11.5;
        var s = step || { hl: {}, arrows: [], inn: '', out: '', table: [], drop: false };
        var bw = mob ? 78 : 130;
        var bh = 52;
        var topH = bh * 2 + 24;
        var xs = { L: x0, M: x0 + (w - bw) / 2, R: x0 + w - bw };
        var yA = top;
        var yB = top + bh + 24;
        var cy = top + topH / 2;
        var nodes = {
            A: { x: xs.L, y: yA, name: 'A', ip: A_IP, col: 'orange' },
            B: { x: xs.L, y: yB, name: pol === 'forward' ? 'B (웹 서버)' : 'B', ip: B_IP, col: 'purple' },
            N: { x: xs.M, y: cy - bh / 2 - 14, name: 'NAT 공유기', ip: PUB_IP, col: 'green', h: bh + 28 },
            S: { x: xs.R, y: cy - bh / 2, name: pol === 'forward' ? '외부 클라이언트' : '외부 서버', ip: SRV_IP, col: 'teal' }
        };
        s.arrows.forEach(function (a) {
            var from = a[0];
            var to = a[1];
            var c = (s.drop ? P.red : P.yellow) + 'ff';
            var p1;
            var p2;
            if (from === 'A' || from === 'B') {
                p1 = { x: nodes[from].x + bw, y: nodes[from].y + bh / 2 };
                p2 = { x: nodes.N.x, y: nodes.N.y + (from === 'A' ? 16 : nodes.N.h - 16) };
            } else if (to === 'A' || to === 'B') {
                p1 = { x: nodes.N.x, y: nodes.N.y + (to === 'A' ? 16 : nodes.N.h - 16) };
                p2 = { x: nodes[to].x + bw, y: nodes[to].y + bh / 2 };
            } else if (from === 'S') {
                p1 = { x: nodes.S.x, y: nodes.S.y + bh / 2 - 8 };
                p2 = { x: nodes.N.x + bw, y: nodes.N.y + nodes.N.h / 2 - 8 };
            } else {
                p1 = { x: nodes.N.x + bw, y: nodes.N.y + nodes.N.h / 2 + 8 };
                p2 = { x: nodes.S.x, y: nodes.S.y + bh / 2 + 8 };
            }
            drawArrow(p1.x, p1.y, p2.x, p2.y, c);
        });
        ['A', 'B', 'N', 'S'].forEach(function (id) {
            var n = nodes[id];
            var h = n.h || bh;
            var c = colorOf(n.col);
            var badge = s.hl[id];
            var bc = badge ? colorOf(badge[1]) : c;
            rr(n.x, n.y, bw, h, 6, c + '18', (badge ? bc : c) + (badge ? 'ff' : '88'), badge ? 1.9 : 1.2);
            tx(n.name, n.x + bw / 2, n.y + 13, fs - (mob ? 1 : 0), c + 'ee', 'center', true);
            tx(n.ip, n.x + bw / 2, n.y + 28, fs - 2.5, P.muted + 'ee', 'center', false);
            if (badge) tx(badge[0], n.x + bw / 2, n.y + h - 9, fs - 1.5, bc + 'ff', 'center', true);
        });

        var py = top + topH + 14;
        var lh = mob ? 15 : 17;
        var ph = lh * 2 + 22;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('패킷 헤더 (출발지 → 목적지)', x0 + 10, py + 11, fs - 2, P.muted + 'ee', 'left', true);
        tx(s.inn || '내부측 —', x0 + 10, py + 11 + lh, fs - 1.5, (s.inn ? P.text : P.muted) + 'ee', 'left', false);
        tx(s.out || '외부측 —', x0 + 10, py + 11 + lh * 2, fs - 1.5, (s.out ? P.yellow : P.muted) + 'ee', 'left', false);

        var cyy = py + ph + 12;
        var rows = Math.max(1, s.table.length);
        var chh = 24 + rows * lh;
        rr(x0, cyy, w, chh, 6, 'none', P.muted + '55', 1.2);
        tx('NAT 변환 표', x0 + 10, cyy + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (!s.table.length) {
            tx('(비어 있음)', x0 + 10, cyy + 11 + lh, fs - 1.5, P.muted + 'cc', 'left', false);
        }
        s.table.forEach(function (r, i) {
            var line = r[2] === 'static' ? r[0] : r[0] + ' ↔ 외부 포트 ' + r[1];
            tx(line, x0 + 10, cyy + 11 + lh * (i + 1), fs - 1.5, (r[2] === 'static' ? P.yellow : P.green) + 'ee', 'left', false);
        });
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

        drawNat(padX, top, fullW, mob, step, mode);

        if (!step) {
            var hint = '아래 STEP으로 주소가 바뀌는 과정을 확인하세요.';
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
        neededH = mob ? 320 : 330;
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
        if (mode === 'reply') return '응답이 돌아올 때와 외부에서 먼저 접속할 때 NAT가 어떻게 처리하는지 봅니다.';
        if (mode === 'forward') return '외부에서 내부 서버로 접속하게 하는 포트 포워딩을 봅니다.';
        return '사설 IP의 여러 호스트가 하나의 공인 IP로 통신하는 PAT 변환 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('nat-viz__speed-btn--active'); });
        btn.classList.add('nat-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('nat-viz__mode-btn--active', d.key === m); });
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