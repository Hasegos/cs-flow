/**
 * 저장 프로시저 / 트리거 시각화
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
    var root    = el('div', 'sp-viz');
    var toolbar = el('div', 'sp-viz__toolbar');
    var tbLeft  = el('div', 'sp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sp-viz__title', 'Procedure'));

    var modeWrap = el('div', 'sp-viz__mode');
    var modeDefs = [
        { key: 'proc', label: '저장 프로시저' },
        { key: 'trig', label: '트리거' },
        { key: 'risk', label: '트리거의 부작용' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sp-viz__mode-btn' + (i === 0 ? ' sp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sp-viz__speed');
    speedWrap.appendChild(el('span', 'sp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'sp-viz__speed-btn' + (i === 0 ? ' sp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sp-viz__controls');
    var btnPlay  = el('button', 'sp-viz__btn sp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sp-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 앱과 DB의 메시지 ===================== */
    function sstep(msgs, chips, count, cap, cap2, cap3, log) {
        return { msgs: msgs, chips: chips, count: count, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function mg(label) {
        return { l: label };
    }
    function cp(text, kind) {
        return { t: text, k: kind };
    }

    /* ===================== 데이터: 저장 프로시저 ===================== */
    var PROC_STEPS = [];
    (function () {
        PROC_STEPS.push(sstep([], [], '', '저장 프로시저: DB에 저장해 두고 호출하는 SQL 묶음', '예: 이체 = 잔액 조회 + 출금 + 입금', '앱이 하나씩 보낼까, 한 번에 호출할까', '저장 프로시저는 여러 SQL 문과 제어 흐름을 데이터베이스에 저장해 두고 이름으로 호출해 실행하는 기능입니다. 여기서는 A 계좌에서 B 계좌로 100을 옮기는 이체를 예로 듭니다. 잔액 조회 1번과 수정 2번이 필요하고, 트랜잭션 제어문은 생략했습니다.'));
        PROC_STEPS.push(sstep([mg('SELECT balance'), mg('UPDATE A -100'), mg('UPDATE B +100')], [], '네트워크 왕복 3번', '프로시저 없이: 문장마다 왕복', '앱이 쿼리를 하나씩 보내고 결과를 받음', '로직은 앱 코드에 있음', '프로시저가 없으면 앱이 SELECT와 UPDATE 2개를 하나씩 보내고 매번 응답을 기다립니다. 문장이 3개이므로 네트워크 왕복이 3번 일어나고, 잔액이 충분한지 판단하는 로직은 앱 코드에 있습니다.'));
        PROC_STEPS.push(sstep([mg('CALL transfer()')], [cp('SELECT balance', 'sql'), cp('UPDATE A -100', 'sql'), cp('UPDATE B +100', 'sql')], '네트워크 왕복 1번', '프로시저: 한 번 호출하면 DB 안에서 실행', '조회와 두 번의 수정이 DB 안에서 처리됨', '왕복 3번이 1번으로 줄었다', 'CALL transfer()를 한 번 호출하면 데이터베이스가 저장된 프로시저의 SQL을 차례로 실행하고 결과를 돌려줍니다. 문장 사이를 앱과 주고받지 않으므로 네트워크 왕복이 3번에서 1번으로 줄어듭니다.'));
        PROC_STEPS.push(sstep([mg('CALL transfer()')], [cp('SELECT balance', 'sql'), cp('IF 잔액 < 100 중단', 'ctl'), cp('UPDATE A -100', 'sql'), cp('UPDATE B +100', 'sql')], '네트워크 왕복 1번', '조건 분기와 제어 흐름도 DB 안에서', '잔액이 부족하면 프로시저가 오류로 중단', '로직이 DB에 모임', '프로시저에는 SQL뿐 아니라 IF 같은 제어 흐름도 쓸 수 있습니다. 잔액이 부족하면 프로시저가 오류를 내고 중단하는 로직까지 DB 안에 두므로, 이체 규칙이 한곳에 모입니다.'));
        PROC_STEPS.push(sstep([mg('CALL transfer()')], [cp('SELECT balance', 'sql'), cp('IF 잔액 < 100 중단', 'ctl'), cp('UPDATE A -100', 'sql'), cp('UPDATE B +100', 'sql')], '왕복 3번 → 1번', '프로시저: 왕복 감소, 로직을 DB에 모음', '대신 프로시저 문법은 DB마다 달라 이식이 어려움', '언어와 문법은 DB마다 다름', '정리 — 저장 프로시저는 네트워크 왕복을 줄이고 업무 로직을 DB에 모아 둘 수 있습니다. 대신 프로시저 언어와 문법이 DB마다 달라 다른 DB로 옮기기 어렵습니다.'));
    })();

    /* ===================== 데이터: 트리거 ===================== */
    var TRIG_STEPS = [];
    (function () {
        TRIG_STEPS.push(sstep([], [], '', '트리거: 이벤트가 나면 자동으로 실행되는 DB 객체', 'INSERT, UPDATE, DELETE에 연결', '호출하지 않아도 실행됨', '트리거는 지정한 테이블에서 INSERT, UPDATE, DELETE 같은 이벤트가 일어나면 자동으로 실행되는 코드입니다. 여기서는 account의 balance가 바뀔 때 변경 이력을 audit_log에 남기는 트리거를 예로 듭니다.'));
        TRIG_STEPS.push(sstep([mg('UPDATE account')], [cp('account 변경', 'sql')], '앱이 보낸 쿼리 1개', '앱은 UPDATE 하나만 보낸다', 'account의 balance가 1000에서 900으로', '트리거는 아직 안 보임', '앱이 UPDATE 하나를 보내 account의 balance를 1000에서 900으로 바꿉니다. 앱 코드에는 이 쿼리만 보입니다.'));
        TRIG_STEPS.push(sstep([mg('UPDATE account')], [cp('account 변경', 'sql'), cp('trigger 실행', 'trig'), cp('audit_log INSERT', 'trig')], '앱이 보낸 쿼리 1개', '이벤트가 나자 트리거가 자동 실행된다', 'AFTER UPDATE 트리거가 변경 이력을 기록', '앱은 이 작업을 호출한 적이 없음', 'UPDATE라는 이벤트가 일어나자 account에 연결된 AFTER UPDATE 트리거가 데이터베이스에서 자동으로 실행되어 audit_log에 이력 한 행을 넣습니다. 앱은 audit_log를 건드리는 코드를 쓰지 않았습니다.'));
        TRIG_STEPS.push(sstep([mg('UPDATE account')], [cp('account 변경', 'sql'), cp('trigger 실행', 'trig'), cp('OLD 1000 → NEW 900', 'ctl'), cp('audit_log INSERT', 'trig')], '앱이 보낸 쿼리 1개', '트리거는 변경 전후 값을 볼 수 있다', 'OLD = 변경 전 행, NEW = 변경 후 행', '이력 기록과 값 검증에 사용', 'PostgreSQL의 행 단위 트리거 함수는 UPDATE에서 변경 전 행(OLD)과 변경 후 행(NEW)을 읽을 수 있습니다. 그래서 어떤 값이 어떻게 바뀌었는지 이력으로 남기거나, 새 값이 규칙에 맞는지 검증하는 데 씁니다.'));
        TRIG_STEPS.push(sstep([mg('UPDATE account')], [cp('account 변경', 'sql'), cp('trigger 실행', 'trig'), cp('OLD 1000 → NEW 900', 'ctl'), cp('audit_log INSERT', 'trig')], '쿼리 1개 → 쓰기 2번', '트리거: 이벤트에 자동으로 반응', '이력 기록, 값 검증, 파생 값 갱신에 사용', '앱 코드에서는 보이지 않는 동작', '정리 — 트리거는 데이터 변경에 자동으로 반응해 이력 기록, 값 검증, 파생 값 갱신 같은 일을 합니다. 지정한 이벤트마다 자동으로 실행되므로 규칙이 빠질 가능성이 줄지만, 앱 코드만 봐서는 보이지 않는 동작이라는 점이 다음 탭의 문제로 이어집니다.'));
    })();

    /* ===================== 데이터: 트리거의 부작용 ===================== */
    var RISK_STEPS = [];
    (function () {
        RISK_STEPS.push(sstep([], [], '', '트리거를 남용하면', '쿼리 하나가 눈에 안 보이는 작업을 부른다', '추적과 쓰기 성능이 문제', '트리거가 늘어나면 쿼리 하나가 여러 숨은 작업을 일으킬 수 있습니다. 주문 INSERT 하나에 트리거가 붙을 때 어떤 일이 벌어지는지 봅니다.'));
        RISK_STEPS.push(sstep([mg('INSERT orders')], [cp('orders INSERT', 'sql')], '앱이 보낸 쿼리 1개 · 쓰기 1번', '앱이 주문 한 건을 넣는다', '여기까지는 코드에 보이는 그대로', '', '앱이 orders에 주문 한 건을 INSERT합니다. 앱 코드에 보이는 작업은 이 쿼리 하나입니다.'));
        RISK_STEPS.push(sstep([mg('INSERT orders')], [cp('orders INSERT', 'sql'), cp('→ stock UPDATE', 'hid')], '앱이 보낸 쿼리 1개 · 쓰기 2번', '트리거가 재고를 줄인다', '앱 코드에는 없는 쓰기', '', '첫 번째 트리거가 재고 테이블을 UPDATE합니다. 앱 코드에는 없는 쓰기가 하나 생겼습니다.'));
        RISK_STEPS.push(sstep([mg('INSERT orders')], [cp('orders INSERT', 'sql'), cp('→ stock UPDATE', 'hid'), cp('→ audit INSERT', 'hid')], '앱이 보낸 쿼리 1개 · 쓰기 3번', '다른 트리거가 이력을 남긴다', '숨은 쓰기가 늘어남', '', '또 다른 트리거가 감사 이력 테이블에 행을 INSERT합니다. 트리거가 일으킨 변경이 다시 다른 트리거를 실행할 수도 있어 연쇄가 생깁니다.'));
        RISK_STEPS.push(sstep([mg('INSERT orders')], [cp('orders INSERT', 'sql'), cp('→ stock UPDATE', 'hid'), cp('→ audit INSERT', 'hid'), cp('→ summary UPDATE', 'hid')], '앱이 보낸 쿼리 1개 · 쓰기 4번', '요약 테이블까지 갱신된다', '쿼리 1개가 쓰기 4번이 됨', '', '세 번째 트리거가 요약 테이블을 UPDATE합니다. 앱이 보낸 쿼리는 1개인데 데이터베이스는 쓰기를 4번 하게 되어 INSERT의 지연이 길어집니다.'));
        RISK_STEPS.push(sstep([mg('INSERT orders')], [cp('orders INSERT', 'sql'), cp('→ stock UPDATE', 'hid'), cp('→ audit INSERT', 'hid'), cp('→ summary UPDATE', 'hid')], '쿼리 1개 → 쓰기 4번', '보이지 않는 동작이 쌓인다', '앱 로그에는 INSERT 하나만 보임', '쓰기 지연과 디버깅 난이도 증가', '정리 — 트리거를 남용하면 코드에서 보이지 않는 동작이 쌓여 문제가 생겼을 때 원인을 추적하기 어렵고, 데이터를 바꿀 때마다 추가 작업이 들어가 쓰기 성능이 떨어질 수 있습니다. 꼭 DB에서 보장해야 하는 규칙에만 쓰고 나머지는 명시적인 코드로 두는 편이 낫습니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'proc';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'trig') return TRIG_STEPS;
        if (mode === 'risk') return RISK_STEPS;
        return PROC_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 캡션 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 앱과 DB ===================== */
    function drawFlow(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var aw = mob ? 58 : 90;
        var dw = mob ? 150 : 230;
        var H = 176;
        var y0 = top + 8;
        var dx = x0 + w - dw;
        var k;
        var CC = { sql: P.teal, ctl: P.purple, trig: P.orange, hid: P.red };
        rr(x0, y0, aw, H, 8, P.purple + '11', P.purple + 'ff', 1.6);
        tx('앱', x0 + aw / 2, y0 + 14, fs, P.text + 'ff', 'center', true);
        rr(dx, y0, dw, H, 8, P.teal + '11', P.teal + 'ff', 1.6);
        tx('DB 서버', dx + dw / 2, y0 + 14, fs, P.text + 'ff', 'center', true);
        for (k = 0; k < s.msgs.length; k++) {
            var my = y0 + 52 + k * 40;
            var ax0 = x0 + aw + 4;
            var ax1 = dx - 4;
            ctx.beginPath();
            ctx.moveTo(ax0, my);
            ctx.lineTo(ax1, my);
            ctx.lineTo(ax1 - 6, my - 4);
            ctx.moveTo(ax1, my);
            ctx.lineTo(ax1 - 6, my + 4);
            ctx.strokeStyle = P.purple + 'ff';
            ctx.lineWidth = 2;
            ctx.stroke();
            tx(s.msgs[k].l, (ax0 + ax1) / 2, my - 11, fs - 1, P.text + 'ff', 'center', true);
            ctx.beginPath();
            ctx.moveTo(ax1, my + 10);
            ctx.lineTo(ax0, my + 10);
            ctx.lineTo(ax0 + 6, my + 6);
            ctx.moveTo(ax0, my + 10);
            ctx.lineTo(ax0 + 6, my + 14);
            ctx.strokeStyle = P.green + 'ff';
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
        for (k = 0; k < s.chips.length; k++) {
            var cy = y0 + 32 + k * 34;
            var col = CC[s.chips[k].k];
            rr(dx + 8, cy, dw - 16, 28, 5, col + '33', col + 'ff', s.chips[k].k === 'hid' ? 2.2 : 1.6);
            tx(s.chips[k].t, dx + dw / 2, cy + 14, fs - 1, P.text + 'ff', 'center', true);
        }
        if (s.count) tx(s.count, x0 + w / 2, y0 + H + 18, fs, P.orange + 'ff', 'center', true);
        drawCaps(s, x0, w, y0 + H + (s.count ? 46 : 26), fs);
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

        var dsStep = step || currentSteps()[0];
        drawFlow(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 저장 프로시저와 트리거의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 350 : 360;
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
        if (mode === 'trig') return '데이터 변경에 자동으로 반응하는 트리거의 동작을 봅니다.';
        if (mode === 'risk') return '트리거가 쌓일 때 보이지 않는 쓰기가 늘어나는 과정을 봅니다.';
        return '여러 SQL을 한 번의 호출로 실행하는 저장 프로시저를 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('sp-viz__speed-btn--active'); });
        btn.classList.add('sp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sp-viz__mode-btn--active', d.key === m); });
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