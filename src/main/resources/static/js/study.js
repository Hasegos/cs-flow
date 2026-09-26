/**
 * 내 학습 페이지
 */
(function () {
    'use strict';

    var learning = window.CsFlow && window.CsFlow.learning;
    var listEl   = document.getElementById('study-list');
    if (!learning || !listEl) return;

    var FILTERS     = ['bookmark', 'progress', 'done'];
    var STATUS_TEXT = { progress: '학습 중', done: '완료' };
    var EMPTY_TEXT  = {
        bookmark: '아직 북마크한 토픽이 없어요.',
        progress: '학습 중인 토픽이 없어요.',
        done    : '아직 완료한 토픽이 없어요.'
    };

    var summaryEl     = document.getElementById('study-summary');
    var unavailableEl = document.getElementById('study-unavailable');
    var emptyEl       = document.getElementById('study-empty');
    var listEmptyEl   = document.getElementById('study-list-empty');
    var resetBtn      = document.getElementById('study-reset');
    var progressEl    = document.querySelector('.study-progress');
    var tabsEl        = document.querySelector('.study-tabs');
    var actionsEl     = document.querySelector('.study-actions');
    var tabBtns       = document.querySelectorAll('.study-tabs__btn');
    var rows          = document.querySelectorAll('.study-progress__row');

    var filter = 'bookmark';

    /* ===================== 데이터 ===================== */
    var topicIndex   = learning.loadTopicIndex();
    var subjectNames = Object.create(null);
    for (var r = 0; r < rows.length; r++) {
        subjectNames[rows[r].getAttribute('data-subject-slug')] = rows[r].getAttribute('data-subject-name');
    }

    function collect() {
        var data   = learning.read();
        var items  = [];
        var totals = Object.create(null);
        var done   = Object.create(null);

        for (var i = 0; i < topicIndex.length; i++) {
            var t = topicIndex[i];
            totals[t.subjectSlug] = (totals[t.subjectSlug] || 0) + 1;
            var rec = data.topics[t.slug];
            if (!rec) continue;
            if (rec.st === 'done') done[t.subjectSlug] = (done[t.subjectSlug] || 0) + 1;
            items.push({ topic: t, rec: rec });
        }

        items.sort(function (a, b) { return b.rec.t - a.rec.t; });
        return { items: items, totals: totals, done: done };
    }

    /* ===================== DOM 헬퍼 ===================== */
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function arrowIcon() {
        var ns  = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', '5');
        line.setAttribute('y1', '12');
        line.setAttribute('x2', '19');
        line.setAttribute('y2', '12');
        var poly = document.createElementNS(ns, 'polyline');
        poly.setAttribute('points', '12 5 19 12 12 19');
        svg.appendChild(line);
        svg.appendChild(poly);
        return svg;
    }

    function card(entry) {
        var t   = entry.topic;
        var rec = entry.rec;

        var a = el('a', 'topic-card');
        a.href = '/' + t.subjectSlug + '/' + t.slug;

        var num = el('div', 'topic-card__number topic-card__number--slug');
        num.appendChild(el('span', null, t.subjectSlug));

        var body = el('div', 'topic-card__body');
        body.appendChild(el('p', 'topic-card__subject', subjectNames[t.subjectSlug] || t.subjectSlug));
        body.appendChild(el('h3', 'topic-card__title', t.title));
        var stats = el('div', 'topic-card__stats');
        stats.appendChild(el('span', 'topic-card__stat', STATUS_TEXT[rec.st]));
        if (rec.bm) stats.appendChild(el('span', 'topic-card__stat', '북마크'));
        body.appendChild(stats);

        var arrow = el('div', 'topic-card__arrow');
        arrow.appendChild(arrowIcon());

        a.appendChild(num);
        a.appendChild(body);
        a.appendChild(arrow);
        return a;
    }

    /* ===================== 렌더링 ===================== */
    function matches(entry) {
        if (filter === 'bookmark') return entry.rec.bm;
        return entry.rec.st === filter;
    }

    function render() {
        var c = collect();
        var counts = { bookmark: 0, progress: 0, done: 0 };
        for (var i = 0; i < c.items.length; i++) {
            if (c.items[i].rec.bm) counts.bookmark++;
            counts[c.items[i].rec.st]++;
        }

        summaryEl.textContent = '완료 ' + counts.done + ' · 학습 중 ' + counts.progress + ' · 북마크 ' + counts.bookmark;

        for (var r = 0; r < rows.length; r++) {
            var slug  = rows[r].getAttribute('data-subject-slug');
            var total = c.totals[slug] || 0;
            var fin   = c.done[slug] || 0;
            var bar   = rows[r].querySelector('.study-progress__bar');
            bar.max   = total || 1;
            bar.value = fin;
            rows[r].querySelector('.study-progress__count').textContent = fin + ' / ' + total;
        }

        for (var b = 0; b < tabBtns.length; b++) {
            var key    = tabBtns[b].getAttribute('data-filter');
            var active = key === filter;
            tabBtns[b].classList.toggle('is-active', active);
            tabBtns[b].setAttribute('aria-selected', String(active));
            tabBtns[b].querySelector('.study-tabs__count').textContent = String(counts[key]);
        }

        var hasAny = c.items.length > 0;
        emptyEl.hidden   = hasAny;
        tabsEl.hidden    = !hasAny;
        listEl.hidden    = !hasAny;
        actionsEl.hidden = !hasAny;

        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        var shown = 0;
        for (var k = 0; k < c.items.length; k++) {
            if (!matches(c.items[k])) continue;
            listEl.appendChild(card(c.items[k]));
            shown++;
        }
        listEmptyEl.textContent = EMPTY_TEXT[filter];
        listEmptyEl.hidden = !hasAny || shown > 0;
    }

    /* ===================== 이벤트 ===================== */
    if (!learning.available) {
        unavailableEl.hidden = false;
        progressEl.hidden    = true;
        tabsEl.hidden        = true;
        listEl.hidden        = true;
        actionsEl.hidden     = true;
        return;
    }

    for (var t = 0; t < tabBtns.length; t++) {
        tabBtns[t].addEventListener('click', function () {
            var next = this.getAttribute('data-filter');
            if (FILTERS.indexOf(next) === -1) return;
            filter = next;
            render();
        });
    }

    resetBtn.addEventListener('click', function () {
        if (!window.confirm('학습 기록(진행도·북마크)을 모두 지울까요? 퀴즈 풀이 기록은 그대로 남아요.')) return;
        learning.clear();
        render();
    });

    window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === 'csflow-learn') render();
    });

    render();
})();