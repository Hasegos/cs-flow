/**
 * 부팅 과정(BIOS→커널) 시각화
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
    var root    = el('div', 'bt-viz');
    var toolbar = el('div', 'bt-viz__toolbar');
    var tbLeft  = el('div', 'bt-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bt-viz__title', 'BOOT'));

    var modeWrap = el('div', 'bt-viz__mode');
    var modeDefs = [
        { key: 'bios', label: 'BIOS 부팅' },
        { key: 'uefi', label: 'UEFI 부팅' },
        { key: 'kernel', label: '커널 이후' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bt-viz__mode-btn' + (i === 0 ? ' bt-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bt-viz__speed');
    speedWrap.appendChild(el('span', 'bt-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'bt-viz__speed-btn' + (i === 0 ? ' bt-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bt-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bt-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bt-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bt-viz__controls');
    var btnPlay  = el('button', 'bt-viz__btn bt-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bt-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bt-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 부팅 단계 ===================== */
    var CHAINS = {
        bios: [
            { name: '전원 ON · 펌웨어 실행', where: '메인보드의 BIOS 코드', log: '전원이 들어오면 CPU가 정해진 시작 위치에서 메인보드에 저장된 펌웨어(BIOS) 코드를 실행합니다. 이 시점에는 운영체제도, 디스크의 파일도 쓸 수 없습니다.' },
            { name: 'POST (하드웨어 점검)', where: '메모리 · 키보드 · 디스크 등', log: 'BIOS가 POST(Power-On Self-Test)로 메모리와 주변 장치를 점검하고 초기화합니다.' },
            { name: '부팅 장치의 첫 섹터(MBR) 읽기', where: '디스크 첫 512바이트', log: 'BIOS가 부팅 순서에 따라 장치를 고르고, 첫 섹터(MBR, 512바이트)를 메모리로 읽습니다. 끝의 2바이트가 부트 시그니처(0x55 0xAA)인지 확인하고(대개) 그 안의 부트 코드로 제어를 넘깁니다.' },
            { name: '부트로더 단계 실행', where: 'MBR 부트 코드 → 다음 단계', log: 'MBR의 부트 코드는 446바이트 안팎으로 작아 커널을 올릴 수 없습니다. 그래서 다음 단계의 부트로더(예: GRUB)를 읽어 옵니다.' },
            { name: '커널 · initramfs를 메모리에 적재', where: '디스크의 /boot', log: '부트로더가 설정에서 고른 항목의 커널 이미지와 초기 램디스크(initramfs)를 메모리에 올리고, 커널의 시작 위치로 제어를 넘깁니다.' },
            { name: '커널 실행', where: '메모리', log: '이제부터 운영체제 커널이 하드웨어 제어를 맡습니다. 이후 과정은 "커널 이후" 탭에서 봅니다.' }
        ],
        uefi: [
            { name: '전원 ON · UEFI 펌웨어 실행', where: '메인보드의 UEFI 펌웨어', log: '전원이 들어오면 메인보드의 UEFI 펌웨어가 실행됩니다. BIOS와 같은 자리를 차지하지만 더 큰 기능을 가진 펌웨어 규격입니다.' },
            { name: '하드웨어 초기화 · 드라이버 로드', where: '펌웨어 안의 드라이버', log: 'UEFI 펌웨어가 하드웨어를 초기화하고 부팅에 필요한 드라이버를 올립니다. 디스크의 파일 시스템도 이 단계에서 읽을 수 있게 됩니다.' },
            { name: '부팅 항목 고르기', where: 'NVRAM의 부트 항목(BootOrder)', log: 'UEFI 부트 매니저가 비휘발성 메모리(NVRAM)에 저장된 부트 항목과 그 순서(BootOrder)를 읽어 부팅 대상을 고릅니다.' },
            { name: 'ESP에서 .efi 부트로더 읽기', where: 'EFI 시스템 파티션(FAT) 안의 파일', log: '디스크 첫 섹터가 아니라, EFI 시스템 파티션(ESP)의 파일 시스템에 있는 .efi 부트로더 파일을 읽어 실행합니다. 보안 부팅(Secure Boot)을 켜면 이때 서명을 검증합니다.' },
            { name: '커널 · initramfs를 메모리에 적재', where: '부트로더(GRUB, systemd-boot 등)', log: '부트로더가 커널 이미지와 initramfs를 메모리에 올리고 커널로 제어를 넘깁니다.' },
            { name: '커널 실행', where: '메모리', log: '이제부터 운영체제 커널이 하드웨어 제어를 맡습니다. 이후 과정은 BIOS 부팅과 같아서 "커널 이후" 탭에서 봅니다.' }
        ],
        kernel: [
            { name: '커널 초기화', where: '메모리 관리 · 스케줄러 · 인터럽트', log: '커널이 메모리 관리, 스케줄러, 인터럽트 처리, 장치 드라이버 같은 핵심 기능을 초기화합니다.' },
            { name: 'initramfs 실행', where: '메모리 위의 임시 루트 파일 시스템', log: '많은 배포판에서 커널은 먼저 initramfs라는 작은 임시 루트 파일 시스템을 쓰고, 그 안에서 실제 루트 파일 시스템을 마운트하는 데 필요한 드라이버를 올립니다.' },
            { name: '실제 루트 파일 시스템 마운트', where: '디스크의 / 파티션', log: '진짜 루트 파일 시스템을 마운트하고 그쪽으로 넘어갑니다.' },
            { name: '첫 사용자 프로세스 (PID 1)', where: '/sbin/init 또는 systemd', log: '커널이 사용자 공간의 첫 프로세스를 실행합니다. 이것이 PID 1이며, initramfs를 쓰면 initramfs의 /init이 먼저 PID 1로 실행되고 실제 루트로 넘어간 뒤 systemd 같은 init이 이어받습니다. 대부분의 현대 배포판에서는 systemd입니다.' },
            { name: '서비스 시작', where: 'systemd의 유닛 · target', log: 'PID 1이 설정(유닛)에 따라 네트워크, 로그, 각종 서비스를 의존 관계를 지켜 시작하고, 기본 target에 도달할 때까지 진행합니다.' },
            { name: '로그인 가능', where: '로그인 프롬프트 · 화면 관리자', log: '로그인 프롬프트나 그래픽 로그인 화면이 나타나면 부팅이 끝난 것입니다. 전원 ON부터 여기까지가 부팅 과정입니다.' }
        ]
    };
    var INTRO = {
        bios: '전원을 켠 직후부터 커널이 시작되기까지, 전통적인 BIOS(MBR) 방식의 부팅 단계를 봅니다.',
        uefi: 'BIOS를 대체하는 UEFI 방식의 부팅 단계를 봅니다. 디스크 첫 섹터 대신 ESP 파일을 쓴다는 점이 다릅니다.',
        kernel: '커널이 시작된 뒤 PID 1과 서비스가 올라와 로그인할 수 있기까지의 과정을 봅니다.'
    };
    function stepsOf(key) {
        var arr = [{ up: -1, key: key, log: INTRO[key] }];
        CHAINS[key].forEach(function (s, i) {
            arr.push({ up: i, key: key, log: (i + 1) + '단계 — ' + s.name + '. ' + s.log });
        });
        return arr;
    }
    var BIOS_STEPS = stepsOf('bios');
    var UEFI_STEPS = stepsOf('uefi');
    var KERNEL_STEPS = stepsOf('kernel');

    /* ===================== 상태 ===================== */
    var mode    = 'bios';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'uefi') return UEFI_STEPS;
        if (mode === 'kernel') return KERNEL_STEPS;
        return BIOS_STEPS;
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

    /* ===================== 공통: 단계 체인 ===================== */
    function drawChain(x0, top, w, mob, step, key) {
        var fs = mob ? 10.5 : 12;
        var up = step ? step.up : -1;
        var list = CHAINS[key];
        var bh = mob ? 40 : 42;
        var gap = mob ? 12 : 12;
        list.forEach(function (s, i) {
            var y = top + i * (bh + gap);
            var done = i < up;
            var cur = i === up;
            var col = cur ? P.orange : (done ? P.green : P.muted);
            var fill = cur ? P.orange + '30' : (done ? P.green + '18' : 'none');
            rr(x0, y, w, bh, 6, fill, col + (cur ? 'ff' : (done ? 'aa' : '55')), cur ? 1.8 : 1.2);
            var nc = cur ? P.orange : (done ? P.green : P.muted);
            rr(x0 + 8, y + bh / 2 - 11, 22, 22, 11, nc + (cur || done ? '40' : '18'), nc + (cur || done ? 'cc' : '55'), 1.2);
            tx(String(i + 1), x0 + 19, y + bh / 2, fs - 1.5, (cur || done ? P.text : P.muted) + 'ee', 'center', true);
            tx(s.name, x0 + 40, y + bh / 2 - 8, fs - (mob ? 0.5 : 0), (cur || done ? P.text : P.muted) + 'ee', 'left', true);
            tx(s.where, x0 + 40, y + bh / 2 + 9, fs - 2, (cur ? P.yellow : P.muted) + 'ee', 'left', false);
            if (cur) tx('▶', x0 + w - 12, y + bh / 2, fs, P.orange + 'ff', 'center', true);
            if (i < list.length - 1) tx('▼', x0 + 19, y + bh + gap / 2, fs - 4, (done ? P.green : P.muted) + '99', 'center', false);
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

        drawChain(padX, top, fullW, mob, step, mode);

        if (!step) {
            tx('아래 STEP을 눌러 전원을 켠 뒤 제어가 어떻게 넘어가는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 340 : 350;
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
        if (mode === 'uefi') return INTRO.uefi;
        if (mode === 'kernel') return INTRO.kernel;
        return INTRO.bios;
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
        speedBtns.forEach(function (b) { b.classList.remove('bt-viz__speed-btn--active'); });
        btn.classList.add('bt-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bt-viz__mode-btn--active', d.key === m); });
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