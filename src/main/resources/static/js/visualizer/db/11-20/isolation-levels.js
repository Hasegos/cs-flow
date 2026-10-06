/**
 * 트랜잭션 격리 수준 시각화
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
    var root    = el('div', 'il-viz');
    var toolbar = el('div', 'il-viz__toolbar');
    var tbLeft  = el('div', 'il-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'il-viz__title', 'ISOLATION LEVELS'));

    var modeWrap = el('div', 'il-viz__mode');
    var modeDefs = [
        { key: 'dirty', label: 'Dirty Read' },
        { key: 'nonrep', label: 'Non-repeatable Read' },
        { key: 'phantom', label: 'Phantom Read' },
        { key: 'levels', label: '격리 수준 표' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'il-viz__mode-btn' + (i === 0 ? ' il-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'il-viz__speed');
    speedWrap.appendChild(el('span', 'il-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'il-viz__speed-btn' + (i === 0 ? ' il-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'il-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'il-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'il-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'il-viz__controls');
    var btnPlay  = el('button', 'il-viz__btn il-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'il-viz__btn', '▶| STEP');
    var btnReset = el('button', 'il-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 격리 수준과 이상 현상 ===================== */
    var LEVELS = ['Read Uncommitted', 'Read Committed', 'Repeatable Read', 'Serializable'];
    var ANOM = ['Dirty', 'Non-rep.', 'Phantom'];
    var STD = [[1, 1, 1], [0, 1, 1], [0, 0, 1], [0, 0, 0]];

    /* ===================== 데이터: 이상 현상 시나리오 ===================== */
    function evt(lane, col, t, res, cap, cap2, cap3, log) {
        return { lane: lane, col: col, t: t, res: res, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    var SCEN = {
        dirty: {
            col: 0,
            title: 'Dirty Read: 커밋되지 않은 값을 읽음',
            intro: '계좌 잔액이 1000인 행이 있습니다. T2가 잔액을 500으로 바꾸고 아직 커밋하지 않은 상태에서 T1이 읽으면 어떻게 될까요? 격리 수준에 따라 결과가 다릅니다.',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '잔액 = 1000', '', 'T1이 트랜잭션을 시작합니다. 잔액은 1000입니다.'),
                evt(1, 1, 'UPDATE 500', null, 'T2: 잔액을 500으로 변경', '아직 COMMIT하지 않음', '', 'T2가 잔액을 500으로 바꿉니다. 아직 커밋하지 않았으므로 다른 트랜잭션에는 확정된 값이 아닙니다.'),
                evt(0, 2, 'SELECT', [['RU: 500', 'bad'], ['RC+: 1000', 'ok']], 'T1이 잔액을 읽음', 'RU: 500 (더러운 값) · RC 이상: 1000', 'RC+ = Read Committed 이상', 'Read Uncommitted에서는 T1이 T2의 미커밋 값 500을 읽을 수 있습니다. Read Committed 이상에서는 커밋된 값 1000만 읽습니다.'),
                evt(1, 3, 'ROLLBACK', null, 'T2가 ROLLBACK', '잔액은 다시 1000', 'T1이 읽은 500은 존재한 적 없는 값', 'T2가 롤백하면 500은 확정된 적이 없는 값이 됩니다. Read Uncommitted로 500을 읽었다면 T1은 잘못된 값을 근거로 일을 한 셈입니다. PostgreSQL은 Read Uncommitted를 Read Committed처럼 처리해 이 현상이 일어나지 않습니다.')
            ]
        },
        nonrep: {
            col: 1,
            title: 'Non-repeatable Read: 같은 행을 두 번 읽었는데 값이 다름',
            intro: '같은 트랜잭션 안에서 같은 행을 두 번 읽는 사이에 T2가 그 행을 수정하고 커밋합니다. 두 번째 읽기가 첫 번째와 같을까요?',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '잔액 = 1000', '', 'T1이 트랜잭션을 시작합니다.'),
                evt(0, 1, 'SELECT', [['1000', 'ok']], 'T1 첫 번째 읽기', '잔액 = 1000', '', 'T1이 처음 읽으면 1000입니다.'),
                evt(1, 2, 'UPDATE+COMMIT', null, 'T2: 500으로 변경하고 COMMIT', '확정된 값이 500으로 바뀜', '', 'T2가 잔액을 500으로 바꾸고 커밋합니다. 이제 확정된 값이 500입니다.'),
                evt(0, 3, 'SELECT', [['RC: 500', 'bad'], ['RR+: 1000', 'ok']], 'T1 두 번째 읽기', 'RC: 500 (값이 달라짐) · RR 이상: 1000', 'RR+ = Repeatable Read 이상', 'Read Committed는 문장마다 그 시점의 커밋된 값을 읽으므로 두 번째 읽기가 500입니다. Repeatable Read 이상은 트랜잭션 동안 같은 스냅샷을 유지해 두 번째도 1000입니다.')
            ]
        },
        phantom: {
            col: 2,
            title: 'Phantom Read: 같은 조건으로 조회했는데 행이 늘어남',
            intro: '같은 조건의 조회를 두 번 하는 사이에 T2가 조건에 맞는 행을 새로 추가하고 커밋합니다. 두 번째 조회 결과의 행 수가 같을까요?',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '금액 100 초과인 행 2개', '', 'T1이 트랜잭션을 시작합니다. 금액이 100을 넘는 행은 2개입니다.'),
                evt(0, 1, 'COUNT', [['2', 'ok']], 'T1 첫 번째 조회', '금액 > 100 인 행 수 = 2', '', 'T1이 조건에 맞는 행의 수를 세면 2입니다.'),
                evt(1, 2, 'INSERT+COMMIT', null, 'T2: 금액 200인 행 추가 후 COMMIT', '조건에 맞는 행이 3개로 늘어남', '', 'T2가 금액 200인 행을 추가하고 커밋합니다. 조건에 맞는 행이 3개가 됩니다.'),
                evt(0, 3, 'COUNT', [['RC: 3', 'bad'], ['PG RR+: 2', 'ok']], 'T1 두 번째 조회', 'RC: 3 (유령 행) · PostgreSQL RR 이상: 2', 'SQL 표준의 RR은 팬텀을 허용할 수 있음', 'Read Committed에서는 두 번째 조회가 3이라 새로 생긴 행(유령)이 보입니다. SQL 표준은 Repeatable Read에서도 팬텀을 허용하지만, PostgreSQL의 Repeatable Read는 스냅샷을 쓰므로 2로 유지됩니다. Serializable은 표준과 PostgreSQL 모두 막습니다.')
            ]
        }
    };
    var IL_STEPS = {};
    (function () {
        var key;
        var k;
        for (key in SCEN) {
            var sc = SCEN[key];
            var arr = [{ kind: 'tl', key: key, upto: 0, cap: sc.title, cap2: '아래 STEP으로 T1과 T2의 순서를 따라가세요', cap3: '', log: sc.intro }];
            for (k = 0; k < sc.ev.length; k++) {
                var e = sc.ev[k];
                arr.push({ kind: 'tl', key: key, upto: k + 1, cap: e.cap, cap2: e.cap2, cap3: e.cap3, log: e.log });
            }
            IL_STEPS[key] = arr;
        }
    })();
    var LV_STEPS = [
        { kind: 'lv', row: -1, cap: 'SQL 표준의 격리 수준 4단계', cap2: '높을수록 이상 현상을 더 막음', cap3: '표는 SQL 표준 기준, 빨강 = 발생 가능', log: '격리 수준은 동시에 실행되는 트랜잭션이 서로의 변경을 얼마나 볼 수 있는지를 정합니다. SQL 표준은 Dirty Read, Non-repeatable Read, Phantom Read 세 가지 이상 현상을 기준으로 네 단계를 정의합니다.' },
        { kind: 'lv', row: 0, cap: 'Read Uncommitted', cap2: '표준: 세 현상 모두 발생 가능', cap3: 'PostgreSQL은 Read Committed와 동일하게 동작', log: 'Read Uncommitted는 표준에서 미커밋 변경도 읽을 수 있는 가장 낮은 수준입니다. PostgreSQL은 이 수준을 요청해도 Read Committed처럼 동작하므로 Dirty Read가 일어나지 않습니다.' },
        { kind: 'lv', row: 1, cap: 'Read Committed', cap2: 'Dirty Read 방지 · 문장마다 새 스냅샷', cap3: 'PostgreSQL의 기본 격리 수준', log: 'Read Committed는 커밋된 데이터만 읽고, 각 문장이 실행되는 시점의 최신 커밋 상태를 봅니다. 그래서 같은 행을 두 번 읽으면 값이 달라질 수 있습니다. PostgreSQL의 기본 격리 수준입니다.' },
        { kind: 'lv', row: 2, cap: 'Repeatable Read', cap2: '트랜잭션 동안 같은 스냅샷', cap3: '표준: 팬텀 가능 · PostgreSQL: 팬텀도 방지', log: 'Repeatable Read는 트랜잭션 동안 같은 스냅샷을 보므로 같은 행을 다시 읽어도 값이 같습니다. SQL 표준은 팬텀을 허용하지만 PostgreSQL의 구현은 팬텀도 막습니다. 다른 트랜잭션과 충돌하는 수정은 직렬화 실패로 중단될 수 있어 재시도가 필요합니다.' },
        { kind: 'lv', row: 3, cap: 'Serializable', cap2: '세 현상 모두 방지', cap3: '직렬화 실패 시 재시도 필요', log: 'Serializable은 트랜잭션들이 한 번에 하나씩 순서대로 실행된 것과 같은 결과를 보장하는 가장 높은 수준입니다. 대신 충돌이 감지되면 트랜잭션이 직렬화 실패로 중단될 수 있어 애플리케이션이 재시도해야 합니다.' },
        { kind: 'lv', row: -1, cap: '수준을 올릴수록 안전하지만', cap2: '충돌과 재시도 비용이 늘 수 있음', cap3: '업무에 필요한 만큼만 선택', log: '정리 — 높은 격리 수준은 이상 현상을 더 막는 대신 충돌 처리 비용(대기, 직렬화 실패와 재시도)이 늘 수 있습니다. 업무가 어떤 이상 현상을 견딜 수 있는지에 따라 수준을 고릅니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'dirty';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'levels') return LV_STEPS;
        return IL_STEPS[mode];
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

    /* ===================== 격리 수준과 이상 현상 표 ===================== */
    function drawMatrix(x0, y, w, fs, hlCol, hlRow) {
        var lw = w * 0.4;
        var cw = (w - lw) / 3;
        var rh = 24;
        var r;
        var c;
        for (c = 0; c < 3; c++) {
            tx(ANOM[c], x0 + lw + c * cw + cw / 2, y + 10, fs - 1.5, c === hlCol ? P.purple + 'ff' : P.sub + 'ff', 'center', true);
        }
        for (r = 0; r < 4; r++) {
            var ry = y + 22 + r * rh;
            if (r === hlRow) rr(x0, ry, w, rh - 2, 4, P.purple + '22', P.purple + 'ff', 2);
            tx(LEVELS[r], x0 + 6, ry + rh / 2 - 1, fs - 1.5, r === hlRow ? P.text + 'ff' : P.sub + 'ff', 'left', r === hlRow);
            for (c = 0; c < 3; c++) {
                var can = STD[r][c] === 1;
                if (c === hlCol) rr(x0 + lw + c * cw + 2, ry, cw - 4, rh - 2, 3, 'none', P.purple + '88', 1.4);
                tx(can ? '발생' : '방지', x0 + lw + c * cw + cw / 2, ry + rh / 2 - 1, fs - 1.5, can ? P.red + 'ff' : P.teal + 'ff', 'center', true);
            }
        }
    }

    /* ===================== 타임라인: T1과 T2 ===================== */
    function drawTimeline(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var sc = SCEN[s.key];
        var colW = w / 4;
        var laneH = mob ? 68 : 74;
        var k;
        var lane;
        var names = ['T1 (읽는 쪽)', 'T2 (쓰는 쪽)'];
        for (lane = 0; lane < 2; lane++) {
            var ly = top + lane * laneH;
            tx(names[lane], x0 + 2, ly + 6, fs - 1, P.sub + 'ff', 'left', true);
            ctx.beginPath();
            ctx.moveTo(x0, ly + 18 + 14);
            ctx.lineTo(x0 + w, ly + 18 + 14);
            ctx.strokeStyle = P.sub + '33';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        for (k = 0; k < s.upto; k++) {
            var e = sc.ev[k];
            var cur = k === s.upto - 1;
            var bx = x0 + e.col * colW + 3;
            var by = top + e.lane * laneH + 18;
            var col = e.lane === 0 ? P.teal : P.orange;
            rr(bx, by, colW - 6, 28, 4, col + (cur ? '55' : '22'), col + 'ff', cur ? 2.6 : 1.4);
            tx(e.t, bx + (colW - 6) / 2, by + 14, fs - 1.5, P.text + 'ff', 'center', true);
            if (e.res) {
                e.res.forEach(function (r, ri) {
                    tx(r[0], bx + (colW - 6) / 2, by + 28 + 11 + ri * 13, fs - 1.5, r[1] === 'bad' ? P.red + 'ff' : P.green + 'ff', 'center', true);
                });
            }
        }
        var my = top + 2 * laneH + 4;
        drawMatrix(x0, my, w, fs, sc.col, -1);
        tx('표는 SQL 표준 기준 (PostgreSQL은 다름)', x0 + w / 2, my + 22 + 4 * 24 + 12, fs - 1.5, P.sub + 'ff', 'center', false);
        drawCaps(s, x0, w, my + 22 + 4 * 24 + 38, fs);
    }

    /* ===================== 격리 수준 표 ===================== */
    function drawLevels(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        drawMatrix(x0, top, w, fs + 1, -1, s.row);
        tx('표는 SQL 표준 기준 · 빨강 = 발생 가능', x0 + w / 2, top + 22 + 4 * 24 + 10, fs - 1.5, P.sub + 'ff', 'center', false);
        drawCaps(s, x0, w, top + 22 + 4 * 24 + 36, fs);
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
        if (dsStep.kind === 'lv') drawLevels(padX, top, fullW, mob, dsStep);
        else drawTimeline(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 격리 수준과 이상 현상을 확인하세요.';
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
        neededH = mob ? 400 : 420;
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
        if (mode === 'nonrep') return '같은 행을 두 번 읽는 사이 다른 트랜잭션이 커밋하면 어떻게 되는지 봅니다.';
        if (mode === 'phantom') return '같은 조건으로 두 번 조회하는 사이 새 행이 커밋되면 어떻게 되는지 봅니다.';
        if (mode === 'levels') return 'SQL 표준의 격리 수준 4단계와 PostgreSQL의 동작을 비교합니다.';
        return '다른 트랜잭션이 아직 커밋하지 않은 값을 읽으면 어떻게 되는지 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('il-viz__speed-btn--active'); });
        btn.classList.add('il-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('il-viz__mode-btn--active', d.key === m); });
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