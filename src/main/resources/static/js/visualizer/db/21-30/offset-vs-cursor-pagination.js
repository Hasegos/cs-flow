/**
 * 오프셋 vs 커서 페이지네이션 시각화
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
    var root    = el('div', 'page-viz');
    var toolbar = el('div', 'page-viz__toolbar');
    var tbLeft  = el('div', 'page-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'page-viz__title', '페이지네이션'));

    var modeWrap = el('div', 'page-viz__mode');
    var modeDefs = [
        { key: 'offset', label: 'OFFSET 페이지네이션' },
        { key: 'cursor', label: '커서 페이지네이션' },
        { key: 'change', label: '데이터가 바뀔 때' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'page-viz__mode-btn' + (i === 0 ? ' page-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'page-viz__speed');
    speedWrap.appendChild(el('span', 'page-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'page-viz__speed-btn' + (i === 0 ? ' page-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'page-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'page-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'page-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'page-viz__controls');
    var btnPlay  = el('button', 'page-viz__btn page-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'page-viz__btn', '▶| STEP');
    var btnReset = el('button', 'page-viz__btn', '↺ RESET');
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
        { id: 'C', name: '클라이언트', sub: '앱 · 브라우저', col: 'orange' },
        { id: 'A', name: 'API 서버', sub: '요청 처리', col: 'purple' },
        { id: 'D', name: 'DB', sub: 'post 테이블', col: 'teal' }
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

    var TABLE = S('post 테이블 100만 행(id 1부터 연속), 페이지 크기 10');

    var OFFSET_STEPS = [
        st('OFFSET 방식은 페이지 번호로 위치를 정합니다. page번째 페이지는 앞의 (page − 1) × 10개를 건너뛰고 10개를 가져옵니다. 번호를 눌러 원하는 페이지로 바로 갈 수 있어 흔히 씁니다. 페이지가 뒤로 갈수록 DB가 읽는 행이 어떻게 변하는지 봅니다.',
            { msg: [Y('OFFSET = (page − 1) × size')], cli: [TABLE], srv: [S('id 순서로 정렬해 조회')] }),
        st('클라이언트가 1페이지를 요청합니다. 서버는 페이지 번호를 OFFSET 값으로 바꿉니다. 1페이지는 건너뛸 행이 없습니다.',
            { from: 'C', to: 'A', kind: 'req', label: 'page=1', msg: [T('GET /posts?page=1&size=10'), Y('offset = 0')], hl: { C: ['1페이지 요청', 'orange'], A: ['offset 계산', 'purple'] }, cli: [TABLE], srv: [S('OFFSET 0')] }),
        st('DB가 정렬 순서의 처음부터 10행을 읽어 돌려줍니다. 읽은 행과 돌려준 행이 같습니다.',
            { from: 'A', to: 'D', kind: 'req', label: 'OFFSET 0', msg: [T('select * from post'), T('order by id'), T('limit 10 offset 0')], hl: { A: ['SQL 실행', 'purple'], D: ['10행 읽음', 'green'] }, cli: [G('읽은 행 10, 건너뛴 행 0')], srv: [G('돌려준 행 10')] }),
        st('2페이지를 요청합니다. offset은 10입니다.',
            { from: 'C', to: 'A', kind: 'req', label: 'page=2', msg: [T('GET /posts?page=2&size=10'), Y('offset = 10')], hl: { C: ['2페이지 요청', 'orange'], A: ['offset 계산', 'purple'] }, cli: [TABLE], srv: [S('OFFSET 10')] }),
        st('DB는 앞의 10행을 읽어 건너뛰고 그다음 10행을 돌려줍니다. 돌려주는 행은 10개이지만 실제로 거치는 행은 20개입니다.',
            { from: 'A', to: 'D', kind: 'req', label: 'OFFSET 10', msg: [T('select * from post'), T('order by id'), T('limit 10 offset 10')], hl: { A: ['SQL 실행', 'purple'], D: ['20행 거침', 'yellow'] }, cli: [Y('읽은 행 20, 건너뛴 행 10')], srv: [G('돌려준 행 10')] }),
        st('이제 마지막 페이지(100만 행 ÷ 10행)인 10만 번째 페이지를 요청한다고 해 봅시다. offset은 999,990입니다.',
            { from: 'C', to: 'A', kind: 'req', label: 'page=100000', msg: [T('GET /posts?page=100000&size=10'), Y('offset = 999,990')], hl: { C: ['10만 페이지 요청', 'orange'], A: ['offset 계산', 'purple'] }, cli: [TABLE], srv: [S('OFFSET 999990')] }),
        st('DB는 앞의 999,990행을 모두 거쳐 건너뛴 뒤에야 마지막 10행을 돌려줍니다. 돌려주는 것은 여전히 10행인데 거치는 행은 약 100만 행입니다.',
            { from: 'A', to: 'D', kind: 'err', label: 'OFFSET 999990', msg: [T('select * from post'), T('order by id'), T('limit 10 offset 999990')], hl: { A: ['SQL 실행', 'purple'], D: ['100만 행 거침', 'red'] }, cli: [R('읽은 행 약 1,000,000'), R('건너뛴 행 999,990')], srv: [G('돌려준 행 10')] }),
        st('OFFSET이 클수록 건너뛰는 행이 늘어 쿼리가 느려집니다. PostgreSQL 문서도 OFFSET으로 건너뛴 행은 서버 안에서 계산해야 하므로 큰 OFFSET은 비효율적일 수 있다고 설명합니다. 앞쪽 페이지는 빠르고 뒤쪽 페이지는 느린 이유입니다.',
            { label: '뒤 페이지일수록 느림', msg: [Y('거치는 행 = offset + size')], hl: { D: ['offset에 비례', 'red'] }, cli: [R('page 1: 10행 → page 100000: 약 100만 행')], srv: [R('돌려주는 행은 항상 10')] })
    ];

    var CURSOR_STEPS = [
        st('커서(keyset) 방식은 페이지 번호 대신 "마지막으로 본 행의 키"를 기억합니다. 다음 요청은 "그 키보다 뒤의 행 10개"를 달라는 조건이 되므로, DB가 앞의 행을 거치지 않고 인덱스로 그 위치부터 읽습니다.',
            { msg: [Y('where id > 마지막으로 본 id')], cli: [TABLE], srv: [S('id 인덱스를 사용')] }),
        st('첫 요청에는 커서가 없습니다. 처음부터 10개를 달라고 합니다.',
            { from: 'C', to: 'A', kind: 'req', label: '첫 페이지', msg: [T('GET /posts?size=10')], hl: { C: ['커서 없음', 'orange'], A: ['첫 페이지', 'purple'] }, cli: [TABLE], srv: [S('조건 없이 처음부터')] }),
        st('DB가 처음부터 10행을 읽습니다. 서버는 응답에 마지막 행의 id를 다음 커서로 함께 실어 보냅니다. 여기서는 마지막 행의 id가 10입니다.',
            { from: 'A', to: 'D', kind: 'req', label: '처음 10행', msg: [T('select * from post'), T('order by id limit 10'), G('응답에 next_cursor = 10 포함')], hl: { A: ['SQL 실행', 'purple'], D: ['10행 읽음', 'green'] }, cli: [G('읽은 행 10')], srv: [G('돌려준 행 10, 다음 커서 10')] }),
        st('클라이언트가 받은 커서를 다음 요청에 실어 보냅니다. "id가 10보다 큰 다음 10개"를 달라는 뜻입니다.',
            { from: 'C', to: 'A', kind: 'req', label: 'after=10', msg: [T('GET /posts?size=10&after=10')], hl: { C: ['커서 전달', 'orange'], A: ['조건 만들기', 'purple'] }, cli: [TABLE], srv: [S('where id > 10')] }),
        st('DB는 id 인덱스에서 10 다음 위치로 곧장 이동해 10행만 읽습니다. 앞의 행을 거치지 않습니다.',
            { from: 'A', to: 'D', kind: 'req', label: 'id > 10', msg: [T('select * from post'), T('where id > 10'), T('order by id limit 10')], hl: { A: ['SQL 실행', 'purple'], D: ['인덱스로 이동', 'green'] }, cli: [G('읽은 행 10, 건너뛴 행 0')], srv: [G('돌려준 행 10, 다음 커서 20')] }),
        st('OFFSET 방식의 10만 번째 페이지에 해당하는 위치입니다. 앞 페이지를 거쳐 온 클라이언트가 가진 커서는 999,990입니다.',
            { from: 'C', to: 'A', kind: 'req', label: 'after=999990', msg: [T('GET /posts?size=10&after=999990')], hl: { C: ['커서 전달', 'orange'], A: ['조건 만들기', 'purple'] }, cli: [TABLE], srv: [S('where id > 999990')] }),
        st('이 위치에서도 DB가 읽는 행은 10개입니다. 정렬 기준에 맞는 인덱스가 있으면 위치와 상관없이 읽는 행 수가 같다는 것이 커서 방식의 가장 큰 장점입니다.',
            { from: 'A', to: 'D', kind: 'res', label: 'id > 999990', msg: [T('select * from post'), T('where id > 999990'), T('order by id limit 10')], hl: { A: ['SQL 실행', 'purple'], D: ['10행 읽음', 'green'] }, cli: [G('읽은 행 10, 건너뛴 행 0')], srv: [G('앞쪽 페이지와 같은 비용')] }),
        st('대가도 있습니다. 커서는 직전 응답에서만 얻을 수 있어 50번째 페이지로 바로 건너뛸 수 없고, 이전 페이지로 가려면 반대 방향 쿼리가 필요합니다. 그래서 무한 스크롤이나 "다음 / 이전" 버튼에 맞고 페이지 번호 목록에는 맞지 않습니다.',
            { label: '임의 페이지 이동 불가', msg: [R('"50페이지로 바로 이동"은 불가'), S('커서는 직전 응답에서 얻음')], hl: { C: ['순차 이동', 'yellow'] }, cli: [Y('다음 / 이전 이동에 적합')], srv: [Y('페이지 번호 UI에는 부적합')] }),
        st('정렬 기준이 중복될 수 있는 값(예: 작성 시각)이면 그 값만으로는 위치를 정할 수 없습니다. 고유한 id를 함께 넣어 (작성 시각, id) 쌍으로 비교하고 같은 순서로 정렬합니다. PostgreSQL은 이런 행 값 비교를 지원합니다.',
            { from: 'A', to: 'D', kind: 'req', label: '복합 커서', msg: [T('where (created_at, id) <'), T('  (:last_created_at, :last_id)'), T('order by created_at desc, id desc'), T('limit 10')], hl: { A: ['복합 조건', 'purple'], D: ['인덱스 이용', 'green'] }, cli: [Y('정렬 키 = (created_at, id)')], srv: [G('고유한 순서가 있어야 안전')] })
    ];

    var CHANGE_STEPS = [
        st('목록을 넘기는 동안 데이터가 바뀌면 두 방식이 어떻게 다른지 봅니다. 최신 글이 먼저 나오는 목록(id 내림차순)입니다. 사용자가 1페이지를 본 사이에 새 글이 등록되거나 글이 삭제된다고 해 봅시다.',
            { msg: [Y('최신순: order by id desc'), S('1페이지 = 100 ~ 91')], cli: [S('페이지 크기 10')], srv: [S('현재 글: id 1 ~ 100')] }),
        st('사용자가 1페이지를 봅니다. 가장 최신 글 10개, id 100부터 91까지입니다.',
            { from: 'A', to: 'C', kind: 'res', label: '1페이지', msg: [T('id 100, 99, 98, ... , 91')], hl: { C: ['100 ~ 91 확인', 'orange'] }, cli: [G('사용자가 본 글: 100 ~ 91')], srv: [S('OFFSET: 다음은 page=2')] }),
        st('그 사이에 새 글 3개(id 101, 102, 103)가 등록됩니다. 최신순 목록의 맨 앞에 끼어들어 기존 글이 모두 세 칸씩 뒤로 밀립니다.',
            { from: 'A', to: 'D', kind: 'req', label: '새 글 3개 등록', msg: [Y('다른 사용자의 새 글 id 101, 102, 103'), S('목록 맨 앞에 추가')], hl: { D: ['글 103개', 'teal'] }, cli: [S('사용자가 본 글: 100 ~ 91')], srv: [Y('현재 글: id 1 ~ 103')] }),
        st('OFFSET 방식으로 2페이지를 요청하면 앞의 10개(103 ~ 94)를 건너뛰고 93부터 10개를 돌려줍니다. 방금 1페이지에서 본 93, 92, 91이 다시 나타납니다. 새 글이 생긴 만큼 중복이 보입니다.',
            { from: 'A', to: 'C', kind: 'err', label: 'OFFSET 2페이지', msg: [T('limit 10 offset 10'), T('결과: 93, 92, 91, 90, ... , 84'), R('93, 92, 91은 이미 본 글')], hl: { C: ['중복 3건', 'red'], A: ['OFFSET', 'purple'] }, cli: [R('이미 본 글 3개가 다시 나옴')], srv: [R('앞의 10개 = 103 ~ 94를 건너뜀')] }),
        st('커서 방식은 마지막으로 본 id 91을 기준으로 "91보다 작은 것 10개"를 요청합니다. 새 글이 앞에 끼어도 영향이 없어 90부터 정확히 이어지고 중복이 없습니다.',
            { from: 'A', to: 'C', kind: 'res', label: '커서 2페이지', msg: [T('where id < 91 order by id desc limit 10'), G('결과: 90, 89, 88, ... , 81')], hl: { C: ['중복 없음', 'green'], A: ['커서', 'purple'] }, cli: [G('다음 글이 정확히 이어짐')], srv: [G('기준 = 마지막으로 본 id 91')] }),
        st('이번에는 새 글 대신 삭제를 봅시다. 사용자가 1페이지(100 ~ 91)를 본 사이에 글 95가 삭제됐다고 합니다. OFFSET 방식의 2페이지는 앞의 10개(100, 99, 98, 97, 96, 94, 93, 92, 91, 90)를 건너뛰므로 90이 사라진 채 89부터 시작합니다.',
            { from: 'A', to: 'C', kind: 'err', label: 'OFFSET 2페이지', msg: [T('limit 10 offset 10'), T('결과: 89, 88, ... , 80'), R('90은 어느 페이지에도 나오지 않음')], hl: { C: ['누락 1건', 'red'], A: ['OFFSET', 'purple'] }, cli: [R('보지 못한 글 90이 누락됨')], srv: [R('앞의 10개에 90이 포함돼 건너뜀')] }),
        st('커서 방식은 "91보다 작은 것"이라는 조건이라 삭제와 상관없이 90부터 이어집니다. 글이 사라진 자리가 있어도 누락이 없습니다.',
            { from: 'A', to: 'C', kind: 'res', label: '커서 2페이지', msg: [T('where id < 91 order by id desc limit 10'), G('결과: 90, 89, 88, ... , 81')], hl: { C: ['누락 없음', 'green'], A: ['커서', 'purple'] }, cli: [G('삭제와 상관없이 이어짐')], srv: [G('기준 = 마지막으로 본 id 91')] }),
        st('정리하면, OFFSET은 "몇 번째 위치"를 기억하므로 앞쪽 데이터가 바뀌면 위치가 밀려 중복이나 누락이 생깁니다. 커서는 "어떤 행 다음"을 기억하므로 바뀐 데이터와 상관없이 이어집니다. 데이터가 자주 바뀌는 피드에는 커서가 맞습니다.',
            { label: '위치 vs 기준 행', msg: [Y('OFFSET: 위치(몇 번째)를 기억'), Y('커서: 기준 행(어떤 행 다음)을 기억')], hl: { C: ['커서가 안정적', 'green'] }, cli: [R('OFFSET: 중복 · 누락 가능')], srv: [G('커서: 변경에 강함')] })
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'offset';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;

    function currentSteps() {
        if (mode === 'cursor') return CURSOR_STEPS;
        if (mode === 'change') return CHANGE_STEPS;
        return OFFSET_STEPS;
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
            { title: '요청 · SQL · 응답', rows: step ? step.msg : [], empty: step ? '(내용 없음)' : '(STEP 또는 PLAY로 시작하세요)' },
            { title: '읽은 행 · 사용자 상태', rows: step ? step.cli : [], empty: '(없음)' },
            { title: '결과 · 서버 상태', rows: step ? step.srv : [], empty: '(없음)' }
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
        var idxOf = { C: 0, A: 1, D: 2 };

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
        if (mode === 'cursor') return '마지막으로 본 행의 키로 이어 가는 커서 방식이 위치와 상관없이 일정한 비용으로 읽는 과정을 봅니다.';
        if (mode === 'change') return '페이지를 넘기는 사이 데이터가 추가·삭제될 때 OFFSET과 커서의 결과가 어떻게 달라지는지 봅니다.';
        return '페이지 번호로 위치를 정하는 OFFSET 방식에서 뒤 페이지일수록 거치는 행이 늘어나는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('page-viz__speed-btn--active'); });
        btn.classList.add('page-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('page-viz__mode-btn--active', d.key === m); });
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