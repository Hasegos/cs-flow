/**
 * 토픽 시각화를 9:16 영상으로 녹화한다.
 * 페이지의 시계(performance.now, Date.now, requestAnimationFrame, setTimeout, setInterval)를 가짜로 바꿔
 * 프레임 간격만큼만 진행시키고 한 장씩 찍으므로 PC가 느려도 영상 속도가 일정하다.
 * (CDP 가상 시간은 큰 화면 스크린샷이 간헐적으로 멈춰서 쓰지 않는다)
 *
 * 사용: node tools/shorts/record.mjs <script.json> [--list] [--frames N] [--base URL]
 *   --list      버튼 목록과 첫 화면 스크린샷만 만든다 (스크립트를 쓸 때 쓴다)
 *   --frames N  앞의 N프레임만 찍는다 (레이아웃 확인용)
 *   --trace     속도 버튼이 잠기고 풀리는 시각(재생 시작과 끝)을 출력한다 (타임라인 시간을 정할 때 쓴다)
 *   --base URL  운영 대신 다른 주소를 쓴다 (예: http://localhost:8082)
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_PORT) || 9341;
const W = 540;
const H = 960;
const DPR = 2;

const args = process.argv.slice(2);
const scriptPath = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const flag = (n) => args.includes('--' + n);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
if (!scriptPath) { console.error('사용: node tools/shorts/record.mjs <script.json> [--list] [--frames N] [--base URL]'); process.exit(1); }

const cfg = JSON.parse(readFileSync(scriptPath, 'utf8'));
const base = (opt('base') || 'https://csflow.kr').replace(/\/$/, '');
const outDir = join(ROOT, 'shorts-out', cfg.id);
const framesDir = join(outDir, 'frames');
const fps = cfg.fps || 30;
const stepMs = 1000 / fps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 시간 안에 끝나지 않으면 어디서 멈췄는지 알려 주고 실패한다.
 *
 * @param p 기다릴 Promise
 * @param what 멈춘 곳을 가리키는 이름
 * @param ms 제한 시간
 */
const within = (p, what, ms = 30000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과: ' + what)), ms))]);

/* ===================== 가짜 시계 ===================== */

/** 문서가 열릴 때 주입한다. start() 전에는 원래 함수 그대로 동작한다. */
const CLOCK = `(function () {
    var oRAF = window.requestAnimationFrame.bind(window), oCAF = window.cancelAnimationFrame.bind(window);
    var oST = window.setTimeout.bind(window), oCT = window.clearTimeout.bind(window);
    var oSI = window.setInterval.bind(window), oCI = window.clearInterval.bind(window);
    var oPN = performance.now.bind(performance), oDN = Date.now.bind(Date);
    var tm = window.__tm = { on: false, t: 0, base: 0, dbase: 0, id: 1000000, rafs: [], timers: [] };
    performance.now = function () { return tm.on ? tm.base + tm.t : oPN(); };
    Date.now = function () { return tm.on ? tm.dbase + tm.t : oDN(); };
    window.requestAnimationFrame = function (cb) {
        if (!tm.on) return oRAF(cb);
        var id = ++tm.id; tm.rafs.push({ id: id, cb: cb }); return id;
    };
    window.cancelAnimationFrame = function (id) {
        if (id > 1000000) tm.rafs = tm.rafs.filter(function (r) { return r.id !== id; }); else oCAF(id);
    };
    function addTimer(fn, ms, args, iv) {
        var id = ++tm.id; ms = Math.max(0, +ms || 0);
        tm.timers.push({ id: id, at: tm.t + ms, fn: fn, args: args, iv: iv ? Math.max(1, ms) : 0 });
        return id;
    }
    window.setTimeout = function (fn, ms) {
        if (!tm.on || typeof fn !== 'function') return oST.apply(window, arguments);
        return addTimer(fn, ms, [].slice.call(arguments, 2), false);
    };
    window.setInterval = function (fn, ms) {
        if (!tm.on || typeof fn !== 'function') return oSI.apply(window, arguments);
        return addTimer(fn, ms, [].slice.call(arguments, 2), true);
    };
    window.clearTimeout = function (id) {
        if (id > 1000000) tm.timers = tm.timers.filter(function (x) { return x.id !== id; }); else oCT(id);
    };
    window.clearInterval = function (id) {
        if (id > 1000000) tm.timers = tm.timers.filter(function (x) { return x.id !== id; }); else oCI(id);
    };
    tm.start = function () { tm.base = oPN(); tm.dbase = oDN(); tm.t = 0; tm.on = true; };
    function runDue() {
        for (var guard = 0; guard < 10000; guard++) {
            var best = null;
            for (var i = 0; i < tm.timers.length; i++) {
                var x = tm.timers[i];
                if (x.at <= tm.t && (!best || x.at < best.at)) best = x;
            }
            if (!best) return;
            if (best.iv) best.at += best.iv; else tm.timers.splice(tm.timers.indexOf(best), 1);
            try { best.fn.apply(window, best.args); } catch (e) { console.error(e); }
        }
    }
    tm.tick = function (ms) {
        var end = tm.t + ms;
        while (tm.t < end) {
            tm.t = Math.min(end, tm.t + 16.667);
            runDue();
            var q = tm.rafs; tm.rafs = [];
            for (var i = 0; i < q.length; i++) { try { q[i].cb(tm.base + tm.t); } catch (e) { console.error(e); } }
        }
    };
})();`;

/* ===================== Chrome 연결 ===================== */

const prof = mkdtempSync(join(tmpdir(), 'shorts-'));
const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', 'about:blank'
], { stdio: 'ignore' });

/**
 * 크롬이 열리면 첫 페이지 탭에 WebSocket으로 연결한다.
 *
 * @returns send, once, ev 함수 묶음
 */
async function connect() {
    let targets;
    for (let i = 0; i < 60; i++) {
        try { targets = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); break; } catch { await sleep(200); }
    }
    if (!targets) throw new Error('크롬에 연결하지 못했다');
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0;
    const pend = new Map();
    const waiters = [];
    ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
        else if (d.method) {
            for (const w of waiters.slice()) {
                if (w.m === d.method) { waiters.splice(waiters.indexOf(w), 1); w.r(d.params); }
            }
        }
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const once = (m) => new Promise((r) => waiters.push({ m, r }));
    const ev = async (expression) => {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.result?.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text));
        return res.result?.result?.value;
    };
    return { send, once, ev };
}

/* ===================== 무대 ===================== */

/**
 * 페이지를 540x960 무대로 바꾼다. 시각화 박스만 남기고 훅, 자막, 로고 영역을 얹는다.
 *
 * @param ev 페이지 평가 함수
 */
async function buildStage(ev) {
    const viz = cfg.viz || {};
    const top = viz.top ?? 168;
    const height = viz.height ?? 540;
    const hide = (cfg.hide || []).map((s) => s + '{display:none!important}').join('');
    const css = `
html,body{overflow:hidden!important;background:#0c0c14!important;margin:0!important}
body *{visibility:hidden!important}
#visualizer-container,#visualizer-container *{visibility:visible!important}
#visualizer-container{position:fixed!important;left:8px!important;top:${top}px!important;width:${W - 16}px!important;height:${height}px!important;margin:0!important;overflow:hidden!important;box-sizing:border-box!important;z-index:5!important;border-radius:14px!important}
.sx,.sx *{visibility:visible!important}
.sx{position:fixed;left:0;width:${W}px;z-index:99;font-family:'Noto Sans KR',sans-serif;color:#f1f1f7;box-sizing:border-box}
.sx-top{top:0;height:${top - 8}px;padding:22px 24px 0}
.sx-brand{font:700 15px 'JetBrains Mono',monospace;letter-spacing:.04em;color:#8b86ff;margin-bottom:10px}
.sx-brand b{color:#f1f1f7}
.sx-hook{font-weight:900;font-size:30px;line-height:1.28;letter-spacing:-.01em;white-space:pre-line}
.sx-cap{top:${top + height + 12}px;height:${H - top - height - 12 - 70}px;padding:0 28px;display:flex;align-items:center;justify-content:center;text-align:center}
.sx-cap span{font-weight:700;font-size:27px;line-height:1.4;white-space:pre-line;opacity:0}
.sx-cap span.on{opacity:1}
.sx-foot{bottom:0;height:70px;display:flex;align-items:center;justify-content:center;gap:12px;border-top:1px solid #23233a;background:#0c0c14}
.sx-foot .u{font:700 20px 'JetBrains Mono',monospace;color:#8b86ff}
.sx-foot .c{font-size:15px;color:#a9a9bd;opacity:0}
.sx-foot .c.on{opacity:1}
${hide}${cfg.css || ''}`;
    await ev(`(function(){
        var st=document.createElement('style');st.textContent=${JSON.stringify(css)};document.head.appendChild(st);
        function mk(c,h){var d=document.createElement('div');d.className='sx '+c;d.innerHTML=h;document.body.appendChild(d);return d;}
        mk('sx-top','<div class="sx-brand"><b>CS</b> Flow</div><div class="sx-hook"></div>').querySelector('.sx-hook').textContent=${JSON.stringify(cfg.hook || '')};
        mk('sx-cap','<span></span>');
        mk('sx-foot','<span class="u">csflow.kr</span><span class="c"></span>');
        var c=document.getElementById('visualizer-container');
        for(var e=c.parentElement;e&&e!==document.documentElement;e=e.parentElement){
            ['transform','filter','perspective','backdrop-filter','animation','will-change','contain','content-visibility'].forEach(function(p){e.style.setProperty(p,p==='will-change'||p==='contain'?'auto':'none','important');});
            e.style.setProperty('contain','none','important');
        }
        window.scrollTo(0,0);
    })()`);
}

/**
 * 자막과 하단 안내 문구를 바꾼다.
 *
 * @param ev 페이지 평가 함수
 * @param caption 자막, null이면 그대로 둔다
 * @param cta 하단 안내 문구, null이면 그대로 둔다
 */
async function setText(ev, caption, cta) {
    await ev(`(function(){
        var s=document.querySelector('.sx-cap span'),c=document.querySelector('.sx-foot .c');
        var cap=${JSON.stringify(caption)},cta=${JSON.stringify(cta)};
        if(cap!==null){s.classList.remove('on');if(cap){s.textContent=cap;s.classList.add('on');}}
        if(cta!==null){c.textContent=cta;c.classList.toggle('on',!!cta);}
    })()`);
}

/**
 * 타임라인의 동작 하나를 실행한다. (항목에 rate를 쓰면 그 시각부터 페이지 시간을 rate배로 빨리 돌린다)
 *
 * @param ev 페이지 평가 함수
 * @param op 동작: click(글자), clickSel(CSS), speed(숫자), eval(코드)
 */
async function runOp(ev, op) {
    const scope = "document.querySelector('#visualizer-container')";
    if (op.click) {
        const ok = await ev(`(function(){var b=[].slice.call(${scope}.querySelectorAll('button')).filter(function(x){return x.textContent.trim().indexOf(${JSON.stringify(op.click)})>=0&&!x.disabled;})[${op.nth || 0}];if(!b)return false;b.click();return true;})()`);
        if (!ok) console.warn('  ! 버튼 없음 또는 비활성:', op.click);
    } else if (op.clickSel) {
        const ok = await ev(`(function(){var b=${scope}.querySelectorAll(${JSON.stringify(op.clickSel)})[${op.nth || 0}];if(!b)return false;b.click();return true;})()`);
        if (!ok) console.warn('  ! 요소 없음:', op.clickSel);
    } else if (op.speed) {
        await runOp(ev, { click: op.speed + 'x' });
    } else if (op.eval) {
        await ev(op.eval);
    }
}

/* ===================== 본체 ===================== */

const { send, once, ev } = await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });

try {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: base + cfg.path });
    await loaded;
    await sleep(1500);
    if (cfg.tab) await ev(`document.querySelector('[data-tab="${cfg.tab}"]').click()`);
    await sleep(1200);

    for (const op of cfg.prep || []) {
        await runOp(ev, op);
        await sleep(op.wait ?? 600);
    }
    await sleep(cfg.settle ?? 1500);

    if (flag('list')) {
        mkdirSync(outDir, { recursive: true });
        console.log(await ev(`JSON.stringify([].slice.call(document.querySelectorAll('#visualizer-container button')).map(function(b){return [b.className.slice(0,60),b.textContent.trim().slice(0,16),b.disabled]}))`));
        console.log(await ev(`(function w(e,d){var o='';if(d>4)return o;for(var i=0;i<e.children.length;i++){var c=e.children[i];if(!c.className||typeof c.className!=='string')continue;o+=new Array(d+1).join('  ')+c.tagName.toLowerCase()+'.'+c.className.split(' ')[0]+' ; '+w(c,d+1);}return o;})(document.getElementById('visualizer-container'),0)`));
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(outDir, 'list.png'), Buffer.from(shot.result.data, 'base64'));
        console.log('저장:', join(outDir, 'list.png'));
    } else {
        await buildStage(ev);
        if (existsSync(framesDir)) rmSync(framesDir, { recursive: true, force: true });
        mkdirSync(framesDir, { recursive: true });

        const total = Math.round((cfg.duration / 1000) * fps);
        const frames = opt('frames') ? Math.min(total, Number(opt('frames'))) : total;
        const timeline = (cfg.timeline || []).filter((e) => !e.when).sort((a, b) => a.t - b.t);
        const triggers = (cfg.timeline || []).filter((e) => e.when).map((e) => ({ e, at: null, done: false }));
        let ti = 0;
        let vt = 0;
        let traced = null;
        let rate = 1;
        let tracedCap = '';
        const t0 = Date.now();

        /**
         * 타임라인 항목 하나를 적용한다: 배속, 자막, 동작.
         *
         * @param e 타임라인 항목
         */
        const apply = async (e) => {
            if (e.rate) rate = e.rate;
            if ('caption' in e || 'cta' in e) await setText(ev, 'caption' in e ? e.caption : null, 'cta' in e ? e.cta : null);
            for (const op of e.do || []) await runOp(ev, op);
        };

        await ev('__tm.start()');
        for (let f = 0; f < frames; f++) {
            const t = f * stepMs;
            while (ti < timeline.length && timeline[ti].t <= t) await apply(timeline[ti++]);
            const want = Math.round((f + 1) * stepMs) - vt;
            if (want > 0) {
                await ev('__tm.tick(' + want * rate + ')');
                vt += want;
            }
            for (const tr of triggers) {
                if (tr.done) continue;
                if (tr.at === null) {
                    const w = tr.e.when;
                    const hit = await ev(`(function(){var x=document.querySelector(${JSON.stringify(w.sel)});if(!x)return false;var s=x.textContent.trim();return ${w.startsWith ? 's.indexOf(' + JSON.stringify(w.startsWith) + ')===0' : 's===' + JSON.stringify(w.text)};})()`);
                    if (hit) tr.at = t;
                }
                if (tr.at !== null && t >= tr.at + (tr.e.delay || 0)) { tr.done = true; await apply(tr.e); }
            }
            if (flag('trace') && f % 3 === 0) {
                const on = await ev(`[].slice.call(document.querySelectorAll('#visualizer-container button')).some(function(x){return /^[123]x$/.test(x.textContent.trim())&&x.disabled;})`);
                const cap3d = await ev(`(function(){var c=document.querySelector('.mem-hier3d__caption');return c?c.textContent.trim().slice(0,60):''})()`);
                if (cap3d && cap3d !== tracedCap) { console.log('  [trace] ' + (f * stepMs / 1000).toFixed(1) + 's 3D 자막: ' + cap3d); tracedCap = cap3d; }
                if (on !== traced) { console.log('  [trace] ' + (f * stepMs / 1000).toFixed(1) + 's ' + (on ? '재생 시작' : '재생 끝')); traced = on; }
            }
            const shot = await within(send('Page.captureScreenshot', { format: 'jpeg', quality: 92 }), '스크린샷 f=' + f);
            writeFileSync(join(framesDir, 'f' + String(f).padStart(5, '0') + '.jpg'), Buffer.from(shot.result.data, 'base64'));
            if (f % fps === 0) process.stdout.write('\r' + f + '/' + frames + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
        }
        process.stdout.write('\n');

        if (!opt('frames')) {
            const mp4 = join(outDir, cfg.id + '.mp4');
            const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(framesDir, 'f%05d.jpg'),
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
            if (r.status !== 0) throw new Error('ffmpeg 실패');
            rmSync(framesDir, { recursive: true, force: true });
            console.log('영상:', mp4);
        } else {
            console.log('프레임:', framesDir);
        }
    }
} finally {
    chrome.kill();
    try { rmSync(prof, { recursive: true, force: true }); } catch { /* 크롬이 아직 잡고 있으면 무시 */ }
}
process.exit(0);