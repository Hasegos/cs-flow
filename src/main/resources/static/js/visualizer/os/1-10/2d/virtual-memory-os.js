/**
 * 가상 메모리 — 페이지 교체 알고리즘 시각화
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
    var root    = el('div', 'vmos-viz');
    var toolbar = el('div', 'vmos-viz__toolbar');
    var tbLeft  = el('div', 'vmos-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'vmos-viz__title', 'Page Replacement'));

    var modeWrap = el('div', 'vmos-viz__mode');
    var modeDefs = [
        { key: 'fifo', label: 'FIFO' },
        { key: 'lru', label: 'LRU' },
        { key: 'optimal', label: 'Optimal' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'vmos-viz__mode-btn' + (i === 0 ? ' vmos-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'vmos-viz__speed');
    speedWrap.appendChild(el('span', 'vmos-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'vmos-viz__speed-btn' + (i === 0 ? ' vmos-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'vmos-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'vmos-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'vmos-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'vmos-viz__controls');
    var btnPlay  = el('button', 'vmos-viz__btn vmos-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'vmos-viz__btn', '▶| STEP');
    var btnReset = el('button', 'vmos-viz__btn', '↺ RESET');
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
    var mode    = 'fifo';
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

    /* ===================== 상수 ===================== */
    const REF   = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
    const N_FRAMES = 3;

    const PAGE_COLS = [P.teal, P.purple, P.orange, P.green, P.yellow, P.red, '#e879f9', '#38bdf8'];
    function pageCol(pg) {
        return PAGE_COLS[pg % PAGE_COLS.length];
    }

    /* ===================== 알고리즘 계산 ===================== */
    function computeFIFO(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);
        let pointer = 0;

        refs.forEach(function (pg, i) {
            const hit    = frames.indexOf(pg) !== -1;
            const victim = hit ? -1 : frames[pointer];
            if (!hit) {
                frames[pointer] = pg;
                pointer = (pointer + 1) % n;
            }
            results.push({
                page:   pg,
                frames: frames.slice(),
                hit:    hit,
                victim: victim,
                victimSlot: hit ? -1 : (pointer - 1 + n) % n,
            });
        });
        return results;
    }

    function computeLRU(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);
        let lastUsed = new Array(n).fill(-1);

        refs.forEach(function (pg, i) {
            const slot = frames.indexOf(pg);
            const hit  = slot !== -1;
            let victim = -1, victimSlot = -1;

            if (hit) {
                lastUsed[slot] = i;
            } else {
                const emptySlot = frames.indexOf(-1);
                if (emptySlot !== -1) {
                    victimSlot = emptySlot;
                } else {
                    victimSlot = lastUsed.indexOf(Math.min.apply(null, lastUsed));
                }
                victim = frames[victimSlot];
                frames[victimSlot]   = pg;
                lastUsed[victimSlot] = i;
            }

            results.push({
                page:   pg,
                frames: frames.slice(),
                lastUsed: lastUsed.slice(),
                hit:    hit,
                victim: victim,
                victimSlot,
            });
        });
        return results;
    }

    function computeOptimal(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);

        refs.forEach(function (pg, i) {
            const slot = frames.indexOf(pg);
            const hit  = slot !== -1;
            let victim = -1, victimSlot = -1;

            if (hit) {
            } else {
                const emptySlot = frames.indexOf(-1);
                if (emptySlot !== -1) {
                    victimSlot = emptySlot;
                } else {
                    let farthest = -1;
                    frames.forEach(function (fp, fi) {
                        const nextUse = refs.slice(i + 1).indexOf(fp);
                        const dist    = nextUse === -1 ? Infinity : nextUse;
                        if (dist > farthest) { farthest = dist; victimSlot = fi; }
                    });
                }
                victim = frames[victimSlot];
                frames[victimSlot] = pg;
            }

            results.push({
                page:   pg,
                frames: frames.slice(),
                hit:    hit,
                victim: victim,
                victimSlot,
            });
        });
        return results;
    }

    const ALGOS = [
        { name: 'FIFO',    fn: computeFIFO,    desc: 'First-In, First-Out — 가장 먼저 들어온 페이지 교체' },
        { name: 'LRU',     fn: computeLRU,     desc: 'Least Recently Used — 가장 오래 미사용 페이지 교체' },
        { name: 'Optimal', fn: computeOptimal, desc: 'Optimal — 앞으로 가장 늦게 사용될 페이지 교체 (이론적 최적)' },
    ];

    /* ===================== 상태 ===================== */
    var pgrCache = {};
    var pgrDescCache = {};
    var pgrIdle = { idx: -1, page: -1, frames: new Array(N_FRAMES).fill(-1), hit: false, victim: -1, victimSlot: -1 };

    function pgrIdx() {
        return mode === 'lru' ? 1 : (mode === 'optimal' ? 2 : 0);
    }
    function pgrTail(k) {
        return ALGOS[k].desc.split(' — ')[1] || ALGOS[k].desc;
    }
    function pgrLog(r, i, algo) {
        if (r.hit) {
            return 'Step ' + (i + 1) + ' — 페이지 ' + r.page + ' 참조: HIT ✓ (프레임에 이미 있음). ' + algo + ': 교체 불필요.';
        }
        var victimStr = r.victim >= 0 ? '페이지 ' + r.victim + ' → 페이지 ' + r.page + '로 교체.' : '빈 프레임에 페이지 ' + r.page + ' 적재.';
        var reason = '';
        if (algo === 'FIFO') reason = '가장 먼저 들어온 페이지를 교체합니다.';
        else if (algo === 'LRU') reason = '가장 오랫동안 사용되지 않은 페이지를 교체합니다.';
        else reason = '앞으로 가장 늦게(또는 영원히) 사용될 페이지를 교체합니다.';
        return 'Step ' + (i + 1) + ' — 페이지 ' + r.page + ' 참조: PAGE FAULT ⚠  ' + victimStr + ' ' + reason;
    }
    function pgrSteps(k) {
        if (pgrCache[k]) return pgrCache[k];
        var algo = ALGOS[k];
        pgrCache[k] = algo.fn(REF, N_FRAMES).map(function (r, i) {
            return {
                idx: i, page: r.page, frames: r.frames, hit: r.hit,
                victim: r.victim, victimSlot: r.victimSlot,
                lastUsed: r.lastUsed || null,
                log: pgrLog(r, i, algo.name)
            };
        });
        return pgrCache[k];
    }
    function pgrFaults(k) {
        return pgrSteps(k).filter(function (st) { return !st.hit; }).length;
    }
    function currentSteps() {
        return pgrSteps(pgrIdx());
    }
    function defaultLog() {
        var k = pgrIdx();
        return '▶ PLAY를 눌러 페이지 교체 과정을 확인하세요. [ ' + ALGOS[k].name + ' ] ' + ALGOS[k].desc;
    }

    /* ===================== 레이아웃 ===================== */
    function pgrDescLines(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (pgrDescCache[key]) return pgrDescCache[key];
        var fD = mob ? 11 : 12.5;
        var n = 1;
        ALGOS.forEach(function (a, k) {
            n = Math.max(n, lines(pgrTail(k), w - 8, fD).length);
        });
        pgrDescCache[key] = n;
        return n;
    }
    function layout(w, mob) {
        var gap = mob ? 10 : 20;
        var fw  = Math.floor((w - gap * 2) / 3);
        if (!mob) fw = Math.min(150, fw);
        var fD  = mob ? 11 : 12.5;
        var tlY = 20 + pgrDescLines(w, mob) * (fD + 5) + 12;
        var tlH = mob ? 26 : 34;
        var fY  = tlY + tlH + (mob ? 44 : 48);
        var fh  = mob ? 66 : 96;
        var hY  = fY + fh + 28;
        var hH  = mob ? 22 : 28;
        var cY  = hY + hH + 14;
        var cH  = mob ? 44 : 50;
        var sY  = cY + cH + 12;
        var sH  = 84;
        return {
            fS: mob ? 11 : 12, fM: mob ? 13 : 15, fL: mob ? 20 : 26, fD: fD,
            gap: gap, fw: fw, fx0: Math.round((w - (fw * 3 + gap * 2)) / 2),
            cw: w / REF.length, tlY: tlY, tlH: tlH, fY: fY, fh: fh,
            chW: mob ? 30 : 40, chH: mob ? 22 : 28,
            hY: hY, hH: hH, cY: cY, cH: cH, sY: sY, sH: sH,
            total: sY + sH + 4
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }

    /* ===================== 장면 계산 ===================== */
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function pgrTally(arr, s, fresh, e) {
        var n = Math.max(0, fresh && e < 0.8 ? s.idx : s.idx + 1);
        var hits = 0;
        for (var q = 0; q < n; q++) { if (arr[q].hit) hits++; }
        return { hits: hits, faults: n - hits, rate: n > 0 ? Math.round(hits / n * 100) : 0 };
    }
    function pgrHint(k, s, f) {
        if (s.frames[f] < 0) return null;
        if (k === 1 && s.lastUsed) return 't=' + s.lastUsed[f];
        if (k === 2 && !s.hit) {
            var nu = REF.slice(s.idx + 1).indexOf(s.frames[f]);
            return nu === -1 ? '∞ 안씀' : 'next:' + (s.idx + 1 + nu);
        }
        return null;
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var k = pgrIdx();
        var arr = currentSteps();
        var s = step || pgrIdle;
        var p = prev || pgrIdle;
        var fresh = s !== p;
        var ci = s.idx;
        var cw = L.cw;
        var tlY = top + L.tlY;
        var fY = top + L.fY;
        var fw = L.fw;
        var fh = L.fh;
        var hs = s.hit ? s.frames.indexOf(s.page) : -1;
        var vs = s.hit ? -1 : s.victimSlot;

        tx(ALGOS[k].name + '  |  참조열 ' + REF.length + '개  프레임 ' + N_FRAMES + '개', x0 + w / 2, top + 8, L.fS, P.sub, 'center', false);
        lines(pgrTail(k), w - 8, L.fD).forEach(function (txt, j) {
            tx(txt, x0 + w / 2, top + 20 + j * (L.fD + 5) + (L.fD + 5) / 2, L.fD, P.sub, 'center', false);
        });

        for (var r = 0; r < REF.length; r++) {
            var col = pageCol(REF[r]);
            var cx0 = x0 + r * cw;
            var isCur = r === ci;
            var isPast = r < ci;
            rr(cx0 + 2, tlY, cw - 4, L.tlH, 4,
               isCur ? col + '30' : (isPast ? col + '18' : P.surf),
               isCur ? col : (isPast ? col + '66' : P.border),
               isCur ? 2.5 : 1);
            tx(String(REF[r]), cx0 + cw / 2, tlY + L.tlH / 2,
               isCur ? L.fM : L.fS, isCur ? col : (isPast ? col + 'cc' : P.sub), 'center', true);
        }
        if (fresh && ci >= 0) {
            ctx.globalAlpha = Math.sin(Math.PI * seg(e, 0, 0.35));
            rr(x0 + ci * cw, tlY - 3, cw, L.tlH + 6, 6, 'none', pageCol(s.page) + 'ff', 2);
            ctx.globalAlpha = 1;
        }
        if (ci >= 0) {
            var triX = x0 + (ci + 0.5) * cw;
            var triY = tlY + L.tlH + 3;
            ctx.beginPath();
            ctx.moveTo(triX - 5, triY);
            ctx.lineTo(triX + 5, triY);
            ctx.lineTo(triX, triY + 6);
            ctx.closePath();
            ctx.fillStyle = pageCol(s.page);
            ctx.fill();
        }

        for (var f = 0; f < N_FRAMES; f++) {
            var fx = x0 + L.fx0 + f * (fw + L.gap);
            var fcx = fx + fw / 2;
            var newPg = s.frames[f];
            var oldPg = p.frames[f];
            var evict = f === vs && s.victim >= 0;
            var isHit = f === hs;
            var moving = fresh && f === vs;
            var cA = 1, oldA = 0, dy = 0;
            if (moving) {
                cA = seg(e, 0.8, 0.9);
                if (oldPg >= 0) {
                    oldA = 1 - seg(e, 0.35, 0.6);
                    dy = ez(seg(e, 0.35, 0.6)) * fh * 0.4;
                }
            }
            var fillPg = moving && e < 0.8 ? oldPg : newPg;
            rr(fx, fY, fw, fh, 8,
               fillPg >= 0 ? pageCol(fillPg) + '1a' : P.surf,
               fillPg >= 0 ? pageCol(fillPg) : P.border, 1.5);
            if (evict || isHit) {
                var gCol = evict ? P.red : P.green;
                ctx.globalAlpha = fresh ? seg(e, evict ? 0.05 : 0.5, evict ? 0.25 : 0.75) : 1;
                rr(fx, fY, fw, fh, 8, 'none', gCol, 3);
                ctx.globalAlpha = 1;
                var pA = fresh ? Math.sin(Math.PI * seg(e, evict ? 0 : 0.3, evict ? 0.35 : 0.7)) : 0;
                if (pA > 0) {
                    var pe = 6 * pA;
                    ctx.globalAlpha = pA;
                    rr(fx - pe, fY - pe, fw + pe * 2, fh + pe * 2, 8 + pe, 'none', gCol, 2);
                    ctx.globalAlpha = 1;
                }
            }
            tx('F' + f, fcx, fY + fh * 0.17, L.fS - 1, P.sub, 'center', false);
            ln(fx + 10, fY + fh * 0.3, fx + fw - 10, fY + fh * 0.3, P.border, 1);
            if (oldA > 0 && oldPg >= 0) {
                ctx.globalAlpha = oldA;
                tx(String(oldPg), fcx, fY + fh * 0.62 + dy, L.fL, pageCol(oldPg), 'center', true);
                ctx.globalAlpha = 1;
            }
            if (newPg >= 0) {
                if (cA > 0) {
                    ctx.globalAlpha = cA;
                    tx(String(newPg), fcx, fY + fh * 0.62, L.fL, pageCol(newPg), 'center', true);
                    ctx.globalAlpha = 1;
                }
            } else if (!moving) {
                tx('—', fcx, fY + fh * 0.62, L.fM, P.sub, 'center', false);
            }
            if (evict || isHit) {
                var bA = fresh ? Math.max(seg(e, 0.3, 0.45) * (1 - seg(e, 0.55, 0.65)), seg(e, 0.85, 1)) : 1;
                if (bA > 0) {
                    var bCol = evict ? P.red : P.green;
                    var bW2 = mob ? 38 : 46;
                    ctx.globalAlpha = bA;
                    rr(fcx - bW2 / 2, fY - 18, bW2, 16, 4, bCol + '22', bCol, 1.4);
                    tx(evict ? '교체' : 'HIT', fcx, fY - 10, L.fS - 1, bCol, 'center', true);
                    ctx.globalAlpha = 1;
                }
            }
            var hA = fresh ? seg(e, 0.85, 1) : 1;
            var hint = hA > 0 ? pgrHint(k, s, f) : null;
            if (hint) {
                ctx.globalAlpha = hA;
                tx(hint, fcx, fY + fh + 12, L.fS, P.yellow, 'center', true);
                ctx.globalAlpha = 1;
            }
        }

        if (fresh && ci >= 0) {
            var tgt = s.hit ? hs : vs;
            if (tgt >= 0) {
                var tX = x0 + L.fx0 + tgt * (fw + L.gap) + fw / 2;
                var aX = x0 + (ci + 0.5) * cw;
                var aY = tlY + L.tlH / 2;
                var apY = fY - 30;
                var ceY = fY + fh * 0.5;
                var px = tX, py = apY;
                if (e < 0.35) {
                    var q1 = ez(seg(e, 0, 0.35));
                    px = lerp(aX, tX, q1);
                    py = lerp(aY, apY, q1);
                } else if (e >= 0.6) {
                    py = lerp(apY, ceY, ez(seg(e, 0.6, 0.85)));
                }
                var chA = seg(e, 0, 0.05) * (1 - seg(e, 0.8, 0.9));
                if (chA > 0) {
                    var pc = pageCol(s.page);
                    ctx.globalAlpha = chA;
                    rr(px - L.chW / 2, py - L.chH / 2, L.chW, L.chH, 5, pc + '44', pc, 1.6);
                    tx(String(s.page), px, py, L.fM, P.text, 'center', true);
                    ctx.globalAlpha = 1;
                }
            }
        }

        var hy = top + L.hY;
        for (var h = 0; h < REF.length; h++) {
            var hx = x0 + h * cw + 2;
            var hw = cw - 4;
            rr(hx, hy, hw, L.hH, 3, P.surf, P.border, 1);
            if (h <= ci) {
                var rc = arr[h].hit ? P.green : P.red;
                var g = h === ci && fresh ? ez(seg(e, 0.6, 0.95)) : 1;
                var fillH = (L.hH - 4) * g;
                if (fillH > 0) {
                    rr(hx + 1, hy + L.hH - 2 - fillH, hw - 2, fillH, 2, rc + (h < ci ? '30' : '55'), rc, 1);
                    if (cw > 14) {
                        ctx.globalAlpha = g;
                        tx(arr[h].hit ? 'H' : 'F', hx + hw / 2, hy + L.hH / 2, L.fS, rc, 'center', true);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        var tl = pgrTally(arr, s, fresh, e);
        var bW = mob ? w : Math.min(w, 360);
        var bX = x0 + (w - bW) / 2;
        var cy0 = top + L.cY;
        var third = bW / 3;
        var bump = fresh && ci >= 0 && e >= 0.8 ? Math.sin(Math.PI * seg(e, 0.8, 1)) * 3 : 0;
        rr(bX, cy0, bW, L.cH, 6, P.surf, P.border, 1);
        tx('HIT', bX + third * 0.5, cy0 + L.cH * 0.3, L.fS - 1, P.green, 'center', false);
        tx(String(tl.hits), bX + third * 0.5, cy0 + L.cH * 0.68, L.fM + 2 + (s.hit ? bump : 0), P.green, 'center', true);
        tx('FAULT', bX + third * 1.5, cy0 + L.cH * 0.3, L.fS - 1, P.red, 'center', false);
        tx(String(tl.faults), bX + third * 1.5, cy0 + L.cH * 0.68, L.fM + 2 + (s.hit ? 0 : bump), P.red, 'center', true);
        tx('HIT RATE', bX + third * 2.5, cy0 + L.cH * 0.3, L.fS - 1, P.purple, 'center', false);
        tx(tl.rate + '%', bX + third * 2.5, cy0 + L.cH * 0.68, L.fM + 2, P.purple, 'center', true);
        [1, 2].forEach(function (d) {
            ln(bX + third * d, cy0 + 6, bX + third * d, cy0 + L.cH - 6, P.border, 1);
        });

        if (ci === REF.length - 1) {
            var sa = fresh ? seg(e, 0.85, 1) : 1;
            if (sa > 0) {
                var sy = top + L.sY;
                var names = ['FIFO', 'LRU', 'OPT'];
                var cols = [P.orange, P.purple, P.green];
                ctx.globalAlpha = sa;
                rr(bX, sy, bW, L.sH, 6, P.surf2, P.border, 1);
                tx('알고리즘 비교 (폴트 횟수)', bX + bW / 2, sy + 13, L.fS - 1, P.sub, 'center', false);
                for (var a = 0; a < 3; a++) {
                    var mine = a === k;
                    var acx = bX + third * (a + 0.5);
                    var ac = mine ? cols[a] : P.sub;
                    tx(names[a], acx, sy + 33, L.fS - 1, ac, 'center', mine);
                    tx(String(pgrFaults(a)), acx, sy + 52, L.fM, ac, 'center', mine);
                    if (a === 2) tx('(최적)', acx, sy + 71, L.fS - 1, P.green + '88', 'center', false);
                }
                [1, 2].forEach(function (d) {
                    ln(bX + third * d, sy + 8, bX + third * d, sy + L.sH - 8, P.border, 1);
                });
                ctx.globalAlpha = 1;
            }
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('vmos-viz__speed-btn--active'); });
        btn.classList.add('vmos-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('vmos-viz__mode-btn--active', d.key === m); });
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