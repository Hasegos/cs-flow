/**
 * 과목·전체 검색
 */
(function () {
    'use strict';

    var form  = document.querySelector('.topic-filter__form');
    var input = form ? form.querySelector('input[name="q"]') : null;
    if (!form || !input || !document.getElementById('topic-results')) return;

    var DELAY_MS   = 300;
    var timer      = null;
    var controller = null;

    /* ===================== URL ===================== */
    function buildUrl() {
        var params = new URLSearchParams();
        new FormData(form).forEach(function (value, key) {
            var v = String(value).trim();
            if (v) params.set(key, v);
        });
        var qs = params.toString();
        return form.getAttribute('action') + (qs ? '?' + qs : '');
    }

    /* ===================== 교체 ===================== */
    function swap(doc, selector) {
        var cur  = document.querySelector(selector);
        var next = doc.querySelector(selector);
        if (cur && next) cur.replaceWith(document.importNode(next, true));
    }

    function run() {
        var url = buildUrl();
        if (controller) controller.abort();
        controller = new AbortController();

        fetch(url, { signal: controller.signal, headers: { 'Accept': 'text/html' } })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                swap(doc, '#topic-results');
                swap(doc, '.subject-hero__count');
                document.title = doc.title;
                history.replaceState(null, '', url);
            })
            .catch(function () { });
    }

    /* ===================== 이벤트 ===================== */
    input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(run, DELAY_MS);
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearTimeout(timer);
        run();
    });
})();