/**
 * N+1 문제 시각화
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
    var root    = el('div', 'nplus-viz');
    var toolbar = el('div', 'nplus-viz__toolbar');
    var tbLeft  = el('div', 'nplus-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'nplus-viz__title', 'N+1'));

    var modeWrap = el('div', 'nplus-viz__mode');
    var modeDefs = [
        { key: 'n1', label: 'N+1 발생' },
        { key: 'fetch', label: '조인 페치' },
        { key: 'batch', label: 'IN 일괄 조회' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'nplus-viz__mode-btn' + (i === 0 ? ' nplus-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'nplus-viz__speed');
    speedWrap.appendChild(el('span', 'nplus-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'nplus-viz__speed-btn' + (i === 0 ? ' nplus-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'nplus-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'nplus-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'nplus-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'nplus-viz__controls');
    var btnPlay  = el('button', 'nplus-viz__btn nplus-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'nplus-viz__btn', '▶| STEP');
    var btnReset = el('button', 'nplus-viz__btn', '↺ RESET');
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
    var mode    = 'n1';
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
        { id: 'A', name: '서비스 코드', sub: '서비스 계층', col: 'orange' },
        { id: 'O', name: 'JPA', sub: 'Hibernate', col: 'purple' },
        { id: 'D', name: 'DB', sub: 'PostgreSQL', col: 'teal' }
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

    var CODE_LOOP = [T('List<Team> teams = teamRepository.findAll();'), T('for (Team t : teams) { t.getMembers().size(); }')];

    var N1_STEPS = [
        st('팀 5개를 조회한 뒤 각 팀의 멤버 목록을 읽는 코드입니다. JPA에서 @OneToMany 컬렉션은 기본이 지연 로딩이라, 컬렉션에 처음 접근할 때 쿼리가 실행됩니다. 쿼리가 몇 번 나가는지 세어 봅시다.',
            { msg: CODE_LOOP, cli: [S('팀 5개, 팀마다 멤버 여러 명')], srv: [Y('쿼리 0회')] }),
        st('findAll로 팀 목록을 가져오는 쿼리가 먼저 나갑니다. 이 쿼리는 팀 테이블만 읽습니다.',
            { from: 'A', to: 'D', kind: 'req', label: '쿼리 ①', msg: [T('select * from team')], hl: { A: ['findAll', 'orange'], D: ['실행', 'teal'] }, cli: [S('팀 목록 요청')], srv: [Y('쿼리 1회')] }),
        st('팀 5개가 돌아옵니다. 각 팀의 members는 아직 로딩되지 않은 지연 로딩 컬렉션입니다. 목록 쿼리는 여기서 끝났고, 지금까지는 쿼리 1번입니다.',
            { from: 'D', to: 'A', kind: 'res', label: '팀 5개', msg: [T('team 5행'), S('members 컬럼은 team에 없음')], hl: { D: ['5행 반환', 'teal'], O: ['지연 컬렉션', 'purple'] }, cli: [Y('Team 5개 로딩'), S('members는 아직 비어 있는 지연 컬렉션')], srv: [Y('쿼리 1회')] }),
        st('반복문이 첫 번째 팀의 getMembers().size()에 접근합니다. 컬렉션이 처음 쓰이는 순간 JPA가 이 팀의 멤버를 가져오는 쿼리를 실행합니다.',
            { from: 'A', to: 'D', kind: 'req', label: '쿼리 ②', msg: [T('select * from member'), T('where team_id = 1')], hl: { A: ['팀 1 접근', 'orange'], O: ['지연 로딩', 'purple'] }, cli: [Y('팀 1의 members 접근 → 쿼리 발생')], srv: [Y('쿼리 2회')] }),
        st('두 번째 팀에서도 같은 일이 일어납니다. 팀마다 자기 team_id로 멤버를 따로 가져옵니다. 쿼리는 같은 모양이고 값만 다릅니다.',
            { from: 'A', to: 'D', kind: 'req', label: '쿼리 ③', msg: [T('select * from member'), T('where team_id = 2')], hl: { A: ['팀 2 접근', 'orange'], O: ['지연 로딩', 'purple'] }, cli: [Y('팀 2의 members 접근 → 쿼리 발생')], srv: [Y('쿼리 3회')] }),
        st('나머지 팀 3, 4, 5도 같은 방식이어서 멤버 조회 쿼리가 세 번 더 나갑니다. 팀 목록 1번과 팀마다 1번씩 5번을 합쳐 모두 6번입니다.',
            { label: '쿼리 ④ ⑤ ⑥', msg: [T('where team_id = 3'), T('where team_id = 4'), T('where team_id = 5')], hl: { D: ['총 6회', 'red'] }, cli: [R('팀 3, 4, 5도 각각 쿼리 발생')], srv: [R('쿼리 6회 = 1 + 5')] }),
        st('팀이 N개면 쿼리는 1 + N번입니다. 이것이 N+1 문제입니다. 팀이 100개면 101번이 나가고, 한 번마다 DB 서버와 네트워크를 왕복하므로 데이터가 늘수록 응답이 느려집니다. 코드에는 반복문 하나만 보이는 것이 함정입니다.',
            { label: 'N+1', msg: [Y('팀 N개 → 쿼리 1 + N번')], hl: { D: ['1 + N', 'red'] }, cli: [R('팀 100개면 쿼리 101번')], srv: [R('왕복 횟수가 데이터 양에 비례')] })
    ];

    var FETCH_STEPS = [
        st('같은 화면을 이번에는 처음부터 팀과 멤버를 함께 가져오는 방식으로 만듭니다. JPQL의 join fetch는 "연관된 컬렉션도 이 쿼리에서 같이 로딩하라"는 지시입니다.',
            { msg: [T('select t from Team t'), T('  left join fetch t.members')], cli: [S('연관 컬렉션을 한 쿼리에서 로딩')], srv: [Y('쿼리 0회')] }),
        st('JPA가 팀과 멤버를 조인하는 SQL 하나를 만들어 실행합니다. left join이라서 멤버가 없는 팀도 결과에 남습니다.',
            { from: 'A', to: 'D', kind: 'req', label: '쿼리 ①', msg: [T('select t.*, m.*'), T('from team t'), T('left join member m'), T('  on m.team_id = t.id')], hl: { A: ['join fetch', 'orange'], D: ['실행', 'teal'] }, cli: [S('팀 목록과 멤버를 한 번에 요청')], srv: [Y('쿼리 1회')] }),
        st('조인 결과는 팀 행이 멤버 수만큼 반복되는 모양입니다. 팀 5개에 멤버가 모두 15명이면 15행이 돌아옵니다. 데이터 양은 늘지만 DB 왕복은 한 번입니다.',
            { from: 'D', to: 'A', kind: 'res', label: '15행', msg: [T('팀 1  멤버 a'), T('팀 1  멤버 b'), T('팀 2  멤버 c'), S('… 팀 행이 멤버 수만큼 반복')], hl: { D: ['15행 반환', 'teal'], O: ['엔티티로 조립', 'purple'] }, cli: [Y('15행 → 팀 5개 + 멤버 15명으로 조립')], srv: [Y('쿼리 1회')] }),
        st('JPA가 반복된 행에서 팀 5개를 한 번씩만 만들고 각 팀의 members를 채웁니다. Hibernate 6부터는 같은 부모 엔티티의 중복 참조를 자동으로 걸러 주어, 예전처럼 distinct를 붙이지 않아도 됩니다.',
            { label: '엔티티 조립', msg: [G('Team 5개, 각 members가 채워진 상태')], hl: { O: ['중복 제거', 'green'] }, cli: [G('팀 5개의 members가 이미 로딩됨')], srv: [Y('쿼리 1회')] }),
        st('이제 반복문에서 getMembers()에 접근해도 컬렉션이 이미 채워져 있어 추가 쿼리가 없습니다. 쿼리는 처음 1번 그대로입니다. 팀이 몇 개든 1번입니다.',
            { from: 'A', to: 'O', kind: 'req', label: 'getMembers() 접근', msg: [G('추가 쿼리 없음'), T('t.getMembers().size()  → 메모리에서 읽음')], hl: { A: ['접근', 'orange'], O: ['이미 로딩됨', 'green'] }, cli: [G('반복문을 돌아도 쿼리 증가 없음')], srv: [G('쿼리 1회 유지')] }),
        st('주의할 점입니다. 컬렉션을 join fetch한 쿼리에 페이징(Pageable, setMaxResults)을 함께 쓰면 Hibernate는 DB에서 자르지 못합니다. 행이 부모보다 많아 자를 위치를 정할 수 없기 때문에, Hibernate 7.3 이하는 경고를 남기고 전체 행을 읽어 메모리에서 페이징합니다.',
            { from: 'A', to: 'D', kind: 'err', label: '페이징 + join fetch', msg: [R('limit 없이 전체 행 조회'), R('경고 로그: 메모리에서 페이징')], hl: { A: ['Pageable 사용', 'orange'], D: ['전체 조회', 'red'] }, cli: [R('데이터가 많으면 메모리 부담')], srv: [R('limit 없이 모든 행을 읽음')] })
    ];

    var BATCH_STEPS = [
        st('join fetch 대신 지연 로딩은 그대로 두고, 컬렉션을 초기화할 때 여러 팀의 멤버를 IN으로 묶어 가져오게 설정하는 방법입니다. Hibernate의 default_batch_fetch_size를 100으로 설정했다고 합시다.',
            { msg: [Y('hibernate.default_batch_fetch_size = 100'), T('List<Team> teams = teamRepository.findBy(pageable);')], cli: [S('지연 로딩 유지 + 일괄 로딩')], srv: [Y('쿼리 0회')] }),
        st('팀 목록을 가져옵니다. 컬렉션을 join하지 않았으므로 페이징을 DB에서 처리할 수 있습니다. 여기서는 한 페이지에 5개를 가져옵니다.',
            { from: 'A', to: 'D', kind: 'req', label: '쿼리 ①', msg: [T('select * from team'), T('limit 5')], hl: { A: ['findBy(페이징)', 'orange'], D: ['실행', 'teal'] }, cli: [S('팀 5개 요청')], srv: [Y('쿼리 1회')] }),
        st('팀 5개가 돌아왔고 각 members는 아직 지연 컬렉션입니다. 영속성 컨텍스트가 "아직 초기화되지 않은 컬렉션 5개"를 알고 있습니다.',
            { from: 'D', to: 'A', kind: 'res', label: '팀 5개', msg: [T('team 5행')], hl: { D: ['5행 반환', 'teal'], O: ['미초기화 컬렉션 5개', 'purple'] }, cli: [Y('Team 5개 로딩, members는 지연')], srv: [Y('쿼리 1회')] }),
        st('반복문이 첫 번째 팀의 members에 접근하면 JPA가 이 컬렉션만 가져오지 않고, 같은 컨텍스트에서 아직 초기화되지 않은 다른 팀의 컬렉션도 배치 크기 한도까지 함께 모읍니다.',
            { from: 'A', to: 'O', kind: 'req', label: '팀 1 접근', msg: [T('t1.getMembers().size()'), S('초기화 안 된 컬렉션 5개를 묶음')], hl: { A: ['팀 1 접근', 'orange'], O: ['5개를 묶음', 'purple'] }, cli: [Y('컬렉션 5개를 한 묶음으로 처리')], srv: [Y('쿼리 1회')] }),
        st('모은 팀 id를 IN 조건 하나로 실행합니다. 팀 5개의 멤버를 한 번에 가져옵니다.',
            { from: 'O', to: 'D', kind: 'req', label: '쿼리 ②', msg: [T('select * from member'), T('where team_id in (1, 2, 3, 4, 5)')], hl: { O: ['IN 조회', 'purple'], D: ['실행', 'teal'] }, cli: [Y('멤버 일괄 조회 요청')], srv: [Y('쿼리 2회')] }),
        st('멤버 15명이 돌아오고 JPA가 team_id 별로 나누어 팀 5개의 컬렉션을 모두 채웁니다. 나머지 팀에 접근해도 이미 채워져 있어 쿼리가 늘지 않습니다.',
            { from: 'D', to: 'A', kind: 'res', label: '멤버 15행', msg: [G('팀 5개의 members가 모두 채워짐')], hl: { D: ['15행 반환', 'teal'], O: ['팀별로 분배', 'green'] }, cli: [G('이후 접근은 추가 쿼리 없음')], srv: [G('쿼리 2회 = 1 + 1')] }),
        st('쿼리 수는 1 + 올림(팀 수 ÷ 배치 크기)입니다. 팀이 5개면 2번이고, 배치 크기가 100이면 팀이 100개여도 2번입니다. 페이징을 DB에서 할 수 있고 컬렉션 여러 개에도 쓸 수 있어, 조인 페치를 쓰기 어려운 컬렉션 연관의 대안입니다.',
            { label: '1 + ⌈N ÷ 배치⌉', msg: [Y('쿼리 수 = 1 + ⌈팀 수 ÷ 배치 크기⌉')], hl: { D: ['2회', 'green'] }, cli: [G('팀 100개, 배치 크기 100 → 쿼리 2번')], srv: [G('N+1 → 1 + 소수의 쿼리')] })
    ];

    /* ===================== 장면 데이터 ===================== */
    function ann(steps, list) {
        steps.forEach(function (s, i) { var a = list[i] || {}; for (var k in a) s[k] = a[k]; });
    }
    ann(N1_STEPS, [
        { q: 0, tm: 'nnnnn', db: '' },
        { q: 1, tm: 'nnnnn', db: 'team', hit: [] },
        { q: 1, tm: 'lllll', db: 'team', hit: [] },
        { q: 2, tm: 'mllll', db: 'member', hit: [0] },
        { q: 3, tm: 'mmlll', db: 'member', hit: [1] },
        { q: 6, tm: 'mmmmm', db: 'member', hit: [2, 3, 4], qs: ['④', '⑤', '⑥'] },
        { q: 6, tm: 'mmmmm', db: '', fm: '1 + N  =  1 + 5  =  6번', bad: true }
    ]);
    ann(FETCH_STEPS, [
        { q: 0, tm: 'nnnnn', db: '' },
        { q: 1, tm: 'nnnnn', db: 'join', hit: [0, 1, 2, 3, 4] },
        { q: 1, tm: 'nnnnn', db: 'join', hit: [0, 1, 2, 3, 4] },
        { q: 1, tm: 'mmmmm', db: '' },
        { q: 1, tm: 'mmmmm', db: '', fm: '반복문을 돌려도 쿼리 1번' },
        { q: 1, tm: 'mmmmm', db: 'join', hit: [0, 1, 2, 3, 4], warn: 'limit 없이 모든 행을 읽음' }
    ]);
    ann(BATCH_STEPS, [
        { q: 0, tm: 'nnnnn', db: '' },
        { q: 1, tm: 'nnnnn', db: 'team', hit: [] },
        { q: 1, tm: 'lllll', db: 'team', hit: [] },
        { q: 1, tm: 'lllll', db: '', bundle: true },
        { q: 2, tm: 'lllll', db: 'member', hit: [0, 1, 2, 3, 4] },
        { q: 2, tm: 'mmmmm', db: 'member', hit: [0, 1, 2, 3, 4] },
        { q: 2, tm: 'mmmmm', db: '', fm: '1 + ⌈N ÷ 배치 크기⌉  =  2번', good: true }
    ]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'fetch') return FETCH_STEPS;
        if (mode === 'batch') return BATCH_STEPS;
        return N1_STEPS;
    }
    function defaultLog() {
        if (mode === 'fetch') return '조인 페치로 쿼리를 1번으로 줄이는 방법과 컬렉션 페이징의 한계를 봅니다.';
        if (mode === 'batch') return '지연 로딩을 유지한 채 IN으로 묶어 쿼리를 2번으로 줄이는 배치 페치를 봅니다.';
        return '목록 1번과 항목마다 1번씩, 쿼리가 1 + N번 나가는 과정을 쿼리 횟수를 세며 봅니다.';
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
        currentSteps().forEach(function (s) { cardN = Math.max(cardN, wrapRows(s.msg, w - 76, fs - 1).length); });
        var cardH = Math.max(1, cardN) * lh + 14;
        return { fs: fs, lh: lh, cntH: 66, appH: 112, cardH: cardH, gapH: cardH + 58, dbH: 128, fmH: 34,
                 total: 66 + 112 + cardH + 58 + 128 + 34 + 10 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    var TEAM_COL = ['orange', 'purple', 'teal', 'green', 'yellow'];

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var s = step || { from: null, to: null, kind: '', label: '', hl: {}, msg: [], tm: 'nnnnn', q: 0, db: '' };
        var hl = s.hl || {};
        var e = clamp01(t);

        /* 쿼리 카운터 */
        var qcol = s.bad ? P.red : (s.good ? P.green : P.yellow);
        rr(x0, top, w, L.cntH - 8, 10, qcol + '14', qcol + 'aa', 1.6);
        tx('SQL 쿼리', x0 + 14, top + 14, fs - 0.5, P.sub + 'ff', 'left', true);
        var qShow = s.q;
        if (prev && prev.q !== undefined && s.q > prev.q) qShow = Math.round(lerp(prev.q, s.q, e));
        tx(String(qShow), x0 + 14, top + 40, 30, qcol + 'ff', 'left', true);
        var numW = String(qShow).length * 19 + 22;
        tx('번', x0 + 14 + numW, top + 42, fs + 1, P.sub + 'ff', 'left', true);
        var chipX = x0 + 14 + numW + 34;
        var maxChips = Math.floor((x0 + w - 14 - chipX) / 22);
        for (var i = 0; i < Math.min(s.q, maxChips); i++) {
            var isNew = prev && i >= (prev.q || 0) && i < s.q;
            var cc = i === 0 ? P.yellow : qcol;
            circ(chipX + i * 22 + 9, top + 28, 9, cc + (isNew ? Math.round(e * 255).toString(16).padStart(2, '0') : 'ff'), 'none');
            tx(String(i + 1), chipX + i * 22 + 9, top + 28, 10.5, '#111111', 'center', true);
        }

        /* 앱: 팀 카드 */
        var ay = top + L.cntH;
        rr(x0, ay, w, L.appH, 10, P.orange + '0f', P.orange + 'aa', 1.6);
        tx('서비스 코드 (JPA 엔티티)', x0 + 14, ay + 16, fs, P.orange + 'ff', 'left', true);
        if (hl.A) {
            var ca = colorOf(hl.A[1]);
            ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
            var bw = ctx.measureText(hl.A[0]).width + 18;
            rr(x0 + w - bw - 10, ay + 6, bw, 20, 10, ca + '22', ca + 'ff', 1.2);
            tx(hl.A[0], x0 + w - bw / 2 - 10, ay + 16, fs - 1, ca + 'ff', 'center', true);
        }
        var cw = (w - 28 - 4 * 8) / 5;
        for (var k = 0; k < 5; k++) {
            var tstate = s.tm.charAt(k);
            var cx = x0 + 14 + k * (cw + 8), cyy = ay + 34;
            var col = colorOf(TEAM_COL[k]);
            var flash = s.hit && s.hit.indexOf(k) >= 0 && s.db === 'member' && !prev ? 1 : 0;
            var justLoaded = prev && prev.tm && prev.tm.charAt(k) !== 'm' && tstate === 'm';
            var lit = justLoaded ? e : (tstate === 'm' ? 1 : 0);
            if (tstate === 'n') {
                rr(cx, cyy, cw, 68, 7, 'none', P.muted + '88', 1.2);
                tx('팀 ' + (k + 1), cx + cw / 2, cyy + 14, fs - 1, P.muted + 'ff', 'center', true);
                tx('없음', cx + cw / 2, cyy + 40, fs - 1.5, P.muted + 'ff', 'center', false);
            } else {
                rr(cx, cyy, cw, 68, 7, col + '1c', col + 'ff', 1.5);
                tx('팀 ' + (k + 1), cx + cw / 2, cyy + 14, fs - 1, col + 'ff', 'center', true);
                if (tstate === 'l') {
                    tx('members', cx + cw / 2, cyy + 34, fs - 2, P.sub + 'ff', 'center', false);
                    tx('? 지연', cx + cw / 2, cyy + 52, fs - 1, P.sub + 'ff', 'center', true);
                } else {
                    var dr = 4.5;
                    for (var d = 0; d < 3; d++) {
                        circ(cx + cw / 2 + (d - 1) * 13, cyy + 40, dr + lit * 1.5, col + Math.round((0.25 + 0.75 * lit) * 255).toString(16).padStart(2, '0'), 'none');
                    }
                    tx(lit > 0.5 ? '로딩됨' : '? 지연', cx + cw / 2, cyy + 57, fs - 1.5, (lit > 0.5 ? P.green : P.sub) + 'ff', 'center', true);
                }
            }
        }

        /* 가운데: SQL 카드 */
        var gy = ay + L.appH;
        var dby = gy + L.gapH;
        var kc = s.kind === 'err' ? P.red : (s.kind === 'res' ? P.teal : P.yellow);
        var down = (s.from === 'A' || s.from === 'O') && s.to === 'D';
        var up = s.from === 'D' && s.to === 'A';
        arrow(x0 + 14, gy + 2, x0 + 14, dby - 4, down ? kc + 'ff' : P.muted + '55', down ? 3 : 1.6, down ? undefined : [4, 4]);
        arrow(x0 + w - 14, dby - 4, x0 + w - 14, gy + 2, up ? kc + 'ff' : P.muted + '55', up ? 3 : 1.6, up ? undefined : [4, 4]);
        var rows = wrapRows(s.msg, w - 76, fs - 1);
        var cardX = x0 + 28, cardW = w - 56;
        var yTop = gy + 6, yBot = dby - L.cardH - 8;
        var cy = null, alpha = 1, border = kc;
        if (down) cy = lerp(yTop, yBot, e);
        else if (up) cy = lerp(yBot, yTop, e);
        else if (rows.length) { cy = lerp(yTop, yBot, 0.5); alpha = e; border = s.bundle ? P.purple : P.yellow; }
        if (cy !== null && rows.length) {
            ctx.globalAlpha = alpha;
            rr(cardX, cy, cardW, L.cardH, 8, border + '1c', border + 'ff', 1.8);
            rows.forEach(function (r, i) {
                tx(r[0], cardX + 10, cy + 7 + L.lh / 2 + i * L.lh, fs - 1, colorOf(r[1]) + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        }
        if (s.label && !rows.length) tx(s.label, x0 + w / 2, gy + L.gapH / 2, fs, P.yellow + 'ff', 'center', true);

        /* DB: team / member 테이블 */
        var dcol = hl.D ? colorOf(hl.D[1]) : P.teal;
        rr(x0, dby, w, L.dbH, 10, P.teal + '0f', dcol + (hl.D ? 'ff' : 'aa'), hl.D ? 2 : 1.6);
        tx('DB (PostgreSQL)', x0 + 14, dby + 16, fs, P.teal + 'ff', 'left', true);
        if (hl.D) {
            var bw2 = (function () { ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace'; return ctx.measureText(hl.D[0]).width + 18; })();
            rr(x0 + w - bw2 - 10, dby + 6, bw2, 20, 10, dcol + '22', dcol + 'ff', 1.2);
            tx(hl.D[0], x0 + w - bw2 / 2 - 10, dby + 16, fs - 1, dcol + 'ff', 'center', true);
        }
        var tw1 = Math.min(110, w * 0.3), tx1 = x0 + 14, ty = dby + 32;
        var teamLit = s.db === 'team' || s.db === 'join';
        rr(tx1, ty, tw1, 88, 6, teamLit ? P.yellow + '18' : 'none', (teamLit ? P.yellow : P.muted) + 'cc', teamLit ? 2 : 1.2);
        tx('team', tx1 + tw1 / 2, ty + 11, fs - 1, (teamLit ? P.yellow : P.sub) + 'ff', 'center', true);
        for (var r1 = 0; r1 < 5; r1++) {
            var rc = colorOf(TEAM_COL[r1]);
            var on1 = teamLit && (s.db === 'join' ? true : e > r1 / 6);
            rr(tx1 + 8, ty + 22 + r1 * 12, tw1 - 16, 8, 3, rc + (on1 ? 'cc' : '44'), 'none');
        }
        var mx = tx1 + tw1 + 16, mw = x0 + w - 14 - mx;
        var memLit = s.db === 'member' || s.db === 'join';
        rr(mx, ty, mw, 88, 6, memLit ? P.yellow + '18' : 'none', (memLit ? P.yellow : P.muted) + 'cc', memLit ? 2 : 1.2);
        tx('member', mx + mw / 2, ty + 11, fs - 1, (memLit ? P.yellow : P.sub) + 'ff', 'center', true);
        var gw = (mw - 16 - 4 * 6) / 5;
        for (var g = 0; g < 5; g++) {
            var gc = colorOf(TEAM_COL[g]);
            var ghit = s.hit && s.hit.indexOf(g) >= 0 && memLit;
            var gon = ghit ? (s.hit.length > 1 && s.db === 'member' && s.hit.length < 5 ? e > (s.hit.indexOf(g) / s.hit.length) : e > 0.1) : false;
            for (var m = 0; m < 3; m++) {
                rr(mx + 8 + g * (gw + 6), ty + 22 + m * 20, gw, 14, 3, gc + (gon ? 'cc' : '33'), gon ? gc + 'ff' : 'none', 1);
            }
        }

        if (s.warn) tx('⚠ ' + s.warn, x0 + w / 2, dby + L.dbH + 14, fs - 0.5, P.red + 'ff', 'center', true);
        else if (s.fm) tx(s.fm, x0 + w / 2, dby + L.dbH + 16, fs + 1, qcol + 'ff', 'center', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('nplus-viz__speed-btn--active'); });
        btn.classList.add('nplus-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('nplus-viz__mode-btn--active', d.key === m); });
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