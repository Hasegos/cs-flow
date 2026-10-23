/**
 * 프로세스 동기화 시각화 시각화
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
    var root    = el('div', 'sync-viz');
    var toolbar = el('div', 'sync-viz__toolbar');
    var tbLeft  = el('div', 'sync-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sync-viz__title', 'Process Sync'));

    var modeWrap = el('div', 'sync-viz__mode');
    var modeDefs = [
        { key: 'race', label: 'Race' },
        { key: 'mutex', label: 'Mutex' },
        { key: 'semaphore', label: 'Semaphore' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sync-viz__mode-btn' + (i === 0 ? ' sync-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sync-viz__speed');
    speedWrap.appendChild(el('span', 'sync-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sync-viz__speed-btn' + (i === 0 ? ' sync-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sync-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sync-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sync-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sync-viz__controls');
    var btnPlay  = el('button', 'sync-viz__btn sync-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sync-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sync-viz__btn', '↺ RESET');
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
    var mode    = 'race';
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
        var tl = window.CsFlow.wrapText(ctx, title, maxIn);
        var titleW = 0;
        tl.forEach(function (l) { titleW = Math.max(titleW, ctx.measureText(l).width); });
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 24 + tl.length * 18 + dl.length * 18 : 18 + tl.length * 18;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tl.forEach(function (l, i) { tx(l, bx + pad, by + 18 + i * 18, 14, P.text + 'ff', 'left', true); });
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 24 + tl.length * 18 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 시나리오 ===================== */
    const RACE_STEPS = [
        {
            badge: 'counter = 0 (초기)',
            log:   'Step 1 — 두 스레드가 공유 변수 counter=0을 보고 있습니다. 아직 아무도 접근하지 않았습니다.',
            t1: 'READY', t2: 'READY', counter: 0,
            t1reg: null, t2reg: null, phase: 'init',
        },
        {
            badge: 'T1: counter 읽기 (R=0)',
            log:   'Step 2 — T1이 counter를 읽어 레지스터 R에 저장합니다(R=0). 이 시점에 T1은 R=0을 들고 있습니다.',
            t1: 'RUNNING', t2: 'READY', counter: 0,
            t1reg: 0, t2reg: null, phase: 't1-read',
            pkt: { from: 'MEM', to: 'T1' },
        },
        {
            badge: '컨텍스트 스위치 → T2',
            log:   'Step 3 — 타임 퀀텀 만료! T1의 레지스터(R=0)를 TCB에 저장하고 T2로 전환합니다.',
            t1: 'READY', t2: 'RUNNING', counter: 0,
            t1reg: 0, t2reg: null, phase: 'ctx-switch',
        },
        {
            badge: 'T2: counter 읽기 (R=0) ⚠',
            log:   'Step 4 — T2도 counter를 읽습니다. T1이 아직 쓰지 않았으므로 counter=0, T2도 R=0을 가집니다. 두 스레드 모두 R=0을 들고 있습니다!',
            t1: 'READY', t2: 'RUNNING', counter: 0,
            t1reg: 0, t2reg: 0, phase: 't2-read',
            pkt: { from: 'MEM', to: 'T2' },
        },
        {
            badge: 'T2: counter ← R+1=1 쓰기',
            log:   'Step 5 — T2가 R+1=1을 counter에 씁니다. counter=1이 됩니다.',
            t1: 'READY', t2: 'RUNNING', counter: 1,
            t1reg: 0, t2reg: 0, phase: 't2-write',
            pkt: { from: 'T2', to: 'MEM' },
        },
        {
            badge: 'T1 재개: counter ← 1 ⚠ 갱신 분실!',
            log:   'Step 6 — T1이 재개됩니다. 저장해 둔 R=0으로 +1=1을 counter에 씁니다. T2의 쓰기가 덮어써졌습니다! 갱신 분실(Lost Update)!',
            t1: 'RUNNING', t2: 'READY', counter: 1,
            t1reg: 0, t2reg: 0, phase: 'lost-update',
            pkt: { from: 'T1', to: 'MEM' },
            raceResult: true,
        },
    ];

    const MUTEX_STEPS = [
        {
            badge: 'Mutex 초기화 (UNLOCKED)',
            log:   'Step 1 — Mutex가 UNLOCKED 상태입니다. counter=0, 두 스레드 모두 Ready 상태입니다.',
            t1: 'READY', t2: 'READY', counter: 0,
            mutex: 'UNLOCKED', owner: null, phase: 'init',
        },
        {
            badge: 'T1: Lock 획득',
            log:   'Step 2 — T1이 mutex.lock()을 호출합니다. Mutex가 UNLOCKED이므로 즉시 획득하고 LOCKED로 전환합니다. T1이 임계 구역에 진입합니다.',
            t1: 'RUNNING', t2: 'READY', counter: 0,
            mutex: 'LOCKED', owner: 'T1', phase: 't1-lock',
            pkt: { from: 'T1', to: 'LOCK' },
        },
        {
            badge: 'T2: Lock 시도 → Blocked',
            log:   'Step 3 — T2도 mutex.lock()을 시도합니다. Mutex가 이미 LOCKED(T1 보유)이므로 T2는 Blocked 상태로 전환되어 대기합니다.',
            t1: 'RUNNING', t2: 'BLOCKED', counter: 0,
            mutex: 'LOCKED', owner: 'T1', phase: 't2-blocked',
            pkt: { from: 'T2', to: 'LOCK' },
        },
        {
            badge: 'T1: 임계 구역 → counter=1',
            log:   'Step 4 — T1이 임계 구역에서 counter++를 안전하게 실행합니다. 읽기→증가→쓰기가 원자적으로 완료됩니다. counter=1.',
            t1: 'RUNNING', t2: 'BLOCKED', counter: 1,
            mutex: 'LOCKED', owner: 'T1', phase: 't1-cs',
            pkt: { from: 'T1', to: 'MEM' },
        },
        {
            badge: 'T1: Unlock → T2 깨어남',
            log:   'Step 5 — T1이 mutex.unlock()을 호출합니다. Mutex가 UNLOCKED로 전환되고 대기 중인 T2가 Lock을 획득합니다.',
            t1: 'READY', t2: 'RUNNING', counter: 1,
            mutex: 'LOCKED', owner: 'T2', phase: 't2-wakeup',
            pkt: { from: 'LOCK', to: 'T2' },
        },
        {
            badge: 'T2: 임계 구역 → counter=2 ✓',
            log:   'Step 6 — T2가 임계 구역에서 counter++=2를 안전하게 실행합니다. 최종 counter=2. 예상값과 일치합니다 ✓',
            t1: 'READY', t2: 'RUNNING', counter: 2,
            mutex: 'LOCKED', owner: 'T2', phase: 't2-cs',
            pkt: { from: 'T2', to: 'MEM' },
            mutexOk: true,
        },
    ];

    const SEM_STEPS = [
        {
            badge: 'Semaphore S=2 초기화',
            log:   'Step 1 — 계수형 Semaphore S=2로 초기화합니다. 동시에 최대 2개의 스레드가 자원을 사용할 수 있습니다.',
            ts: ['READY','READY','READY'], sem: 2, using: [], phase: 'init',
        },
        {
            badge: 'T1: wait(S) → S=1, 진입',
            log:   'Step 2 — T1이 wait(P)를 호출합니다. S=2>0이므로 S--하여 S=1이 되고 T1이 자원에 진입합니다.',
            ts: ['RUNNING','READY','READY'], sem: 1, using: ['T1'],
            pkt: { from: 'T1', to: 'SEM' },
        },
        {
            badge: 'T2: wait(S) → S=0, 진입',
            log:   'Step 3 — T2가 wait(P)를 호출합니다. S=1>0이므로 S--하여 S=0이 됩니다. T2도 자원에 진입합니다. 두 스레드가 동시에 자원을 사용 중입니다.',
            ts: ['RUNNING','RUNNING','READY'], sem: 0, using: ['T1','T2'],
            pkt: { from: 'T2', to: 'SEM' },
        },
        {
            badge: 'T3: wait(S) → S=0, Blocked!',
            log:   'Step 4 — T3가 wait(P)를 호출합니다. S=0이므로 블로킹됩니다. 자원이 해제될 때까지 T3는 대기합니다.',
            ts: ['RUNNING','RUNNING','BLOCKED'], sem: 0, using: ['T1','T2'],
            pkt: { from: 'T3', to: 'SEM' },
        },
        {
            badge: 'T1: signal(S) → S=1, T3 깨어남',
            log:   'Step 5 — T1이 자원 사용을 마치고 signal(V)을 호출합니다. S++하여 S=1이 됩니다. 대기 중인 T3가 깨어나 자원에 진입합니다.',
            ts: ['READY','RUNNING','RUNNING'], sem: 1, using: ['T2','T3'],
            pkt: { from: 'SEM', to: 'T3' },
        },
        {
            badge: 'T2·T3 완료 → S=2 복원 ✓',
            log:   'Step 6 — T2와 T3가 순차적으로 signal(V)을 호출합니다. S가 다시 2로 복원됩니다. 동시 접근 수를 정확히 N=2로 제어했습니다 ✓',
            ts: ['READY','READY','READY'], sem: 2, using: [], semOk: true,
            pkt: { from: 'SEM', to: 'T2' },
        },
    ];

    const MODES = [
        { name: 'Race Condition', steps: RACE_STEPS },
        { name: 'Mutex',          steps: MUTEX_STEPS },
        { name: 'Semaphore',      steps: SEM_STEPS },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = {
        T1:   'Thread 1\n독립된 Stack·PC를 가집니다. 공유 자원에 접근 시 동기화가 필요합니다.',
        T2:   'Thread 2\nT1과 같은 프로세스 내에서 Heap·Data 영역을 공유합니다.',
        T3:   'Thread 3\n계수형 Semaphore 예제에서 세 번째 경쟁자입니다.',
        MEM:  'Shared Memory\n여러 스레드가 동시에 읽고 쓰는 공유 변수입니다. Race Condition의 발생 지점입니다.',
        LOCK: 'Mutex Lock\n한 번에 하나의 스레드만 임계 구역에 진입하도록 보장하는 상호 배제 락입니다.',
        SEM:  'Semaphore\n정수 카운터 S로 동시 접근 수를 제한합니다. wait(P): S-- 또는 블로킹, signal(V): S++.'
    };

    function currentSteps() {
        return mode === 'mutex' ? MUTEX_STEPS : mode === 'semaphore' ? SEM_STEPS : RACE_STEPS;
    }

    function defaultLog() {
        return '▶ PLAY를 눌러 동기화 원리를 확인하세요. 상단 버튼으로 모드를 바꿀 수 있습니다.';
    }

    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    function psThrCol(k) {
        return k === 'T1' ? P.teal : k === 'T2' ? P.purple : P.green;
    }

    function psStCol(st) {
        return st === 'RUNNING' ? P.green : st === 'READY' ? P.purple : st === 'BLOCKED' ? P.red : P.sub;
    }

    function psIsThr(k) {
        return k === 'T1' || k === 'T2' || k === 'T3';
    }

    function psThrIdx(k) {
        return k === 'T1' ? 0 : k === 'T2' ? 1 : 2;
    }

    /* ===================== 레이아웃 ===================== */
    function psLayRace(w, mob) {
        var g = mob ? 10 : 24;
        var tw = Math.round((w - g) / 2);
        var th = mob ? 66 : 84;
        var ty = mob ? 52 : 66;
        var mw = Math.round(w * (mob ? 0.6 : 0.4));
        var mh = mob ? 80 : 96;
        var my = ty + th + (mob ? 60 : 72);
        return {
            fr: [0.3, 0.7],
            rail: mob ? 30 : 36,
            nodes: {
                T1:  { x: 0,      y: ty, w: tw, h: th },
                T2:  { x: tw + g, y: ty, w: tw, h: th },
                MEM: { x: Math.round((w - mw) / 2), y: my, w: mw, h: mh }
            },
            total: my + mh + (mob ? 30 : 36)
        };
    }

    function psLayMutex(w, mob) {
        var g = mob ? 10 : 24;
        var tw = Math.round((w - g) / 2);
        var th = mob ? 62 : 80;
        var ty = mob ? 40 : 52;
        var lw = Math.round(w * (mob ? 0.56 : 0.36));
        var lh = mob ? 74 : 90;
        var ly = ty + th + (mob ? 44 : 60);
        var mw = Math.round(w * (mob ? 0.56 : 0.4));
        var mh = mob ? 80 : 90;
        var my = ly + lh + (mob ? 44 : 60);
        return {
            fr: [0.18, 0.82],
            nodes: {
                T1:   { x: 0,      y: ty, w: tw, h: th },
                T2:   { x: tw + g, y: ty, w: tw, h: th },
                LOCK: { x: Math.round((w - lw) / 2), y: ly, w: lw, h: lh },
                MEM:  { x: Math.round((w - mw) / 2), y: my, w: mw, h: mh }
            },
            total: my + mh + 14
        };
    }

    function psLaySem(w, mob) {
        var g = mob ? 6 : 16;
        var tw = Math.round((w - g * 2) / 3);
        var th = mob ? 62 : 80;
        var ty = mob ? 40 : 52;
        var sw = Math.round(w * (mob ? 0.5 : 0.3));
        var sh = mob ? 88 : 108;
        var sy = ty + th + (mob ? 44 : 60);
        var rw = Math.round(w * (mob ? 0.76 : 0.5));
        var rh = mob ? 62 : 80;
        var ry = sy + sh + (mob ? 44 : 60);
        return {
            fr: [0.2, 0.5, 0.8],
            nodes: {
                T1:  { x: 0,            y: ty, w: tw, h: th },
                T2:  { x: tw + g,       y: ty, w: tw, h: th },
                T3:  { x: (tw + g) * 2, y: ty, w: tw, h: th },
                SEM: { x: Math.round((w - sw) / 2), y: sy, w: sw, h: sh },
                RES: { x: Math.round((w - rw) / 2), y: ry, w: rw, h: rh }
            },
            total: ry + rh + (mob ? 30 : 36)
        };
    }

    function layout(w, mob) {
        var L = mode === 'mutex' ? psLayMutex(w, mob) : mode === 'semaphore' ? psLaySem(w, mob) : psLayRace(w, mob);
        L.mob = mob;
        L.fL = mob ? 12 : 14;
        L.fS = mob ? 11 : 12;
        return L;
    }

    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 경로 ===================== */
    function psBot(n) {
        return { x: n.x + n.w / 2, y: n.y + n.h };
    }

    function psTopC(n) {
        return { x: n.x + n.w / 2, y: n.y };
    }

    function psTopAt(n, f) {
        return { x: n.x + n.w * f, y: n.y };
    }

    function psPts(L, a, b) {
        var na = L.nodes[a], nb = L.nodes[b];
        if (psIsThr(a)) return [psBot(na), psTopAt(nb, L.fr[psThrIdx(a)])];
        if (psIsThr(b)) return [psTopAt(na, L.fr[psThrIdx(b)]), psBot(nb)];
        return [psBot(na), psTopC(nb)];
    }

    function psRoute(L, a, b) {
        if (mode === 'mutex' && psIsThr(a) && b === 'MEM') {
            var lk = L.nodes.LOCK;
            return [psBot(L.nodes[a]), psTopAt(lk, L.fr[psThrIdx(a)]), psBot(lk), psTopC(L.nodes.MEM)];
        }
        return psPts(L, a, b);
    }

    function psAlong(pts, u) {
        var total = 0, i;
        for (i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        var rest = clamp01(u) * total;
        for (i = 1; i < pts.length; i++) {
            var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (rest <= d || i === pts.length - 1) {
                var r = d ? clamp01(rest / d) : 1;
                return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r };
            }
            rest -= d;
        }
        return pts[0];
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function psEdge(p, q, col, on) {
        if (on) arrow(p.x, p.y, q.x, q.y, col + 'ff', 2.2);
        else ln(p.x, p.y, q.x, q.y, P.sub + '66', 1.2, [4, 4]);
    }

    function psChip(x, y, lab, col, al) {
        if (al <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp01(al);
        circ(x, y, 11, col + 'ff', '#111111', 1.2);
        tx(lab, x, y, 10, '#111111', 'center', true);
        ctx.restore();
    }

    function psRegTxt(st, reg) {
        if (reg === null || reg === undefined) return null;
        return (st === 'READY' ? 'TCB R=' : 'R=') + reg;
    }

    function psPktLabel(pk, s) {
        if (pk.to === 'MEM') return String(s.counter);
        if (pk.from === 'MEM') return String(pk.to === 'T2' ? s.t2reg : s.t1reg);
        return psIsThr(pk.from) ? pk.from : pk.to;
    }

    function psPktCol(pk) {
        var k = psIsThr(pk.from) ? pk.from : pk.to;
        return psIsThr(k) ? psThrCol(k) : P.orange;
    }

    function psThread(n, key, st, regTxt, act, L, bd) {
        var col = psThrCol(key), sc = psStCol(st), hov = hoveredKey === key, blk = st === 'BLOCKED';
        rr(n.x, n.y, n.w, n.h, 8,
            act ? col + '25' : blk ? P.red + '14' : P.surf,
            act ? col : blk ? P.red : hov ? P.purple : P.border,
            act ? 2.5 : hov ? 2 : 1.5);
        var cx = n.x + n.w / 2;
        tx(key, cx, n.y + 14, L.fL, (act ? col : blk ? P.red : P.text) + 'ff', 'center', true);
        var py = regTxt ? n.y + n.h * 0.5 : n.y + n.h * 0.62;
        var pw = Math.min(L.mob ? 74 : 90, n.w - 10);
        rr(cx - pw / 2, py - 8, pw, 16, 8, sc + '22', sc, 1.2);
        tx(st, cx, py, L.fS, sc + 'ff', 'center', true);
        if (regTxt) {
            rr(n.x + 6, n.y + n.h - 22, n.w - 12, 16, 5, P.surf2, P.border, 1);
            tx(regTxt, cx, n.y + n.h - 14, L.fS, P.yellow + 'ff', 'center', true);
        }
        bd.push({ x: n.x + n.w - 9, y: n.y + 9, key: key });
    }

    function psMem(M, s, L, mAct, resMsg, resCol, bd) {
        var cx = M.x + M.w / 2;
        var hov = hoveredKey === 'MEM';
        rr(M.x, M.y, M.w, M.h, 8,
            resMsg ? resCol + '18' : P.surf,
            resMsg ? resCol : mAct ? P.orange : hov ? P.purple : P.border,
            resMsg || mAct ? 2.5 : hov ? 2 : 1.5);
        tx('Shared Memory', cx, M.y + 13, L.fS, (mAct ? P.orange : P.sub) + 'ff', 'center', true);
        tx('counter', cx, M.y + M.h * 0.38, L.fS, P.sub + 'ff', 'center', false);
        tx(String(s.counter), cx, M.y + M.h * 0.62, L.mob ? 20 : 26, (resMsg ? resCol : P.text) + 'ff', 'center', true);
        if (resMsg) tx(resMsg, cx, M.y + M.h - 11, L.fS, resCol + 'ff', 'center', true);
        bd.push({ x: M.x + M.w - 9, y: M.y + 9, key: 'MEM' });
    }

    /* ===================== Race 장면 ===================== */
    function psDrawRace(L, s, pv, fresh, t, bd) {
        var N = L.nodes;
        var pk = s.pkt || null;
        var cpuNow = s.t1 === 'RUNNING' ? 'T1' : s.t2 === 'RUNNING' ? 'T2' : null;
        var cpuPrev = pv.t1 === 'RUNNING' ? 'T1' : pv.t2 === 'RUNNING' ? 'T2' : null;
        var moved = fresh && !!cpuNow && cpuPrev !== cpuNow;
        var x1 = N.T1.x + N.T1.w / 2, x2 = N.T2.x + N.T2.w / 2;
        var a1 = !!pk && (pk.from === 'T1' || pk.to === 'T1');
        var a2 = !!pk && (pk.from === 'T2' || pk.to === 'T2');
        var mAct = !!pk && (pk.from === 'MEM' || pk.to === 'MEM');
        var e1 = psPts(L, 'T1', 'MEM'), e2 = psPts(L, 'T2', 'MEM');

        ln(x1, L.rail, x2, L.rail, P.sub + '55', 1.2, [3, 3]);
        if (cpuNow) {
            var target = cpuNow === 'T1' ? x1 : x2;
            var cx = target, al = 1;
            if (moved && cpuPrev) cx = lerp(cpuPrev === 'T1' ? x1 : x2, target, ez(seg(t, 0, 0.4)));
            if (moved && !cpuPrev) al = seg(t, 0, 0.3);
            if (al > 0) {
                ctx.save();
                ctx.globalAlpha = al;
                rr(cx - 24, L.rail - 9, 48, 18, 9, P.green + 'ff', P.green + 'ff', 1);
                tx('CPU', cx, L.rail, 10, '#111111', 'center', true);
                ctx.restore();
            }
        }

        psEdge(e1[0], e1[1], P.teal, a1);
        psEdge(e2[0], e2[1], P.purple, a2);
        psThread(N.T1, 'T1', s.t1, psRegTxt(s.t1, s.t1reg), a1, L, bd);
        psThread(N.T2, 'T2', s.t2, psRegTxt(s.t2, s.t2reg), a2, L, bd);
        psMem(N.MEM, s, L, mAct, s.raceResult ? '⚠ 예상 2 / 실제 ' + s.counter : null, P.red, bd);
        if (s.phase !== 'init') {
            tx('⚠ 임계 구역 보호 없음', N.MEM.x + N.MEM.w / 2, N.MEM.y + N.MEM.h + (L.mob ? 16 : 20), L.fS, P.red + 'ff', 'center', true);
        }
        if (pk && fresh) {
            var pos = psAlong(psRoute(L, pk.from, pk.to), ez(seg(t, moved ? 0.4 : 0, 0.9)));
            psChip(pos.x, pos.y, psPktLabel(pk, s), psPktCol(pk), 1 - seg(t, 0.9, 1));
        }
    }

    /* ===================== Mutex 장면 ===================== */
    function psDrawMutex(L, s, pv, fresh, t, bd) {
        var N = L.nodes;
        var pk = s.pkt || null;
        var lk = N.LOCK;
        var locked = s.mutex === 'LOCKED';
        var lc = locked ? P.red : P.green;
        var a1 = !!pk && (pk.from === 'T1' || pk.to === 'T1');
        var a2 = !!pk && (pk.from === 'T2' || pk.to === 'T2');
        var lkAct = !!pk && (pk.from === 'LOCK' || pk.to === 'LOCK');
        var mAct = !!pk && (pk.from === 'MEM' || pk.to === 'MEM');
        var e1 = psPts(L, 'T1', 'LOCK'), e2 = psPts(L, 'T2', 'LOCK'), e3 = psPts(L, 'LOCK', 'MEM');

        psEdge(e1[0], e1[1], P.teal, a1);
        psEdge(e2[0], e2[1], P.purple, a2);
        psEdge(e3[0], e3[1], s.owner ? psThrCol(s.owner) : lc, !!pk && pk.to === 'MEM');
        psThread(N.T1, 'T1', s.t1, null, a1, L, bd);
        psThread(N.T2, 'T2', s.t2, null, a2, L, bd);

        var lhov = hoveredKey === 'LOCK';
        rr(lk.x, lk.y, lk.w, lk.h, 8,
            locked ? P.red + '15' : P.green + '15',
            lkAct ? lc : lhov ? P.purple : lc,
            lkAct ? 2.5 : lhov ? 2 : 1.5);
        var cx = lk.x + lk.w / 2;
        tx('Mutex', cx, lk.y + 14, L.fL, lc + 'ff', 'center', true);
        tx(locked ? 'LOCKED' : 'UNLOCKED', cx, lk.y + lk.h * 0.5, L.fL, lc + 'ff', 'center', true);
        if (s.owner) tx('보유: ' + s.owner, cx, lk.y + lk.h - 14, L.fS, psThrCol(s.owner) + 'ff', 'center', true);
        else tx('대기 없음', cx, lk.y + lk.h - 14, L.fS, P.sub + 'ff', 'center', false);
        bd.push({ x: lk.x + lk.w - 9, y: lk.y + 9, key: 'LOCK' });

        var waiting = [];
        if (s.t1 === 'BLOCKED') waiting.push('T1');
        if (s.t2 === 'BLOCKED') waiting.push('T2');
        if (waiting.length) tx('대기열', lk.x - 24, lk.y + lk.h / 2 - 16, L.fS, P.sub + 'ff', 'center', false);
        waiting.forEach(function (k, i) {
            var qx = lk.x - 24, qy = lk.y + lk.h / 2 + 6 + i * 24;
            rr(qx - 18, qy - 9, 36, 18, 9, P.red + '22', P.red, 1.5);
            tx(k, qx, qy, L.fS, P.red + 'ff', 'center', true);
        });

        psMem(N.MEM, s, L, mAct, s.mutexOk ? '✓ 정확한 결과' : null, P.green, bd);
        if (pk && fresh) {
            var pos = psAlong(psRoute(L, pk.from, pk.to), ez(seg(t, 0, 0.9)));
            psChip(pos.x, pos.y, psPktLabel(pk, s), psPktCol(pk), 1 - seg(t, 0.9, 1));
        }
    }

    /* ===================== Semaphore 장면 ===================== */
    function psDrawSem(L, s, pv, fresh, t, bd) {
        var N = L.nodes;
        var pk = s.pkt || null;
        var sm = N.SEM, rs = N.RES;
        var semCol = s.sem > 0 ? P.teal : P.red;
        var ks = ['T1', 'T2', 'T3'];
        var sAct = !!pk && (pk.from === 'SEM' || pk.to === 'SEM');
        var shov = hoveredKey === 'SEM';

        ks.forEach(function (k) {
            var e = psPts(L, k, 'SEM');
            psEdge(e[0], e[1], psThrCol(k), !!pk && (pk.from === k || pk.to === k));
        });
        var rb = psBot(sm), rtp = psTopC(rs);
        ln(rb.x, rb.y, rtp.x, rtp.y, P.sub + '66', 1.2, [4, 4]);
        ks.forEach(function (k, i) {
            psThread(N[k], k, s.ts[i], null, !!pk && (pk.from === k || pk.to === k), L, bd);
        });

        rr(sm.x, sm.y, sm.w, sm.h, 8, semCol + '18', sAct || shov ? (sAct ? semCol : P.purple) : semCol, sAct ? 2.5 : shov ? 2 : 1.5);
        var cx = sm.x + sm.w / 2;
        tx('Semaphore', cx, sm.y + 13, L.fL, semCol + 'ff', 'center', true);
        tx('S = ' + s.sem, cx, sm.y + sm.h * 0.42, L.fL + 2, semCol + 'ff', 'center', true);
        for (var ti = 0; ti < 2; ti++) {
            circ(cx - 10 + ti * 20, sm.y + sm.h * 0.66, 5, ti < s.sem ? semCol + 'ff' : 'none', semCol + 'ff', 1.2);
        }
        tx(s.sem === 0 ? '자원 없음 (블로킹)' : '진입 가능 (' + s.sem + '개)', cx, sm.y + sm.h - 13, L.fS, P.sub + 'ff', 'center', false);
        bd.push({ x: sm.x + sm.w - 9, y: sm.y + 9, key: 'SEM' });

        var rcx = rs.x + rs.w / 2;
        rr(rs.x, rs.y, rs.w, rs.h, 8, P.surf, P.border, 1.5);
        tx(L.mob ? '공유 자원 · 2칸' : '공유 자원 (동시 접근 허용: 2개)', rcx, rs.y + 12, L.fS, P.sub + 'ff', 'center', false);
        var using = s.using || [];
        var prevUsing = pv.using || [];
        var slotW = Math.round((rs.w - 24) / 2);
        for (var si = 0; si < 2; si++) {
            var sx = rs.x + 8 + si * (slotW + 8), sy = rs.y + 24, sh = rs.h - 32;
            var who = using[si] || null;
            rr(sx, sy, slotW, sh, 6, P.surf2, P.border, 1);
            if (!who) {
                tx('빈 슬롯', sx + slotW / 2, sy + sh / 2, L.fS, P.sub + 'ff', 'center', false);
                continue;
            }
            var enter = fresh && prevUsing.indexOf(who) < 0;
            ctx.save();
            ctx.globalAlpha = enter ? seg(t, 0.5, 1) : 1;
            rr(sx, sy, slotW, sh, 6, psThrCol(who) + '33', psThrCol(who), 2);
            tx(who + ' 사용 중', sx + slotW / 2, sy + sh / 2, L.fS, psThrCol(who) + 'ff', 'center', true);
            ctx.restore();
        }
        if (s.semOk) tx('✓ 최대 2개 동시 접근 제어 완료', rcx, rs.y + rs.h + (L.mob ? 16 : 20), L.fS, P.green + 'ff', 'center', true);

        if (pk && fresh) {
            var pos = psAlong(psRoute(L, pk.from, pk.to), ez(seg(t, 0, 0.9)));
            psChip(pos.x, pos.y, psPktLabel(pk, s), psPktCol(pk), 1 - seg(t, 0.9, 1));
        }
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var pv = prev || s;
        var fresh = s !== pv;
        var tt = fresh ? clamp01(t) : 1;
        var bd = [];
        var bcol = s.raceResult ? P.red : (s.mutexOk || s.semOk) ? P.green : P.purple;

        ctx.save();
        ctx.translate(x0, top);
        tx(s.badge, w / 2, 12, L.mob ? 11 : 13, bcol + 'ff', 'center', true);
        if (mode === 'mutex') psDrawMutex(L, s, pv, fresh, tt, bd);
        else if (mode === 'semaphore') psDrawSem(L, s, pv, fresh, tt, bd);
        else psDrawRace(L, s, pv, fresh, tt, bd);
        ctx.restore();
        bd.forEach(function (b) { tipBadge(x0 + b.x, top + b.y, b.key); });
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
        speedBtns.forEach(function (b) { b.classList.remove('sync-viz__speed-btn--active'); });
        btn.classList.add('sync-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sync-viz__mode-btn--active', d.key === m); });
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