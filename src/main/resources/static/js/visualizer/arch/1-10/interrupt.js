/**
 * 인터럽트 인터랙티브 시각화
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
    var root    = el('div', 'intr');
    var toolbar = el('div', 'intr__toolbar');
    var tbLeft  = el('div', 'intr__toolbar-left');
    tbLeft.appendChild(el('span', 'intr__title', 'INTERRUPT'));

    var modeWrap = el('div', 'intr__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'intr__mode-btn' + (i === 0 ? ' intr__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'intr__speed');
    speedWrap.appendChild(el('span', 'intr__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'intr__speed-btn' + (i === 0 ? ' intr__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'intr__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'intr__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'intr__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'intr__controls');
    var btnPlay  = el('button', 'intr__btn intr__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'intr__btn', '▶| STEP');
    var btnReset = el('button', 'intr__btn', '↺ RESET');
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

    /* ===================== 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:   'CPU\n명령어를 실행하는 프로세서. 인터럽트 신호를 감지하면 현재 작업을 중단한다.',
        PIC:   'PIC (Programmable Interrupt Controller)\n하드웨어 장치로부터 인터럽트를 수집하고 우선순위를 조정해 CPU에 전달한다.',
        IVT:   'IDT / IVT (벡터 테이블)\n보호 모드(현대 OS): IDT 사용. 실제 모드: IVT 사용. 인터럽트 번호로 ISR 주소를 찾는다.',
        STACK: 'Stack (컨텍스트 저장)\nPC·레지스터 등 현재 실행 상태를 저장한다. ISR 종료 후 복원해 원래 작업을 재개한다.',
        ISR:   'ISR (Interrupt Service Routine)\n인터럽트를 실제로 처리하는 함수. 처리 완료 후 IRET 명령으로 원래 흐름으로 복귀한다.',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge: 'CPU 실행 중',
            phase: 'normal',
            log:   'Step 1 — CPU가 프로그램을 정상 실행 중입니다. 키보드에서 인터럽트 신호(IRQ1)가 발생했습니다! PIC가 이를 감지합니다.',
            active: ['CPU', 'PIC'],
            arrow:  [['CPU', 'PIC', 'signal']],
        },
        {
            badge: 'CONTEXT 저장',
            phase: 'save',
            log:   'Step 2 — CPU가 현재 PC(프로그램 카운터)와 레지스터 값을 스택에 저장합니다. 나중에 원래 위치로 돌아오기 위한 필수 과정입니다.',
            active: ['CPU', 'STACK'],
            arrow:  [['CPU', 'STACK', 'save']],
        },
        {
            badge: 'IVT 조회',
            phase: 'ivt',
            log:   'Step 3 — CPU가 인터럽트 번호(IRQ1 = 키보드)를 인터럽트 벡터 테이블에서 검색합니다. ISR의 주소 0x0204를 찾았습니다.',
            active: ['CPU', 'IVT'],
            arrow:  [['CPU', 'IVT', 'lookup']],
        },
        {
            badge: 'ISR 실행',
            phase: 'isr',
            log:   'Step 4 — CPU가 키보드 ISR(0x0204)로 점프해 인터럽트를 처리합니다. 키 입력 데이터를 읽고 버퍼에 저장합니다.',
            active: ['IVT', 'ISR'],
            arrow:  [['IVT', 'ISR', 'jump']],
        },
        {
            badge: 'IRET 복귀',
            phase: 'return',
            log:   'Step 5 — ISR이 완료됐습니다. IRET 명령이 실행되어 스택에서 EIP·CS·EFLAGS를 복원하고 원래 프로그램으로 돌아갑니다.',
            active: ['ISR', 'STACK', 'CPU'],
            arrow:  [['ISR', 'STACK', 'restore'], ['STACK', 'CPU', 'resume']],
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = TOOLTIPS;
    var IV_MAIN = ['mov ax,1', 'add bx,ax', 'inc cx', 'cmp cx,10'];
    var IV_MAIN_AD = ['0100', '0102', '0104', '0106'];
    var IV_ISR = ['push ax', 'in al,60h', 'mov buf,al', 'iret'];
    var IV_ISR_AD = ['0204', '0206', '0208', '020A'];
    var IV_EDGES = [['CPU', 'PIC'], ['CPU', 'STACK'], ['CPU', 'IVT'], ['IVT', 'ISR'], ['ISR', 'STACK']];
    var IV_NODE_COL = { CPU: 'purple', PIC: 'orange', IVT: 'yellow', STACK: 'teal', ISR: 'green' };
    var IV_TYPE_COL = { signal: 'orange', save: 'teal', lookup: 'yellow', jump: 'green', restore: 'teal', resume: 'purple' };
    var IV_PHASE = {
        normal: ['IRQ1 감지 (키보드)', 'orange'],
        save: ['PC + Registers → Stack', 'teal'],
        ivt: ['IRQ1 → ISR 주소: 0x0204', 'yellow'],
        isr: ['ISR 실행 중 (키 입력 처리)', 'green'],
        'return': ['IRET → 원래 작업 복귀', 'purple']
    };
    var IV_ANIM = {
        1: [['PIC', 'CPU', 'IRQ', 'orange', 0, 0.3], ['CPU', 'STACK', 'CTX', 'teal', 0.3, 0.75]],
        2: [['CPU', 'IVT', 'VEC', 'yellow', 0, 0.5]],
        3: [['IVT', 'ISR', 'JMP', 'green', 0, 0.3]],
        4: [['ISR', 'STACK', 'RST', 'teal', 0.3, 0.6], ['STACK', 'CPU', 'RET', 'purple', 0.6, 0.9]]
    };

    /* ===================== 단계 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 인터럽트 처리 과정을 확인하세요.'; }
    function ez(q) { var c = clamp01(q); return c * c * (3 - 2 * c); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var g = mob ? 22 : 56;
        var cw = (w - g) / 2;
        var hA = mob ? 56 : 62;
        var hB = mob ? 102 : 146;
        var hC = mob ? 70 : 92;
        var yA = mob ? 30 : 36;
        var yB = yA + hA + (mob ? 26 : 50);
        var yC = yB + hB + (mob ? 26 : 44);
        return {
            mob: mob, g: g, cw: cw,
            PIC: { x: 0, y: yA, w: cw, h: hA },
            IVT: { x: cw + g, y: yA, w: cw, h: hA },
            CPU: { x: 0, y: yB, w: cw, h: hB },
            ISR: { x: cw + g, y: yB, w: cw, h: hB },
            STACK: { x: 0, y: yC, w: cw, h: hC },
            capY: yC + hC + (mob ? 12 : 16)
        };
    }
    function ivAbs(L, x0, top) {
        var out = { mob: L.mob, g: L.g, cw: L.cw, capY: L.capY + top };
        ['PIC', 'IVT', 'CPU', 'ISR', 'STACK'].forEach(function (k) {
            out[k] = { x: L[k].x + x0, y: L[k].y + top, w: L[k].w, h: L[k].h };
        });
        return out;
    }
    function ivRowY(n, i, mob) { return n.y + (mob ? 36 : 50) + i * (mob ? 15 : 22) + (mob ? 7.5 : 11); }
    function sceneH(w, mob) {
        var L = layout(w, mob);
        var fs = mob ? 11 : 13;
        var n = 1;
        Object.keys(IV_PHASE).forEach(function (k) { n = Math.max(n, lines(IV_PHASE[k][0], w - 16, fs).length); });
        return L.capY + n * (fs + 4) + 6;
    }

    /* ===================== 상태 계산 ===================== */
    function ivState(idx, tt) {
        var st = { pc: { box: 'main', line: 3 }, stack: 0, ivt: false };
        if (idx >= 1) st.stack = idx === 1 && tt < 0.75 ? 0 : 2;
        if (idx === 2) st.ivt = tt >= 0.5;
        if (idx === 3) {
            st.ivt = true;
            st.stack = 2;
            if (tt >= 0.3 && tt < 0.42) st.pc = { box: 'jump', f: seg(tt, 0.3, 0.42) };
            else if (tt >= 0.42) st.pc = { box: 'isr', line: Math.min(2, Math.floor(seg(tt, 0.42, 1) * 3)) };
        }
        if (idx === 4) {
            st.stack = tt < 0.6 ? 2 : 0;
            if (tt < 0.15) st.pc = { box: 'isr', line: 2 };
            else if (tt < 0.6) st.pc = { box: 'isr', line: 3 };
            else if (tt < 0.9) st.pc = { box: 'ret', f: seg(tt, 0.6, 0.9) };
            else st.pc = { box: 'main', line: 3 };
        }
        return st;
    }

    /* ===================== 선과 경로 ===================== */
    function ivExit(n, ux, uy) {
        var a = Math.abs(ux), b = Math.abs(uy);
        return Math.min(a > 1e-6 ? n.w / 2 / a : 1e9, b > 1e-6 ? n.h / 2 / b : 1e9);
    }
    function ivClip(na, nb, pad) {
        var ax = na.x + na.w / 2, ay = na.y + na.h / 2;
        var bx = nb.x + nb.w / 2, by = nb.y + nb.h / 2;
        var len = Math.hypot(bx - ax, by - ay) || 1;
        var ux = (bx - ax) / len, uy = (by - ay) / len;
        var ta = ivExit(na, ux, uy) + pad, tb = ivExit(nb, -ux, -uy) + pad;
        return { x1: ax + ux * ta, y1: ay + uy * ta, x2: bx - ux * tb, y2: by - uy * tb };
    }
    function ivEdgeCol(s, a, b) {
        var hit = null;
        s.arrow.forEach(function (arr) {
            if ((arr[0] === a && arr[1] === b) || (arr[0] === b && arr[1] === a)) hit = P[IV_TYPE_COL[arr[2]]] + 'ff';
        });
        return hit;
    }
    function ivDrawEdges(L, s) {
        IV_EDGES.forEach(function (pr) {
            var c = ivEdgeCol(s, pr[0], pr[1]);
            var e = ivClip(L[pr[0]], L[pr[1]], 3);
            ctx.beginPath();
            ctx.setLineDash(c ? [] : [4, 5]);
            ctx.moveTo(e.x1, e.y1);
            ctx.lineTo(e.x2, e.y2);
            ctx.strokeStyle = c || P.border;
            ctx.lineWidth = c ? 2.5 : 1;
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }
    function ivPaths(L) {
        var mob = L.mob, cpuR = L.CPU.x + L.cw, isrL = L.ISR.x;
        var yc = ivRowY(L.CPU, 3, mob), yi = ivRowY(L.ISR, 0, mob);
        var mx = cpuR + L.g * 0.4;
        return {
            jump: [[cpuR, yc - 4], [mx, yc - 4], [mx, yi], [isrL, yi]],
            back: [[isrL, yc + 4], [cpuR, yc + 4]]
        };
    }
    function ivPolyAt(pts, f) {
        var lens = [], total = 0, i;
        for (i = 0; i < pts.length - 1; i++) {
            lens.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
            total += lens[i];
        }
        var want = f * total;
        for (i = 0; i < lens.length; i++) {
            if (want <= lens[i] || i === lens.length - 1) {
                var k = lens[i] ? Math.min(1, want / lens[i]) : 0;
                return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
            }
            want -= lens[i];
        }
        return pts[0];
    }
    function ivDash(pts, col) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 노드 그리기 ===================== */
    function ivBadge(s, x0, top, w, mob) {
        var bw = mob ? 120 : 170, bh = mob ? 20 : 24;
        rr(x0 + (w - bw) / 2, top, bw, bh, bh / 2, P.purple + '33', P.purple + '99', 1);
        tx(s.badge, x0 + w / 2, top + bh / 2, mob ? 11 : 13, P.text, 'center', true);
    }
    function ivBox(n, key, s, mob) {
        var on = s.active.indexOf(key) >= 0;
        var c = P[IV_NODE_COL[key]];
        var hov = hoveredKey === key;
        var title = key;
        var sub = {
            PIC: mob ? 'IRQ 중재' : 'IRQ 컨트롤러',
            IVT: '벡터 테이블',
            CPU: '메인 프로그램',
            ISR: mob ? '키보드 처리' : '키보드 처리 루틴',
            STACK: '컨텍스트 저장'
        }[key];
        rr(n.x, n.y, n.w, n.h, 8, P.surf, hov ? P.purple : (on ? c : P.border), on || hov ? 2.2 : 1.4);
        if (on) rr(n.x, n.y, n.w, n.h, 8, c + '28', null);
        tx(title, n.x + (mob ? 8 : 12), n.y + (mob ? 9 : 14), mob ? 12 : 15, on ? c : P.text, 'left', true);
        tx(sub, n.x + (mob ? 8 : 12), n.y + (mob ? 24 : 34), mob ? 11 : 12, P.sub, 'left', false);
    }
    function ivNote(n, mob, txt, col) {
        tx(txt, n.x + (mob ? 8 : 12), n.y + (mob ? 42 : 52), mob ? 11 : 12, col, 'left', false);
    }
    function ivRows(n, mob, rows, adr, cur, col) {
        var lh = mob ? 15 : 22;
        rows.forEach(function (txt, i) {
            var y = ivRowY(n, i, mob);
            if (i === cur) {
                rr(n.x + 5, y - lh / 2 + 1, n.w - 10, lh - 2, 4, col + '2a', null);
                circ(n.x + (mob ? 8 : 13), y, mob ? 3.5 : 4.5, col + 'ff', null);
            }
            if (!mob) tx(adr[i], n.x + 24, y, 13, P.sub, 'left', false);
            tx(txt, n.x + (mob ? 14 : 72), y, mob ? 11 : 13, P.text, 'left', i === cur);
        });
    }
    function ivStackBody(n, mob, count) {
        var h = mob ? 14 : 16, gap = mob ? 2 : 4, fs = mob ? 11 : 12;
        var y0 = n.y + (mob ? 36 : 48);
        if (count === 0) tx('비어 있음', n.x + (mob ? 8 : 12), y0 + h / 2, fs, P.sub, 'left', false);
        ['PC=0106', 'FLAGS'].forEach(function (it, i) {
            if (i >= count) return;
            var y = y0 + i * (h + gap);
            rr(n.x + 6, y, n.w - 12, h, 4, P.teal + '33', P.teal + 'aa', 1);
            tx(it, n.x + (mob ? 12 : 16), y + h / 2, fs, P.text, 'left', false);
        });
    }
    function ivDrawBodies(L, s, st, mob) {
        ivNote(L.PIC, mob, 'IRQ1: 키보드', s.active.indexOf('PIC') >= 0 ? P.orange : P.sub);
        ivNote(L.IVT, mob, mob ? 'IRQ1→0x0204' : 'IRQ1 → 0x0204', st.ivt ? P.yellow : P.sub);
        ivRows(L.CPU, mob, IV_MAIN, IV_MAIN_AD, st.pc.box === 'main' ? st.pc.line : -1, P.purple);
        ivRows(L.ISR, mob, IV_ISR, IV_ISR_AD, st.pc.box === 'isr' ? st.pc.line : -1, P.green);
        ivStackBody(L.STACK, mob, st.stack);
    }
    function ivDrawPc(st, paths) {
        var p = null;
        if (st.pc.box === 'jump') p = ivPolyAt(paths.jump, st.pc.f);
        if (st.pc.box === 'ret') p = ivPolyAt(paths.back, st.pc.f);
        if (p) circ(p[0], p[1], 4.5, P.purple + 'ff', null);
    }
    function ivChip(x, y, lbl, col) {
        rr(x - 19, y - 8, 38, 16, 8, col, null);
        tx(lbl, x, y, 11, '#111111', 'center', true);
    }
    function ivDrawChips(L, idx, tt) {
        (IV_ANIM[idx] || []).forEach(function (m) {
            if (tt < m[4] || tt >= m[5]) return;
            var e = ivClip(L[m[0]], L[m[1]], 3);
            var f = ez(seg(tt, m[4], m[5]));
            ivChip(e.x1 + (e.x2 - e.x1) * f, e.y1 + (e.y2 - e.y1) * f, m[2], P[m[3]] + 'ff');
        });
    }
    function ivCaption(L, s, x0, w, mob) {
        var info = IV_PHASE[s.phase];
        if (!info) return;
        var fs = mob ? 11 : 13, lh = fs + 4;
        lines(info[0], w - 16, fs).forEach(function (txt, i) {
            tx(txt, x0 + w / 2, L.capY + i * lh + lh / 2, fs, P[info[1]], 'center', true);
        });
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var idx = steps.indexOf(s);
        var tt = prev && step && prev !== step ? t : 1;
        var L = ivAbs(layout(w, mob), x0, top);
        var st = ivState(idx, tt);
        var paths = ivPaths(L);
        ivBadge(s, x0, top, w, mob);
        ivDrawEdges(L, s);
        ivDash(paths.jump, P.purple + '66');
        ivDash(paths.back, P.purple + '66');
        ivBox(L.PIC, 'PIC', s, mob);
        ivBox(L.IVT, 'IVT', s, mob);
        ivBox(L.CPU, 'CPU', s, mob);
        ivBox(L.ISR, 'ISR', s, mob);
        ivBox(L.STACK, 'STACK', s, mob);
        ivDrawBodies(L, s, st, mob);
        ivDrawPc(st, paths);
        ivDrawChips(L, idx, tt);
        ivCaption(L, s, x0, w, mob);
        ['CPU', 'PIC', 'IVT', 'STACK', 'ISR'].forEach(function (k) { tipBadge(L[k].x + L[k].w - 11, L[k].y + 11, k); });
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
        speedBtns.forEach(function (b) { b.classList.remove('intr__speed-btn--active'); });
        btn.classList.add('intr__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('intr__mode-btn--active', d.key === m); });
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