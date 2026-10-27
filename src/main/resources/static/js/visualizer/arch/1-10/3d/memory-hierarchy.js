/**
 * 메모리 계층 구조 3D 팝업북 시각화 (Three.js r128)
 * 2D 시각화의 "3D 팝업북" 버튼을 누를 때만 로드된다.
 * 작동 원리 탭을 벗어나거나 2D로 돌아가면 GPU 자원(컨텍스트, 텍스처, 지오메트리)을 모두 해제하고,
 * 탭으로 돌아오면 같은 단계에서 다시 만든다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE) return;

    const V = THREE.Vector3;

    /* ===================== 상수 ===================== */
    const SERIF = '"Noto Serif KR", serif';
    const HAND = 'Caveat, cursive';
    const INK = '#1f1b17';
    const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Noto+Serif+KR:wght@500;700&display=swap';
    const FONT_TIMEOUT = 4000;
    const NDOT = 24;
    const DOT_OFFSETS = Array.from({ length: NDOT }, function (_, k) { return k * 0.026 + Math.floor(k / 8) * 0.1; });
    const HOP_MS = [2600, 1500, 850, 650, 500, 380];
    const OVERVIEW = { p: [0, 6.3, 5.3], t: [0, 0.3, 0.15] };
    const STEP_BADGES = ['OVERVIEW', 'CACHE MISS', 'L1 HIT', 'CACHE LINE', 'PAGE FAULT'];
    const CPU_INDEX = 6;
    const SPEEDS = [1, 2, 3];
    const ZOOM_MIN = 0.35;
    const ZOOM_MAX = 1.8;
    const THEMES = {
        dark: { bg: 0x0f0f1a, table: 0x62607a, felt: 0x35453f, hemi: 0.4, sun: 0.95, exposure: 1.0 },
        light: { bg: 0xd9d2c4, table: 0xffffff, felt: 0x8ea597, hemi: 0.66, sun: 1.25, exposure: 1.05 }
    };

    const LAYERS = [
        { id: 'SSD', r: 0.21, h: 0.62, color: 0x7f93b5, ns: 50000 },
        { id: 'RAM', r: 0.18, h: 0.56, color: 0x2fb865, ns: 80 },
        { id: 'L3', r: 0.15, h: 0.5, color: 0x8a5cff, ns: 20 },
        { id: 'L2', r: 0.13, h: 0.44, color: 0x3b82f6, ns: 4 },
        { id: 'L1', r: 0.11, h: 0.38, color: 0xff7a2f, ns: 1 },
        { id: 'REG', r: 0.085, h: 0.3, color: 0xff4fa3, ns: 0.3 }
    ];

    const COPY = {
        lesson: 'LESSON 3 · 컴퓨터 구조',
        h1: '데이터는',
        h2: '어디서 올까',
        lead: 'CPU는 값을 가장 가까운 곳부터 찾습니다. 위로 갈수록 작고 빠르고, 아래로 갈수록 크고 느립니다.',
        amat: 'AMAT = Hit + Miss율 × Penalty',
        amatSub: '평균 메모리 접근 시간',
        terms: [['캐시 히트', '위 계층에 이미 있음'], ['캐시 미스', '아래 계층까지 내려감'], ['캐시 라인', '64B씩 묶어서 옮김']],
        predict: 'arr[i+1]은 어디서 올까?',
        options: ['RAM에서 다시', '이미 L1에 있다', 'SSD까지'],
        flap: '덮개를 들어 답을 확인하세요',
        right: 'MEMORY  HIERARCHY',
        fig: '그림 3. 위로 갈수록 작고 빠르다',
        figSub: '점 하나 = 8B, 점 8개 묶음 = 캐시 라인 64B',
        coverTitle: 'CS Flow',
        coverSub: '데이터가 흐르는 책',
        timerLabel: 'x 한 번 읽는 데 걸린 시간'
    };

    const CPU_TIP = {
        title: 'CPU로 그리는 중',
        body: '브라우저의 하드웨어 가속이 꺼져 있어 3D를 CPU로 그립니다. 화면은 같지만 CPU 사용률이 높고 덜 부드러울 수 있습니다.',
        fix: '해결: Chrome 설정 > 시스템 > 가능한 경우 그래픽 가속 사용을 켜고 브라우저를 다시 시작하세요.'
    };

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

    let fontsPromise = null;

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

    const ICON = {
        play: 'M8 5v14l11-7z',
        pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
        prev: 'M15 6l-6 6 6 6',
        next: 'M9 6l6 6-6 6',
        rewind: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
        zoomIn: 'M12 5v14M5 12h14',
        zoomOut: 'M5 12h14'
    };

    /* ===================== 글꼴 ===================== */
    /**
     * 캔버스 텍스처에 쓸 글꼴을 한글 글리프까지 불러온다. 시간 안에 못 불러오면 대체 글꼴로 그린다.
     *
     * @returns 완료 Promise
     */
    function loadFonts() {
        if (fontsPromise) return fontsPromise;
        fontsPromise = new Promise(function (resolve) {
            const link = mk('link');
            link.rel = 'stylesheet';
            link.href = FONT_CSS;
            const sheetReady = new Promise(function (res) {
                link.addEventListener('load', res);
                link.addEventListener('error', res);
            });
            document.head.appendChild(link);
            const sample = fontSample();
            const work = sheetReady.then(function () {
                return Promise.all([
                    document.fonts.load('700 40px Caveat', '0123456789.<>~ nsμB'),
                    document.fonts.load('700 40px "Noto Serif KR"', sample),
                    document.fonts.load('500 40px "Noto Serif KR"', sample)
                ]);
            });
            Promise.race([work, new Promise(function (r) { setTimeout(r, FONT_TIMEOUT); })]).then(resolve, resolve);
        });
        return fontsPromise;
    }

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const parts = [];
        Object.keys(COPY).forEach(function (k) {
            const v = COPY[k];
            parts.push(Array.isArray(v) ? v.join('') : v);
        });
        COPY.terms.forEach(function (t) { parts.push(t.join('')); });
        return parts.join('') + layerTexts().map(function (l) { return l.size + l.speed; }).join('');
    }

    /**
     * 2D 시각화가 공개한 계층 문구를 3D 순서(SSD부터)로 돌려준다.
     *
     * @returns {id, size, speed} 배열
     */
    function layerTexts() {
        const src = window.CsFlow.memHierLayers || [];
        return LAYERS.map(function (l) {
            const found = src.find(function (s) { return s.id === l.id; });
            return { id: l.id, size: found ? found.size : '', speed: found ? found.speed : '' };
        });
    }

    /**
     * 나노초를 읽기 쉬운 문자열로 바꾼다.
     *
     * @param ns 나노초
     * @returns 문자열
     */
    function fmt(ns) {
        if (ns < 10) return ns.toFixed(1) + ' ns';
        if (ns < 1000) return Math.round(ns) + ' ns';
        return (ns / 1000).toFixed(1) + ' μs';
    }

    /**
     * 사이트가 라이트 테마인지 확인한다.
     *
     * @returns 라이트 테마면 true
     */
    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }

    /* ===================== UI 구성 ===================== */
    /**
     * 3D 시각화 UI(툴바, 스테이지, 로그, 컨트롤)를 컨테이너에 만든다.
     *
     * @param container 시각화 컨테이너
     * @returns UI 요소 참조 모음
     */
    function buildUi(container) {
        const root = mk('div', 'mem-hier3d');

        const toolbar = mk('div', 'mem-hier3d__toolbar');
        const left = mk('div', 'mem-hier3d__toolbar-left');
        left.appendChild(mk('span', 'mem-hier3d__title', 'Memory Hierarchy 3D'));
        const badge = mk('span', 'mem-hier3d__badge', STEP_BADGES[0]);
        left.appendChild(badge);
        const cpuTag = mk('span', 'mem-hier3d__tag', 'CPU 렌더링');
        cpuTag.hidden = true;
        const qmark = mk('button', 'mem-hier3d__qmark', '?');
        qmark.type = 'button';
        qmark.setAttribute('aria-label', 'CPU 렌더링 설명');
        qmark.setAttribute('aria-describedby', 'mem-hier3d-cpu-tip');
        qmark.addEventListener('click', function () { cpuTag.classList.toggle('is-open'); });
        const tip = mk('span', 'mem-hier3d__tip');
        tip.id = 'mem-hier3d-cpu-tip';
        tip.setAttribute('role', 'tooltip');
        tip.appendChild(mk('b', '', CPU_TIP.title));
        tip.appendChild(mk('span', '', CPU_TIP.body));
        tip.appendChild(mk('span', 'mem-hier3d__tip-fix', CPU_TIP.fix));
        cpuTag.appendChild(qmark);
        cpuTag.appendChild(tip);
        left.appendChild(cpuTag);
        toolbar.appendChild(left);

        const right = mk('div', 'mem-hier3d__toolbar-right');
        right.appendChild(mk('span', 'mem-hier3d__speed-label', 'SPEED'));
        const speedBtns = SPEEDS.map(function (s) {
            const b = mk('button', 'mem-hier3d__btn mem-hier3d__btn--speed', s + 'x');
            b.type = 'button';
            b.addEventListener('click', function () { setSpeed(s); });
            right.appendChild(b);
            return b;
        });
        const exitBtn = mk('button', 'mem-hier3d__btn', '2D로 보기');
        exitBtn.type = 'button';
        exitBtn.addEventListener('click', function () { leave(); });
        right.appendChild(exitBtn);
        toolbar.appendChild(right);
        root.appendChild(toolbar);

        const stage = mk('div', 'mem-hier3d__stage');
        const fail = mk('div', 'mem-hier3d__fail');
        const failMsg = mk('span', 'mem-hier3d__fail-msg');
        const retry = mk('button', 'mem-hier3d__btn mem-hier3d__btn--primary', '다시 시작');
        retry.type = 'button';
        retry.addEventListener('click', function () { restart(); });
        const toFlat = mk('button', 'mem-hier3d__btn', '2D로 보기');
        toFlat.type = 'button';
        toFlat.addEventListener('click', function () { leave(); });
        fail.appendChild(failMsg);
        fail.appendChild(retry);
        fail.appendChild(toFlat);
        stage.appendChild(fail);
        const touch = window.matchMedia('(pointer: coarse)').matches;
        const hint = mk('span', 'mem-hier3d__hint', touch ? '한 손가락 회전 · 두 손가락 이동·확대' : '드래그 회전 · 우클릭 드래그 이동 · 누른 채 휠 확대 · 더블클릭 원위치');
        root.appendChild(stage);

        const log = mk('div', 'mem-hier3d__caption');
        log.setAttribute('aria-live', 'polite');
        stage.appendChild(log);

        const controls = mk('div', 'mem-hier3d__controls');
        const prev = iconButton('mem-hier3d__btn mem-hier3d__btn--icon', '이전 장면', ICON.prev, false);
        const play = iconButton('mem-hier3d__btn mem-hier3d__btn--icon mem-hier3d__btn--primary', '재생', ICON.play, true);
        const next = iconButton('mem-hier3d__btn mem-hier3d__btn--icon', '다음 장면', ICON.next, false);
        const rewindBtn = iconButton('mem-hier3d__btn mem-hier3d__btn--icon', '처음으로 되감기', ICON.rewind, false);
        const zoomOutBtn = iconButton('mem-hier3d__btn mem-hier3d__btn--icon', '축소', ICON.zoomOut, false);
        const zoomInBtn = iconButton('mem-hier3d__btn mem-hier3d__btn--icon', '확대', ICON.zoomIn, false);
        const zoomBox = mk('span', 'mem-hier3d__zoom');
        zoomBox.appendChild(zoomOutBtn);
        zoomBox.appendChild(zoomInBtn);
        const dots = mk('span', 'mem-hier3d__dots');
        const dotEls = STEP_BADGES.map(function () {
            const d = mk('span', 'mem-hier3d__dot');
            dots.appendChild(d);
            return d;
        });
        prev.addEventListener('click', function () { go(Math.max(0, state.step - 1)); });
        next.addEventListener('click', function () { go(Math.min(STEP_BADGES.length - 1, state.step + 1)); });
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
        ui.badge.textContent = STEP_BADGES[state.step];
        ui.badge.classList.toggle('mem-hier3d__badge--active', state.step > 0);
        ui.dotEls.forEach(function (d, i) { d.classList.toggle('is-on', i === state.step); });
        ui.prev.disabled = state.step === 0;
        ui.next.disabled = state.step === STEP_BADGES.length - 1;
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
     * Three.js 씬을 만든다. 책상, 책, 유리병 6개, CPU, 타이머 카드와 점 흐름을 포함한다.
     *
     * @param stage 캔버스를 넣을 요소
     * @returns 월드 API
     */
    function createWorld(stage) {
        const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lowEnd = mobile && ((navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4);
        const soft = !hasHardwareGl();
        const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, powerPreference: 'high-performance' });
        const minGap = 12;
        const slowGap = 28;
        const prMin = 0.75;
        const texScale = lowEnd ? 1 : 1.25;
        const canvases = [];
        const tweens = [];
        let streams = [];
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
        let disposed = false;
        const pointers = new Map();
        let curLevelTimeNs = 0;
        let timerKey = '';

        let pr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1.25 : 2) : 1.5);
        let slow = 0;
        renderer.setPixelRatio(pr);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        const dom = renderer.domElement;
        dom.className = 'mem-hier3d__canvas';
        dom.setAttribute('role', 'img');
        dom.setAttribute('aria-label', '메모리 계층을 책 위의 유리병 6개로 보여 주는 3D 장면. 아래 장면 버튼으로 데이터 흐름을 따라갑니다.');
        stage.insertBefore(dom, stage.firstChild);
        dom.addEventListener('webglcontextlost', function (e) {
            e.preventDefault();
            showFail('GPU가 이 3D 화면을 멈췄습니다. 다시 시작하거나 2D로 보세요.');
        });

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xd9d2c4);
        scene.fog = new THREE.Fog(0xd9d2c4, 12, 26);
        const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
        const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

        const cur = { p: new V(1.6, 4.6, 5.2), t: new V(1.7, 0.4, 0) };
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
         * 종이 해칭 텍스처를 만든다.
         */
        function hatch(base, alpha, count, repeat) {
            const [c, x] = canvas2d(256, 256);
            x.fillStyle = base;
            x.fillRect(0, 0, 256, 256);
            for (let i = 0; i < count; i++) {
                x.strokeStyle = 'rgba(50,44,38,' + (alpha * (0.4 + Math.random() * 0.6)) + ')';
                x.lineWidth = 0.6 + Math.random() * 0.8;
                const o = Math.random() * 256;
                x.beginPath();
                x.moveTo(o, 0);
                x.lineTo(o + (Math.random() - 0.5) * 3, 256);
                x.stroke();
            }
            const t = texture(c);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat, repeat);
            return t;
        }

        const paperM = new THREE.MeshLambertMaterial({ map: hatch('#f3efe6', 0.32, 90, 2) });
        const inkM = new THREE.LineBasicMaterial({ color: 0x2a2622, transparent: true, opacity: 0.82 });

        /**
         * 메시에 잉크 외곽선을 붙인다.
         */
        function ink(m, threshold) {
            m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, threshold || 25), inkM));
            return m;
        }

        /**
         * 잉크 외곽선이 있는 종이 상자를 만든다.
         */
        function paperBox(w, h, d) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paperM);
            m.castShadow = m.receiveShadow = true;
            return ink(m);
        }

        const [glowC, glowX] = canvas2d(64, 64);
        const glowGrad = glowX.createRadialGradient(32, 32, 0, 32, 32, 32);
        glowGrad.addColorStop(0, 'rgba(255,255,255,1)');
        glowGrad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
        glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
        glowX.fillStyle = glowGrad;
        glowX.fillRect(0, 0, 64, 64);
        const glowTex = new THREE.CanvasTexture(glowC);

        /**
         * 반짝이는 스프라이트를 만든다.
         */
        function glow(color, size) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            sp.scale.set(size, size, 1);
            return sp;
        }

        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.66);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.25);
        sun.position.set(-5, 9, 3.5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 26 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const hideM = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        [-7.9, -6.8].forEach(function (x) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 18), hideM);
            b.position.set(x, 6, 1);
            b.rotation.y = 0.55;
            b.castShadow = true;
            scene.add(b);
        });

        const [woodC, woodX] = canvas2d(512, 512);
        woodX.fillStyle = '#cdb99c';
        woodX.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 160; i++) {
            woodX.strokeStyle = 'rgba(110,80,50,' + (Math.random() * 0.12) + ')';
            woodX.lineWidth = Math.random() * 2;
            const y = Math.random() * 512;
            woodX.beginPath();
            woodX.moveTo(0, y);
            woodX.bezierCurveTo(170, y + Math.random() * 6 - 3, 340, y + Math.random() * 6 - 3, 512, y);
            woodX.stroke();
        }
        const woodTex = texture(woodC);
        woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
        woodTex.repeat.set(5, 5);
        const tableM = new THREE.MeshLambertMaterial({ map: woodTex });
        const table = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), tableM);
        table.rotation.x = -Math.PI / 2;
        table.receiveShadow = true;
        scene.add(table);
        const feltM = new THREE.MeshLambertMaterial({ color: 0x8ea597 });
        const felt = new THREE.Mesh(new THREE.BoxGeometry(11, 0.03, 8), feltM);
        felt.position.y = 0.015;
        felt.receiveShadow = true;
        scene.add(felt);

        const coverM = new THREE.MeshLambertMaterial({ color: 0xd6a52f });
        const [edgeC, edgeX] = canvas2d(64, 256);
        edgeX.fillStyle = '#efe9db';
        edgeX.fillRect(0, 0, 64, 256);
        for (let y = 0; y < 256; y += 3) {
            edgeX.fillStyle = 'rgba(120,100,80,' + (0.08 + Math.random() * 0.1) + ')';
            edgeX.fillRect(0, y, 64, 1);
        }
        const edgeTex = texture(edgeC);
        edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
        const edgeM = new THREE.MeshLambertMaterial({ map: edgeTex });

        const curve = function (u) { return 0.05 * (1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3)); };

        /**
         * 줄 바꿈하며 문단을 그린다.
         */
        function wrapText(x, t, X, Y, W, lh) {
            let line = '';
            let y = Y;
            for (const ch of t) {
                const s = line + ch;
                if (x.measureText(s).width > W && line) {
                    x.fillText(line, X, y);
                    line = ch;
                    y += lh;
                } else {
                    line = s;
                }
            }
            x.fillText(line, X, y);
            return y + lh;
        }

        /**
         * 둥근 사각형 경로를 만든다.
         */
        function roundRect(x, X, Y, W, H, r) {
            x.beginPath();
            x.moveTo(X + r, Y);
            x.arcTo(X + W, Y, X + W, Y + H, r);
            x.arcTo(X + W, Y + H, X, Y + H, r);
            x.arcTo(X, Y + H, X, Y, r);
            x.arcTo(X, Y, X + W, Y, r);
            x.closePath();
        }

        /**
         * 책 한 쪽의 바탕 캔버스를 만든다. 책등 쪽에 그림자를 깐다.
         */
        function pageCanvas(isLeft) {
            const [c, x] = canvas2d(Math.round(1024 * texScale), Math.round(1376 * texScale));
            x.scale(texScale, texScale);
            x.fillStyle = '#f8f4ec';
            x.fillRect(0, 0, 1024, 1376);
            const g = isLeft ? x.createLinearGradient(1024, 0, 860, 0) : x.createLinearGradient(0, 0, 170, 0);
            g.addColorStop(0, 'rgba(60,45,30,0.22)');
            g.addColorStop(1, 'rgba(60,45,30,0)');
            x.fillStyle = g;
            x.fillRect(0, 0, 1024, 1376);
            return [c, x];
        }

        const [leftC, lx] = pageCanvas(true);
        lx.fillStyle = '#b5532e';
        lx.font = '700 28px ' + SERIF;
        lx.fillText(COPY.lesson, 96, 126);
        lx.fillStyle = INK;
        lx.font = '700 76px ' + SERIF;
        lx.fillText(COPY.h1, 96, 222);
        lx.fillText(COPY.h2, 96, 312);
        lx.fillStyle = '#332d27';
        lx.font = '500 35px ' + SERIF;
        let ly = wrapText(lx, COPY.lead, 96, 392, 830, 54);
        ly += 26;
        lx.fillStyle = '#efe7d6';
        roundRect(lx, 84, ly, 856, 132, 12);
        lx.fill();
        lx.fillStyle = INK;
        lx.font = '700 36px ' + SERIF;
        lx.textAlign = 'center';
        lx.fillText(COPY.amat, 512, ly + 62);
        lx.fillStyle = '#6b6358';
        lx.font = '500 26px ' + SERIF;
        lx.fillText(COPY.amatSub, 512, ly + 104);
        lx.textAlign = 'left';
        ly += 196;
        COPY.terms.forEach(function (t) {
            lx.fillStyle = '#b5532e';
            lx.beginPath();
            lx.arc(108, ly - 12, 7, 0, 6.3);
            lx.fill();
            lx.fillStyle = INK;
            lx.font = '700 34px ' + SERIF;
            lx.fillText(t[0], 130, ly);
            lx.fillStyle = '#3f3831';
            lx.font = '500 34px ' + SERIF;
            lx.fillText(t[1], 320, ly);
            ly += 60;
        });
        ly += 24;
        lx.strokeStyle = 'rgba(31,27,23,0.45)';
        lx.lineWidth = 2.5;
        roundRect(lx, 84, ly, 856, 250, 14);
        lx.stroke();
        lx.fillStyle = '#b5532e';
        lx.font = '700 26px ' + SERIF;
        lx.fillText('PREDICT', 116, ly + 48);
        lx.fillStyle = INK;
        lx.font = '700 36px ' + SERIF;
        lx.fillText(COPY.predict, 116, ly + 100);
        lx.font = '500 31px ' + SERIF;
        lx.fillStyle = '#332d27';
        COPY.options.forEach(function (t, i) {
            lx.strokeRect(118, ly + 128 + i * 40, 24, 24);
            lx.fillText(t, 160, ly + 151 + i * 40);
        });
        lx.save();
        lx.translate(96, ly + 282);
        lx.rotate(-0.02);
        lx.fillStyle = '#efe4cc';
        roundRect(lx, 0, 0, 600, 120, 10);
        lx.fill();
        lx.fillStyle = '#b5532e';
        lx.font = '700 24px ' + SERIF;
        lx.fillText('WHY?', 28, 44);
        lx.fillStyle = INK;
        lx.font = '500 30px ' + SERIF;
        lx.fillText(COPY.flap, 28, 90);
        lx.restore();
        lx.fillStyle = '#9a9184';
        lx.font = '500 24px ' + SERIF;
        lx.fillText('6', 96, 1336);

        const [rightC, rx] = pageCanvas(false);
        rx.fillStyle = '#9a9184';
        rx.font = '500 24px ' + SERIF;
        rx.textAlign = 'right';
        rx.fillText(COPY.right, 944, 112);
        rx.fillText('7', 944, 1336);
        rx.textAlign = 'left';
        rx.setLineDash([7, 7]);
        rx.strokeStyle = 'rgba(31,27,23,0.16)';
        rx.lineWidth = 2;
        for (let i = 0; i < LAYERS.length; i++) {
            rx.beginPath();
            rx.arc((0.5 + i * 0.48 - 0.02) / 3.2 * 1024, (1.4 / 4.3) * 1376, 50, 0, Math.PI * 2);
            rx.stroke();
        }
        rx.setLineDash([]);
        rx.fillStyle = INK;
        rx.font = '700 32px ' + SERIF;
        rx.fillText(COPY.fig, 110, 1196);
        rx.fillStyle = '#5c554b';
        rx.font = '500 28px ' + SERIF;
        rx.fillText(COPY.figSub, 110, 1246);

        /**
         * 휘어진 책장 메시를 만든다.
         */
        function sheet(c, side) {
            const g = new THREE.PlaneGeometry(3.2, 4.3, 48, 1);
            g.rotateX(-Math.PI / 2);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const px = p.getX(i);
                p.setY(i, curve(side > 0 ? (px + 1.6) / 3.2 : (1.6 - px) / 3.2));
            }
            g.computeVertexNormals();
            const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: texture(c) }));
            m.receiveShadow = true;
            return m;
        }

        const rBoard = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 4.55), coverM);
        rBoard.position.set(1.675, 0.07, 0);
        rBoard.castShadow = rBoard.receiveShadow = true;
        scene.add(rBoard);
        const rBlock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 4.3), edgeM);
        rBlock.position.set(1.62, 0.21, 0);
        rBlock.castShadow = rBlock.receiveShadow = true;
        scene.add(rBlock);
        const rSheet = sheet(rightC, 1);
        rSheet.position.set(1.62, 0.313, 0);
        scene.add(rSheet);

        const leaf = new THREE.Group();
        scene.add(leaf);
        const lBoard = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 4.55), coverM);
        lBoard.position.set(-1.675, -0.14, 0);
        lBoard.castShadow = lBoard.receiveShadow = true;
        leaf.add(lBoard);
        const lBlock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 4.3), edgeM);
        lBlock.position.set(-1.62, 0, 0);
        lBlock.castShadow = lBlock.receiveShadow = true;
        leaf.add(lBlock);
        const lSheet = sheet(leftC, -1);
        lSheet.position.set(-1.62, 0.103, 0);
        leaf.add(lSheet);

        const [coverC, cx] = canvas2d(768, 1042);
        cx.scale(0.75, 0.75);
        cx.translate(1024, 1390);
        cx.rotate(Math.PI);
        cx.fillStyle = '#d6a52f';
        cx.fillRect(0, 0, 1024, 1390);
        cx.strokeStyle = '#a67c1c';
        cx.lineWidth = 6;
        cx.strokeRect(50, 50, 924, 1290);
        cx.fillStyle = '#6b4a0e';
        cx.font = '700 104px ' + SERIF;
        cx.textAlign = 'center';
        cx.fillText(COPY.coverTitle, 512, 330);
        cx.font = '500 44px ' + SERIF;
        cx.fillText(COPY.coverSub, 512, 410);
        cx.fillStyle = '#f6f1e4';
        cx.fillRect(272, 520, 480, 480);
        cx.fillStyle = '#ff7a2f';
        for (let i = 0; i < 8; i++) {
            cx.beginPath();
            cx.arc(352 + i * 46, 760 - Math.sin(i / 7 * Math.PI) * 140, 14, 0, 6.3);
            cx.fill();
        }
        cx.strokeStyle = '#6b4a0e';
        cx.lineWidth = 4;
        cx.strokeRect(272, 520, 480, 480);
        const coverMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.48), new THREE.MeshLambertMaterial({ map: texture(coverC) }));
        coverMesh.rotation.x = Math.PI / 2;
        coverMesh.position.set(-1.675, -0.182, 0);
        leaf.add(coverMesh);
        leaf.position.set(0, 0.21, 0);
        leaf.rotation.z = 0;

        const bookmark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.7), new THREE.MeshLambertMaterial({ color: 0x24365e }));
        bookmark.position.set(0.12, 0.035, 2.55);
        scene.add(bookmark);

        const pageY = function (x) { return 0.313 + curve((x - 0.02) / 3.2); };
        const y0 = pageY(1.7);
        const pops = [];

        /**
         * 책장 위에 일어서는 팝업 조각의 축을 만든다.
         */
        function pivot(x, y, z, up) {
            const p = new THREE.Group();
            p.position.set(x, y, z);
            p.rotation.x = up || 0;
            scene.add(p);
            pops.push(p);
            return p;
        }

        const back = pivot(1.7, y0, -1.06, 0);
        back.add(paperBox(2.95, 0.95, 0.05).translateY(0.475));
        const shelf = pivot(1.7, y0, -0.75, 0);
        shelf.add(paperBox(2.95, 0.14, 0.62).translateY(0.07));

        const glassM = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
        const css = function (c) { return '#' + c.toString(16).padStart(6, '0'); };
        const texts = layerTexts();

        /**
         * 병 앞에 세우는 손글씨 라벨 카드 텍스처를 만든다. 긴 문구는 카드 폭에 맞춰 글자 크기를 줄인다.
         */
        function cardTexture(id, size, speed, color) {
            const [c, x] = canvas2d(256, 184);
            x.fillStyle = '#fbf8f1';
            x.fillRect(0, 0, 256, 184);
            x.strokeStyle = 'rgba(42,38,34,0.5)';
            x.lineWidth = 3;
            x.strokeRect(6, 6, 244, 172);
            x.fillStyle = css(color);
            x.fillRect(206, 18, 30, 22);
            x.fillStyle = INK;
            x.font = '700 32px ' + SERIF;
            x.fillText(id, 18, 46);
            x.fillStyle = '#6b6358';
            let sz = 19;
            x.font = '500 ' + sz + 'px ' + SERIF;
            while (x.measureText(size).width > 224 && sz > 12) {
                sz -= 1;
                x.font = '500 ' + sz + 'px ' + SERIF;
            }
            x.fillText(size, 18, 76);
            x.fillStyle = INK;
            let hz = 50;
            x.font = '700 ' + hz + 'px ' + HAND;
            while (x.measureText(speed).width > 224 && hz > 24) {
                hz -= 2;
                x.font = '700 ' + hz + 'px ' + HAND;
            }
            x.fillText(speed, 18, 150);
            return texture(c);
        }

        const jars = LAYERS.map(function (l, i) {
            const x = 0.5 + i * 0.48;
            const piv = pivot(x, y0 + 0.14, -0.75, 0);
            const body = new THREE.Mesh(new THREE.CylinderGeometry(l.r, l.r, l.h, 40, 1, true), glassM);
            body.position.y = l.h / 2;
            piv.add(body);
            const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(l.r, l.r, l.h, 40)), inkM);
            rim.position.y = l.h / 2;
            piv.add(rim);
            const liq = new THREE.Group();
            piv.add(liq);
            const slices = l.id === 'L1' ? 8 : 1;
            const lh = l.h * 0.8;
            const dh = lh / slices;
            const discs = [];
            for (let n = 0; n < slices; n++) {
                const m = new THREE.MeshStandardMaterial({ color: l.color, emissive: l.color, emissiveIntensity: 0.5, roughness: 0.35 });
                const d = new THREE.Mesh(new THREE.CylinderGeometry(l.r * 0.84, l.r * 0.84, dh * (slices > 1 ? 0.94 : 1), 40), m);
                d.position.y = n * dh + dh / 2;
                liq.add(d);
                discs.push(d);
            }
            const pg = new THREE.BufferGeometry();
            const pp = [];
            for (let n = 0; n < 14; n++) {
                const a = Math.random() * 6.28;
                const q = Math.random() * l.r * 0.7;
                pp.push(Math.cos(a) * q, Math.random() * lh, Math.sin(a) * q);
            }
            pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
            const sparkle = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.022, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
            liq.add(sparkle);
            liq.scale.y = 0.001;
            const gs = glow(l.color, 0.7);
            gs.material.opacity = 0;
            gs.position.y = l.h;
            piv.add(gs);
            const cardPivot = pivot(x, pageY(x), -0.3, -0.38);
            const card = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshLambertMaterial({ map: cardTexture(l.id, texts[i].size, texts[i].speed, l.color), side: THREE.DoubleSide }));
            card.position.y = 0.15;
            card.castShadow = true;
            ink(card);
            cardPivot.add(card);
            return { id: l.id, color: new THREE.Color(l.color), ns: l.ns, h: l.h, x: x, liq: liq, discs: discs, dh: dh, glowSprite: gs, sparkle: sparkle, level: 0, pulse: 0 };
        });

        const cpuX = 2.55;
        const cpuY = pageY(cpuX);
        const cpuPivot = pivot(cpuX, cpuY, 0.78, 0);
        const cpuBox = paperBox(0.62, 0.09, 0.62);
        cpuBox.position.y = 0.045;
        cpuPivot.add(cpuBox);
        const [cpuC, ux] = canvas2d(256, 256);
        ux.fillStyle = '#f2eee5';
        ux.fillRect(0, 0, 256, 256);
        ux.fillStyle = INK;
        for (let i = 0; i < 8; i++) {
            const o = 30 + i * 28;
            ux.fillRect(o, 4, 10, 18);
            ux.fillRect(o, 234, 10, 18);
            ux.fillRect(4, o, 18, 10);
            ux.fillRect(234, o, 18, 10);
        }
        ux.strokeStyle = INK;
        ux.lineWidth = 3;
        ux.strokeRect(46, 46, 164, 164);
        ux.font = '700 64px ' + HAND;
        ux.textAlign = 'center';
        ux.fillText('CPU', 128, 148);
        const cpuTop = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshLambertMaterial({ map: texture(cpuC), transparent: true }));
        cpuTop.rotation.x = -Math.PI / 2;
        cpuTop.position.y = 0.092;
        cpuPivot.add(cpuTop);
        const cpuGlow = glow(0xffb36b, 1.1);
        cpuGlow.position.y = 0.25;
        cpuGlow.material.opacity = 0;
        cpuPivot.add(cpuGlow);
        const cpuNode = { color: new THREE.Color(0xffb36b), pulse: 0, glowSprite: cpuGlow };

        const [timerC, tx] = canvas2d(512, 280);
        const timerTex = texture(timerC);

        /**
         * 걸린 시간 카드를 다시 그린다. 내용이 같으면 건너뛴다.
         */
        function drawTimer(value, sub) {
            if (value + sub === timerKey) return;
            timerKey = value + sub;
            tx.fillStyle = '#fbf8f1';
            tx.fillRect(0, 0, 512, 280);
            tx.strokeStyle = 'rgba(42,38,34,0.5)';
            tx.lineWidth = 4;
            tx.strokeRect(8, 8, 496, 264);
            tx.fillStyle = '#6b6358';
            tx.font = '500 26px ' + SERIF;
            tx.fillText(COPY.timerLabel, 30, 56);
            tx.fillStyle = INK;
            tx.font = '700 116px ' + HAND;
            tx.fillText(value, 30, 190);
            tx.fillStyle = '#b5532e';
            tx.font = '500 24px ' + SERIF;
            tx.fillText(sub, 30, 246);
            timerTex.needsUpdate = true;
            invalidate();
        }

        drawTimer('—', '');
        const timerX = 1.05;
        const timerPivot = pivot(timerX, pageY(timerX), 0.8, -0.3);
        const timerCard = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), new THREE.MeshLambertMaterial({ map: timerTex, side: THREE.DoubleSide }));
        timerCard.position.y = 0.275;
        timerCard.castShadow = true;
        ink(timerCard);
        timerPivot.add(timerCard);

        /**
         * 걸린 시간 카드의 값을 바꾼다.
         */
        function setTime(ns, sub) {
            curLevelTimeNs = ns || 0;
            drawTimer(ns == null ? '—' : fmt(ns), sub || '');
        }

        /**
         * 계층 번호의 윗면 좌표를 돌려준다. CPU_INDEX는 CPU 칩이다.
         */
        function topOf(i) {
            if (i === CPU_INDEX) return new V(cpuX, cpuY + 0.12, 0.78);
            return new V(jars[i].x, y0 + 0.14 + jars[i].h + 0.02, -0.75);
        }

        const dotGeo = new THREE.SphereGeometry(0.024, 12, 10);
        const dotMat = new THREE.MeshBasicMaterial({ toneMapped: false });

        /**
         * 두 계층 사이에 점 24개가 곡선을 따라 흐르는 구간을 시작한다.
         */
        function startStream(a, b, speed) {
            const A = topOf(a);
            const B = topOf(b);
            const M = A.clone().lerp(B, 0.5);
            const path = new THREE.CatmullRomCurve3([
                A,
                A.clone().add(new V(0, 0.22, 0)),
                M.add(new V(0, b === CPU_INDEX ? 0.7 : 0.42, 0)),
                B.clone().add(new V(0, 0.24, 0)),
                B.clone().add(new V(0, b === CPU_INDEX ? 0.02 : -0.08, 0))
            ], false, 'centripetal');
            const guideMat = new THREE.LineDashedMaterial({ color: 0x2a2622, dashSize: 0.035, gapSize: 0.045, transparent: true, opacity: 0 });
            const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(80)), guideMat);
            guide.computeLineDistances();
            scene.add(guide);
            tween(600, function (p) { guideMat.opacity = 0.3 * p; });
            const im = new THREE.InstancedMesh(dotGeo, dotMat, NDOT);
            im.frustumCulled = false;
            im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            const from = jars[a].color;
            const to = b === CPU_INDEX ? cpuNode.color : jars[b].color;
            const zero = new THREE.Matrix4().makeScale(0, 0, 0);
            for (let k = 0; k < NDOT; k++) {
                im.setMatrixAt(k, zero);
                im.setColorAt(k, from);
            }
            scene.add(im);
            const s = { a: a, b: b, path: path, im: im, guide: guide, from: from, to: to, t0: performance.now(), dur: reduced ? 1 : HOP_MS[a] / speed, arrived: new Array(NDOT).fill(false), count: 0, head: A.clone(), done: false };
            streams.push(s);
            return s;
        }

        /**
         * 점 흐름을 모두 지운다.
         */
        function clearStreams() {
            tweens.splice(0).forEach(function (w) { w.res(); });
            streams.forEach(function (s) {
                scene.remove(s.im, s.guide);
                s.im.dispose();
                s.guide.geometry.dispose();
                s.guide.material.dispose();
            });
            streams = [];
            invalidate();
        }

        const m4 = new THREE.Matrix4();
        const pv = new V();
        const col = new THREE.Color();

        /**
         * 점 위치와 색을 갱신하고, 도착한 점만큼 병의 액체를 채운다.
         */
        function updateStreams(t) {
            streams.forEach(function (s) {
                if (s.done) return;
                const el = (t - s.t0) / s.dur;
                s.path.getPointAt(Math.min(Math.max(el, 0), 1), s.head);
                for (let k = 0; k < NDOT; k++) {
                    const u = el - DOT_OFFSETS[k];
                    if (u >= 1 && !s.arrived[k]) {
                        s.arrived[k] = true;
                        s.count++;
                        const target = s.b === CPU_INDEX ? cpuNode : jars[s.b];
                        target.pulse = Math.min(1, target.pulse + 0.35);
                        if (s.b !== CPU_INDEX) {
                            target.level = Math.max(target.level, 0.85 * s.count / NDOT);
                            target.liq.scale.y = Math.max(0.001, target.level);
                        }
                    }
                    if (u < 0 || u >= 1) {
                        s.im.setMatrixAt(k, m4.makeScale(0, 0, 0));
                        continue;
                    }
                    s.path.getPointAt(u, pv);
                    const sc = Math.min(1, u / 0.06, (1 - u) / 0.08) * (1 + 0.18 * Math.sin(t / 160 + k));
                    m4.makeScale(sc, sc, sc).setPosition(pv);
                    s.im.setMatrixAt(k, m4);
                    s.im.setColorAt(k, col.copy(s.from).lerp(s.to, u));
                }
                s.im.instanceMatrix.needsUpdate = true;
                if (s.im.instanceColor) s.im.instanceColor.needsUpdate = true;
                if (el >= 1 + DOT_OFFSETS[NDOT - 1]) s.done = true;
            });
        }

        /**
         * 병 6개의 액체 높이를 한 번에 정한다.
         */
        function setLevels(levels) {
            jars.forEach(function (j, i) {
                j.level = levels[i];
                j.liq.scale.y = Math.max(0.001, levels[i]);
                j.discs.forEach(function (d, n) { d.position.y = n * j.dh + j.dh / 2; });
            });
            invalidate();
        }

        /**
         * 지정한 시간 동안 값을 0에서 1로 바꾸는 트윈을 등록한다.
         */
        function tween(d, fn, ease, delay) {
            return new Promise(function (res) {
                tweens.push({ s: performance.now() + (reduced ? 0 : (delay || 0)), d: reduced ? 1 : d, fn: fn, ease: ease || easeOut, res: res });
                invalidate();
            });
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

        const off = new V();
        const sph = new THREE.Spherical();
        const glowers = jars.concat([cpuNode]);

        /**
         * 지금 움직이는 것이 남았는지 확인한다. 없으면 렌더 루프를 멈춰 CPU를 쓰지 않는다.
         */
        function busy() {
            if (tweens.length || pointers.size) return true;
            if (streams.some(function (s) { return !s.done; })) return true;
            if (zoom !== zoomGoal || pan.distanceToSquared(panGoal) > 0) return true;
            if (cur.p.distanceToSquared(dst.p) > 0 || cur.t.distanceToSquared(dst.t) > 0) return true;
            if (follow && dst.t.distanceToSquared(follow.tip) > 0) return true;
            return glowers.some(function (j) { return j.pulse > 0; });
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
                const dt = Math.min(50, gap);
                last = t;
                slow = gap > slowGap && gap < 400 ? slow + 1 : Math.max(0, slow - 1);
                if (slow > 20 && pr > prMin) {
                    pr = Math.max(prMin, pr - 0.2);
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
                updateStreams(t);
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
                sph.phi = Math.max(0.12, Math.min(1.5, sph.phi + userPitch));
                sph.radius *= zoom;
                off.setFromSpherical(sph);
                look.copy(cur.t).add(pan);
                cam.position.copy(look).add(off);
                cam.lookAt(look);
                glowers.forEach(function (j) {
                    j.pulse *= 0.93;
                    if (j.pulse < 0.01) j.pulse = 0;
                    j.glowSprite.material.opacity = j.pulse * 0.9;
                    j.glowSprite.scale.setScalar((j === cpuNode ? 1.1 : 0.7) * (1 + j.pulse * 0.4));
                });
                jars.forEach(function (j) {
                    j.sparkle.material.opacity = 0.4 + 0.45 * Math.abs(Math.sin(t / 300 + j.x * 7));
                    j.sparkle.rotation.y = t / 2000;
                });
                renderer.render(scene, cam);
            } catch (e) {
                running = false;
                showFail('렌더링 중 오류가 났습니다: ' + e.message);
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
         * 사이트 테마에 맞춰 배경, 안개, 책상, 조명을 바꾼다. 책은 두 테마 모두 종이색을 유지한다.
         */
        function applyTheme() {
            const th = isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            tableM.color.setHex(th.table);
            feltM.color.setHex(th.felt);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            renderer.toneMappingExposure = th.exposure;
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
            if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
            pointers.set(e.pointerId, [e.clientX, e.clientY, e.button === 2 || e.shiftKey ? 1 : 0]);
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
                userPitch = Math.max(-0.5, Math.min(0.6, userPitch + (e.clientY - p[1]) * 0.004));
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

        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        applyTheme();
        resize();

        /**
         * 월드가 쥐고 있는 모든 GPU 자원과 오프스크린 캔버스를 해제한다.
         */
        function dispose() {
            disposed = true;
            running = false;
            window.removeEventListener('csflow-theme-change', applyTheme);
            resizeObs.disconnect();
            viewObs.disconnect();
            tweens.splice(0).forEach(function (w) { w.res(); });
            clearStreams();
            scene.traverse(function (o) {
                if (o.geometry) o.geometry.dispose();
                const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                mats.forEach(function (m) {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            });
            dotGeo.dispose();
            dotMat.dispose();
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
            jars: jars,
            easeInOut: easeInOut,
            easeBack: easeBack,
            reduced: reduced,
            soft: soft,
            tween: tween,
            shot: shot,
            setLevels: setLevels,
            setTime: setTime,
            getTimeNs: function () { return curLevelTimeNs; },
            clearStreams: clearStreams,
            startStream: startStream,
            chase: function (tip) { follow = { tip: tip, off: new V(-0.7, 1.5, 2.8) }; invalidate(); },
            resetView: resetView,
            zoomBy: zoomBy,
            start: start,
            dispose: dispose
        };
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
     * 지정한 시간만큼 기다린다. 배속과 reduced-motion을 반영한다.
     *
     * @param ms 밀리초
     * @returns 완료 Promise
     */
    function wait(ms) {
        const w = state.world;
        const d = w && w.reduced ? 0 : ms / state.speed;
        return new Promise(function (r) { setTimeout(r, d); });
    }

    /**
     * 경로를 따라 계층 사이에 데이터를 흘려 보낸다.
     *
     * @param path  계층 번호 배열 (6은 CPU)
     * @param g     세대 번호
     * @param chase 카메라가 점을 따라갈지 여부
     */
    async function flowPath(path, g, chase) {
        const w = state.world;
        for (let i = 0; i < path.length - 1; i++) {
            if (!alive(g)) return;
            const a = path[i];
            const b = path[i + 1];
            const from = w.jars[a];
            setCaption('Follow', from.id + ' → ' + (b === CPU_INDEX ? 'CPU' : w.jars[b].id) + ' · ' + fmt(from.ns));
            const s = w.startStream(a, b, state.speed);
            if (chase) w.chase(s.head);
            const base = w.getTimeNs();
            await w.tween(s.dur + DOT_OFFSETS[0], function (p) { w.setTime(base + from.ns * p); }, function (p) { return p; });
        }
    }

    const STEPS = [
        async function overview(g) {
            const w = state.world;
            w.clearStreams();
            w.setLevels([0.85, 0.85, 0, 0, 0, 0]);
            w.setTime(null);
            w.shot(OVERVIEW.p, OVERVIEW.t);
            setCaption('Overview', '왼쪽은 설명, 오른쪽은 실험. 위로 갈수록 작고 빠릅니다');
        },
        async function cacheMiss(g) {
            const w = state.world;
            w.clearStreams();
            w.setLevels([0.85, 0.85, 0, 0, 0, 0]);
            w.setTime(0, '캐시 미스 · RAM부터');
            w.shot([-0.1, 2.7, 3.7], [1.0, 0.7, -0.6]);
            await wait(800);
            await flowPath([1, 2, 3, 4, 5, 6], g, true);
            if (!alive(g)) return;
            w.shot([0.4, 3.0, 4.3], [1.6, 0.5, -0.2]);
            w.setTime(w.getTimeNs(), '대부분이 RAM에서 기다린 시간');
            setCaption('Result', '약 ' + fmt(w.getTimeNs()) + ', 시간 대부분이 RAM 구간');
        },
        async function l1Hit(g) {
            const w = state.world;
            w.clearStreams();
            w.setLevels([0.85, 0.85, 0.85, 0.85, 0.85, 0.85]);
            w.setTime(0, '캐시 히트 · L1');
            w.shot([1.95, 1.3, 1.6], [2.6, 0.62, -0.4]);
            await wait(900);
            await flowPath([4, 5, 6], g, false);
            if (!alive(g)) return;
            setCaption('Result', '약 ' + fmt(w.getTimeNs()) + '. 처음보다 약 ' + Math.round(105 / Math.max(w.getTimeNs(), 0.1)) + '배 빠르다');
        },
        async function cacheLine(g) {
            const w = state.world;
            w.clearStreams();
            w.setLevels([0.85, 0.85, 0.85, 0.85, 0.85, 0.85]);
            w.setTime(0, 'arr[i+1] · 캐시 라인 덕분에 히트');
            const j = w.jars[4];
            w.shot([3.05, 0.85, 0.5], [2.42, 0.66, -0.75]);
            await wait(800);
            await Promise.all(j.discs.map(function (d, n) {
                return w.tween(700, function (p) { d.position.y = n * (j.dh + 0.035 * p) + j.dh / 2; }, w.easeBack, n * 60);
            }));
            if (!alive(g)) return;
            for (let n = 0; n < 8; n++) {
                const m = j.discs[n].material;
                w.tween(500, function (p) { m.emissiveIntensity = 0.5 + 1.2 * Math.sin(p * Math.PI); });
                await wait(140);
            }
            setCaption('Cut away', '8B × 8칸 = 64B. 옆 칸도 같은 캐시 라인으로 함께 올라온다');
            await wait(1100);
            if (!alive(g)) return;
            await Promise.all(j.discs.map(function (d, n) {
                return w.tween(500, function (p) { d.position.y = n * (j.dh + 0.035 * (1 - p)) + j.dh / 2; }, w.easeInOut);
            }));
            w.shot([1.95, 1.3, 1.6], [2.6, 0.62, -0.4]);
            await flowPath([4, 5, 6], g, false);
        },
        async function pageFault(g) {
            const w = state.world;
            w.clearStreams();
            w.setLevels([0.85, 0, 0, 0, 0, 0]);
            w.setTime(0, '페이지 폴트 · SSD부터');
            w.shot([-1.2, 5.4, 6.4], [1.0, 0.3, -0.2]);
            await wait(900);
            await flowPath([0, 1, 2, 3, 4, 5, 6], g, false);
            if (!alive(g)) return;
            w.setTime(w.getTimeNs(), 'RAM보다 수백 배 느리다');
            setCaption('Result', '약 ' + fmt(w.getTimeNs()) + '. RAM 미스보다 수백 배 느리다');
        }
    ];

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
        await STEPS[i](g);
        if (!alive(g)) return;
        if (state.auto) {
            if (i < STEPS.length - 1) {
                await new Promise(function (r) { setTimeout(r, 1800 / state.speed); });
                if (alive(g) && state.auto) go(i + 1);
            } else {
                state.auto = false;
                syncUi();
            }
        }
    }

    /**
     * 자동 재생을 켜거나 끈다. reduced-motion이면 장면 안의 움직임은 줄이지만, 사용자가 누른 재생은 막지 않고 장면 사이에 쉬는 시간을 둔다.
     */
    function togglePlay() {
        state.auto = !state.auto;
        syncUi();
        if (state.auto) go(state.step === 0 || state.step === STEPS.length - 1 ? 1 : state.step);
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
     * 폰트를 불러온 뒤 월드를 만들고 현재 장면을 재생한다.
     */
    async function startWorld() {
        const g = ++state.gen;
        await loadFonts();
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

    window.CsFlow.memHier3d = { open: open, close: close };
})();