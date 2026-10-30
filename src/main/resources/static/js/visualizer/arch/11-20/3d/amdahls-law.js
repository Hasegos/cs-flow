/**
 * 암달의 법칙 3D 이삿짐 장면 (Three.js r128)
 * 2D 시각화의 "3D 이삿짐" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 데이터(window.CsFlow.amdahlsLawData)가 먼저 있어야 한다.
 * 위층 짐 싸는 방에서 인부(코어)들이 짐을 나눠 싸서 대기줄로 나르는 병렬 구간과,
 * 엘리베이터 한 대가 짐을 한 상자씩 내려 트럭에 싣는 직렬 구간을 건물 단면으로 보여 준다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.amdahlsLawData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (수치의 원본) ===================== */
    const DATA = window.CsFlow.amdahlsLawData;
    const SER = DATA.TIME_SER;
    const PAR = DATA.TIME_PAR;
    const CORES = DATA.TIME_CORES;
    const CURVES = DATA.CURVE_PS;
    const speedup = DATA.speedup;
    const P_TIME = PAR / (SER + PAR);
    const LIMIT = speedup(P_TIME, Infinity);
    const MAX_N = CORES[CORES.length - 1];
    const BOXES = MAX_N;

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2c2c3a, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xd6cfbf, hemi: 0.65, sun: 1.0 }
    };
    const COLORS = { purple: '#8a5cff', orange: '#ff7a2f', teal: '#1d9e75' };
    const BADGES = ['OVERVIEW'].concat(CORES.slice(1).map(function (n) { return 'CORE ' + n; }), ['LIMIT']);
    const LIMIT_STEP = BADGES.length - 1;
    const FROM = BADGES.map(function (_, i) { return CORES[Math.max(0, i - 1)]; });
    const TO = BADGES.map(function (_, i) { return CORES[Math.min(i, CORES.length - 1)]; });
    const WALL_Z = -1.2;
    const FLOOR_Y = 2.2;
    const CAR_Y = [0.4, 2.6];
    const ROOM_CX = -4.3;
    const ROOM_GAP = 0.85;
    const QUEUE_X = -0.5;
    const TRUCK_X = 4.0;
    const SHOTS = {
        wide: { t: [0.5, 2.0, 0], dir: [0, 0.3, 1], w: 17.8, h: 6.0 },
        room: { t: [-3.2, 2.2, 0], dir: [0, 0.3, 1], w: 9.0, h: 4.2 },
        serial: { t: [2.2, 1.9, 0], dir: [0, 0.3, 1], w: 11.5, h: 5.2 }
    };

    /* ===================== 보드 상태 ===================== */
    const hud = { par: PAR, n: 1, lg: 0, lim: false };

    /**
     * 캔버스에 쓸 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return ['짐 싸는 방 · 병렬', '엘리베이터 · 한 대 · 직렬', '이삿짐 트럭', '시간 막대', '전체', '직렬', '병렬',
            '총', '배', '속도 향상 곡선', '최대', '한계', '인부', '무한대', '명', '상자', '인부 수', '로그 눈금', 'N='].join(' ') + ' 0123456789.p=→';
    }

    /**
     * 색 번호를 캔버스용 16진 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색 번호
     * @returns #으로 시작하는 6자리 문자열
     */
    function hex6(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 숫자를 필요한 만큼만 소수로 바꾼다. 정수면 소수점을 붙이지 않는다.
     *
     * @param v 숫자
     * @returns 문자열
     */
    function fmt(v) {
        return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
    }

    /**
     * 두 값 사이를 t 비율로 잇는다.
     *
     * @param a 시작 값
     * @param b 끝 값
     * @param t 0에서 1 사이 비율
     * @returns 중간 값
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * 인부 수에 따른 단계 자막 문장을 만든다. 수치는 2D와 같은 공식에서 나온다.
     *
     * @param n 인부(코어) 수
     * @returns 자막 문장
     */
    function coreText(n) {
        const par = PAR / n;
        return '인부 ' + n + '명 — 병렬 ' + PAR + '이 ' + fmt(par) + '으로 줄지만 직렬 ' + SER + '은 그대로입니다. 총 '
            + fmt(SER + par) + ' → ' + speedup(P_TIME, n).toFixed(2) + '배.';
    }

    /**
     * 시간 막대 보드를 그린다. 직렬 막대는 고정이고, 병렬 막대는 인부 수에 따라 짧아진다.
     *
     * @param x  캔버스 컨텍스트
     * @param pw 폭
     * @param ph 높이
     */
    function barsDraw(x, pw, ph) {
        const par = hud.par;
        const k = (pw - 48) / (SER + PAR);
        const y = 96;
        const h = 70;
        const serW = SER * k;
        const parW = par * k;
        x.fillStyle = '#fbf8f1';
        x.fillRect(0, 0, pw, ph);
        x.strokeStyle = 'rgba(42,38,34,0.5)';
        x.lineWidth = 8;
        x.strokeRect(5, 5, pw - 10, ph - 10);
        x.textBaseline = 'middle';
        x.textAlign = 'left';
        x.fillStyle = '#6b6358';
        x.font = '700 30px ' + SERIF;
        x.fillText('시간 막대 · 전체 ' + (SER + PAR), 24, 34);
        x.textAlign = 'right';
        x.fillText(hud.lim ? '인부 무한대' : '인부 ' + hud.n + '명', pw - 24, 34);
        kit.roundRect(x, 24, y, serW, h, 8);
        x.fillStyle = '#ff7a2f';
        x.fill();
        if (parW > 1) {
            kit.roundRect(x, 24 + serW, y, parW, h, 8);
            x.fillStyle = '#1d9e75';
            x.fill();
        }
        x.textAlign = 'center';
        x.fillStyle = '#fffdf6';
        x.font = '700 28px ' + SERIF;
        if (serW > 110) x.fillText('직렬 ' + SER, 24 + serW / 2, y + h / 2);
        if (parW > 110) x.fillText('병렬 ' + fmt(par), 24 + serW + parW / 2, y + h / 2);
        x.setLineDash([6, 5]);
        x.strokeStyle = '#6b6358';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(24 + 100 * k, y - 16);
        x.lineTo(24 + 100 * k, y + h + 16);
        x.stroke();
        x.setLineDash([]);
        x.textAlign = 'left';
        x.fillStyle = '#2a2622';
        x.font = '700 30px ' + SERIF;
        x.fillText('직렬 ' + SER + ' + 병렬 ' + fmt(par) + ' = 총 ' + fmt(SER + par), 24, 214);
        x.fillStyle = '#0f7a58';
        x.font = '700 44px ' + SERIF;
        x.fillText('속도 향상 ' + ((SER + PAR) / (SER + par)).toFixed(2) + '배', 24, 270);
    }

    /**
     * 속도 향상 곡선 보드를 그린다. 세 병렬 비율 곡선과 최대 한계선, 현재 인부 수 표시를 포함한다.
     *
     * @param x  캔버스 컨텍스트
     * @param pw 폭
     * @param ph 높이
     */
    function curveDraw(x, pw, ph) {
        const pl = 72;
        const pr = pw - 26;
        const pt = 96;
        const pb = ph - 56;
        const xOf = function (lg) { return pl + (pr - pl) * lg / 4; };
        const yOf = function (v) { return pb - (pb - pt) * v / 10; };
        x.fillStyle = '#fbf8f1';
        x.fillRect(0, 0, pw, ph);
        x.strokeStyle = 'rgba(42,38,34,0.5)';
        x.lineWidth = 8;
        x.strokeRect(5, 5, pw - 10, ph - 10);
        x.textBaseline = 'middle';
        x.textAlign = 'left';
        x.fillStyle = '#6b6358';
        x.font = '700 30px ' + SERIF;
        x.fillText('속도 향상 곡선', 24, 34);
        CURVES.forEach(function (c, i) {
            const lx = 24 + i * 170;
            x.fillStyle = COLORS[c.color];
            x.fillRect(lx, 62, 18, 18);
            x.fillStyle = INK;
            x.font = '700 26px ' + SERIF;
            x.fillText('p=' + c.p, lx + 26, 72);
        });
        [0, 5, 10].forEach(function (v) {
            x.strokeStyle = v === 0 ? 'rgba(42,38,34,0.6)' : 'rgba(42,38,34,0.18)';
            x.lineWidth = 2;
            x.beginPath();
            x.moveTo(pl, yOf(v));
            x.lineTo(pr, yOf(v));
            x.stroke();
            x.fillStyle = '#6b6358';
            x.font = '700 24px ' + SERIF;
            x.textAlign = 'right';
            x.fillText(v + '배', pl - 10, yOf(v));
        });
        CORES.forEach(function (n) {
            x.fillStyle = '#6b6358';
            x.font = '700 24px ' + SERIF;
            x.textAlign = 'center';
            x.fillText(String(n), xOf(Math.log2(n)), pb + 22);
        });
        x.fillText('인부 수 (로그 눈금)', (pl + pr) / 2, ph - 16);
        CURVES.forEach(function (c) {
            x.strokeStyle = COLORS[c.color];
            x.lineWidth = c.p === P_TIME ? 5 : 3;
            x.beginPath();
            for (let s = 0; s <= 40; s++) {
                const lg = 4 * s / 40;
                const px = xOf(lg);
                const py = yOf(speedup(c.p, Math.pow(2, lg)));
                if (s === 0) x.moveTo(px, py);
                else x.lineTo(px, py);
            }
            x.stroke();
        });
        x.setLineDash([8, 6]);
        x.strokeStyle = '#8a5cff';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(pl, yOf(LIMIT));
        x.lineTo(pr, yOf(LIMIT));
        x.stroke();
        x.setLineDash([]);
        x.fillStyle = '#6236d6';
        x.font = '700 26px ' + SERIF;
        x.textAlign = 'right';
        x.fillText('최대 ' + fmt(LIMIT) + '배', pr - 6, yOf(LIMIT) - 16);
        const vNow = hud.lim ? LIMIT : speedup(P_TIME, Math.pow(2, hud.lg));
        const mx = xOf(hud.lim ? 4 : hud.lg);
        const my = yOf(vNow);
        x.beginPath();
        x.arc(mx, my, 10, 0, Math.PI * 2);
        x.fillStyle = '#e6b422';
        x.fill();
        x.strokeStyle = INK;
        x.lineWidth = 3;
        x.stroke();
        const label = hud.lim ? '한계 ' + LIMIT.toFixed(2) + '배' : 'N=' + hud.n + ' → ' + vNow.toFixed(2) + '배';
        x.font = '700 28px ' + SERIF;
        const lw = x.measureText(label).width;
        x.textAlign = 'center';
        x.fillStyle = INK;
        x.fillText(label, Math.max(pl + lw / 2, Math.min(pr - lw / 2, mx)), my - 24);
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 건물 단면(짐 싸는 방, 엘리베이터 샤프트, 트럭)과 시간 막대·속도 향상 보드를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 테마 훅(applyTheme, release)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const say = v3.setCaption;
        const easeInOut = eng.api.easeInOut;
        const easeBack = eng.api.easeBack;
        const lowEnd = eng.lowEnd;

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 24, 48);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
        sun.position.set(-4, 12, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 6, bottom: -6, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.6, 14);
        lamp.position.set(0.5, 3.4, 3);
        scene.add(lamp);

        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.4), new THREE.MeshLambertMaterial({ map: eng.hatch('#e4dccb', 0.2, 80, 3) }));
        wall.position.set(0.5, 2.2, WALL_Z);
        wall.receiveShadow = true;
        scene.add(wall);

        const steelM = new THREE.MeshLambertMaterial({ color: 0x6b7a8f });
        const steelDarkM = new THREE.MeshLambertMaterial({ color: 0x3e4a5a });
        const concreteM = new THREE.MeshLambertMaterial({ color: 0x8b8577 });
        const vestM = new THREE.MeshLambertMaterial({ color: 0x1d9e75 });
        const skinM = new THREE.MeshLambertMaterial({ color: 0xf2c7a0 });
        const cardM = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
        const carM = new THREE.MeshLambertMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.38, depthWrite: false });
        const doorM = new THREE.MeshLambertMaterial({ color: 0x17151c });
        const bodyGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.5, 10);
        const headGeo = new THREE.SphereGeometry(0.11, 12, 10);
        const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const carGeo = new THREE.BoxGeometry(0.8, 0.8, 0.7);

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다. 그림자를 드리울 고정 구조물에만 쓴다.
         *
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
         * @returns 메시와 redraw 함수
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
            return { mesh: mesh, redraw: redraw };
        }

        /**
         * 벽이나 상자 면에 붙는 안내판을 만든다. 글씨가 넘치면 크기를 줄인다.
         */
        function sign(text, x, y, z, w, color) {
            const p = panel(w, w * 96 / 512, 512, 96, function (c, pw, ph) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, ph);
                c.strokeStyle = hex6(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, ph - 8);
                c.fillStyle = INK;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                let fs = 56;
                c.font = '700 ' + fs + 'px ' + SERIF;
                while (c.measureText(text).width > pw - 40 && fs > 24) {
                    fs -= 2;
                    c.font = '700 ' + fs + 'px ' + SERIF;
                }
                c.fillText(text, pw / 2, ph / 2 + 2);
            }, true);
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
        }

        /* ===================== 건물 단면 ===================== */
        box(7.15, 0.12, 2.2, -4.425, FLOOR_Y - 0.06, -0.1, concreteM, true);
        box(2.55, 0.12, 2.2, 2.125, FLOOR_Y - 0.06, -0.1, concreteM, true);
        box(1.9, 3.6, 0.06, 0, 1.8, -0.98, steelDarkM, true);
        box(0.06, 3.6, 0.06, -0.9, 1.8, -0.9, steelM, true);
        box(0.06, 3.6, 0.06, 0.9, 1.8, -0.9, steelM, true);
        box(1.9, 0.12, 0.12, 0, 3.66, -0.9, steelDarkM, true);
        sign('짐 싸는 방 · 병렬', -4.3, 3.8, WALL_Z + 0.03, 2.6, 0x1d9e75);
        sign('엘리베이터 · 한 대 · 직렬', 0, 3.85, WALL_Z + 0.03, 2.2, 0xff7a2f);

        /* ===================== 이삿짐 트럭 ===================== */
        box(4.0, 0.2, 1.5, 5.5, 0.5, 0.2, steelDarkM, true);
        box(4.0, 1.3, 0.08, 5.5, 1.25, -0.55, steelM, true);
        box(1.0, 0.9, 1.4, 8.1, 0.85, 0.2, steelM, true);
        sign('이삿짐 트럭', 5.5, 1.5, -0.5, 1.8, 0x17151c);
        [4.2, 6.8, 8.0].forEach(function (wx) {
            const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 12), doorM);
            wh.rotation.x = Math.PI / 2;
            wh.position.set(wx, 0.22, 0.95);
            scene.add(wh);
        });

        /* ===================== 시간 막대와 속도 향상 보드 ===================== */
        const bars = panel(3.2, 1.6, 640, 320, barsDraw, true);
        bars.mesh.position.set(5.6, 3.0, WALL_Z + 0.03);
        scene.add(bars.mesh);
        const curve = panel(3.6, 1.8, 640, 320, curveDraw, true);
        curve.mesh.position.set(-4.4, 1.15, WALL_Z + 0.03);
        scene.add(curve.mesh);

        /* ===================== 인부, 상자, 엘리베이터 ===================== */
        const workers = [];
        for (let k = 0; k < MAX_N; k++) {
            const grp = new THREE.Group();
            const body = new THREE.Mesh(bodyGeo, vestM);
            body.position.y = 0.27;
            eng.ink(body);
            const head = new THREE.Mesh(headGeo, skinM);
            head.position.y = 0.66;
            grp.add(body);
            grp.add(head);
            grp.visible = false;
            scene.add(grp);
            workers.push(grp);
        }
        const boxes = [];
        for (let b = 0; b < BOXES; b++) {
            const m = new THREE.Mesh(boxGeo, cardM);
            eng.ink(m);
            m.visible = false;
            scene.add(m);
            boxes.push(m);
        }
        const car = new THREE.Mesh(carGeo, carM);
        eng.ink(car);
        scene.add(car);

        /**
         * 인부 k의 자리를 돌려준다. 한 줄에 두 명씩 앞뒤로 세워 가로 폭을 줄인다.
         *
         * @param k 인부 번호
         * @param n 인부 수
         * @returns 바닥 위 위치
         */
        function workerSpot(k, n) {
            const cols = Math.ceil(n / 2);
            const x = ROOM_CX + (Math.floor(k / 2) - (cols - 1) / 2) * ROOM_GAP;
            return new V(x, FLOOR_Y, k % 2 === 0 ? 0.35 : -0.45);
        }

        /**
         * 인부 k가 맡은 j번째 상자가 쌓일 자리를 돌려준다. 인부 왼쪽에 작은 격자로 쌓는다.
         *
         * @param k 인부 번호
         * @param n 인부 수
         * @param j 인부 안에서의 상자 순서
         * @returns 위치
         */
        function pileSpot(k, n, j) {
            const base = workerSpot(k, n);
            const pc = Math.min(4, BOXES / n);
            const col = j % pc;
            const row = Math.floor(j / pc);
            return new V(base.x - 0.3 - (pc - 1 - col) * 0.2, FLOOR_Y + 0.1 + row * 0.2, base.z);
        }

        /**
         * 대기줄에서 상자 b가 설 자리를 돌려준다. 두 줄로 세워 엘리베이터 문 왼쪽에 둔다.
         *
         * @param b 상자 번호
         * @returns 위치
         */
        function queueSpot(b) {
            return new V(QUEUE_X - (b % 2) * 0.24, FLOOR_Y + 0.1, 0.55 - Math.floor(b / 2) * 0.2);
        }

        /**
         * 트럭 짐칸에서 상자 b가 실릴 자리를 돌려준다.
         *
         * @param b 상자 번호
         * @returns 위치
         */
        function truckSpot(b) {
            return new V(TRUCK_X + (b % 8) * 0.44, 0.7 + Math.floor(b / 8) * 0.2, 0.2);
        }

        /**
         * 엘리베이터 안 상자가 놓일 자리를 돌려준다.
         *
         * @returns 위치
         */
        function carFloor() {
            return new V(0, CAR_Y[1] - 0.3, 0.1);
        }

        /**
         * 인부를 n명 자리에 세우고 나머지는 숨긴다.
         *
         * @param n 인부 수
         */
        function placeWorkers(n) {
            workers.forEach(function (grp, k) {
                grp.visible = k < n;
                grp.scale.setScalar(1);
                if (k < n) grp.position.copy(workerSpot(k, n));
            });
        }

        /**
         * 상자를 인부별 쌓는 자리에 놓는다. 인부 수에 따라 상자 몫이 나뉜다.
         *
         * @param n  인부 수
         * @param sc 상자 크기 배율
         */
        function placePiles(n, sc) {
            boxes.forEach(function (m, b) {
                m.position.copy(pileSpot(b % n, n, Math.floor(b / n)));
                m.scale.setScalar(sc);
                m.visible = true;
            });
        }

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
         * 상자 b를 목표 위치까지 곡선으로 옮긴다.
         *
         * @param b  상자 번호
         * @param to 도착 위치
         * @param ms 기준 밀리초
         * @returns 완료 Promise
         */
        function carry(b, to, ms) {
            const m = boxes[b];
            const from = m.position.clone();
            const mid = from.clone().lerp(to, 0.5);
            mid.y = Math.max(from.y, to.y) + 0.7;
            const curve3 = new THREE.CatmullRomCurve3([from, mid, to]);
            return tw(ms, function (p) { curve3.getPoint(p, m.position); }, easeInOut);
        }

        /**
         * 엘리베이터 위치를 옮기고, 상자 b가 타고 있으면 함께 움직인다.
         *
         * @param y 엘리베이터 중심 높이
         * @param b 타고 있는 상자 번호, 없으면 -1
         */
        function setCar(y, b) {
            car.position.y = y;
            if (b >= 0) boxes[b].position.y = y - 0.3;
        }

        /**
         * 상자 한 개를 쌓을 때 커지며 나타나게 한다.
         *
         * @param b 상자 번호
         * @returns 완료 Promise
         */
        function popBox(b) {
            return tw(80, function (p) { boxes[b].scale.setScalar(Math.max(0.01, p)); }, easeBack);
        }

        /**
         * 인부 수가 바뀌면 인부를 새 자리로 옮기거나 새로 세운다.
         *
         * @param n  새 인부 수
         * @param ms 기준 밀리초
         * @returns 완료 Promise
         */
        function relayout(n, ms) {
            const jobs = [];
            workers.forEach(function (grp, k) {
                if (k >= n) {
                    grp.visible = false;
                    return;
                }
                const to = workerSpot(k, n);
                if (!grp.visible) {
                    grp.visible = true;
                    grp.position.copy(to);
                    grp.scale.setScalar(0.01);
                    jobs.push(tw(ms, function (p) { grp.scale.setScalar(Math.max(0.01, p)); }, easeBack));
                    return;
                }
                const from = grp.position.clone();
                jobs.push(tw(ms, function (p) { grp.position.lerpVectors(from, to, p); }));
            });
            return Promise.all(jobs);
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 인부 k가 맡은 상자를 차례로 싸서 대기줄로 나른다.
         *
         * @param g 단계 세대 번호
         * @param k 인부 번호
         * @param n 인부 수
         */
        async function packWorker(g, k, n) {
            for (let b = k; b < BOXES; b += n) {
                await popBox(b);
                if (!alive(g)) return;
                await carry(b, queueSpot(b), 180);
                if (!alive(g)) return;
            }
        }

        /**
         * 모든 인부가 동시에 짐을 싸서 나르는 병렬 구간을 진행한다.
         *
         * @param g 단계 세대 번호
         * @param n 인부 수
         * @returns 단계가 아직 유효하면 true
         */
        async function pack(g, n) {
            await Promise.all(Array.from({ length: n }, function (_, k) { return packWorker(g, k, n); }));
            return alive(g);
        }

        /**
         * 엘리베이터가 상자 b를 위층에서 내려 트럭에 싣고 다시 올라온다.
         *
         * @param g 단계 세대 번호
         * @param b 상자 번호
         */
        async function trip(g, b) {
            await carry(b, carFloor(), 90);
            if (!alive(g)) return;
            await tw(130, function (p) { setCar(lerp(CAR_Y[1], CAR_Y[0], p), b); });
            if (!alive(g)) return;
            await Promise.all([
                carry(b, truckSpot(b), 90),
                tw(130, function (p) { setCar(lerp(CAR_Y[0], CAR_Y[1], p), -1); })
            ]);
        }

        /**
         * 엘리베이터 한 대로 상자를 한 개씩 내리는 직렬 구간을 진행한다.
         *
         * @param g 단계 세대 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function serial(g) {
            for (let b = 0; b < BOXES; b++) {
                await trip(g, b);
                if (!alive(g)) return false;
            }
            return true;
        }

        /**
         * 사이트 테마에 맞춰 보드와 장면의 자막 상태를 다시 그린다.
         *
         * @param par 병렬 막대 길이 값
         * @param n   인부 수
         * @param lg  곡선 위의 현재 위치(log2 인부 수)
         * @param lim 한계 표시 여부
         */
        function setHud(par, n, lg, lim) {
            hud.par = par;
            hud.n = n;
            hud.lg = lg;
            hud.lim = lim;
            bars.redraw(barsDraw);
            curve.redraw(curveDraw);
        }

        /**
         * 구도를 잡는다. 화면 비율과 폭, 높이에 맞춰 거리를 정한다.
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

        /**
         * 인부 n명의 시작 상태를 즉시 만든다. 단계를 시작하거나 되감을 때 부른다.
         *
         * @param n 인부 수
         */
        function setScene(n) {
            eng.clearTweens();
            placeWorkers(n);
            placePiles(n, 1);
            car.position.set(0, CAR_Y[1], 0.1);
            setHud(PAR / n, n, Math.log2(n), false);
            eng.invalidate();
        }

        /**
         * 인부 수를 늘린 뒤 병렬 구간과 직렬 구간을 차례로 보여 준다.
         *
         * @param g     단계 세대 번호
         * @param label 자막 라벨
         * @param from  이전 인부 수
         * @param to    새 인부 수
         */
        async function coreStep(g, label, from, to) {
            say(label, coreText(to));
            view('room');
            placePiles(to, 0.01);
            await Promise.all([
                relayout(to, 450),
                tw(450, function (p) { setHud(lerp(PAR / from, PAR / to, p), to, lerp(Math.log2(from), Math.log2(to), p), false); })
            ]);
            if (!alive(g)) return;
            say('병렬', '인부 ' + to + '명이 짐을 싸서 대기줄로 나릅니다. 한 명이 ' + fmt(BOXES / to) + '상자씩 맡아 병렬 구간이 ' + fmt(PAR / to) + '으로 줄었습니다.');
            if (!await pack(g, to)) return;
            say('직렬', '엘리베이터는 한 대뿐이라 한 번에 한 상자씩 내립니다. 인부가 늘어도 직렬 ' + SER + '은 그대로입니다.');
            view('serial');
            if (!await serial(g)) return;
            view('wide');
        }

        /**
         * 인부를 아주 많이 늘린 극단 상황을 보여 준다. 병렬 막대가 0에 가까워지고 직렬 막대만 남는다.
         *
         * @param g     단계 세대 번호
         * @param label 자막 라벨
         */
        async function limitStep(g, label) {
            say(label, limitText());
            view('room');
            placePiles(MAX_N, 0.01);
            await Promise.all([
                pack(g, MAX_N),
                tw(900, function (p) { setHud(lerp(PAR / MAX_N, 0, p), MAX_N, Math.log2(MAX_N), false); })
            ]);
            if (!alive(g)) return;
            say('직렬', '병렬 구간이 사라져도 엘리베이터가 상자를 내리는 직렬 ' + SER + '은 남습니다.');
            view('serial');
            if (!await serial(g)) return;
            setHud(0, MAX_N, Math.log2(MAX_N), true);
            view('wide');
        }

        /**
         * 이삿짐을 병렬과 직렬로 나누는 개요를 보여 준다.
         *
         * @param label 자막 라벨
         */
        async function overview(label) {
            say(label, overviewText());
            view('wide');
        }

        /**
         * 단계 자막용 개요 문장을 만든다.
         *
         * @returns 자막 문장
         */
        function overviewText() {
            return '이삿짐은 짐 싸기·나르기(병렬 ' + PAR + ')와 엘리베이터 내리기(직렬 ' + SER + ')로 나뉩니다. 인부 1명이면 총 '
                + (SER + PAR) + ', 기준 ' + speedup(P_TIME, 1).toFixed(2) + '배입니다.';
        }

        /**
         * 극단 단계용 자막 문장을 만든다.
         *
         * @returns 자막 문장
         */
        function limitText() {
            return '인부를 아무리 늘려도 병렬 막대는 0에 가까워집니다. 직렬 ' + SER + '은 남아 총 시간은 ' + SER + ' 아래로 내려가지 않습니다. 최대 '
                + fmt(LIMIT) + '배가 한계입니다.';
        }

        const FLOW = BADGES.map(function (label, i) {
            if (i === 0) return function () { return overview(label); };
            if (i === LIMIT_STEP) return function (g) { return limitStep(g, label); };
            return function (g) { return coreStep(g, label, FROM[i], TO[i]); };
        });

        /**
         * 단계 하나를 시작 상태에서 끝까지 재생한다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            setScene(FROM[i]);
            await FLOW[i](g);
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

        /* ===================== 그림자 고정 ===================== */
        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        setScene(1);

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: '암달의 법칙 3D',
        badges: BADGES,
        canvasLabel: '암달의 법칙을 이삿짐 장면으로 보여 주는 3D. 인부가 짐을 나눠 싸는 병렬 구간은 줄어들지만, 엘리베이터 한 대가 짐을 내리는 직렬 구간은 그대로여서 전체 시간 단축에 한계가 있습니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0.5, 4.6, 17.5], t: [0.5, 2.0, 0] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();