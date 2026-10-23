/**
 * 시스템 콜 시각화
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
    var root    = el('div', 'sc-viz');
    var toolbar = el('div', 'sc-viz__toolbar');
    var tbLeft  = el('div', 'sc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sc-viz__title', 'System Call'));

    var modeWrap = el('div', 'sc-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sc-viz__mode-btn' + (i === 0 ? ' sc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sc-viz__speed');
    speedWrap.appendChild(el('span', 'sc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sc-viz__speed-btn' + (i === 0 ? ' sc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sc-viz__controls');
    var btnPlay  = el('button', 'sc-viz__btn sc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sc-viz__btn', '↺ RESET');
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

    let vPktProg = 1, hPktProg = 1;
    let hPktFrom = null, hPktTo = null;

    /* ===================== 상태 ===================== */
    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 시스템 콜 흐름을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function syA(col, a) {
        var v = Math.round(clamp01(a) * 255);
        return col + (v < 16 ? '0' : '') + v.toString(16);
    }
    function syMix(now, was, f) {
        if (now && was) return 1;
        if (now) return f;
        if (was) return 1 - f;
        return 0;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var nh   = mob ? 46 : 56;
        var rgap = mob ? 20 : 30;
        var band = mob ? 26 : 30;
        var lgap = mob ? 12 : 56;
        var lw   = (w - lgap) / 2;
        var ins  = mob ? 4 : 6;
        var ry   = [];
        for (var i = 0; i < 4; i++) ry.push(band + 10 + i * (nh + rgap));
        var rowsEnd = ry[3] + nh;
        var barY = rowsEnd + 12;
        var barH = mob ? 40 : 30;
        return {
            w: w, mob: mob, nh: nh, fdH: mob ? 34 : 40, band: band, lgap: lgap, lw: lw,
            ins: ins, nw: lw - ins * 2, ux: ins, kx: lw + lgap + ins, midX: w / 2,
            ry: ry, rowsEnd: rowsEnd, barY: barY, barH: barH,
            fsT: mob ? 11 : 13, fsS: mob ? 11 : 12,
            total: barY + barH + 6
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 상태 ===================== */
    function syChips(L) {
        var ux = L.ux, kx = L.kx, nw = L.nw, nh = L.nh, ry = L.ry, mx = L.midX;
        var uC = ux + nw / 2, kC = kx + nw / 2;
        var yA = ry[0] + nh / 2, yC = ry[2] + nh / 2;
        return [
            { i: 0, label: 'open(path)', col: P.purple,
              pts: [{ x: uC, y: ry[0] + nh }, { x: uC, y: ry[1] }] },
            { i: 2, label: 'RAX=2', col: P.orange,
              pts: [{ x: ux + nw, y: yC }, { x: mx, y: yC }, { x: mx, y: yA }, { x: kx, y: yA }] },
            { i: 3, label: 'sys_open', col: P.teal,
              pts: [{ x: kC, y: ry[0] + nh }, { x: kC, y: ry[1] }] },
            { i: 4, label: '/etc/passwd', col: P.orange,
              pts: [{ x: kC, y: ry[1] + nh }, { x: kC, y: ry[2] }] },
            { i: 5, label: 'fd=3', col: P.green,
              pts: [{ x: kx, y: yC }, { x: ux + nw, y: yC }] },
            { i: 6, label: 'fd=3', col: P.green,
              pts: [{ x: L.mob ? uC : ux + nw - 40, y: ry[2] }, { x: L.mob ? uC : ux + nw - 40, y: ry[0] + nh }] }
        ];
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function syPartial(pts, f) {
        var total = 0, i;
        for (i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        var target = clamp01(f) * total, acc = 0, out = [pts[0]];
        for (i = 1; i < pts.length; i++) {
            var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (acc + d >= target) {
                var r = d ? (target - acc) / d : 0;
                out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r });
                return out;
            }
            acc += d;
            out.push(pts[i]);
        }
        return out;
    }
    function syStroke(pts, col, lw, dash) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.setLineDash(dash);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function syPill(x, y, label, fill, fg) {
        ctx.font = '700 11px "JetBrains Mono",monospace';
        var pw = ctx.measureText(label).width + 14;
        rr(x - pw / 2, y - 9, pw, 18, 9, fill, null, 0);
        tx(label, x, y, 11, fg, 'center', true);
    }
    function syChip(x, y, label, col, mob) {
        if (mob) {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = col + 'ff';
            ctx.fill();
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            return;
        }
        syPill(x, y, label, col + 'ff', '#111111');
    }
    function syBox(x, y, w, h, col, on) {
        rr(x, y, w, h, 8, P.surf + 'ff', P.border + 'ff', 1.5);
        if (on > 0.01) rr(x, y, w, h, 8, syA(col, 0.16 * on), syA(col, on), 2.5);
    }
    function syNodeText(x, y, w, h, L, col, on, a, b, c) {
        var cx = x + w / 2;
        var hot = on > 0.5;
        tx(a, cx, y + h * 0.26, L.fsT, hot ? col + 'ff' : P.sub + 'ff', 'center', true);
        tx(b, cx, y + h * 0.52, L.fsS, P.sub + 'ff', 'center', false);
        tx(c, cx, y + h * 0.8, L.fsS, hot ? col + 'ff' : P.sub + 'ff', 'center', false);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var idle = !step;
        var s = idle ? steps[0] : step;
        var pv = idle ? null : (prev || null);
        var idx = steps.indexOf(s);
        var pIdx = pv ? steps.indexOf(pv) : -1;
        var f = idle ? 0 : ez(t);
        var sU = s.uActive || [], sK = s.kActive || [];
        var pU = pv ? (pv.uActive || []) : [], pK = pv ? (pv.kActive || []) : [];
        function syAct(list, prevList, key) {
            return syMix(list.indexOf(key) !== -1, prevList.indexOf(key) !== -1, f);
        }
        var aApp = syAct(sU, pU, 'app'), aGl = syAct(sU, pU, 'glibc');
        var aTb = syAct(sK, pK, 'table'), aHd = syAct(sK, pK, 'handler'), aVf = syAct(sK, pK, 'vfs');
        var regsA = syMix(idx >= 1, pIdx >= 1, f);
        var fdA = syMix(!!s.showFd, !!(pv && pv.showFd), f);
        var resA = syMix(!!s.showFdUser, !!(pv && pv.showFdUser), f);
        var rax = (idx >= 6 || (idx === 5 && f > 0.9)) ? '3' : '2';
        var cross = s.mode === 'crossing';

        var ux = L.ux, kx = L.kx, nw = L.nw, nh = L.nh, ry = L.ry, fdH = L.fdH;
        var uC = ux + nw / 2, kC = kx + nw / 2;
        var bandMid = L.band / 2;

        ctx.save();
        ctx.translate(x0, top);

        rr(0, 0, L.lw, L.rowsEnd + 4, 8, P.purple + '0c', null, 0);
        rr(L.lw + L.lgap, 0, L.lw, L.rowsEnd + 4, 8, P.teal + '09', null, 0);
        tx('USER (Ring 3)', L.ins, bandMid, L.fsS, P.purple + 'ff', 'left', true);
        tx('KERNEL (Ring 0)', w - L.ins, bandMid, L.fsS, P.teal + 'ff', 'right', true);

        ln(L.midX, 0, L.midX, L.rowsEnd + 4, cross ? P.yellow + 'ff' : P.border + 'ff', cross ? 2.5 : 1.2, cross ? [] : [5, 5]);
        if (cross) {
            syPill(L.midX, bandMid, (s.vPkt && s.vPkt.dir === 'up') ? 'RET' : 'TRAP', P.yellow + 'ff', '#111111');
        } else {
            syPill(L.midX, bandMid, '경계', P.surf2 + 'ff', P.sub + 'ff');
        }

        syBox(ux, ry[0], nw, nh, P.purple, aApp);
        syNodeText(ux, ry[0], nw, nh, L, P.purple, aApp, 'Application', 'main() 실행 중', 'open(path)');
        syBox(ux, ry[1], nw, nh, P.orange, aGl);
        syNodeText(ux, ry[1], nw, nh, L, P.orange, aGl, 'glibc 래퍼', 'libc.so', 'syscall 명령 준비');
        syBox(ux, ry[2], nw, nh, P.orange, regsA);
        tx('CPU 레지스터', uC, ry[2] + nh * 0.26, L.fsT, regsA > 0.5 ? P.orange + 'ff' : P.sub + 'ff', 'center', true);
        ctx.globalAlpha = regsA;
        tx('RAX=' + rax + '  RDI=path', uC, ry[2] + nh * 0.52, L.fsS, P.text + 'ff', 'center', false);
        tx('RSI=0', uC, ry[2] + nh * 0.8, L.fsS, P.text + 'ff', 'center', false);
        ctx.globalAlpha = 1 - regsA;
        tx('값 없음', uC, ry[2] + nh * 0.6, L.fsS, P.sub + 'ff', 'center', false);
        ctx.globalAlpha = 1;
        if (resA > 0.001) {
            ctx.globalAlpha = resA;
            syBox(ux, ry[3], nw, fdH, P.green, resA);
            tx('open() → fd = 3', uC, ry[3] + fdH * 0.34, L.fsS, P.green + 'ff', 'center', true);
            tx('반환 완료', uC, ry[3] + fdH * 0.72, L.fsS, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        syBox(kx, ry[0], nw, nh, P.teal, aTb);
        syNodeText(kx, ry[0], nw, nh, L, P.teal, aTb, 'syscall 테이블', 'sys_call_table', '[2] → sys_open()');
        syBox(kx, ry[1], nw, nh, P.purple, aHd);
        syNodeText(kx, ry[1], nw, nh, L, P.purple, aHd, 'sys_open', '커널 핸들러', 'VFS 호출');
        syBox(kx, ry[2], nw, nh, P.orange, aVf);
        syNodeText(kx, ry[2], nw, nh, L, P.orange, aVf, 'VFS / inode', '파일 탐색', '/etc/passwd');
        if (fdA > 0.001) {
            ctx.globalAlpha = fdA;
            syBox(kx, ry[3], nw, fdH, P.green, fdA);
            tx(L.mob ? 'fd = 3 할당' : 'fd = 3 할당 완료', kC, ry[3] + fdH / 2, L.fsS, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        syChips(L).forEach(function (c) {
            if (c.i !== idx) return;
            var part = syPartial(c.pts, f);
            var head = part[part.length - 1];
            syStroke(c.pts, syA(c.col, 0.35), 1.5, [4, 4]);
            syStroke(part, syA(c.col, 0.95), 2.5, []);
            syChip(head.x, head.y, c.label, c.col, L.mob);
        });

        var barTxt = cross ? '모드 전환 (Trap / sysret)'
                   : s.mode === 'kernel' ? '커널 모드 (Ring 0): 커널이 시스템 콜을 처리합니다'
                   : '유저 모드 (Ring 3): 애플리케이션과 glibc 영역';
        rr(0, L.barY, w, L.barH, 6, P.surf2 + 'ff', cross ? P.yellow + 'ff' : P.border + 'ff', 1.2);
        var bl = lines(barTxt, w - 20, L.fsS);
        var lh = L.fsS + 4;
        var by0 = L.barY + L.barH / 2 - (bl.length - 1) * lh / 2;
        bl.forEach(function (ln2, li) {
            tx(ln2, w / 2, by0 + li * lh, L.fsS, (cross ? P.yellow : P.text) + 'ff', 'center', cross);
        });

        ctx.restore();
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
        speedBtns.forEach(function (b) { b.classList.remove('sc-viz__speed-btn--active'); });
        btn.classList.add('sc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sc-viz__mode-btn--active', d.key === m); });
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