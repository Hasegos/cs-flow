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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 ===================== */
    var mode    = 'match';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;

    function currentSteps() {
        if (mode === 'mismatch') return MISMATCH_STEPS;
        if (mode === 'late') return LATE_STEPS;
        return MATCH_STEPS;
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
            { title: 'QoS 설정', rows: step ? step.msg : [], empty: step ? '(내용 없음)' : '(STEP 또는 PLAY로 시작하세요)' },
            { title: '발행자 쪽', rows: step ? step.cli : [], empty: '(없음)' },
            { title: '구독자 쪽', rows: step ? step.srv : [], empty: '(없음)' }
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
        var idxOf = { P: 0, M: 1, S: 2 };

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
        if (mode === 'mismatch') return '센서용 발행자와 기본 구독자처럼 QoS가 맞지 않아 연결되지 않는 경우를 봅니다.';
        if (mode === 'late') return '내구성 설정에 따라 늦게 시작한 구독자가 지난 메시지를 받는지 가르는 과정을 봅니다.';
        return '발행자가 제공하고 구독자가 요청하는 QoS가 호환돼 연결되는 과정을 봅니다.';
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