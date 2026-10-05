/**
 * 유니 / 멀티 / 브로드캐스트 시각화
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
    var root    = el('div', 'mc-viz');
    var toolbar = el('div', 'mc-viz__toolbar');
    var tbLeft  = el('div', 'mc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mc-viz__title', 'MULTICAST'));

    var modeWrap = el('div', 'mc-viz__mode');
    var modeDefs = [
        { key: 'cast', label: '전송 방식' },
        { key: 'addr', label: '주소' },
        { key: 'igmp', label: '그룹 가입' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'mc-viz__mode-btn' + (i === 0 ? ' mc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'mc-viz__speed');
    speedWrap.appendChild(el('span', 'mc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'mc-viz__speed-btn' + (i === 0 ? ' mc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'mc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'mc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'mc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'mc-viz__controls');
    var btnPlay  = el('button', 'mc-viz__btn mc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'mc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'mc-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 호스트와 전송 방식 ===================== */
    var HOSTS = ['H1', 'H2', 'H3', 'H4', 'H5'];
    var INTERESTED = [1, 0, 1, 0, 1];
    var WANT = INTERESTED.reduce(function (a, b) { return a + b; }, 0);
    var GROUP = '239.1.2.3';
    function none() { return [0, 0, 0, 0, 0]; }
    function recvOf(list) { return list.filter(function (v) { return v === 1; }).length; }
    var ST_UNI1 = [1, 0, 0, 0, 0];
    var ST_UNI3 = [1, 0, 1, 0, 1];
    var ST_BC = [1, 2, 1, 2, 1];
    var ST_MC = [1, 0, 1, 0, 1];
    var CAST_STEPS = [
        { copies: 0, st: none(), up: [], mem: null, lines: [], lab: '', val: '',
          log: '송신자가 같은 데이터를 보낼 때 받는 쪽이 누구인지에 따라 유니캐스트, 브로드캐스트, 멀티캐스트로 나뉩니다. 같은 네트워크의 호스트 5개(H1~H5) 가운데 H1, H3, H5가 이 데이터를 원하는 상황을 봅니다.' },
        { copies: 1, st: ST_UNI1, up: [], mem: null, lines: ['유니캐스트: 받는 호스트 1대(H1)', '송신 1번, 받는 호스트 1대'], lab: '송신 횟수', val: '1번',
          log: '유니캐스트는 송신자와 수신자가 1:1로 통신합니다. 웹 서핑 같은 일반적인 인터넷 통신이 대부분 유니캐스트입니다.' },
        { copies: WANT, st: ST_UNI3, up: [], mem: null, lines: ['같은 데이터를 H1, H3, H5에 각각 전송', '받는 사람이 늘수록 송신도 늘어남'], lab: '송신 횟수', val: WANT + '번 (수신자마다 1번)',
          log: '같은 데이터를 원하는 호스트가 ' + WANT + '대이면 유니캐스트는 데이터를 ' + WANT + '번 보내야 합니다. 수신자가 늘수록 송신자의 부담과 네트워크 사용량이 비례해서 늘어납니다.' },
        { copies: 1, st: ST_BC, up: [], mem: null, lines: ['브로드캐스트: 같은 네트워크 전체에 전송', 'H2, H4는 원하지 않아도 받아서 버림'], lab: '송신 횟수 / 받은 호스트', val: '1번 / ' + HOSTS.length + '대',
          log: '브로드캐스트는 같은 네트워크(브로드캐스트 도메인)의 모든 호스트에게 한 번에 보냅니다. 송신은 1번이지만 원하지 않는 H2, H4도 패킷을 받아 처리한 뒤 버려야 합니다. ARP 요청과 DHCP Discover가 이 방식입니다.' },
        { copies: 1, st: ST_MC, up: [], mem: null, lines: ['멀티캐스트: 그룹에 가입한 호스트만 수신', 'H1, H3, H5가 그룹 ' + GROUP + '에 가입'], lab: '송신 횟수 / 받은 호스트', val: '1번 / ' + recvOf(ST_MC) + '대',
          log: '멀티캐스트는 그룹 주소로 한 번 보내면 그 그룹에 가입한 호스트에게만 전달됩니다. 송신은 1번이고 원하는 ' + recvOf(ST_MC) + '대만 받으므로, 유니캐스트의 반복 전송과 브로드캐스트의 낭비를 모두 줄입니다.' },
        { copies: 0, st: none(), up: [], mem: null, lines: ['유니캐스트: 송신 ' + WANT + '번 · 받은 호스트 ' + recvOf(ST_UNI3) + '대', '브로드캐스트: 송신 1번 · 받은 호스트 ' + HOSTS.length + '대'], lab: '멀티캐스트', val: '송신 1번 · 받은 호스트 ' + recvOf(ST_MC) + '대',
          log: '정리 — 원하는 수신자가 ' + WANT + '대일 때 유니캐스트는 송신 ' + WANT + '번, 브로드캐스트는 송신 1번이지만 호스트 ' + HOSTS.length + '대 모두가 받고, 멀티캐스트는 송신 1번에 원하는 ' + recvOf(ST_MC) + '대만 받습니다.' }
    ];

    /* ===================== 데이터: 주소 ===================== */
    function macOf(ip) {
        var p = ip.split('.').map(Number);
        function h(n) { return ('0' + n.toString(16)).slice(-2); }
        return '01:00:5e:' + h(p[1] & 0x7F) + ':' + h(p[2]) + ':' + h(p[3]);
    }
    var ADDR_ROWS = [
        { name: '유니캐스트', val: '192.168.1.10', col: 'orange', note: '호스트 하나를 가리키는 주소' },
        { name: '브로드캐스트', val: '192.168.1.255', col: 'red', note: '192.168.1.0/24의 마지막 주소 (모든 호스트 비트가 1)' },
        { name: '멀티캐스트', val: '224.0.0.0 ~ 239.255.255.255', col: 'teal', note: '앞 4비트가 1110인 클래스 D 영역 (224.0.0.0/4)' },
        { name: '멀티캐스트 MAC', val: GROUP + ' → ' + macOf(GROUP), col: 'purple', note: '01:00:5e + 그룹 주소의 하위 23비트' }
    ];
    var ADDR_STEPS = [
        { k: 0, log: '전송 방식마다 쓰는 목적지 주소가 다릅니다. IPv4 주소와 이더넷 MAC 주소가 어떻게 달라지는지 한 줄씩 봅니다.' },
        { k: 1, log: '유니캐스트 — 목적지 주소가 호스트 하나를 가리킵니다. 예: 192.168.1.10.' },
        { k: 2, log: '브로드캐스트 — 서브넷의 호스트 비트를 모두 1로 채운 주소(192.168.1.255)로 그 네트워크 전체에 보냅니다. 제한된 브로드캐스트 주소 255.255.255.255는 라우터를 넘지 않습니다. IPv6에는 브로드캐스트가 없고 멀티캐스트가 그 역할을 합니다.' },
        { k: 3, log: '멀티캐스트 — 224.0.0.0부터 239.255.255.255까지가 멀티캐스트 그룹 주소입니다. 앞 4비트가 1110입니다. 예: 224.0.0.1은 같은 네트워크의 모든 호스트, 224.0.0.2는 모든 라우터를 가리킵니다.' },
        { k: 4, log: '이더넷에서는 멀티캐스트 그룹 주소를 MAC 주소 01:00:5e로 시작하는 주소에 대응시킵니다. 그룹 주소 ' + GROUP + '의 하위 23비트(1.2.3)를 붙여 ' + macOf(GROUP) + '가 됩니다.' },
        { k: 5, log: '정리 — 그룹 주소의 의미 있는 28비트 중 5비트는 MAC 주소로 옮겨지지 않아, 서로 다른 그룹 주소 32개가 같은 MAC 주소를 쓸 수 있습니다. 그래서 수신 호스트는 IP 계층에서 한 번 더 걸러야 합니다.' }
    ];

    /* ===================== 데이터: 그룹 가입 ===================== */
    var IGMP_STEPS = [
        { copies: 0, st: none(), up: [], mem: [0, 0, 0, 0, 0], lines: [], lab: '', val: '',
          log: '멀티캐스트는 수신자가 그룹에 가입해야 데이터를 받습니다. IPv4에서는 IGMP(Internet Group Management Protocol)로 가입과 탈퇴를 알립니다. 그룹 주소는 ' + GROUP + '입니다.' },
        { copies: 0, st: none(), up: [0], mem: [1, 0, 0, 0, 0], lines: ['H1이 그룹 ' + GROUP + ' 가입 보고(IGMP)', '네트워크가 H1을 가입자로 기억'], lab: '그룹 가입자', val: 'H1',
          log: 'H1이 IGMP 멤버십 보고(Membership Report)를 보내 그룹 ' + GROUP + '에 가입합니다. 라우터와 스위치가 이 보고를 보고 가입자를 기억합니다.' },
        { copies: 0, st: none(), up: [2, 4], mem: [1, 0, 1, 0, 1], lines: ['H3, H5도 같은 그룹에 가입', '가입자가 3대로 늘어남'], lab: '그룹 가입자', val: 'H1, H3, H5',
          log: 'H3과 H5도 같은 그룹에 가입합니다. 가입자는 H1, H3, H5 3대입니다.' },
        { copies: 1, st: ST_BC, up: [], mem: [1, 0, 1, 0, 1], lines: ['IGMP 스누핑을 안 쓰는 스위치', '그룹 프레임을 모든 포트로 내보냄'], lab: '프레임이 도착한 포트', val: HOSTS.length + '개 (가입 안 한 2개 포함)',
          log: '스위치가 IGMP를 모르면 멀티캐스트 프레임을 브로드캐스트처럼 모든 포트로 보냅니다. 가입하지 않은 H2, H4에도 프레임이 전달되어 불필요한 트래픽이 생깁니다.' },
        { copies: 1, st: ST_MC, up: [], mem: [1, 0, 1, 0, 1], lines: ['IGMP 스누핑을 쓰는 스위치', '가입자가 있는 포트로만 내보냄'], lab: '프레임이 도착한 포트', val: recvOf(ST_MC) + '개 (가입자만)',
          log: 'IGMP 스누핑을 지원하는 스위치는 오가는 IGMP 메시지를 엿보고 가입자가 있는 포트만 기억해, 그 포트로만 멀티캐스트 프레임을 보냅니다. 가입자 ' + recvOf(ST_MC) + '대만 받습니다.' },
        { copies: 1, st: [1, 0, 0, 0, 1], up: [2], mem: [1, 0, 0, 0, 1], lines: ['H3이 그룹 탈퇴(IGMP Leave)', '이후 H1, H5만 수신'], lab: '그룹 가입자', val: 'H1, H5',
          log: 'H3이 그룹에서 탈퇴하면 가입자 목록에서 빠지고, 이후 멀티캐스트 데이터는 H1과 H5에게만 갑니다. 멀티캐스트 라우터가 가입자가 없음을 확인하면 그 네트워크로는 그룹 트래픽을 보내지 않습니다.' },
        { copies: 0, st: none(), up: [], mem: [1, 0, 0, 0, 1], lines: ['가입 → 스위치가 가입자 포트를 기억', '전달은 가입자에게만, 탈퇴하면 중단'], lab: '핵심', val: '그룹 가입 상태가 전달 범위를 정함',
          log: '정리 — 멀티캐스트는 가입한 호스트에게만 전달됩니다. IGMP가 가입과 탈퇴를 알리고, IGMP 스누핑이 있는 스위치가 그 범위를 실제 포트에 반영합니다. IPv6에서는 같은 역할을 MLD가 합니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'cast';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'addr') return ADDR_STEPS;
        if (mode === 'igmp') return IGMP_STEPS;
        return CAST_STEPS;
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
    function drawArrow(x1, y1, x2, y2, color) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 8 * Math.cos(ang - 0.45), y2 - 8 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 8 * Math.cos(ang + 0.45), y2 - 8 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ===================== 모드: 네트워크 장면 (전송 방식, 그룹 가입) ===================== */
    function drawNet(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var gap = 6;
        var bw = (w - gap * 4) / 5;
        var hy = top + 108;
        var hh = 34;
        var sx = x0 + w / 2 - 44;
        var sw = 88;
        var sy = top + 6;
        var swy = top + 56;
        var swh = 26;
        var st = step ? step.st : none();
        var up = step ? step.up : [];
        var mem = step ? step.mem : null;
        var copies = step ? step.copies : 0;
        rr(sx, sy, sw, 30, 6, P.orange + '18', P.orange + 'aa', 1.3);
        tx('송신자', sx + sw / 2, sy + 15, fs, P.orange + 'ff', 'center', true);
        rr(sx - 20, swy, sw + 40, swh, 6, P.purple + '18', P.purple + 'aa', 1.3);
        tx('스위치', sx + sw / 2, swy + swh / 2, fs, P.purple + 'ff', 'center', true);
        for (var c = 0; c < copies; c++) {
            var ox = copies === 1 ? 0 : (c - (copies - 1) / 2) * 12;
            drawArrow(sx + sw / 2 + ox, sy + 30, sx + sw / 2 + ox, swy, P.yellow + 'ff');
        }
        HOSTS.forEach(function (name, i) {
            var hx = x0 + i * (bw + gap);
            var s = st[i];
            var isMem = mem ? mem[i] === 1 : INTERESTED[i] === 1;
            var col = isMem ? P.green : P.sub;
            rr(hx, hy, bw, hh, 5, s === 1 ? P.green + '30' : 'none', s === 1 ? P.green + 'ff' : (s === 2 ? P.red + 'cc' : col + '88'), s ? 1.8 : 1.2);
            tx(name, hx + bw / 2, hy + 12, fs, (isMem ? P.green : P.text) + 'ee', 'center', true);
            tx(s === 1 ? '수신' : (s === 2 ? '폐기' : (isMem ? (mem ? '가입' : '원함') : (mem ? '미가입' : '관심 없음'))), hx + bw / 2, hy + 26, fs - 2, (s === 2 ? P.red : (isMem ? P.green : P.sub)) + 'ee', 'center', false);
            var tcx = hx + bw / 2;
            if (s) drawArrow(sx + sw / 2 + (tcx - (sx + sw / 2)) * 0.15, swy + swh, tcx, hy, (s === 2 ? P.red : P.green) + 'ee');
            if (up.indexOf(i) >= 0) drawArrow(tcx, hy, sx + sw / 2 + (tcx - (sx + sw / 2)) * 0.15, swy + swh, P.yellow + 'ff');
        });
        var py = hy + hh + 14;
        var lh = mob ? 15 : 17;
        var ph = lh * 3 + 14;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('전달 상황', x0 + 10, py + 11, fs - 2, P.sub + 'ee', 'left', true);
        if (step && step.lines.length) {
            step.lines.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 11 + lh * (i + 1), fs - 1.5, (i === 0 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 전송이 없습니다)', x0 + 10, py + 11 + lh, fs - 1.5, P.sub + 'ee', 'left', false);
        }
        var ty = py + ph + 10;
        var th = 24 + lh;
        rr(x0, ty, w, th, 6, 'none', P.muted + '55', 1.2);
        tx(step && step.lab ? step.lab : '확인할 값', x0 + 10, ty + 11, fs - 2, P.sub + 'ee', 'left', true);
        tx(step && step.val ? step.val : '(없음)', x0 + 10, ty + 11 + lh, fs - 1.5, (step && step.val ? P.green : P.sub) + 'ee', 'left', false);
    }

    /* ===================== 모드: 주소 ===================== */
    function drawAddr(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var rowH = 62;
        ADDR_ROWS.forEach(function (r, i) {
            if (k < i + 1 && !(i === 3 && k >= 5)) return;
            var y = top + i * rowH;
            var cur = k === i + 1;
            var c = P[r.col];
            tx(r.name, x0, y + 8, fs - 0.5, c + 'ff', 'left', true);
            rr(x0, y + 18, w, 24, 5, c + (cur ? '30' : '18'), c + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
            tx(r.val, x0 + w / 2, y + 30, fs - 1, P.text + 'ee', 'center', true);
            tx(r.note, x0, y + 52, fs - 2, P.sub + 'ee', 'left', false);
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

        if (mode === 'addr') drawAddr(padX, top, fullW, mob, step);
        else drawNet(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 전송 방식을 확인하세요.';
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
        if (mode === 'addr') neededH = mob ? 270 : 280;
        else neededH = mob ? 290 : 300;
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
        if (mode === 'addr') return '전송 방식별 목적지 주소와 멀티캐스트 MAC 주소 변환을 봅니다.';
        if (mode === 'igmp') return '멀티캐스트 그룹 가입과 스위치의 전달 범위를 봅니다.';
        return '유니캐스트, 브로드캐스트, 멀티캐스트가 누구에게 전달되는지 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('mc-viz__speed-btn--active'); });
        btn.classList.add('mc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('mc-viz__mode-btn--active', d.key === m); });
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