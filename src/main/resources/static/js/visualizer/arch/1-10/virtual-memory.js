/**
 * 가상 메모리 인터랙티브 시각화
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
    var root    = el('div', 'virt-mem');
    var toolbar = el('div', 'virt-mem__toolbar');
    var tbLeft  = el('div', 'virt-mem__toolbar-left');
    tbLeft.appendChild(el('span', 'virt-mem__title', 'Virtual Memory'));

    var modeWrap = el('div', 'virt-mem__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'virt-mem__mode-btn' + (i === 0 ? ' virt-mem__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'virt-mem__speed');
    speedWrap.appendChild(el('span', 'virt-mem__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'virt-mem__speed-btn' + (i === 0 ? ' virt-mem__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'virt-mem__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'virt-mem__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'virt-mem__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'virt-mem__controls');
    var btnPlay  = el('button', 'virt-mem__btn virt-mem__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'virt-mem__btn', '▶| STEP');
    var btnReset = el('button', 'virt-mem__btn', '↺ RESET');
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

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n가상 주소로 데이터를 요청하는 프로세서',
        TLB:  'TLB (Translation Lookaside Buffer)\n최근 주소 변환 결과를 저장하는 하드웨어 캐시',
        PT:   'Page Table\n가상 페이지 번호를 물리 프레임 번호로 변환',
        PM:   'Physical Memory (RAM)\n실제 데이터가 올라와있는 물리 메모리',
        DISK: 'Disk (Swap)\n페이지 폴트 시 페이지를 로드하는 보조 저장소',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'TLB HIT',
            result: 'tlb-hit',
            addr:   '0x1000',
            vpn:    'VPN: 1',
            pfn:    'PFN: 5',
            offset: 'Offset: 0x000',
            phys:   '0x5000',
            log:    'Step 1 — CPU가 가상 주소 0x1000 요청. TLB에 VPN:1 → PFN:5 변환 정보가 있습니다! 물리 주소 0x5000으로 즉시 변환 후 RAM에 접근합니다.',
            path:   ['CPU','TLB','PM'],
            cols:   [P.purple, P.green, P.green],
        },
        {
            badge:  'TLB MISS',
            result: 'tlb-miss',
            addr:   '0x2000',
            vpn:    'VPN: 2',
            pfn:    'PFN: 8',
            offset: 'Offset: 0x000',
            phys:   '0x8000',
            log:    'Step 2 — CPU가 가상 주소 0x2000 요청. TLB에 없습니다(Miss). 페이지 테이블에서 VPN:2 → PFN:8 을 찾아 TLB를 갱신하고 RAM에 접근합니다.',
            path:   ['CPU','TLB','PT','TLB','PM'],
            cols:   [P.purple, P.orange, P.orange, P.teal, P.teal],
        },
        {
            badge:  'TLB HIT',
            result: 'tlb-hit',
            addr:   '0x2000',
            vpn:    'VPN: 2',
            pfn:    'PFN: 8',
            offset: 'Offset: 0x000',
            phys:   '0x8000',
            log:    'Step 3 — CPU가 0x2000 재요청. 방금 TLB에 등록된 VPN:2 → PFN:8 변환이 있습니다(Hit). 페이지 테이블 조회 없이 즉시 RAM에 접근합니다.',
            path:   ['CPU','TLB','PM'],
            cols:   [P.purple, P.green, P.green],
        },
        {
            badge:  'PAGE FAULT',
            result: 'page-fault',
            addr:   '0x3000',
            vpn:    'VPN: 3',
            pfn:    'PFN: -',
            offset: 'Offset: 0x000',
            phys:   '0xC000',
            log:    'Step 4 — CPU가 0x3000 요청. TLB Miss + 페이지 테이블에도 없습니다(Page Fault)! OS가 Disk에서 페이지를 RAM으로 로드하고 페이지 테이블과 TLB를 갱신합니다.',
            path:   ['CPU','TLB','PT','DISK','PM','TLB','PM'],
            cols:   [P.purple, P.orange, P.red, P.red, P.yellow, P.teal, P.teal],
        },
    ];

    /* ===================== 상태 ===================== */
    var TIPS = TOOLTIPS;

    /* ===================== 장면 정의 ===================== */
    var AVM_T = {
        'tlb-hit':    { split: 0.16, toTlb: 0.36, decide: 0.36, paA: 0.50, paB: 0.78, frameA: 0.78 },
        'tlb-miss':   { split: 0.12, toTlb: 0.24, decide: 0.32, toPt: 0.44, ptRes: 0.54, up: 0.68, ins: 0.78, paA: 0.78, paB: 0.90, frameA: 0.90 },
        'page-fault': { split: 0.10, toTlb: 0.20, decide: 0.27, toPt: 0.36, ptRes: 0.46, disk: 0.64, ptUp: 0.70, up: 0.80, ins: 0.88, paA: 0.88, paB: 0.95, frameA: 0.64 }
    };
    var AVM_LONG = {
        'tlb-hit': '주소 변환 캐시에서 바로 찾음',
        'tlb-miss': 'TLB에 없어 페이지 테이블을 조회',
        'page-fault': '페이지 테이블에도 없어 디스크에서 로드'
    };
    var AVM_SHORT = { 'tlb-hit': '즉시 변환', 'tlb-miss': '페이지 테이블 조회', 'page-fault': '디스크에서 로드' };

    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 가상 주소 변환 과정을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function avmIn(v, a, b) { return v >= a && v < b; }
    function avmW(str, sz) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? 1 : 0.6;
        return n * sz;
    }
    function avmC(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
    function avmVpn(s) { return parseInt(s.vpn.replace(/\D/g, ''), 10); }
    function avmFrame(s) { return Math.round(parseInt(s.phys, 16) / 4096); }
    function avmResCol(r) { return r === 'tlb-hit' ? P.green : (r === 'page-fault' ? P.red : P.orange); }

    /* ===================== 상태 계산 ===================== */
    function avmHasVpn(list, v) {
        for (var i = 0; i < list.length; i++) if (list[i].vpn === v) return true;
        return false;
    }
    function avmIdx(list, v) {
        for (var i = 0; i < list.length; i++) if (list[i].vpn === v) return i;
        return -1;
    }
    function avmFault(v) {
        for (var i = 0; i < STEPS.length; i++) {
            if (STEPS[i].result === 'page-fault' && avmVpn(STEPS[i]) === v) return i;
        }
        return -1;
    }
    function avmState(k) {
        var tlb = [], pt = [], i, v;
        if (STEPS[0].result === 'tlb-hit') tlb.push({ vpn: avmVpn(STEPS[0]), frame: avmFrame(STEPS[0]) });
        for (i = 0; i <= k; i++) {
            v = avmVpn(STEPS[i]);
            if (STEPS[i].result !== 'tlb-hit' && !avmHasVpn(tlb, v)) tlb.push({ vpn: v, frame: avmFrame(STEPS[i]) });
        }
        STEPS.forEach(function (s) {
            var v = avmVpn(s);
            if (avmHasVpn(pt, v)) return;
            var f = avmFault(v);
            pt.push({ vpn: v, frame: avmFrame(s), valid: f < 0 || k >= f });
        });
        return { tlb: tlb, pt: pt };
    }
    function avmOcc(st, f) {
        for (var i = 0; i < st.pt.length; i++) {
            if (st.pt[i].valid && st.pt[i].frame === f) return st.pt[i].vpn;
        }
        return -1;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var L = { stack: mob || w < 720, H: 0 };
        var st = L.stack, cw, gx;
        L.hdr = st ? 22 : 26;
        L.rowH = st ? 28 : 30;
        L.pad = st ? 8 : 10;
        L.cellH = st ? 20 : 24;
        L.cgY = st ? 5 : 6;
        L.cgX = 6;
        if (!st) {
            gx = 26; cw = Math.floor((w - gx * 2) / 3);
            L.va      = { x: 0, y: 0, w: cw, h: 128 };
            L.tlb     = { x: cw + gx, y: 0, w: cw, h: 128 };
            L.ram     = { x: (cw + gx) * 2, y: 0, w: cw, h: 150 };
            L.pt      = { x: cw + gx, y: 184, w: cw, h: 128 };
            L.disk    = { x: (cw + gx) * 2, y: 184, w: cw, h: 58 };
            L.badge   = { x: 0, y: 184, w: cw, h: 128 };
            L.vpnCell = { x: 10, y: 62, w: (cw - 30) / 2, h: 40 };
            L.H = 312;
        } else {
            gx = 16; cw = Math.floor((w - gx) / 2);
            L.va      = { x: 0, y: 0, w: w, h: 62 };
            L.tlb     = { x: 0, y: 92, w: cw, h: 116 };
            L.pt      = { x: cw + gx, y: 92, w: cw, h: 116 };
            L.ram     = { x: 0, y: 238, w: w, h: 128 };
            L.disk    = { x: 0, y: 392, w: w, h: 34 };
            L.badge   = { x: 0, y: 440, w: w, h: 22 };
            L.vpnCell = { x: 10, y: 30, w: (w - 30) / 2, h: 26 };
            L.H = 462;
        }
        L.offCell = { x: L.vpnCell.x + L.vpnCell.w + 10, y: L.vpnCell.y, w: L.vpnCell.w, h: L.vpnCell.h };
        L.cellW = (L.ram.w - L.pad * 2 - L.cgX * 3) / 4;
        L.rowRect = function (box, i) {
            return { x: box.x + L.pad, y: box.y + L.hdr + i * L.rowH + 2, w: box.w - L.pad * 2, h: L.rowH - 4 };
        };
        L.frameRect = function (f) {
            return {
                x: L.ram.x + L.pad + (f % 4) * (L.cellW + L.cgX),
                y: L.ram.y + L.hdr + Math.floor(f / 4) * (L.cellH + L.cgY),
                w: L.cellW, h: L.cellH
            };
        };
        return L;
    }
    function avmShift(L, x0, top) {
        ['va', 'tlb', 'pt', 'ram', 'disk', 'badge', 'vpnCell', 'offCell'].forEach(function (k) {
            L[k].x += x0; L[k].y += top;
        });
    }
    function sceneH(w, mob) { return layout(w, mob).H; }

    /* ===================== 그리기 헬퍼 ===================== */
    function avmChip(p, label, col, fs) {
        var cw2 = avmW(label, fs) + 14;
        rr(p.x - cw2 / 2, p.y - 10, cw2, 20, 10, col + 'ff', P.bg + 'ff', 1.5);
        tx(label, p.x, p.y, fs, '#111111', 'center', true);
    }
    function avmTrack(v, pts) {
        for (var i = 0; i < pts.length - 1; i++) {
            var a = pts[i], b = pts[i + 1];
            if (v <= b[0]) {
                var u = ez(seg(v, a[0], b[0]));
                return { x: lerp(a[1].x, b[1].x, u), y: lerp(a[1].y, b[1].y, u) };
            }
        }
        return pts[pts.length - 1][1];
    }
    function avmEdge(e, on, col) {
        if (on) arrow(e[0], e[1], e[2], e[3], col + 'ff', 2.2);
        else arrow(e[0], e[1], e[2], e[3], P.border, 1.2, [4, 4]);
    }

    /* ===================== 메인 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var L = layout(w, mob);
        avmShift(L, x0, top);
        var st = L.stack;
        var idx = step ? steps.indexOf(step) : -1;
        var s = idx >= 0 ? steps[idx] : null;
        var pIdx = prev ? steps.indexOf(prev) : idx - 1;
        var before = avmState(pIdx);
        var after = avmState(idx);
        var tt = s ? t : 0;
        var T = s ? AVM_T[s.result] : {};
        var fsS = st ? 11 : 12, fsM = st ? 12 : 14, fsL = st ? 13 : 16;
        var hm = st ? 11 : 13;
        var isHit = !!s && s.result === 'tlb-hit';
        var isFault = !!s && s.result === 'page-fault';
        var pv = s ? avmVpn(s) : -1;
        var fS = s ? avmFrame(s) : -1;
        var resCol = s ? avmResCol(s.result) : P.purple;
        var vEnd = isHit ? T.paA : T.toPt;
        var i, row, rc, f, ca;

        var ev = st ? [L.vpnCell.x + L.vpnCell.w / 2, L.va.y + L.va.h, L.tlb.x + L.tlb.w / 2, L.tlb.y]
                    : [L.va.x + L.va.w, L.va.y + L.va.h / 2, L.tlb.x, L.tlb.y + L.tlb.h / 2];
        var ep = st ? [L.tlb.x + L.tlb.w, L.tlb.y + L.tlb.h / 2, L.pt.x, L.pt.y + L.pt.h / 2]
                    : [L.tlb.x + L.tlb.w / 2, L.tlb.y + L.tlb.h, L.pt.x + L.pt.w / 2, L.pt.y];
        var er = st ? [L.tlb.x + L.tlb.w / 2, L.tlb.y + L.tlb.h, L.ram.x + L.ram.w / 2, L.ram.y]
                    : [L.tlb.x + L.tlb.w, L.tlb.y + L.tlb.h / 2, L.ram.x, L.ram.y + L.ram.h / 2];
        var ed = [L.disk.x + L.disk.w / 2, L.disk.y, L.ram.x + L.ram.w / 2, L.ram.y + L.ram.h];
        var epd = [L.pt.x + L.pt.w, L.pt.y + L.pt.h / 2, L.disk.x, L.disk.y + L.disk.h / 2];
        avmEdge(ev, !!s && avmIn(tt, T.split, T.toTlb), P.purple);
        avmEdge(ep, !isHit && !!s && avmIn(tt, T.toPt, T.up), resCol);
        avmEdge(er, !!s && avmIn(tt, T.paA, T.paB), resCol);
        if (!st) avmEdge(epd, isFault && avmIn(tt, T.toPt, T.disk), P.red);
        avmEdge(ed, isFault && avmIn(tt, T.ptRes, T.disk), P.red);

        rr(L.va.x, L.va.y, L.va.w, L.va.h, 8, P.surf, P.purple + 'ff', !!s && tt < T.split ? 2.5 : 1.5);
        tx('CPU' + (st ? '' : ' · 가상 주소'), L.va.x + 10, L.va.y + hm, fsM, P.purple + 'ff', 'left', true);
        tipBadge(L.va.x + L.va.w - 12, L.va.y + hm, 'CPU');
        if (st) tx(s ? 'VA ' + s.addr : 'VA 대기', L.va.x + 64, L.va.y + hm, fsM, (s ? P.text : P.sub) + 'ff', 'left', true);
        else tx(s ? 'VA ' + s.addr : '요청 대기', L.va.x + 10, L.va.y + 46, fsL, (s ? P.text : P.sub) + 'ff', 'left', true);
        ca = s ? ez(seg(tt, 0, T.split)) : 0.5;
        ctx.globalAlpha = ca;
        rr(L.vpnCell.x, L.vpnCell.y, L.vpnCell.w, L.vpnCell.h, 6, P.surf2, P.teal + 'ff', 1.5);
        if (!s || !avmIn(tt, T.split, vEnd)) tx(s ? s.vpn : 'VPN', L.vpnCell.x + L.vpnCell.w / 2, L.vpnCell.y + L.vpnCell.h / 2, fsS, P.teal + 'ff', 'center', true);
        rr(L.offCell.x, L.offCell.y, L.offCell.w, L.offCell.h, 6, P.surf2, P.border, 1);
        tx(s ? s.offset : 'Offset', L.offCell.x + L.offCell.w / 2, L.offCell.y + L.offCell.h / 2, fsS, P.sub + 'ff', 'center', false);
        ctx.globalAlpha = 1;

        var red = !!s && !isHit && avmIn(tt, T.toTlb, T.decide);
        var grn = isHit && avmIn(tt, T.decide, T.paB);
        var tc = red ? P.red : (grn ? P.green : P.teal);
        rr(L.tlb.x, L.tlb.y, L.tlb.w, L.tlb.h, 8, P.surf, tc + 'ff', red || grn ? 2.5 : 1.5);
        tx('TLB' + (st ? '' : ' · 주소 변환 캐시'), L.tlb.x + 10, L.tlb.y + hm, fsM, P.teal + 'ff', 'left', true);
        tipBadge(L.tlb.x + L.tlb.w - 12, L.tlb.y + hm, 'TLB');
        var tlbList = (s && tt >= T.up) ? after.tlb : before.tlb;
        for (i = 0; i < tlbList.length; i++) {
            row = tlbList[i];
            rc = L.rowRect(L.tlb, i);
            var fresh = !avmHasVpn(before.tlb, row.vpn);
            var hitRow = grn && row.vpn === pv;
            ctx.globalAlpha = fresh ? ez(seg(tt, T.up, T.ins)) : 1;
            rr(rc.x, rc.y, rc.w, rc.h, 5, hitRow ? P.green + '33' : P.surf2, hitRow ? P.green + 'ff' : P.border, hitRow ? 2 : 1);
            tx('VPN ' + row.vpn + ' → PFN ' + row.frame, rc.x + 8, rc.y + rc.h / 2, fsS, (hitRow ? P.green : P.text) + 'ff', 'left', hitRow);
            ctx.globalAlpha = 1;
        }

        var ptBad = isFault && avmIn(tt, T.toPt, T.ptRes);
        var ptHi = !isHit && !!s && avmIn(tt, T.toPt, T.ptRes);
        var pc = ptBad ? P.red : P.purple;
        rr(L.pt.x, L.pt.y, L.pt.w, L.pt.h, 8, P.surf, pc + 'ff', ptHi ? 2.5 : 1.5);
        tx('PT' + (st ? '' : ' · 페이지 테이블'), L.pt.x + 10, L.pt.y + hm, fsM, P.purple + 'ff', 'left', true);
        tipBadge(L.pt.x + L.pt.w - 12, L.pt.y + hm, 'PT');
        var ptList = (s && tt >= T.ptUp) ? after.pt : before.pt;
        for (i = 0; i < ptList.length; i++) {
            row = ptList[i];
            rc = L.rowRect(L.pt, i);
            var on = ptHi && row.vpn === pv;
            var onCol = ptBad ? P.red : P.purple;
            rr(rc.x, rc.y, rc.w, rc.h, 5, on ? onCol + '33' : P.surf2, on ? onCol + 'ff' : P.border, on ? 2 : 1);
            tx('VPN ' + row.vpn + ' → ' + (row.valid ? 'PFN ' + row.frame : '없음'), rc.x + 8, rc.y + rc.h / 2, fsS, (row.valid ? P.text : P.sub) + 'ff', 'left', on);
        }

        var frameOn = !!s && tt >= T.frameA;
        var ramSt = frameOn ? after : before;
        rr(L.ram.x, L.ram.y, L.ram.w, L.ram.h, 8, P.surf, P.orange + 'ff', frameOn ? 2.5 : 1.5);
        tx('RAM' + (st ? '' : ' · 물리 메모리'), L.ram.x + 10, L.ram.y + hm, fsM, P.orange + 'ff', 'left', true);
        tipBadge(L.ram.x + L.ram.w - 12, L.ram.y + hm, 'PM');
        if (s && tt >= T.paB) tx('PA ' + s.phys, L.ram.x + L.ram.w - 26, L.ram.y + hm, fsS, P.orange + 'ff', 'right', true);
        for (f = 0; f < 16; f++) {
            rc = L.frameRect(f);
            var occ = avmOcc(ramSt, f);
            var lit = frameOn && f === fS;
            rr(rc.x, rc.y, rc.w, rc.h, 4, lit ? P.orange + '33' : P.surf2, lit ? P.orange + 'ff' : P.border, lit ? 2 : 1);
            tx(String(f), rc.x + 5, rc.y + rc.h / 2, fsS, P.sub + 'ff', 'left', false);
            if (occ >= 0) tx('VPN' + occ, rc.x + rc.w - 5, rc.y + rc.h / 2, fsS, (lit ? P.orange : P.text) + 'ff', 'right', true);
        }

        var diskOn = isFault && avmIn(tt, T.ptRes, T.disk);
        var dcy = L.disk.y + L.disk.h / 2;
        rr(L.disk.x, L.disk.y, L.disk.w, L.disk.h, 8, diskOn ? P.red + '22' : P.surf, diskOn ? P.red + 'ff' : P.red + '99', diskOn ? 2.5 : 1.5);
        tx('DISK · Swap' + (st ? '' : ' 영역'), L.disk.x + L.disk.w / 2, dcy, fsM, P.red + 'ff', 'center', true);
        tipBadge(L.disk.x + L.disk.w - 12, dcy, 'DISK');

        if (s) {
            var vpnP = avmC(L.vpnCell), tlbP = avmC(L.tlb), diskP = avmC(L.disk), fP = avmC(L.frameRect(fS));
            var hitI = avmIdx(before.tlb, pv), insI = before.tlb.length;
            var srcP = avmC(L.rowRect(L.tlb, isHit ? hitI : insI));
            var insP = avmC(L.rowRect(L.tlb, insI));
            var ptP = avmC(L.rowRect(L.pt, avmIdx(after.pt, pv)));
            if (avmIn(tt, T.split, vEnd)) {
                var vpts = isHit ? [[T.split, vpnP], [T.toTlb, srcP], [T.paA, srcP]]
                                 : [[T.split, vpnP], [T.toTlb, tlbP], [T.toPt, ptP]];
                avmChip(avmTrack(tt, vpts), 'VPN ' + pv, P.teal, fsS);
            }
            if (!isHit) {
                var pStart = isFault ? T.ptUp : T.ptRes;
                if (avmIn(tt, pStart, T.up)) avmChip(avmTrack(tt, [[pStart, ptP], [T.up, insP]]), 'PFN ' + fS, P.teal, fsS);
            }
            if (avmIn(tt, T.paA, T.paB)) avmChip(avmTrack(tt, [[T.paA, srcP], [T.paB, fP]]), 'PA ' + s.phys, resCol, fsS);
            if (isFault && avmIn(tt, T.ptRes, T.disk)) avmChip(avmTrack(tt, [[T.ptRes, diskP], [T.disk, fP]]), 'PAGE', P.red, fsS);
        }

        var bx = L.badge;
        var shown = !!s && tt >= T.decide;
        if (!st) {
            rr(bx.x, bx.y, bx.w, bx.h, 8, shown ? resCol + '22' : P.surf, shown ? resCol + 'ff' : P.border, shown ? 2 : 1);
            if (!s) {
                tx('TLB 주소 변환 경로', bx.x + 12, bx.y + 20, fsM, P.sub + 'ff', 'left', true);
                tx('TLB 적중 · TLB → RAM', bx.x + 12, bx.y + 52, fsS, P.green + 'ff', 'left', false);
                tx('TLB 미스 · TLB → PT → RAM', bx.x + 12, bx.y + 76, fsS, P.orange + 'ff', 'left', false);
                tx('페이지 폴트 · PT → DISK → RAM', bx.x + 12, bx.y + 100, fsS, P.red + 'ff', 'left', false);
            } else if (shown) {
                tx(s.badge, bx.x + 12, bx.y + 22, fsM, resCol + 'ff', 'left', true);
                var dl = lines(AVM_LONG[s.result], bx.w - 24, fsS);
                for (i = 0; i < dl.length; i++) tx(dl[i], bx.x + 12, bx.y + 48 + i * 18, fsS, P.sub + 'ff', 'left', false);
            }
        } else if (shown) {
            tx(s.badge + '  ' + AVM_SHORT[s.result], bx.x + bx.w / 2, bx.y + bx.h / 2, fsS, resCol + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('virt-mem__speed-btn--active'); });
        btn.classList.add('virt-mem__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('virt-mem__mode-btn--active', d.key === m); });
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