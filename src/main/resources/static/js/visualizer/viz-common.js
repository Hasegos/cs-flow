/**
 * 시각화 공통 — 팔레트 / 테마 / 라이프사이클
 */

/* ===================== 시각화 공통 네임스페이스 ===================== */
 window.CsFlow = window.CsFlow || {};

 window.CsFlow.PALETTE = {
     dark: Object.freeze ({
         bg:     '#0f0f1a', surf:   '#1a1a2e', surf2:  '#222238',
         border: 'rgba(108,99,255,0.22)',
         purple: '#6c63ff', teal:   '#3ecfb2', orange: '#f7a14a',
         green:  '#4ade80', red:    '#f87171', yellow: '#fbbf24',
         text:   '#e8e8f0', sub:    '#a0a0bc', muted:  '#6b6b8a',
     }),
     light: Object.freeze ({
         bg:     '#f5f5ff', surf:   '#ffffff', surf2:  '#eeeeff',
         border: 'rgba(108,99,255,0.2)',
         purple: '#6c63ff', teal:   '#2ab89e', orange: '#d97706',
         green:  '#16a34a', red:    '#dc2626', yellow: '#ca8a04',
         text:   '#1a1a2e', sub:    '#3a3a5c', muted:  '#6b6b8a',
     }),
 };

 window.CsFlow.getP = function () {
     return document.documentElement.getAttribute('data-theme') === 'light'
         ? window.CsFlow.PALETTE.light
         : window.CsFlow.PALETTE.dark;
 };

/* ===================== 캔버스 글씨 최소 크기 ===================== */
(function () {
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    if (!desc || !desc.set) return;
    const MIN_DESKTOP = 12;
    const MIN_MOBILE  = 11;

    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
        configurable: true,
        enumerable: true,
        get: desc.get,
        set: function (value) {
            const m = /(\d+(?:\.\d+)?)px/.exec(value);
            if (m) {
                const dpr   = window.devicePixelRatio || 1;
                const scale = this.getTransform().a / dpr || 1;
                const min   = (this.canvas.clientWidth || this.canvas.width / dpr) < 600 ? MIN_MOBILE : MIN_DESKTOP;
                if (parseFloat(m[1]) * scale < min) {
                    value = value.replace(m[0], (min / scale) + 'px');
                }
            }
            desc.set.call(this, value);
        }
    });
})();

/* ===================== 라이트 모드 글씨 색 보정 ===================== */
(function () {
    const origFillText = CanvasRenderingContext2D.prototype.fillText;
    const DARKER = {
        '42,184,158': '15,118,110', '62,207,178': '15,118,110',
        '217,119,6': '180,83,9', '247,161,74': '180,83,9',
        '202,138,4': '161,98,7', '251,191,36': '161,98,7',
        '22,163,74': '21,128,61', '74,222,128': '21,128,61',
        '108,99,255': '91,82,232',
        '220,38,38': '204,32,32', '248,113,113': '204,32,32',
        '56,189,248': '3,105,161', '232,121,249': '162,28,175',
        '167,139,250': '109,40,217', '96,165,250': '29,78,216', '244,114,182': '190,24,93'
    };
    const cache = new Map();

    /**
     * 밝은 배경에서 대비가 낮은 팔레트 색을 같은 계열의 진한 색으로 바꾼다. 알파는 유지한다.
     *
     * @param style 캔버스가 돌려준 fillStyle 문자열
     * @returns 바꿀 색 문자열, 대상이 아니면 null
     */
    function darken(style) {
        if (cache.has(style)) return cache.get(style);
        let out = null;
        let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(style);
        if (m) {
            const key = parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16);
            if (DARKER[key]) out = 'rgb(' + DARKER[key] + ')';
        } else {
            m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(style);
            if (m && DARKER[m[1] + ',' + m[2] + ',' + m[3]]) out = 'rgba(' + DARKER[m[1] + ',' + m[2] + ',' + m[3]] + ', ' + m[4] + ')';
        }
        cache.set(style, out);
        return out;
    }

    CanvasRenderingContext2D.prototype.fillText = function () {
        if (document.documentElement.getAttribute('data-theme') === 'light' && typeof this.fillStyle === 'string') {
            const prev = this.fillStyle;
            const dark = darken(prev);
            if (dark) {
                this.fillStyle = dark;
                origFillText.apply(this, arguments);
                this.fillStyle = prev;
                return;
            }
        }
        origFillText.apply(this, arguments);
    };
})();

/* ===================== 캔버스 줄바꿈 ===================== */
window.CsFlow.wrapText = function (ctx, str, maxW) {
    const lines = [];
    let cur = '';
    String(str).split(' ').forEach(function (word) {
        const next = cur ? cur + ' ' + word : word;
        if (ctx.measureText(next).width <= maxW) { cur = next; return; }
        if (cur) lines.push(cur);
        cur = '';
        Array.from(word).forEach(function (ch) {
            if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ''; }
            cur += ch;
        });
    });
    if (cur) lines.push(cur);
    return lines;
};

/* ===================== 캔버스 밖으로 나간 글씨 보정 ===================== */
(function () {
    const rawFill = CanvasRenderingContext2D.prototype.fillText;
    const MARGIN  = 4;

    CanvasRenderingContext2D.prototype.fillText = function (str, x, y, maxW) {
        if (maxW !== undefined) return rawFill.apply(this, arguments);
        const T = this.getTransform();
        if (Math.abs(T.b) > 1e-6 || Math.abs(T.c) > 1e-6) return rawFill.apply(this, arguments);
        const cw = this.canvas.clientWidth;
        if (!cw) return rawFill.apply(this, arguments);

        const dpr  = window.devicePixelRatio || 1;
        const sc   = T.a / dpr || 1;
        const text = String(str);
        const w    = this.measureText(text).width * sc;
        const X    = x * sc + T.e / dpr;
        const al   = this.textAlign;
        const l    = al === 'center' ? X - w / 2 : (al === 'right' || al === 'end') ? X - w : X;
        if (l >= -1 && l + w <= cw + 1) return rawFill.apply(this, arguments);

        const place = function (ctx, s, lw, yy) {
            let ll = al === 'center' ? X - lw / 2 : (al === 'right' || al === 'end') ? X - lw : X;
            ll = Math.max(MARGIN, Math.min(ll, cw - MARGIN - lw));
            const nx = (al === 'center' ? ll + lw / 2 : (al === 'right' || al === 'end') ? ll + lw : ll);
            rawFill.call(ctx, s, (nx - T.e / dpr) / sc, yy);
        };
        if (w <= cw - MARGIN * 2) { place(this, text, w, y); return; }

        const avail = (cw - MARGIN * 2) / sc;
        const lines = window.CsFlow.wrapText(this, text, avail);
        const fpx   = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 12])[1]);
        const lh    = fpx * 1.35;
        const up    = this.textBaseline !== 'top' && this.textBaseline !== 'hanging'
            && (y * sc + T.f / dpr) > this.canvas.clientHeight / 2;
        for (let i = 0; i < lines.length; i++) {
            const yy = up ? y - (lines.length - 1 - i) * lh : y + i * lh;
            place(this, lines[i], this.measureText(lines[i]).width * sc, yy);
        }
    };
})();

/* ===================== 단계 전환 효과 ===================== */
(function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const BURST_MS = 120;
    const MOVE_MS  = 150;
    const DURATION = 650;
    const GRID_W   = 96;
    const STATES   = new WeakMap();
    const rawClear = CanvasRenderingContext2D.prototype.clearRect;
    let lastMove = 0;

    document.addEventListener('mousemove', function () { lastMove = performance.now(); }, true);

    function stateOf(canvas) {
        let st = STATES.get(canvas);
        if (!st) {
            st = { last: 0, w: 0, h: 0, seen: false, snap: null, ov: null, raf: 0 };
            STATES.set(canvas, st);
        }
        return st;
    }

    function stopOverlay(st) {
        if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
        if (st.ov) rawClear.call(st.ov.getContext('2d'), 0, 0, st.ov.width, st.ov.height);
    }

    /**
     * 이전 프레임과 새 프레임을 작은 격자로 비교해 바뀐 영역의 사각형 목록을 만든다.
     *
     * @param snap 이전 프레임을 복사해 둔 캔버스
     * @param cv   새 프레임이 그려진 캔버스
     * @returns 캔버스 픽셀 기준 사각형 배열 (바뀐 곳이 없으면 빈 배열)
     */
    function diffBoxes(snap, cv) {
        const gw = GRID_W;
        const gh = Math.max(8, Math.round(gw * cv.height / cv.width));
        const a = document.createElement('canvas');
        const b = document.createElement('canvas');
        a.width = b.width = gw;
        a.height = b.height = gh;
        const ca = a.getContext('2d', { willReadFrequently: true });
        const cb = b.getContext('2d', { willReadFrequently: true });
        ca.drawImage(snap, 0, 0, gw, gh);
        cb.drawImage(cv, 0, 0, gw, gh);
        const da = ca.getImageData(0, 0, gw, gh).data;
        const db = cb.getImageData(0, 0, gw, gh).data;
        const hot = new Uint8Array(gw * gh);
        let count = 0;
        for (let i = 0; i < gw * gh; i++) {
            const d = Math.abs(da[i * 4] - db[i * 4]) + Math.abs(da[i * 4 + 1] - db[i * 4 + 1]) + Math.abs(da[i * 4 + 2] - db[i * 4 + 2]);
            if (d > 24) { hot[i] = 1; count++; }
        }
        if (count < 1) return [];
        const cw = cv.width / gw;
        const ch = cv.height / gh;
        if (count > gw * gh * 0.55) return [{ x: 0, y: 0, w: cv.width, h: cv.height }];

        const seen = new Uint8Array(gw * gh);
        const boxes = [];
        for (let s = 0; s < gw * gh; s++) {
            if (!hot[s] || seen[s]) continue;
            let x0 = gw, y0 = gh, x1 = 0, y1 = 0;
            const queue = [s];
            seen[s] = 1;
            while (queue.length) {
                const p = queue.pop();
                const px = p % gw;
                const py = (p - px) / gw;
                if (px < x0) x0 = px;
                if (px > x1) x1 = px;
                if (py < y0) y0 = py;
                if (py > y1) y1 = py;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = px + dx;
                        const ny = py + dy;
                        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                        const n = ny * gw + nx;
                        if (hot[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
                    }
                }
            }
            boxes.push({ x: x0 * cw, y: y0 * ch, w: (x1 - x0 + 1) * cw, h: (y1 - y0 + 1) * ch });
        }
        boxes.sort(function (p, q) { return q.w * q.h - p.w * p.h; });
        return boxes.slice(0, 6);
    }

    function roundRectPath(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }

    /**
     * 바뀐 영역에서 이전 화면이 새 화면으로 서서히 바뀌고 테두리가 한 번 빛나게 한다.
     * 단계가 한 번에 바뀌는 시각화에 움직임을 더하는 공용 효과이다.
     */
    function playOverlay(st, cv) {
        const boxes = diffBoxes(st.snap, cv);
        if (!boxes.length) return;
        const parent = cv.parentElement;
        if (!parent) return;
        if (!st.ov) {
            st.ov = document.createElement('canvas');
            st.ov.className = 'viz-fx-overlay';
            st.ov.fxOverlay = true;
            parent.appendChild(st.ov);
        }
        if (st.ov.width !== cv.width || st.ov.height !== cv.height) {
            st.ov.width = cv.width;
            st.ov.height = cv.height;
        }
        st.ov.style.left = cv.offsetLeft + 'px';
        st.ov.style.top = cv.offsetTop + 'px';
        st.ov.style.width = cv.offsetWidth + 'px';
        st.ov.style.height = cv.offsetHeight + 'px';
        const g = st.ov.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const pad = 6 * dpr;
        const color = window.CsFlow.getP().yellow;
        const t0 = performance.now();

        function frame(now) {
            const p = Math.min(1, (now - t0) / DURATION);
            const fade = Math.min(1, p / 0.5);
            const oldAlpha = 1 - fade * fade * (3 - 2 * fade);
            rawClear.call(g, 0, 0, st.ov.width, st.ov.height);
            boxes.forEach(function (b) {
                g.save();
                g.beginPath();
                g.rect(b.x, b.y, b.w, b.h);
                g.clip();
                g.globalAlpha = oldAlpha;
                g.drawImage(st.snap, 0, 0);
                g.restore();
                if (boxes.length === 1 && b.w >= cv.width * 0.98 && b.h >= cv.height * 0.98) return;
                g.save();
                g.globalAlpha = (1 - p) * 0.9;
                g.strokeStyle = color;
                g.lineWidth = 2.2 * dpr;
                roundRectPath(g, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 8 * dpr);
                g.stroke();
                g.restore();
            });
            if (p < 1) { st.raf = requestAnimationFrame(frame); }
            else { st.raf = 0; rawClear.call(g, 0, 0, st.ov.width, st.ov.height); }
        }
        frame(t0);
    }

    CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
        const cv = this.canvas;
        if (cv && !cv.fxOverlay && cv.width > 0 && cv.closest && cv.closest('#visualizer-container')) {
            const T = this.getTransform();
            if (w * T.a >= cv.width * 0.98 && h * T.d >= cv.height * 0.98) {
                try {
                    const st = stateOf(cv);
                    const now = performance.now();
                    const resized = st.w !== cv.width || st.h !== cv.height;
                    const burst = now - st.last < BURST_MS;
                    st.w = cv.width;
                    st.h = cv.height;
                    st.last = now;
                    if (st.raf || burst) stopOverlay(st);
                    if (st.seen && !burst && !resized && now - lastMove > MOVE_MS) {
                        if (!st.snap) st.snap = document.createElement('canvas');
                        if (st.snap.width !== cv.width || st.snap.height !== cv.height) {
                            st.snap.width = cv.width;
                            st.snap.height = cv.height;
                        }
                        const sg = st.snap.getContext('2d');
                        rawClear.call(sg, 0, 0, st.snap.width, st.snap.height);
                        sg.drawImage(cv, 0, 0);
                        queueMicrotask(function () { playOverlay(st, cv); });
                    }
                    st.seen = true;
                } catch (e) { /* 효과 실패가 시각화를 막지 않게 한다 */ }
            }
        }
        return rawClear.apply(this, arguments);
    };
})();

/* ===================== 시각화 공통 라이프사이클 ===================== */
window.CsFlow.createVizLifecycle = function (options) {
    const canvas     = options.canvas;
    const canvasWrap = options.canvasWrap;
    const resize     = options.resize;
    const draw       = options.draw;
    const getState   = options.getState;
    const setState   = options.setState;
    const onPause    = options.onPause || null;
    const getMouseCtx = options.getMouseCtx || null;

    /* 테마 변경 */
    function onThemeChange() {
        draw();
    }

    /* 탭 이탈 / 페이지 이동 시 애니메이션 중단 */
    function onVizPause() {
        const s = getState();
        if (s.rafId)  { cancelAnimationFrame(s.rafId); }
        if (s.timer)  { clearTimeout(s.timer); }
        setState({
            rafId: null,
            timer: null,
            running: false
        });
        if (onPause) onPause();
    }

    /* 작동 원리 탭 재진입 시 캔버스 복원 */
    function onVizResume() {
        resize();
    }

    /* 캔버스 크기 변화 감지 */
    const observer = new ResizeObserver(function () { resize(); });
    observer.observe(canvasWrap);

    window.addEventListener('csflow-theme-change', onThemeChange);
    window.addEventListener('csflow-viz-pause',    onVizPause);
    window.addEventListener('csflow-viz-resume',   onVizResume);

    document.addEventListener('visibilitychange', function () {
        const s = getState();
        if (document.hidden) {
            if (s.rafId) cancelAnimationFrame(s.rafId);
        } else {
            resize();
        }
    });

    /* 페이지 이탈 시 리스너 제거 및 캔버스 버퍼 해제 */
    function cleanup() {
        window.removeEventListener('csflow-theme-change', onThemeChange);
        window.removeEventListener('csflow-viz-pause',    onVizPause);
        window.removeEventListener('csflow-viz-resume',   onVizResume);
        observer.disconnect();
        const s = getState();
        if (s.rafId) cancelAnimationFrame(s.rafId);
        if (s.timer) clearTimeout(s.timer);
        canvas.width  = 1;
        canvas.height = 1;
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide',     cleanup);

    /* 마우스 이벤트 */
    if (getMouseCtx) {
        canvas.addEventListener('mousemove', function (e) {
            const ctx   = getMouseCtx();
            const rect  = canvas.getBoundingClientRect();
            const mx    = (e.clientX - rect.left) * (ctx.GW() / rect.width);
            const my    = (e.clientY - rect.top)  * (ctx.GH() / rect.height);
            ctx.mousePos.x = mx;
            ctx.mousePos.y = my;

            const hit    = ctx.tooltipHits.find(function (h) {
                return mx >= h.x && mx <= h.x + h.w &&
                       my >= h.y && my <= h.y + h.h;
            });
            const newKey = hit ? hit.key : null;
            if (newKey !== ctx.hoveredKey()) {
                ctx.setHoveredKey(newKey);
                canvas.style.cursor = newKey ? 'help' : 'default';
                ctx.draw();
            }
        });

        canvas.addEventListener('mouseleave', function () {
            const ctx = getMouseCtx();
            if (ctx.hoveredKey()) {
                ctx.setHoveredKey(null);
                canvas.style.cursor = 'default';
                ctx.draw();
            }
        });
    }
};

/* ===================== 3D 전환 버튼 ===================== */
(function () {
    let loading = null;

    /**
     * 하드웨어 가속 여부와 상관없이 WebGL 컨텍스트를 만들 수 있는지 확인한다.
     *
     * @returns 만들 수 있으면 true
     */
    function webglAvailable() {
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            if (!gl) return false;
            const lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 스크립트를 불러온다.
     *
     * @param src 스크립트 주소
     * @returns 로드가 끝나면 풀리는 Promise
     */
    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = src;
            s.addEventListener('load', resolve);
            s.addEventListener('error', reject);
            document.head.appendChild(s);
        });
    }

    /**
     * three.js, 공용 엔진, 토픽 3D 파일을 이 순서대로 한 번만 불러온다. 실패하면 다음 클릭에서 다시 시도한다.
     *
     * @param container data-three-src, data-viz3d-common-src, data-viz3d-src를 가진 시각화 컨테이너
     * @returns 로드가 끝나면 풀리는 Promise
     */
    function ensure3d(container) {
        if (window.CsFlow.viz3d && window.CsFlow.viz3d.active) return Promise.resolve();
        if (!loading) {
            loading = loadScript(container.dataset.threeSrc)
                .then(function () { return loadScript(container.dataset.viz3dCommonSrc); })
                .then(function () { return loadScript(container.dataset.viz3dSrc); })
                .catch(function (err) {
                    loading = null;
                    throw err;
                });
        }
        return loading;
    }

    /**
     * 2D 시각화 툴바에 3D 전환 버튼을 붙인다. 컨테이너에 3D 주소가 없거나 WebGL을 쓸 수 없으면 붙이지 않는다.
     * 누르면 3D 스크립트를 불러온 뒤 2D를 숨기고 3D 화면을 연다.
     *
     * @param opts container(시각화 컨테이너), parent(버튼을 붙일 요소), cls(버튼 클래스), label(버튼 문구),
     *             onOpen(3D를 열기 직전에 2D를 숨기는 함수), onExit(3D에서 2D로 돌아올 때 호출할 함수)
     */
    window.CsFlow.mount3dButton = function (opts) {
        const d = opts.container.dataset;
        if (!d.threeSrc || !d.viz3dCommonSrc || !d.viz3dSrc || !webglAvailable()) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = opts.cls;
        btn.textContent = opts.label;
        btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.textContent = '불러오는 중…';
            ensure3d(opts.container).then(function () {
                opts.onOpen();
                window.CsFlow.viz3d.active.open(opts.container, opts.onExit);
            }).catch(function () {
                if (window.CsFlow.showToast) window.CsFlow.showToast('3D 화면을 불러오지 못했습니다');
            }).then(function () {
                btn.disabled = false;
                btn.textContent = opts.label;
            });
        });
        opts.parent.appendChild(btn);
    };
})();