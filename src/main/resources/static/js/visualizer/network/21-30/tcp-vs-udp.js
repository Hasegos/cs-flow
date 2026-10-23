/**
 * TCP vs UDP와 흐름 제어 시각화
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
    var root    = el('div', 'tcpudp-viz');
    var toolbar = el('div', 'tcpudp-viz__toolbar');
    var tbLeft  = el('div', 'tcpudp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tcpudp-viz__title', 'TCP vs UDP'));

    var modeWrap = el('div', 'tcpudp-viz__mode');
    var modeDefs = [
        { key: 'tcp', label: 'TCP 연결·전송' },
        { key: 'udp', label: 'UDP 전송' },
        { key: 'flow', label: '흐름 제어' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tcpudp-viz__mode-btn' + (i === 0 ? ' tcpudp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tcpudp-viz__speed');
    speedWrap.appendChild(el('span', 'tcpudp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tcpudp-viz__speed-btn' + (i === 0 ? ' tcpudp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tcpudp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tcpudp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tcpudp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tcpudp-viz__controls');
    var btnPlay  = el('button', 'tcpudp-viz__btn tcpudp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tcpudp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tcpudp-viz__btn', '↺ RESET');
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
    var mode    = 'tcp';
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

    /* ===================== 데이터: 참여자와 단계 ===================== */
    var ACTORS = [
        { id: 'C', name: '클라이언트', sub: '송신 측', col: 'orange' },
        { id: 'N', name: '네트워크', sub: 'IP 경로', col: 'purple' },
        { id: 'S', name: '서버', sub: '수신 측', col: 'teal' }
    ];

    function T(s) { return [s, 'text']; }
    function Y(s) { return [s, 'yellow']; }
    function G(s) { return [s, 'green']; }
    function R(s) { return [s, 'red']; }
    function S(s) { return [s, 'sub']; }

    function st(log, o) {
        var s = { log: log, from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [] };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var TCP_STEPS = [
        st('TCP는 데이터를 보내기 전에 연결을 만들고, 보낸 바이트마다 번호를 매겨 받았는지 확인하며, 잃어버리면 다시 보냅니다. 연결 수립(3-way handshake), 데이터 전송과 재전송, 연결 종료를 차례로 봅니다. 숫자는 이해를 돕기 위한 예시입니다.',
            { msg: [Y('TCP 헤더는 최소 20바이트'), S('포트 · 순서 번호 · 확인 번호 · 플래그 · 윈도 …')], cli: [S('CLOSED')], srv: [S('LISTEN (접속 대기)')] }),
        st('클라이언트가 SYN 세그먼트로 연결을 요청합니다. 자기가 쓸 초기 순서 번호(ISN) 1000을 알립니다. SYN은 순서 번호를 하나 소비하므로, 다음 바이트 번호는 1001입니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'SYN', msg: [T('SYN'), Y('seq=1000')], hl: { C: ['연결 요청', 'orange'], S: ['SYN 수신', 'teal'] }, cli: [Y('SYN-SENT'), S('ISN 1000')], srv: [S('LISTEN')] }),
        st('서버가 자기 초기 순서 번호 5000을 알리면서, 받은 SYN을 확인하는 ack=1001을 함께 보냅니다. ack는 "다음에 받고 싶은 번호"입니다. SYN과 ACK를 한 세그먼트에 실었으므로 SYN-ACK라고 부릅니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'SYN, ACK', msg: [T('SYN, ACK'), Y('seq=5000'), Y('ack=1001')], hl: { S: ['SYN-ACK', 'teal'], C: ['수신', 'orange'] }, cli: [Y('SYN-SENT')], srv: [Y('SYN-RECEIVED'), S('ISN 5000')] }),
        st('클라이언트가 서버의 SYN을 확인하는 ack=5001을 보냅니다. 클라이언트는 이 시점에 ESTABLISHED가 됩니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'ACK', msg: [T('ACK'), Y('seq=1001'), Y('ack=5001')], hl: { C: ['ESTABLISHED', 'green'], S: ['ACK 수신', 'teal'] }, cli: [G('ESTABLISHED')], srv: [Y('SYN-RECEIVED')] }),
        st('서버도 ACK를 받으면 ESTABLISHED가 됩니다. 이 세 번의 교환이 3-way handshake입니다. 양쪽이 서로의 초기 순서 번호를 확인했으므로, 이제부터 바이트마다 번호를 매겨 주고받을 수 있습니다.',
            { label: '연결 수립 완료', msg: [G('양쪽 모두 ESTABLISHED')], hl: { C: ['연결됨', 'green'], S: ['연결됨', 'green'] }, cli: [G('ESTABLISHED')], srv: [G('ESTABLISHED')] }),
        st('클라이언트가 100바이트를 보냅니다. 순서 번호 1001은 이 세그먼트 첫 바이트의 번호이고, 데이터는 1001번부터 1100번까지입니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'DATA seq=1001', msg: [T('DATA'), Y('seq=1001 len=100'), S('바이트 1001 ~ 1100')], hl: { C: ['전송', 'orange'], S: ['수신', 'teal'] }, cli: [Y('보낸 뒤 확인 대기: 1001~1100')], srv: [G('ESTABLISHED')] }),
        st('서버가 1100번까지 받았으므로 다음에 받을 번호 1101을 ack로 알립니다. 이렇게 "여기까지 연속으로 받았다"를 알리는 방식을 누적 확인 응답이라 합니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK ack=1101', msg: [T('ACK'), Y('ack=1101')], hl: { S: ['1100까지 수신', 'green'], C: ['확인됨', 'green'] }, cli: [G('1001~1100 확인됨')], srv: [G('다음 기대 번호 1101')] }),
        st('클라이언트가 다음 100바이트(1101~1200번)를 보냈는데, 네트워크 도중에 유실됐다고 해 봅시다. 서버는 이 세그먼트가 있었다는 것조차 모릅니다.',
            { from: 'C', to: 'N', kind: 'err', label: '세그먼트 유실', msg: [T('DATA'), Y('seq=1101 len=100'), R('도중에 사라짐')], hl: { N: ['유실', 'red'], C: ['확인 대기', 'orange'] }, cli: [Y('보낸 뒤 확인 대기: 1101~1200')], srv: [Y('다음 기대 번호 1101 (변화 없음)')] }),
        st('송신 측은 보낸 세그먼트마다 재전송 타이머를 두고, 시간 안에 확인 응답이 없으면 같은 세그먼트를 다시 보냅니다. 이 예시는 타이머가 만료되는 경우입니다. 실제로는 중복 ACK를 세 번 받으면 타이머를 기다리지 않고 바로 재전송하는 빠른 재전송도 함께 씁니다.',
            { label: '재전송 타이머 만료', msg: [R('ack=1201 응답이 오지 않음')], hl: { C: ['타임아웃', 'red'] }, cli: [R('타이머 만료 → 1101부터 재전송')], srv: [Y('다음 기대 번호 1101')] }),
        st('클라이언트가 같은 세그먼트를 다시 보냅니다. 순서 번호가 같으므로 서버는 이것이 1101~1200번 데이터임을 알 수 있습니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'DATA 재전송', msg: [T('DATA (재전송)'), Y('seq=1101 len=100'), S('바이트 1101 ~ 1200')], hl: { C: ['재전송', 'orange'], S: ['수신', 'teal'] }, cli: [Y('재전송 후 확인 대기')], srv: [Y('다음 기대 번호 1101')] }),
        st('이번에는 도착했습니다. 서버는 1200번까지 연속으로 받았으므로 ack=1201을 보냅니다. 애플리케이션은 유실이 있었다는 것을 모른 채 순서대로 데이터를 받습니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK ack=1201', msg: [T('ACK'), Y('ack=1201')], hl: { S: ['1200까지 수신', 'green'], C: ['확인됨', 'green'] }, cli: [G('1001~1200 확인됨')], srv: [G('다음 기대 번호 1201')] }),
        st('보낼 데이터를 다 보낸 클라이언트가 연결 종료를 요청합니다. FIN도 순서 번호를 하나 소비하며, 이 FIN의 seq는 1201입니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'FIN, ACK', msg: [T('FIN, ACK'), Y('seq=1201'), Y('ack=5001')], hl: { C: ['종료 요청', 'orange'], S: ['FIN 수신', 'teal'] }, cli: [Y('FIN-WAIT-1')], srv: [G('ESTABLISHED')] }),
        st('서버가 FIN을 확인하는 ack=1202를 보냅니다. 서버는 CLOSE-WAIT가 되며, 아직 보낼 데이터가 있으면 계속 보낼 수 있습니다. TCP는 한쪽 방향만 먼저 닫을 수 있기 때문입니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK ack=1202', msg: [T('ACK'), Y('seq=5001'), Y('ack=1202')], hl: { S: ['CLOSE-WAIT', 'teal'], C: ['FIN-WAIT-2', 'orange'] }, cli: [Y('FIN-WAIT-2')], srv: [Y('CLOSE-WAIT')] }),
        st('서버도 보낼 데이터를 다 보내면 자기 쪽 FIN을 보냅니다. seq=5001은 서버가 연결 수립 때 소비한 5000 다음 번호입니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'FIN, ACK', msg: [T('FIN, ACK'), Y('seq=5001'), Y('ack=1202')], hl: { S: ['종료 요청', 'teal'], C: ['FIN 수신', 'orange'] }, cli: [Y('FIN-WAIT-2')], srv: [Y('LAST-ACK')] }),
        st('클라이언트가 마지막 ACK(ack=5002)를 보냅니다. 서버는 이것을 받으면 CLOSED가 됩니다. 클라이언트는 TIME-WAIT 상태로 한동안 기다린 뒤 닫힙니다. 마지막 ACK가 유실돼 서버가 FIN을 다시 보내도 응답할 수 있게 하려는 것입니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'ACK ack=5002', msg: [T('ACK'), Y('seq=1202'), Y('ack=5002')], hl: { C: ['TIME-WAIT', 'orange'], S: ['CLOSED', 'green'] }, cli: [Y('TIME-WAIT → CLOSED')], srv: [G('CLOSED')] })
    ];

    var UDP_STEPS = [
        st('UDP는 연결을 만들지 않고 데이터그램 한 덩어리씩 보냅니다. 연결 수립, 순서 번호, 확인 응답, 재전송이 없습니다. 헤더도 출발 포트, 도착 포트, 길이, 체크섬 네 필드 8바이트뿐입니다.',
            { msg: [Y('UDP 헤더는 8바이트'), S('출발 포트 · 도착 포트 · 길이 · 체크섬')], cli: [S('연결 상태 없음')], srv: [S('포트 9000에서 수신 대기')] }),
        st('핸드셰이크 없이 첫 패킷부터 바로 데이터를 보냅니다. 길이 필드는 헤더 8바이트와 데이터 5바이트를 합친 13입니다.',
            { from: 'C', to: 'S', kind: 'req', label: '데이터그램 #1', msg: [T('UDP 데이터그램'), Y('50000 → 9000'), Y('length=13 (헤더 8 + 데이터 5)'), Y('data "hello"')], hl: { C: ['전송', 'orange'], S: ['수신', 'teal'] }, cli: [S('확인 응답을 기다리지 않음')], srv: [S('대기')] }),
        st('서버 애플리케이션은 데이터그램 하나를 경계 그대로 한 덩어리로 받습니다. 보낸 쪽은 확인 응답을 기다리지 않고 바로 다음 데이터를 보낼 수 있습니다.',
            { label: '1개 수신', msg: [G('데이터그램 1개 = 수신 1회'), Y('data "hello" (5바이트)')], hl: { S: ['hello 수신', 'green'] }, cli: [S('확인 응답을 기다리지 않음')], srv: [G('받음: "hello"')] }),
        st('두 번째 데이터그램 "world"가 네트워크 도중에 유실됐다고 해 봅시다. UDP는 유실을 감지하거나 다시 보내지 않습니다.',
            { from: 'C', to: 'N', kind: 'err', label: '데이터그램 #2 유실', msg: [T('UDP 데이터그램'), Y('data "world"'), R('도중에 사라짐')], hl: { N: ['유실', 'red'], C: ['전송함', 'orange'] }, cli: [S('보냈다고 생각함')], srv: [G('받음: "hello"')] }),
        st('세 번째 데이터그램 "bye"는 도착합니다. 데이터그램은 서로 독립이라 앞의 유실이 뒤에 영향을 주지 않습니다.',
            { from: 'C', to: 'S', kind: 'req', label: '데이터그램 #3', msg: [T('UDP 데이터그램'), Y('data "bye"')], hl: { C: ['전송', 'orange'], S: ['수신', 'teal'] }, cli: [S('보냈다고 생각함')], srv: [G('받음: "hello"'), G('받음: "bye"')] }),
        st('UDP에는 순서 번호도 확인 응답도 없어서 서버도 클라이언트도 "world"가 사라진 것을 알 수 없습니다. 이것이 UDP가 제공하지 않는 신뢰성입니다. 필요하면 애플리케이션이 직접 번호와 재전송을 구현해야 합니다.',
            { label: '유실을 아무도 모름', msg: [R('"world"의 유실을 UDP는 알려 주지 않음')], hl: { C: ['모름', 'muted'], S: ['모름', 'muted'] }, cli: [S('응답이 없어도 알 방법이 없음')], srv: [G('받음: "hello"'), G('받음: "bye"'), S('"world"가 있었는지 모름')] }),
        st('애플리케이션이 자기 방식으로 "world"를 다시 보냈다고 해 봅시다. 이 데이터그램은 "bye" 뒤에 도착하므로 보낸 순서와 도착 순서가 달라집니다. 순서를 맞추는 일도 애플리케이션의 몫입니다.',
            { from: 'C', to: 'S', kind: 'req', label: '응용이 재전송', msg: [T('UDP 데이터그램'), Y('data "world"'), S('애플리케이션이 직접 다시 보냄')], hl: { C: ['재전송', 'orange'], S: ['수신', 'teal'] }, cli: [S('재전송은 애플리케이션 책임')], srv: [G('도착 순서: hello, bye, world'), S('순서 맞춤은 애플리케이션 책임')] })
    ];

    var FLOW_STEPS = [
        st('흐름 제어(flow control)는 수신 측이 처리할 수 있는 속도보다 송신 측이 빨리 보내지 않게 하는 장치입니다. 수신 측이 ACK마다 수신 윈도(받을 수 있는 크기)를 알리고, 송신 측은 확인받지 못한 데이터를 그 크기 이하로만 둡니다. 연결은 이미 수립된 상태이고 숫자는 예시입니다.',
            { msg: [Y('보낼 수 있는 양 ≤ 수신 윈도')], cli: [S('수신 윈도를 아직 모름')], srv: [Y('수신 버퍼 300바이트, 비어 있음')] }),
        st('서버가 ACK에 윈도 값을 실어 보냅니다. window=300은 "지금부터 300바이트까지 받을 수 있다"는 뜻입니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK window=300', msg: [T('ACK'), Y('ack=1001'), Y('window=300')], hl: { S: ['윈도 알림', 'teal'], C: ['한도 300', 'orange'] }, cli: [Y('보낼 수 있는 한도 300바이트')], srv: [Y('수신 버퍼 0 / 300')] }),
        st('클라이언트가 윈도 한도 안에서 100바이트씩 세 세그먼트를 연달아 보냅니다. 확인 응답을 기다리지 않고 한도까지 보낼 수 있습니다. 한도 300을 다 채웠으니 더는 보낼 수 없습니다.',
            { from: 'C', to: 'S', kind: 'req', label: '300바이트 전송', msg: [T('DATA'), Y('seq=1001 len=100'), Y('seq=1101 len=100'), Y('seq=1201 len=100')], hl: { C: ['한도까지 전송', 'orange'], S: ['수신', 'teal'] }, cli: [Y('확인 대기 300바이트 (한도 300)')], srv: [Y('수신 버퍼 300 / 300')] }),
        st('서버 애플리케이션이 데이터를 천천히 읽어서 수신 버퍼가 가득 찼습니다. 서버는 1300번까지 받았음을 ack=1301로 알리면서 윈도를 0으로 줄입니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK window=0', msg: [T('ACK'), Y('ack=1301'), R('window=0')], hl: { S: ['버퍼 가득', 'red'], C: ['확인됨', 'green'] }, cli: [G('1001~1300 확인됨')], srv: [R('버퍼 가득: 응용이 아직 읽지 못함')] }),
        st('윈도가 0이면 송신 측은 새 데이터를 보내지 않고 기다립니다. 받는 쪽 버퍼가 넘쳐 데이터가 버려지는 것을 막는 것이 흐름 제어입니다.',
            { label: '전송 중지', msg: [R('window=0 → 새 데이터를 보내지 않음')], hl: { C: ['대기', 'red'] }, cli: [R('window=0: 전송 중지')], srv: [R('버퍼 가득')] }),
        st('윈도 갱신 ACK가 유실되면 양쪽이 서로 기다리기만 할 수 있습니다. 그래서 송신 측은 윈도가 0이어도 주기적으로 작은 세그먼트(윈도 프로브)를 보내 현재 윈도를 다시 묻습니다.',
            { from: 'C', to: 'S', kind: 'req', label: '윈도 프로브', msg: [T('윈도 프로브'), Y('seq=1301 len=1')], hl: { C: ['프로브', 'orange'], S: ['수신', 'teal'] }, cli: [Y('주기적으로 윈도를 확인')], srv: [R('버퍼 가득')] }),
        st('서버 버퍼는 아직 가득 차 있으므로 프로브의 데이터를 받지 않고, 현재 윈도 0을 담은 ACK로 답합니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK window=0', msg: [T('ACK'), Y('ack=1301'), R('window=0')], hl: { S: ['아직 가득', 'red'], C: ['계속 대기', 'red'] }, cli: [R('window=0: 계속 대기')], srv: [R('버퍼 가득')] }),
        st('서버 애플리케이션이 200바이트를 읽어 가서 수신 버퍼에 빈 공간이 생겼습니다.',
            { label: '응용이 데이터를 읽음', msg: [G('응용이 200바이트 읽음')], hl: { S: ['200바이트 읽음', 'green'] }, cli: [R('window=0: 대기 중')], srv: [G('수신 버퍼 100 / 300'), G('빈 공간 200')] }),
        st('서버가 윈도 갱신을 알리는 ACK를 보냅니다. window=200이므로 송신 측이 다시 보낼 수 있게 됩니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'ACK window=200', msg: [T('ACK'), Y('ack=1301'), G('window=200')], hl: { S: ['윈도 갱신', 'green'], C: ['한도 200', 'green'] }, cli: [G('보낼 수 있는 한도 200바이트')], srv: [G('빈 공간 200')] }),
        st('클라이언트가 윈도 한도 200바이트만큼 전송을 재개합니다. 수신 측이 감당할 수 있는 속도에 송신 속도가 맞춰집니다.',
            { from: 'C', to: 'S', kind: 'req', label: '전송 재개', msg: [T('DATA'), Y('seq=1301 len=200')], hl: { C: ['재개', 'green'], S: ['수신', 'teal'] }, cli: [G('한도 200 안에서 전송')], srv: [G('빈 공간 200')] }),
        st('실제로 보낼 수 있는 양은 수신 윈도와 혼잡 윈도 중 작은 값으로 제한됩니다. 흐름 제어는 수신 측을 지키고, 혼잡 제어는 네트워크를 지킵니다. 두 장치는 서로 다른 문제를 다룹니다.',
            { label: '흐름 제어 ≠ 혼잡 제어', msg: [Y('보낼 수 있는 양 ≤ min(수신 윈도, 혼잡 윈도)')], hl: { C: ['두 한도의 최솟값', 'orange'] }, cli: [S('수신 윈도: 수신 측이 알려 줌'), S('혼잡 윈도: 송신 측이 추정')], srv: [S('수신 윈도 = 수신 측 보호')] })
    ];

    /* ===================== 장면 데이터: 래더 다이어그램 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
        var row = -1;
        steps.forEach(function (s) {
            if (s.m || s.ev) row++;
            s.row = (s.m || s.ev) ? row : -1;
        });
    }
    function M(d, l, k, lost) { return { d: d, l: l, k: k, lost: !!lost }; }
    function EV(t, side, col) { return { t: t, side: side, col: col || 'yellow' }; }

    ann(TCP_STEPS, [
        { cs: 'CLOSED', ss: 'LISTEN', foot: '' },
        { m: M('cs', 'SYN  seq=1000', 'ctrl'), cs: 'SYN-SENT' },
        { m: M('sc', 'SYN+ACK  seq=5000 ack=1001', 'ctrl'), ss: 'SYN-RECEIVED' },
        { m: M('cs', 'ACK  ack=5001', 'ack'), cs: 'ESTABLISHED' },
        { ev: EV('연결 수립 완료 (3-way handshake)', 'm', 'green'), ss: 'ESTABLISHED' },
        { m: M('cs', 'DATA  1001~1100', 'data'), foot: '확인 대기: 1001~1100' },
        { m: M('sc', 'ACK  ack=1101', 'ack'), foot: '확인됨 1100까지 · 서버가 기다리는 다음 번호 1101' },
        { m: M('cs', 'DATA  1101~1200', 'lost', true), foot: '확인 대기: 1101~1200 (서버는 존재를 모름)' },
        { ev: EV('재전송 타이머 만료', 'c', 'red'), foot: '응답이 없어 같은 번호로 다시 보낸다' },
        { m: M('cs', 'DATA  1101~1200 (재전송)', 'retx'), foot: '확인 대기: 1101~1200' },
        { m: M('sc', 'ACK  ack=1201', 'ack'), foot: '확인됨 1200까지 · 앱은 유실을 모른 채 순서대로 받는다' },
        { m: M('cs', 'FIN+ACK  seq=1201', 'ctrl'), cs: 'FIN-WAIT-1', foot: '' },
        { m: M('sc', 'ACK  ack=1202', 'ack'), cs: 'FIN-WAIT-2', ss: 'CLOSE-WAIT' },
        { m: M('sc', 'FIN+ACK  seq=5001', 'ctrl'), ss: 'LAST-ACK' },
        { m: M('cs', 'ACK  ack=5002', 'ack'), cs: 'TIME-WAIT', ss: 'CLOSED' }
    ]);

    ann(UDP_STEPS, [
        { cs: '연결 상태 없음', ss: '포트 9000 대기', got: [], foot: '' },
        { m: M('cs', 'UDP #1  "hello"', 'data'), got: ['hello'] },
        { ev: EV('데이터그램 1개 = 수신 1회', 's', 'green') },
        { m: M('cs', 'UDP #2  "world"', 'lost', true) },
        { m: M('cs', 'UDP #3  "bye"', 'data'), got: ['hello', 'bye'] },
        { ev: EV('"world"가 사라진 것을 아무도 모른다', 'm', 'red') },
        { m: M('cs', 'UDP #2 "world" (앱이 재전송)', 'retx'), got: ['hello', 'bye', 'world'] }
    ]);

    ann(FLOW_STEPS, [
        { cs: 'ESTABLISHED', ss: 'ESTABLISHED', buf: 0, win: -1 },
        { m: M('sc', 'ACK  ack=1001  win=300', 'ack'), win: 300 },
        { m: M('cs', 'DATA 1001~1300 (100B x 3)', 'data'), buf: 3 },
        { m: M('sc', 'ACK  ack=1301  win=0', 'lost'), win: 0 },
        { ev: EV('window=0 → 전송 중지', 'c', 'red') },
        { m: M('cs', '윈도 프로브  1바이트', 'ctrl') },
        { m: M('sc', 'ACK  ack=1301  win=0', 'lost') },
        { ev: EV('앱이 200바이트를 읽음', 's', 'green'), buf: 1, win: 200 },
        { m: M('sc', 'ACK  ack=1301  win=200', 'ack'), win: 200 },
        { m: M('cs', 'DATA  1301~1500', 'data'), buf: 3 },
        { ev: EV('송신량 ≤ min(수신 윈도, 혼잡 윈도)', 'm', 'yellow') }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'udp') return UDP_STEPS;
        if (mode === 'flow') return FLOW_STEPS;
        return TCP_STEPS;
    }
    function defaultLog() {
        if (mode === 'udp') return '연결 없이 데이터그램을 보내며 유실을 아무도 책임지지 않는 UDP를 봅니다.';
        if (mode === 'flow') return '수신 측이 윈도 크기로 송신 속도를 조절하는 TCP 흐름 제어를 봅니다.';
        return '연결을 만들고, 번호를 매겨 보내고, 유실을 재전송하고, 연결을 닫는 TCP의 한 생애를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function rowH(mob) { return mob ? 40 : 44; }
    function headH() { return 78; }
    function footH() { return mode === 'flow' ? 74 : 50; }
    function maxRows() {
        var n = 0;
        currentSteps().forEach(function (s) { if (s.row + 1 > n) n = s.row + 1; });
        return n;
    }
    function sceneH(w, mob) { return headH() + maxRows() * rowH(mob) + footH(); }

    function pick(steps, idx, key, def) {
        for (var i = idx; i >= 0; i--) { if (steps[i][key] !== undefined) return steps[i][key]; }
        return def;
    }
    function stateColor(s) {
        if (s === 'ESTABLISHED') return 'green';
        if (s === 'CLOSED' || s === 'LISTEN' || s.indexOf('없음') >= 0 || s.indexOf('대기') >= 0) return 'muted';
        return 'yellow';
    }
    function kindColor(k) {
        if (k === 'ctrl') return 'purple';
        if (k === 'data') return 'orange';
        if (k === 'ack') return 'teal';
        if (k === 'retx') return 'yellow';
        return 'red';
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var steps = currentSteps();
        var cur = stepIdx;
        var xL = x0 + (mob ? 46 : 80);
        var xR = x0 + w - (mob ? 46 : 80);
        var RH = rowH(mob);
        var yLine0 = top + 54;
        var yEnd = top + headH() + maxRows() * RH;

        [['클라이언트', xL, 'orange', 'cs'], ['서버', xR, 'teal', 'ss']].forEach(function (h) {
            var bw = mob ? 82 : 110;
            rr(h[1] - bw / 2, top, bw, 30, 6, colorOf(h[2]) + '22', colorOf(h[2]) + 'ff', 1.6);
            tx(h[0], h[1], top + 15, fs, colorOf(h[2]) + 'ff', 'center', true);
            var stt = cur >= 0 ? pick(steps, cur, h[3], '') : pick(steps, 0, h[3], '');
            if (stt) {
                var sc = colorOf(stateColor(stt));
                ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
                var sw = Math.max(bw, ctx.measureText(stt).width + 20);
                rr(h[1] - sw / 2, top + 36, sw, 20, 10, sc + '22', sc + 'cc', 1.2);
                tx(stt, h[1], top + 46, fs - 1, sc + 'ff', 'center', true);
            }
            ln(h[1], yLine0 + 8, h[1], yEnd, P.muted + '66', 1.6, [5, 4]);
        });

        for (var i = 0; i <= cur; i++) {
            var s = steps[i];
            if (s.row < 0) continue;
            var ry = top + headH() + s.row * RH;
            var isCur = i === cur;
            var p = isCur ? t : 1;
            if (s.m) {
                var c = colorOf(kindColor(s.m.k));
                var ya = ry + 28;
                var xa = s.m.d === 'cs' ? xL : xR;
                var xb = s.m.d === 'cs' ? xR : xL;
                var q = seg(p, 0, 0.8);
                var reach = s.m.lost ? 0.55 : 1;
                var xe = lerp(xa, xb, q * reach);
                var dim = isCur ? 'ff' : (s.m.lost ? 'cc' : 'bb');
                arrow(xa, ya - 4, xe, ya + 4, c + dim, 2.2, s.m.k === 'retx' ? [6, 3] : undefined);
                tx(s.m.l, (xL + xR) / 2, ry + 13, fs - 0.5, c + 'ff', 'center', true);
                if (s.m.lost && q > 0.95) {
                    var xm = lerp(xa, xb, 0.55);
                    tx('✕', xm + (xb > xa ? 12 : -12), ya + 1, fs + 4, P.red + 'ff', 'center', true);
                }
            } else if (s.ev) {
                var ec = colorOf(s.ev.col);
                var label = s.ev.t;
                ctx.font = '700 ' + (fs - 0.5) + 'px "JetBrains Mono",monospace';
                var tw = ctx.measureText(label).width + 22;
                var maxw = w - 8;
                if (tw > maxw) tw = maxw;
                var ex = s.ev.side === 'c' ? xL + tw / 2 + 8 : (s.ev.side === 's' ? xR - tw / 2 - 8 : (xL + xR) / 2);
                if (ex - tw / 2 < x0) ex = x0 + tw / 2;
                if (ex + tw / 2 > x0 + w) ex = x0 + w - tw / 2;
                var alpha = isCur ? Math.round(clamp01(p * 2) * 255) : 255;
                var ah = ('0' + alpha.toString(16)).slice(-2);
                rr(ex - tw / 2, ry + 12, tw, 24, 12, ec + '22', ec + ah, 1.4);
                tx(label, ex, ry + 24, fs - 0.5, ec + ah, 'center', true);
            }
        }

        var fy = yEnd + 12;
        {
            var idx = cur >= 0 ? cur : 0;
            if (mode === 'flow') {
                var used = pick(steps, idx, 'buf', 0);
                var win = pick(steps, idx, 'win', -1);
                tx('서버 수신 버퍼 (300바이트)', x0, fy + 8, fs - 0.5, P.sub + 'ff', 'left', true);
                var bx = x0, bwid = Math.min(w, 300), bh = 22, by = fy + 24;
                for (var b = 0; b < 3; b++) {
                    var segw = (bwid - 8) / 3;
                    var full = b < used;
                    rr(bx + b * (segw + 4), by, segw, bh, 4, full ? P.orange + '55' : 'none', full ? P.orange + 'ff' : P.muted + '99', 1.4);
                    tx(full ? '100B' : '비어 있음', bx + b * (segw + 4) + segw / 2, by + bh / 2, fs - 1.5, (full ? P.orange : P.sub) + 'ff', 'center', false);
                }
                var wtxt = win < 0 ? '수신 윈도: 아직 모름' : '수신 윈도 = ' + win + '바이트';
                tx(wtxt, x0, by + bh + 12, fs, (win === 0 ? P.red : (win > 0 ? P.green : P.sub)) + 'ff', 'left', true);
            } else if (mode === 'udp') {
                var got = pick(steps, idx, 'got', []);
                tx('서버가 받은 순서', x0, fy + 8, fs - 0.5, P.sub + 'ff', 'left', true);
                var gx = x0;
                if (!got.length) tx('(아직 없음)', gx, fy + 30, fs, P.sub + 'ff', 'left', false);
                got.forEach(function (g) {
                    var gw = g.length * (fs * 0.66) + 22;
                    rr(gx, fy + 18, gw, 24, 12, P.green + '22', P.green + 'cc', 1.2);
                    tx(g, gx + gw / 2, fy + 30, fs, P.green + 'ff', 'center', true);
                    gx += gw + 8;
                });
            } else {
                var ft = pick(steps, idx, 'foot', '');
                if (ft) {
                    var fl = lines(ft, w, fs - 0.5);
                    fl.forEach(function (l2, k) { tx(l2, x0, fy + 12 + k * (fs + 4), fs - 0.5, P.sub + 'ff', 'left', true); });
                }
            }
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
        speedBtns.forEach(function (b) { b.classList.remove('tcpudp-viz__speed-btn--active'); });
        btn.classList.add('tcpudp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tcpudp-viz__mode-btn--active', d.key === m); });
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