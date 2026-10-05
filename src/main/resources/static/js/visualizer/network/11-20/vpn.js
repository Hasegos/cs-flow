/**
 * VPN 터널링 시각화
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
    var root    = el('div', 'vpn-viz');
    var toolbar = el('div', 'vpn-viz__toolbar');
    var tbLeft  = el('div', 'vpn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'vpn-viz__title', 'VPN'));

    var modeWrap = el('div', 'vpn-viz__mode');
    var modeDefs = [
        { key: 'tunnel', label: '캡슐화' },
        { key: 'path', label: '패킷의 여정' },
        { key: 'kinds', label: '종류와 방식' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'vpn-viz__mode-btn' + (i === 0 ? ' vpn-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'vpn-viz__speed');
    speedWrap.appendChild(el('span', 'vpn-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'vpn-viz__speed-btn' + (i === 0 ? ' vpn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'vpn-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'vpn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'vpn-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'vpn-viz__controls');
    var btnPlay  = el('button', 'vpn-viz__btn vpn-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'vpn-viz__btn', '▶| STEP');
    var btnReset = el('button', 'vpn-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 주소와 단계 ===================== */
    var VPN_CLIENT = '10.8.0.2';
    var INNER_DST = '192.168.10.5';
    var CLIENT_PUB = '203.0.113.20';
    var GW_PUB = '198.51.100.1';
    var INNER_TXT = '내부 패킷: ' + VPN_CLIENT + ' → ' + INNER_DST + ' (사설 주소)';
    var OUTER_TXT = '외부 패킷: ' + CLIENT_PUB + ' → ' + GW_PUB + ' (공인 주소)';

    var TUNNEL_STEPS = [
        { k: 0, log: '원격 근무자의 노트북이 인터넷을 거쳐 회사 내부 서버 ' + INNER_DST + '에 접속합니다. 이 주소는 사설 주소라 인터넷에서는 보낼 수 없고, 평문으로 보내면 중간에서 내용이 보입니다. VPN은 패킷을 다른 패킷 안에 넣어(캡슐화) 암호화해서 보냅니다.' },
        { k: 1, log: '1단계 — 노트북의 VPN 소프트웨어가 보낼 원래 패킷(내부 패킷)을 만듭니다. VPN이 준 가상 주소 ' + VPN_CLIENT + '에서 내부 서버 ' + INNER_DST + '로 가는 패킷입니다.' },
        { k: 2, log: '2단계 — 내부 패킷 전체(헤더와 데이터)를 암호화합니다. 암호문이 되면 내부 주소와 내용 모두 중간 장비가 읽을 수 없습니다.' },
        { k: 3, log: '3단계 — 암호문에 VPN 헤더와 새 외부 IP 헤더를 덧붙입니다(캡슐화). 외부 헤더의 주소는 인터넷에서 통하는(NAT를 거친 뒤의) 노트북의 공인 주소 ' + CLIENT_PUB + '와 VPN 게이트웨이 ' + GW_PUB + '입니다. 이 터널링 때문에 바깥에서는 노트북과 게이트웨이 사이의 통신으로만 보입니다.' },
        { k: 4, log: '4단계 — 인터넷의 중간 장비는 외부 헤더(외부 IP 헤더와 VPN 헤더)를 읽을 수 있지만, 내부 주소와 데이터는 암호문이어서 읽을 수 없습니다. 이것이 VPN이 공용 인터넷 구간의 도청을 막는 방식입니다.' },
        { k: 5, log: '5단계 — 게이트웨이는 반대로 외부 헤더를 벗기고(캡슐 해제) 암호문을 복호화해 원래 내부 패킷을 꺼냅니다. 그 패킷을 사내망으로 전달하면 노트북이 사내망에 있는 것처럼 동작합니다.' }
    ];

    var PATH_STEPS = [
        { seg: -1, hl: {}, pkt: [], log: '노트북에서 사내 서버까지 패킷이 지나가는 경로를 따라갑니다. 노트북과 VPN 게이트웨이 사이는 공용 인터넷이고, 게이트웨이 뒤는 사내망입니다.' },
        { seg: -1, hl: { C: ['암호화', 'orange'] }, pkt: [INNER_TXT, '→ 암호화하고 외부 헤더를 붙임'], log: '노트북의 VPN 소프트웨어가 내부 패킷을 암호화하고 외부 헤더를 붙여 터널로 내보냅니다.' },
        { seg: 0, hl: { C: ['송신', 'orange'], I: ['도청 가능', 'red'] }, pkt: [OUTER_TXT, '내용: 암호문 (읽을 수 없음)'], log: '인터넷 구간입니다. 도청하는 사람이 있어도 보이는 것은 외부 헤더(노트북 ↔ 게이트웨이)와 암호문뿐입니다.' },
        { seg: 1, hl: { G: ['복호화', 'green'] }, pkt: [OUTER_TXT, '→ 외부 헤더를 벗기고 복호화'], log: 'VPN 게이트웨이가 외부 패킷을 받아 복호화하고 외부 헤더를 벗겨 원래 내부 패킷을 얻습니다.' },
        { seg: 2, hl: { G: ['전달', 'green'], S: ['수신', 'teal'] }, pkt: [INNER_TXT, '사내망 안에서는 VPN 보호 없는 내부 패킷'], log: '게이트웨이가 내부 패킷을 사내 서버에 전달합니다. 서버에게는 사내망의 가상 주소 ' + VPN_CLIENT + '에서 온 평범한 요청으로 보입니다.' },
        { seg: 2, hl: { S: ['응답', 'teal'], G: ['암호화', 'green'] }, pkt: ['응답: ' + INNER_DST + ' → ' + VPN_CLIENT, '→ 게이트웨이가 암호화하고 외부 헤더를 붙임'], log: '서버의 응답은 반대 방향으로 같은 과정을 거칩니다. 게이트웨이가 응답을 암호화·캡슐화해 노트북으로 되돌려 보냅니다. 노트북이 복호화하면 한 번의 왕복이 끝납니다.' }
    ];

    var KIND_STEPS = [
        { k: 0, log: 'VPN은 연결하는 대상에 따라 크게 두 가지로 나누고, 터널을 만드는 프로토콜도 여러 가지입니다.' },
        { k: 1, log: '원격 접속(remote access) VPN — 개별 사용자의 기기가 회사 게이트웨이와 터널을 만듭니다. 재택근무자의 노트북이 사내망에 접속하는 경우입니다.' },
        { k: 2, log: '사이트 간(site-to-site) VPN — 본사와 지사의 게이트웨이끼리 터널을 만들어, 두 네트워크 안의 기기들이 VPN을 의식하지 않고 서로 통신합니다.' },
        { k: 3, log: 'IPsec — IP 계층에서 패킷을 보호합니다. 데이터는 ESP로 암호화하고 키 교환에는 IKE를 씁니다. 사이트 간 VPN에 널리 쓰입니다.' },
        { k: 4, log: 'WireGuard — UDP 위에서 동작하는 비교적 새로운 VPN으로 코드가 작고 설정이 단순합니다. 리눅스 커널에는 5.6부터 포함되었습니다.' },
        { k: 5, log: 'OpenVPN — TLS를 이용하는 VPN으로, 기본 포트는 UDP 1194이고 TCP도 쓸 수 있습니다. 방식마다 장단점이 있어 환경에 맞게 고릅니다.' }
    ];
    var KINDS = [
        ['IPsec', 'IP 계층 · ESP + IKE', 'orange'],
        ['WireGuard', 'UDP · 단순한 설정', 'teal'],
        ['OpenVPN', 'TLS 기반 · UDP 1194', 'purple']
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'tunnel';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'path') return PATH_STEPS;
        if (mode === 'kinds') return KIND_STEPS;
        return TUNNEL_STEPS;
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
    function colorOf(key) {
        return P[key] || P.muted;
    }
    function block(x, y, w, h, label, color, fs, strong) {
        rr(x, y, w, h, 4, color + (strong ? '40' : '22'), color + (strong ? 'ff' : '99'), strong ? 1.8 : 1.2);
        tx(label, x + w / 2, y + h / 2, fs, P.text + 'ee', 'center', true);
    }

    /* ===================== 모드: 캡슐화 ===================== */
    function drawTunnel(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var bh = 34;
        var rowGap = 62;
        var y = top + 4;
        var spy = k >= 4;
        if (k >= 1) {
            tx('원래 패킷 (내부 패킷)', x0, y + 6, fs - 1, P.sub + 'ee', 'left', true);
            block(x0, y + 14, w * 0.36, bh, '내부 IP 헤더', P.teal, fs - 1, false);
            block(x0 + w * 0.36 + 4, y + 14, w * 0.64 - 4, bh, '데이터', P.teal, fs - 1, false);
            tx(INNER_TXT, x0, y + 14 + bh + 11, fs - 2, P.sub + 'ee', 'left', false);
        }
        y += rowGap + 8;
        if (k >= 2) {
            tx('암호화', x0 + w / 2, y - 12, fs - 1, P.yellow + 'ee', 'center', true);
            block(x0, y + 4, w, bh, '암호문 (내부 헤더와 데이터를 모두 암호화)', P.red, fs - 1, spy);
        }
        y += rowGap - 8;
        if (k >= 3) {
            tx('캡슐화한 패킷 (외부 패킷)', x0, y + 6, fs - 1, P.sub + 'ee', 'left', true);
            block(x0, y + 14, w * 0.3, bh, '외부 IP 헤더', P.orange, fs - 1, spy);
            block(x0 + w * 0.3 + 4, y + 14, w * 0.14 - 4, bh, 'VPN', P.purple, fs - 1, false);
            block(x0 + w * 0.44 + 4, y + 14, w * 0.56 - 4, bh, '암호문', P.red, fs - 1, spy);
            tx(OUTER_TXT, x0, y + 14 + bh + 11, fs - 2, P.sub + 'ee', 'left', false);
        }
        y += rowGap;
        if (k >= 4) {
            tx('읽을 수 있는 것: 외부 헤더(주황 · 보라)', x0, y + 6, fs - 1, P.yellow + 'ee', 'left', true);
            tx('읽을 수 없는 것: 암호문(빨강)', x0, y + 22, fs - 1, P.yellow + 'ee', 'left', true);
        }
        if (k >= 5) {
            tx('게이트웨이: 외부 헤더 제거 → 복호화 → 내부 패킷 복원', x0, y + 44, fs - 1, P.green + 'ff', 'left', true);
        }
    }

    /* ===================== 모드: 패킷의 여정 ===================== */
    function drawPath(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var s = step || { seg: -1, hl: {}, pkt: [] };
        var gap = mob ? 14 : 28;
        var bw = (w - gap * 3) / 4;
        var bh = 58;
        var nodes = [
            { id: 'C', name: '노트북', sub: VPN_CLIENT, col: 'orange' },
            { id: 'I', name: '인터넷', sub: '공용망', col: 'red' },
            { id: 'G', name: '게이트웨이', sub: GW_PUB, col: 'green' },
            { id: 'S', name: '사내 서버', sub: INNER_DST, col: 'teal' }
        ];
        var y = top + 8;
        nodes.forEach(function (n, i) {
            if (i === 3) return;
            var x1 = x0 + i * (bw + gap) + bw;
            var x2 = x1 + gap;
            var on = s.seg === i;
            ctx.beginPath();
            ctx.moveTo(x1, y + bh / 2);
            ctx.lineTo(x2, y + bh / 2);
            ctx.strokeStyle = on ? P.yellow + 'ff' : P.muted + '77';
            ctx.lineWidth = on ? 3 : 1.6;
            ctx.stroke();
        });
        nodes.forEach(function (n, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(n.col);
            var badge = s.hl[n.id];
            var bc = badge ? colorOf(badge[1]) : c;
            rr(x, y, bw, bh, 6, c + '18', (badge ? bc : c) + (badge ? 'ff' : '88'), badge ? 1.9 : 1.2);
            tx(n.name, x + bw / 2, y + 13, fs - (mob ? 1.5 : 0.5), c + 'ee', 'center', true);
            tx(n.sub, x + bw / 2, y + 28, fs - 3, P.sub + 'ee', 'center', false);
            if (badge) tx(badge[0], x + bw / 2, y + 46, fs - 2.5, bc + 'ff', 'center', true);
        });
        var tubeX1 = x0 + bw / 2;
        var tubeX2 = x0 + 2 * (bw + gap) + bw / 2;
        var ty = y + bh + 14;
        ctx.beginPath();
        ctx.moveTo(tubeX1, ty);
        ctx.lineTo(tubeX2, ty);
        ctx.strokeStyle = P.purple + 'cc';
        ctx.lineWidth = 6;
        ctx.stroke();
        tx('암호화된 터널 (노트북 ↔ 게이트웨이)', (tubeX1 + tubeX2) / 2, ty + 16, fs - 1.5, P.purple + 'ff', 'center', true);
        tx('사내망 (VPN 보호 밖)', x0 + 3 * (bw + gap) + bw / 2, ty + 16, fs - 1.5, P.teal + 'ee', 'center', true);

        var py = ty + 34;
        var lh = mob ? 15 : 17;
        var ph = lh * 2 + 22;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('이 구간의 패킷', x0 + 10, py + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (s.pkt.length) {
            s.pkt.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 11 + lh * (i + 1), fs - 1.5, (i === 0 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 보낸 패킷이 없습니다)', x0 + 10, py + 11 + lh, fs - 1.5, P.muted + 'cc', 'left', false);
        }
    }

    /* ===================== 모드: 종류와 방식 ===================== */
    function drawKinds(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var bw = mob ? 92 : 110;
        var bh = 30;
        var y = top + 8;
        function node(x, yy, label, col) {
            var c = colorOf(col);
            rr(x, yy, bw, bh, 5, c + '18', c + 'cc', 1.4);
            tx(label, x + bw / 2, yy + bh / 2, fs - 1.5, c + 'ee', 'center', true);
        }
        function tube(x1, x2, yy, label, on) {
            ctx.beginPath();
            ctx.moveTo(x1, yy);
            ctx.lineTo(x2, yy);
            ctx.strokeStyle = (on ? P.purple : P.muted) + (on ? 'ff' : '66');
            ctx.lineWidth = on ? 6 : 3;
            ctx.stroke();
            tx(label, (x1 + x2) / 2, yy - 10, fs - 2, (on ? P.purple : P.sub) + 'ee', 'center', true);
        }
        tx('원격 접속 VPN', x0, y, fs - 0.5, (k === 1 ? P.text : P.sub) + 'ee', 'left', true);
        if (k >= 1) {
            node(x0, y + 12, '노트북', 'orange');
            tube(x0 + bw, x0 + w - bw, y + 12 + bh / 2, '터널', k === 1);
            node(x0 + w - bw, y + 12, mob ? '게이트웨이' : 'VPN 게이트웨이', 'green');
        }
        var y2 = y + 66;
        tx('사이트 간 VPN', x0, y2, fs - 0.5, (k === 2 ? P.text : P.sub) + 'ee', 'left', true);
        if (k >= 2) {
            node(x0, y2 + 12, '본사 게이트웨이', 'green');
            tube(x0 + bw, x0 + w - bw, y2 + 12 + bh / 2, '터널', k === 2);
            node(x0 + w - bw, y2 + 12, '지사 게이트웨이', 'green');
        }
        var y3 = y2 + 66;
        KINDS.forEach(function (r, i) {
            if (k < 3 + i) return;
            var yy = y3 + i * 26;
            var cur = k === 3 + i;
            var c = colorOf(r[2]);
            rr(x0, yy, w, 22, 4, cur ? c + '25' : 'none', c + (cur ? 'ff' : '77'), cur ? 1.8 : 1.2);
            tx(r[0], x0 + 10, yy + 11, fs - 1, c + 'ff', 'left', true);
            tx(r[1], x0 + w - 10, yy + 11, fs - 1.5, (cur ? P.text : P.sub) + 'ee', 'right', false);
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

        if (mode === 'path') drawPath(padX, top, fullW, mob, step);
        else if (mode === 'kinds') drawKinds(padX, top, fullW, mob, step);
        else drawTunnel(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 패킷이 터널을 지나는 과정을 확인하세요.';
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
        if (mode === 'path') neededH = mob ? 270 : 280;
        else if (mode === 'kinds') neededH = mob ? 340 : 340;
        else neededH = mob ? 330 : 330;
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
        if (mode === 'path') return '노트북에서 사내 서버까지 터널을 지나는 패킷의 여정을 봅니다.';
        if (mode === 'kinds') return 'VPN의 두 가지 형태와 대표 프로토콜을 봅니다.';
        return '내부 패킷을 암호화해 다른 패킷 안에 넣는 캡슐화 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('vpn-viz__speed-btn--active'); });
        btn.classList.add('vpn-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('vpn-viz__mode-btn--active', d.key === m); });
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