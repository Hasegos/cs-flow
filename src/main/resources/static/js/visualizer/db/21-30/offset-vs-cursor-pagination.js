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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'offset';
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

    /* ===================== 장면 데이터 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
    }
    function seqIds(from, to) {
        var a = [];
        for (var i = from; i >= to; i--) a.push(i);
        return a;
    }
    function RW(label, ids, marks) { return { label: label, ids: ids, marks: marks || {} }; }
    var BIG = 1000000;

    ann(OFFSET_STEPS, [
        { sc: 0 },
        { sc: 0, nm: 'OFFSET 0' },
        { sc: 1, win: 0, read: 10, skip: 0, ret: 10 },
        { sc: 0, nm: 'OFFSET 10' },
        { sc: 1, win: 10, read: 20, skip: 10, ret: 10 },
        { sc: 0, nm: 'OFFSET 999,990' },
        { sc: 1, win: 999990, read: 1000000, skip: 999990, ret: 10, bad: true },
        { sc: 1, win: 999990, read: 1000000, skip: 999990, ret: 10, bad: true, fm: '거치는 행 = offset + size' }
    ]);
    ann(CURSOR_STEPS, [
        { sc: 0 },
        { sc: 0 },
        { sc: 1, win: 0, read: 10, skip: 0, ret: 10, cur: 10 },
        { sc: 0, cur: 10 },
        { sc: 1, win: 10, read: 10, skip: 0, ret: 10, cur: 20, jump: 10 },
        { sc: 0, cur: 999990 },
        { sc: 1, win: 999990, read: 10, skip: 0, ret: 10, cur: 999990, jump: 999990, good: true },
        { sc: 0, fm: '페이지 번호로 건너뛰기 불가 → 순차 이동에 적합' },
        { sc: 0 }
    ]);
    ann(CHANGE_STEPS, [
        { rows: [] },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {})] },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {}), RW('DB 맨 앞 (새 글 3개)', seqIds(103, 94), { 103: 'yellow', 102: 'yellow', 101: 'yellow' })] },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {}), RW('DB 맨 앞 (새 글 3개)', seqIds(103, 94), { 103: 'yellow', 102: 'yellow', 101: 'yellow' }), RW('OFFSET 2페이지', seqIds(93, 84), { 93: 'red', 92: 'red', 91: 'red' })] },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {}), RW('DB 맨 앞 (새 글 3개)', seqIds(103, 94), { 103: 'yellow', 102: 'yellow', 101: 'yellow' }), RW('커서 2페이지 (id < 91)', seqIds(90, 81), { 90: 'green', 89: 'green', 88: 'green', 87: 'green', 86: 'green', 85: 'green', 84: 'green', 83: 'green', 82: 'green', 81: 'green' })] },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {}), RW('DB 맨 앞 (95 삭제)', [100, 99, 98, 97, 96, 95, 94, 93, 92, 91], { 95: 'gone' }), RW('OFFSET 2페이지', seqIds(89, 80), { 89: 'yellow' }), RW('', [], {})], note: '90이 어느 페이지에도 나오지 않음 (누락)' },
        { rows: [RW('사용자가 본 1페이지', seqIds(100, 91), {}), RW('DB 맨 앞 (95 삭제)', [100, 99, 98, 97, 96, 95, 94, 93, 92, 91], { 95: 'gone' }), RW('커서 2페이지 (id < 91)', seqIds(90, 81), { 90: 'green', 89: 'green', 88: 'green', 87: 'green', 86: 'green', 85: 'green', 84: 'green', 83: 'green', 82: 'green', 81: 'green' })], good: true },
        { rows: [], fm: 'OFFSET은 위치를, 커서는 기준 행을 기억한다' }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'cursor') return CURSOR_STEPS;
        if (mode === 'change') return CHANGE_STEPS;
        return OFFSET_STEPS;
    }
    function defaultLog() {
        if (mode === 'cursor') return '마지막으로 본 행의 키로 이어 가는 커서 방식이 위치와 상관없이 일정한 비용으로 읽는 과정을 봅니다.';
        if (mode === 'change') return '페이지를 넘기는 사이 데이터가 추가·삭제될 때 OFFSET과 커서의 결과가 어떻게 달라지는지 봅니다.';
        return '페이지 번호로 위치를 정하는 OFFSET 방식에서 뒤 페이지일수록 거치는 행이 늘어나는 과정을 봅니다.';
    }
    function comma(n) {
        var s = String(Math.round(n));
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /* ===================== 레이아웃(모드마다 고정) ===================== */
    function wrapRows(rows, maxW, fs) {
        var out = [];
        (rows || []).forEach(function (r) {
            lines(r[0], maxW, fs).forEach(function (t) { out.push([t, r[1]]); });
        });
        return out;
    }
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = Math.round(fs * 1.45);
        var cardN = 0;
        currentSteps().forEach(function (s) { cardN = Math.max(cardN, wrapRows(s.msg, w - 40, fs - 1).length); });
        var cardH = Math.max(1, cardN) * lh + 14;
        var body = mode === 'change' ? 4 * 62 + 24 : 196;
        return { fs: fs, lh: lh, pipeH: 54, cardH: cardH, body: body, total: 54 + 12 + cardH + 14 + body + 10 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 그리기 ===================== */
    function drawPipe(x0, top, w, fs, s) {
        var items = [['C', '클라이언트', 'orange'], ['A', '서버', 'purple'], ['D', 'DB', 'teal']];
        var bw = Math.min(110, (w - 60) / 3);
        var gap = (w - bw * 3) / 2;
        items.forEach(function (it, i) {
            var x = x0 + i * (bw + gap);
            var on = s.from === it[0] || s.to === it[0];
            var c = colorOf(it[2]);
            rr(x, top, bw, 30, 15, c + (on ? '33' : '12'), c + (on ? 'ff' : '88'), on ? 2 : 1.2);
            tx(it[1], x + bw / 2, top + 15, fs - 0.5, c + 'ff', 'center', true);
            if (i < 2) {
                var act = (s.from === it[0] && s.to === items[i + 1][0]) || (s.from === items[i + 1][0] && s.to === it[0]);
                var back = s.from === items[i + 1][0] && s.to === it[0];
                var kc = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
                if (back) arrow(x + bw + gap - 4, top + 15, x + bw + 4, top + 15, act ? kc + 'ff' : P.muted + '66', act ? 3 : 1.4);
                else arrow(x + bw + 4, top + 15, x + bw + gap - 4, top + 15, act ? kc + 'ff' : P.muted + '66', act ? 3 : 1.4);
            }
        });
        var hl = s.hl || {};
        ['C', 'A', 'D'].forEach(function (k, i) {
            if (hl[k]) {
                var x = x0 + i * (bw + gap);
                var c = colorOf(hl[k][1]);
                tx(hl[k][0], x + bw / 2, top + 44, fs - 1.5, c + 'ff', 'center', true);
            }
        });
    }
    function drawCard(x0, y, w, fs, L, s, e, border) {
        var rows = wrapRows(s.msg, w - 40, fs - 1);
        if (!rows.length) {
            if (s.label) tx(s.label, x0 + w / 2, y + L.cardH / 2, fs, P.yellow + 'ff', 'center', true);
            return;
        }
        ctx.globalAlpha = e;
        rr(x0, y, w, L.cardH, 8, border + '1c', border + 'ff', 1.8);
        rows.forEach(function (r, i) {
            tx(r[0], x0 + 12, y + 7 + L.lh / 2 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
        });
        ctx.globalAlpha = 1;
    }

    function drawTrack(x0, y, w, fs, s, prev, e, L) {
        var cx = x0 + 14, cw = w - 28;
        tx('post 테이블  (id 1 → 1,000,000, 100만 행)', x0 + 2, y + 6, fs - 0.5, P.sub + 'ff', 'left', true);
        var ty = y + 22, th = 26;
        rr(cx, ty, cw, th, 6, P.muted + '1a', P.muted + 'aa', 1.4);
        var scanTo = 0;
        if (s.sc && s.read !== undefined && mode === 'offset') scanTo = clamp01(s.read / BIG);
        if (scanTo > 0) {
            var sx = cw * scanTo * e;
            rr(cx, ty, Math.max(sx, 3), th, 6, (s.bad ? P.red : P.orange) + '88', 'none');
        }
        if (s.sc && s.win !== undefined) {
            var wx = cx + cw * (s.win / BIG);
            var ww = Math.max(5, cw * (10 / BIG));
            if (wx + ww > cx + cw) wx = cx + cw - ww;
            ctx.globalAlpha = mode === 'offset' ? clamp01((e - 0.6) / 0.4) : e;
            rr(wx - 1, ty - 4, ww + 2, th + 8, 3, P.green + 'ff', 'none');
            ctx.globalAlpha = 1;
            var lbl = '돌려줌 10행';
            var lx = Math.min(cx + cw - 44, Math.max(cx + 44, wx));
            tx(lbl, lx, ty + th + 18, fs - 0.5, P.green + 'ff', 'center', true);
            if (mode === 'cursor' && s.jump !== undefined) {
                var sx0 = cx + 4, ex0 = wx + ww / 2;
                ctx.beginPath();
                ctx.moveTo(sx0, ty - 4);
                var mid = (sx0 + ex0) / 2;
                ctx.quadraticCurveTo(mid, ty - 34, lerp(sx0, ex0, e), ty - 4 - 18 * Math.sin(Math.PI * e) * 0);
                ctx.strokeStyle = P.green + 'ff';
                ctx.lineWidth = 2.4;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
                tx('인덱스로 바로 이동', mid, ty - 24, fs - 0.5, P.green + 'ff', 'center', true);
            }
        }
        if (mode === 'cursor' && s.cur !== undefined) {
            var px = cx + cw * Math.min(1, s.cur / BIG);
            ctx.beginPath();
            ctx.moveTo(px, ty + th + 1);
            ctx.lineTo(px - 5, ty + th + 9);
            ctx.lineTo(px + 5, ty + th + 9);
            ctx.closePath();
            ctx.fillStyle = P.yellow + 'ff';
            ctx.fill();
        }

        var ny = ty + th + 40;
        var nums = [['거친 행', s.read, s.bad ? 'red' : 'yellow'], ['건너뛴 행', s.skip, s.bad ? 'red' : 'sub'], ['돌려준 행', s.ret, 'green']];
        var nw = (cw - 16) / 3;
        nums.forEach(function (n, i) {
            var nx = cx + i * (nw + 8);
            var val = n[1];
            var prevVal = prev && prev.read !== undefined ? prev[i === 0 ? 'read' : (i === 1 ? 'skip' : 'ret')] : 0;
            var shown = val === undefined ? null : (prevVal !== undefined && prev ? lerp(prevVal || 0, val, e) : val);
            var c = colorOf(n[2]);
            rr(nx, ny, nw, 54, 8, c + '12', c + 'aa', 1.3);
            tx(n[0], nx + nw / 2, ny + 13, fs - 1.5, P.sub + 'ff', 'center', true);
            tx(shown === null ? '-' : comma(shown), nx + nw / 2, ny + 36, fs + 3, c + 'ff', 'center', true);
        });
        if (s.nm) tx(s.nm, x0 + w / 2, ny + 74, fs, P.yellow + 'ff', 'center', true);
        if (s.fm) tx(s.fm, x0 + w / 2, ny + 74, fs, P.yellow + 'ff', 'center', true);
    }

    function drawChips(x0, y, w, fs, row, e, idx) {
        var chipW = Math.min(30, (w - 9 * 3) / 10);
        var gx = 3;
        tx(row.label, x0 + 2, y + 6, fs - 1, P.sub + 'ff', 'left', true);
        row.ids.forEach(function (id, i) {
            var x = x0 + i * (chipW + gx);
            var mk = row.marks[id];
            var c = mk === 'red' ? P.red : (mk === 'yellow' ? P.yellow : (mk === 'green' ? P.green : (mk === 'gone' ? P.muted : P.sub)));
            var a = clamp01(e * 3 - i * 0.12);
            ctx.globalAlpha = idx === 1 ? 1 : a;
            if (mk === 'gone') {
                rr(x, y + 16, chipW, 26, 5, 'none', P.red + 'cc', 1.3);
                tx('삭제', x + chipW / 2, y + 29, 10, P.red + 'ff', 'center', true);
            } else {
                rr(x, y + 16, chipW, 26, 5, c + (mk ? '33' : '14'), c + (mk ? 'ff' : '88'), mk ? 1.8 : 1.2);
                tx(String(id), x + chipW / 2, y + 29, 10.5, (mk ? c : P.text) + 'ff', 'center', mk ? true : false);
            }
            ctx.globalAlpha = 1;
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { from: null, to: null, kind: '', label: '', hl: {}, msg: [], rows: [] };
        var e = clamp01(t);
        drawPipe(x0, top, w, fs, s);
        var cy = top + L.pipeH + 6;
        var kc = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
        drawCard(x0, cy, w, fs, L, s, e, kc);
        var by = cy + L.cardH + 14;
        if (mode === 'change') {
            var rows = s.rows || [];
            rows.forEach(function (r, i) {
                if (!r.ids.length) return;
                drawChips(x0, by + i * 62, w, fs, r, e, i === rows.length - 1 ? 0 : 1);
            });
            if (s.note) tx('⚠ ' + s.note, x0 + w / 2, by + 3 * 62 + 4, fs - 0.5, P.red + 'ff', 'center', true);
            if (s.fm) tx(s.fm, x0 + w / 2, by + 30, fs + 1, P.yellow + 'ff', 'center', true);
            if (s.good && !s.note) tx('✓ 중복도 누락도 없음', x0 + w / 2, by + 3 * 62 + 4, fs, P.green + 'ff', 'center', true);
        } else {
            drawTrack(x0, by, w, fs, s, prev, e, L);
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