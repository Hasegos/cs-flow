/**
 * 백업 / 복구(WAL) 시각화
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
    var root    = el('div', 'wl-viz');
    var toolbar = el('div', 'wl-viz__toolbar');
    var tbLeft  = el('div', 'wl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'wl-viz__title', 'WAL'));

    var modeWrap = el('div', 'wl-viz__mode');
    var modeDefs = [
        { key: 'wal', label: 'WAL 원칙' },
        { key: 'crash', label: '장애 복구' },
        { key: 'pitr', label: 'PITR' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'wl-viz__mode-btn' + (i === 0 ? ' wl-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'wl-viz__speed');
    speedWrap.appendChild(el('span', 'wl-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'wl-viz__speed-btn' + (i === 0 ? ' wl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'wl-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'wl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'wl-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'wl-viz__controls');
    var btnPlay  = el('button', 'wl-viz__btn wl-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'wl-viz__btn', '▶| STEP');
    var btnReset = el('button', 'wl-viz__btn', '↺ RESET');
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
    var mode    = 'wal';
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

    /* ===================== 엔진: 저장소 세 곳과 시간선 ===================== */
    function li(t, c) {
        return { t: t, c: c };
    }
    function fl(from, to, label) {
        return { from: from, to: to, label: label };
    }
    function sstep(mem, wal, file, act, dead, flow, cap, cap2, cap3, log) {
        return { kind: 'store', mem: mem, wal: wal, file: file, act: act, dead: dead, flow: flow, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function tstep(o) {
        return { kind: 'time', base: !!o.base, arch: o.arch || 0, acc: o.acc || 0, rep: o.rep === undefined ? -1 : o.rep, tgt: o.tgt || 0, cap: o.cap, cap2: o.cap2, cap3: o.cap3, log: o.log };
    }

    /* ===================== 데이터: WAL 원칙 ===================== */
    var WAL_STEPS = [];
    (function () {
        WAL_STEPS.push(sstep([li('x = 1', 'ok')], [], [li('x = 1', 'ok')], '', false, null, 'WAL: 데이터 파일보다 로그를 먼저 쓴다', '변경 내용을 로그에 먼저 기록', '장애가 나도 로그로 복구', 'WAL(Write-Ahead Logging)은 데이터 페이지를 디스크에 쓰기 전에 그 변경 내용을 로그에 먼저 기록하는 방식입니다. 메모리의 버퍼, 디스크의 WAL 로그, 디스크의 데이터 파일 세 곳에서 x = 1이 x = 2로 바뀌는 과정을 봅니다. 값은 설명을 위한 예시입니다.'));
        WAL_STEPS.push(sstep([li('x = 2', 'dirty'), li('(더티 페이지)', 'dirty')], [li('T1 x:1→2', 'rec')], [li('x = 1', 'ok')], 'mem', false, null, '① 변경: 메모리 페이지와 로그 레코드', '데이터 파일은 아직 x = 1', '변경된 메모리 페이지 = 더티 페이지', 'UPDATE x = 2를 실행하면 메모리의 페이지가 바뀌고 이 변경을 설명하는 로그 레코드(T1 x:1→2)가 만들어집니다. 디스크의 데이터 파일은 아직 x = 1입니다. 로그 레코드는 해당 페이지가 디스크에 쓰이기 전에 반드시 먼저 디스크에 기록되어야 합니다.'));
        WAL_STEPS.push(sstep([li('x = 2', 'dirty')], [li('T1 x:1→2', 'rec'), li('T1 COMMIT', 'commit')], [li('x = 1', 'ok')], 'wal', false, fl('mem', 'wal', 'flush'), '② 커밋: 로그를 디스크에 기록(flush)', '커밋은 WAL이 디스크에 닿은 뒤 완료', '데이터 파일은 아직 안 써도 됨', '기본 설정(synchronous_commit = on)에서 COMMIT은 커밋 레코드까지 WAL을 디스크에 기록하고, 그것이 끝나야 커밋이 완료되었다고 응답합니다. 로그는 순서대로 이어 붙이는 쓰기라 데이터 페이지를 여기저기 쓰는 것보다 부담이 작고, 데이터 파일은 이 시점에 쓰지 않아도 됩니다.'));
        WAL_STEPS.push(sstep([li('x = 2', 'ok')], [li('T1 x:1→2', 'rec'), li('T1 COMMIT', 'commit')], [li('x = 2', 'ok')], 'file', false, fl('mem', 'file', '체크포인트'), '③ 체크포인트: 더티 페이지를 데이터 파일에 기록', '로그를 먼저 쓴다는 원칙은 유지', '이전 로그는 필요 없어지면 재활용 가능', '나중에 체크포인트(백그라운드 라이터가 미리 쓰기도 합니다)가 더티 페이지를 데이터 파일에 기록해 x = 2가 디스크 데이터 파일에도 반영됩니다. 체크포인트의 재생 시작 지점보다 앞선 WAL 세그먼트는 복구에 필요 없어져 재활용하거나 지울 수 있습니다(아카이브 중이면 보관이 끝난 뒤).'));
        WAL_STEPS.push(sstep([li('x = 2', 'ok')], [li('T1 x:1→2', 'rec'), li('T1 COMMIT', 'commit')], [li('x = 2', 'ok')], '', false, null, 'WAL: 로그 먼저, 데이터 파일은 나중에', '순서대로 쓰는 로그 덕에 빠른 커밋', '장애 후 로그를 재생해 복구', '정리 — WAL은 변경 내용을 로그에 먼저 기록하고, 기본 설정에서 커밋은 로그가 디스크에 닿으면 완료되며, 데이터 파일은 나중에 체크포인트 등이 반영합니다. 그래서 장애가 나도 로그를 다시 재생하면 커밋된 변경을 복구할 수 있습니다. 다음 탭에서 확인합니다.'));
    })();

    /* ===================== 데이터: 장애 복구 ===================== */
    var CRASH_STEPS = [];
    (function () {
        var W = [li('T1 x:1→2', 'rec'), li('T1 COMMIT', 'commit'), li('T2 y:5→9', 'open')];
        CRASH_STEPS.push(sstep([li('x = 2', 'dirty'), li('y = 9', 'dirty')], W, [li('x = 1', 'ok'), li('y = 5', 'ok')], '', false, null, '장애 직전: 커밋된 T1과 진행 중인 T2', 'T1은 커밋 완료 · T2는 커밋 전', '데이터 파일에는 아직 반영 안 됨', '장애가 나기 직전 상태입니다. T1은 x를 2로 바꾸고 커밋했고, T2는 y를 9로 바꿨지만 커밋하지 못했습니다. 메모리의 두 변경은 아직 데이터 파일에 쓰이지 않았고, WAL에는 로그 레코드가 남아 있습니다.'));
        CRASH_STEPS.push(sstep([li('(사라짐)', 'dead')], W, [li('x = 1', 'ok'), li('y = 5', 'ok')], 'mem', true, null, '서버가 갑자기 꺼진다', '메모리의 변경은 사라짐', '디스크의 WAL과 데이터 파일은 남음', '전원 장애나 비정상 종료로 서버가 꺼지면 메모리의 내용이 사라집니다. 데이터 파일은 x = 1, y = 5의 옛 값이고 T1의 커밋은 WAL에만 남아 있습니다. WAL이 없었다면 커밋한 T1의 변경이 사라졌을 것입니다.'));
        CRASH_STEPS.push(sstep([li('x = 2', 'ok'), li('y = 5', 'ok')], [li('T1 x:1→2', 'redo'), li('T1 COMMIT', 'redo'), li('T2 y:5→9', 'skip')], [li('x = 1', 'ok'), li('y = 5', 'ok')], 'wal', false, fl('wal', 'mem', 'redo'), '재시작: WAL을 재생해 커밋된 변경을 복원', 'T1은 커밋 기록이 있어 redo', 'T2는 커밋 기록이 없어 결과에 안 보임', '재시작하면 마지막 체크포인트가 가리키는 지점부터 WAL을 재생합니다. 커밋 기록이 있는 T1의 x:1→2는 결과에 남고, 커밋 기록이 없는 T2의 y:5→9는 결과에 보이지 않습니다. 이 모델은 설명을 위해 커밋된 트랜잭션만 재생하는 것으로 단순화했으며, 실제 PostgreSQL은 로그를 모두 재생한 뒤 커밋되지 않은 변경을 MVCC 규칙으로 보이지 않게 둡니다.'));
        CRASH_STEPS.push(sstep([li('x = 2', 'ok'), li('y = 5', 'ok')], [li('T1 x:1→2', 'redo'), li('T1 COMMIT', 'redo'), li('T2 y:5→9', 'skip')], [li('x = 1', 'ok'), li('y = 5', 'ok')], '', false, null, '복구 완료: 커밋된 변경만 남는다', 'x = 2 (T1 복원) · y = 5 (T2 안 보임)', '서버가 다시 서비스 가능', '복구가 끝나면 커밋된 T1의 변경(x = 2)만 남고 미커밋 T2의 변경은 결과에 보이지 않습니다. 이후 체크포인트가 복구된 상태를 데이터 파일에 기록합니다.'));
        CRASH_STEPS.push(sstep([li('x = 2', 'ok'), li('y = 5', 'ok')], [li('T1 x:1→2', 'redo'), li('T1 COMMIT', 'redo'), li('T2 y:5→9', 'skip')], [li('x = 1', 'ok'), li('y = 5', 'ok')], '', false, null, 'WAL 덕에 커밋은 장애에도 살아남는다', '내구성(Durability)을 지키는 장치', '재생이 끝나면 일관된 상태로 복귀', '정리 — WAL은 커밋된 변경이 장애 뒤에도 남는 내구성을 지켜 줍니다. 커밋은 로그가 디스크에 닿은 뒤 완료되므로, 재시작 때 로그를 재생해 커밋된 내용을 복원하고 커밋되지 않은 변경은 결과에 보이지 않게 합니다.'));
    })();

    /* ===================== 데이터: PITR ===================== */
    var PITR_STEPS = [];
    (function () {
        PITR_STEPS.push(tstep({ cap: 'PITR: 원하는 시점으로 되돌리는 복구', cap2: '베이스 백업 + WAL 아카이브를 사용', cap3: '사람의 실수로 인한 손실에 유용', log: 'PITR(Point-In-Time Recovery)은 정기적으로 받아 둔 베이스 백업에 이후의 WAL을 이어서 재생하되 원하는 시점에서 멈춰, 그 시점의 상태로 데이터베이스를 복구하는 방법입니다. 시간은 설명을 위한 가상의 눈금입니다.' }));
        PITR_STEPS.push(tstep({ base: true, cap: '① 베이스 백업: 한 시점의 전체 복사본', cap2: 't = 0에 데이터 파일 전체를 복사', cap3: '복구의 출발점', log: '먼저 t = 0에 베이스 백업을 받습니다. 데이터베이스 파일 전체를 복사한 것으로, 복사 중 생긴 불일치는 WAL 재생이 바로잡아 주므로 복구의 출발점이 됩니다.' }));
        PITR_STEPS.push(tstep({ base: true, arch: 7, cap: '② WAL 아카이브: 완성된 WAL을 계속 보관', cap2: '베이스 백업 이후 모든 변경이 로그로 남음', cap3: '로그가 이어져야 원하는 시점까지 재생 가능', log: '그 뒤로 서버가 채운 WAL 세그먼트를 따로 안전한 곳에 계속 보관(아카이브)합니다. 베이스 백업 이후의 WAL이 끊기지 않고 이어져 있어야 원하는 시점까지 재생할 수 있습니다. 아직 채워지지 않은 마지막 세그먼트의 최신 변경은 아카이브에 없을 수 있습니다.' }));
        PITR_STEPS.push(tstep({ base: true, arch: 7, acc: 5, cap: '③ 사고: t = 5에 잘못된 DELETE', cap2: '이 DELETE도 WAL 아카이브에 기록됨', cap3: '복제본에도 그대로 전파되어 복제로는 못 막음', log: 't = 5에 실수로 중요한 행을 DELETE했습니다. 이 DELETE도 WAL에 기록되고, 복제 서버가 있다면 그대로 전파됩니다. 복제는 실수를 되돌려 주지 않으므로 백업과 PITR이 필요합니다.' }));
        PITR_STEPS.push(tstep({ base: true, arch: 7, acc: 5, rep: 0, cap: '④ 복구: 베이스 백업을 먼저 복원', cap2: '복원한 상태는 t = 0 시점', cap3: '이제 WAL을 이어서 재생', log: '복구는 베이스 백업을 새 데이터 디렉터리에 복원하는 것에서 시작합니다. 이 상태는 t = 0 시점의 데이터이고, 이후의 변경은 WAL 아카이브에서 가져와 재생합니다.' }));
        PITR_STEPS.push(tstep({ base: true, arch: 7, acc: 5, rep: 4, tgt: 4, cap: '⑤ WAL을 재생하다 목표 시점에서 멈춘다', cap2: '복구 목표 t = 4 (사고 직전)', cap3: '사고(t = 5)는 재생하지 않음', log: 'WAL을 t = 0부터 차례로 재생하되 복구 목표 시점인 t = 4에서 멈춥니다. 목표는 PostgreSQL에서 시각(recovery_target_time)이나 트랜잭션 번호 같은 값으로 지정합니다. t = 5의 DELETE는 재생되지 않아 사고 직전 상태로 돌아옵니다.' }));
        PITR_STEPS.push(tstep({ base: true, arch: 7, acc: 5, rep: 4, tgt: 4, cap: 'PITR: 베이스 백업 + WAL로 원하는 시점', cap2: '잘못된 DELETE 직전 상태로 복구', cap3: '백업 주기와 WAL 보관 기간이 복구 범위를 정함', log: '정리 — PITR은 베이스 백업에 아카이브한 WAL을 재생하다 원하는 시점에서 멈춰 그 시점의 상태로 복구합니다. 베이스 백업의 주기와 WAL 보관 기간이 어디까지 되돌릴 수 있는지를 정합니다.' }));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'crash') return CRASH_STEPS;
        if (mode === 'pitr') return PITR_STEPS;
        return WAL_STEPS;
    }
    function defaultLog() {
        if (mode === 'crash') return '서버가 꺼졌다 다시 켜질 때 WAL로 복구하는 과정을 봅니다.';
        if (mode === 'pitr') return '베이스 백업과 WAL로 원하는 시점까지 되돌리는 과정을 봅니다.';
        return '메모리, WAL 로그, 데이터 파일 세 곳에서 변경이 기록되는 순서를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob, s) {
        var st = s || currentSteps()[0];
        var base = st.kind === 'time' ? 206 : 8 + 164 + 52;
        return { fs: mob ? 11.5 : 13, total: base + (mob ? 112 : 62) };
    }
    function sceneH(w, mob, s) { return layout(w, mob, s).total; }

    function caps(s, cx, w, y, fs) {
        var yy = y;
        [[s.cap, P.yellow, true, fs - 0.5], [s.cap2, P.text, false, fs - 1], [s.cap3, P.green, true, fs - 1]].forEach(function (c) {
            if (!c[0]) return;
            var ls = lines(c[0], w - 12, c[3]);
            ls.forEach(function (l, i) { tx(l, cx, yy + i * (c[3] + 5), c[3], c[1] + 'ee', 'center', c[2]); });
            yy += ls.length * (c[3] + 5) + 3;
        });
    }

    function itemIdx(list, t) {
        for (var i = 0; i < list.length; i++) { if (list[i].t === t) return i; }
        return -1;
    }

    /* ===================== 저장소: 메모리, WAL, 데이터 파일 ===================== */
    function drawStore(x0, top, w, mob, s, p, e) {
        var fs = mob ? 11.5 : 13;
        var gap = mob ? 8 : 16;
        var bw = (w - gap * 2) / 3;
        var H = 164;
        var y0 = top + 8;
        var names = ['메모리', 'WAL 로그', '데이터 파일'];
        var keys = ['mem', 'wal', 'file'];
        var sub = ['(버퍼)', '(디스크)', '(디스크)'];
        var lists = [s.mem, s.wal, s.file];
        var plists = [p.mem, p.wal, p.file];
        var CC = { ok: P.text, dirty: P.orange, dead: P.red, rec: P.teal, commit: P.green, open: P.orange, redo: P.green, skip: P.sub };
        var k, j;
        for (k = 0; k < 3; k++) {
            var x = x0 + k * (bw + gap);
            var act = s.act === keys[k];
            var dead = k === 0 && s.dead;
            var bc = dead ? P.red : P.teal;
            var shake = dead && !p.dead && e < 1 ? Math.sin(e * 40) * 3 : 0;
            rr(x + shake, y0, bw, H, 8, bc + '11', bc + 'ff', act ? 3 : 1.6);
            if (act && e < 1) circ(x + bw / 2, y0 + H / 2, 10 + e * 40, 'none', bc + 'ff', 1.6);
            tx(names[k], x + bw / 2 + shake, y0 + 14, fs, P.text + 'ff', 'center', true);
            tx(sub[k], x + bw / 2 + shake, y0 + 30, fs - 1, P.sub + 'ff', 'center', false);
            var arrive = s.flow && s.flow.to === keys[k] ? 0.55 : 0;
            var fi = 0;
            for (j = 0; j < plists[k].length; j++) {
                if (itemIdx(lists[k], plists[k][j].t) >= 0) continue;
                var gcol = CC[plists[k][j].c];
                ctx.globalAlpha = clamp01(1 - e * 2);
                rr(x + 6 + shake, y0 + 44 + j * 34, bw - 12, 28, 5, gcol + '22', gcol + 'ff', 1.4);
                tx(plists[k][j].t, x + bw / 2 + shake, y0 + 44 + j * 34 + 14, fs - 1, gcol + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
            for (j = 0; j < lists[k].length; j++) {
                var it = lists[k][j];
                var col = CC[it.c];
                var ry = y0 + 44 + j * 34;
                var oi = itemIdx(plists[k], it.t);
                var al = 1, off = 0, sc = col, lw2 = 1.4;
                if (oi < 0) {
                    var q = clamp01((e - arrive - fi * 0.12) / 0.4);
                    al = q;
                    off = (1 - q) * 10;
                    fi++;
                } else if (plists[k][oi].c !== it.c && e < 1) {
                    sc = P.yellow;
                    lw2 = 2.6;
                }
                ctx.globalAlpha = al;
                rr(x + 6 + shake, ry + off, bw - 12, 28, 5, col + '22', sc + 'ff', lw2);
                tx(it.t, x + bw / 2 + shake, ry + off + 14, fs - 1, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
        if (s.flow) {
            var fx = x0 + keys.indexOf(s.flow.from) * (bw + gap) + bw / 2;
            var tx2 = x0 + keys.indexOf(s.flow.to) * (bw + gap) + bw / 2;
            var fy = y0 + H + 14;
            ln(fx, y0 + H, fx, fy, P.purple + 'ff', 2.2);
            ln(fx, fy, tx2, fy, P.purple + 'ff', 2.2);
            ln(tx2, fy, tx2, y0 + H + 2, P.purple + 'ff', 2.2);
            ln(tx2, y0 + H + 2, tx2 - 5, y0 + H + 9, P.purple + 'ff', 2.2);
            ln(tx2, y0 + H + 2, tx2 + 5, y0 + H + 9, P.purple + 'ff', 2.2);
            tx(s.flow.label, (fx + tx2) / 2, fy + 14, fs - 0.5, P.purple + 'ff', 'center', true);
            if (e < 0.6) {
                var l2 = Math.abs(tx2 - fx);
                var tot = 28 + l2;
                var d = clamp01(e / 0.55) * tot;
                var px, py;
                if (d < 14) { px = fx; py = y0 + H + d; }
                else if (d < 14 + l2) { px = fx + (tx2 >= fx ? 1 : -1) * (d - 14); py = fy; }
                else { px = tx2; py = fy - (d - 14 - l2); }
                circ(px, py, 6, P.yellow + 'ff', 'none');
            }
        }
        caps(s, x0 + w / 2, w, y0 + H + (s.flow ? 52 : 28), fs);
    }

    /* ===================== 시간선: 베이스 백업과 WAL 아카이브 ===================== */
    function drawTime(x0, top, w, mob, s, p, e) {
        var fs = mob ? 11.5 : 13;
        var lx = x0 + 22;
        var cw = (w - 44) / 8;
        var gx = function (t) { return lx + t * cw; };
        var k;
        var ay = top + 26, by = top + 66, wy = top + 108, ry = top + 160;
        ln(lx, ay, x0 + w - 8, ay, P.sub + 'ff', 1.6);
        for (k = 0; k <= 8; k++) tx(String(k), gx(k), ay - 12, fs - 1.5, P.sub + 'ff', 'center', false);
        if (s.base) {
            var bf = !p.base;
            var bq = bf ? clamp01(e * 2) : 1;
            ctx.globalAlpha = bq;
            rr(gx(0) - 8, by - 9, 18, 18, 4, P.teal + '66', P.teal + 'ff', 2);
            tx('베이스 백업 (t = 0)', gx(0) + 18, by, fs - 1, P.teal + 'ff', 'left', true);
            ctx.globalAlpha = 1;
            if (bf && e < 1) circ(gx(0) + 1, by, 8 + e * 24, 'none', P.teal + 'ff', 2);
        }
        tx('WAL 아카이브', x0 + 2, wy - 18, fs - 1, P.sub + 'ff', 'left', true);
        rr(lx, wy - 8, 8 * cw, 16, 3, 'none', P.sub + '55', 1);
        var aw = lerp(p.arch, s.arch, e);
        if (aw > 0) {
            rr(lx, wy - 8, aw * cw, 16, 3, P.green + '55', P.green + 'ff', 1.6);
            for (k = 1; k < aw; k++) ln(gx(k), wy - 8, gx(k), wy + 8, P.green + 'ff', 1);
            if (e < 1 && s.arch !== p.arch) circ(gx(aw), wy, 5, P.yellow + 'ff', 'none');
        }
        tx('복구(재생)', x0 + 2, ry - 18, fs - 1, P.sub + 'ff', 'left', true);
        rr(lx, ry - 8, 8 * cw, 16, 3, 'none', P.sub + '55', 1);
        if (s.rep >= 0) {
            var restoring = p.rep < 0;
            if (restoring && e < 1) {
                rr(gx(0) - 7, lerp(by - 9, ry - 8, e), 14, 16, 3, P.teal + '88', P.teal + 'ff', 1.6);
            } else {
                rr(gx(0) - 7, ry - 8, 14, 16, 3, P.teal + '88', P.teal + 'ff', 1.6);
            }
            var rw = restoring ? s.rep : lerp(p.rep, s.rep, e);
            if (rw > 0) {
                rr(lx, ry - 8, rw * cw, 16, 3, P.orange + '66', P.orange + 'ff', 1.8);
                if (e < 1) circ(gx(rw), ry, 5, P.yellow + 'ff', 'none');
            }
        }
        if (s.acc) {
            var af = !p.acc;
            var ey = af ? lerp(ay, ry + 12, e) : ry + 12;
            ctx.setLineDash([4, 3]);
            ln(gx(s.acc), ay, gx(s.acc), ey, P.red + 'ff', 2);
            ctx.setLineDash([]);
            tx('✕ 사고', gx(s.acc) + 6, ay + 14, fs - 1, P.red + 'ff', 'left', true);
            if (af && e < 1) circ(gx(s.acc), ay, 6 + e * 22, 'none', P.red + 'ff', 2);
        }
        if (s.tgt) {
            ctx.globalAlpha = p.tgt ? 1 : clamp01((e - 0.4) / 0.6);
            ln(gx(s.tgt), ay, gx(s.tgt), ry + 12, P.purple + 'ff', 2.4);
            tx('목표', gx(s.tgt) - 6, ay + 14, fs - 1, P.purple + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }
        caps(s, x0 + w / 2, w, top + 206, fs);
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (s.kind === 'time') {
            if (p.kind !== 'time') p = s;
            drawTime(x0, top, w, mob, s, p, e);
        } else {
            if (p.kind !== 'store') p = s;
            drawStore(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('wl-viz__speed-btn--active'); });
        btn.classList.add('wl-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('wl-viz__mode-btn--active', d.key === m); });
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