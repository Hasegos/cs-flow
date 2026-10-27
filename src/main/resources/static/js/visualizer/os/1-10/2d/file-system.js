/**
 * 파일 시스템 시각화
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
    var root    = el('div', 'fs-viz');
    var toolbar = el('div', 'fs-viz__toolbar');
    var tbLeft  = el('div', 'fs-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'fs-viz__title', 'File System'));

    var modeWrap = el('div', 'fs-viz__mode');
    var modeDefs = [
        { key: 'inode', label: 'inode' },
        { key: 'fat', label: 'FAT' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'fs-viz__mode-btn' + (i === 0 ? ' fs-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'fs-viz__speed');
    speedWrap.appendChild(el('span', 'fs-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'fs-viz__speed-btn' + (i === 0 ? ' fs-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'fs-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'fs-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'fs-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'fs-viz__controls');
    var btnPlay  = el('button', 'fs-viz__btn fs-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'fs-viz__btn', '▶| STEP');
    var btnReset = el('button', 'fs-viz__btn', '↺ RESET');
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
    var mode    = 'inode';
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

    /* ===================== 시나리오 ===================== */
    const INODE_STEPS = [
        {
            log: 'Step 1 — open("/home/user/hello.txt") 호출. OS는 루트 디렉토리(/)의 inode(번호 2)부터 탐색을 시작합니다. 모든 경로 탐색은 항상 루트 inode에서 시작합니다.',
            hl: ['root'],
        },
        {
            log: 'Step 2 — 루트 inode가 가리키는 데이터 블록에서 "home" 항목을 찾습니다. home 디렉토리의 inode 번호(7)를 확인하고 inode 테이블에서 inode 7을 읽습니다.',
            hl: ['root', 'home'],
        },
        {
            log: 'Step 3 — inode 7(home)의 데이터 블록에서 "user" 항목을 찾습니다. user 디렉토리의 inode 번호(23)를 확인합니다.',
            hl: ['root', 'home', 'user'],
        },
        {
            log: 'Step 4 — inode 23(user)의 데이터 블록에서 "hello.txt" 항목을 찾습니다. hello.txt의 inode 번호(91)를 획득합니다. inode 91에 파일 크기·권한·블록 포인터가 저장됩니다.',
            hl: ['root', 'home', 'user', 'inode'],
        },
        {
            log: 'Step 5 — inode 91의 직접 블록 포인터가 데이터 블록(#142, #143)을 가리킵니다. OS가 해당 블록을 읽어 파일 내용을 반환합니다. 경로 탐색 완료!',
            hl: ['root', 'home', 'user', 'inode', 'data'],
        },
    ];

    const FAT_TABLE = [
        { n:0,  val:'Reserved' }, { n:1,  val:'Reserved' },
        { n:2,  val:'FREE'     }, { n:3,  val:'7',   file:'hello' },
        { n:4,  val:'FREE'     }, { n:5,  val:'9',   file:'world' },
        { n:6,  val:'FREE'     }, { n:7,  val:'12',  file:'hello' },
        { n:8,  val:'FREE'     }, { n:9,  val:'EOF', file:'world' },
        { n:10, val:'FREE'     }, { n:11, val:'FREE' },
        { n:12, val:'EOF', file:'hello' }, { n:13, val:'FREE' },
        { n:14, val:'FREE'     }, { n:15, val:'FREE' },
    ];

    const FAT_STEPS = [
        {
            log:    'Step 1 — FAT 초기 상태. 클러스터 0·1 예약(Reserved), 나머지 FREE 또는 파일 체인. 디렉토리 엔트리에서 hello.txt의 시작 클러스터(3)를 얻습니다.',
            active: [],
        },
        {
            log:    'Step 2 — 디렉토리 엔트리에서 hello.txt 시작 클러스터 = 3. FAT[3]을 읽습니다.',
            active: [3],
        },
        {
            log:    'Step 3 — FAT[3] = 7. 다음 클러스터는 7. 클러스터 3 데이터 읽고 FAT[7]로 이동합니다.',
            active: [3, 7],
        },
        {
            log:    'Step 4 — FAT[7] = 12. 다음 클러스터는 12. 클러스터 7 데이터 읽고 FAT[12]로 이동합니다.',
            active: [3, 7, 12],
        },
        {
            log:    'Step 5 — FAT[12] = EOF. 마지막 클러스터. 체인 3→7→12 총 3개 클러스터 읽기 완료. FAT는 연결 리스트 방식이라 랜덤 접근 시 처음부터 체인을 따라가야 합니다.',
            active: [3, 7, 12],
            done:   true,
        },
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'inode' ? INODE_STEPS : FAT_STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 파일 시스템 동작을 확인하세요.';
    }
    function ez(q) {
        var v = clamp01(q);
        return v * v * (3 - 2 * v);
    }
    function fsxW(str, fs) {
        var n = 0;
        var i;
        for (i = 0; i < str.length; i++) n += str.charCodeAt(i) < 128 ? fs * 0.62 : fs;
        return n;
    }

    /* ===================== 장면 상수 ===================== */
    var FSX_KEYS = ['root', 'home', 'user', 'inode', 'data'];
    var FSX_CARDS = [
        { col: 'teal',   title: '/ (root)',    id: 'inode 2',  ent: 'home/',     to: 'inode 7' },
        { col: 'purple', title: 'home/',       id: 'inode 7',  ent: 'user/',     to: 'inode 23' },
        { col: 'orange', title: 'user/',       id: 'inode 23', ent: 'hello.txt', to: 'inode 91' },
        { col: 'purple', title: 'inode #91',   id: '',         ent: '',          to: '' },
        { col: 'green',  title: 'Data Blocks', id: '',         ent: '',          to: '' }
    ];
    var FSX_FIELDS = [['링크 수', '1'], ['크기', '2.3 KB'], ['권한', 'rw-r--r--'], ['블록 →', '#142, #143']];
    var FSX_BLOCKS = ['#142', '#143'];
    var FSX_PATH = [
        { lbl: '/',         key: 'root' },
        { lbl: 'home',      key: 'home' },
        { lbl: 'user',      key: 'user' },
        { lbl: 'hello.txt', key: 'inode' }
    ];

    /* ===================== 레이아웃 ===================== */
    function fsxMetrics(mob) {
        var fs = mob ? 11.5 : 13;
        return {
            fs: fs,
            fsS: mob ? 11 : 11.5,
            hr: fs + 10,
            er: fs + 10,
            ind: mob ? 12 : 30,
            pathH: mob ? 30 : 34,
            gap: 16
        };
    }
    function layout(w, mob) {
        var M = fsxMetrics(mob);
        var cellH;
        var gridTop;
        var capTop;
        var legTop;
        var dirH;
        var inodeH;
        var blocksH;
        var dataH;
        var hs;
        var tops = [];
        var y;
        if (mode !== 'inode') {
            cellH = mob ? 34 : 40;
            gridTop = M.hr + 6;
            capTop = gridTop + 4 * cellH + 12;
            legTop = capTop + M.fs + 14;
            return { M: M, cellH: cellH, gridTop: gridTop, capTop: capTop, legTop: legTop, total: legTop + M.fsS + 8 };
        }
        dirH = M.hr + M.er + 12;
        inodeH = M.hr + 4 * (M.fsS + 8) + 10;
        blocksH = mob ? 44 : 50;
        dataH = M.hr + blocksH + M.fsS + 14;
        hs = [dirH, dirH, dirH, inodeH, dataH];
        y = M.pathH + 14;
        hs.forEach(function (h) {
            tops.push(y);
            y += h + M.gap;
        });
        return { M: M, blocksH: blocksH, tops: tops, hs: hs, total: y - M.gap + 8 };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 경로 바 ===================== */
    function fsxPath(x0, top, M, s, pv, fresh, t) {
        var x = x0;
        FSX_PATH.forEach(function (p) {
            var wd = fsxW(p.lbl, M.fsS) + 16;
            var on = s.hl.indexOf(p.key) >= 0;
            var was = pv.hl.indexOf(p.key) >= 0;
            var lit = fresh && on && !was ? ez(seg(t, 0.3, 0.6)) : (on ? 1 : 0);
            rr(x, top, wd, M.pathH, 5, P.surf2, P.border, 1.2);
            if (lit > 0) {
                ctx.globalAlpha = lit;
                rr(x, top, wd, M.pathH, 5, P.teal + '33', P.teal + 'ff', 1.8);
                ctx.globalAlpha = 1;
            }
            tx(p.lbl, x + wd / 2, top + M.pathH / 2, M.fsS, (on ? P.text : P.sub) + 'ff', 'center', on);
            x += wd + 8;
        });
    }

    /* ===================== 카드와 연결선 ===================== */
    function fsxBox(x, y, w, h, M, card, a) {
        var c = P[card.col];
        ctx.globalAlpha = a;
        rr(x, y, w, h, 8, c + '18', c + 'ff', 1.6);
        ln(x + 8, y + M.hr, x + w - 8, y + M.hr, c + '55', 1);
        tx(card.title, x + 10, y + M.hr / 2, M.fs, c + 'ff', 'left', true);
        if (card.id) tx(card.id, x + w - 10, y + M.hr / 2, M.fsS, c + 'ff', 'right', false);
        ctx.globalAlpha = 1;
    }
    function fsxDirBody(x, y, w, M, card, a, hiA, scanY, scanA) {
        var c = P[card.col];
        var ye = y + M.hr + 6;
        if (hiA > 0) {
            ctx.globalAlpha = a * hiA;
            rr(x + 8, ye, w - 16, M.er, 5, c + '33', c + 'ff', 1.4);
        }
        ctx.globalAlpha = a;
        tx(card.ent, x + 18, ye + M.er / 2, M.fs, (hiA > 0.5 ? P.text : P.sub) + 'ff', 'left', hiA > 0.5);
        tx('→ ' + card.to, x + w - 18, ye + M.er / 2, M.fsS, c + 'ff', 'right', false);
        if (scanA > 0) {
            ctx.globalAlpha = scanA;
            ln(x + 8, scanY, x + w - 8, scanY, P.yellow + 'ff', 2);
        }
        ctx.globalAlpha = 1;
    }
    function fsxHead(x, y, dx, dy, col) {
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / d;
        var uy = dy / d;
        var bx = x - ux * 9;
        var by = y - uy * 9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(bx - uy * 4.5, by + ux * 4.5);
        ctx.lineTo(bx + uy * 4.5, by - ux * 4.5);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }
    function fsxLink(x0, top, L, i, f) {
        var M = L.M;
        var ax = x0 + i * M.ind + 18;
        var ay = top + L.tops[i] + L.hs[i];
        var bx = x0 + (i + 1) * M.ind + 18;
        var by = top + L.tops[i + 1];
        var col = i === 3 ? P.purple : P.teal;
        ln(ax, ay, lerp(ax, bx, f), lerp(ay, by, f), col + 'ff', 2.2);
        if (f >= 0.999) fsxHead(bx, by, bx - ax, by - ay, col + 'ff');
    }

    /* ===================== inode 장면 ===================== */
    function fsxDrawInode(x0, top, w, L, s, pv, fresh, t) {
        var M = L.M;
        var cur = s.hl[s.hl.length - 1];
        var ci = FSX_KEYS.indexOf(cur);
        var i;
        var j;
        fsxPath(x0, top, M, s, pv, fresh, t);
        for (i = 0; i < 4; i++) {
            var f = fresh && i === ci - 1 ? ez(seg(t, 0, 0.4)) : (i < ci ? 1 : 0);
            if (f > 0) fsxLink(x0, top, L, i, f);
        }
        for (i = 0; i < 5; i++) {
            var card = FSX_CARDS[i];
            var cx = x0 + i * M.ind;
            var cw = w - i * M.ind;
            var cy = top + L.tops[i];
            var ch = L.hs[i];
            var enter = fresh && i === ci;
            var a = i > ci ? 0.35 : (enter ? lerp(0.35, 1, ez(seg(t, 0.3, 0.6))) : 1);
            if (i < 3) {
                var sc = fresh && i === ci;
                var sp = sc ? seg(t, 0.45, 0.85) : 0;
                var hiA = i < ci ? (fresh && i === ci - 1 ? ez(seg(t, 0, 0.3)) : 1) : 0;
                fsxBox(cx, cy, cw, ch, M, card, a);
                fsxDirBody(cx, cy, cw, M, card, a, hiA, cy + M.hr + 2 + sp * (ch - M.hr - 5), sc ? Math.sin(Math.PI * sp) * a : 0);
            } else if (i === 3) {
                fsxBox(cx, cy, cw, ch, M, card, a);
                if (ci >= 3) {
                    var rh = M.fsS + 8;
                    var blkA = ci >= 4 ? (fresh && ci === 4 ? ez(seg(t, 0.4, 0.9)) : 1) : 0;
                    for (j = 0; j < 4; j++) {
                        var fa = enter ? ez(seg(t, 0.5 + 0.1 * j, 0.7 + 0.1 * j)) : 1;
                        var ry = cy + M.hr + 2 + j * rh;
                        var blk = j === 3;
                        var hot = blk && blkA > 0.5;
                        if (blk && blkA > 0) {
                            ctx.globalAlpha = fa * blkA;
                            rr(cx + 8, ry, cw - 16, rh - 2, 4, P.green + '22', P.green + 'ff', 1.2);
                        }
                        ctx.globalAlpha = fa;
                        tx(FSX_FIELDS[j][0], cx + 14, ry + rh / 2, M.fsS, P.sub + 'ff', 'left', false);
                        tx(FSX_FIELDS[j][1], cx + cw - 14, ry + rh / 2, M.fsS, (hot ? P.green : P.text) + 'ff', 'right', hot);
                        ctx.globalAlpha = 1;
                    }
                }
            } else {
                fsxBox(cx, cy, cw, ch, M, card, a);
                if (ci >= 4) {
                    var bW = Math.floor((cw - 34) / 2);
                    var bH = L.blocksH - 4;
                    for (j = 0; j < 2; j++) {
                        var ba = fresh && ci === 4 ? ez(seg(t, 0.5 + 0.15 * j, 0.85 + 0.15 * j)) : 1;
                        var bx = cx + 12 + j * (bW + 10);
                        var by = cy + M.hr + 4;
                        ctx.globalAlpha = ba;
                        rr(bx, by, bW, bH, 4, P.green + '25', P.green + 'ff', 1.4);
                        tx(FSX_BLOCKS[j], bx + bW / 2, by + bH * 0.36, M.fsS, P.green + 'ff', 'center', true);
                        tx('data...', bx + bW / 2, by + bH * 0.74, M.fsS - 1, P.sub + 'ff', 'center', false);
                    }
                    ctx.globalAlpha = fresh && ci === 4 ? ez(seg(t, 0.8, 1)) : 1;
                    tx('✓ 파일 읽기 완료', cx + cw / 2, cy + M.hr + L.blocksH + (M.fsS + 14) / 2, M.fsS, P.green + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    /* ===================== FAT 장면 ===================== */
    function fsxCX(gx, cw, n) {
        return gx + (n % 4) * cw + cw / 2;
    }
    function fsxCY(gy, ch, n) {
        return gy + Math.floor(n / 4) * ch + ch / 2;
    }
    function fsxArc(ax, ay, bx, by, f, col) {
        var dx = bx - ax;
        var dy = by - ay;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / d;
        var ny = dx / d;
        if (nx < 0) {
            nx = -nx;
            ny = -ny;
        }
        var bu = Math.min(24, d * 0.35);
        var qx = (ax + bx) / 2 + nx * bu;
        var qy = (ay + by) / 2 + ny * bu;
        var q;
        function pxAt(u) { return (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * qx + u * u * bx; }
        function pyAt(u) { return (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * qy + u * u * by; }
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        for (q = 1; q <= 16; q++) ctx.lineTo(pxAt(f * q / 16), pyAt(f * q / 16));
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (f >= 0.999) fsxHead(bx, by, bx - pxAt(0.9), by - pyAt(0.9), col);
    }
    function fsxDrawFat(x0, top, w, L, s, pv, fresh, t) {
        var M = L.M;
        var cw = Math.floor(w / 4);
        var ch = L.cellH;
        var gx = x0 + (w - cw * 4) / 2;
        var gy = top + L.gridTop;
        var act = s.active || [];
        var pAct = pv.active || [];
        var done = !!s.done;
        var g = done ? (fresh && !pv.done ? ez(seg(t, 0.2, 0.7)) : 1) : 0;
        var n;
        var k;
        tx('FAT · hello.txt 탐색', x0 + w / 2, top + M.hr / 2, M.fsS, P.sub + 'ff', 'center', true);
        for (n = 0; n < 16; n++) {
            var e = FAT_TABLE[n];
            var x = gx + (n % 4) * cw;
            var y = gy + Math.floor(n / 4) * ch;
            var isAct = act.indexOf(n) >= 0;
            var a = isAct ? (fresh && pAct.indexOf(n) < 0 ? ez(seg(t, 0.5, 0.9)) : 1) : 0;
            var isH = e.file === 'hello';
            var isW = e.file === 'world';
            var fillC = isH ? P.teal + '10' : (isW ? P.purple + '10' : P.surf);
            var strokeC = isH ? P.teal + '55' : (isW ? P.purple + '55' : P.border);
            var valCol = isAct ? (done ? P.green : P.teal) : (e.val === 'EOF' ? P.green : (e.val === 'FREE' || e.val === 'Reserved' ? P.muted : P.text));
            rr(x + 3, y + 3, cw - 6, ch - 6, 5, fillC, strokeC, 1);
            if (a * (1 - g) > 0) {
                ctx.globalAlpha = a * (1 - g);
                rr(x + 3, y + 3, cw - 6, ch - 6, 5, P.teal + '33', P.teal + 'ff', 2);
            }
            if (a * g > 0) {
                ctx.globalAlpha = a * g;
                rr(x + 3, y + 3, cw - 6, ch - 6, 5, P.green + '33', P.green + 'ff', 2);
            }
            ctx.globalAlpha = 1;
            if (isH || isW) circ(x + cw - 10, y + 10, 3.5, (isH ? P.teal : P.purple) + 'aa', 'none');
            tx(String(n), x + cw / 2, y + ch * 0.3, M.fsS - 1, (isAct ? P.text : P.sub) + 'ff', 'center', false);
            tx(e.val === 'Reserved' ? 'Rsv' : e.val, x + cw / 2, y + ch * 0.68, isAct ? M.fs : M.fsS, valCol + 'ff', 'center', isAct);
        }
        var lc = done ? P.green : P.teal;
        for (k = 0; k + 1 < act.length; k++) {
            var newLink = fresh && k === act.length - 2 && act.length > pAct.length && pAct.length >= 1;
            fsxArc(fsxCX(gx, cw, act[k]), fsxCY(gy, ch, act[k]), fsxCX(gx, cw, act[k + 1]), fsxCY(gy, ch, act[k + 1]), newLink ? ez(seg(t, 0.1, 0.75)) : 1, lc + 'ff');
        }
        if (act.length) {
            var last = act[act.length - 1];
            var prevLast = pAct.length ? pAct[pAct.length - 1] : last;
            var mv = fresh && prevLast !== last ? ez(seg(t, 0.15, 0.8)) : 1;
            var px = lerp(fsxCX(gx, cw, prevLast), fsxCX(gx, cw, last), mv);
            var py = lerp(fsxCY(gy, ch, prevLast), fsxCY(gy, ch, last), mv);
            ctx.globalAlpha = fresh && pAct.length === 0 ? ez(seg(t, 0, 0.3)) : 1;
            rr(px - cw / 2 + 3, py - ch / 2 + 3, cw - 6, ch - 6, 5, 'none', P.purple + 'ff', 2.4);
            ctx.globalAlpha = 1;
        }
        var capStr = act.length === 0
            ? '디렉토리 엔트리의 시작 클러스터 ' + FAT_STEPS[1].active[0]
            : (done ? '✓ 체인 끝: ' : '체인: ') + act.join(' → ') + (done ? ' → EOF' : '');
        tx(capStr, x0 + w / 2, top + L.capTop + M.fs / 2, M.fs, (done ? P.green : P.sub) + 'ff', 'center', done);
        var legY = top + L.legTop + M.fsS / 2;
        var legs = [[P.teal, 'hello.txt'], [P.purple, 'world.txt'], [P.muted, 'FREE/Rsv']];
        legs.forEach(function (lg, i) {
            var lx = x0 + i * (w / 3);
            circ(lx + 5, legY, 4.5, lg[0] + 'ff', 'none');
            tx(lg[1], lx + 14, legY, M.fsS, P.sub + 'ff', 'left', false);
        });
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var s = step || currentSteps()[0];
        var pv = prev || s;
        var fresh = s !== pv;
        var e = fresh ? clamp01(t) : 1;
        if (mode === 'inode') fsxDrawInode(x0, top, w, L, s, pv, fresh, e);
        else fsxDrawFat(x0, top, w, L, s, pv, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('fs-viz__speed-btn--active'); });
        btn.classList.add('fs-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('fs-viz__mode-btn--active', d.key === m); });
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