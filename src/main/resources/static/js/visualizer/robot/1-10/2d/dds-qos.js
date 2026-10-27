/**
 * DDS QoS 시각화
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
    var root    = el('div', 'ddsqos-viz');
    var toolbar = el('div', 'ddsqos-viz__toolbar');
    var tbLeft  = el('div', 'ddsqos-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ddsqos-viz__title', 'DDS QoS'));

    var modeWrap = el('div', 'ddsqos-viz__mode');
    var modeDefs = [
        { key: 'match', label: '호환되는 조합' },
        { key: 'mismatch', label: '호환되지 않는 조합' },
        { key: 'late', label: '늦게 합류한 구독자' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ddsqos-viz__mode-btn' + (i === 0 ? ' ddsqos-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ddsqos-viz__speed');
    speedWrap.appendChild(el('span', 'ddsqos-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ddsqos-viz__speed-btn' + (i === 0 ? ' ddsqos-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ddsqos-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ddsqos-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ddsqos-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ddsqos-viz__controls');
    var btnPlay  = el('button', 'ddsqos-viz__btn ddsqos-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ddsqos-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ddsqos-viz__btn', '↺ RESET');
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
    var mode    = 'match';
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
        { id: 'P', name: '발행자', sub: '제공(offered)', col: 'orange' },
        { id: 'M', name: 'DDS', sub: 'QoS 매칭', col: 'purple' },
        { id: 'S', name: '구독자', sub: '요청(requested)', col: 'teal' }
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

    var DEF_PUB = [Y('reliability: RELIABLE'), Y('durability: VOLATILE'), Y('history: KEEP_LAST, depth 10')];

    var MATCH_STEPS = [
        st('QoS(Quality of Service)는 발행자와 구독자가 데이터를 어떤 품질 규칙으로 주고받을지 정하는 설정입니다. 발행자는 "이 품질로 줄 수 있다"를 제공(offered)하고, 구독자는 "이 품질로 받고 싶다"를 요청(requested)합니다. 요청이 제공으로 충족돼야 둘이 연결됩니다.',
            { msg: [Y('발행자: 제공(offered) QoS'), Y('구독자: 요청(requested) QoS'), S('요청 ≤ 제공이면 연결')], cli: [S('QoS를 정해서 발행자 생성')], srv: [S('QoS를 정해서 구독자 생성')] }),
        st('depth만 정수로 주고 발행자를 만들면 나머지는 기본 프로필이 적용됩니다. 기본 프로필은 신뢰성 RELIABLE, 내구성 VOLATILE, 이력 최근 10개(KEEP_LAST, depth 10)입니다.',
            { label: '기본 QoS 발행자', msg: DEF_PUB, hl: { P: ['기본 QoS', 'orange'] }, cli: [Y('제공: RELIABLE / VOLATILE / depth 10')], srv: [S('아직 시작 전')] }),
        st('구독자도 기본 QoS로 만들면 같은 값을 요청합니다. DDS가 두 설정을 비교해 요청이 제공으로 충족되므로 연결합니다. 신뢰성이 RELIABLE이라 유실되면 다시 보내 줍니다.',
            { from: 'P', to: 'S', kind: 'req', label: 'QoS 호환 → 연결', msg: [G('제공 RELIABLE ≥ 요청 RELIABLE'), G('제공 VOLATILE ≥ 요청 VOLATILE'), G('호환 → 연결됨')], hl: { M: ['호환', 'green'], S: ['연결', 'teal'] }, cli: [Y('제공: RELIABLE / VOLATILE / depth 10')], srv: [Y('요청: RELIABLE / VOLATILE / depth 10')] }),
        st('센서 값을 받는 구독자는 BEST_EFFORT를 요청하기도 합니다. 유실되어도 다시 보내지 않고 최신 값을 빨리 받는 쪽을 택한 것입니다. 발행자의 RELIABLE 제공은 BEST_EFFORT 요청보다 강한 약속이라 호환됩니다.',
            { from: 'P', to: 'S', kind: 'req', label: 'BEST_EFFORT 요청 → 호환', msg: [Y('제공 RELIABLE, 요청 BEST_EFFORT'), G('호환 → 연결됨'), S('구독자는 재전송을 요청하지 않음')], hl: { M: ['호환', 'green'], S: ['BEST_EFFORT', 'teal'] }, cli: [Y('제공: RELIABLE')], srv: [Y('요청: BEST_EFFORT')] }),
        st('연결되면 메시지가 오갑니다. 구독자가 재전송을 요청하지 않는 BEST_EFFORT이므로, 네트워크가 나쁘면 일부 메시지가 유실되어도 이 구독자에게는 다시 보내지 않습니다.',
            { from: 'P', to: 'S', kind: 'res', label: '메시지 전달', msg: [T('publish(msg)'), G('BEST_EFFORT 구독자에게 전달'), S('유실돼도 재전송 없음')], hl: { P: ['발행', 'orange'], S: ['수신', 'green'] }, cli: [Y('발행')], srv: [G('수신 (유실 가능)')] })
    ];

    var MISMATCH_STEPS = [
        st('요청이 제공보다 더 강한 약속을 바라면 호환되지 않아 연결되지 않습니다. 대표적인 불일치는 센서 드라이버가 BEST_EFFORT로 발행하는데 구독자가 기본값(RELIABLE)으로 구독하는 경우입니다.',
            { msg: [Y('요청이 제공보다 강하면 연결 안 됨')], cli: [S('센서 드라이버')], srv: [S('내 구독 노드')] }),
        st('센서 드라이버 중에는 센서용 QoS(BEST_EFFORT)로 발행하는 것이 있습니다. 여기서는 센서용 프로파일(BEST_EFFORT, depth 5)을 쓰는 발행자를 가정합니다. 오래된 프레임을 다시 보내기보다 최신 프레임이 중요하기 때문입니다.',
            { label: '센서용 발행자', msg: [Y('reliability: BEST_EFFORT'), Y('durability: VOLATILE'), Y('history: KEEP_LAST, depth 5')], hl: { P: ['BEST_EFFORT', 'orange'] }, cli: [Y('제공: BEST_EFFORT / VOLATILE / depth 5')], srv: [S('아직 시작 전')] }),
        st('구독 노드가 QoS를 지정하지 않고 기본값으로 구독했습니다. RELIABLE을 요청하지만 발행자는 BEST_EFFORT만 제공하므로 요청이 제공보다 강해 호환되지 않습니다. DDS가 연결을 맺지 않습니다.',
            { from: 'P', to: 'S', kind: 'err', label: 'QoS 불일치', msg: [R('제공 BEST_EFFORT < 요청 RELIABLE'), R('호환되지 않음 → 연결 안 됨')], hl: { M: ['불일치', 'red'], S: ['연결 안 됨', 'red'] }, cli: [Y('제공: BEST_EFFORT')], srv: [R('요청: RELIABLE'), R('메시지가 오지 않음')] }),
        st('오류로 멈추지 않고 데이터만 오지 않는 것처럼 보입니다. 다만 Jazzy의 rclcpp와 rclpy는 호환되지 않는 QoS를 발견하면 기본으로 경고 로그를 남깁니다(RMW가 해당 이벤트를 지원할 때, Humble의 rclpy는 기본 로그 없음). 로그와 ros2 topic info의 QoS 정보가 단서입니다.',
            { label: '조용한 실패', msg: [Y('WARN: incompatible QoS … Last incompatible policy: RELIABILITY'), S('ros2 topic info /scan --verbose 로 QoS 확인')], hl: { S: ['데이터 없음', 'red'] }, cli: [S('발행은 정상 동작')], srv: [R('콜백이 호출되지 않음')] }),
        st('구독자의 QoS를 BEST_EFFORT로 바꾸면 요청이 제공으로 충족되어 연결됩니다. rclpy에는 이런 센서용 설정이 미리 만들어진 qos_profile_sensor_data가 있습니다.',
            { from: 'P', to: 'S', kind: 'res', label: '구독자를 BEST_EFFORT로', msg: [G('제공 BEST_EFFORT ≥ 요청 BEST_EFFORT'), G('호환 → 연결됨')], hl: { M: ['호환', 'green'], S: ['연결', 'green'] }, cli: [Y('제공: BEST_EFFORT')], srv: [G('요청: BEST_EFFORT → 수신')] }),
        st('내구성도 같은 규칙입니다. 발행자가 VOLATILE(지난 메시지를 보관하지 않음)인데 구독자가 TRANSIENT_LOCAL(지난 메시지도 받겠다)을 요청하면 요청이 더 강해 연결되지 않습니다. 반대로 발행자가 TRANSIENT_LOCAL이고 구독자가 VOLATILE이면 호환됩니다.',
            { from: 'P', to: 'S', kind: 'err', label: '내구성 불일치', msg: [R('제공 VOLATILE < 요청 TRANSIENT_LOCAL'), R('호환되지 않음 → 연결 안 됨')], hl: { M: ['불일치', 'red'], S: ['연결 안 됨', 'red'] }, cli: [Y('제공: VOLATILE')], srv: [R('요청: TRANSIENT_LOCAL')] })
    ];

    var LATE_STEPS = [
        st('지도(/map)처럼 한 번 발행하고 한동안 바뀌지 않는 데이터를 생각해 봅시다. 구독 노드가 나중에 시작하면 이미 발행된 지도를 어떻게 받을까요? 내구성(durability) 설정이 이 차이를 만듭니다.',
            { msg: [Y('VOLATILE: 지난 메시지 없음'), Y('TRANSIENT_LOCAL: 발행자가 보관해 늦은 구독자에게 전달')], cli: [S('지도 서버')], srv: [S('나중에 시작하는 노드')] }),
        st('지도 서버가 TRANSIENT_LOCAL, RELIABLE, depth 1로 발행자를 만듭니다. 최근 1개 메시지를 발행자가 보관하겠다는 약속입니다.',
            { label: '발행자 설정', msg: [Y('reliability: RELIABLE'), Y('durability: TRANSIENT_LOCAL'), Y('history: KEEP_LAST, depth 1')], hl: { P: ['TRANSIENT_LOCAL', 'orange'] }, cli: [Y('제공: RELIABLE / TRANSIENT_LOCAL / depth 1')], srv: [S('아직 시작 전')] }),
        st('지도 서버가 지도를 한 번 발행합니다. 아직 구독자가 없어 아무도 받지 않지만, 발행자가 마지막 메시지를 보관합니다.',
            { from: 'P', to: 'M', kind: 'req', label: '지도 발행', msg: [T('publish(map #1)'), G('발행자가 map #1을 보관')], hl: { P: ['map #1 보관', 'orange'] }, cli: [G('보관 중: map #1')], srv: [S('아직 시작 전')] }),
        st('기본 QoS(VOLATILE)로 구독하는 노드가 이제 시작합니다. 연결은 되지만 VOLATILE은 지난 메시지를 요청하지 않으므로 이미 발행된 map #1을 받지 못합니다. 다음 발행을 기다려야 합니다.',
            { from: 'P', to: 'S', kind: 'err', label: 'VOLATILE 구독자', msg: [Y('연결됨'), R('map #1은 받지 못함'), S('다음 발행까지 대기')], hl: { S: ['대기', 'red'], M: ['연결', 'green'] }, cli: [G('보관 중: map #1')], srv: [Y('요청: VOLATILE'), R('아무것도 받지 못함')] }),
        st('구독자를 TRANSIENT_LOCAL로 만들면 연결되는 순간 발행자가 보관하던 map #1을 전달합니다. 늦게 시작한 노드도 현재 지도를 바로 받습니다.',
            { from: 'P', to: 'S', kind: 'res', label: 'TRANSIENT_LOCAL 구독자', msg: [G('연결됨'), G('보관된 map #1 전달')], hl: { M: ['호환', 'green'], S: ['map #1 수신', 'green'] }, cli: [G('보관 중: map #1')], srv: [Y('요청: TRANSIENT_LOCAL'), G('map #1 수신')] }),
        st('TRANSIENT_LOCAL은 발행자가 메시지를 보관하는 방식이라 발행자가 살아 있는 동안에만 유효하고, 보관 개수는 depth가 정합니다. 한 번 발행해 두고 바뀌지 않는 데이터(지도, 정적 변환 등)에 쓰고, 계속 흐르는 센서 값에는 VOLATILE이 맞습니다.',
            { label: '내구성의 쓰임', msg: [Y('TRANSIENT_LOCAL: 지도, 정적 설정'), Y('VOLATILE: 계속 흐르는 센서 값')], hl: { P: ['발행자가 보관', 'yellow'] }, cli: [S('발행자 종료 시 보관분도 사라짐')], srv: [S('보관 개수 = depth')] })
    ];

    /* ===================== 장면 데이터: 제공 vs 요청 비교표 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
    }
    function Q(r, d, h) { return { r: r, d: d, h: h }; }
    function VD(t, c) { return { t: t, c: c }; }
    var DEF = Q('RELIABLE', 'VOLATILE', 'KEEP_LAST 10');
    var SENSOR = Q('BEST_EFFORT', 'VOLATILE', 'KEEP_LAST 5');
    var MAPQ = Q('RELIABLE', 'TRANSIENT_LOCAL', 'KEEP_LAST 1');

    ann(MATCH_STEPS, [
        { pub: null, sub: null, vd: VD('요청 ≤ 제공 이면 연결', 'yellow') },
        { pub: DEF, sub: null, vd: VD('발행자가 제공할 QoS를 정함', 'yellow') },
        { pub: DEF, sub: DEF, vd: VD('호환 → 연결됨', 'green'), link: true },
        { pub: DEF, sub: Q('BEST_EFFORT', 'VOLATILE', 'KEEP_LAST 10'), vd: VD('제공 RELIABLE ≥ 요청 BEST_EFFORT → 연결됨', 'green'), link: true },
        { pub: DEF, sub: Q('BEST_EFFORT', 'VOLATILE', 'KEEP_LAST 10'), vd: VD('이 구독자에게는 유실돼도 재전송하지 않음', 'yellow'), link: true, flow: true }
    ]);
    ann(MISMATCH_STEPS, [
        { pub: null, sub: null, vd: VD('요청이 제공보다 강하면 연결 안 됨', 'yellow') },
        { pub: SENSOR, sub: null, vd: VD('센서용 프로파일로 발행하는 예', 'yellow') },
        { pub: SENSOR, sub: DEF, vd: VD('제공 BEST_EFFORT < 요청 RELIABLE → 연결 안 됨', 'red'), link: false },
        { pub: SENSOR, sub: DEF, vd: VD('경고 로그만 남고 데이터는 오지 않음', 'red'), link: false, warn: 'WARN: incompatible QoS … RELIABILITY' },
        { pub: SENSOR, sub: Q('BEST_EFFORT', 'VOLATILE', 'KEEP_LAST 10'), vd: VD('요청을 BEST_EFFORT로 낮추면 연결됨', 'green'), link: true },
        { pub: DEF, sub: Q('RELIABLE', 'TRANSIENT_LOCAL', 'KEEP_LAST 10'), vd: VD('제공 VOLATILE < 요청 TRANSIENT_LOCAL → 연결 안 됨', 'red'), link: false }
    ]);
    ann(LATE_STEPS, [
        { pub: null, sub: null, vd: VD('늦게 시작한 구독자는 지난 메시지를 받을까?', 'yellow'), mem: [], lateSub: false },
        { pub: MAPQ, sub: null, vd: VD('최근 1개를 발행자가 보관하겠다는 약속', 'yellow'), mem: [], lateSub: false },
        { pub: MAPQ, sub: null, vd: VD('구독자는 아직 없음 — 발행자가 map #1을 보관', 'green'), mem: ['map #1'], lateSub: false, put: true },
        { pub: MAPQ, sub: DEF, vd: VD('연결은 되지만 지난 map #1은 받지 못함', 'red'), link: true, mem: ['map #1'], lateSub: true, rcv: [], bad: true },
        { pub: MAPQ, sub: Q('RELIABLE', 'TRANSIENT_LOCAL', 'KEEP_LAST 1'), vd: VD('연결되는 순간 보관된 map #1을 전달', 'green'), link: true, mem: ['map #1'], lateSub: true, rcv: ['map #1'], xfer: true },
        { pub: MAPQ, sub: Q('RELIABLE', 'TRANSIENT_LOCAL', 'KEEP_LAST 1'), vd: VD('발행자가 종료되면 보관분도 사라짐 · 보관 개수 = depth', 'yellow'), link: true, mem: ['map #1'], lateSub: true, rcv: ['map #1'] }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'mismatch') return MISMATCH_STEPS;
        if (mode === 'late') return LATE_STEPS;
        return MATCH_STEPS;
    }
    function defaultLog() {
        if (mode === 'mismatch') return '센서용 발행자와 기본 구독자처럼 QoS가 맞지 않아 연결되지 않는 경우를 봅니다.';
        if (mode === 'late') return '내구성 설정에 따라 늦게 시작한 구독자가 지난 메시지를 받는지 가르는 과정을 봅니다.';
        return '발행자가 제공하고 구독자가 요청하는 QoS가 호환돼 연결되는 과정을 봅니다.';
    }
    var RANK = { 'BEST_EFFORT': 0, 'RELIABLE': 1, 'VOLATILE': 0, 'TRANSIENT_LOCAL': 1 };

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var gap = mob ? 44 : 78;
        var cardW = (w - gap) / 2;
        var memH = mode === 'late' ? 86 : 0;
        var vdH = 54;
        return { fs: fs, gap: gap, cardW: cardW, cardH: 188, memH: memH, vdH: vdH, total: 188 + 14 + memH + vdH + (mode === 'mismatch' ? 24 : 0) + 8 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 조각 ===================== */
    function pill(cx, cy, label, col, maxW, dim) {
        ctx.font = '700 11px "JetBrains Mono",monospace';
        var pw = Math.min(maxW, ctx.measureText(label).width + 20);
        rr(cx - pw / 2, cy - 12, pw, 24, 12, col + (dim ? '10' : '2a'), col + (dim ? '66' : 'ff'), 1.6);
        tx(label, cx, cy, 11, col + (dim ? '88' : 'ff'), 'center', true);
    }
    function strengthDots(cx, cy, rank, col) {
        circ(cx - 6, cy, 3.5, rank >= 0 ? col + 'ff' : 'none', col + 'ff', 1.2);
        circ(cx + 6, cy, 3.5, rank >= 1 ? col + 'ff' : 'none', col + 'ff', 1.2);
    }

    function drawCard(x, y, L, title, col, q, fs, hot) {
        rr(x, y, L.cardW, L.cardH, 10, colorOf(col) + '0f', colorOf(col) + (q ? 'cc' : '66'), q ? 1.8 : 1.2);
        tx(title, x + L.cardW / 2, y + 16, fs, colorOf(col) + 'ff', 'center', true);
        var rows = [['reliability', q && q.r], ['durability', q && q.d], ['history', q && q.h]];
        rows.forEach(function (r, i) {
            var ry = y + 34 + i * 50;
            tx(r[0], x + 10, ry + 6, fs - 2, P.sub + 'ff', 'left', true);
            if (r[1]) pill(x + L.cardW / 2, ry + 28, r[1], colorOf(col), L.cardW - 8, false);
            else tx('—', x + L.cardW / 2, ry + 28, fs, P.muted + 'ff', 'center', false);
        });
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { pub: null, sub: null, vd: null, mem: [] };
        var e = clamp01(t);
        var px = x0, sx = x0 + L.cardW + L.gap;
        drawCard(px, top, L, '발행자 — 제공', 'orange', s.pub, fs);
        drawCard(sx, top, L, '구독자 — 요청', 'teal', s.sub, fs);

        /* 행별 비교 기호 */
        var cmpX = x0 + L.cardW + L.gap / 2;
        for (var i = 0; i < 3; i++) {
            var ry = top + 34 + i * 50 + 28;
            if (!s.pub || !s.sub) continue;
            if (i === 2) { tx('–', cmpX, ry, fs + 2, P.muted + 'ff', 'center', false); continue; }
            var a = i === 0 ? RANK[s.pub.r] : RANK[s.pub.d];
            var b = i === 0 ? RANK[s.sub.r] : RANK[s.sub.d];
            var ok = a >= b;
            var c = ok ? P.green : P.red;
            var sym = ok ? (a > b ? '>' : '=') : '<';
            ctx.globalAlpha = clamp01(e * 2);
            circ(cmpX, ry, 14, c + '22', c + 'ff', 1.8);
            tx(ok ? '✓' : '✕', cmpX, ry, fs + 3, c + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (s.pub && s.sub && !mob) {
            tx('제공≥요청', cmpX, top + 18, 11, P.sub + 'ff', 'center', true);
        }

        /* 연결선 / 메시지 */
        var ly = top + L.cardH + 6;
        if (s.pub && s.sub) {
            var okLink = s.link !== false;
            var c2 = okLink ? P.green : P.red;
            ln(px + L.cardW / 2, ly, sx + L.cardW / 2, ly, c2 + (okLink ? 'ff' : '99'), okLink ? 3 : 2, okLink ? undefined : [6, 5]);
            if (!okLink) tx('✕', (px + sx + L.cardW) / 2, ly, fs + 6, P.red + 'ff', 'center', true);
            if (s.flow) {
                var fx = lerp(px + L.cardW / 2, sx + L.cardW / 2, e);
                circ(fx, ly, 7, P.yellow + 'ff', 'none');
            }
        }

        /* late: 발행자 보관 + 구독자 수신 */
        var cy = top + L.cardH + 14;
        if (L.memH) {
            var s2 = s;
            tx('발행자 메모리 (보관)', px + 2, cy + 8, fs - 1.5, P.sub + 'ff', 'left', true);
            var depth = 1;
            for (var m = 0; m < depth; m++) {
                var mx = px + 4 + m * 76;
                var item = s2.mem && s2.mem[m];
                var put = s2.put && item;
                ctx.globalAlpha = put ? e : 1;
                rr(mx, cy + 20, 70, 34, 7, item ? P.orange + '33' : 'none', item ? P.orange + 'ff' : P.muted + '99', 1.6);
                if (item) tx(item, mx + 35, cy + 37, fs - 0.5, P.orange + 'ff', 'center', true);
                else tx('비어 있음', mx + 35, cy + 37, fs - 1.5, P.sub + 'ff', 'center', false);
                ctx.globalAlpha = 1;
            }
            tx('구독자가 받은 것', sx + 2, cy + 8, fs - 1.5, P.sub + 'ff', 'left', true);
            var got = s2.rcv;
            var rxp = sx + 4;
            if (s2.lateSub) {
                var have = got && got.length;
                rr(rxp, cy + 20, 70, 34, 7, have ? P.teal + '33' : 'none', have ? P.teal + 'ff' : P.red + 'cc', 1.6);
                if (have) {
                    ctx.globalAlpha = s2.xfer ? clamp01((e - 0.4) / 0.6) : 1;
                    tx(got[0], rxp + 35, cy + 37, fs - 0.5, P.teal + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                } else {
                    tx('없음', rxp + 35, cy + 37, fs - 1.5, P.red + 'ff', 'center', true);
                }
            } else {
                tx('(구독자 없음)', rxp, cy + 37, fs - 1, P.muted + 'ff', 'left', false);
            }
            if (s2.xfer) {
                var ax = lerp(px + 76, sx - 4, e);
                circ(ax, cy + 37, 8, P.orange + 'ff', 'none');
                tx('map #1', ax, cy + 20, fs - 2, P.orange + 'ff', 'center', true);
            }
        }

        /* 판정 배너 */
        var by = top + L.cardH + 14 + L.memH;
        if (s.vd) {
            var vc = colorOf(s.vd.c);
            var vl = lines(s.vd.t, w - 28, fs);
            var bh = vl.length * (fs + 6) + 14;
            rr(x0, by, w, bh, 10, vc + '1c', vc + 'ff', 1.8);
            vl.forEach(function (l2, k) { tx(l2, x0 + w / 2, by + 7 + (fs + 6) / 2 + k * (fs + 6), fs, vc + 'ff', 'center', true); });
            if (s.warn) {
                lines(s.warn, w - 8, fs - 1).forEach(function (l3, k) { tx(l3, x0 + w / 2, by + bh + 14 + k * (fs + 3), fs - 1, P.yellow + 'ff', 'center', true); });
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
        speedBtns.forEach(function (b) { b.classList.remove('ddsqos-viz__speed-btn--active'); });
        btn.classList.add('ddsqos-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ddsqos-viz__mode-btn--active', d.key === m); });
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