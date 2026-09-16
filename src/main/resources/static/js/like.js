/**
 * 토픽 추천(좋아요) 버튼
 */
(function () {
    'use strict';

    var btn = document.querySelector('.topic-like');
    if (!btn) return;

    var countEl = btn.querySelector('.topic-like__count');
    var topicSlug = btn.getAttribute('data-topic-slug');

    btn.addEventListener('click', function () {
        btn.disabled = true;

        fetch('/api/topic/' + topicSlug + '/like', { method: 'POST' })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                btn.classList.toggle('topic-like--active', data.liked);
                if (countEl) countEl.textContent = String(data.count);
            })
            .finally(function () {
                btn.disabled = false;
            });
    });
})();