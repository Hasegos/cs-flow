/**
 * ROS2 노드와 토픽 시각화
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
    var root    = el('div', 'rostopic-viz');
    var toolbar = el('div', 'rostopic-viz__toolbar');
    var tbLeft  = el('div', 'rostopic-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'rostopic-viz__title', 'ROS2 토픽'));

    var modeWrap = el('div', 'rostopic-viz__mode');
    var modeDefs = [
        { key: 'pubsub', label: '발행 · 구독' },
        { key: 'many', label: '여러 노드 연결' },
        { key: 'queue', label: '느린 구독자' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'rostopic-viz__mode-btn' + (i === 0 ? ' rostopic-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'rostopic-viz__speed');
    speedWrap.appendChild(el('span', 'rostopic-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'rostopic-viz__speed-btn' + (i === 0 ? ' rostopic-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'rostopic-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'rostopic-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'rostopic-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'rostopic-viz__controls');
    var btnPlay  = el('button', 'rostopic-viz__btn rostopic-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'rostopic-viz__btn', '▶| STEP');
    var btnReset = el('button', 'rostopic-viz__btn', '↺ RESET');
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
    var mode    = 'pubsub';
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
        { id: 'P', name: '발행 노드', sub: 'lidar_node', col: 'orange' },
        { id: 'T', name: '토픽', sub: '/scan', col: 'purple' },
        { id: 'S', name: '구독 노드', sub: 'slam_node', col: 'teal' }
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

    var PUBSUB_STEPS = [
        st('ROS 2에서는 로봇 소프트웨어를 노드(node)라는 작은 프로그램으로 나눕니다. 노드끼리 데이터를 주고받는 가장 기본적인 방법이 토픽(topic)입니다. 한 노드가 이름 붙은 토픽에 메시지를 발행(publish)하면, 그 토픽을 구독(subscribe)하는 노드가 받습니다. 라이다 노드가 /scan으로 거리 데이터를 내보내고 SLAM 노드가 받는 예를 봅니다.',
            { msg: [Y('토픽 = 이름 + 메시지 타입'), S('예: /scan, sensor_msgs/msg/LaserScan')], cli: [S('lidar_node')], srv: [S('slam_node')] }),
        st('lidar_node가 시작되면서 /scan 토픽에 LaserScan 타입으로 발행자(publisher)를 만듭니다. 마지막 인자 10은 보낼 메시지를 쌓아 둘 큐의 크기(history depth)입니다.',
            { label: '발행자 생성', msg: [T('create_publisher('), T('  LaserScan, "/scan", 10)')], hl: { P: ['발행자 생성', 'orange'] }, cli: [Y('/scan 에 발행자 등록')], srv: [S('아직 시작 전')] }),
        st('slam_node가 같은 이름과 같은 타입으로 구독자(subscription)를 만듭니다. 메시지가 도착할 때마다 호출될 콜백 함수를 함께 등록합니다.',
            { label: '구독자 생성', msg: [T('create_subscription('), T('  LaserScan, "/scan", callback, 10)')], hl: { S: ['구독자 생성', 'teal'] }, cli: [Y('/scan 에 발행자 등록')], srv: [Y('/scan 구독 등록, 콜백 대기')] }),
        st('ROS 2의 통신 계층인 DDS가 디스커버리로 같은 토픽 이름과 같은 타입을 가진 발행자와 구독자를 서로 찾아 연결합니다. 기본 디스커버리에는 ROS 1의 ROS master 같은 중앙 마스터가 필요 없습니다. 두 쪽의 QoS 설정도 서로 호환돼야 합니다.',
            { from: 'P', to: 'S', kind: 'req', label: 'DDS 디스커버리', msg: [Y('이름 /scan 일치'), Y('타입 LaserScan 일치'), Y('QoS 호환')], hl: { P: ['발견', 'orange'], S: ['발견', 'teal'] }, cli: [G('구독자 1개와 연결됨')], srv: [G('발행자 1개와 연결됨')] }),
        st('lidar_node가 측정값을 만들 때마다 publish를 호출합니다. 발행자는 누가 받는지 지정하지 않고 토픽에 내보낼 뿐입니다.',
            { from: 'P', to: 'T', kind: 'req', label: 'publish() 1번째', msg: [T('publish(scan #1)'), S('ranges = [1.0, 1.1, …]')], hl: { P: ['발행', 'orange'], T: ['/scan', 'purple'] }, cli: [Y('scan #1 발행')], srv: [S('대기')] }),
        st('메시지가 구독자에게 전달되고 slam_node의 콜백이 호출됩니다. 콜백 안에서 받은 데이터를 처리합니다.',
            { from: 'T', to: 'S', kind: 'res', label: '콜백 호출', msg: [G('callback(scan #1)')], hl: { T: ['전달', 'purple'], S: ['수신', 'green'] }, cli: [Y('scan #1 발행')], srv: [G('콜백 호출: scan #1')] }),
        st('발행은 계속됩니다. 발행자는 응답을 기다리지 않고, 구독자가 몇 개인지 몰라도 됩니다. 토픽은 한 방향으로 흐르는 데이터 흐름이어서 요청에 대한 응답이라는 개념이 없습니다.',
            { from: 'P', to: 'S', kind: 'req', label: 'publish() 2번째', msg: [T('publish(scan #2)')], hl: { P: ['발행', 'orange'], S: ['수신', 'green'] }, cli: [Y('응답을 기다리지 않음')], srv: [G('콜백 호출: scan #2')] }),
        st('토픽은 센서 값처럼 계속 흘러가는 데이터에 맞습니다. 요청을 보내고 결과를 받아야 하는 호출은 토픽이 아니라 서비스나 액션으로 합니다.',
            { label: '연속 데이터 흐름', msg: [Y('토픽: 연속적인 데이터 스트림'), S('요청 · 응답은 서비스, 액션')], hl: { T: ['단방향 스트림', 'purple'] }, cli: [S('발행자: 응답을 모름')], srv: [S('구독자: 오는 대로 처리')] })
    ];

    var MANY_STEPS = [
        st('토픽은 일대일이 아닙니다. 한 토픽에 발행자도 구독자도 여러 개 붙을 수 있고, 서로를 직접 알 필요가 없습니다. 노드를 추가하거나 빼도 다른 노드의 코드는 그대로입니다.',
            { msg: [Y('발행자 N개 ↔ 구독자 M개'), S('서로를 직접 알 필요 없음')], cli: [S('lidar_node')], srv: [S('slam_node')] }),
        st('장애물 회피용 obstacle_node가 추가로 /scan을 구독합니다. 발행 쪽 코드는 한 줄도 바꾸지 않았습니다.',
            { label: '구독자 추가', msg: [T('create_subscription('), T('  LaserScan, "/scan", ...)'), Y('두 번째 구독 노드: obstacle_node')], hl: { S: ['구독자 2개', 'teal'] }, cli: [S('발행 코드는 그대로')], srv: [Y('slam_node, obstacle_node')] }),
        st('lidar_node가 한 번 발행하면 같은 메시지가 구독자 모두에게 전달됩니다. 두 노드의 콜백이 각각 호출됩니다.',
            { from: 'P', to: 'S', kind: 'req', label: 'publish() → 구독자 2개', msg: [T('publish(scan #1)')], hl: { P: ['발행', 'orange'], S: ['2개가 수신', 'green'] }, cli: [Y('발행은 한 번')], srv: [G('slam_node: scan #1'), G('obstacle_node: scan #1')] }),
        st('두 번째 라이다 lidar_2_node도 /scan에 발행하기 시작합니다. 구독 노드는 두 발행자의 메시지를 모두 받습니다. 어느 라이다의 값인지 구분하려면 메시지 헤더의 frame_id 같은 값을 씁니다.',
            { from: 'P', to: 'S', kind: 'req', label: '발행자 2개', msg: [Y('발행자: lidar_node, lidar_2_node'), S('구분은 header.frame_id 등으로')], hl: { P: ['발행자 2개', 'orange'], S: ['모두 수신', 'green'] }, cli: [Y('발행자 2개')], srv: [G('두 발행자의 메시지를 모두 받음')] }),
        st('obstacle_node가 종료돼도 다른 노드는 영향을 받지 않습니다. 발행자와 구독자가 서로의 존재에 의존하지 않기 때문에 노드 하나가 빠져도 나머지는 계속 동작합니다.',
            { label: '구독자 종료', msg: [R('obstacle_node 종료'), G('slam_node는 계속 수신')], hl: { S: ['한 노드만 종료', 'yellow'] }, cli: [G('발행은 그대로 계속')], srv: [R('obstacle_node 종료'), G('slam_node 계속 수신')] }),
        st('주의할 점이 있습니다. 토픽 이름이 같아도 메시지 타입이 다르면 연결되지 않습니다. 어떤 노드가 /scan을 String 타입으로 구독하면 LaserScan 발행자와 연결되지 않아 데이터가 오지 않습니다. 연결이 안 될 때는 양쪽의 타입을 확인합니다.',
            { from: 'P', to: 'S', kind: 'err', label: '타입 불일치', msg: [R('구독 타입 String ≠ 발행 타입 LaserScan'), R('연결되지 않음')], hl: { P: ['LaserScan', 'orange'], S: ['String', 'red'] }, cli: [Y('ros2 topic info /scan --verbose 로 타입 확인')], srv: [R('콜백이 호출되지 않음')] })
    ];

    var QUEUE_STEPS = [
        st('구독자의 처리 속도가 발행 속도보다 느리면 메시지가 쌓입니다. 이때 쌓아 두는 곳이 큐이고, 크기가 create_subscription의 마지막 인자(history depth)입니다. 큐 크기를 3으로 한 예로, 큐가 가득 차면 어떻게 되는지 봅니다.',
            { msg: [Y('큐 크기(depth) = 3'), S('KEEP_LAST: 최근 3개만 보관')], cli: [S('빠르게 발행')], srv: [S('느리게 처리')] }),
        st('lidar_node가 빠르게 발행해 메시지 1, 2, 3이 도착했습니다. slam_node의 콜백이 아직 바빠서 큐에 쌓입니다.',
            { from: 'P', to: 'S', kind: 'req', label: '메시지 1, 2, 3', msg: [T('publish(1), publish(2), publish(3)')], hl: { P: ['빠르게 발행', 'orange'], S: ['큐에 적재', 'teal'] }, cli: [Y('1, 2, 3 발행')], srv: [Y('큐 [1, 2, 3]  (가득 참)')] }),
        st('메시지 4가 도착합니다. 큐가 가득 차 있으므로 가장 오래된 메시지 1을 버리고 4를 넣습니다. 기본 설정에서는 발행자가 막히지 않고 구독자 쪽에서 오래된 것이 밀려납니다.',
            { from: 'P', to: 'S', kind: 'err', label: '메시지 4: 1이 버려짐', msg: [T('publish(4)'), R('큐가 가득 → 메시지 1 폐기')], hl: { P: ['발행', 'orange'], S: ['1 폐기', 'red'] }, cli: [Y('4 발행 (막히지 않음)')], srv: [R('큐 [2, 3, 4]'), R('메시지 1은 영영 받지 못함')] }),
        st('메시지 5도 같은 방식입니다. 가장 오래된 2가 버려지고 큐는 [3, 4, 5]가 됩니다. 늘 최신 데이터 3개만 남는 셈입니다.',
            { from: 'P', to: 'S', kind: 'err', label: '메시지 5: 2가 버려짐', msg: [T('publish(5)'), R('큐가 가득 → 메시지 2 폐기')], hl: { P: ['발행', 'orange'], S: ['2 폐기', 'red'] }, cli: [Y('5 발행')], srv: [R('큐 [3, 4, 5]'), R('메시지 1, 2는 영영 받지 못함')] }),
        st('콜백이 끝나 다음 메시지를 꺼냅니다. 큐에서 가장 오래된 3이 나옵니다. 1과 2는 처리되지 않았습니다.',
            { from: 'T', to: 'S', kind: 'res', label: '콜백이 3을 처리', msg: [G('callback(3)'), S('남은 큐 [4, 5]')], hl: { S: ['3 처리', 'green'] }, cli: [S('발행은 계속')], srv: [G('callback(3) 실행'), Y('큐 [4, 5]')] }),
        st('센서 데이터처럼 최신 값이 중요하면 이 동작이 알맞습니다. 하나도 놓치면 안 되는 데이터라면 큐 크기를 늘리거나 QoS를 조정하고, 무엇보다 콜백의 처리 시간을 줄여야 합니다.',
            { label: '큐와 손실', msg: [Y('구독이 느림 → 오래된 메시지부터 폐기'), S('발행자는 영향받지 않음')], hl: { S: ['큐 크기가 손실을 좌우', 'yellow'] }, cli: [G('발행자는 막히지 않음')], srv: [Y('depth ↑ 또는 콜백 ↓')] })
    ];

    /* ===================== 장면 데이터: 노드 그래프 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
    }
    function MV(a, b, ph, lb, col) { return { a: a, b: b, ph: ph, lb: lb, col: col || 'yellow' }; }

    ann(PUBSUB_STEPS, [
        { show: { p1: 1, s1: 1 }, link: {}, dim: { p1: 1, s1: 1 }, cap: '토픽 = 이름 + 메시지 타입' },
        { show: { p1: 1 }, link: {}, hot: 'p1', cap: 'create_publisher(LaserScan, "/scan", 10)' },
        { show: { p1: 1, s1: 1 }, link: {}, hot: 's1', cap: 'create_subscription(LaserScan, "/scan", callback, 10)' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, disc: true, cap: 'DDS 디스커버리: 이름 · 타입 · QoS가 맞으면 연결' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, mv: [MV('p1', 'T', 1, '#1')], cap: 'publish(scan #1)' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, mv: [MV('T', 's1', 1, '#1', 'green')], cb: { s1: 'callback(scan #1)' }, cap: '콜백 호출' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, mv: [MV('p1', 'T', 1, '#2'), MV('T', 's1', 2, '#2', 'green')], cb: { s1: 'callback(scan #2)' }, cap: '응답을 기다리지 않음' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, cap: '단방향 스트림: 요청 · 응답이 없다' }
    ]);
    ann(MANY_STEPS, [
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, cap: '발행자 N개 ↔ 구독자 M개' },
        { show: { p1: 1, s1: 1, s2: 1 }, link: { p1: 1, s1: 1, s2: 1 }, hot: 's2', cap: '구독자 추가 — 발행 코드는 그대로' },
        { show: { p1: 1, s1: 1, s2: 1 }, link: { p1: 1, s1: 1, s2: 1 }, mv: [MV('p1', 'T', 1, '#1'), MV('T', 's1', 2, '#1', 'green'), MV('T', 's2', 2, '#1', 'green')], cb: { s1: 'callback #1', s2: 'callback #1' }, cap: '발행 1번 → 구독자 2개가 수신' },
        { show: { p1: 1, p2: 1, s1: 1, s2: 1 }, link: { p1: 1, p2: 1, s1: 1, s2: 1 }, hot: 'p2', mv: [MV('p1', 'T', 1, 'A'), MV('p2', 'T', 1, 'B'), MV('T', 's1', 2, 'A', 'green'), MV('T', 's1', 2, 'B', 'green')], cap: '두 발행자의 메시지를 모두 받음 (header.frame_id로 구분)' },
        { show: { p1: 1, s1: 1, s2: 1 }, link: { p1: 1, s1: 1 }, gone: { s2: 1 }, cap: 'obstacle_node 종료 — 나머지는 계속 동작' },
        { show: { p1: 1, s1: 1, s2: 1 }, link: { p1: 1, s1: 1 }, bad: { s2: 1 }, types: { s2: 'String' }, cap: '이름은 같아도 타입이 다르면 연결되지 않음' }
    ]);
    ann(QUEUE_STEPS, [
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [], qd: 3, cap: '큐 크기(depth) = 3, KEEP_LAST' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [1, 2, 3], qd: 3, mv: [MV('p1', 'T', 1, '1·2·3'), MV('T', 's1', 2, '1·2·3', 'yellow')], cap: '구독 콜백이 바쁜 동안 큐에 쌓임' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [2, 3, 4], qd: 3, drop: 1, mv: [MV('p1', 'T', 1, '4'), MV('T', 's1', 2, '4', 'red')], cap: '큐가 가득 → 가장 오래된 1 폐기' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [3, 4, 5], qd: 3, drop: 2, mv: [MV('p1', 'T', 1, '5'), MV('T', 's1', 2, '5', 'red')], cap: '5 도착 → 2 폐기, 늘 최신 3개만 남음' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [4, 5], qd: 3, cb: { s1: 'callback(3)' }, cap: '콜백이 큐에서 가장 오래된 3을 꺼내 처리' },
        { show: { p1: 1, s1: 1 }, link: { p1: 1, s1: 1 }, q: [4, 5], qd: 3, cap: '발행자는 막히지 않음 · 손실은 큐 크기와 콜백 속도가 좌우' }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'many') return MANY_STEPS;
        if (mode === 'queue') return QUEUE_STEPS;
        return PUBSUB_STEPS;
    }
    function defaultLog() {
        if (mode === 'many') return '발행자와 구독자가 여러 개 붙는 토픽과 타입이 맞지 않을 때의 연결을 봅니다.';
        if (mode === 'queue') return '구독자가 느릴 때 큐가 가득 차면 오래된 메시지가 폐기되는 과정을 봅니다.';
        return '노드가 토픽에 발행하고 구독 노드가 콜백으로 받는 기본 흐름을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var nodeW = Math.min(124, Math.floor((w - 64 - 44) / 2));
        var topicW = mob ? 64 : 84;
        return { fs: fs, nodeW: nodeW, topicW: topicW, graphH: 190, capH: 62, qH: mode === 'queue' ? 78 : 0,
                 total: 190 + 62 + (mode === 'queue' ? 78 : 0) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ell(cx, cy, rx, ry, fill, stroke, lw) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { show: { p1: 1, s1: 1 }, link: {}, dim: { p1: 1, s1: 1 }, cap: '' };
        var show = s.show || {};
        var e = clamp01(t);
        var pubX = x0 + L.nodeW / 2, subX = x0 + w - L.nodeW / 2, topX = x0 + w / 2;
        var rowY = { 0: top + 44, 1: top + 134 };
        var pos = {
            p1: [pubX, rowY[0]], p2: [pubX, rowY[1]], s1: [subX, rowY[0]], s2: [subX, rowY[1]]
        };
        var two = !!(show.p2 || show.s2);
        var topY0 = top + 8, topY1 = top + L.graphH - 8;
        var tcol = P.purple;

        /* 토픽 */
        rr(topX - L.topicW / 2, topY0 + (two ? 0 : 26), L.topicW, (two ? topY1 - topY0 : topY1 - topY0 - 52), 12, tcol + '22', tcol + 'ff', 2);
        tx(mode === 'many' && s.types && s.types.s2 ? '/scan' : '/scan', topX, (topY0 + topY1) / 2 - 8, fs, tcol + 'ff', 'center', true);
        tx('LaserScan', topX, (topY0 + topY1) / 2 + 10, fs - 2, P.sub + 'ff', 'center', false);

        /* 연결선 */
        function edge(key, isPub) {
            var p = pos[key];
            var linked = s.link && s.link[key];
            var bad = s.bad && s.bad[key];
            var gone = s.gone && s.gone[key];
            var x1 = isPub ? p[0] + L.nodeW / 2 : topX + L.topicW / 2;
            var x2 = isPub ? topX - L.topicW / 2 : p[0] - L.nodeW / 2;
            var y = p[1];
            if (bad) {
                ln(x1, y, lerp(x1, x2, 0.5), y, P.red + 'cc', 2, [5, 4]);
                tx('✕', lerp(x1, x2, 0.5), y, fs + 3,P.red + 'ff', 'center', true);
                return;
            }
            if (gone) { ln(x1, y, x2, y, P.muted + '55', 1.4, [4, 4]); return; }
            if (linked) {
                var disc = s.disc;
                ln(x1, y, x2, y, (disc ? P.purple : P.muted) + (disc ? 'ff' : 'cc'), disc ? 2.6 : 2);
            } else {
                ln(x1, y, x2, y, P.muted + '55', 1.4, [4, 4]);
            }
        }
        ['p1', 'p2'].forEach(function (k) { if (show[k]) edge(k, true); });
        ['s1', 's2'].forEach(function (k) { if (show[k]) edge(k, false); });

        /* 노드 */
        function node(key, label, col) {
            if (!show[key]) return;
            var p = pos[key];
            var hot = s.hot === key;
            var dim = s.dim && s.dim[key];
            var bad = s.bad && s.bad[key];
            var gone = s.gone && s.gone[key];
            var c = bad ? P.red : (gone ? P.muted : colorOf(col));
            var a = hot ? Math.round(clamp01(e * 2) * 255) : 255;
            var ah = ('0' + a.toString(16)).slice(-2);
            ell(p[0], p[1], L.nodeW / 2, 26, c + (dim ? '10' : '22'), c + (dim ? '77' : ah), hot ? 2.6 : 1.8);
            tx(label, p[0], p[1] - 4, fs - 0.5, c + (dim ? '99' : 'ff'), 'center', true);
            var sub = s.types && s.types[key] ? '타입 ' + s.types[key] : (gone ? '종료됨' : (key.charAt(0) === 'p' ? '발행' : '구독'));
            tx(sub, p[0], p[1] + 12, fs - 2, (bad ? P.red : P.sub) + 'ff', 'center', false);
        }
        node('p1', 'lidar_node', 'orange');
        node('p2', 'lidar_2_node', 'orange');
        node('s1', 'slam_node', 'teal');
        node('s2', 'obstacle_node', 'teal');

        /* 콜백 풍선 */
        if (s.cb) {
            ['s1', 's2'].forEach(function (k) {
                if (!s.cb[k]) return;
                var p = pos[k];
                var ph = mode === 'queue' ? 1 : clamp01((e - 0.5) * 2);
                ctx.globalAlpha = ph;
                ctx.font = '700 ' + (fs - 1.5) + 'px "JetBrains Mono",monospace';
                var tw = ctx.measureText(s.cb[k]).width + 16;
                var bx = Math.min(x0 + w - tw, p[0] - tw / 2);
                rr(bx, p[1] + 30, tw, 20, 10, P.green + '22', P.green + 'ff', 1.4);
                tx(s.cb[k], bx + tw / 2, p[1] + 40, fs - 1.5, P.green + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            });
        }

        /* 메시지 점 */
        if (s.mv) {
            var maxPh = 1;
            s.mv.forEach(function (m) { if (m.ph > maxPh) maxPh = m.ph; });
            s.mv.forEach(function (m, idx) {
                var tt = clamp01(e * (maxPh + 0.0001) - (m.ph - 1));
                if (tt <= 0 || (tt >= 1 && m.ph < maxPh)) return;
                var fromX, fromY, toX, toY;
                if (m.a === 'T') { fromX = topX + L.topicW / 2; fromY = pos[m.b][1]; toX = pos[m.b][0] - L.nodeW / 2; toY = fromY; }
                else { fromX = pos[m.a][0] + L.nodeW / 2; fromY = pos[m.a][1]; toX = topX - L.topicW / 2; toY = fromY; }
                var yOff = (m.lb === 'B') ? 0 : 0;
                var px = lerp(fromX, toX, tt), py = lerp(fromY, toY, tt) + yOff;
                var c = colorOf(m.col);
                circ(px, py, 7, c + 'ff', 'none');
                ctx.font = '700 ' + (fs - 1.5) + 'px "JetBrains Mono",monospace';
                tx(m.lb, px, py - 14, fs - 1.5, c + 'ff', 'center', true);
            });
        }

        /* 큐 */
        if (mode === 'queue' && s.q) {
            var qy = top + L.graphH + 4;
            var slotW = 34;
            var qx = x0 + w - slotW * s.qd - (s.qd - 1) * 4;
            tx('구독 큐 (depth ' + s.qd + ')', x0 + w, qy + 4, fs - 1, P.sub + 'ff', 'right', true);
            for (var i = 0; i < s.qd; i++) {
                var xx = qx + i * (slotW + 4);
                var val = s.q[i];
                rr(xx, qy + 14, slotW, 34, 6, val ? P.yellow + '22' : 'none', val ? P.yellow + 'ff' : P.muted + '99', 1.5);
                if (val) tx('#' + val, xx + slotW / 2, qy + 31, fs - 0.5, P.yellow + 'ff', 'center', true);
            }
            tx('← 오래된 것', qx - 6, qy + 31, fs - 1.5, P.sub + 'ff', 'right', false);
            if (s.drop) {
                var dxx = Math.max(x0 + 24, qx - 112 - e * 14);
                ctx.globalAlpha = 1 - e * 0.6;
                rr(dxx - 18, qy + 18, 36, 26, 6, P.red + '22', P.red + 'ff', 1.6);
                tx('#' + s.drop, dxx, qy + 31, fs - 0.5, P.red + 'ff', 'center', true);
                ctx.globalAlpha = 1;
                tx('폐기', dxx, qy + 58, fs - 1.5, P.red + 'ff', 'center', true);
            }
        }

        /* 캡션 */
        var cy = top + L.graphH + L.qH + 10;
        if (s.cap) {
            lines(s.cap, w - 20, fs - 0.5).forEach(function (l, i) {
                tx(l, x0 + w / 2, cy + 12 + i * (fs + 5), fs - 0.5, P.yellow + 'ff', 'center', true);
            });
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
        speedBtns.forEach(function (b) { b.classList.remove('rostopic-viz__speed-btn--active'); });
        btn.classList.add('rostopic-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('rostopic-viz__mode-btn--active', d.key === m); });
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