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