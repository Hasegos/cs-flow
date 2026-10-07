/**
 * OLAP vs OLTP 시각화
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
    var root    = el('div', 'ol-viz');
    var toolbar = el('div', 'ol-viz__toolbar');
    var tbLeft  = el('div', 'ol-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ol-viz__title', 'OLAP'));

    var modeWrap = el('div', 'ol-viz__mode');
    var modeDefs = [
        { key: 'oltp', label: 'OLTP' },
        { key: 'olap', label: 'OLAP' },
        { key: 'store', label: '행 vs 컬럼 저장' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ol-viz__mode-btn' + (i === 0 ? ' ol-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ol-viz__speed');
    speedWrap.appendChild(el('span', 'ol-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ol-viz__speed-btn' + (i === 0 ? ' ol-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ol-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ol-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ol-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ol-viz__controls');
    var btnPlay  = el('button', 'ol-viz__btn ol-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ol-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ol-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 표와 저장 배치 ===================== */
    var NAMES = ['id', 'date', 'region', 'product', 'amount'];
    var ROWS = [
        [1, '10-01', 'KR', 'A', 100],
        [2, '10-01', 'US', 'B', 150],
        [3, '10-02', 'KR', 'A', 200],
        [4, '10-02', 'JP', 'C', 80],
        [5, '10-03', 'US', 'B', 300],
        [6, '10-03', 'KR', 'A', 50]
    ];
    function mkhl(fn) {
        return ROWS.map(function (r, ri) {
            return NAMES.map(function (n, ci) { return fn(ri, ci, r); }).join('');
        });
    }
    var NONE = mkhl(function () { return 'n'; });
    var NEED = mkhl(function (ri, ci) { return ci === 2 || ci === 4 ? 'a' : 'n'; });
    var NEEDB = mkhl(function (ri, ci) { return ci === 2 || ci === 4 ? 'a' : 'b'; });
    function rowhl(ri, code) {
        return mkhl(function (r, ci) { return r === ri ? code : 'n'; });
    }
    function ostep(hl, strips, count, cap, cap2, cap3, log) {
        return { hl: hl, strips: strips, count: count, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: OLTP ===================== */
    var OLTP_STEPS = [];
    (function () {
        OLTP_STEPS.push(ostep(NONE, [], '', 'OLTP: 짧고 빈번한 트랜잭션을 빠르게 처리', '주문, 결제처럼 몇 개 행만 읽고 쓴다', '많은 사용자가 동시에 접속', 'OLTP(Online Transaction Processing)는 주문 접수, 결제, 재고 갱신처럼 짧은 읽기와 쓰기 트랜잭션을 많은 사용자가 동시에 실행하는 업무입니다. 아래 표는 주문 6건이 든 sales 테이블이고 값은 설명을 위한 예시입니다.'));
        OLTP_STEPS.push(ostep(rowhl(5, 'i'), [], '건드린 행 1 / 6', 'INSERT: 주문 한 건을 넣는다', '행 하나를 쓰는 짧은 트랜잭션', '한 번에 한 행', '고객이 주문하면 sales에 행 하나를 INSERT하고 바로 커밋합니다. 표 전체가 아니라 행 하나만 다루는 짧은 트랜잭션입니다.'));
        OLTP_STEPS.push(ostep(rowhl(2, 'u'), [], '건드린 행 1 / 6', 'UPDATE: 주문 한 건의 값을 바꾼다', '조건에 맞는 행 하나만 수정', '짧게 끝나고 바로 커밋', '결제가 끝나면 해당 주문 행 하나를 UPDATE합니다. 조건에 맞는 행만 수정하고 짧게 끝나므로 같은 행을 바꾸려는 다른 요청이 기다리는 시간도 짧습니다.'));
        OLTP_STEPS.push(ostep(rowhl(1, 'a'), [], '건드린 행 1 / 6', 'SELECT: 주문 한 건을 조회한다', '기본 키 같은 인덱스로 행 하나를 찾음', '표 전체를 훑지 않음', '주문 번호로 조회할 때는 기본 키 인덱스로 행 하나를 바로 찾습니다. OLTP의 읽기는 이렇게 필요한 소수의 행에 접근하는 경우가 많습니다.'));
        OLTP_STEPS.push(ostep(NONE, [], '', 'OLTP: 행 단위로 짧게, 많이', '정규화된 스키마와 인덱스를 주로 사용', '일관성과 동시성이 중요', '정리 — OLTP는 짧은 읽기와 쓰기 트랜잭션을 많이 처리하는 업무용 시스템입니다. 행 단위 접근이 많으므로 정규화된 스키마와 인덱스를 쓰고, 데이터의 일관성과 동시 처리가 중요합니다.'));
    })();

    /* ===================== 데이터: OLAP ===================== */
    var OLAP_STEPS = [];
    var GRP = mkhl(function (ri, ci, r) {
        if (ci !== 2 && ci !== 4) return 'n';
        return r[2] === 'KR' ? 'a' : (r[2] === 'US' ? 'b' : 'p');
    });
    (function () {
        OLAP_STEPS.push(ostep(NONE, [], '', 'OLAP: 대량 데이터를 집계하고 분석', '"지난 기간 지역별 매출 합계" 같은 질문', '읽기 중심 · 쿼리 하나가 오래 걸릴 수 있음', 'OLAP(Online Analytical Processing)은 대량의 이력 데이터를 여러 기준으로 집계하고 분석하는 업무입니다. 같은 sales 표에서 지역별 매출 합계를 구하는 질문을 봅니다.'));
        OLAP_STEPS.push(ostep(NEED, [], '읽는 행 6 / 6 · 필요한 열 2 / 5', '집계 쿼리: 모든 행의 일부 열을 읽는다', 'region으로 묶어 amount를 합산', '표 전체를 훑는 읽기 중심 쿼리', 'SELECT region, SUM(amount) FROM sales GROUP BY region은 조건으로 행을 거르지 않고 모든 행을 훑습니다. 필요한 열은 region과 amount 두 개뿐입니다.'));
        OLAP_STEPS.push(ostep(GRP, [], '6행 → 결과 3행', '집계: 지역별로 묶어 합산', 'KR 350 · US 450 · JP 80', '많은 행이 적은 수의 요약 행이 됨', '지역별로 묶어 amount를 합하면 KR 350, US 450, JP 80이라는 3행의 요약이 나옵니다. 많은 행을 읽어 적은 수의 결과를 만드는 것이 분석 쿼리의 전형적인 모습입니다.'));
        OLAP_STEPS.push(ostep(NEED, [], '실제로는 훨씬 많은 행', '실제 분석은 훨씬 많은 행을 훑는다', '오랜 기간의 이력 데이터를 집계하기도 함', '쿼리 하나가 오래 걸릴 수 있음', '실제 분석에서는 여러 해에 걸친 이력처럼 훨씬 많은 행을 훑습니다. 그래서 쿼리 하나가 오래 걸릴 수 있고, 업무 처리와 같은 데이터베이스에서 돌리면 업무에 영향을 줄 수 있습니다.'));
        OLAP_STEPS.push(ostep(NONE, [], '', 'OLAP: 읽기 중심, 여러 행을 집계', '데이터 웨어하우스에서 주로 사용', '컬럼 지향 저장이 유리 → 다음 탭', '정리 — OLAP은 대량의 데이터를 집계하고 분석하는 읽기 중심의 쿼리를 다루며, 주로 데이터 웨어하우스에서 사용합니다. 필요한 열만 읽는 일이 많아 저장 방식도 영향을 주는데, 다음 탭에서 봅니다.'));
    })();

    /* ===================== 데이터: 행 vs 컬럼 저장 ===================== */
    var STORE_STEPS = [];
    (function () {
        STORE_STEPS.push(ostep(NONE, ['row', 'col'], '', '같은 표를 디스크에 어떻게 놓느냐', '행 지향 저장 vs 컬럼 지향 저장', '쿼리: region과 amount 열만 필요', '같은 표라도 디스크에 놓는 방식이 두 가지입니다. 행 지향 저장은 한 행의 값을 이어 붙여 저장하고, 컬럼 지향 저장은 한 열의 값을 모아 저장합니다. 아래 막대의 칸은 디스크에 놓인 순서입니다.'));
        STORE_STEPS.push(ostep(NEEDB, ['row'], '읽는 칸 30 · 필요한 칸 12', '행 지향: 필요 없는 열까지 함께 읽는다', '한 행의 값이 붙어 있어 행 전체를 읽음', '12칸만 필요한데 30칸을 읽음', '행 지향 저장에서 모든 행의 region과 amount를 읽으려면 필요 없는 id, date, product 값도 같은 행에 붙어 있어 함께 읽게 됩니다. 필요한 칸은 12개인데 읽는 칸은 30개입니다(주황색이 낭비되는 칸).'));
        STORE_STEPS.push(ostep(NEED, ['col'], '읽는 칸 12 · 필요한 칸 12', '컬럼 지향: 필요한 열만 읽는다', 'region 열과 amount 열의 칸만 읽음', '이 표에서는 읽는 칸이 30에서 12로 줄어듦', '컬럼 지향 저장에서는 열마다 값이 모여 있어 region 열과 amount 열만 읽으면 됩니다. 읽는 칸이 12개로 줄어 I/O가 줄어듭니다. 열이 많은 실제 표일수록 이 차이가 커집니다.'));
        STORE_STEPS.push(mk3());
        STORE_STEPS.push(ostep(rowhl(2, 'a'), ['row', 'col'], '행 지향: 연속 5칸 · 컬럼 지향: 5곳에 흩어짐', '행 하나를 다루는 OLTP는 행 지향이 유리', '컬럼 지향은 한 행을 모으려면 열마다 읽어야 함', '쓰기도 열마다 나눠 해야 해서 불리', '반대로 id가 3인 행 하나를 읽거나 쓰는 경우를 봅니다. 행 지향에서는 5칸이 연속으로 놓여 한 번에 읽고 쓸 수 있지만, 컬럼 지향에서는 5개의 열에 흩어져 있어 열마다 따로 접근해야 합니다.'));
        STORE_STEPS.push(ostep(NONE, [], '', '용도에 맞게 저장 방식을 고른다', '분석용 웨어하우스는 컬럼 지향을 쓰는 경우가 많음', '업무용 OLTP는 행 지향이 일반적', '정리 — 일부 열만 많은 행에 걸쳐 읽는 OLAP에는 컬럼 지향 저장이, 행 하나를 읽고 쓰는 OLTP에는 행 지향 저장이 어울립니다. 그래서 분석용 데이터 웨어하우스는 컬럼 지향 저장을 쓰는 경우가 많고, 업무용 데이터베이스는 행 지향이 일반적입니다.'));
    })();
    function mk3() {
        return ostep(mkhl(function (ri, ci) { return ci === 2 ? 'a' : 'n'; }), ['col'], '같은 열의 값이 모여 있음', '같은 열의 값이 모여 압축이 잘 된다', 'region 열: KR, US, KR, JP, US, KR', '적은 I/O로 더 많은 값을 읽음', '컬럼 지향 저장은 같은 열의 값이 이웃해 있어 같은 종류의 값이 반복되기 쉽고, 그래서 압축이 잘 됩니다. 압축되면 디스크에서 읽는 양이 더 줄어듭니다.');
    }

    /* ===================== 상태 ===================== */
    var mode    = 'oltp';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'olap') return OLAP_STEPS;
        if (mode === 'store') return STORE_STEPS;
        return OLTP_STEPS;
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

    /* ===================== 표와 저장 배치 ===================== */
    function drawGrid(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var ch = mob ? 19 : 22;
        var cw = w / 5;
        var y0 = top + 8;
        var CC = { a: P.teal, b: P.orange, i: P.green, u: P.purple, p: P.purple };
        var r;
        var c;
        for (c = 0; c < 5; c++) tx(NAMES[c], x0 + c * cw + cw / 2, y0 + ch / 2, fs - 1, P.sub + 'ff', 'center', true);
        for (r = 0; r < 6; r++) {
            for (c = 0; c < 5; c++) {
                var code = s.hl[r].charAt(c);
                var col = CC[code];
                var cx = x0 + c * cw;
                var cy = y0 + ch * (r + 1);
                if (col) rr(cx + 1, cy + 1, cw - 2, ch - 2, 3, col + '44', col + 'ff', 1.4);
                else rr(cx + 1, cy + 1, cw - 2, ch - 2, 3, 'none', P.sub + '44', 1);
                tx(String(ROWS[r][c]), cx + cw / 2, cy + ch / 2, fs - 0.5, col ? P.text + 'ff' : P.sub + 'ff', 'center', !!col);
            }
        }
        var gb = y0 + ch * 7;
        var k;
        for (k = 0; k < s.strips.length; k++) {
            var lay = s.strips[k];
            var gs = lay === 'row' ? 5 : 6;
            var nb = 30 / gs - 1;
            var inner = 29 - nb;
            var scw = (w - inner - nb * 4) / 30;
            var sy = gb + 28 + k * 40;
            var xx = x0;
            tx(lay === 'row' ? '행 지향 저장 (디스크에 놓인 순서)' : '컬럼 지향 저장 (디스크에 놓인 순서)', x0, sy - 12, fs - 1, P.sub + 'ff', 'left', true);
            var i;
            for (i = 0; i < 30; i++) {
                var rr2 = lay === 'row' ? Math.floor(i / 5) : i % 6;
                var cc2 = lay === 'row' ? i % 5 : Math.floor(i / 6);
                var cd = s.hl[rr2].charAt(cc2);
                var cl = CC[cd];
                rr(xx, sy, scw, 16, 2, cl ? cl + '88' : 'none', cl ? cl + 'ff' : P.sub + '66', 1);
                xx += scw + (((i + 1) % gs === 0) ? 4 : 1);
            }
        }
        var yb = gb + 14 + s.strips.length * 40;
        if (s.count) tx(s.count, x0 + w / 2, yb + 6, fs, P.orange + 'ff', 'center', true);
        drawCaps(s, x0, w, yb + (s.count ? 34 : 10), fs);
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
        drawGrid(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 OLTP와 OLAP의 차이를 확인하세요.';
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
        neededH = mode === 'store' ? (mob ? 360 : 370) : (mob ? 290 : 300);
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
        if (mode === 'olap') return '대량의 데이터를 집계하는 OLAP의 쿼리를 봅니다.';
        if (mode === 'store') return '행 지향 저장과 컬럼 지향 저장이 읽는 양이 어떻게 다른지 봅니다.';
        return '행 하나를 짧게 읽고 쓰는 OLTP의 트랜잭션을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ol-viz__speed-btn--active'); });
        btn.classList.add('ol-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ol-viz__mode-btn--active', d.key === m); });
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