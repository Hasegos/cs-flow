/**
 * memory-hierarchy.js
 * 메모리 계층 구조 인터랙티브 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    /* ===================== UI 구성 ===================== */
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls)  e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    const root    = el('div', 'mem-hier');
    const toolbar = el('div', 'mem-hier__toolbar');
    const tbLeft  = el('div', 'mem-hier__toolbar-left');
    tbLeft.appendChild(el('span', 'mem-hier__title', 'Memory Hierarchy'));
    const badge = el('span', 'mem-hier__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'mem-hier__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'mem-hier__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'mem-hier__log', '▶ 계층을 클릭하거나 마우스를 올려 상세 정보를 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'mem-hier__controls');
    const btnReset = el('button', 'mem-hier__btn mem-hier__btn--primary', '↺ RESET');
    btnReset.addEventListener('click', mhReset);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    /* ===================== 캔버스 ===================== */
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const GW  = () => canvas.width  / dpr;
    const GH  = () => canvas.height / dpr;

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, 420);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    const P = {
        bg:     '#0f0f1a',
        surf:   '#1a1a2e',
        surf2:  '#222238',
        border: 'rgba(108,99,255,0.22)',
        purple: '#6c63ff',
        teal:   '#3ecfb2',
        orange: '#f7a14a',
        green:  '#4ade80',
        red:    '#f87171',
        yellow: '#fbbf24',
        blue:   '#60a5fa',
        text:   '#e8e8f0',
        sub:    '#a0a0bc',
        muted:  '#6b6b8a',
    };

    /* ===================== 계층 데이터 ===================== */
    const LAYERS = [
        {
            id: 'REG',
            name: '레지스터',
            nameEn: 'Register',
            col: P.purple,
            speed: '< 1 ns',
            size: '수백 B',
            tech: 'SRAM (flip-flop)',
            cost: '최고',
            detail: 'CPU 내부에 직접 내장된 가장 빠른 저장소입니다. PC·IR·ACC 등 명령어 실행에 직접 사용되며 전원이 꺼지면 데이터가 사라집니다.',
        },
        {
            id: 'L1',
            name: 'L1 캐시',
            nameEn: 'L1 Cache',
            col: '#a78bfa',
            speed: '1 ~ 4 ns',
            size: '32 ~ 128 KB',
            tech: 'SRAM',
            cost: '매우 높음',
            detail: 'CPU 코어마다 독립적으로 붙어있는 1차 캐시입니다. 명령어 캐시(I-cache)와 데이터 캐시(D-cache)로 분리되어 있어 동시 접근이 가능합니다.',
        },
        {
            id: 'L2',
            name: 'L2 캐시',
            nameEn: 'L2 Cache',
            col: P.teal,
            speed: '4 ~ 12 ns',
            size: '256 KB ~ 4 MB',
            tech: 'SRAM',
            cost: '높음',
            detail: '코어별 또는 공유 방식으로 구성됩니다. L1 미스 시 탐색하며 L1보다 크고 느립니다. 대부분의 현대 CPU에서 코어당 256KB~1MB입니다.',
        },
        {
            id: 'L3',
            name: 'L3 캐시',
            nameEn: 'L3 Cache',
            col: P.blue,
            speed: '20 ~ 40 ns',
            size: '4 ~ 64 MB',
            tech: 'SRAM',
            cost: '높음',
            detail: '모든 코어가 공유하는 마지막 캐시 계층입니다. LLC(Last Level Cache)라고도 하며 L2 미스 시 탐색합니다. 서버 CPU는 수백 MB에 달하기도 합니다.',
        },
        {
            id: 'RAM',
            name: '메인 메모리',
            nameEn: 'RAM (DRAM)',
            col: P.orange,
            speed: '60 ~ 100 ns',
            size: '4 ~ 128 GB',
            tech: 'DRAM',
            cost: '보통',
            detail: '프로그램 실행 시 코드와 데이터를 올려두는 주기억장치입니다. 캐패시터 기반이라 주기적 리프레시가 필요하며 전원이 꺼지면 데이터가 사라집니다.',
        },
        {
            id: 'SSD',
            name: '보조 기억 장치',
            nameEn: 'SSD / HDD',
            col: P.green,
            speed: '50 μs ~ 10 ms',
            size: '수백 GB ~ 수 TB',
            tech: 'NAND Flash / 자기 디스크',
            cost: '낮음',
            detail: '영구 저장 장치입니다. SSD는 수십~수백 μs, HDD는 수 ms의 접근 시간을 가집니다. 전원이 꺼져도 데이터가 유지됩니다.',
        },
    ];

    /* ===================== 상태 ===================== */
    let selectedIdx = -1;
    let hoveredIdx  = -1;

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 툴팁 정의 ===================== */
    const TOOLTIPS = {
        REG: '레지스터\nCPU 내부 초고속 임시 저장소',
        L1:  'L1 캐시\n코어별 1차 캐시, 가장 빠른 캐시',
        L2:  'L2 캐시\n코어별 2차 캐시',
        L3:  'L3 캐시\n전체 코어 공유 마지막 캐시(LLC)',
        RAM: 'RAM (DRAM)\n프로그램 실행용 주기억장치',
        SSD: 'SSD / HDD\n영구 저장 보조기억장치',
    };

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = `${bold ? 700 : 400} ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob  = W < 560;
        const pad  = mob ? 10 : 24;

        // 피라미드 영역 (좌측 또는 전체)
        const pyrW = mob ? W - pad * 2 : Math.min(W * 0.52, 380);
        const pyrX = pad;

        // 상세 패널 (우측, 데스크탑만)
        const panelX = mob ? 0 : pyrX + pyrW + (mob ? 0 : 20);
        const panelW = mob ? 0 : W - panelX - pad;

        // 계층 높이
        const pyrH    = H - pad * 2;
        const layerH  = Math.floor(pyrH / LAYERS.length);
        const layerGap = 4;

        return { W, H, mob, pad, pyrX, pyrW, pyrH, panelX, panelW, layerH, layerGap };
    }

    /* ===================== 피라미드 좌표 계산 ===================== */
    function layerRect(L, i) {
        const { pyrX, pyrW, pad, layerH, layerGap } = L;
        const total = LAYERS.length;
        // 위로 갈수록 좁아짐 (레지스터=꼭대기=가장 좁음)
        const minW = pyrW * 0.32;
        const maxW = pyrW;
        const frac = i / (total - 1);  // 0(레지스터) → 1(SSD)
        const w    = minW + (maxW - minW) * frac;
        const x    = pyrX + (pyrW - w) / 2;
        const y    = pad + i * (layerH + layerGap);
        const h    = layerH;
        return { x, y, w, h };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        tooltipHits = [];

        const L = buildLayout();
        drawPyramid(L);
        if (!L.mob && selectedIdx >= 0) drawDetail(L);
        if (!L.mob && selectedIdx < 0)  drawDetailIdle(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) {
            drawTooltip(mousePos.x, mousePos.y, hoveredKey);
        }
    }

    /* ===================== 피라미드 ===================== */
    function drawPyramid(L) {
        const { mob } = L;
        const fSm = mob ? 10 : 13;
        const fMd = mob ? 12 : 14;
        const fLg = mob ? 13 : 16;

        LAYERS.forEach((layer, i) => {
            const { x, y, w, h } = layerRect(L, i);
            const isSel = selectedIdx === i;
            const isHov = hoveredIdx  === i;
            const col   = layer.col;

            // 배경
            const bgCol = isSel ? col + '33' : isHov ? col + '1a' : P.surf2;
            const bdCol = isSel ? col : isHov ? col : P.border;
            const lw    = isSel ? 2.5 : isHov ? 2 : 1;
            rr(x, y, w, h, 6, bgCol, bdCol, lw);

            // 왼쪽 컬러 바
            rr(x, y, 5, h, 3, col, null);

            const cx = x + w / 2;
            const cy = y + h / 2;

            // 계층명
            tx(layer.name, cx, cy - (mob ? 7 : 8), fLg, isSel || isHov ? col : P.text, 'center', true);
            tx(layer.nameEn, cx, cy + (mob ? 5 : 7), fSm, P.muted, 'center', false);

            // 속도 / 용량 (우측)
            if (w > 160) {
                tx(layer.speed, x + w - 8, cy - 8, fSm, isSel ? col : P.sub, 'right', false);
                tx(layer.size,  x + w - 8, cy + 8, fSm, P.muted,             'right', false);
            }

            // ? 뱃지
            const qx = x + 14, qy = y + 10;
            const isHovQ = hoveredKey === layer.id;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHovQ ? col : P.surf2;
            ctx.fill();
            ctx.strokeStyle = isHovQ ? col : P.muted;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx('?', qx, qy, 7, isHovQ ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: layer.id });

            // 클릭 히트박스
            tooltipHits.push({ x, y, w, h, layerIdx: i, key: null });
        });

        // 계층 간 속도 비교 화살표 (좌측에 세로 축)
        drawSpeedAxis(L);
    }

    /* ===================== 속도 축 ===================== */
    function drawSpeedAxis(L) {
        const { pyrX, pad, layerH, layerGap } = L;
        const axX  = pyrX - 14;
        const topY = pad + layerH / 2;
        const botY = pad + (LAYERS.length - 1) * (layerH + layerGap) + layerH / 2;
        if (axX < 4) return;

        ctx.beginPath();
        ctx.moveTo(axX, topY);
        ctx.lineTo(axX, botY);
        ctx.strokeStyle = P.muted;
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 화살촉 위(빠름)
        ctx.beginPath();
        ctx.moveTo(axX, topY - 2);
        ctx.lineTo(axX - 4, topY + 8);
        ctx.lineTo(axX + 4, topY + 8);
        ctx.closePath();
        ctx.fillStyle = P.purple;
        ctx.fill();

        tx('빠름', axX, topY - 12, 8, P.purple, 'center', true);
        tx('느림', axX, botY + 12, 8, P.muted,  'center', false);
    }

    /* ===================== 상세 패널 ===================== */
    function drawDetail(L) {
        const { panelX, panelW, pad, H } = L;
        const layer = LAYERS[selectedIdx];
        const col   = layer.col;
        const pY    = pad;
        const pH    = H - pad * 2;

        rr(panelX, pY, panelW, pH, 8, P.surf, col, 2);

        // 헤더
        rr(panelX, pY, panelW, 48, 8, col + '22', null);
        tx(layer.name,   panelX + panelW / 2, pY + 17, 18, col,    'center', true);
        tx(layer.nameEn, panelX + panelW / 2, pY + 36, 13, P.muted, 'center', false);

        const rows = [
            ['접근 속도', layer.speed],
            ['용량',      layer.size],
            ['기술',      layer.tech],
            ['비용',      layer.cost],
        ];
        const rowH = 44;
        rows.forEach(([label, val], i) => {
            const ry = pY + 60 + i * rowH;
            rr(panelX + 12, ry, panelW - 24, rowH - 6, 5, P.surf2, P.border, 1);
            tx(label, panelX + 24,             ry + (rowH - 6) / 2, 13, P.muted, 'left',  false);
            tx(val,   panelX + panelW - 20,    ry + (rowH - 6) / 2, 14, col,     'right', true);
        });

        // 설명
        const descY = pY + 60 + rows.length * rowH + 12;
        rr(panelX + 12, descY, panelW - 24, pH - (descY - pY) - 12, 5, P.surf2, P.border, 1);
        wrapText(layer.detail, panelX + 22, descY + 16, panelW - 44, 22, 13, P.sub);
    }

    function drawDetailIdle(L) {
        const { panelX, panelW, pad, H } = L;
        const cx = panelX + panelW / 2;
        const cy = H / 2;
        rr(panelX, pad, panelW, H - pad * 2, 8, P.surf, P.border, 1);
        tx('계층을 클릭하면',  cx, cy - 14, 14, P.muted, 'center', false);
        tx('상세 정보가 표시됩니다', cx, cy + 10, 14, P.muted, 'center', false);
    }

    function wrapText(text, x, y, maxW, lineH, sz, col) {
        ctx.font = `400 ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle    = col;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'top';
        const words = text.split(' ');
        let line = '';
        let cy   = y;
        words.forEach(word => {
            const test = line ? line + ' ' + word : word;
            if (ctx.measureText(test).width > maxW && line) {
                ctx.fillText(line, x, cy);
                cy += lineH;
                line = word;
            } else {
                line = test;
            }
        });
        if (line) ctx.fillText(line, x, cy);
    }

    /* ===================== 툴팁 ===================== */
    function drawTooltip(mx, my, key) {
        const lines = TOOLTIPS[key].split('\n');
        const title = lines[0];
        const desc  = lines[1] || '';

        ctx.font = '700 14px "JetBrains Mono",monospace';
        const titleW = ctx.measureText(title).width;
        ctx.font = '400 13px "JetBrains Mono",monospace';
        const descW  = ctx.measureText(desc).width;

        const pad = 14;
        const tw  = Math.max(titleW, descW) + pad * 2;
        const th  = desc ? 60 : 36;
        const W   = GW(), H = GH();

        let tx_ = mx + 14;
        let ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);

        ctx.font = '700 14px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 18 : th / 2));

        if (desc) {
            ctx.font = '400 13px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            ctx.fillText(desc, tx_ + pad, ty_ + 42);
        }
    }

    /* ===================== 로그 / 뱃지 ===================== */
    function setLog(str) { logEl.textContent = str; }
    function setBadge(str) {
        badge.textContent = str;
        badge.className = 'mem-hier__step-badge' + (str !== 'IDLE' ? ' mem-hier__step-badge--active' : '');
    }

    /* ===================== 리셋 ===================== */
    function mhReset() {
        selectedIdx = -1;
        hoveredIdx  = -1;
        hoveredKey  = null;
        setBadge('IDLE');
        setLog('▶ 계층을 클릭하거나 마우스를 올려 상세 정보를 확인하세요.');
        draw();
    }

    /* ===================== 마우스 이벤트 ===================== */
    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = (e.clientX - rect.left) * (GW() / rect.width);
        mousePos.y = (e.clientY - rect.top)  * (GH() / rect.height);

        // ? 뱃지 히트
        const badgeHit = tooltipHits.find(h =>
            h.key && mousePos.x >= h.x && mousePos.x <= h.x + h.w &&
            mousePos.y >= h.y && mousePos.y <= h.y + h.h
        );
        const newKey = badgeHit ? badgeHit.key : null;

        // 계층 hover
        const layerHit = tooltipHits.find(h =>
            h.layerIdx !== undefined &&
            mousePos.x >= h.x && mousePos.x <= h.x + h.w &&
            mousePos.y >= h.y && mousePos.y <= h.y + h.h
        );
        const newHov = layerHit ? layerHit.layerIdx : -1;

        if (newKey !== hoveredKey || newHov !== hoveredIdx) {
            hoveredKey = newKey;
            hoveredIdx = newHov;
            canvas.style.cursor = (newKey || newHov >= 0) ? 'pointer' : 'default';
            draw();
        }
    });

    canvas.addEventListener('click', function (e) {
        const rect = canvas.getBoundingClientRect();
        const mx   = (e.clientX - rect.left) * (GW() / rect.width);
        const my   = (e.clientY - rect.top)  * (GH() / rect.height);

        const layerHit = tooltipHits.find(h =>
            h.layerIdx !== undefined &&
            mx >= h.x && mx <= h.x + h.w &&
            my >= h.y && my <= h.y + h.h
        );
        if (layerHit) {
            selectedIdx = layerHit.layerIdx;
            const layer = LAYERS[selectedIdx];
            setBadge(layer.nameEn);
            setLog(`${layer.name} (${layer.nameEn}) — 접근 속도: ${layer.speed} / 용량: ${layer.size}`);
            draw();
        }
    });

    canvas.addEventListener('mouseleave', function () {
        hoveredIdx = -1;
        hoveredKey = null;
        canvas.style.cursor = 'default';
        draw();
    });

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();