/**
 * 메모리 계층 구조 3D 팝업북 시각화 (Three.js r128)
 * 2D 시각화의 "3D 팝업북" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 렌더러 · 카메라 · UI · 생명주기는 공용 엔진이 맡고, 이 파일은 책 위의 유리병 장면과 장면 진행만 만든다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d) return;

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

    let fontsPromise = null;


    /* ===================== 글꼴 ===================== */
    /**
     * 캔버스 텍스처에 쓸 글꼴을 한글 글리프까지 불러온다. 시간 안에 못 불러오면 대체 글꼴로 그린다.
     *
     * @returns 완료 Promise
     */
    function loadFonts() {
        if (fontsPromise) return fontsPromise;
        fontsPromise = new Promise(function (resolve) {
            const link = document.createElement('link');
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

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        prefix: 'mem-hier3d',
        title: 'Memory Hierarchy 3D',
        badges: STEP_BADGES,
        canvasLabel: '메모리 계층을 책 위의 유리병 6개로 보여 주는 3D 장면. 아래 장면 버튼으로 데이터 흐름을 따라갑니다.',
        home: { p: [1.6, 4.6, 5.2], t: [1.7, 0.4, 0] },
        load: loadFonts,
        createWorld: createWorld
    });
    const state = v3.state;
    const alive = v3.alive;
    const wait = v3.wait;
    const setCaption = v3.setCaption;


    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 책상, 책, 유리병 6개, CPU, 타이머 카드와 점 흐름을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API와 렌더 훅(frame, busy, applyTheme, release)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const lowEnd = eng.lowEnd;
        const texScale = eng.texScale;
        let streams = [];
        let curLevelTimeNs = 0;
        let timerKey = '';

        scene.background = new THREE.Color(0xd9d2c4);
        scene.fog = new THREE.Fog(0xd9d2c4, 12, 26);

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
            const s = { a: a, b: b, path: path, im: im, guide: guide, from: from, to: to, t0: performance.now(), dur: HOP_MS[a] / speed, arrived: new Array(NDOT).fill(false), count: 0, head: A.clone(), done: false };
            streams.push(s);
            return s;
        }

        /**
         * 점 흐름을 모두 지운다.
         */
        function clearStreams() {
            eng.clearTweens();
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

        const glowers = jars.concat([cpuNode]);

        /**
         * 움직이는 점이나 빛나는 병이 남았는지 확인한다.
         */
        function busy() {
            if (streams.some(function (s) { return !s.done; })) return true;
            return glowers.some(function (j) { return j.pulse > 0; });
        }

        /**
         * 매 프레임 점 흐름을 갱신하고 병의 발광과 반짝임을 그린다.
         */
        function frame(t) {
            updateStreams(t);
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
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 책상, 조명을 바꾼다. 책은 두 테마 모두 종이색을 유지한다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            tableM.color.setHex(th.table);
            feltM.color.setHex(th.felt);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        /**
         * 월드가 쥔 점 흐름과 점 자원을 해제한다.
         */
        function release() {
            clearStreams();
            dotGeo.dispose();
            dotMat.dispose();
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;

        return {
            jars: jars,
            setLevels: setLevels,
            setTime: setTime,
            getTimeNs: function () { return curLevelTimeNs; },
            clearStreams: clearStreams,
            startStream: startStream,
            frame: frame,
            busy: busy,
            applyTheme: applyTheme,
            release: release
        };
    }


    /* ===================== 장면 진행 ===================== */
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

    v3.setSteps(STEPS);

    window.CsFlow.memHier3d = { open: v3.open, close: v3.close };
})();