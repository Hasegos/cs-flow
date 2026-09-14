/**
 * 토픽 퀴즈 탭
 */
(function () {
    'use strict';

    var section = document.querySelector('.quiz-section');
    if (!section) return;

    var topicSlug = section.getAttribute('data-topic-slug');
    var STORAGE_KEY = 'csflow-quiz-' + topicSlug;

    var questions = section.querySelectorAll('.quiz-question');
    var state = {};

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var map = raw ? JSON.parse(raw) : {};
            return (map && typeof map === 'object') ? map : {};
        } catch (e) {
            return {};
        }
    }

    function saveAttempt(questionId, selected, correct, attempt) {
        state[questionId] = { selected: selected, correct: correct, attempt: attempt };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {  }
    }

    function restoreQuestion(question) {
        var questionId = question.getAttribute('data-question-id');
        var record = state[questionId];
        if (!record) return;

        setOptionsDisabled(question, true);
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute('data-option') === record.selected) {
                opts[i].classList.add(record.correct ? 'quiz-option--correct' : 'quiz-option--wrong');
            }
        }

        if (record.correct || record.attempt > 1) {
            showBlock(question, 'quiz-question__explanation');
        } else {
            showBlock(question, 'quiz-question__hint');
        }
        showBlock(question, 'quiz-question__retry');
    }

    function setOptionsDisabled(question, disabled) {
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) opts[i].disabled = disabled;
    }

    function showBlock(question, className) {
        var el = question.querySelector('.' + className);
        if (el) el.classList.add('is-visible');
    }

    function hideBlock(question, className) {
        var el = question.querySelector('.' + className);
        if (el) el.classList.remove('is-visible');
    }

    function resetQuestion(question) {
        var questionId = question.getAttribute('data-question-id');
        var opts = question.querySelectorAll('.quiz-option');
        for (var i = 0; i < opts.length; i++) {
            opts[i].disabled = false;
            opts[i].classList.remove('quiz-option--correct', 'quiz-option--wrong');
        }
        hideBlock(question, 'quiz-question__hint');
        hideBlock(question, 'quiz-question__explanation');
        hideBlock(question, 'quiz-question__retry');

        delete state[questionId];
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { }
    }

    function handleAnswer(question, btn) {
        var questionId = question.getAttribute('data-question-id');
        var selected = btn.getAttribute('data-option');
        var attempt = Number(question.getAttribute('data-attempt') || '0') + 1;
        question.setAttribute('data-attempt', String(attempt));

        setOptionsDisabled(question, true);

        fetch('/api/quiz/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionId: Number(questionId), selected: selected })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                saveAttempt(questionId, selected, data.correct, attempt);

                if (data.correct) {
                    btn.classList.add('quiz-option--correct');
                    showBlock(question, 'quiz-question__explanation');
                    showBlock(question, 'quiz-question__retry');
                    return;
                }
                btn.classList.add('quiz-option--wrong');
                if (attempt === 1) {
                    showBlock(question, 'quiz-question__hint');
                } else {
                    showBlock(question, 'quiz-question__explanation');
                }
                showBlock(question, 'quiz-question__retry');
            })
            .catch(function () {
                setOptionsDisabled(question, false);
            });
    }

    state = loadState();

    for (var i = 0; i < questions.length; i++) {
        (function (question) {
            var opts = question.querySelectorAll('.quiz-option');
            for (var j = 0; j < opts.length; j++) {
                opts[j].addEventListener('click', function () {
                    handleAnswer(question, this);
                });
            }
            var retryBtn = question.querySelector('.quiz-question__retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    resetQuestion(question);
                });
            }
            restoreQuestion(question);
        })(questions[i]);
    }
})();
