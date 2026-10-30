/**
 * 3D 시각화 공용 엔진 (Three.js r128)
 * 토픽 3D 파일(`{과목}/{묶음}/3d/{slug}.js`)보다 먼저 로드되며, 2D 시각화의 3D 버튼이 three.js 다음에 불러온다.
 * 렌더러 · 화질 단계 · 카메라 조작 · 렌더 루프 · UI · 장면 진행 · GPU 자원 해제를 맡고, 장면은 토픽이 만든다.
 *
 * 토픽은 window.CsFlow.viz3d.create(cfg)로 컨트롤러를 만들고 setSteps로 장면 진행을 넘긴다.
 * cfg.createWorld(eng)는 장면을 만들어 돌려주며, 다음 훅을 가질 수 있다.
 *   frame(t)      매 프레임 렌더 직전에 호출
 *   busy()        움직이는 것이 남았는지 (없으면 렌더 루프가 멈춘다)
 *   applyTheme()  사이트 테마가 바뀔 때 호출
 *   release()     월드를 해제하기 직전에 호출
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE) return;

    window.CsFlow.viz3d = { create: create, isLight: isLight, active: null };

    const V = THREE.Vector3;

    /* ===================== 상수 ===================== */
    const SPEEDS = [1, 2, 3];
    const ZOOM_MIN = 0.35;
    const ZOOM_MAX = 1.8;

    const CPU_TIP = {
        title: 'CPU로 그리는 중',
        body: '브라우저의 하드웨어 가속이 꺼져 있어 3D를 CPU로 그립니다. 화면은 같지만 CPU 사용률이 높고 덜 부드러울 수 있습니다.',
        fix: '해결: Chrome 설정 > 시스템 > 가능한 경우 그래픽 가속 사용을 켜고 브라우저를 다시 시작하세요.'
    };

    const HINT = {
        touch: '한 손가락 회전 · 두 손가락 이동·확대',
        mouse: '드래그 회전 · 우클릭 또는 휠 클릭 드래그 이동 · 누른 채 휠 확대 · 더블클릭 원위치'
    };

    const ICON = {
        play: 'M8 5v14l11-7z',
        pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
        prev: 'M15 6l-6 6 6 6',
        next: 'M9 6l6 6-6 6',
        rewind: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
        zoomIn: 'M12 5v14M5 12h14',
        zoomOut: 'M5 12h14'
    };

    /* ===================== DOM 유틸 ===================== */
    /**
     * 요소를 만든다.
     *
     * @param tag  태그 이름
     * @param cls  클래스 이름
     * @param text 텍스트 내용
     * @returns 만든 요소
     */
    function mk(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    /**
     * 24x24 SVG 아이콘 버튼을 만든다.
     *
     * @param cls   클래스 이름
     * @param label 접근성 이름
     * @param d     path 데이터
     * @param fill  채움 아이콘 여부
     * @returns 버튼 요소
     */
    function iconButton(cls, label, d, fill) {
        const btn = mk('button', cls);
        btn.type = 'button';
        btn.setAttribute('aria-label', label);
        btn.appendChild(iconSvg(d, fill));
        return btn;
    }

    /**
     * SVG 아이콘을 만든다.
     *
     * @param d    path 데이터
     * @param fill 채움 아이콘 여부
     * @returns svg 요소
     */
    function iconSvg(d, fill) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        if (fill) {
            svg.setAttribute('fill', 'currentColor');
        } else {
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
        }
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        return svg;
    }

    /**
     * 사이트가 라이트 테마인지 확인한다.
     *
     * @returns 라이트 테마면 true
     */
    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }

    /* ===================== 엔진 ===================== */
    /**
     * 하드웨어 가속 WebGL을 쓸 수 있는지 렌더러 밖에서 먼저 확인한다.
     * Three.js가 컨텍스트 생성에 실패하면 콘솔에 오류를 남기므로, 실패를 거기서 겪지 않게 한다.
     *
     * @returns 소프트웨어 렌더링이 아니고 WebGL을 쓸 수 있으면 true
     */
    function hasHardwareGl() {
        const probe = document.createElement('canvas');
        const opts = { failIfMajorPerformanceCaveat: true };
        const gl = probe.getContext('webgl2', opts) || probe.getContext('webgl', opts);
        if (!gl) return false;
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return true;
    }

    /**
     * 렌더러, 카메라, 렌더 루프, 포인터 조작을 만든다. 장면은 토픽이 eng.scene에 채운 뒤 attach로 연결한다.
     *
     * @param stage 캔버스를 넣을 요소
     * @param opts  label(캔버스 접근성 이름), home({p, t} 처음 카메라 위치와 시선), onFail(실패 안내 함수)
     * @returns 엔진 API
     */
    function createEngine(stage, opts) {
        const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lowEnd = mobile && ((navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4);
        const soft = !hasHardwareGl();
        const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, powerPreference: 'high-performance' });
        const minGap = 12;
        const slowGap = 28;
        const prMin = soft ? 0.5 : 0.75;
        const texScale = lowEnd ? 1 : 1.25;
        const canvases = [];
        const tweens = [];
        let hooks = null;
        let running = false;
        let last = 0;
        let follow = null;
        let userYaw = 0;
        let userPitch = 0;
        let zoom = 1;
        let zoomGoal = 1;
        let pinch = 0;
        const pan = new V();
        const panGoal = new V();
        const camRight = new V();
        const camUp = new V();
        const look = new V();
        const off = new V();
        const sph = new THREE.Spherical();
        let disposed = false;
        const pointers = new Map();

        let pr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1.25 : 2) : 1.5);
        let slow = 0;
        renderer.setPixelRatio(pr);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        const dom = renderer.domElement;
        dom.className = 'viz3d__canvas';
        dom.setAttribute('role', 'img');
        dom.setAttribute('aria-label', opts.label);
        stage.insertBefore(dom, stage.firstChild);
        dom.addEventListener('webglcontextlost', function (e) {
            e.preventDefault();
            opts.onFail('GPU가 이 3D 화면을 멈췄습니다. 다시 시작하거나 2D로 보세요.');
        });

        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
        const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

        const cur = { p: new V(opts.home.p[0], opts.home.p[1], opts.home.p[2]), t: new V(opts.home.t[0], opts.home.t[1], opts.home.t[2]) };
        const dst = { p: cur.p.clone(), t: cur.t.clone() };

        /**
         * 오프스크린 2D 캔버스를 만든다. 해제할 때 한꺼번에 비운다.
         */
        function canvas2d(w, h) {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            canvases.push(c);
            return [c, c.getContext('2d')];
        }

        /**
         * 캔버스를 sRGB 텍스처로 바꾼다.
         */
        function texture(c) {
            const t = new THREE.CanvasTexture(c);
            t.encoding = THREE.sRGBEncoding;
            t.anisotropy = maxAniso;
            return t;
        }

        /**
         * 지정한 시간 동안 값을 0에서 1로 바꾸는 트윈을 등록한다.
         */
        function tween(d, fn, ease, delay) {
            return new Promise(function (res) {
                tweens.push({ s: performance.now() + (delay || 0), d: d, fn: fn, ease: ease || easeOut, res: res });
                invalidate();
            });
        }

        /**
         * 진행 중인 트윈을 모두 끝낸 것으로 처리한다.
         */
        function clearTweens() {
            tweens.splice(0).forEach(function (w) { w.res(); });
        }

        const easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };
        const easeInOut = function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
        const easeBack = function (p) { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

        /**
         * 카메라 목표 위치와 시선을 정한다.
         */
        function shot(p, t) {
            follow = null;
            dst.p.set(p[0], p[1], p[2]);
            dst.t.set(t[0], t[1], t[2]);
            panGoal.set(0, 0, 0);
            invalidate();
        }

        /**
         * 확대 배율 목표를 정한다. 범위를 벗어나면 잘라 낸다.
         */
        function setZoom(z) {
            zoomGoal = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
            invalidate();
        }

        /**
         * 확대 배율 목표에 비율을 곱한다. 1보다 작으면 확대, 크면 축소다.
         */
        function zoomBy(f) {
            setZoom(zoomGoal * f);
        }

        /**
         * 드래그로 돌린 시점과 확대를 원래대로 돌린다.
         */
        function resetView() {
            userYaw = 0;
            userPitch = 0;
            panGoal.set(0, 0, 0);
            setZoom(1);
        }

        /**
         * 카메라가 점을 따라가게 한다.
         */
        function chase(tip) {
            follow = { tip: tip, off: new V(-0.7, 1.5, 2.8) };
            invalidate();
        }

        /**
         * 스테이지 크기에 맞춰 렌더러와 카메라를 조정한다.
         */
        function resize() {
            const w = stage.clientWidth;
            const h = stage.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h);
            cam.aspect = w / h;
            cam.fov = w < 520 ? 46 : 32;
            cam.updateProjectionMatrix();
        }

        /**
         * 지금 움직이는 것이 남았는지 확인한다. 없으면 렌더 루프를 멈춰 CPU를 쓰지 않는다.
         */
        function busy() {
            if (tweens.length || pointers.size) return true;
            if (zoom !== zoomGoal || pan.distanceToSquared(panGoal) > 0) return true;
            if (cur.p.distanceToSquared(dst.p) > 0 || cur.t.distanceToSquared(dst.t) > 0) return true;
            if (follow && dst.t.distanceToSquared(follow.tip) > 0) return true;
            return hooks && hooks.busy ? hooks.busy() : false;
        }

        /**
         * 한 프레임을 그린다. 움직이는 것이 남았을 때만 다음 프레임을 예약한다.
         */
        function frame(t) {
            if (!running) return;
            if (last && t - last < minGap) {
                requestAnimationFrame(frame);
                return;
            }
            try {
                const gap = t - (last || t);
                const dt = Math.min(250, gap);
                last = t;
                slow = gap > slowGap && gap < 3000 ? slow + (gap > 120 ? 5 : 1) : Math.max(0, slow - 1);
                if (slow > 20 && pr > prMin) {
                    pr = Math.max(prMin, pr - (gap > 120 ? 0.35 : 0.2));
                    renderer.setPixelRatio(pr);
                    resize();
                    slow = 0;
                }
                for (let k = tweens.length - 1; k >= 0; k--) {
                    const w = tweens[k];
                    const p = (t - w.s) / w.d;
                    if (p < 0) continue;
                    const q = Math.min(1, p);
                    w.fn(w.ease(q));
                    if (q >= 1) {
                        tweens.splice(k, 1);
                        w.res();
                    }
                }
                if (hooks && hooks.frame) hooks.frame(t);
                if (follow) {
                    dst.t.lerp(follow.tip, 0.05);
                    if (dst.t.distanceToSquared(follow.tip) < 1e-5) dst.t.copy(follow.tip);
                    dst.p.copy(dst.t).add(follow.off);
                }
                const kf = reduced ? 1 : 1 - Math.exp(-dt / 1000 * 1.8);
                cur.p.lerp(dst.p, kf);
                cur.t.lerp(dst.t, kf);
                if (cur.p.distanceToSquared(dst.p) < 1e-5) cur.p.copy(dst.p);
                if (cur.t.distanceToSquared(dst.t) < 1e-5) cur.t.copy(dst.t);
                zoom += (zoomGoal - zoom) * (reduced ? 1 : 1 - Math.exp(-dt / 1000 * 12));
                if (Math.abs(zoomGoal - zoom) < 0.002) zoom = zoomGoal;
                pan.lerp(panGoal, kf);
                if (pan.distanceToSquared(panGoal) < 1e-6) pan.copy(panGoal);
                off.copy(cur.p).sub(cur.t);
                sph.setFromVector3(off);
                sph.theta += userYaw;
                const basePhi = sph.phi;
                sph.phi = Math.max(0.12, Math.min(1.5, basePhi + userPitch));
                userPitch = sph.phi - basePhi;
                sph.radius *= zoom;
                off.setFromSpherical(sph);
                look.copy(cur.t).add(pan);
                cam.position.copy(look).add(off);
                cam.lookAt(look);
                renderer.render(scene, cam);
            } catch (e) {
                running = false;
                opts.onFail('렌더링 중 오류가 났습니다: ' + e.message);
                return;
            }
            if (busy()) requestAnimationFrame(frame);
            else running = false;
        }

        /**
         * 렌더 루프를 시작한다. 이미 돌고 있거나 해제됐으면 무시한다.
         */
        function start() {
            if (running || disposed) return;
            running = true;
            last = 0;
            requestAnimationFrame(frame);
        }

        /**
         * 화면을 다시 그려야 할 때 부른다. 멈춰 있던 루프를 깨운다.
         */
        function invalidate() {
            start();
        }

        /**
         * 렌더 루프를 멈춘다.
         */
        function stop() {
            running = false;
        }

        /**
         * 사이트 테마가 바뀌면 토픽의 테마 훅을 부르고 다시 그린다.
         */
        function applyTheme() {
            if (hooks && hooks.applyTheme) hooks.applyTheme();
            invalidate();
        }

        /**
         * 두 포인터 사이의 거리를 돌려준다.
         */
        function pinchDist() {
            const p = Array.from(pointers.values());
            return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        }

        /**
         * 두 포인터의 중점을 돌려준다.
         */
        function pinchMid() {
            const p = Array.from(pointers.values());
            return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
        }

        /**
         * 화면에서 끈 만큼 시점을 옮긴다. 카메라 거리에 비례해 장면이 손가락을 따라온다.
         */
        function panBy(dx, dy) {
            const k = 2 * Math.tan(cam.fov * Math.PI / 360) * off.length() / (stage.clientHeight || 1);
            camRight.setFromMatrixColumn(cam.matrixWorld, 0);
            camUp.setFromMatrixColumn(cam.matrixWorld, 1);
            panGoal.addScaledVector(camRight, -dx * k).addScaledVector(camUp, dy * k);
            if (panGoal.length() > 5) panGoal.setLength(5);
            pan.copy(panGoal);
            invalidate();
        }

        dom.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button > 2) return;
            pointers.set(e.pointerId, [e.clientX, e.clientY, e.button > 0 || e.shiftKey ? 1 : 0]);
            dom.setPointerCapture(e.pointerId);
            dom.classList.add('is-grabbing');
            pinch = pointers.size === 2 ? pinchDist() : 0;
            invalidate();
        });
        dom.addEventListener('pointermove', function (e) {
            const p = pointers.get(e.pointerId);
            if (!p) return;
            if (pointers.size === 2) {
                const before = pinchMid();
                p[0] = e.clientX;
                p[1] = e.clientY;
                const after = pinchMid();
                const d = pinchDist();
                if (pinch && d) setZoom(zoomGoal * pinch / d);
                pinch = d;
                panBy(after[0] - before[0], after[1] - before[1]);
                return;
            }
            if (p[2]) {
                panBy(e.clientX - p[0], e.clientY - p[1]);
            } else {
                userYaw -= (e.clientX - p[0]) * 0.006;
                userPitch = Math.max(-2, Math.min(2, userPitch - (e.clientY - p[1]) * 0.006));
            }
            p[0] = e.clientX;
            p[1] = e.clientY;
            invalidate();
        });
        const endPointer = function (e) {
            pointers.delete(e.pointerId);
            pinch = 0;
            if (!pointers.size) dom.classList.remove('is-grabbing');
            invalidate();
        };
        dom.addEventListener('pointerup', endPointer);
        dom.addEventListener('pointercancel', endPointer);
        dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        dom.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
        dom.addEventListener('dblclick', resetView);
        dom.addEventListener('wheel', function (e) {
            if (!e.ctrlKey && !(e.buttons & 3)) return;
            e.preventDefault();
            const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            setZoom(zoomGoal * Math.exp(dy * 0.0015));
        }, { passive: false });

        const resizeObs = new ResizeObserver(function () {
            resize();
            invalidate();
        });
        resizeObs.observe(stage);
        const viewObs = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) invalidate();
            else stop();
        });
        viewObs.observe(stage);
        window.addEventListener('csflow-theme-change', applyTheme);

        /**
         * 토픽이 만든 월드의 훅을 연결하고 첫 테마와 크기를 반영한다.
         */
        function attach(world) {
            hooks = world;
            applyTheme();
            resize();
        }

        /**
         * 엔진이 쥐고 있는 모든 GPU 자원과 오프스크린 캔버스를 해제한다.
         */
        function dispose() {
            disposed = true;
            running = false;
            window.removeEventListener('csflow-theme-change', applyTheme);
            resizeObs.disconnect();
            viewObs.disconnect();
            clearTweens();
            if (hooks && hooks.release) hooks.release();
            scene.traverse(function (o) {
                if (o.geometry) o.geometry.dispose();
                const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                mats.forEach(function (m) {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            });
            renderer.dispose();
            renderer.forceContextLoss();
            if (dom.parentNode) dom.parentNode.removeChild(dom);
            canvases.forEach(function (c) {
                c.width = 0;
                c.height = 0;
            });
            canvases.length = 0;
        }

        return {
            renderer: renderer,
            scene: scene,
            lowEnd: lowEnd,
            soft: soft,
            texScale: texScale,
            canvas2d: canvas2d,
            texture: texture,
            tween: tween,
            clearTweens: clearTweens,
            invalidate: invalidate,
            attach: attach,
            api: {
                soft: soft,
                easeInOut: easeInOut,
                easeBack: easeBack,
                tween: tween,
                shot: shot,
                chase: chase,
                resetView: resetView,
                zoomBy: zoomBy,
                start: start,
                dispose: dispose
            }
        };
    }

    /* ===================== 컨트롤러 ===================== */
    /**
     * 토픽 하나의 3D 화면(UI, 월드, 장면 진행, 생명주기)을 관리하는 컨트롤러를 만든다.
     * 탭을 벗어나면 GPU 자원을 모두 해제하고, 돌아오면 같은 단계에서 다시 만든다.
     *
     * @param cfg title(툴바 제목), badges(장면별 배지 문구), canvasLabel(캔버스 접근성 이름),
     *            home(처음 카메라 {p, t}), load(월드를 만들기 전 준비 함수, Promise 반환), createWorld(eng)(장면 생성 함수)
     * @returns open, close, setSteps, setCaption, alive, wait, state. 같은 객체를 window.CsFlow.viz3d.active에도 둔다(2D의 3D 버튼이 연다)
     */
    function create(cfg) {
        const B = 'viz3d__';
        const state = {
            wanted: false,
            world: null,
            ui: null,
            gen: 0,
            step: 0,
            speed: 1,
            auto: false,
            exit: null
        };
        let steps = [];

        /**
         * 장면 진행 함수 배열을 등록한다. 각 함수는 장면 시작 시점의 세대 번호를 받는다.
         *
         * @param list 장면 함수 배열
         */
        function setSteps(list) {
            steps = list;
        }

        /* ===================== UI 구성 ===================== */
        /**
         * 3D 시각화 UI(툴바, 스테이지, 로그, 컨트롤)를 컨테이너에 만든다.
         *
         * @param container 시각화 컨테이너
         * @returns UI 요소 참조 모음
         */
        function buildUi(container) {
            const root = mk('div', 'viz3d');

            const toolbar = mk('div', B + 'toolbar');
            const left = mk('div', B + 'toolbar-left');
            left.appendChild(mk('span', B + 'title', cfg.title));
            const badge = mk('span', B + 'badge', cfg.badges[0]);
            left.appendChild(badge);
            const cpuTag = mk('span', B + 'tag', 'CPU 렌더링');
            cpuTag.hidden = true;
            const qmark = mk('button', B + 'qmark', '?');
            qmark.type = 'button';
            qmark.setAttribute('aria-label', 'CPU 렌더링 설명');
            qmark.setAttribute('aria-describedby', 'viz3d-cpu-tip');
            qmark.addEventListener('click', function () { cpuTag.classList.toggle('is-open'); });
            const tip = mk('span', B + 'tip');
            tip.id = 'viz3d-cpu-tip';
            tip.setAttribute('role', 'tooltip');
            tip.appendChild(mk('b', '', CPU_TIP.title));
            tip.appendChild(mk('span', '', CPU_TIP.body));
            tip.appendChild(mk('span', B + 'tip-fix', CPU_TIP.fix));
            cpuTag.appendChild(qmark);
            cpuTag.appendChild(tip);
            left.appendChild(cpuTag);
            toolbar.appendChild(left);

            const right = mk('div', B + 'toolbar-right');
            right.appendChild(mk('span', B + 'speed-label', 'SPEED'));
            const speedBtns = SPEEDS.map(function (s) {
                const b = mk('button', B + 'btn ' + B + 'btn--speed', s + 'x');
                b.type = 'button';
                b.addEventListener('click', function () { setSpeed(s); });
                right.appendChild(b);
                return b;
            });
            const exitBtn = mk('button', B + 'btn', '2D로 보기');
            exitBtn.type = 'button';
            exitBtn.addEventListener('click', function () { leave(); });
            right.appendChild(exitBtn);
            toolbar.appendChild(right);
            root.appendChild(toolbar);

            const stage = mk('div', B + 'stage');
            const fail = mk('div', B + 'fail');
            const failMsg = mk('span', B + 'fail-msg');
            const retry = mk('button', B + 'btn ' + B + 'btn--primary', '다시 시작');
            retry.type = 'button';
            retry.addEventListener('click', function () { restart(); });
            const toFlat = mk('button', B + 'btn', '2D로 보기');
            toFlat.type = 'button';
            toFlat.addEventListener('click', function () { leave(); });
            fail.appendChild(failMsg);
            fail.appendChild(retry);
            fail.appendChild(toFlat);
            stage.appendChild(fail);
            const touch = window.matchMedia('(pointer: coarse)').matches;
            const hint = mk('span', B + 'hint', touch ? HINT.touch : HINT.mouse);
            root.appendChild(stage);

            const log = mk('div', B + 'caption');
            log.setAttribute('aria-live', 'polite');
            stage.appendChild(log);

            const controls = mk('div', B + 'controls');
            const prev = iconButton(B + 'btn ' + B + 'btn--icon', '이전 장면', ICON.prev, false);
            const play = iconButton(B + 'btn ' + B + 'btn--icon ' + B + 'btn--primary', '재생', ICON.play, true);
            const next = iconButton(B + 'btn ' + B + 'btn--icon', '다음 장면', ICON.next, false);
            const rewindBtn = iconButton(B + 'btn ' + B + 'btn--icon', '처음으로 되감기', ICON.rewind, false);
            const zoomOutBtn = iconButton(B + 'btn ' + B + 'btn--icon', '축소', ICON.zoomOut, false);
            const zoomInBtn = iconButton(B + 'btn ' + B + 'btn--icon', '확대', ICON.zoomIn, false);
            const zoomBox = mk('span', B + 'zoom');
            zoomBox.appendChild(zoomOutBtn);
            zoomBox.appendChild(zoomInBtn);
            const dots = mk('span', B + 'dots');
            const dotEls = cfg.badges.map(function () {
                const d = mk('span', B + 'dot');
                dots.appendChild(d);
                return d;
            });
            prev.addEventListener('click', function () { go(Math.max(0, state.step - 1)); });
            next.addEventListener('click', function () { go(Math.min(cfg.badges.length - 1, state.step + 1)); });
            play.addEventListener('click', function () { togglePlay(); });
            rewindBtn.addEventListener('click', function () { rewind(); });
            zoomOutBtn.addEventListener('click', function () { if (state.world) state.world.zoomBy(1.25); });
            zoomInBtn.addEventListener('click', function () { if (state.world) state.world.zoomBy(0.8); });
            [prev, play, next, dots, rewindBtn, hint, zoomBox].forEach(function (c) { controls.appendChild(c); });
            root.appendChild(controls);

            container.appendChild(root);
            return { root: root, hint: hint, cpuTag: cpuTag, stage: stage, badge: badge, log: log, fail: fail, failMsg: failMsg, prev: prev, play: play, next: next, dotEls: dotEls, speedBtns: speedBtns };
        }

        /**
         * 로그 바에 "라벨: 문장" 형식으로 설명을 쓴다.
         *
         * @param label 굵게 보일 라벨
         * @param text  설명 문장
         */
        function setCaption(label, text) {
            const ui = state.ui;
            if (!ui) return;
            ui.log.textContent = '';
            ui.log.appendChild(mk('b', '', label + ': '));
            ui.log.appendChild(document.createTextNode(text));
        }

        /**
         * 현재 단계와 재생 상태를 UI에 반영한다.
         */
        function syncUi() {
            const ui = state.ui;
            if (!ui) return;
            ui.badge.textContent = cfg.badges[state.step];
            ui.badge.classList.toggle(B + 'badge--active', state.step > 0);
            ui.dotEls.forEach(function (d, i) { d.classList.toggle('is-on', i === state.step); });
            ui.prev.disabled = state.step === 0;
            ui.next.disabled = state.step === cfg.badges.length - 1;
            ui.speedBtns.forEach(function (b, i) { b.classList.toggle('is-active', SPEEDS[i] === state.speed); });
            const label = state.auto ? '일시정지' : '재생';
            ui.play.setAttribute('aria-label', label);
            ui.play.replaceChild(iconSvg(state.auto ? ICON.pause : ICON.play, true), ui.play.firstChild);
        }

        /**
         * 배속을 바꾼다.
         *
         * @param s 배속
         */
        function setSpeed(s) {
            state.speed = s;
            syncUi();
        }

        /**
         * 실패 안내를 보여 준다.
         *
         * @param msg 사용자에게 보일 이유
         */
        function showFail(msg) {
            if (!state.ui) return;
            state.ui.failMsg.textContent = msg;
            state.ui.fail.classList.add('is-on');
        }

        /* ===================== 월드(씬) ===================== */
        /**
         * 엔진과 토픽 장면을 만들어 하나의 월드 API로 묶는다.
         *
         * @param stage 캔버스를 넣을 요소
         * @returns 월드 API
         */
        function createWorld(stage) {
            const eng = createEngine(stage, { label: cfg.canvasLabel, home: cfg.home, onFail: showFail });
            const topic = cfg.createWorld(eng);
            eng.attach(topic);
            return Object.assign({}, eng.api, topic);
        }

        /* ===================== 장면 진행 ===================== */
        /**
         * 현재 진행 중인 장면이 아직 유효한지 확인한다.
         *
         * @param g 장면 시작 시점의 세대 번호
         * @returns 유효하면 true
         */
        function alive(g) {
            return g === state.gen && state.world !== null;
        }

        /**
         * 지정한 시간만큼 기다린다. 배속을 반영한다.
         *
         * @param ms 밀리초
         * @returns 완료 Promise
         */
        function wait(ms) {
            return new Promise(function (r) { setTimeout(r, ms / state.speed); });
        }

        /**
         * 지정한 장면으로 이동해 재생한다. 자동 재생 중이면 다음 장면으로 이어 간다.
         *
         * @param i 장면 번호
         */
        async function go(i) {
            if (!state.world) return;
            const g = ++state.gen;
            state.step = i;
            syncUi();
            await steps[i](g);
            if (!alive(g)) return;
            if (state.auto) {
                if (i < steps.length - 1) {
                    await new Promise(function (r) { setTimeout(r, 1800 / state.speed); });
                    if (alive(g) && state.auto) go(i + 1);
                } else {
                    state.auto = false;
                    syncUi();
                }
            }
        }

        /**
         * 자동 재생을 켜거나 끈다. reduced-motion이어도 사용자가 누른 재생은 막지 않는다.
         */
        function togglePlay() {
            state.auto = !state.auto;
            syncUi();
            if (state.auto) go(state.step === 0 || state.step === steps.length - 1 ? 1 : state.step);
        }

        /**
         * 자동 재생을 멈추고 시점과 확대를 원래대로 돌린 뒤 첫 장면으로 되감는다.
         */
        function rewind() {
            if (!state.world) return;
            state.auto = false;
            state.world.resetView();
            go(0);
        }

        /* ===================== 생명주기 ===================== */
        /**
         * 준비를 마친 뒤 월드를 만들고 현재 장면을 재생한다.
         */
        async function startWorld() {
            const g = ++state.gen;
            await cfg.load();
            if (g !== state.gen || !state.wanted || !state.ui || state.world) return;
            try {
                state.world = createWorld(state.ui.stage);
            } catch (e) {
                showFail('3D를 만들지 못했습니다. 브라우저의 하드웨어 가속이 꺼져 있거나 열려 있는 3D 화면이 많을 수 있습니다. 2D로 보세요.');
                return;
            }
            state.ui.fail.classList.remove('is-on');
            state.ui.cpuTag.hidden = !state.world.soft;
            state.world.start();
            go(state.step);
        }

        /**
         * 월드의 GPU 자원을 해제한다. UI와 현재 장면 번호는 남긴다.
         */
        function closeWorld() {
            state.gen++;
            state.auto = false;
            if (state.world) {
                state.world.dispose();
                state.world = null;
            }
            syncUi();
        }

        /**
         * 3D 화면을 열고 시작한다.
         *
         * @param container 시각화 컨테이너
         * @param onExit    2D로 돌아갈 때 호출할 함수
         */
        function open(container, onExit) {
            close();
            state.wanted = true;
            state.exit = onExit;
            state.ui = buildUi(container);
            syncUi();
            startWorld();
        }

        /**
         * 3D 화면을 닫고 UI까지 지운다.
         */
        function close() {
            state.wanted = false;
            closeWorld();
            if (state.ui) {
                state.ui.root.remove();
                state.ui = null;
            }
        }

        /**
         * 사용자가 2D로 돌아간다.
         */
        function leave() {
            const cb = state.exit;
            close();
            state.step = 0;
            if (cb) cb();
        }

        /**
         * 실패 뒤 같은 UI에서 월드를 다시 만든다.
         */
        function restart() {
            closeWorld();
            startWorld();
        }

        window.addEventListener('csflow-viz-pause', function () {
            if (state.wanted && state.world) closeWorld();
        });
        window.addEventListener('csflow-viz-resume', function () {
            if (state.wanted && state.ui && !state.world) startWorld();
        });
        document.addEventListener('click', function (e) {
            if (state.ui && !state.ui.cpuTag.contains(e.target)) state.ui.cpuTag.classList.remove('is-open');
        });
        window.addEventListener('pagehide', function () {
            if (state.world) state.world.dispose();
            state.world = null;
        });

        const api = { state: state, open: open, close: close, setSteps: setSteps, setCaption: setCaption, alive: alive, wait: wait };
        window.CsFlow.viz3d.active = api;
        return api;
    }

})();