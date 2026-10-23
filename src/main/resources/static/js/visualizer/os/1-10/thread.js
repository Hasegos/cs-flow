/**
 * 스레드 동작 원리 시각화
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
    var root    = el('div', 'thr-viz');
    var toolbar = el('div', 'thr-viz__toolbar');
    var tbLeft  = el('div', 'thr-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'thr-viz__title', 'Thread Execution'));

    var modeWrap = el('div', 'thr-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'thr-viz__mode-btn' + (i === 0 ? ' thr-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'thr-viz__speed');
    speedWrap.appendChild(el('span', 'thr-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'thr-viz__speed-btn' + (i === 0 ? ' thr-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'thr-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'thr-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'thr-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'thr-viz__controls');
    var btnPlay  = el('button', 'thr-viz__btn thr-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'thr-viz__btn', '▶| STEP');
    var btnReset = el('button', 'thr-viz__btn', '↺ RESET');
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
    var mode    = '';
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
    var tipHits = [];
    var mousePos = { x: -1, y: -1 };
    var hoveredKey = null;
    function tipHit(x, y, w, h, key) { tipHits.push({ x: x, y: y, w: w, h: h, key: key }); }
    function tipBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx - 10, cy - 10, 20, 20, key);
    }
    function drawTip(mx, my, text) {
        var parts = text.split(String.fromCharCode(10));
        var title = parts[0], desc = parts[1] || '';
        var W = GW(), H = GH();
        var pad = 14;
        var maxIn = W - 16 - pad * 2;
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var titleW = Math.min(maxIn, ctx.measureText(title).width);
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 42 + dl.length * 18 : 36;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tx(title, bx + pad, by + (desc ? 18 : th / 2), 14, P.text + 'ff', 'left', true);
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 42 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 툴팁 ===================== */
    const TOOLTIPS = {
        T1:   'Thread 1\nOS 스케줄러가 관리하는 실행 단위. 독립된 Stack과 PC를 가지며 Code·Data·Heap은 같은 프로세스 내 스레드들과 공유합니다.',
        T2:   'Thread 2\n같은 프로세스 내 다른 스레드. T1과 공유 메모리(counter)에 동시 접근 시 Race Condition이 발생할 수 있습니다.',
        T3:   'Thread 3\nReady Queue에서 대기 중인 스레드. CPU가 할당되면 Running 상태로 전이합니다.',
        CPU:  'CPU Core\n한 번에 하나의 스레드만 실행합니다(단일 코어 기준). OS 스케줄러가 타임 퀀텀마다 실행할 스레드를 결정합니다.',
        MEM:  'Shared Memory — counter\n프로세스 내 모든 스레드가 공유하는 전역 변수입니다. 동시에 읽기·쓰기가 발생하면 Race Condition이 생기므로 Mutex로 보호해야 합니다.',
        LOCK: 'Mutex Lock\n한 번에 하나의 스레드만 임계 구역(Critical Section)에 진입하도록 보장합니다. Lock 보유 스레드만 공유 자원에 접근하고, 나머지는 Blocked 상태로 대기합니다.',
    };

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge:  'T1 → CPU 진입',
            log:    'Step 1 — 스케줄러가 Ready Queue에서 Thread 1을 선택합니다. 디스패처가 TCB에서 레지스터·PC를 복원하고 CPU를 넘깁니다. T1은 Running 상태로 전이, T2·T3은 Ready Queue에서 대기합니다.',
            pkts:   [{ from: 'T1', to: 'CPU', col: 'T1' }],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 0, cpuLabel: 'T1', mutex: null,
        },
        {
            badge:  'T1: counter 읽기 (R1=0)',
            log:    'Step 2 — T1이 공유 변수 counter를 읽어 레지스터 R1에 저장합니다(R1=0). R1+1=1을 counter에 쓰려는 순간, 타이머 인터럽트가 발생할 수 있습니다.',
            pkts:   [{ from: 'CPU', to: 'MEM', col: 'T1' }],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 0, cpuLabel: 'T1', mutex: null,
            memNote: 'T1: R1 = 0',
        },
        {
            badge:  '컨텍스트 스위치 T1 → T2',
            log:    'Step 3 — 타임 퀀텀 만료! OS가 T1의 레지스터 상태(R1=0 포함)를 TCB에 저장하고 T2를 선택합니다. T1은 R1=0을 든 채 Ready 상태로 돌아가고, T2가 CPU를 넘겨받습니다.',
            pkts:   [{ from: 'CPU', to: 'T1', col: 'T1' }, { from: 'T2', to: 'CPU', col: 'T2' }],
            states: { T1: 'READY', T2: 'RUNNING', T3: 'READY' },
            counter: 0, cpuLabel: 'T2', mutex: null,
            ctxSwitch: true,
        },
        {
            badge:  'T2: counter 읽기 (R1=0)',
            log:    'Step 4 — T2도 counter를 읽습니다. T1이 아직 쓰기를 하지 않아 counter는 여전히 0입니다. T2의 R1에도 0이 들어갑니다. 두 스레드 모두 R1=0을 들고 있습니다. Race Condition 발생 직전입니다.',
            pkts:   [{ from: 'CPU', to: 'MEM', col: 'T2' }],
            states: { T1: 'READY', T2: 'RUNNING', T3: 'READY' },
            counter: 0, cpuLabel: 'T2', mutex: null,
            memNote: 'T2: R1 = 0', race: true,
        },
        {
            badge:  'Race Condition! 결과=1 (예상=2)',
            log:    'Step 5 — T2가 R1+1=1을 counter에 씁니다. 이후 T1이 재개되어 저장해 둔 R1=0에 +1=1을 다시 씁니다. 두 스레드가 각각 +1을 했지만 최종값은 1입니다. 예상값 2와 다릅니다! 갱신 분실(Lost Update)이 발생했습니다. (멀티코어에서는 두 코어가 동시에 counter를 읽을 수 있어 같은 결과가 더 자주 나타납니다)',
            pkts:   [],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 1, cpuLabel: 'T1', mutex: null,
            raceResult: true,
        },
        {
            badge:  'Mutex 적용 → counter=2',
            log:    'Step 6 — 이번에는 counter=0부터 Mutex로 임계 구역을 보호합니다. T1이 Lock을 획득하는 동안 T2는 Blocked 상태로 대기합니다. T1이 0→1로 안전하게 업데이트하고 Unlock하면, T2가 Lock을 획득해 1→2로 업데이트합니다. 최종값 2 정확합니다.',
            pkts:   [{ from: 'T1', to: 'CPU', col: 'T1' }, { from: 'CPU', to: 'MEM', col: 'T1' }],
            states: { T1: 'READY', T2: 'RUNNING', T3: 'READY' },
            counter: 2, cpuLabel: 'T2', mutex: 'LOCKED',
            mutexOk: true,
        },
    ];

    var TIPS = TOOLTIPS;
    /* ===================== 상태 ===================== */
    var THR_SW = 0.6;
    var THR_IDLE_CAP = 'T1·T2·T3이 CPU 하나를 나눠 쓰고, 세 스레드 모두 같은 counter 변수를 공유합니다.';
    var THR_CAP = [
        '디스패처가 T1의 TCB에서 레지스터와 PC를 복원하고 CPU를 넘깁니다.',
        'T1이 counter 값 0을 읽어 자기 R1 레지스터에 둡니다.',
        '타임 퀀텀이 끝나면 CPU의 R1 값(0)은 T1의 TCB에 저장되고, T2의 TCB 값이 CPU로 복원됩니다.',
        'T2도 counter 값 0을 읽어 자기 R1에 둡니다. 두 스레드가 같은 값을 들고 있습니다.',
        'T2가 쓴 1을 T1이 0 + 1 = 1로 덮어써 T2의 갱신이 사라졌습니다(Lost Update).',
        'Mutex 안에서는 한 스레드만 갱신합니다. 0에서 시작해 1, 2로 순서대로 올라갑니다.',
    ];

    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 스레드 동작 원리를 확인하세요. (단일 코어 기준 시각화 — 멀티코어에서는 동시 메모리 접근으로 race가 더 빈번히 발생합니다)'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function thrSeg(t, a, b) { return ez(seg(t, a, b)); }
    function thrCol(k) { return k === 'T1' ? P.teal : k === 'T2' ? P.purple : k === 'T3' ? P.green : k === 'CPU' ? P.yellow : k === 'MEM' ? P.orange : P.red; }
    function thrStCol(s) { return s === 'RUNNING' ? P.green : s === 'READY' ? P.purple : s === 'BLOCKED' ? P.red : P.muted; }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var wide = !mob;
        var fs = wide ? 13 : 11;
        var fsB = wide ? 15 : 12;
        var fsS = wide ? 12 : 11;
        var lh = wide ? 18 : 15;
        var capW = wide ? w * 0.9 : w - 16;
        var capN = 1;
        [THR_IDLE_CAP].concat(THR_CAP).forEach(function (c) {
            var n = lines(c, capW, fs).length;
            if (n > capN) capN = n;
        });
        var nodes = {};
        var capY;
        if (wide) {
            var tw = 150, cw = 164, mw = 172, th = 84, thg = 28;
            var gap = Math.max(24, Math.min(96, Math.floor((w - tw - cw - mw) / 2)));
            var x0 = Math.max(0, Math.floor((w - tw - cw - mw - gap * 2) / 2));
            var cx1 = x0 + tw + gap;
            var mx1 = cx1 + cw + gap;
            nodes.T1 = { x: x0, y: 44, w: tw, h: th };
            nodes.T2 = { x: x0, y: 44 + th + thg, w: tw, h: th };
            nodes.T3 = { x: x0, y: 44 + (th + thg) * 2, w: tw, h: th };
            nodes.CPU = { x: cx1, y: 44, w: cw, h: th * 3 + thg * 2 };
            nodes.MEM = { x: mx1, y: 44, w: mw, h: 132 };
            nodes.LOCK = { x: mx1, y: 204, w: mw, h: 120 };
            capY = 378;
        } else {
            var tm = Math.floor((w - 16) / 3);
            nodes.T1 = { x: 0, y: 44, w: tm, h: 74 };
            nodes.T2 = { x: tm + 8, y: 44, w: tm, h: 74 };
            nodes.T3 = { x: (tm + 8) * 2, y: 44, w: tm, h: 74 };
            nodes.CPU = { x: 0, y: 144, w: w, h: 96 };
            nodes.MEM = { x: 0, y: 266, w: w, h: 104 };
            nodes.LOCK = { x: 0, y: 394, w: w, h: 72 };
            capY = 488;
        }
        return { wide: wide, fs: fs, fsB: fsB, fsS: fsS, lh: lh, capW: capW, capY: capY, bx: w / 2, nodes: nodes, total: capY + capN * lh + 12 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 상태 계산 ===================== */
    function thrRegFx(k, s) {
        if (k === 1) { s.regs.T1 = '0'; s.cpuReg = '0'; }
        else if (k === 2) { s.cpuReg = s.regs.T2; }
        else if (k === 3) { s.regs.T2 = '0'; s.cpuReg = '0'; }
        else if (k === 4) { s.regs.T2 = '1'; s.regs.T1 = '1'; s.cpuReg = '1'; }
        else if (k === 5) { s.regs.T1 = '1'; s.regs.T2 = '2'; s.cpuReg = '1'; }
    }
    function thrSnap(i) {
        var s = { states: { T1: 'READY', T2: 'READY', T3: 'READY' }, counter: 0, cpu: '', mutex: null, regs: { T1: '-', T2: '-', T3: '-' }, cpuReg: '-' };
        var steps = currentSteps();
        for (var k = 0; k <= i; k++) {
            var st = steps[k];
            s.states  = Object.assign({}, st.states);
            s.counter = st.counter;
            s.cpu     = st.cpuLabel || '';
            s.mutex   = st.mutex || null;
            thrRegFx(k, s);
        }
        return s;
    }
    function thrFx(i) {
        if (i === 0) return [
            { from: 'T1', to: 'CPU', kind: 'tok', lab: 'T1', who: 'T1', a: 0, b: 0.55 }
        ];
        if (i === 1) return [
            { from: 'CPU', to: 'MEM', kind: 'tok', lab: 'T1', who: 'T1', a: 0, b: 0.3 },
            { from: 'MEM', to: 'CPU', kind: 'val', lab: '0', who: 'T1', a: 0.3, b: 0.6 }
        ];
        if (i === 2) return [
            { from: 'CPU', to: 'T1', kind: 'val', lab: '0', who: 'T1', a: 0, b: 0.3 },
            { from: 'T2', to: 'CPU', kind: 'tok', lab: 'T2', who: 'T2', a: 0.3, b: 0.6 }
        ];
        if (i === 3) return [
            { from: 'CPU', to: 'MEM', kind: 'tok', lab: 'T2', who: 'T2', a: 0, b: 0.3 },
            { from: 'MEM', to: 'CPU', kind: 'val', lab: '0', who: 'T2', a: 0.3, b: 0.6 }
        ];
        if (i === 4) return [
            { from: 'CPU', to: 'MEM', kind: 'val', lab: '1', who: 'T2', a: 0, b: 0.3 },
            { from: 'T1', to: 'CPU', kind: 'val', lab: '0', who: 'T1', a: 0.3, b: 0.6 },
            { from: 'CPU', to: 'MEM', kind: 'val', lab: '1', who: 'T1', a: 0.6, b: 0.9 }
        ];
        if (i === 5) return [
            { from: 'T1', to: 'CPU', kind: 'tok', lab: 'T1', who: 'T1', a: 0, b: 0.2 },
            { from: 'CPU', to: 'MEM', kind: 'val', lab: '1', who: 'T1', a: 0.25, b: 0.5 },
            { from: 'LOCK', to: 'MEM', kind: 'val', lab: '2', who: 'T2', a: 0.6, b: 0.85 }
        ];
        return [];
    }
    function thrView(i, f) {
        var bef = thrSnap(i - 1), aft = thrSnap(i);
        var sw = f >= THR_SW;
        var s = sw ? aft : bef;
        var st = i >= 0 ? currentSteps()[i] : null;
        var v = { states: s.states, cpu: s.cpu, cpuReg: s.cpuReg, regs: s.regs, counter: s.counter, mutex: s.mutex, note: null, noteCol: P.sub, race: false, raceRes: false, mutexOk: false };
        if (st && sw && st.memNote) {
            v.note = st.memNote;
            v.noteCol = st.memNote.indexOf('T1') !== -1 ? P.teal : P.purple;
        }
        if (st && st.race) v.race = true;
        if (i === 4) {
            v.race = true;
            v.counter = f < 0.3 ? bef.counter : aft.counter;
            v.regs = { T1: s.regs.T1, T2: f < 0.3 ? bef.regs.T2 : aft.regs.T2, T3: s.regs.T3 };
            v.cpuReg = f < 0.3 ? '1' : f < 0.6 ? '-' : aft.cpuReg;
            v.raceRes = f >= 0.75;
            if (v.raceRes) { v.note = '예상: 2  /  실제: ' + aft.counter; v.noteCol = P.red; }
        } else if (i === 5) {
            v.counter = f < 0.5 ? 0 : f < 0.85 ? 1 : aft.counter;
            v.regs = { T1: f < 0.2 ? '-' : f < 0.5 ? '0' : '1', T2: f < 0.5 ? '-' : f < 0.85 ? '1' : '2', T3: s.regs.T3 };
            v.cpuReg = f < 0.2 ? '-' : f < 0.5 ? '0' : '1';
            v.mutex = f >= 0.2 ? 'LOCKED' : null;
            v.states = f < 0.5 ? { T1: 'RUNNING', T2: 'BLOCKED', T3: 'READY' } : { T1: 'READY', T2: 'RUNNING', T3: 'READY' };
            v.cpu = f < 0.5 ? 'T1' : 'T2';
            if (f < 0.5) { v.note = '0에서 다시 시작'; v.noteCol = P.sub; }
            if (f >= 0.85) { v.note = '순차 갱신 완료'; v.noteCol = P.green; v.mutexOk = true; }
        }
        return v;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function thrEdgePt(a, b) {
        var ax = a.x + a.w / 2, ay = a.y + a.h / 2;
        var dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
        var kx = dx === 0 ? Infinity : (a.w / 2) / Math.abs(dx);
        var ky = dy === 0 ? Infinity : (a.h / 2) / Math.abs(dy);
        var k = Math.min(kx, ky);
        return { x: ax + dx * k, y: ay + dy * k };
    }
    function thrPt(N, fx, u) {
        var p0 = thrEdgePt(N[fx.from], N[fx.to]), p1 = thrEdgePt(N[fx.to], N[fx.from]);
        return { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
    }
    function thrPill(x, y, lab, col, fs) {
        var pw = lab.length * fs * 0.6 + 12;
        rr(x - pw / 2, y - 8, pw, 16, 8, col + 'ff', col + 'ff', 1);
        tx(lab, x, y, fs, '#111111', 'center', true);
    }

    /* ===================== 노드 그리기 ===================== */
    function thrDrawThread(n, k, v, L) {
        var col = thrCol(k);
        var st = v.states[k];
        var sc = thrStCol(st);
        var on = st === 'RUNNING';
        var blk = st === 'BLOCKED';
        var isHov = hoveredKey === k;
        var bcol = on ? col : blk ? P.red : isHov ? P.purple : P.border;
        rr(n.x, n.y, n.w, n.h, 8, on ? col + '22' : blk ? P.red + '14' : P.surf, bcol + 'ff', on || blk ? 2.4 : isHov ? 2 : 1.5);
        var cx = n.x + n.w / 2;
        var fp = L.fsS;
        var py = n.y + (L.wide ? 46 : 42);
        tx('Thread ' + k.charAt(1), cx, n.y + (L.wide ? 24 : 22), L.fs, col + 'ff', 'center', true);
        var pw = st.length * fp * 0.62 + 14;
        rr(cx - pw / 2, py - 9, pw, 18, 5, sc + '22', sc + 'ff', 1.5);
        tx(st, cx, py, fp, sc + 'ff', 'center', true);
        tx('R1 = ' + v.regs[k], cx, n.y + (L.wide ? 70 : 63), L.fsS, P.text + 'ff', 'center', false);
    }
    function thrDrawCpu(n, v, L, busy) {
        var isHov = hoveredKey === 'CPU';
        rr(n.x, n.y, n.w, n.h, 8, busy ? P.yellow + '18' : P.surf, (busy ? P.yellow : isHov ? P.purple : P.border) + 'ff', busy ? 2.4 : isHov ? 2 : 1.5);
        var cx = n.x + n.w / 2;
        var sepY = n.y + (L.wide ? 34 : 30);
        tx('CPU Core', cx, n.y + 18, L.fs, P.sub + 'ff', 'center', true);
        ln(n.x + 14, sepY, n.x + n.w - 14, sepY, P.border + 'ff', 1, []);
        if (L.wide) {
            tx(v.cpu ? '실행 중' : '대기', cx, n.y + 64, L.fsS, P.sub + 'ff', 'center', false);
            tx(v.cpu || 'IDLE', cx, n.y + 102, v.cpu ? 26 : 16, (v.cpu ? thrCol(v.cpu) : P.sub) + 'ff', 'center', true);
            var rb = n.y + n.h - 82;
            rr(n.x + 16, rb, n.w - 32, 60, 6, P.surf2, P.border + 'ff', 1.2);
            tx('R1', cx, rb + 17, L.fsS, P.sub + 'ff', 'center', true);
            tx(v.cpuReg, cx, rb + 40, 20, P.text + 'ff', 'center', true);
        } else {
            tx((v.cpu || 'IDLE') + '  ·  R1 = ' + v.cpuReg, cx, n.y + 64, L.fs, P.text + 'ff', 'center', true);
        }
    }
    function thrDrawMem(n, v, L) {
        var isHov = hoveredKey === 'MEM';
        var red = v.race || v.raceRes;
        var grn = v.mutexOk;
        var bcol = red ? P.red : grn ? P.green : isHov ? P.purple : P.border;
        rr(n.x, n.y, n.w, n.h, 8, red ? P.red + '14' : grn ? P.green + '14' : P.surf, bcol + 'ff', red || grn ? 2.4 : isHov ? 2 : 1.5);
        var cx = n.x + n.w / 2;
        var sepY = n.y + (L.wide ? 34 : 30);
        tx('Shared Memory', cx, n.y + 18, L.fs, P.sub + 'ff', 'center', true);
        ln(n.x + 14, sepY, n.x + n.w - 14, sepY, P.border + 'ff', 1, []);
        tx('counter', cx, n.y + (L.wide ? 56 : 48), L.fsS, P.sub + 'ff', 'center', false);
        tx(String(v.counter), cx, n.y + (L.wide ? 90 : 66), L.wide ? 30 : 22, (red ? P.red : grn ? P.green : P.text) + 'ff', 'center', true);
        if (v.note) tx(v.note, cx, n.y + n.h - (L.wide ? 18 : 13), L.fsS, v.noteCol + 'ff', 'center', true);
    }
    function thrDrawLock(n, v, L) {
        var locked = !!v.mutex;
        var isHov = hoveredKey === 'LOCK';
        var col = locked ? P.red : P.green;
        rr(n.x, n.y, n.w, n.h, 6, locked ? P.red + '18' : P.surf, (locked ? P.red : isHov ? P.purple : P.border) + 'ff', locked ? 2.2 : 1.5);
        var cx = n.x + n.w / 2;
        var sepY = n.y + (L.wide ? 36 : 30);
        tx('Mutex Lock', cx, n.y + (L.wide ? 20 : 16), L.fs, P.sub + 'ff', 'center', true);
        ln(n.x + 14, sepY, n.x + n.w - 14, sepY, col + '88', 1, []);
        tx(locked ? 'LOCKED' : 'UNLOCKED', cx, n.y + (L.wide ? 66 : 46), L.fs + 1, col + 'ff', 'center', true);
        var sub = locked ? (v.states.T2 === 'BLOCKED' ? 'T2 : Blocked (대기)' : (v.states.T2 === 'RUNNING' ? 'T2 보유 중' : 'T1 보유 중')) : '진입 가능';
        tx(sub, cx, n.y + (L.wide ? 94 : 62), L.fsS, P.sub + 'ff', 'center', false);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var N = L.nodes;
        var steps = currentSteps();
        var i = step ? steps.indexOf(step) : -1;
        var f = i >= 0 ? clamp01(t) : 0;
        var v = thrView(i, f);
        var on = thrFx(i).filter(function (fx) { return f >= fx.a && f < fx.b; });
        var busy = on.some(function (fx) { return fx.from === 'CPU' || fx.to === 'CPU'; });

        ctx.save();
        ctx.translate(x0, top);

        [['T1', 'CPU'], ['T2', 'CPU'], ['T3', 'CPU'], ['CPU', 'MEM'], ['MEM', 'LOCK']].forEach(function (pr) {
            var p0 = thrEdgePt(N[pr[0]], N[pr[1]]), p1 = thrEdgePt(N[pr[1]], N[pr[0]]);
            var hit = on.filter(function (fx) { return (fx.from === pr[0] && fx.to === pr[1]) || (fx.from === pr[1] && fx.to === pr[0]); })[0];
            if (hit) {
                var fwd = hit.from === pr[0];
                var q0 = fwd ? p0 : p1, q1 = fwd ? p1 : p0;
                arrow(q0.x, q0.y, q1.x, q1.y, thrCol(hit.who) + 'ff', 2.4);
            } else {
                ln(p0.x, p0.y, p1.x, p1.y, P.border + 'ff', 1.2, [4, 4]);
            }
        });

        thrDrawThread(N.T1, 'T1', v, L);
        thrDrawThread(N.T2, 'T2', v, L);
        thrDrawThread(N.T3, 'T3', v, L);
        thrDrawCpu(N.CPU, v, L, busy);
        thrDrawMem(N.MEM, v, L);
        thrDrawLock(N.LOCK, v, L);

        if (i === 2) {
            if (f < 0.3) tx('TCB 저장', N.T1.x + N.T1.w / 2, N.T1.y - 12, L.fsS, P.teal + 'ff', 'center', true);
            else if (f < 0.6) tx('TCB 복원', N.T2.x + N.T2.w / 2, N.T2.y - 12, L.fsS, P.purple + 'ff', 'center', true);
        }

        on.forEach(function (fx) {
            var p = thrPt(N, fx, thrSeg(f, fx.a, fx.b));
            if (fx.kind === 'tok') {
                circ(p.x, p.y, 11, thrCol(fx.who) + 'ff', '#111111', 1.2);
                tx(fx.lab, p.x, p.y, L.fsS, '#111111', 'center', true);
            } else {
                thrPill(p.x, p.y, fx.lab, thrCol(fx.who), L.fsS);
            }
        });

        var bTxt = i >= 0 ? steps[i].badge : 'IDLE';
        var bCol = i < 0 ? P.sub : (i === 3 || i === 4) ? P.red : i === 5 ? P.green : P.purple;
        tx(bTxt, L.bx, 16, L.fsB, bCol + 'ff', 'center', true);
        var capTxt = i >= 0 ? THR_CAP[i] : THR_IDLE_CAP;
        lines(capTxt, L.capW, L.fs).forEach(function (cl, j) {
            tx(cl, L.bx, L.capY + j * L.lh + L.lh / 2, L.fs, P.sub + 'ff', 'center', false);
        });

        ctx.restore();

        ['T1', 'T2', 'T3', 'CPU', 'MEM', 'LOCK'].forEach(function (k) {
            var n = N[k];
            tipBadge(x0 + n.x + n.w - 11, top + n.y + 11, k);
        });
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
        tipHits.length = 0;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
        if (hoveredKey && typeof TIPS !== 'undefined' && TIPS[hoveredKey]) drawTip(mousePos.x, mousePos.y, TIPS[hoveredKey]);
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
        speedBtns.forEach(function (b) { b.classList.remove('thr-viz__speed-btn--active'); });
        btn.classList.add('thr-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('thr-viz__mode-btn--active', d.key === m); });
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
                mousePos: mousePos,
                tooltipHits: tipHits,
                hoveredKey: function () { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();