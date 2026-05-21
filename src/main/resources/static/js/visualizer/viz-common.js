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