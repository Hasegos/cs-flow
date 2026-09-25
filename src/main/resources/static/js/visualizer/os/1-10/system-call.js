/**
 * 시스템 콜 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
    }

    const root    = el('div', 'sc-viz');
    const toolbar = el('div', 'sc-viz__toolbar');
    const tbLeft  = el('div', 'sc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sc-viz__title', 'System Call'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'sc-viz__speed');
    speedWrap.appendChild(el('span', 'sc-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'sc-viz__speed-btn' + (i === 0 ? ' sc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'sc-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'sc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'sc-viz__log', '▶ PLAY를 눌러 시스템 콜 흐름을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'sc-viz__controls');
    const btnPlay  = el('button', 'sc-viz__btn sc-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'sc-viz__btn', '▶| STEP');
    const btnReset = el('button', 'sc-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  scStart);
    btnStep.addEventListener('click',  scStep);
    btnReset.addEventListener('click', scReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const GW  = function () { return canvas.width  / dpr; };
    const GH  = function () { return canvas.height / dpr; };

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, w < 520 ? 500 : 460);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            log:      'Step 1 — 사용자 프로그램이 open("/etc/passwd", O_RDONLY)를 호출합니다. glibc 래퍼 함수가 먼저 실행됩니다. 아직 유저 모드(Ring 3)에 있으며 커널에 접근하지 않습니다.',
            uActive:  ['app', 'glibc'], kActive: [],
            showRegs: false, showFd: false, showFdUser: false,
            vPkt: null, hPkt: null, mode: 'user',
        },
        {
            log:      'Step 2 — glibc가 syscall 명령어 실행을 준비합니다. RAX=2(open 번호), RDI=경로 포인터, RSI=O_RDONLY(0)를 레지스터에 설정합니다.',
            uActive:  ['app', 'glibc'], kActive: [],
            showRegs: true, showFd: false, showFdUser: false,
            vPkt: null, hPkt: null, mode: 'user',
        },
        {
            log:      'Step 3 — syscall 명령어 실행! 트랩(Trap) 발생 → CPU가 Ring 3 → Ring 0으로 전환합니다. 현재 레지스터·스택 포인터를 커널 스택에 저장합니다.',
            uActive:  ['glibc'], kActive: [],
            showRegs: false, showFd: false, showFdUser: false,
            vPkt: { dir: 'down', prog: 0 }, hPkt: null, mode: 'crossing',
        },
        {
            log:      'Step 4 — 커널 모드 진입. sys_call_table[2]에서 sys_open 핸들러 주소를 조회합니다. 시스템 콜 테이블은 커널 초기화 시 구성됩니다.',
            uActive:  [], kActive: ['table', 'handler'],
            showRegs: false, showFd: false, showFdUser: false,
            vPkt: null, hPkt: { from: 'table', to: 'handler', prog: 0 }, mode: 'kernel',
        },
        {
            log:      'Step 5 — sys_open 핸들러가 VFS를 호출합니다. 경로 검증 → VFS → inode 탐색 → 권한 확인 → 파일 디스크립터 fd=3 할당.',
            uActive:  [], kActive: ['handler', 'vfs'],
            showRegs: false, showFd: true, showFdUser: false,
            vPkt: null, hPkt: { from: 'handler', to: 'vfs', prog: 0 }, mode: 'kernel',
        },
        {
            log:      'Step 6 — 처리 완료. RAX에 fd=3을 저장하고 sysret으로 Ring 0 → Ring 3 복귀합니다.',
            uActive:  ['glibc'], kActive: ['vfs'],
            showRegs: false, showFd: true, showFdUser: false,
            vPkt: { dir: 'up', prog: 0 }, hPkt: null, mode: 'crossing',
        },
        {
            log:      'Step 7 — 유저 모드 복귀 완료. open() → fd=3 반환. fd=3으로 read()·write()·close()를 호출할 수 있습니다. 전체 시스템 콜 흐름 완료 ✓',
            uActive:  ['app', 'glibc'], kActive: [],
            showRegs: false, showFd: false, showFdUser: true,
            vPkt: null, hPkt: null, mode: 'user', done: true,
        },
    ];

    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let rafId   = null;
    let speed   = 1800;
    let vPktProg = 1, hPktProg = 1;
    let hPktFrom = null, hPktTo = null;

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill;   ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 14 : 16;
        const fSm = mob ? 12 : 13;
        const pad = mob ? 10 : 20;

        const uNodeH = mob ? 112 : 116;
        const kNodeH = mob ? 142 : 118;
        const regsH  = mob ? 32 : 36;
        const fdH    = mob ? 34 : 40;

        const uNodeY = mob ? 32 : 34;

        const regsY   = uNodeY + uNodeH + 8;
        const boundY  = regsY + regsH + (mob ? 38 : 22);

        const kNodeY = boundY + (mob ? 56 : 50);

        const fdY = kNodeY + kNodeH + (mob ? 10 : 12);

        const uGap   = mob ? 8 : 14;
        const uNodeW = Math.floor((W - pad*2 - uGap) / 2);
        const uNodeX = [pad, pad + uNodeW + uGap];

        const kGap   = mob ? 6 : 12;
        const kNodeW = Math.floor((W - pad*2 - kGap*2) / 3);
        const kNodeX = [pad, pad + kNodeW + kGap, pad + (kNodeW + kGap)*2];

        return {
            W, H, mob, fMd, fSm, pad,
            boundY, uNodeY, uNodeH, uNodeW, uNodeX,
            regsH, regsY,
            kNodeY, kNodeH, kNodeW, kNodeX,
            fdH, fdY, fdW: W - pad*2,
        };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());

        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawSpaces(L, step);
        drawBoundary(L, step);
        drawUserNodes(L, step);
        drawKernelNodes(L, step);
        drawVPkt(L, step);
        drawHPkt(L, step);
    }

    /* ===================== 배경 ===================== */
    function drawSpaces(L, step) {
        const { W, H, boundY, fSm, mob } = L;

        ctx.fillStyle = P.purple + '0c';
        ctx.fillRect(0, 0, W, boundY);

        ctx.fillStyle = P.teal + '09';
        ctx.fillRect(0, boundY, W, H - boundY);

        tx('User Space  (Ring 3)', mob ? 14 : 16, mob ? 12 : 14,
           fSm, P.purple + 'cc', 'left', true);
    }

    /* ===================== 경계선 — gap으로 텍스트 겹침 방지 ===================== */
    function drawBoundary(L, step) {
        const { W, boundY, fSm, mob } = L;
        const isCrossing = step.mode === 'crossing';
        const col = isCrossing ? P.yellow : P.border;
        const lw  = isCrossing ? 2.5 : 1.5;

        const lbl  = isCrossing ? '⚡ 모드 전환 (Trap / sysret)' : '── 보호 경계 ──';
        const bW   = mob ? 190 : 228;
        const bH   = 22;
        const gap  = bW + 20;
        const lx1  = (W - gap) / 2;
        const lx2  = (W + gap) / 2;

        ctx.setLineDash(isCrossing ? [] : [6, 5]);
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(0, boundY);      ctx.lineTo(lx1, boundY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx2, boundY);    ctx.lineTo(W, boundY);   ctx.stroke();
        ctx.setLineDash([]);

        rr((W - bW)/2, boundY - bH/2, bW, bH, 4,
           isCrossing ? P.yellow + '22' : P.surf,
           isCrossing ? P.yellow : P.border, isCrossing ? 1.5 : 1);
        tx(lbl, W/2, boundY, mob ? fSm-1 : fSm, isCrossing ? P.yellow : P.muted, 'center', isCrossing);

        const { kNodeY, fSm: fS } = L;
        tx('Kernel Space  (Ring 0)', mob ? 14 : 16, boundY + (mob ? 36 : 30),
           fS, P.teal + 'cc', 'left', true);
    }

    /* ===================== 유저 노드 ===================== */
    function drawUserNodes(L, step) {
        const { W, uNodeW, uNodeH, uNodeX, uNodeY, pad, fMd, fSm, mob, regsH, regsY, fdW } = L;
        const uActive = step.uActive || [];

        const nodes = [
            { key: 'app',   title: 'Application', sub: 'main() 실행 중',   code: 'open("/etc/passwd",...)', col: P.purple },
            { key: 'glibc', title: 'glibc 래퍼',  sub: 'libc.so',         code: 'RAX=2, RDI=path',        col: P.orange },
        ];

        if (uActive.indexOf('app') !== -1 && uActive.indexOf('glibc') !== -1) {
            const ay = uNodeY + uNodeH/2;
            const x1 = uNodeX[0] + uNodeW, x2 = uNodeX[1];
            ctx.beginPath(); ctx.moveTo(x1, ay); ctx.lineTo(x2, ay);
            ctx.strokeStyle = P.purple + '99'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, ay); ctx.lineTo(x2-10, ay-5); ctx.lineTo(x2-10, ay+5);
            ctx.closePath(); ctx.fillStyle = P.purple + '99'; ctx.fill();
        }

        nodes.forEach(function (n, i) {
            const nx    = uNodeX[i];
            const isAct = uActive.indexOf(n.key) !== -1;
            rr(nx, uNodeY, uNodeW, uNodeH, 8,
               isAct ? n.col + '22' : P.surf,
               isAct ? n.col : P.border, isAct ? 2.5 : 1.5);
            tx(n.title, nx + uNodeW/2, uNodeY + uNodeH*0.26, fMd, isAct ? n.col : P.sub, 'center', isAct);
            tx(n.sub,   nx + uNodeW/2, uNodeY + uNodeH*0.50, fSm-1, P.muted, 'center', false);
            tx(n.code,  nx + uNodeW/2, uNodeY + uNodeH*0.74, fSm-1, isAct ? n.col+'cc' : P.muted, 'center', false);
        });

        if (step.showRegs) {
            rr(uNodeX[1], regsY, uNodeW, regsH, 4, P.orange+'18', P.orange, 1.5);
            tx('RAX=2  RDI=ptr  RSI=0', uNodeX[1]+uNodeW/2, regsY+regsH/2, fSm-1, P.orange, 'center', false);
        }

        if (step.showFdUser) {
            rr(pad, regsY, fdW, regsH + 4, 4, P.green+'18', P.green, 2);
            tx('✓  open()  →  fd = 3  반환 완료', pad + fdW/2, regsY + (regsH+4)/2, fSm, P.green, 'center', true);
        }
    }

    /* ===================== 커널 노드 ===================== */
    function drawKernelNodes(L, step) {
        const { kNodeW, kNodeH, kNodeX, kNodeY, pad, fdW, fdH, fdY, fMd, fSm, mob } = L;
        const kActive = step.kActive || [];

        const nodes = [
            { key: 'table',   title: 'syscall table', sub: 'sys_call_table[2]', code: '→ sys_open()', col: P.teal   },
            { key: 'handler', title: 'sys_open',       sub: '커널 핸들러',       code: 'VFS 호출',    col: P.purple },
            { key: 'vfs',     title: 'VFS / inode',    sub: '파일 탐색',         code: '/etc/passwd', col: P.orange },
        ];

        nodes.forEach(function (n, i) {
            const nx    = kNodeX[i];
            const isAct = kActive.indexOf(n.key) !== -1;
            rr(nx, kNodeY, kNodeW, kNodeH, 8,
               isAct ? n.col+'22' : P.surf,
               isAct ? n.col : P.border, isAct ? 2.5 : 1.5);
            tx(n.title, nx + kNodeW/2, kNodeY + kNodeH*0.26, mob ? fSm : fMd-1, isAct ? n.col : P.sub, 'center', isAct);
            tx(n.sub,   nx + kNodeW/2, kNodeY + kNodeH*0.50, fSm-1, P.muted, 'center', false);
            tx(n.code,  nx + kNodeW/2, kNodeY + kNodeH*0.74, fSm-1, isAct ? n.col+'cc' : P.muted, 'center', false);
        });

        if (step.showFd) {
            rr(pad, fdY, fdW, fdH, 4, P.green+'18', P.green, 2);
            tx('fd = 3  할당 완료', pad + fdW/2, fdY + fdH/2, fSm, P.green, 'center', true);
        }
    }

    /* ===================== 수직 패킷 ===================== */
    function drawVPkt(L, step) {
        if (!step.vPkt || vPktProg >= 1) return;
        const { W, boundY } = L;
        const dir = step.vPkt.dir;
        const col = dir === 'down' ? P.yellow : P.green;
        const lbl = dir === 'down' ? 'TRAP' : 'RET';
        const cx  = Math.round(W / 2);
        const fy  = dir === 'down' ? boundY - 55 : boundY + 55;
        const ty  = dir === 'down' ? boundY + 55 : boundY - 55;
        const y   = fy + (ty - fy) * vPktProg;

        ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx, y);
        ctx.strokeStyle = col + '55'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

        ctx.beginPath(); ctx.arc(cx, y, 14, 0, Math.PI*2);
        ctx.fillStyle = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        tx(lbl, cx, y, 9, col, 'center', true);
    }

    /* ===================== 수평 패킷 ===================== */
    function drawHPkt(L, step) {
        if (!step.hPkt || hPktProg >= 1) return;
        const { kNodeW, kNodeX, kNodeY, kNodeH } = L;
        const keys = ['table', 'handler', 'vfs'];
        const fi   = keys.indexOf(hPktFrom);
        const ti   = keys.indexOf(hPktTo);
        if (fi < 0 || ti < 0) return;

        const x1 = kNodeX[fi] + kNodeW;
        const x2 = kNodeX[ti];
        const y  = kNodeY + kNodeH / 2;
        const x  = x1 + (x2 - x1) * hPktProg;
        const cols = [P.teal, P.purple, P.orange];
        const col  = cols[fi];

        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x, y);
        ctx.strokeStyle = col + '66'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2);
        ctx.fillStyle = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        tx('→', x, y, 10, col, 'center', true);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(step, cb) {
        const hasV = !!step.vPkt, hasH = !!step.hPkt;
        vPktProg = hasV ? 0 : 1;
        hPktProg = hasH ? 0 : 1;
        if (hasH) { hPktFrom = step.hPkt.from; hPktTo = step.hPkt.to; }

        if (!hasV && !hasH) { draw(); if (cb) cb(); return; }

        if (rafId) cancelAnimationFrame(rafId);
        const s = 0.008 * (1800 / speed);
        (function tick() {
            let done = true;
            if (vPktProg < 1) { vPktProg = Math.min(1, vPktProg + s); if (vPktProg < 1) done = false; }
            if (hPktProg < 1) { hPktProg = Math.min(1, hPktProg + s); if (hPktProg < 1) done = false; }
            draw();
            if (!done) { rafId = requestAnimationFrame(tick); }
            else { draw(); if (cb) cb(); }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.sc-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = STEPS[idx].log;
        animateStep(STEPS[idx], function () {
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function scStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === STEPS.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else { timer = setTimeout(tick, speed); }
            });
        }
        tick();
    }

    function scStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function scReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        vPktProg = 1; hPktProg = 1; hPktFrom = null; hPktTo = null;
        logEl.textContent = '▶ PLAY를 눌러 시스템 콜 흐름을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.sc-viz__speed-btn').forEach(function (b) {
            b.classList.remove('sc-viz__speed-btn--active');
        });
        btn.classList.add('sc-viz__speed-btn--active');
    }

    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function () { return { rafId, timer, running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW, GH, mousePos: { x:-1,y:-1 }, tooltipHits: [],
                hoveredKey: function(){return null;}, setHoveredKey: function(){}, draw,
            };
        },
    });

    setTimeout(resize, 60);
})();