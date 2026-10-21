/**
 * ROS2 서비스 vs 액션 시각화
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
    var root    = el('div', 'rossrv-viz');
    var toolbar = el('div', 'rossrv-viz__toolbar');
    var tbLeft  = el('div', 'rossrv-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'rossrv-viz__title', '서비스 vs 액션'));

    var modeWrap = el('div', 'rossrv-viz__mode');
    var modeDefs = [
        { key: 'service', label: '서비스' },
        { key: 'action', label: '액션' },
        { key: 'cancel', label: '취소' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'rossrv-viz__mode-btn' + (i === 0 ? ' rossrv-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'rossrv-viz__speed');
    speedWrap.appendChild(el('span', 'rossrv-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'rossrv-viz__speed-btn' + (i === 0 ? ' rossrv-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'rossrv-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'rossrv-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'rossrv-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'rossrv-viz__controls');
    var btnPlay  = el('button', 'rossrv-viz__btn rossrv-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'rossrv-viz__btn', '▶| STEP');
    var btnReset = el('button', 'rossrv-viz__btn', '↺ RESET');
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
    var mode    = 'service';
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
        { id: 'C', name: '클라이언트', sub: '요청하는 노드', col: 'orange' },
        { id: 'M', name: '인터페이스', sub: '이름 + 타입', col: 'purple' },
        { id: 'S', name: '서버', sub: '처리하는 노드', col: 'teal' }
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

    var SERVICE_STEPS = [
        st('서비스(service)는 요청과 응답으로 이루어진 통신입니다. 클라이언트가 요청을 보내면 서버가 처리해 응답을 돌려줍니다. 계속 흐르는 토픽과 달리 한 번 묻고 한 번 답하는 짧은 작업에 맞습니다. 두 정수를 더해 주는 서비스를 예로 봅니다.',
            { msg: [Y('요청 1번 → 응답 1번'), S('예: AddTwoInts, 이름 add_two_ints')], cli: [S('client_node')], srv: [S('server_node')] }),
        st('서버 노드가 서비스를 만듭니다. 서비스 이름, 타입, 요청이 올 때 실행할 콜백을 등록합니다. 서비스 이름 하나에는 서버를 하나만 두어야 합니다(여러 개면 어느 서버가 요청을 받을지 정해져 있지 않습니다).',
            { label: '서비스 서버 생성', msg: [T('create_service('), T('  AddTwoInts, "add_two_ints", callback)')], hl: { S: ['서버 생성', 'teal'] }, cli: [S('아직 시작 전')], srv: [Y('add_two_ints 서비스 제공')] }),
        st('클라이언트 노드가 같은 이름과 타입으로 클라이언트를 만들고, 서버가 나타날 때까지 기다립니다. 공식 튜토리얼처럼 요청을 보내기 전에 서버가 준비됐는지 먼저 확인합니다.',
            { from: 'C', to: 'S', kind: 'req', label: '서버 확인', msg: [T('create_client(AddTwoInts, "add_two_ints")'), T('wait_for_service()')], hl: { C: ['서버를 기다림', 'orange'], S: ['발견됨', 'teal'] }, cli: [G('서비스 서버를 찾음')], srv: [Y('add_two_ints 서비스 제공')] }),
        st('클라이언트가 요청을 보냅니다. 요청 메시지에는 a와 b가 들어 있습니다. call_async는 요청만 보내고 바로 돌아오며, 나중에 응답이 오면 완료되는 future를 돌려줍니다.',
            { from: 'C', to: 'S', kind: 'req', label: '요청', msg: [T('call_async(Request)'), Y('a = 2, b = 3')], hl: { C: ['요청 전송', 'orange'], S: ['요청 수신', 'teal'] }, cli: [Y('응답을 기다리는 future')], srv: [Y('요청 도착')] }),
        st('서버가 콜백을 실행해 요청을 처리합니다. 요청의 a와 b를 더해 응답의 sum에 담습니다.',
            { label: '콜백 실행', msg: [T('response.sum = request.a + request.b'), G('sum = 5')], hl: { S: ['처리 중', 'teal'] }, cli: [Y('응답을 기다리는 future')], srv: [G('콜백: 2 + 3 = 5')] }),
        st('서버가 응답을 돌려보냅니다. 응답은 요청을 보낸 그 클라이언트에게 전달됩니다.',
            { from: 'S', to: 'C', kind: 'res', label: '응답', msg: [T('Response'), G('sum = 5')], hl: { S: ['응답 전송', 'teal'], C: ['응답 수신', 'green'] }, cli: [Y('응답을 기다리는 future')], srv: [G('응답 전송 완료')] }),
        st('클라이언트의 future가 완료되어 결과를 꺼낼 수 있습니다. 요청 한 번에 응답 한 번으로 끝났습니다. 서비스는 이처럼 짧게 끝나는 작업에 쓰고, 오래 걸리는 일은 진행 상황과 취소가 없는 서비스에 맞지 않습니다.',
            { label: '결과 확인', msg: [G('future.result().sum == 5')], hl: { C: ['결과 5', 'green'] }, cli: [G('결과: sum = 5')], srv: [S('다음 요청을 대기')] }),
        st('서버가 없는 경우도 봅니다. 서비스 서버가 실행되고 있지 않으면 wait_for_service가 시간 안에 서버를 찾지 못해 실패합니다. 클라이언트는 이 결과를 보고 재시도하거나 오류로 처리해야 합니다.',
            { from: 'C', to: 'S', kind: 'err', label: '서버가 없음', msg: [T('wait_for_service(timeout_sec=1.0)'), R('False: 서버를 찾지 못함')], hl: { C: ['시간 초과', 'red'], S: ['없음', 'red'] }, cli: [R('요청을 보내지 못함 → 재시도 또는 오류 처리')], srv: [R('서비스 서버 없음')] })
    ];

    var ACTION_STEPS = [
        st('액션(action)은 오래 걸리는 작업을 위한 통신입니다. 목표(goal)를 보내면 서버가 수락하고, 작업하는 동안 진행 상황(feedback)을 계속 알려 주며, 끝나면 결과(result)를 돌려줍니다. 피보나치 수열을 만드는 예로 봅니다.',
            { msg: [Y('goal → 수락 → feedback 여러 번 → result'), S('예: Fibonacci, order = 5')], cli: [S('action client')], srv: [S('action server')] }),
        st('클라이언트가 목표를 보냅니다. 목표 메시지에는 order가 들어 있습니다. 보내기만 하고 바로 돌아오므로 클라이언트는 기다리는 동안 다른 일을 할 수 있습니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'goal', msg: [T('send_goal_async(goal)'), Y('order = 5')], hl: { C: ['목표 전송', 'orange'], S: ['목표 수신', 'teal'] }, cli: [Y('목표 전송, 응답 대기')], srv: [Y('goal 도착')] }),
        st('서버가 목표를 수락하거나 거절합니다. 수락하면 작업을 시작합니다. 이 응답은 목표가 받아들여졌다는 것일 뿐 작업이 끝났다는 뜻이 아닙니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'goal 수락', msg: [G('goal accepted'), S('상태: ACCEPTED → EXECUTING')], hl: { S: ['수락', 'teal'], C: ['수락됨', 'green'] }, cli: [G('목표가 수락됨, 결과를 기다림')], srv: [Y('상태: EXECUTING')] }),
        st('서버가 작업하면서 진행 상황을 피드백으로 보냅니다. 지금까지 만든 수열 [0, 1, 1]을 알려 줍니다. 클라이언트는 이 피드백으로 진행률을 화면에 보여 줄 수 있습니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'feedback', msg: [T('publish_feedback'), Y('partial_sequence = [0, 1, 1]')], hl: { S: ['진행 중', 'teal'], C: ['피드백 수신', 'orange'] }, cli: [Y('진행 상황: [0, 1, 1]')], srv: [Y('상태: EXECUTING')] }),
        st('작업이 계속되고 피드백이 다시 옵니다. 피드백은 작업이 끝날 때까지 여러 번 올 수 있는 점이 서비스와 다릅니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'feedback', msg: [T('publish_feedback'), Y('partial_sequence = [0, 1, 1, 2]')], hl: { S: ['진행 중', 'teal'], C: ['피드백 수신', 'orange'] }, cli: [Y('진행 상황: [0, 1, 1, 2]')], srv: [Y('상태: EXECUTING')] }),
        st('작업이 끝나면 서버가 성공으로 표시하고 결과를 돌려줍니다. 클라이언트는 결과를 요청해 받습니다. 결과에는 완성된 수열과 최종 상태가 들어 있습니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'result', msg: [G('상태: SUCCEEDED'), Y('sequence = [0, 1, 1, 2, 3, 5]')], hl: { S: ['성공', 'green'], C: ['결과 수신', 'green'] }, cli: [G('결과: [0, 1, 1, 2, 3, 5]')], srv: [G('상태: SUCCEEDED')] }),
        st('액션은 토픽과 서비스를 조합해 만들어집니다. 목표 · 결과 · 취소는 서비스처럼, 피드백과 상태는 토픽처럼 오갑니다. 그래서 요청 · 응답의 확실함과 진행 상황의 스트리밍을 함께 가집니다.',
            { label: '액션 = 서비스 + 토픽', msg: [Y('goal · result · cancel: 서비스 방식'), Y('feedback · status: 토픽 방식')], hl: { M: ['서비스 + 토픽', 'purple'] }, cli: [S('goal 1번, feedback 여러 번, result 1번')], srv: [S('진행 상황을 스트리밍')] })
    ];

    var CANCEL_STEPS = [
        st('액션의 큰 장점은 실행 중에 취소할 수 있다는 점입니다. 로봇이 목적지로 이동하다 장애물을 만났을 때 목표를 취소하는 것처럼, 오래 걸리는 작업에 필요한 기능입니다. 취소의 흐름과 서비스와의 차이를 봅니다.',
            { msg: [Y('goal 실행 중 → cancel 요청 → CANCELED'), S('예: Fibonacci, order = 10')], cli: [S('action client')], srv: [S('action server')] }),
        st('클라이언트가 order가 10인 목표를 보내고, 서버가 수락해 작업을 시작합니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'goal (order=10)', msg: [T('send_goal_async(goal)'), Y('order = 10'), G('goal accepted')], hl: { C: ['목표 전송', 'orange'], S: ['수락', 'teal'] }, cli: [Y('결과를 기다림')], srv: [Y('상태: EXECUTING')] }),
        st('서버가 작업하며 피드백을 보냅니다. 아직 작업이 끝나려면 시간이 더 걸립니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'feedback', msg: [T('publish_feedback'), Y('partial_sequence = [0, 1, 1, 2]')], hl: { S: ['진행 중', 'teal'], C: ['피드백 수신', 'orange'] }, cli: [Y('진행 상황: [0, 1, 1, 2]')], srv: [Y('상태: EXECUTING')] }),
        st('클라이언트가 더는 결과가 필요 없다고 판단해 취소를 요청합니다. 취소 요청도 서비스처럼 서버가 수락 여부를 응답합니다.',
            { from: 'C', to: 'S', kind: 'req', label: 'cancel 요청', msg: [T('cancel_goal_async()')], hl: { C: ['취소 요청', 'orange'], S: ['취소 요청 수신', 'teal'] }, cli: [Y('취소를 요청함')], srv: [Y('cancel 요청 도착')] }),
        st('서버가 취소를 수락하면 상태가 CANCELING이 됩니다. rclpy의 기본 설정은 취소 요청을 거절하므로, 취소를 지원하려면 서버가 취소 콜백에서 수락하도록 구현해야 합니다.',
            { from: 'S', to: 'C', kind: 'res', label: '취소 수락', msg: [G('cancel accepted'), S('상태: EXECUTING → CANCELING')], hl: { S: ['CANCELING', 'yellow'], C: ['취소 수락됨', 'green'] }, cli: [G('취소가 수락됨')], srv: [Y('상태: CANCELING'), S('취소 콜백에서 ACCEPT')] }),
        st('서버가 작업을 멈추고 목표를 취소된 상태로 마칩니다. 클라이언트는 최종 상태 CANCELED를 결과로 받습니다.',
            { from: 'S', to: 'C', kind: 'res', label: 'result: CANCELED', msg: [R('상태: CANCELED'), S('작업 중단, 결과 내용은 서버가 정함')], hl: { S: ['취소됨', 'red'], C: ['CANCELED', 'red'] }, cli: [R('최종 상태: CANCELED')], srv: [R('상태: CANCELED')] }),
        st('서비스에는 이런 기능이 없습니다. 서비스에는 진행 상황을 알리거나 작업을 취소하는 규약이 없어, 결과는 응답이 와야 알 수 있습니다. 오래 걸리고 도중에 멈출 수 있어야 하면 액션, 짧게 끝나면 서비스로 나누어 씁니다.',
            { label: '서비스와 액션의 차이', msg: [Y('서비스: 진행 상황 없음, 취소 없음'), Y('액션: feedback + cancel 지원')], hl: { M: ['선택 기준', 'purple'] }, cli: [S('짧은 작업 → 서비스')], srv: [S('긴 작업 → 액션')] })
    ];

    /* ===================== 장면 데이터: 타임라인 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
    }
    function A(slot, dir, k, lg) { return { slot: slot, dir: dir, k: k, lg: lg }; }
    function B(lane, from, to, col, lab) { return { lane: lane, from: from, to: to, col: col, lab: lab }; }

    var SV = [
        A(0, 'cs', 'dash', '① wait_for_service — 서버가 준비됐는지 확인'),
        A(1, 'cs', 'req', '② 요청 call_async(a=2, b=3)'),
        A(3, 'sc', 'res', '③ 응답 sum=5')
    ];
    ann(SERVICE_STEPS, [
        { n: 4, arrs: [], bars: [] },
        { n: 4, arrs: [], bars: [B('s', 0, 'now', 'teal', '서비스 제공')], nowSlot: 0 },
        { n: 4, arrs: [SV[0]], bars: [B('s', 0, 'now', 'teal', '서비스 제공')] },
        { n: 4, arrs: [SV[0], SV[1]], bars: [B('s', 0, 'now', 'teal', '서비스 제공'), B('c', 1, 'now', 'yellow', '응답 대기')] },
        { n: 4, arrs: [SV[0], SV[1]], bars: [B('s', 1, 2, 'green', '콜백 2+3=5'), B('c', 1, 'now', 'yellow', '응답 대기')], nowSlot: 2 },
        { n: 4, arrs: [SV[0], SV[1], SV[2]], bars: [B('s', 1, 2, 'green', '콜백'), B('c', 1, 3, 'yellow', '응답 대기')] },
        { n: 4, arrs: [SV[0], SV[1], SV[2]], bars: [B('s', 1, 2, 'green', '콜백'), B('c', 1, 3, 'yellow', '응답 대기')], done: '결과 sum = 5' },
        { n: 4, arrs: [A(0, 'cs', 'err', '① wait_for_service(1초) → False: 서버 없음')], bars: [], reset: true }
    ]);

    var AC = [
        A(0, 'cs', 'req', '① goal  order=5'),
        A(1, 'sc', 'res', '② 수락 — ACCEPTED → EXECUTING'),
        A(2, 'sc', 'fb', '③ feedback  [0, 1, 1]'),
        A(3, 'sc', 'fb', '④ feedback  [0, 1, 1, 2]'),
        A(5, 'sc', 'res', '⑤ result  SUCCEEDED')
    ];
    var ACW = B('c', 0, 'now', 'yellow', '결과 대기 (다른 일 가능)');
    ann(ACTION_STEPS, [
        { n: 6, arrs: [], bars: [], gs: '', seq: [] },
        { n: 6, arrs: [AC[0]], bars: [ACW], gs: '', seq: [] },
        { n: 6, arrs: [AC[0], AC[1]], bars: [ACW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [] },
        { n: 6, arrs: [AC[0], AC[1], AC[2]], bars: [ACW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [0, 1, 1] },
        { n: 6, arrs: [AC[0], AC[1], AC[2], AC[3]], bars: [ACW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [0, 1, 1, 2] },
        { n: 6, arrs: AC, bars: [B('c', 0, 5, 'yellow', '결과 대기'), B('s', 1, 5, 'green', 'EXECUTING')], gs: 'SUCCEEDED', seq: [0, 1, 1, 2, 3, 5] },
        { n: 6, arrs: AC, bars: [B('c', 0, 5, 'yellow', '결과 대기'), B('s', 1, 5, 'green', 'EXECUTING')], gs: 'SUCCEEDED', seq: [0, 1, 1, 2, 3, 5], fm: '액션 = 서비스(goal · result · cancel) + 토픽(feedback · status)' }
    ]);

    var CA = [
        A(0, 'cs', 'req', '① goal  order=10'),
        A(1, 'sc', 'res', '② 수락 — EXECUTING'),
        A(2, 'sc', 'fb', '③ feedback  [0, 1, 1, 2]'),
        A(3, 'cs', 'cancel', '④ cancel 요청'),
        A(4, 'sc', 'res', '⑤ 취소 수락 — CANCELING'),
        A(5, 'sc', 'err', '⑥ result  CANCELED')
    ];
    var CAW = B('c', 0, 'now', 'yellow', '결과 대기');
    ann(CANCEL_STEPS, [
        { n: 6, arrs: [], bars: [], gs: '', seq: [] },
        { n: 6, arrs: [CA[0], CA[1]], bars: [CAW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [] },
        { n: 6, arrs: [CA[0], CA[1], CA[2]], bars: [CAW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [0, 1, 1, 2] },
        { n: 6, arrs: [CA[0], CA[1], CA[2], CA[3]], bars: [CAW, B('s', 1, 'now', 'green', 'EXECUTING')], gs: 'EXECUTING', seq: [0, 1, 1, 2] },
        { n: 6, arrs: [CA[0], CA[1], CA[2], CA[3], CA[4]], bars: [CAW, B('s', 1, 3, 'green', 'EXECUTING'), B('s', 4, 'now', 'orange', 'CANCELING')], gs: 'CANCELING', seq: [0, 1, 1, 2] },
        { n: 6, arrs: CA, bars: [B('c', 0, 5, 'yellow', '결과 대기'), B('s', 1, 3, 'green', 'EXECUTING'), B('s', 4, 5, 'orange', 'CANCELING')], gs: 'CANCELED', seq: [0, 1, 1, 2] },
        { n: 6, arrs: [], bars: [], gs: '', seq: [], fm: '서비스: 진행 · 취소 규약 없음   |   액션: feedback + cancel' }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'action') return ACTION_STEPS;
        if (mode === 'cancel') return CANCEL_STEPS;
        return SERVICE_STEPS;
    }
    function defaultLog() {
        if (mode === 'action') return '목표를 보내고 피드백으로 진행 상황을 받으며 결과를 돌려받는 액션의 흐름을 봅니다.';
        if (mode === 'cancel') return '실행 중인 액션 목표를 취소하는 과정과 서비스와의 차이를 봅니다.';
        return '요청 한 번에 응답 한 번으로 끝나는 서비스의 흐름과 서버가 없을 때의 처리를 봅니다.';
    }

    /* ===================== 레이아웃(모드마다 고정) ===================== */
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var maxLg = 0, anyGs = false;
        currentSteps().forEach(function (s) {
            if (s.arrs && s.arrs.length > maxLg) maxLg = s.arrs.length;
            if (s.gs !== undefined && mode !== 'service') anyGs = true;
        });
        var laneH = 18 + 30 + 76 + 18 + 30;
        var stH = anyGs ? 22 + 2 * 34 + 14 : 0;
        var sqH = anyGs ? 52 : 0;
        var lgH = 20 + maxLg * (fs + 8) + 10;
        return { fs: fs, laneH: laneH, stH: stH, sqH: sqH, lgH: lgH, fmH: 30, total: laneH + 14 + stH + sqH + lgH + 30 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function kindCol(k) {
        if (k === 'req') return 'orange';
        if (k === 'res') return 'teal';
        if (k === 'fb') return 'yellow';
        if (k === 'cancel') return 'red';
        if (k === 'err') return 'red';
        return 'muted';
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { n: 4, arrs: [], bars: [], gs: '', seq: [] };
        var e = clamp01(t);
        var n = s.n || 4;
        var sx = function (slot) { return x0 + 24 + slot * (w - 48) / (n - 1); };
        var yC = top + 18 + 15, yS = top + 18 + 30 + 76 + 18 + 15;
        var prevCnt = prev && !s.reset ? (prev.arrs ? prev.arrs.length : 0) : 0;
        if (!prev) prevCnt = 0;

        /* 레인 */
        [['클라이언트', top, 'orange', yC], ['서버', top + 18 + 30 + 76, 'teal', yS]].forEach(function (ln2) {
            tx(ln2[0], x0 + 2, ln2[1] + 8, fs - 0.5, colorOf(ln2[2]) + 'ff', 'left', true);
            rr(x0, ln2[3] - 15, w, 30, 8, colorOf(ln2[2]) + '10', colorOf(ln2[2]) + '77', 1.3);
        });

        /* 구간 막대 */
        var lastSlot = 0;
        s.arrs.forEach(function (a) { if (a.slot > lastSlot) lastSlot = a.slot; });
        if (s.nowSlot !== undefined) lastSlot = s.nowSlot;
        s.bars.forEach(function (b) {
            var from = sx(b.from);
            var toSlot = b.to === 'now' ? lastSlot : b.to;
            var to = sx(toSlot);
            if (b.to === 'now' && prev && prev.arrs) {
                var pl = 0;
                prev.arrs.forEach(function (a) { if (a.slot > pl) pl = a.slot; });
                if (prev.nowSlot !== undefined) pl = prev.nowSlot;
                to = lerp(sx(pl), to, e);
            }
            var c = colorOf(b.col);
            var y = b.lane === 'c' ? yC : yS;
            if (to - from < 4) to = from + 4;
            rr(from, y - 11, to - from, 22, 6, c + '33', c + 'ff', 1.6);
            if (to - from > 70) tx(b.lab, from + 8, y, fs - 1.5, c + 'ff', 'left', true);
        });

        /* 화살표 */
        s.arrs.forEach(function (a, i) {
            var isNew = i >= prevCnt && !!step;
            var p = isNew ? e : 1;
            var c = colorOf(kindCol(a.k));
            var x1 = sx(a.slot), x2 = x1 + 16;
            var y1 = a.dir === 'cs' ? yC + 15 : yS - 15;
            var y2 = a.dir === 'cs' ? yS - 15 : yC + 15;
            var ex = lerp(x1, x2, p), ey = lerp(y1, y2, p);
            var dash = a.k === 'dash' ? [5, 4] : undefined;
            arrow(x1, y1, ex, ey, c + 'ff', 2.6, dash);
            circ(x1 + 8 + (x2 - x1) * 0.5 * 0, (y1 + y2) / 2, 0.01, 'none', 'none');
            if (a.k === 'err' && a.slot === 0 && a.dir === 'cs') tx('✕', x2 + 12, y2 - 8, fs + 4, P.red + 'ff', 'center', true);
            var num = String(i + 1);
            circ(x1 - 10, (y1 + y2) / 2, 8, c + (isNew ? Math.round(p * 255).toString(16).padStart(2, '0') : 'ff'), 'none');
            tx(num, x1 - 10, (y1 + y2) / 2, 10.5, P.bg + 'ff', 'center', true);
        });

        var y = top + L.laneH + 14;

        /* 목표 상태 머신 + 진행 */
        if (L.stH) {
            tx('목표(goal)의 상태', x0 + 2, y + 6, fs - 1, P.sub + 'ff', 'left', true);
            var cw = (w - 12 - 2 * 24) / 3;
            var pos = {
                ACCEPTED: [0, 0], EXECUTING: [1, 0], SUCCEEDED: [2, 0],
                CANCELING: [1, 1], CANCELED: [2, 1], ABORTED: [0, 1]
            };
            var colr = { ACCEPTED: 'purple', EXECUTING: 'green', SUCCEEDED: 'green', CANCELING: 'orange', CANCELED: 'red', ABORTED: 'red' };
            function cpos(name) { return [x0 + 6 + pos[name][0] * (cw + 24), y + 18 + pos[name][1] * 38]; }
            function link(a, b) {
                var pa = cpos(a), pb = cpos(b);
                if (pa[1] === pb[1]) arrow(pa[0] + cw + 1, pa[1] + 14, pb[0] - 1, pb[1] + 14, P.muted + 'aa', 1.6);
                else arrow(pa[0] + cw / 2, pa[1] + 28, pb[0] + cw / 2, pb[1] - 1, P.muted + 'aa', 1.6);
            }
            link('ACCEPTED', 'EXECUTING');
            link('EXECUTING', 'SUCCEEDED');
            link('EXECUTING', 'CANCELING');
            ln(cpos('CANCELING')[0] - 1, cpos('CANCELING')[1] + 14, cpos('ABORTED')[0] + cw + 1, cpos('ABORTED')[1] + 14, P.muted + '00', 1);
            arrow(cpos('CANCELING')[0] + cw + 1, cpos('CANCELING')[1] + 14, cpos('CANCELED')[0] - 1, cpos('CANCELED')[1] + 14, P.muted + 'aa', 1.6);
            Object.keys(pos).forEach(function (name) {
                var p2 = cpos(name);
                var on = s.gs === name || (s.gs === 'EXECUTING' && name === 'ACCEPTED' && false);
                var c = colorOf(colr[name]);
                rr(p2[0], p2[1], cw, 28, 14, on ? c + '44' : 'none', on ? c + 'ff' : P.muted + '99', on ? 2.4 : 1.2);
                tx(name, p2[0] + cw / 2, p2[1] + 14, fs - 1.5, on ? c + 'ff' : P.sub + 'ff', 'center', on);
            });
            y += L.stH;
        }
        if (L.sqH) {
            tx('feedback로 받은 수열', x0 + 2, y + 6, fs - 1, P.sub + 'ff', 'left', true);
            var sq = s.seq || [];
            sq.forEach(function (v, i) {
                var isNewV = prev && prev.seq && i >= prev.seq.length;
                var cx = x0 + 4 + i * 38;
                ctx.globalAlpha = isNewV ? e : 1;
                rr(cx, y + 18, 32, 26, 6, P.yellow + '22', P.yellow + 'ff', 1.6);
                tx(String(v), cx + 16, y + 31, fs, P.yellow + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            });
            if (!sq.length) tx('(아직 없음)', x0 + 4, y + 31, fs - 1, P.sub + 'ff', 'left', false);
            y += L.sqH;
        }

        /* 범례 */
        tx('오간 메시지', x0 + 2, y + 6, fs - 1, P.sub + 'ff', 'left', true);
        s.arrs.forEach(function (a, i) {
            var c = colorOf(kindCol(a.k));
            var isNew = i >= prevCnt && !!step;
            ctx.globalAlpha = isNew ? e : 1;
            circ(x0 + 12, y + 28 + i * (fs + 8), 8, c + 'ff', 'none');
            tx(String(i + 1), x0 + 12, y + 28 + i * (fs + 8), 10.5, P.bg + 'ff', 'center', true);
            tx(a.lg.replace(/^[①-⑩]\s*/, ''), x0 + 28, y + 28 + i * (fs + 8), fs - 0.5, c + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        });
        var fy = top + L.total - 30;
        if (s.done) tx('✓ ' + s.done, x0 + w / 2, fy, fs + 1, P.green + 'ff', 'center', true);
        if (s.fm) {
            lines(s.fm, w - 8, fs - 0.5).forEach(function (l, i) { tx(l, x0 + w / 2, fy + i * (fs + 4), fs - 0.5, P.yellow + 'ff', 'center', true); });
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
        speedBtns.forEach(function (b) { b.classList.remove('rossrv-viz__speed-btn--active'); });
        btn.classList.add('rossrv-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('rossrv-viz__mode-btn--active', d.key === m); });
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