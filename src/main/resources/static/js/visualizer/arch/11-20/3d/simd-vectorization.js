/**
 * SIMD 벡터 연산 3D 붕어빵 틀 장면 (Three.js r128)
 * 2D 시각화의 "3D 붕어빵 틀" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.simdVectorizationData)가 먼저 있어야 한다.
 * 스칼라 틀은 반죽 한 덩이(원소 하나)를 한 번에 굽고, SIMD 틀은 같은 동작으로 레인 수만큼의 칸을 한 번에 굽는다.
 * 단계 수치(스칼라 · 벡터 덧셈 횟수)와 자막은 2D 단계 데이터에서 읽는다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.simdVectorizationData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.simdVectorizationData;
    const N = DATA.n;
    const LANES = DATA.lanes;
    const VECS = DATA.vecs;
    const A = DATA.a;
    const B = DATA.b;
    const C = DATA.c;
    const STEPS = DATA.steps;
    const ZERO = { sc: 0, vc: 0 };

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2c2c3a, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const SCALAR_COL = '#e6893a';
    const SIMD_COL = '#1d9e75';
    const WALL_Z = -3.6;
    const COUNTER_TOP = 0.9;
    const TOP = 0.28;
    const TABLE_TOP = 0.5;
    const PLATE_Y = TABLE_TOP + 0.05;
    const MOLD_Z = 0.2;
    const PLATE_Z = 2.6;
    const SC_X = -2.5;
    const SIMD_X = 1.5;
    const CELL = 0.82;
    const SLOT_DX = 0.72;
    const SLOT_DZ = 0.72;
    const TRAY_DX = 0.52;
    const TRAY_Z = [-2.85, -1.95];
    const CHIP_H = 0.1;
    const CHIP_R = 0.2;
    const FISH_H = 0.07;
    const LID_OPEN = -1.75;
    const STEAM_Y = TOP + 0.25;
    const TICK_PAUSE = 450;
    const SHOTS = {
        wide: { t: [0, 1.5, 0.2], dir: [0, 0.6, 1], w: 10.4, h: 6.8 },
        scalar: { t: [-1.6, 0.7, 0.6], dir: [0, 0.6, 1], w: 6.2, h: 4.2 },
        simd: { t: [1.2, 0.7, 0.6], dir: [0, 0.6, 1], w: 6.4, h: 4.2 }
    };

    /* ===================== 파생 값 (2D 데이터에서 계산) ===================== */
    /**
     * 단계 번호에 맞는 배지 문구를 돌려준다. 수치는 2D 단계 데이터에서 계산한다.
     *
     * @param i 단계 번호
     * @returns 배지 문구
     */
    function badgeOf(i) {
        if (i === 0) return 'OVERVIEW';
        if (i === STEPS.length - 1) return 'COMPARE';
        const s = STEPS[i];
        return s.vc > 0 ? 'SIMD ' + s.vc + '/' + VECS : 'SCALAR ' + s.sc + '/' + N;
    }
    const BADGES = STEPS.map(function (_, i) { return badgeOf(i); });

    /**
     * 단계에 맞는 카메라 구도 이름을 돌려준다. 처음과 마지막은 전체 구도다.
     *
     * @param i 단계 번호
     * @returns SHOTS의 구도 이름
     */
    function shotOf(i) {
        if (i === 0 || i === STEPS.length - 1) return 'wide';
        return STEPS[i].vc > 0 ? 'simd' : 'scalar';
    }

    /**
     * 칸 하나의 x 좌표를 돌려준다. 가운데 정렬된 n칸 중 k번째다.
     *
     * @param cx 가운데 x 좌표
     * @param k  칸 번호
     * @param n  칸 수
     * @returns x 좌표
     */
    function cellX(cx, k, n) {
        return cx + (k - (n - 1) / 2) * CELL;
    }

    /**
     * 완성 접시 칸의 x 좌표를 돌려준다. 한 행은 레인 수만큼이다.
     *
     * @param px 접시 가운데 x 좌표
     * @param e  원소 번호
     * @returns x 좌표
     */
    function slotX(px, e) {
        return px + ((e % LANES) - (LANES - 1) / 2) * SLOT_DX;
    }

    /**
     * 완성 접시 칸의 z 좌표를 돌려준다. 벡터 덧셈 한 번이 접시의 한 행을 채운다.
     *
     * @param e 원소 번호
     * @returns z 좌표
     */
    function slotZ(e) {
        return PLATE_Z + (Math.floor(e / LANES) - (VECS - 1) / 2) * SLOT_DZ;
    }

    /**
     * 조리대 위 재료 칸의 위치를 돌려준다.
     *
     * @param e   원소 번호
     * @param row 0이면 A 줄, 1이면 B 줄
     * @returns 위치 벡터
     */
    function trayPos(e, row) {
        return new V((e - (N - 1) / 2) * TRAY_DX, COUNTER_TOP + CHIP_H / 2, TRAY_Z[row]);
    }

    /**
     * 완성 접시 칸의 위치를 돌려준다. 완성품 바닥이 접시 위에 놓이는 높이다.
     *
     * @param px 접시 가운데 x 좌표
     * @param e  원소 번호
     * @returns 위치 벡터
     */
    function slotPos(px, e) {
        return new V(slotX(px, e), PLATE_Y, slotZ(e));
    }

    /**
     * 재료를 틀 위쪽 부은 자리로 보낼 위치를 돌려준다.
     *
     * @param x  틀 칸의 x 좌표
     * @param dx 부을 때 좌우로 벌릴 거리
     * @returns 위치 벡터
     */
    function pourAt(x, dx) {
        return new V(x + dx, TOP + 0.3, MOLD_Z);
    }

    /**
     * 장면에 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return '스칼라 SIMD 덧셈 명령 수 원소 개씩 번 필요 C = A + B 원소끼리 더하기 0123456789 '
            + BADGES.join(' ') + ' ' + A.concat(B, C).join(' ');
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 철판 위 스칼라 틀과 SIMD 틀, 재료 조리대, 완성 접시, 덧셈 횟수 상황판을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 테마 훅(applyTheme, release)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const lowEnd = eng.lowEnd;
        let curSc = 0;
        let curVc = 0;

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 22, 46);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
        sun.position.set(-4, 12, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 14);
        lamp.position.set(0, 3.6, 2.5);
        scene.add(lamp);

        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.4), new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) }));
        wall.position.set(0, 2.2, WALL_Z);
        wall.receiveShadow = true;
        scene.add(wall);

        const ironM = new THREE.MeshLambertMaterial({ color: 0x4d4640 });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x7d8799 });
        const lidM = new THREE.MeshLambertMaterial({ color: 0x9aa3b4 });
        const counterM = new THREE.MeshLambertMaterial({ color: 0x8b8577 });
        const plateM = new THREE.MeshLambertMaterial({ color: 0xf3ecdc });
        const slotM = new THREE.MeshLambertMaterial({ color: 0xd9cfbb });
        const batterM = new THREE.MeshLambertMaterial({ color: 0xf5e6c4 });
        const beanM = new THREE.MeshLambertMaterial({ color: 0x9c3f3a });
        const fishM = new THREE.MeshLambertMaterial({ color: 0xd98b2b });
        const cavityM = new THREE.MeshLambertMaterial({ color: 0x2a2622 });

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       x 좌표
         * @param y       y 좌표
         * @param z       z 좌표
         * @param m       재료
         * @param outline 외곽선 여부
         * @returns 만든 메시
         */
        function box(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (outline) eng.ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w     평면 폭
         * @param h     평면 높이
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  그리기 함수(컨텍스트, 폭, 높이)
         * @param basic 조명을 받지 않는 재료면 true
         * @returns 메시, 재료, redraw 함수
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = eng.canvas2d(pw, ph);
            const tex = eng.texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리기 함수(컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                eng.invalidate();
            }
            redraw(draw);
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /* ===================== 글자 표 ===================== */
        const labelGeo = new THREE.PlaneGeometry(0.3, 0.19);
        const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 22);
        const labelCache = {};

        /**
         * 숫자 한 개를 쓴 글자 표 재료를 돌려준다. 같은 문구는 재료를 한 번만 만든다.
         *
         * @param text 적을 문구
         * @param fg   글자 색
         * @param bg   바탕 색
         * @returns 재료
         */
        function labelMat(text, fg, bg) {
            const key = fg + '|' + bg + '|' + text;
            if (!labelCache[key]) {
                const [c, x] = eng.canvas2d(128, 80);
                kit.roundRect(x, 3, 3, 122, 74, 16);
                x.fillStyle = bg;
                x.fill();
                x.fillStyle = fg;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.font = '700 ' + (text.length > 2 ? 46 : 62) + 'px ' + SERIF;
                x.fillText(text, 64, 42);
                labelCache[key] = new THREE.MeshBasicMaterial({ map: eng.texture(c), transparent: true, depthWrite: false, toneMapped: false });
            }
            return labelCache[key];
        }

        /* ===================== 틀, 조리대, 접시 ===================== */
        box(9.4, 0.12, 3.2, 0, 0.06, MOLD_Z, ironM, true);
        box(9.4, COUNTER_TOP, 2.0, 0, COUNTER_TOP / 2, -2.4, counterM, true);
        box(9.4, TABLE_TOP, 1.6, 0, TABLE_TOP / 2, PLATE_Z, counterM, true);

        /**
         * 완성 접시를 만든다. 칸은 레인 수 열 × 벡터 덧셈 수 행이다.
         *
         * @param px 접시 가운데 x 좌표
         */
        function makePlate(px) {
            box(3.0, 0.04, 1.6, px, TABLE_TOP + 0.02, PLATE_Z, plateM, true);
            for (let e = 0; e < N; e++) {
                box(0.6, 0.01, 0.5, slotX(px, e), TABLE_TOP + 0.045, slotZ(e), slotM, false);
            }
        }

        /**
         * 틀 한 개를 만든다. 칸 수만큼 생선 모양 자리가 있고, 뒤쪽 경첩으로 여닫는 뚜껑이 붙는다.
         *
         * @param cx 틀 가운데 x 좌표
         * @param n  칸 수
         * @returns 뚜껑의 회전 축 그룹
         */
        function makeMold(cx, n) {
            const width = (n - 1) * CELL + 1.3;
            box(width, 0.16, 1.2, cx, 0.2, MOLD_Z, steelM, true);
            for (let k = 0; k < n; k++) {
                const d = new THREE.Mesh(decalGeo, cavityM);
                d.position.set(cellX(cx, k, n), TOP + 0.001, MOLD_Z);
                scene.add(d);
            }
            const pivot = new THREE.Group();
            pivot.position.set(cx, TOP, MOLD_Z - 0.6);
            const lid = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 1.2), lidM);
            lid.position.set(0, 0.04, 0.6);
            lid.castShadow = true;
            lid.receiveShadow = true;
            eng.ink(lid);
            pivot.add(lid);
            pivot.rotation.x = LID_OPEN;
            scene.add(pivot);
            return pivot;
        }

        /* ===================== 재료와 완성품 ===================== */
        const fishShape = new THREE.Shape();
        fishShape.moveTo(0.28, 0);
        fishShape.quadraticCurveTo(0.18, 0.16, -0.06, 0.13);
        fishShape.lineTo(-0.3, 0.27);
        fishShape.lineTo(-0.24, 0);
        fishShape.lineTo(-0.3, -0.27);
        fishShape.lineTo(-0.06, -0.13);
        fishShape.quadraticCurveTo(0.18, -0.16, 0.28, 0);
        const fishGeo = new THREE.ExtrudeGeometry(fishShape, { depth: FISH_H, bevelEnabled: false, curveSegments: 10 });
        fishGeo.rotateX(-Math.PI / 2);
        const decalGeo = new THREE.ExtrudeGeometry(fishShape, { depth: 0.01, bevelEnabled: false, curveSegments: 10 });
        decalGeo.rotateX(-Math.PI / 2);

        /**
         * 재료 덩이 하나를 만든다. 윗면에 값 글자 표가 붙는다.
         *
         * @param text    윗면에 적을 값
         * @param isBatter 밀가루 반죽(A)이면 true, 팥 소(B)면 false
         * @returns 그룹
         */
        function makeChip(text, isBatter) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(chipGeo, isBatter ? batterM : beanM);
            body.castShadow = true;
            g.add(body);
            const lbl = new THREE.Mesh(labelGeo, isBatter ? labelMat(text, INK, '#fbf8f1') : labelMat(text, '#fff6ea', '#5e1f1c'));
            lbl.rotation.x = -Math.PI / 2;
            lbl.position.y = CHIP_H / 2 + 0.004;
            g.add(lbl);
            scene.add(g);
            return g;
        }

        /**
         * 완성 붕어빵 하나를 만든다. 윗면에 결과 값 글자 표가 붙는다.
         *
         * @param text 결과 값
         * @returns 그룹
         */
        function makeUnit(text) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(fishGeo, fishM);
            body.castShadow = true;
            g.add(body);
            const lbl = new THREE.Mesh(labelGeo, labelMat(text, INK, '#fff8e8'));
            lbl.rotation.x = -Math.PI / 2;
            lbl.position.set(0.06, FISH_H + 0.004, 0);
            g.add(lbl);
            scene.add(g);
            return g;
        }

        /**
         * 증기 번짐 스프라이트를 만든다. 틀 위에서 피어오르는 효과다.
         *
         * @param x x 좌표
         * @returns 스프라이트
         */
        function makeSteam(x) {
            const sp = eng.glow(0xffe6b8, 0.9);
            sp.position.set(x, STEAM_Y, MOLD_Z);
            sp.visible = false;
            scene.add(sp);
            return sp;
        }

        makePlate(SC_X);
        makePlate(SIMD_X);
        const scLid = makeMold(SC_X, 1);
        const simdLid = makeMold(SIMD_X, LANES);
        const scSteam = [makeSteam(SC_X)];
        const smSteam = [];
        for (let l = 0; l < LANES; l++) smSteam.push(makeSteam(cellX(SIMD_X, l, LANES)));

        const chipA = [];
        const chipB = [];
        const scUnits = [];
        const smUnits = [];
        for (let e = 0; e < N; e++) {
            chipA.push(makeChip(String(A[e]), true));
            chipB.push(makeChip(String(B[e]), false));
            scUnits.push(makeUnit(String(C[e])));
            smUnits.push(makeUnit(String(C[e])));
        }

        /* ===================== 상황판과 안내판 ===================== */
        /**
         * 덧셈 횟수 한 줄을 그린다. 이름, 설명, 큰 횟수, 칸 막대로 이루어진다.
         *
         * @param x     캔버스 컨텍스트
         * @param y     줄의 위쪽 y 좌표
         * @param name  방식 이름
         * @param sub   방식 설명
         * @param count 지금까지 낸 명령 수
         * @param total 막대 칸 수
         * @param col   막대 색
         */
        function boardRow(x, y, name, sub, count, total, col) {
            x.textAlign = 'left';
            x.fillStyle = col;
            x.font = '700 30px ' + SERIF;
            x.fillText(name, 26, y);
            x.fillStyle = '#6b6358';
            x.font = '700 22px ' + SERIF;
            x.fillText(sub, 26, y + 30);
            x.textAlign = 'right';
            x.fillStyle = INK;
            x.font = '700 72px ' + HAND;
            x.fillText(String(count), 400, y + 14);
            x.textAlign = 'left';
            x.fillStyle = '#6b6358';
            x.font = '700 26px ' + SERIF;
            x.fillText('번', 412, y + 14);
            const gap = 6;
            const cw = (460 - gap * (total - 1)) / total;
            for (let i = 0; i < total; i++) {
                kit.roundRect(x, 26 + i * (cw + gap), y + 44, cw, 22, 5);
                x.fillStyle = i < count ? col : 'rgba(42,38,34,0.12)';
                x.fill();
            }
        }

        /**
         * 덧셈 명령 수 상황판을 그린다. 2D 단계 데이터의 스칼라 · 벡터 덧셈 수를 보여 준다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function boardDraw(x, pw, ph) {
            x.fillStyle = '#fbf8f1';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = 'rgba(42,38,34,0.5)';
            x.lineWidth = 6;
            x.strokeRect(8, 8, pw - 16, ph - 16);
            x.textBaseline = 'middle';
            x.textAlign = 'left';
            x.fillStyle = '#6b6358';
            x.font = '700 28px ' + SERIF;
            x.fillText('덧셈 명령 수', 26, 38);
            boardRow(x, 92, '스칼라', '원소 1개씩 · 명령 ' + N + '번 필요', curSc, N, SCALAR_COL);
            boardRow(x, 180, 'SIMD', '원소 ' + LANES + '개씩 · 명령 ' + VECS + '번 필요', curVc, VECS, SIMD_COL);
        }

        /**
         * 벽의 안내판 그림을 그린다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function eqDraw(x, pw, ph) {
            x.fillStyle = '#f6ecd6';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = '#6b7a8f';
            x.lineWidth = 8;
            x.strokeRect(4, 4, pw - 8, ph - 8);
            x.fillStyle = INK;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.font = '700 80px ' + SERIF;
            x.fillText('C = A + B', pw / 2, ph * 0.45);
            x.fillStyle = '#6b6358';
            x.font = '700 40px ' + SERIF;
            x.fillText('원소끼리 더하기', pw / 2, ph * 0.8);
        }

        const board = panel(3.2, 1.6, 512, 256, boardDraw, true);
        board.mesh.position.set(0, 2.45, WALL_Z + 0.04);
        scene.add(board.mesh);
        const eq = panel(2.6, 0.8, 512, 160, eqDraw, true);
        eq.mesh.position.set(-3.6, 2.45, WALL_Z + 0.04);
        scene.add(eq.mesh);

        /* ===================== 움직임 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms   기준 밀리초
         * @param fn   값을 받는 함수 (0에서 1)
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return eng.tween(ms / state.speed, fn, ease);
        }

        /**
         * 재료나 완성품을 호를 그리며 옮긴다.
         *
         * @param obj 옮길 그룹
         * @param to  도착 위치
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function glide(obj, to, ms) {
            const from = obj.position.clone();
            const mid = from.clone().lerp(to, 0.5);
            mid.y = Math.max(from.y, to.y) + 0.6;
            const curve = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve.getPoint(p, obj.position); }, eng.api.easeInOut);
        }

        /**
         * 재료 덩이를 틀 위에 부어 넣고 사라지게 한다. 장면이 바뀌었으면 상태를 쓰지 않고 끝낸다.
         *
         * @param g  단계 세대 번호
         * @param m  재료 그룹
         * @param to 부을 위치
         */
        async function pour(g, m, to) {
            await glide(m, to, 500);
            if (!alive(g)) return;
            await tw(200, function (p) { m.scale.setScalar(Math.max(0.001, 1 - p)); });
            if (!alive(g)) return;
            m.visible = false;
            m.scale.setScalar(1);
        }

        /**
         * 뚜껑을 지정한 각도까지 돌린다.
         *
         * @param pivot 뚜껑 회전 축
         * @param to    목표 각도(라디안)
         * @param ms    기준 밀리초
         * @returns 완료 Promise
         */
        function lidTo(pivot, to, ms) {
            const from = pivot.rotation.x;
            return tw(ms, function (p) { pivot.rotation.x = from + (to - from) * p; }, eng.api.easeInOut);
        }

        /**
         * 증기를 잠깐 피워 올린다. 굽는 동안을 나타낸다.
         *
         * @param list 증기 스프라이트 목록
         * @param ms   기준 밀리초
         * @returns 완료 Promise
         */
        function puff(list, ms) {
            list.forEach(function (s) { s.visible = true; });
            return tw(ms, function (p) {
                const a = Math.sin(Math.PI * p) * 0.75;
                list.forEach(function (s) {
                    s.material.opacity = a;
                    s.position.y = STEAM_Y + p * 0.3;
                });
            }).then(function () {
                list.forEach(function (s) { s.visible = false; });
            });
        }

        /**
         * 완성품을 틀 자리에 놓고 부풀려 나타나게 한다.
         *
         * @param unit 완성품 그룹
         * @param pos  놓을 위치
         * @returns 완료 Promise
         */
        function popUnit(unit, pos) {
            unit.position.copy(pos);
            unit.scale.setScalar(0.001);
            unit.visible = true;
            return tw(420, function (p) { unit.scale.setScalar(Math.max(0.001, p)); }, eng.api.easeBack);
        }

        /* ===================== 장면 상태 ===================== */
        /**
         * 재료 칸이 조리대에 남아 있는지 돌려준다. 벡터 덧셈이 시작됐으면 벡터 기준으로 센다.
         *
         * @param e  원소 번호
         * @param st 단계 상태({sc, vc})
         * @returns 남아 있으면 true
         */
        function chipOn(e, st) {
            return st.vc > 0 ? e >= st.vc * LANES : e >= st.sc;
        }

        /**
         * 재료 칸의 위치와 보임 여부를 정한다.
         *
         * @param mesh 재료 그룹
         * @param pos  위치
         * @param on   보이면 true
         */
        function placeChip(mesh, pos, on) {
            mesh.position.copy(pos);
            mesh.scale.setScalar(1);
            mesh.visible = on;
        }

        /**
         * 완성품의 위치와 보임 여부를 정한다.
         *
         * @param unit 완성품 그룹
         * @param pos  위치
         * @param on   보이면 true
         */
        function placeUnit(unit, pos, on) {
            unit.position.copy(pos);
            unit.scale.setScalar(1);
            unit.visible = on;
        }

        /**
         * 단계 상태를 즉시 만든다. 단계를 시작하거나 되감을 때 부른다.
         *
         * @param st 단계 상태({sc, vc})
         */
        function setScene(st) {
            eng.clearTweens();
            curSc = st.sc;
            curVc = st.vc;
            for (let e = 0; e < N; e++) {
                const on = chipOn(e, st);
                placeChip(chipA[e], trayPos(e, 0), on);
                placeChip(chipB[e], trayPos(e, 1), on);
                placeUnit(scUnits[e], slotPos(SC_X, e), e < st.sc);
                placeUnit(smUnits[e], slotPos(SIMD_X, e), e < st.vc * LANES);
            }
            scLid.rotation.x = LID_OPEN;
            simdLid.rotation.x = LID_OPEN;
            scSteam.concat(smSteam).forEach(function (s) { s.visible = false; });
            board.redraw(boardDraw);
            eng.invalidate();
        }

        /**
         * 카메라 구도를 잡는다. 화면 비율과 폭, 높이에 맞춰 거리를 정한다.
         *
         * @param key SHOTS의 구도 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const sw = eng.stage.clientWidth || 1;
            const sh = eng.stage.clientHeight || 1;
            const tanHalf = Math.tan((sw < 520 ? 46 : 32) * Math.PI / 360);
            const dw = s.w / ((sw / sh) * 2 * tanHalf);
            const dh = s.h / (2 * tanHalf);
            const dir = new V(s.dir[0], s.dir[1], s.dir[2]).normalize();
            const t = new V(s.t[0], s.t[1], s.t[2]);
            const p = t.clone().addScaledVector(dir, Math.max(dw, dh));
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /* ===================== 굽기 ===================== */
        /**
         * 스칼라 틀에 원소 하나를 넣어 굽고 완성품을 접시의 제 칸에 놓는다.
         *
         * @param g 단계 세대 번호
         * @param e 원소 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function bakeScalar(g, e) {
            await Promise.all([pour(g, chipA[e], pourAt(SC_X, -0.14)), pour(g, chipB[e], pourAt(SC_X, 0.14))]);
            if (!alive(g)) return false;
            await lidTo(scLid, 0, 300);
            if (!alive(g)) return false;
            await puff(scSteam, 600);
            if (!alive(g)) return false;
            await lidTo(scLid, LID_OPEN, 300);
            if (!alive(g)) return false;
            await popUnit(scUnits[e], new V(SC_X, TOP + 0.012, MOLD_Z));
            if (!alive(g)) return false;
            await glide(scUnits[e], slotPos(SC_X, e), 500);
            if (!alive(g)) return false;
            curSc = e + 1;
            board.redraw(boardDraw);
            return true;
        }

        /**
         * SIMD 틀에 레인 수만큼의 원소를 한 번에 넣어 굽고, 완성품을 접시의 한 행에 놓는다.
         *
         * @param g 단계 세대 번호
         * @param j 벡터 덧셈 번호(0부터)
         * @returns 단계가 아직 유효하면 true
         */
        async function bakeSimd(g, j) {
            const c0 = j * LANES;
            const c1 = Math.min(N, c0 + LANES);
            const pours = [];
            for (let e = c0; e < c1; e++) {
                const x = cellX(SIMD_X, e - c0, LANES);
                pours.push(pour(g, chipA[e], pourAt(x, -0.12)), pour(g, chipB[e], pourAt(x, 0.12)));
            }
            await Promise.all(pours);
            if (!alive(g)) return false;
            await lidTo(simdLid, 0, 300);
            if (!alive(g)) return false;
            await puff(smSteam, 600);
            if (!alive(g)) return false;
            await lidTo(simdLid, LID_OPEN, 300);
            if (!alive(g)) return false;
            const pops = [];
            for (let e = c0; e < c1; e++) {
                pops.push(popUnit(smUnits[e], new V(cellX(SIMD_X, e - c0, LANES), TOP + 0.012, MOLD_Z)));
            }
            await Promise.all(pops);
            if (!alive(g)) return false;
            const moves = [];
            for (let e = c0; e < c1; e++) moves.push(glide(smUnits[e], slotPos(SIMD_X, e), 500));
            await Promise.all(moves);
            if (!alive(g)) return false;
            curVc = j + 1;
            board.redraw(boardDraw);
            return true;
        }

        /**
         * SIMD 차례가 되면 조리대의 재료를 모두 다시 채운다. 같은 배열을 다시 꺼내 쓴다는 뜻이다.
         *
         * @param g 단계 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function refill(g) {
            for (let e = 0; e < N; e++) {
                placeChip(chipA[e], trayPos(e, 0), true);
                placeChip(chipB[e], trayPos(e, 1), true);
            }
            await tw(350, function (p) {
                const s = Math.max(0.001, p);
                chipA.forEach(function (m) { m.scale.setScalar(s); });
                chipB.forEach(function (m) { m.scale.setScalar(s); });
            });
            return alive(g);
        }

        /**
         * 이전 상태에서 이번 상태까지 굽기를 차례로 진행한다. 스칼라 굽기를 먼저 하고, 그다음 SIMD 굽기를 한다.
         *
         * @param g    단계 세대 번호
         * @param from 시작 상태({sc, vc})
         * @param to   끝 상태({sc, vc})
         * @returns 단계가 아직 유효하면 true
         */
        async function runBakes(g, from, to) {
            for (let e = from.sc; e < to.sc; e++) {
                if (!await bakeScalar(g, e)) return false;
                await wait(TICK_PAUSE);
                if (!alive(g)) return false;
            }
            for (let j = from.vc; j < to.vc; j++) {
                if (j === 0 && !await refill(g)) return false;
                if (!await bakeSimd(g, j)) return false;
                await wait(TICK_PAUSE);
                if (!alive(g)) return false;
            }
            return true;
        }

        /* ===================== 장면 진행 ===================== */
        /**
         * 단계 하나를 이전 단계의 끝 상태에서 시작해 재생한다. 자막은 2D 단계 설명을 그대로 쓴다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            const from = i > 0 ? STEPS[i - 1] : ZERO;
            const to = STEPS[i];
            setScene(from);
            view(shotOf(i));
            say(BADGES[i], to.log);
            if (!await runBakes(g, from, to)) return;
            view('wide');
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            floorM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        /**
         * 월드가 쥔 재료와 인스턴스는 엔진이 장면을 순회하며 해제하므로 따로 할 일이 없다.
         */
        function release() {}

        setScene(ZERO);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'SIMD 붕어빵 틀',
        badges: BADGES,
        canvasLabel: '스칼라 틀과 SIMD 틀이 같은 덧셈을 나란히 처리하는 3D. 스칼라 틀은 한 번에 원소 하나를, SIMD 틀은 레인 수만큼의 칸을 한 번에 굽습니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0, 5.2, 11.5], t: [0, 0.9, 0.2] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();