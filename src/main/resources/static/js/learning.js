/**
 * 학습 진행도 / 북마크
 */
(function () {
    'use strict';

    var storage = window.CsFlow && window.CsFlow.storage;
    if (!storage) return;

    var STORAGE_KEY = 'csflow-learn';
    var MAX_TOPICS  = 1000;
    var SLUG_RE     = /^[a-z0-9-]{1,100}$/;
    var SUBJECT_RE  = /^[a-z]+$/;

    /* ===================== 저장소 ===================== */
    function isValidSlug(slug) {
        return typeof slug === 'string' && SLUG_RE.test(slug);
    }

    function emptyData() {
        return { v: 1, last: null, topics: Object.create(null) };
    }

    function sanitize(raw) {
        var out = emptyData();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
        if (isValidSlug(raw.last)) out.last = raw.last;

        var src = raw.topics;
        if (!src || typeof src !== 'object' || Array.isArray(src)) return out;

        var keys = Object.keys(src);
        var kept = 0;
        for (var i = 0; i < keys.length && kept < MAX_TOPICS; i++) {
            var slug = keys[i];
            var rec  = src[slug];
            if (!isValidSlug(slug) || !rec || typeof rec !== 'object') continue;
            if (rec.st !== 'progress' && rec.st !== 'done') continue;
            out.topics[slug] = {
                st: rec.st,
                bm: rec.bm === true,
                t : (typeof rec.t === 'number' && isFinite(rec.t)) ? rec.t : 0
            };
            kept++;
        }
        return out;
    }

    var available = storage.available;

    function read() {
        return sanitize(storage.getJSON(STORAGE_KEY));
    }

    function write(data) {
        storage.setJSON(STORAGE_KEY, data);
    }

    function clear() {
        storage.remove(STORAGE_KEY);
    }

    function loadTopicIndex() {
        var holder = document.getElementById('topic-index');
        if (!holder) return [];
        var list;
        try {
            list = JSON.parse(holder.getAttribute('data-topics') || '[]');
        } catch (e) {
            return [];
        }
        if (!Array.isArray(list)) return [];
        return list.filter(function (t) {
            return t && isValidSlug(t.slug) && typeof t.title === 'string'
                && typeof t.subjectSlug === 'string' && SUBJECT_RE.test(t.subjectSlug);
        });
    }

    window.CsFlow = window.CsFlow || {};
    window.CsFlow.learning = {
        available  : available,
        isValidSlug: isValidSlug,
        sanitize   : sanitize,
        read       : read,
        write      : write,
        clear      : clear,
        loadTopicIndex: loadTopicIndex
    };

    /* ===================== 토픽 페이지 ===================== */
    var likeBtn = document.querySelector('.topic-like');
    if (!available || !likeBtn) return;

    var topicSlug = likeBtn.getAttribute('data-topic-slug');
    if (!isValidSlug(topicSlug)) return;

    function update(mutator) {
        var data = read();
        var rec  = data.topics[topicSlug] || { st: 'progress', bm: false, t: 0 };
        mutator(rec);
        data.topics[topicSlug] = rec;
        data.last = topicSlug;
        write(data);
        return rec;
    }

    function quizAllCorrect() {
        var quiz = window.CsFlow.quiz;
        return !!quiz && quiz.isAllCorrect();
    }

    /* ===================== 버튼 ===================== */
    var SVG_NS = 'http://www.w3.org/2000/svg';

    function bookmarkIcon() {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('class', 'topic-bookmark__icon');
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
        svg.appendChild(path);
        return svg;
    }

    var group = document.createElement('span');
    group.className = 'topic-learn';

    var bookmarkBtn = document.createElement('button');
    bookmarkBtn.type = 'button';
    bookmarkBtn.className = 'topic-bookmark';
    bookmarkBtn.appendChild(bookmarkIcon());

    var progressBtn = document.createElement('button');
    progressBtn.type = 'button';
    progressBtn.className = 'topic-progress';

    group.appendChild(bookmarkBtn);
    group.appendChild(progressBtn);
    likeBtn.insertAdjacentElement('afterend', group);

    function render(rec) {
        var bookmarked = rec.bm === true;
        var done       = rec.st === 'done';
        var bmLabel    = bookmarked ? '북마크 해제' : '북마크';
        bookmarkBtn.classList.toggle('topic-bookmark--active', bookmarked);
        bookmarkBtn.setAttribute('aria-pressed', String(bookmarked));
        bookmarkBtn.setAttribute('aria-label', bmLabel);
        bookmarkBtn.title = bmLabel;
        progressBtn.classList.toggle('topic-progress--done', done);
        progressBtn.setAttribute('aria-pressed', String(done));
        progressBtn.textContent = done ? '✓ 학습 완료' : '학습 완료하기';
    }

    /* ===================== 이벤트 ===================== */
    render(update(function (r) {
        r.t = Date.now();
        if (r.st !== 'done' && quizAllCorrect()) r.st = 'done';
    }));

    bookmarkBtn.addEventListener('click', function () {
        render(update(function (r) { r.bm = !r.bm; }));
    });

    progressBtn.addEventListener('click', function () {
        render(update(function (r) { r.st = r.st === 'done' ? 'progress' : 'done'; }));
    });

    document.addEventListener('csflow:quiz-all-correct', function () {
        var current = read().topics[topicSlug];
        if (current && current.st === 'done') return;
        render(update(function (r) { r.st = 'done'; }));
        window.CsFlow.showToast('학습 완료로 표시했어요');
    });
})();