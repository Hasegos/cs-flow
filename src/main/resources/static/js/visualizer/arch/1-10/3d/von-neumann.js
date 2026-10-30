/**
 * 폰 노이만 구조 3D 외길 다리 장면 (Three.js r128)
 * 2D 시각화의 "3D 외길 다리" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.vnData)가 먼저 있어야 한다.
 * CPU 섬과 메모리 창고가 다리 하나로만 이어져 있고, 주소 쪽지와 명령 상자와 데이터 상자가 이 다리를 번갈아 건넌다.
 * 장면 수, 자막, 수치는 2D 단계 데이터에서 계산해 2D와 어긋나지 않게 한다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.vnData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;
    const MEM = window.CsFlow.vnData.MEM;
    const STEPS = window.CsFlow.vnData.STEPS;

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x0f0f1a, water: 0x1d3b52, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xd9d2c4, water: 0x8fb8c9, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const COLOR = { addr: 0x2f80ed, instr: 0xff7a2f, data: 0x1d9e75, cu: 0xffc857, alu: 0x8a5cff };
    const PHASE = {
        f: { name: 'FETCH', color: 0xff7a2f },
        d: { name: 'DECODE', color: 0x1d9e75 },
        e: { name: 'EXECUTE', color: 0x8a5cff }
    };
    const COPY = {
        addrHead: '주소 쪽지',
        instrHead: '명령 상자',
        dataHead: '데이터 상자',
        roleInstr: '명령',
        roleData: '데이터',
        cpuTitle: 'CPU 섬',
        memTitle: '메모리 창고 · RAM',
        bridgeTitle: '외길 다리 · 명령과 데이터가 같은 길을 씁니다',
        counterTitle: '다리를 건넌 횟수',
        total: '합계',
        times: '회',
        crossed: '이번 명령에서 다리를 ',
        overview: 'CPU 섬과 메모리 창고는 다리 하나로만 이어져 있습니다. 명령과 데이터가 모두 이 다리를 지나므로, 전송이 몰리면 여기서 병목이 생깁니다.'
    };
    const WATER_Y = -0.1;
    const ISLAND_Y = 0.25;
    const ISLAND_H = 0.7;
    const DECK_Y = 0.56;
    const CELL_X = [2.125, 2.975, 3.825, 4.675];
    const CELL_Y = [2.6, 1.45];
    const CELL_Z = -1.45;
    const PORT_L = new V(-1.4, 0.8, 0);
    const PORT_R = new V(1.4, 0.8, 0);
    const MID_R = new V(2.2, 1.0, 0);
    const CPU_IN = new V(-3.2, 1.0, 0.75);
    const CPU_POS = new V(-3.4, 1.4, 0.3);
    const CU_POS = new V(-4.1, 2.32, -0.4);
    const ALU_POS = new V(-2.7, 2.32, -0.4);
    const SHOTS = {
        overview: [[0.4, 6.8, 14.6], [0, 1.1, 0]],
        wide: [[0.0, 5.6, 13.2], [0.0, 1.0, 0.0]],
        cpu: [[-1.2, 3.8, 6.0], [-3.2, 1.5, -0.2]]
    };

    /* ===================== 2D 데이터에서 계산 ===================== */
    /**
     * 명령어가 시작하는 2D 단계 번호(FETCH-1)를 모두 찾는다. 장면 단계는 이 번호로 나뉜다.
     *
     * @returns 시작 단계 번호 배열
     */
    function instrStarts() {
        const out = [];
        STEPS.forEach(function (s, i) {
            if (s.log.indexOf('[FETCH-1]') === 0) out.push(i);
        });
        return out;
    }

    const STARTS = instrStarts();
    const BADGES = ['OVERVIEW'].concat(STARTS.map(function (st) {
        return MEM[STEPS[st].mh].label.replace(/\s+/g, ' ');
    }));

    /**
     * 장면 번호가 맡는 2D 단계 구간을 돌려준다. 0번 장면(개요)은 빈 구간이다.
     *
     * @param i 장면 번호
     * @returns from(포함)과 to(제외)를 담은 객체
     */
    function segOf(i) {
        if (i === 0) return { from: 0, to: 0 };
        return { from: STARTS[i - 1], to: i < STARTS.length ? STARTS[i] : STEPS.length };
    }

    /**
     * 2D 단계 구간의 버스 전송 횟수를 센다. 주소 쪽지(A), 명령 상자(I), 데이터 상자(D)로 나눈다.
     *
     * @param from 시작 단계 번호(포함)
     * @param to   끝 단계 번호(제외)
     * @returns addr, instr, data 횟수
     */
    function busCount(from, to) {
        const c = { addr: 0, instr: 0, data: 0 };
        for (let i = from; i < to; i++) {
            const b = STEPS[i].bus;
            if (!b) continue;
            if (b.label === 'A') c.addr++;
            else if (b.label === 'I') c.instr++;
            else c.data++;
        }
        return c;
    }

    /**
     * 2D 단계 번호 직전까지 메모리 칸에 적힌 문구를 돌려준다. 데이터 쓰기 단계가 지나면 R1 값이 적힌다.
     *
     * @param upTo 단계 번호(제외)
     * @returns 메모리 칸 수만큼의 문구 배열
     */
    function memTexts(upTo) {
        const t = MEM.map(function (m) { return m.label; });
        for (let i = 0; i < upTo; i++) {
            const b = STEPS[i].bus;
            if (b && b.label === 'D' && b.toMem) t[STEPS[i].mh] = STEPS[i].reg.R1;
        }
        return t;
    }

    /**
     * 2D 단계 번호 직전의 레지스터 값을 돌려준다. 처음이면 첫 단계의 값이다.
     *
     * @param from 단계 번호
     * @returns PC, IR, R1, R2 값 객체
     */
    function regsBefore(from) {
        return from > 0 ? STEPS[from - 1].reg : STEPS[0].reg;
    }

    /**
     * 2D 로그 문장을 "[태그] 본문" 형태에서 태그와 본문으로 나눈다.
     *
     * @param log 2D 로그 문장
     * @returns tag와 text
     */
    function splitLog(log) {
        const end = log.indexOf(']');
        return { tag: log.slice(1, end), text: log.slice(end + 1).trim() };
    }

    /**
     * 장면 구간이 끝났을 때의 요약 자막을 만든다. 구간 안 횟수와 지금까지 누적을 2D 데이터에서 센다.
     *
     * @param seg 구간 객체
     * @returns 자막 문장
     */
    function summaryOf(seg) {
        const g = busCount(seg.from, seg.to);
        const all = busCount(0, seg.to);
        return COPY.crossed + (g.addr + g.instr + g.data) + '번 건넜습니다 (주소 쪽지 ' + g.addr + ' · 명령 상자 ' + g.instr + ' · 데이터 상자 ' + g.data + '). 지금까지 합계 ' + (all.addr + all.instr + all.data) + '번';
    }

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const parts = Object.keys(COPY).map(function (k) { return COPY[k]; });
        MEM.forEach(function (m) { parts.push(m.label, m.addr); });
        Object.keys(PHASE).forEach(function (k) { parts.push(PHASE[k].name); });
        parts.push('PC IR R1 R2 CPU ? — → 0123456789ABCDEFx');
        return parts.join('');
    }

    /* ===================== 캔버스 그리기 도구 ===================== */
    /**
     * 숫자 색을 CSS 색 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색
     * @returns #으로 시작하는 문자열
     */
    function hexCss(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 바탕과 테두리를 그린다.
     *
     * @param c      2D 컨텍스트
     * @param pw     캔버스 폭
     * @param ph     캔버스 높이
     * @param bg     바탕 색
     * @param border 테두리 색
     * @param lw     테두리 굵기
     */
    function paintFrame(c, pw, ph, bg, border, lw) {
        c.fillStyle = bg;
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = border;
        c.lineWidth = lw;
        c.strokeRect(lw / 2, lw / 2, pw - lw, ph - lw);
    }

    /**
     * 글자가 최대 폭에 들어갈 때까지 글꼴 크기를 줄여 글꼴을 설정한다.
     *
     * @param c      2D 컨텍스트
     * @param text   그릴 문자열
     * @param maxW   최대 폭
     * @param size   처음 글꼴 크기
     * @param weight 굵기
     * @param family 글꼴 이름
     */
    function fitText(c, text, maxW, size, weight, family) {
        let s = size;
        c.font = weight + ' ' + s + 'px ' + family;
        while (s > 14 && c.measureText(text).width > maxW) {
            s -= 2;
            c.font = weight + ' ' + s + 'px ' + family;
        }
    }

    /**
     * 쪽지나 상자 표면을 그린다. 머리글이 있으면 위에, 값은 가운데에 적는다.
     *
     * @param head  머리글(없으면 빈 문자열)
     * @param text  값 문구
     * @param color 테두리와 머리글 색
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawCard(head, text, color, c, pw, ph) {
        paintFrame(c, pw, ph, '#fffdf6', hexCss(color), 10);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        if (head) {
            c.fillStyle = hexCss(color);
            c.font = '500 ' + Math.round(ph * 0.17) + 'px ' + SERIF;
            c.fillText(head, pw / 2, ph * 0.24);
        }
        c.fillStyle = INK;
        fitText(c, text, pw - 36, Math.round(ph * 0.36), '700', SERIF);
        c.fillText(text, pw / 2, head ? ph * 0.68 : ph / 2);
    }

    /**
     * 메모리 칸 하나를 그린다. 위에 주소, 가운데에 내용, 아래에 명령 또는 데이터 구분을 적는다.
     *
     * @param i    메모리 칸 번호(2D 메모리 배열의 순서)
     * @param text 칸에 적힌 문구
     * @param c    2D 컨텍스트
     * @param pw   캔버스 폭
     * @param ph   캔버스 높이
     */
    function drawCell(i, text, c, pw, ph) {
        const instr = MEM[i].type === 'i';
        const col = hexCss(instr ? COLOR.instr : COLOR.data);
        paintFrame(c, pw, ph, instr ? '#fbeee2' : '#e3f4ee', col, 8);
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        c.fillStyle = '#6b6358';
        c.font = '700 30px ' + SERIF;
        c.fillText(MEM[i].addr, pw / 2, 50);
        c.fillStyle = INK;
        fitText(c, text, pw - 36, 52, '700', SERIF);
        c.fillText(text, pw / 2, ph * 0.66);
        c.fillStyle = col;
        c.font = '500 24px ' + SERIF;
        c.fillText(instr ? COPY.roleInstr : COPY.roleData, pw / 2, ph - 22);
    }

    /**
     * CPU 섬의 레지스터 표를 그린다. 값은 2D 단계의 reg에서 온다.
     *
     * @param reg   PC, IR, R1, R2 값 객체
     * @param phase 단계 키(f, d, e). 없으면 단계 이름을 쓰지 않는다
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawCpu(reg, phase, c, pw, ph) {
        paintFrame(c, pw, ph, '#fbf8f1', 'rgba(42,38,34,0.5)', 6);
        c.textBaseline = 'alphabetic';
        c.textAlign = 'left';
        c.fillStyle = INK;
        c.font = '700 26px ' + SERIF;
        c.fillText(COPY.cpuTitle, 24, 40);
        if (phase) {
            c.textAlign = 'right';
            c.fillStyle = hexCss(PHASE[phase].color);
            c.font = '700 24px ' + SERIF;
            c.fillText(PHASE[phase].name, pw - 24, 40);
        }
        const rows = [['PC', reg.PC, 0, 0], ['IR', reg.IR, 1, 0], ['R1', reg.R1, 0, 1], ['R2', reg.R2, 1, 1]];
        rows.forEach(function (r) {
            const x = 26 + r[2] * (pw / 2);
            const y = 88 + r[3] * 78;
            c.textAlign = 'left';
            c.fillStyle = '#6b6358';
            c.font = '500 24px ' + SERIF;
            c.fillText(r[0], x, y);
            c.fillStyle = INK;
            fitText(c, r[1], pw / 2 - 56, 40, '700', SERIF);
            c.fillText(r[1], x, y + 42);
        });
    }

    /**
     * 다리를 건넌 횟수 카드를 그린다. 주소 쪽지, 명령 상자, 데이터 상자별 횟수와 합계를 적는다.
     *
     * @param cnt 횟수 객체(addr, instr, data)
     * @param c   2D 컨텍스트
     * @param pw  캔버스 폭
     * @param ph  캔버스 높이
     */
    function drawCounter(cnt, c, pw, ph) {
        paintFrame(c, pw, ph, '#fbf8f1', 'rgba(42,38,34,0.5)', 6);
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        c.fillStyle = '#6b6358';
        c.font = '500 26px ' + SERIF;
        c.fillText(COPY.counterTitle, 28, 50);
        const cols = [[COPY.addrHead, cnt.addr, COLOR.addr], [COPY.instrHead, cnt.instr, COLOR.instr], [COPY.dataHead, cnt.data, COLOR.data]];
        cols.forEach(function (col, i) {
            const x = pw * (i + 0.5) / 3;
            c.textAlign = 'center';
            c.fillStyle = hexCss(col[2]);
            c.font = '700 24px ' + SERIF;
            c.fillText(col[0], x, 104);
            c.fillStyle = INK;
            c.font = '700 92px ' + HAND;
            c.fillText(String(col[1]), x, 200);
        });
        const total = cnt.addr + cnt.instr + cnt.data;
        c.textAlign = 'center';
        c.fillStyle = '#b5532e';
        c.font = '500 24px ' + SERIF;
        c.fillText(COPY.total + ' ' + total + COPY.times, pw / 2, 246);
    }

    /* ===================== 위치 ===================== */
    /**
     * 메모리 칸의 중심 좌표를 돌려준다. 0번부터 위쪽 줄 왼쪽에서 오른쪽으로, 그다음 줄도 같다.
     *
     * @param i 메모리 칸 번호
     * @returns 좌표
     */
    function cellPos(i) {
        return new V(CELL_X[i % 4], CELL_Y[Math.floor(i / 4)], CELL_Z);
    }

    /**
     * 메모리 칸 앞에서 상자나 쪽지가 멈추는 좌표를 돌려준다.
     *
     * @param i 메모리 칸 번호
     * @returns 좌표
     */
    function cellFront(i) {
        return cellPos(i).add(new V(0, 0, 0.3));
    }

    /**
     * CPU 섬에서 메모리 칸까지 가는 길(다리를 한 번 건넘)의 점들을 돌려준다.
     *
     * @param i 메모리 칸 번호
     * @returns 점 배열
     */
    function routeOut(i) {
        return [CPU_IN, PORT_L, PORT_R, MID_R, cellFront(i)];
    }

    /**
     * 메모리 칸에서 CPU 섬까지 돌아오는 길(다리를 한 번 건넘)의 점들을 돌려준다.
     *
     * @param i 메모리 칸 번호
     * @returns 점 배열
     */
    function routeIn(i) {
        return [cellFront(i), MID_R, PORT_R, PORT_L, CPU_IN];
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. CPU 섬, 외길 다리, 메모리 창고, 쪽지와 상자, 횟수 카드를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, busy, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const glow = eng.glow;
        const ink = eng.ink;
        const easeInOut = eng.api.easeInOut;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(THEMES.light.bg);
        scene.fog = new THREE.Fog(THEMES.light.bg, 18, 40);

        /* ===================== 재료와 빛 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
        sun.position.set(-6, 12, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);

        const waterM = new THREE.MeshLambertMaterial({ color: THEMES.light.water });
        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#e6d6b4', 0.22, 70, 2) });
        const stoneM = new THREE.MeshLambertMaterial({ color: 0x6f6455 });
        const woodM = new THREE.MeshLambertMaterial({ color: 0xb98a52 });
        const darkWoodM = new THREE.MeshLambertMaterial({ color: 0x6e5030 });
        const slabM = new THREE.MeshLambertMaterial({ color: 0x9c7a4c });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @returns 만든 메시
         */
        function slab(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @returns mesh와 redraw 함수
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = canvas2d(pw, ph);
            const tex = texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리는 함수(컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                invalidate();
            }
            redraw(draw);
            return { mesh: mesh, redraw: redraw };
        }

        /**
         * 벽에 거는 안내판을 만든다. 글자가 넘치면 글꼴을 줄인다.
         */
        function sign(text, x, y, z, w, h, color) {
            const p = panel(w, h, 1024, Math.round(1024 * h / w), function (c, pw, ph) {
                paintFrame(c, pw, ph, '#f6ecd6', hexCss(color), 14);
                c.fillStyle = INK;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                fitText(c, text, pw * 0.9, Math.round(ph * 0.5), '700', SERIF);
                c.fillText(text, pw / 2, ph / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
        }

        /**
         * 다리를 건너는 물건(쪽지 또는 상자)을 만든다. 처음에는 숨겨 둔다.
         *
         * @param w       라벨 폭
         * @param h       라벨 높이
         * @param pw      캔버스 폭
         * @param ph      캔버스 높이
         * @param color   테두리 색
         * @param withBox 상자 몸체를 붙일지 여부
         * @returns group, label, color
         */
        function makeToken(w, h, pw, ph, color, withBox) {
            const group = new THREE.Group();
            const label = panel(w, h, pw, ph, function (c, cw, ch) { drawCard('', '', color, c, cw, ch); }, true);
            if (withBox) {
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.28), solidM(color));
                ink(box);
                group.add(box);
                label.mesh.position.z = 0.145;
            }
            group.add(label.mesh);
            group.visible = false;
            scene.add(group);
            return { group: group, label: label, color: color };
        }

        /**
         * 물건의 라벨 그림을 바꾼다.
         *
         * @param tok  makeToken이 만든 물건
         * @param head 머리글(없으면 빈 문자열)
         * @param text 값 문구
         */
        function paintTok(tok, head, text) {
            tok.label.redraw(function (c, pw, ph) { drawCard(head, text, tok.color, c, pw, ph); });
        }

        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms   기준 밀리초
         * @param fn   값 적용 함수(0에서 1)
         * @param ease 이징 함수(선택)
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        const pings = [];
        for (let i = 0; i < 3; i++) {
            const gl = glow(0xffffff, 0.6);
            gl.material.opacity = 0;
            scene.add(gl);
            pings.push(gl);
        }
        let pingIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색
         * @param size  크기
         * @param ms    기준 밀리초
         * @returns 완료 Promise
         */
        function ping(pos, color, size, ms) {
            const gl = pings[pingIdx++ % pings.length];
            gl.position.copy(pos);
            gl.material.color.setHex(color);
            gl.scale.set(size, size, 1);
            return tw(ms, function (p) { gl.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /**
         * 물건을 지나갈 점들을 이은 곡선을 따라 옮긴다.
         *
         * @param o   옮길 객체
         * @param pts 지나갈 점 배열
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function along(o, pts, ms) {
            const curve = new THREE.CatmullRomCurve3(pts);
            return tw(ms, function (p) { curve.getPoint(p, o.position); }, easeInOut);
        }

        /**
         * 물건을 길을 따라 옮긴다. 장면이 끝났으면 false를 돌려준다.
         *
         * @param g   장면 세대 번호
         * @param tok 옮길 물건
         * @param pts 지나갈 점 배열
         * @param ms  기준 밀리초
         * @returns 단계가 아직 유효하면 true
         */
        async function moveTok(g, tok, pts, ms) {
            tok.group.position.copy(pts[0]);
            tok.group.visible = true;
            await along(tok.group, pts, ms);
            if (!alive(g)) return false;
            tok.group.visible = false;
            return true;
        }

        /**
         * 카메라를 샷에 맞춘다. 화면 비율에 따라 뒤로 물린다.
         *
         * @param key SHOTS의 키
         */
        function view(key) {
            const s = SHOTS[key];
            const aspect = eng.stage.clientWidth / Math.max(1, eng.stage.clientHeight);
            const k = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect);
            const t = new V(s[1][0], s[1][1], s[1][2]);
            const p = new V(s[0][0], s[0][1], s[0][2]).sub(t).multiplyScalar(k).add(t);
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /* ===================== 건물: CPU 섬 ===================== */
        slab(4.4, ISLAND_H, 4.4, -3.5, ISLAND_Y, 0, slabM, true);
        slab(4.4, ISLAND_H, 4.4, 3.5, ISLAND_Y, 0, stoneM, true);

        const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), waterM);
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_Y;
        water.receiveShadow = true;
        scene.add(water);

        slab(2.0, 1.6, 1.2, -3.4, 1.4, -0.4, solidM(0x2c2a36), true);
        const cuLamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), solidM(COLOR.cu));
        cuLamp.position.copy(CU_POS);
        scene.add(cuLamp);
        const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 20), solidM(COLOR.alu));
        gear.position.copy(ALU_POS);
        ink(gear);
        scene.add(gear);
        const cpuPanel = panel(1.7, 1.2, 340, 240, function (c, pw, ph) { drawCpu(STEPS[0].reg, null, c, pw, ph); }, true);
        cpuPanel.mesh.position.set(-3.4, 1.45, 0.21);
        scene.add(cpuPanel.mesh);
        sign(COPY.cpuTitle + ' · 레지스터', -3.4, 2.75, 0.22, 2.2, 0.3, COLOR.alu);

        /**
         * CPU 레지스터 표를 다시 그린다.
         *
         * @param reg   레지스터 값 객체
         * @param phase 단계 키(없으면 null)
         */
        function paintCpu(reg, phase) {
            cpuPanel.redraw(function (c, pw, ph) { drawCpu(reg, phase, c, pw, ph); });
        }

        /* ===================== 다리 ===================== */
        for (let k = 0; k < 9; k++) {
            slab(0.3, 0.08, 0.9, -1.44 + k * 0.36, DECK_Y, 0, woodM, true);
        }
        slab(3.0, 0.22, 0.06, 0, 0.71, -0.45, darkWoodM, true);
        slab(3.0, 0.22, 0.06, 0, 0.71, 0.45, darkWoodM, true);
        [-0.9, 0.9].forEach(function (x) {
            [-0.35, 0.35].forEach(function (z) {
                slab(0.14, 0.7, 0.14, x, 0.25, z, darkWoodM, false);
            });
        });
        sign(COPY.bridgeTitle, 0, 2.7, -0.2, 3.0, 0.36, COLOR.instr);

        /* ===================== 메모리 창고 ===================== */
        slab(3.6, 2.9, 0.25, 3.4, 2.05, -1.6, wallM, true);
        slab(3.9, 0.15, 1.5, 3.4, 3.575, -1.2, slabM, true);
        sign(COPY.memTitle, 3.4, 3.12, -1.44, 2.4, 0.3, COLOR.data);

        let cellText = MEM.map(function (m) { return m.label; });
        const cellPanels = [];

        /**
         * 메모리 칸 하나의 그림을 현재 문구로 다시 그린다.
         *
         * @param i    메모리 칸 번호
         * @param text 칸에 적을 문구
         */
        function setCell(i, text) {
            cellText[i] = text;
            cellPanels[i].redraw(function (c, pw, ph) { drawCell(i, text, c, pw, ph); });
        }

        MEM.forEach(function (m, i) {
            const p = panel(0.7, 0.5, 256, 180, function (c, pw, ph) { drawCell(i, cellText[i], c, pw, ph); }, true);
            p.mesh.position.copy(cellPos(i));
            scene.add(p.mesh);
            cellPanels.push(p);
        });

        /* ===================== 쪽지와 상자 ===================== */
        const addrTok = makeToken(0.66, 0.38, 256, 148, COLOR.addr, false);
        const instrTok = makeToken(0.32, 0.2, 256, 144, COLOR.instr, true);
        const dataTok = makeToken(0.32, 0.2, 256, 144, COLOR.data, true);

        const counter = panel(1.7, 0.85, 512, 256, function (c, pw, ph) { drawCounter(busCount(0, 0), c, pw, ph); }, true);
        counter.mesh.position.set(0, 1.95, -0.2);
        scene.add(counter.mesh);

        /**
         * 다리를 건넌 횟수 카드를 바꾼다.
         *
         * @param cnt 횟수 객체
         */
        function setCounter(cnt) {
            counter.redraw(function (c, pw, ph) { drawCounter(cnt, c, pw, ph); });
        }

        const gearSpinTime = 900;

        /* ===================== 장면 진행 ===================== */
        /**
         * 메모리 주소 쪽지를 CPU에서 메모리 칸까지 보낸다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function sendAddr(g, s) {
            paintTok(addrTok, COPY.addrHead, MEM[s.mh].addr);
            if (!await moveTok(g, addrTok, routeOut(s.mh), 1500)) return false;
            ping(cellFront(s.mh), COLOR.addr, 0.9, 500);
            return true;
        }

        /**
         * 명령 상자를 메모리 칸에서 CPU까지 가져온다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function carryInstr(g, s) {
            paintTok(instrTok, '', MEM[s.mh].label);
            if (!await moveTok(g, instrTok, routeIn(s.mh), 1600)) return false;
            ping(CPU_IN, COLOR.instr, 0.8, 500);
            return true;
        }

        /**
         * 데이터 상자를 메모리 칸에서 CPU까지 가져온다. 칸의 현재 값을 싣는다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function readData(g, s) {
            const i = s.mh;
            paintTok(dataTok, '', cellText[i]);
            ping(cellFront(i), COLOR.data, 0.9, 500);
            await wait(400);
            if (!alive(g)) return false;
            if (!await moveTok(g, dataTok, routeIn(i), 1600)) return false;
            ping(CPU_IN, COLOR.data, 0.8, 500);
            return true;
        }

        /**
         * 레지스터 값을 데이터 상자에 싣고 CPU에서 메모리 칸까지 보낸 뒤 칸의 내용을 바꾼다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function writeData(g, s) {
            const i = s.mh;
            paintTok(dataTok, '', s.reg.R1);
            if (!await moveTok(g, dataTok, routeOut(i), 1600)) return false;
            setCell(i, s.reg.R1);
            ping(cellFront(i), COLOR.data, 0.9, 600);
            return true;
        }

        /**
         * 버스 전송 단계 하나를 재생한다. 주소 쪽지는 가고, 명령과 데이터 상자는 오간다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function transfer(g, s) {
            if (s.bus.label === 'A') return sendAddr(g, s);
            if (s.bus.label === 'I') return carryInstr(g, s);
            if (s.bus.toMem) return writeData(g, s);
            return readData(g, s);
        }

        /**
         * 2D 단계 하나를 장면으로 재생한다. 버스 전송이면 다리를 건너고, 아니면 CPU 안을 비춘다.
         *
         * @param g 장면 세대 번호
         * @param k 2D 단계 번호
         * @returns 단계가 아직 유효하면 true
         */
        async function micro(g, k) {
            const s = STEPS[k];
            const cut = splitLog(s.log);
            say(cut.tag, cut.text);
            paintCpu(k > 0 ? STEPS[k - 1].reg : s.reg, s.ph);
            if (s.bus) {
                view('wide');
                if (!await transfer(g, s)) return false;
            } else if (s.done) {
                view('cpu');
                ping(CPU_POS, COLOR.cu, 1.0, 700);
                await wait(600);
            } else if (s.ph === 'd') {
                view('cpu');
                ping(CU_POS, COLOR.cu, 0.9, 700);
                await wait(600);
            } else {
                view('cpu');
                ping(ALU_POS, COLOR.alu, 1.0, 700);
                await tw(gearSpinTime, function (p) { gear.rotation.y = p * Math.PI * 2; });
            }
            if (!alive(g)) return false;
            paintCpu(s.reg, s.ph);
            setCounter(busCount(0, k + 1));
            return true;
        }

        /**
         * 건물을 장면 단계의 시작 상태로 되돌린다. 단계를 시작하거나 되감을 때마다 부른다.
         *
         * @param i 장면 번호
         */
        function reset(i) {
            eng.clearTweens();
            const seg = segOf(i);
            memTexts(seg.from).forEach(function (t, k) { setCell(k, t); });
            paintCpu(regsBefore(seg.from), null);
            setCounter(busCount(0, seg.from));
            [addrTok, instrTok, dataTok].forEach(function (tok) { tok.group.visible = false; });
            pings.forEach(function (gl) { gl.material.opacity = 0; });
            gear.rotation.y = 0;
            invalidate();
        }

        /**
         * 장면 단계 하나를 처음 상태에서 끝까지 재생한다.
         *
         * @param i 장면 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset(i);
            if (i === 0) {
                view('overview');
                say('Overview', COPY.overview);
                return;
            }
            const seg = segOf(i);
            for (let k = seg.from; k < seg.to; k++) {
                if (!await micro(g, k)) return;
            }
            view('wide');
            say('Result', summaryOf(seg));
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 물, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            waterM.color.setHex(th.water);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        reset(0);

        return {
            play: play,
            busy: function () { return false; },
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Von Neumann 3D',
        badges: BADGES,
        canvasLabel: '폰 노이만 구조를 외길 다리 단면으로 보여 주는 3D 장면. CPU 섬과 메모리 창고가 다리 하나로 이어져 있고, 명령 상자와 데이터 상자가 번갈아 건넙니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();