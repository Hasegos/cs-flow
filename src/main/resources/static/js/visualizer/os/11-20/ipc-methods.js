/**
 * 프로세스 간 통신(IPC) 시각화
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
    var root    = el('div', 'ipc-viz');
    var toolbar = el('div', 'ipc-viz__toolbar');
    var tbLeft  = el('div', 'ipc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ipc-viz__title', 'IPC'));

    var modeWrap = el('div', 'ipc-viz__mode');
    var modeDefs = [
        { key: 'pipe', label: '파이프' },
        { key: 'copy', label: '공유 메모리 vs 파이프' },
        { key: 'choose', label: '방식 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ipc-viz__mode-btn' + (i === 0 ? ' ipc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ipc-viz__speed');
    speedWrap.appendChild(el('span', 'ipc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ipc-viz__speed-btn' + (i === 0 ? ' ipc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ipc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ipc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ipc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ipc-viz__controls');
    var btnPlay  = el('button', 'ipc-viz__btn ipc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ipc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ipc-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 파이프 ===================== */
    var CAP = 4;
    var OPS = [['W', 'A'], ['W', 'B'], ['W', 'C'], ['R'], ['W', 'D'], ['W', 'E'], ['W', 'F'], ['R']];
    function runPipe() {
        var buf = [];
        var out = [];
        var pending = null;
        var snaps = [];
        OPS.forEach(function (op) {
            var note = '';
            if (op[0] === 'W') {
                if (buf.length < CAP) {
                    buf.push(op[1]);
                    note = '쓰는 쪽이 ' + op[1] + '를 파이프에 씁니다. 버퍼에 자리가 있어 바로 들어갑니다(' + buf.length + '/' + CAP + ').';
                } else {
                    pending = op[1];
                    note = '쓰는 쪽이 ' + op[1] + '를 쓰려 하지만 버퍼가 가득 찼습니다(' + buf.length + '/' + CAP + '). 읽는 쪽이 비울 때까지 쓰는 쪽이 대기(블록)합니다.';
                }
            } else {
                var got = buf.shift();
                out.push(got);
                note = '읽는 쪽이 ' + got + '를 가져갑니다. 먼저 들어간 데이터가 먼저 나옵니다(FIFO).';
                if (pending) {
                    buf.push(pending);
                    note += ' 자리가 생겨 대기하던 ' + pending + '가 들어갑니다.';
                    pending = null;
                }
            }
            snaps.push({ buf: buf.slice(), out: out.slice(), pending: pending, log: note });
        });
        return snaps;
    }
    var PIPE_SNAPS = runPipe();
    var PIPE_STEPS = [{ s: null, log: '파이프 — 한쪽에서 쓰고 다른 쪽에서 읽는 단방향 바이트 통로입니다. 커널이 관리하는 버퍼를 사이에 두며, 이 그림의 버퍼 크기 ' + CAP + '는 설명용 값입니다.' }]
        .concat(PIPE_SNAPS.map(function (s) { return { s: s, log: s.log }; }))
        .concat([{ s: PIPE_SNAPS[PIPE_SNAPS.length - 1], log: '정리 — 파이프는 커널 버퍼를 거치며 순서가 보장되고, 버퍼가 차면 쓰는 쪽이, 비면 읽는 쪽이 기다립니다. 별도의 동기화 코드 없이 흐름이 조절됩니다.' }]);

    /* ===================== 데이터: 공유 메모리 vs 파이프 ===================== */
    var N_MSG = 5;
    var SETUP_SYS = 2;
    var PIPE_COST = { sys: 2 * N_MSG, copy: 2 * N_MSG };
    var SHM_COST  = { sys: SETUP_SYS, copy: 0 };
    function lostUpdate(sync) {
        var counter = 0;
        if (sync) { counter += 1; counter += 1; return counter; }
        var a = counter;
        var b = counter;
        counter = a + 1;
        counter = b + 1;
        return counter;
    }
    var RACE_BAD = lostUpdate(false);
    var RACE_OK  = lostUpdate(true);

    var COPY_STEPS = [
        { k: 0, log: '메시지 ' + N_MSG + '개를 보내는 데 드는 비용을 비교합니다. 시스템 콜과 데이터 복사 횟수는 일반적인 구현을 단순화해 센 값입니다.' },
        { k: 1, log: '파이프 — 메시지마다 보내는 쪽이 write(시스템 콜)로 데이터를 커널 버퍼에 복사하고, 받는 쪽이 read(시스템 콜)로 자기 버퍼에 복사합니다. 메시지당 시스템 콜 2번, 복사 2번입니다.' },
        { k: 2, log: '공유 메모리 — 두 프로세스가 같은 메모리 영역을 자기 주소 공간에 연결해 둔 뒤에는 보내는 쪽이 쓴 데이터를 받는 쪽이 그 자리에서 읽습니다. 연결할 때만 커널이 관여합니다.' },
        { k: 3, log: '메시지 ' + N_MSG + '개 기준 파이프는 시스템 콜 ' + PIPE_COST.sys + '번·복사 ' + PIPE_COST.copy + '번, 공유 메모리는 시스템 콜 ' + SHM_COST.sys + '번(설정용 가정)·추가 복사 ' + SHM_COST.copy + '번입니다.' },
        { k: 4, log: '대신 동기화를 직접 해야 합니다. 두 프로세스가 동기화 없이 같은 카운터를 각각 1씩 올리면 둘 다 0을 읽고 1을 써서 최종 ' + RACE_BAD + '이 됩니다(기대 ' + RACE_OK + '). 세마포어나 뮤텍스가 필요합니다.' },
        { k: 4, log: '정리 — 공유 메모리는 가장 빠른 편이지만 동기화는 개발자 몫이고, 파이프나 메시지 큐는 커널이 순서와 대기를 처리해 주는 대신 복사와 시스템 콜 비용이 듭니다.' }
    ];

    /* ===================== 데이터: 방식 비교 ===================== */
    var METHODS = [
        { name: '파이프', scope: '같은 컴퓨터', note: '단방향 바이트 스트림, 보통 fork로 이어진 관련 프로세스', net: false },
        { name: '이름 있는 파이프(FIFO)', scope: '같은 컴퓨터', note: '파일 시스템의 이름으로 연결, 관련 없는 프로세스도 가능', net: false },
        { name: '메시지 큐', scope: '같은 컴퓨터', note: '메시지 단위로 커널 큐에 보관', net: false },
        { name: '공유 메모리', scope: '같은 컴퓨터', note: '같은 메모리를 직접 읽고 씀, 동기화는 직접', net: false },
        { name: '소켓', scope: '같은 컴퓨터·네트워크', note: 'IP와 포트로 다른 컴퓨터의 프로세스와도 통신', net: true },
        { name: '시그널', scope: '같은 컴퓨터', note: '짧은 알림 신호, 데이터를 실어 보내는 용도가 아님', net: false }
    ];
    var CHOOSE_STEPS = [{ k: 0, log: 'IPC 방식은 통신 범위, 데이터 형태, 동기화 책임이 다릅니다. 방식을 하나씩 봅니다.' }]
        .concat(METHODS.map(function (m, i) {
            return { k: i + 1, log: m.name + ' — ' + m.note + '. 범위: ' + m.scope + '.' };
        }))
        .concat([{ k: METHODS.length, hl: true, log: '정리 — 다른 컴퓨터의 프로세스와 통신하려면 소켓을, 같은 컴퓨터에서 대량 데이터를 빠르게 주고받으려면 공유 메모리를, 단순한 흐름에는 파이프를 고릅니다.' }]);

    /* ===================== 상태 ===================== */
    var mode    = 'pipe';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'copy') return COPY_STEPS;
        if (mode === 'choose') return CHOOSE_STEPS;
        return PIPE_STEPS;
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

    /* ===================== 공통: 선 ===================== */
    function ln(x1, y1, x2, y2, col, lw) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw || 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /* ===================== 모드: 파이프 ===================== */
    function drawPipe(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var s  = step ? step.s : null;
        var bw = mob ? 62 : 84;
        var bh = 56;
        var gap = mob ? 10 : 16;
        var sw = (w - 2 * bw - 2 * gap - 8) / CAP;
        var y  = top + 40;
        rr(x0, y, bw, bh, 6, P.orange + '22', P.orange + 'cc', 1.6);
        tx('프로세스 A', x0 + bw / 2, y + 18, fs - 1, P.orange + 'ee', 'center', true);
        tx('쓰는 쪽', x0 + bw / 2, y + 38, fs - 1.5, P.muted + 'ee', 'center', false);
        var rx = x0 + w - bw;
        rr(rx, y, bw, bh, 6, P.teal + '22', P.teal + 'cc', 1.6);
        tx('프로세스 B', rx + bw / 2, y + 18, fs - 1, P.teal + 'ee', 'center', true);
        tx('읽는 쪽', rx + bw / 2, y + 38, fs - 1.5, P.muted + 'ee', 'center', false);
        var px = x0 + bw + gap;
        tx('파이프 (커널 버퍼 ' + CAP + '칸)', px, y - 14, fs - 1, P.muted + 'ee', 'left', true);
        for (var i = 0; i < CAP; i++) {
            var v = s && s.buf[i] ? s.buf[i] : null;
            rr(px + i * (sw + 2), y + 8, sw, 40, 4, v ? P.purple + '30' : 'none', v ? P.purple + 'cc' : P.muted + '44', 1.4);
            if (v) tx(v, px + i * (sw + 2) + sw / 2, y + 28, fs + 1, P.purple + 'ee', 'center', true);
        }
        ln(x0 + bw, y + 28, px - 2, y + 28, P.orange + 'aa', 1.6);
        ln(px + CAP * (sw + 2), y + 28, rx, y + 28, P.teal + 'aa', 1.6);
        if (s && s.pending) tx('쓰기 대기(블록): ' + s.pending, x0, y + bh + 22, fs, P.red + 'ee', 'left', true);
        var cnt = s ? s.buf.length : 0;
        tx('버퍼 ' + cnt + '/' + CAP, x0 + w, y + bh + 22, fs - 0.5, P.muted + 'ee', 'right', false);
        tx('B가 읽은 데이터: ' + (s && s.out.length ? s.out.join(', ') : '-'), x0, y + bh + 52, fs + 0.5, P.green + 'ee', 'left', true);
    }

    /* ===================== 모드: 공유 메모리 vs 파이프 ===================== */
    function drawCopy(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var bw = (w - 2 * (mob ? 16 : 28)) / 3;
        var gap = mob ? 16 : 28;
        var bh = 40;
        var rows = [
            [1, '파이프', top + 22, ['보내는 쪽', '커널 버퍼', '받는 쪽'], P.orange],
            [2, '공유 메모리', top + 112, ['보내는 쪽', '공유 영역', '받는 쪽'], P.teal]
        ];
        rows.forEach(function (row) {
            var on = k >= row[0];
            var y = row[2];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            for (var i = 0; i < 3; i++) {
                var bx = x0 + i * (bw + gap);
                rr(bx, y, bw, bh, 5, on ? row[4] + (i === 1 ? '30' : '18') : 'none', on ? row[4] + 'cc' : P.muted + '33', 1.4);
                if (on) tx(row[3][i], bx + bw / 2, y + bh / 2, fs - 1, P.text + 'ee', 'center', true);
            }
            if (!on) return;
            if (row[0] === 1) {
                [0, 1].forEach(function (i) {
                    var ax = x0 + (i + 1) * bw + i * gap;
                    ln(ax, y + bh / 2, ax + gap, y + bh / 2, row[4] + 'cc', 1.6);
                    tx('복사', ax + gap / 2, y - 4, fs - 3, P.yellow + 'ee', 'center', true);
                });
            } else {
                tx('직접 읽고 씀 — 복사 없음', x0 + w / 2, y + bh + 14, fs - 1, P.green + 'ee', 'center', true);
            }
        });
        if (k >= 3) {
            var by = top + 190;
            var maxW = w - (mob ? 96 : 130);
            var items = [
                ['시스템 콜', PIPE_COST.sys, SHM_COST.sys, Math.max(PIPE_COST.sys, SHM_COST.sys)],
                ['복사', PIPE_COST.copy, SHM_COST.copy, Math.max(PIPE_COST.copy, 1)]
            ];
            tx('메시지 ' + N_MSG + '개 기준', x0, by - 8, fs - 0.5, P.muted + 'ee', 'left', false);
            items.forEach(function (it, ii) {
                var y = by + ii * 40;
                tx(it[0], x0, y + 12, fs - 0.5, P.text + 'ee', 'left', true);
                [[it[1], P.orange, 0], [it[2], P.teal, 1]].forEach(function (b) {
                    var yy = y + b[2] * 16;
                    var bwid = Math.max(2, maxW * b[0] / it[3]);
                    var bx = x0 + (mob ? 56 : 70);
                    rr(bx, yy + 2, bwid, 12, 3, b[1] + '30', b[1] + 'cc', 1.2);
                    tx(String(b[0]), bx + bwid + 6, yy + 8, fs - 1.5, b[1] + 'ee', 'left', true);
                });
            });
        }
        if (k >= 4) tx('동기화 없는 동시 쓰기: 최종 ' + RACE_BAD + ' (기대 ' + RACE_OK + ')', x0, top + 290, fs, P.red + 'ee', 'left', true);
    }

    /* ===================== 모드: 방식 비교 ===================== */
    function drawChoose(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var rh = mob ? 44 : 38;
        tx('IPC 방식', x0, top + 10, fs, P.text + 'ee', 'left', true);
        tx('통신 범위', x0 + w, top + 10, fs - 1, P.muted + 'ee', 'right', true);
        METHODS.forEach(function (m, i) {
            var y = top + 26 + i * (rh + 6);
            var on = k > i;
            var cur = k === i + 1;
            var col = m.net ? P.orange : P.teal;
            rr(x0, y, w - 2, rh, 5, on ? col + (cur ? '2a' : '14') : 'none', on ? col + (cur ? 'ff' : '88') : P.muted + '33', cur ? 2 : 1.2);
            if (!on) return;
            tx(m.name, x0 + 10, y + (mob ? 14 : rh / 2), fs - (mob ? 0.5 : 0), P.text + 'ee', 'left', true);
            tx(m.scope, x0 + w - 10, y + (mob ? 14 : rh / 2), fs - 1.5, col + 'ee', 'right', true);
            if (mob) tx(m.note.length > 24 ? m.note.slice(0, 24) + '…' : m.note, x0 + 10, y + 31, fs - 2, P.muted + 'ee', 'left', false);
        });
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

        if (mode === 'copy') drawCopy(padX, top, fullW, mob, step);
        else if (mode === 'choose') drawChoose(padX, top, fullW, mob, step);
        else drawPipe(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP을 눌러 프로세스 간 통신 방식을 확인하세요.';
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
        if (mode === 'copy') neededH = mob ? 340 : 340;
        else if (mode === 'choose') neededH = mob ? 360 : 330;
        else neededH = mob ? 230 : 230;
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
        if (mode === 'copy') return '파이프와 공유 메모리가 데이터를 주고받을 때 드는 시스템 콜과 복사 횟수를 비교합니다.';
        if (mode === 'choose') return '파이프, FIFO, 메시지 큐, 공유 메모리, 소켓, 시그널의 통신 범위와 특징을 비교합니다.';
        return '한쪽에서 쓰고 다른 쪽에서 읽는 파이프가 버퍼를 거치며 동작하는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ipc-viz__speed-btn--active'); });
        btn.classList.add('ipc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ipc-viz__mode-btn--active', d.key === m); });
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