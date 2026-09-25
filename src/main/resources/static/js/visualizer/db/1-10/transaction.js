/**
 * 트랜잭션 시각화
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
    var root    = el('div', 'transaction-viz');
    var toolbar = el('div', 'transaction-viz__toolbar');
    var tbLeft  = el('div', 'transaction-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'transaction-viz__title', 'TXN'));

    var modeWrap = el('div', 'transaction-viz__mode');
    var modeDefs = [
        { key: 'acid',     label: 'ACID' },
        { key: 'commit',   label: '커밋(성공)' },
        { key: 'rollback', label: '롤백(실패)' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'transaction-viz__mode-btn' + (i === 0 ? ' transaction-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'transaction-viz__speed');
    speedWrap.appendChild(el('span', 'transaction-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'transaction-viz__speed-btn' + (i === 0 ? ' transaction-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'transaction-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'transaction-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'transaction-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'transaction-viz__controls');
    var btnPlay  = el('button', 'transaction-viz__btn transaction-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'transaction-viz__btn', '▶| STEP');
    var btnReset = el('button', 'transaction-viz__btn', '↺ RESET');
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

    /* ===================== 기준 데이터 ===================== */
    var ACCOUNTS_BASE = [ { id: 1, name: '김민준', balance: 50000 }, { id: 2, name: '이서연', balance: 30000 } ];
    var TRANSFER_AMOUNT = 20000;

    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function sumBalances(rows) { return rows.reduce(function (s, r) { return s + r.balance; }, 0); }
    function fmt(n) { return n.toLocaleString('ko-KR'); }

    /* ===================== 시나리오 계산 (실제 실행 — 하드코딩 아님) ===================== */
    function buildCommitScenario() {
        var before = clone(ACCOUNTS_BASE);
        var after1 = clone(before); after1[0].balance -= TRANSFER_AMOUNT;
        var after2 = clone(after1); after2[1].balance += TRANSFER_AMOUNT;
        return { before: before, after1: after1, after2: after2, sumBefore: sumBalances(before), sumAfter: sumBalances(after2) };
    }
    function buildRollbackScenario() {
        var before = clone(ACCOUNTS_BASE);
        var after1 = clone(before); after1[0].balance -= TRANSFER_AMOUNT;
        var reverted = clone(before);
        return { before: before, after1: after1, reverted: reverted, sumBefore: sumBalances(before), sumAfterRevert: sumBalances(reverted) };
    }
    var COMMIT_SC = buildCommitScenario();
    var ROLLBACK_SC = buildRollbackScenario();

    /* ===================== 스텝 빌더 ===================== */
    var ACID_LETTERS = [
        { l: 'A', name: '원자성 (Atomicity)', desc: '트랜잭션 안의 모든 문장은 전부 성공하거나 전부 실패합니다. 하나라도 실패하면 이미 실행된 것도 전부 되돌립니다(ROLLBACK).' },
        { l: 'C', name: '일관성 (Consistency)', desc: '트랜잭션 전후로 데이터는 항상 규칙을 만족하는 상태여야 합니다. 예: 두 계좌의 잔액 합은 송금 전후로 같아야 합니다.' },
        { l: 'I', name: '고립성 (Isolation)', desc: '여러 트랜잭션이 동시에 실행되어도, 서로 다른 트랜잭션의 커밋되지 않은 중간 상태는 보이지 않습니다.' },
        { l: 'D', name: '지속성 (Durability)', desc: 'COMMIT이 완료되면, 이후 시스템이 다운되더라도 그 결과는 디스크에 남아 사라지지 않습니다.' }
    ];

    function buildAcidSteps() {
        var steps = [];
        steps.push({ kind: 'intro', letter: -1,
            log: '트랜잭션은 여러 SQL 문을 하나의 작업 단위로 묶습니다. 이 단위가 지켜야 할 4가지 성질을 ACID라고 부릅니다.' });
        ACID_LETTERS.forEach(function (a, i) {
            steps.push({ kind: 'letter', letter: i, log: a.name + ' — ' + a.desc });
        });
        steps.push({ kind: 'done', letter: -1,
            log: '정리 — A·C·I·D 네 글자를 합쳐 ACID라고 부릅니다. 다음 탭에서 실제 계좌 이체로 커밋/롤백을 확인해보세요.' });
        return steps;
    }

    function buildCommitSteps() {
        var sc = COMMIT_SC;
        var steps = [];
        steps.push({ kind: 'intro', stage: -1, balances: sc.before, failed: false,
            log: '김민준이 이서연에게 ' + fmt(TRANSFER_AMOUNT) + '원을 송금하는 트랜잭션을 실행합니다.' });
        steps.push({ kind: 'begin', stage: 0, balances: sc.before, failed: false,
            log: 'BEGIN — 트랜잭션 시작. 이 시점부터 COMMIT 전까지의 변경은 임시 상태입니다.' });
        steps.push({ kind: 'stmt1', stage: 1, balances: sc.after1, failed: false,
            log: 'UPDATE: 김민준 잔액 ' + fmt(sc.before[0].balance) + ' → ' + fmt(sc.after1[0].balance) + ' (임시 반영)' });
        steps.push({ kind: 'stmt2', stage: 2, balances: sc.after2, failed: false,
            log: 'UPDATE: 이서연 잔액 ' + fmt(sc.after1[1].balance) + ' → ' + fmt(sc.after2[1].balance) + ' (임시 반영)' });
        steps.push({ kind: 'commit', stage: 3, balances: sc.after2, failed: false,
            log: 'COMMIT — 두 변경 모두 성공했으므로 확정합니다. 이제 되돌릴 수 없습니다.' });
        steps.push({ kind: 'done', stage: 3, balances: sc.after2, failed: false,
            log: '정리 — 커밋 이후 잔액은 영구적으로 저장됩니다(지속성). 총 잔액 합계는 ' + fmt(sc.sumAfter) + '원으로 송금 전(' + fmt(sc.sumBefore) + '원)과 동일합니다(일관성).' });
        return steps;
    }

    function buildRollbackSteps() {
        var sc = ROLLBACK_SC;
        var steps = [];
        steps.push({ kind: 'intro', stage: -1, balances: sc.before, failed: false,
            log: '이번엔 두 번째 갱신에서 문제가 생기는 경우를 봅시다.' });
        steps.push({ kind: 'begin', stage: 0, balances: sc.before, failed: false,
            log: 'BEGIN — 트랜잭션 시작.' });
        steps.push({ kind: 'stmt1', stage: 1, balances: sc.after1, failed: false,
            log: 'UPDATE: 김민준 잔액 ' + fmt(sc.before[0].balance) + ' → ' + fmt(sc.after1[0].balance) + ' (임시 반영)' });
        steps.push({ kind: 'stmt2-fail', stage: 2, balances: sc.after1, failed: true,
            log: 'UPDATE 실패: 이서연의 계좌가 정지 상태라 입금할 수 없습니다.' });
        steps.push({ kind: 'rollback', stage: 3, balances: sc.reverted, failed: true,
            log: 'ROLLBACK — 이미 실행됐던 김민준의 변경도 전부 되돌립니다.' });
        steps.push({ kind: 'done', stage: 3, balances: sc.reverted, failed: true,
            log: '정리 — 두 번째 문장이 실패했으므로 첫 번째 문장까지 전부 취소됩니다(원자성). 두 계좌 잔액은 트랜잭션 시작 전(합계 ' + fmt(sc.sumAfterRevert) + '원)과 완전히 동일합니다.' });
        return steps;
    }

    var ACID_STEPS     = buildAcidSteps();
    var COMMIT_STEPS   = buildCommitSteps();
    var ROLLBACK_STEPS = buildRollbackSteps();

    /* ===================== 상태 ===================== */
    var mode    = 'acid';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'commit') return COMMIT_STEPS;
        if (mode === 'rollback') return ROLLBACK_STEPS;
        return ACID_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw, dash) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
        ctx.setLineDash([]);
    }
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function seg(x1, y1, x2, y2, col, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke();
    }
    function wrapText(str, maxW, sz) {
        ctx.font = '500 ' + sz + 'px "JetBrains Mono",monospace';
        var words = str.split(' ');
        var lines = []; var cur = '';
        words.forEach(function (w) {
            var test = cur ? cur + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
            else cur = test;
        });
        if (cur) lines.push(cur);
        return lines;
    }

    /* ===================== 계좌 테이블 ===================== */
    function drawAccountsTable(x0, y0, w, headerH, rowH, mob, balances) {
        var cols = ['id', 'name', 'balance'];
        var colW = { id: mob ? 40 : 52, name: mob ? 74 : 96 };
        colW.balance = w - colW.id - colW.name;
        var colX = {}; var acc = 0;
        cols.forEach(function (c) { colX[c] = acc; acc += colW[c]; });

        tx('ACCOUNTS', x0, y0 - (mob ? 10 : 12), mob ? 10.5 : 12, P.muted + 'aa', 'left', true);
        rr(x0, y0, w, headerH + balances.length * rowH, 6, 'none', P.muted + '55', 1.3);
        cols.forEach(function (c) {
            rr(x0 + colX[c], y0, colW[c], headerH, 0, P.muted + '12', 'none');
            tx(c, x0 + colX[c] + colW[c] / 2, y0 + headerH / 2, mob ? 9.5 : 10.5, P.text + 'cc', 'center', true);
        });
        seg(x0, y0 + headerH, x0 + w, y0 + headerH, P.muted + '55', 1.3);
        balances.forEach(function (row, ri) {
            var ry = y0 + headerH + ri * rowH;
            if (ri > 0) seg(x0, ry, x0 + w, ry, P.muted + '2a', 1);
            cols.forEach(function (c) {
                var cx = x0 + colX[c] + colW[c] / 2;
                var val = c === 'balance' ? fmt(row[c]) + '원' : String(row[c]);
                tx(val, cx, ry + rowH / 2, mob ? 10 : 11.5, P.text + 'dd', 'center', false);
            });
        });
        var vx = x0; cols.forEach(function (c) { if (vx > x0) seg(vx, y0, vx, y0 + headerH + balances.length * rowH, P.muted + '2a', 1); vx += colW[c]; });
        return { height: headerH + balances.length * rowH };
    }

    /* ===================== 트랜잭션 타임라인 ===================== */
    function timelineLabels() {
        if (mode === 'rollback') return ['BEGIN', 'UPDATE 김민준 (-' + fmt(TRANSFER_AMOUNT) + ')', 'UPDATE 이서연 (+' + fmt(TRANSFER_AMOUNT) + ')', 'ROLLBACK'];
        return ['BEGIN', 'UPDATE 김민준 (-' + fmt(TRANSFER_AMOUNT) + ')', 'UPDATE 이서연 (+' + fmt(TRANSFER_AMOUNT) + ')', 'COMMIT'];
    }

    function drawTimeline(x0, y0, w, rowH, mob, currentStage, failed) {
        var labels = timelineLabels();
        tx('트랜잭션 로그', x0, y0 - (mob ? 10 : 12), mob ? 10.5 : 12, P.muted + 'aa', 'left', true);
        labels.forEach(function (label, i) {
            var ry = y0 + i * (rowH + (mob ? 8 : 10));
            var status;
            if (i < currentStage) status = (failed && i === 2) ? 'failed' : 'done';
            else if (i === currentStage) status = failed && i === 2 ? 'failed' : (i === 3 ? (failed ? 'rollback' : 'commit') : 'active');
            else status = 'pending';

            var accent = P.muted;
            var icon = '○';
            if (status === 'done') { accent = P.green; icon = '✓'; }
            else if (status === 'active') { accent = P.orange; icon = '▶'; }
            else if (status === 'failed') { accent = P.orange; icon = '✕'; }
            else if (status === 'commit') { accent = P.green; icon = '✓'; }
            else if (status === 'rollback') { accent = P.orange; icon = '↺'; }

            rr(x0, ry, w, rowH, 6, status === 'pending' ? 'none' : accent + '14', accent + (status === 'pending' ? '55' : 'cc'), status === 'active' || status === 'commit' || status === 'rollback' ? 2 : 1.3);
            tx(icon, x0 + (mob ? 18 : 22), ry + rowH / 2, mob ? 12 : 14, status === 'pending' ? (P.text + '66') : (accent + 'ee'), 'center', true);
            tx(label, x0 + (mob ? 36 : 44), ry + rowH / 2, mob ? 10 : 11.5, status === 'pending' ? (P.text + '77') : (P.text + 'dd'), 'left', status === 'active');
            if (i > 0) seg(x0 + (mob ? 18 : 22), ry - (mob ? 8 : 10), x0 + (mob ? 18 : 22), ry, P.muted + '33', 1.3);
        });
        return { height: labels.length * (rowH + (mob ? 8 : 10)) - (mob ? 8 : 10) };
    }

    /* ===================== ACID 배지 ===================== */
    function drawAcidBadges(x0, y0, w, activeIdx, mob) {
        var gap = mob ? 10 : 16;
        var boxW = (w - gap * 3) / 4;
        var boxH = mob ? 52 : 64;
        ACID_LETTERS.forEach(function (a, i) {
            var bx = x0 + i * (boxW + gap);
            var isActive = activeIdx === i;
            var col = isActive ? P.orange : P.purple;
            rr(bx, y0, boxW, boxH, 8, isActive ? col + '20' : 'none', col + (isActive ? 'ee' : '66'), isActive ? 2.2 : 1.4);
            tx(a.l, bx + boxW / 2, y0 + boxH * 0.4, mob ? 20 : 24, col + 'ee', 'center', true);
            tx(a.name.split(' ')[0], bx + boxW / 2, y0 + boxH * 0.78, mob ? 10.5 : 12, col + 'cc', 'center', true);
        });
        return { height: boxH };
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return {
            padX: mob ? 16 : 26,
            titleGap: mob ? 18 : 22,
            headerH: mob ? 28 : 32,
            rowH: mob ? 34 : 40,
            sectionGap: mob ? 22 : 28
        };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 16 : 20, bottom = mob ? 18 : 22;
        if (mode === 'acid') {
            var badgeH = mob ? 52 : 64;
            var descLines = mob ? 3 : 2;
            var descH = descLines * (mob ? 16 : 18) + (mob ? 14 : 18);
            return top + G.titleGap + badgeH + G.sectionGap + descH + bottom;
        }
        var tableH = G.headerH + 2 * G.rowH;
        var timelineH = 4 * (G.rowH + (mob ? 8 : 10)) - (mob ? 8 : 10);
        return top + G.titleGap + tableH + G.sectionGap + G.titleGap + timelineH + bottom;
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var G = getGeom(mob);
        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 16 : 20) + extra / 2;
        var x0 = G.padX;
        var fullW = W - G.padX * 2;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'acid') {
            var badgeRes = drawAcidBadges(x0, top + G.titleGap, fullW, step.letter, mob);
            var descY = top + G.titleGap + badgeRes.height + G.sectionGap;
            if (step.letter >= 0) {
                var a = ACID_LETTERS[step.letter];
                var lines = wrapText(a.name + ' — ' + a.desc, fullW, mob ? 11 : 12.5);
                lines.forEach(function (line, i) {
                    tx(line, x0, descY + i * (mob ? 16 : 18), mob ? 11 : 12.5, P.orange + 'dd', 'left', false);
                });
            } else {
                tx('아래 STEP을 눌러 A → C → I → D 순서로 하나씩 살펴보세요.', x0, descY, mob ? 11 : 12.5, P.muted + 'aa', 'left', false);
            }
            return;
        }

        var tableRes = drawAccountsTable(x0, top + G.titleGap, fullW, G.headerH, G.rowH, mob, step.balances || ACCOUNTS_BASE);
        var timelineY = top + G.titleGap + tableRes.height + G.sectionGap + G.titleGap;
        drawTimeline(x0, timelineY, fullW, G.rowH, mob, step.stage, step.failed);
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() { return currentSteps()[0].log; }

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
        speedBtns.forEach(function (b) { b.classList.remove('transaction-viz__speed-btn--active'); });
        btn.classList.add('transaction-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('transaction-viz__mode-btn--active', d.key === m); });
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