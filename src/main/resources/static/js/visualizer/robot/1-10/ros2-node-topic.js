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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 ===================== */
    var mode    = 'pubsub';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;

    function currentSteps() {
        if (mode === 'many') return MANY_STEPS;
        if (mode === 'queue') return QUEUE_STEPS;
        return PUBSUB_STEPS;
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
    function colorOf(key) {
        return P[key] || P.muted;
    }

    /* ===================== 레이아웃 ===================== */
    var BOX_H = 60;
    var SEC_GAP = 10;

    function sectionsOf(step, w, mob) {
        var fs = mob ? 11 : 12;
        var lh = Math.round(fs * 1.5);
        var inner = w - 20;
        var defs = [
            { title: '주고받는 것', rows: step ? step.msg : [], empty: step ? '(내용 없음)' : '(STEP 또는 PLAY로 시작하세요)' },
            { title: '발행 노드 쪽', rows: step ? step.cli : [], empty: '(없음)' },
            { title: '구독 노드 쪽', rows: step ? step.srv : [], empty: '(없음)' }
        ];
        defs.forEach(function (d) {
            var out = [];
            d.rows.forEach(function (r) {
                ctx.font = '500 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
                window.CsFlow.wrapText(ctx, r[0], inner).forEach(function (t) { out.push([t, r[1]]); });
            });
            d.lines = out;
            d.h = 26 + Math.max(1, out.length) * lh;
            d.lh = lh;
        });
        return defs;
    }
    function topBlockH() {
        return BOX_H + 24 + 34;
    }
    function totalHeight(step, w, mob, top) {
        var h = top + topBlockH();
        sectionsOf(step, w, mob).forEach(function (d) { h += d.h + SEC_GAP; });
        return h + 6;
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step) {
        var fs = mob ? 11 : 12;
        var gap = mob ? 8 : 16;
        var bw = (w - gap * 2) / 3;
        var busY = top + BOX_H + 24;
        var s = step || { from: null, to: null, kind: '', label: '', hl: {}, msg: [], cli: [], srv: [] };
        var cx = [];
        ACTORS.forEach(function (a, i) { cx.push(x0 + i * (bw + gap) + bw / 2); });
        var idxOf = { P: 0, T: 1, S: 2 };

        ctx.beginPath();
        ctx.moveTo(cx[0], busY);
        ctx.lineTo(cx[2], busY);
        ctx.strokeStyle = P.muted + '55';
        ctx.lineWidth = 2;
        ctx.stroke();

        var pulse = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
        ACTORS.forEach(function (a, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(a.col);
            var badge = s.hl[a.id];
            var bc = badge ? colorOf(badge[1]) : c;
            var faded = badge && badge[1] === 'muted';
            var on = s.from === a.id || s.to === a.id;
            ctx.beginPath();
            ctx.moveTo(cx[i], top + BOX_H);
            ctx.lineTo(cx[i], busY);
            ctx.strokeStyle = on ? pulse + 'ff' : P.muted + '55';
            ctx.lineWidth = on ? 2.4 : 1.4;
            ctx.stroke();
            rr(x, top, bw, BOX_H, 6, (faded ? P.muted : bc) + '18', (badge ? bc : c) + (badge || on ? 'ff' : '77'), badge || on ? 1.8 : 1.2);
            tx(a.name, x + bw / 2, top + 14, fs, c + 'ee', 'center', true);
            tx(a.sub, x + bw / 2, top + 31, fs - 1.5, P.muted + 'ee', 'center', false);
            if (badge) tx(badge[0], x + bw / 2, top + 48, fs - 1, bc + 'ff', 'center', true);
        });

        if (s.from && s.to) {
            var a = cx[idxOf[s.from]];
            var b = cx[idxOf[s.to]];
            var dir = b > a ? 1 : -1;
            var ax = a + dir * 6;
            var bx = b - dir * 6;
            ctx.beginPath();
            ctx.moveTo(ax, busY);
            ctx.lineTo(bx, busY);
            ctx.strokeStyle = pulse + 'ff';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bx, busY);
            ctx.lineTo(bx - dir * 9, busY - 6);
            ctx.lineTo(bx - dir * 9, busY + 6);
            ctx.closePath();
            ctx.fillStyle = pulse + 'ff';
            ctx.fill();
        }
        tx(s.label || '요청과 응답을 오가는 경로', x0 + w / 2, busY + 16, fs - 0.5, (s.label ? pulse : P.muted) + 'ee', 'center', true);

        var y = top + topBlockH();
        sectionsOf(step, w, mob).forEach(function (d) {
            rr(x0, y, w, d.h, 6, 'none', P.muted + '55', 1.2);
            tx(d.title, x0 + 10, y + 12, fs - 1.5, P.muted + 'ee', 'left', true);
            if (!d.lines.length) {
                tx(d.empty, x0 + 10, y + 30, fs - 1, P.muted + 'cc', 'left', false);
            }
            d.lines.forEach(function (ln, i) {
                tx(ln[0], x0 + 10, y + 30 + i * d.lh, fs - 1, colorOf(ln[1]) + 'ee', 'left', false);
            });
            y += d.h + SEC_GAP;
        });
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var top = mob ? 16 : 22;
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;
        drawScene(padX, top, W - padX * 2, mob, step);
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var padX = mob ? 16 : 26;
        var top = mob ? 16 : 22;
        var neededH = 300;
        currentSteps().forEach(function (s) {
            var h = totalHeight(s, w - padX * 2, mob, top);
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'many') return '한 토픽에 발행자와 구독자를 늘리는 과정과, 타입이 맞지 않으면 연결되지 않는 경우를 봅니다.';
        if (mode === 'queue') return '구독자가 느릴 때 큐가 가득 차 오래된 메시지부터 버려지는 과정을 봅니다.';
        return '라이다 노드가 /scan 토픽에 발행하고 SLAM 노드가 구독하는 ROS 2의 기본 통신 흐름을 봅니다.';
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