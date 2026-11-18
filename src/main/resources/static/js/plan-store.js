/*! © 2025-2026 CS Flow. All rights reserved. */
(function (global) {
    'use strict';

    /*
     * 면접 계획을 브라우저에 보관하고 화면이 쓸 모양으로 만든다.
     *
     * 계획 조건은 주소 해시와 localStorage 양쪽에 같은 글자로 둔다. 답변 기록은 이 기기에만 남는다.
     * 서버는 질문 목록(/data/interview.json)만 내려주고 그 뒤로는 부르지 않는다.
     *
     * 링크 형식: v1.be.20261118.20261218.60.67.2
     *            판.직무.시작일.면접일.하루분.쉬는요일비트.순서
     */

    var PLAN_KEY = 'csflow-plan';
    var ANSWER_KEY = 'csflow-plan-answers';
    var MAX_ANSWERS = 2000;
    var LINK_RE = /^v1\.(be|fe|em|co)\.(\d{8})\.(\d{8})\.(30|45|60)\.(\d{1,3})\.(\d{1,3})$/;

    var ROLE_CODE = { BACKEND: 'be', FRONTEND: 'fe', EMBEDDED: 'em', COMMON: 'co' };
    var DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    var CODE_ROLE = { be: 'BACKEND', fe: 'FRONTEND', em: 'EMBEDDED', co: 'COMMON' };

    /** 요일 이름 배열을 ISO 번호 배열로 바꾼다. 화면 입력값이 MONDAY 같은 이름이다. */
    function toIsoDays(names) {
        var out = [];
        (names || []).forEach(function (name) {
            var i = DAY_NAMES.indexOf(name);
            if (i >= 0 && out.indexOf(i + 1) < 0) {
                out.push(i + 1);
            }
        });
        return out.sort(function (a, b) {
            return a - b;
        });
    }

    /** ISO 번호 배열을 요일 이름 배열로 바꾼다. */
    function toDayNames(isoDays) {
        return (isoDays || []).slice().sort(function (a, b) {
            return a - b;
        }).map(function (w) {
            return DAY_NAMES[w - 1];
        });
    }

    /** 'YYYYMMDD' 를 'YYYY-MM-DD' 로 바꾼다. */
    function spread(compact) {
        return compact.slice(0, 4) + '-' + compact.slice(4, 6) + '-' + compact.slice(6, 8);
    }

    /** 'YYYY-MM-DD' 를 'YYYYMMDD' 로 바꾼다. */
    function squeeze(iso) {
        return iso.replace(/-/g, '');
    }

    /**
     * 조건을 링크 글자로 바꾼다.
     *
     * @param spec 계획 조건
     * @return 링크에 쓸 글자
     */
    function format(spec) {
        var bits = 0;
        (spec.restDays || []).forEach(function (w) {
            bits |= 1 << (w - 1);
        });
        return ['v1', ROLE_CODE[spec.role], squeeze(spec.startDate), squeeze(spec.targetDate),
            spec.dailyMinutes, bits, spec.variant || 0].join('.');
    }

    /**
     * 링크 글자를 조건으로 되돌린다. 형식이나 값이 어긋나면 null 을 돌려준다.
     *
     * @param text 링크 글자
     * @return 계획 조건, 읽을 수 없으면 null
     */
    function parse(text) {
        if (typeof text !== 'string') {
            return null;
        }
        var m = LINK_RE.exec(text.trim());
        if (!m) {
            return null;
        }
        var bits = Number(m[5]);
        var variant = Number(m[6]);
        if (bits > 127 || variant > 999) {
            return null;
        }
        var restDays = [];
        for (var w = 1; w <= 7; w++) {
            if (bits & (1 << (w - 1))) {
                restDays.push(w);
            }
        }
        var spec = {
            role: CODE_ROLE[m[1]],
            startDate: spread(m[2]),
            targetDate: spread(m[3]),
            dailyMinutes: Number(m[4]),
            restDays: restDays,
            variant: variant
        };
        // 날짜가 실제로 존재하는지(2026-02-31 같은 값) 되돌려서 확인한다
        if (squeeze(spec.startDate) !== m[2] || squeeze(spec.targetDate) !== m[3]
            || !isRealDate(spec.startDate) || !isRealDate(spec.targetDate)) {
            return null;
        }
        return spec;
    }

    function isRealDate(iso) {
        var p = iso.split('-');
        var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
        return d.getUTCFullYear() === +p[0] && d.getUTCMonth() + 1 === +p[1] && d.getUTCDate() === +p[2];
    }

    /**
     * 새 계획에 쓸 순서 값을 뽑는다. 계획을 다시 만들면 질문 조합이 달라지라고 두는 값이다.
     * 같은 계획 안에서는 링크에 박혀 고정이므로 볼 때마다 같은 일정이 나온다.
     *
     * @return 0 이상 999 이하 정수
     */
    function newVariant() {
        var max = 1000;
        if (global.crypto && global.crypto.getRandomValues) {
            var buf = new Uint32Array(1);
            global.crypto.getRandomValues(buf);
            return buf[0] % max;
        }
        return Math.floor(Math.random() * max);
    }

    /* ===================== 보관 ===================== */

    function readRaw(key) {
        try {
            return global.localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function writeRaw(key, value) {
        try {
            if (value === null) {
                global.localStorage.removeItem(key);
            } else {
                global.localStorage.setItem(key, value);
            }
        } catch (e) {
            /* 사생활 보호 모드 등에서 막히면 이번 방문에만 안 남는다 */
        }
    }

    /** 보관된 계획 조건을 읽는다. 없거나 깨졌으면 null. */
    function load() {
        return parse(readRaw(PLAN_KEY));
    }

    /** 계획 조건을 보관한다. */
    function save(spec) {
        writeRaw(PLAN_KEY, format(spec));
    }

    /** 보관된 계획과 답변을 지운다. */
    function clear() {
        writeRaw(PLAN_KEY, null);
        writeRaw(ANSWER_KEY, null);
    }

    /** 이 기기에 남은 답변 기록을 읽는다. 깨졌으면 빈 목록. */
    function answers() {
        var raw = readRaw(ANSWER_KEY);
        if (!raw) {
            return [];
        }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * 답변 하나를 남긴다. 같은 날 같은 질문은 마지막 것만 남는다.
     *
     * @param answer { questionId, phase, answeredOn, hitCount, totalCount, selfRating }
     */
    function recordAnswer(answer) {
        var list = answers().filter(function (a) {
            return !(a.questionId === answer.questionId && a.answeredOn === answer.answeredOn);
        });
        list.push(answer);
        if (list.length > MAX_ANSWERS) {
            list = list.slice(list.length - MAX_ANSWERS);
        }
        writeRaw(ANSWER_KEY, JSON.stringify(list));
    }

    /* ===================== 화면용 모양 ===================== */

    /**
     * 화면이 쓰는 계획 객체를 만든다. 서버가 내려주던 PlanView 와 같은 모양이다.
     *
     * @param spec      계획 조건
     * @param questions /data/interview.json 으로 받은 질문 전체
     * @param today     'YYYY-MM-DD'
     * @return 계획 객체
     */
    function buildView(spec, questions, today) {
        var saved = answers();
        var schedule = global.CsFlow.PlanEngine.compute(spec, today, questions, saved);

        var byId = Object.create(null);
        questions.forEach(function (q) {
            if (q && typeof q.id === 'string') {
                byId[q.id] = q;
            }
        });
        var answeredByDate = Object.create(null);
        saved.forEach(function (a) {
            if (!answeredByDate[a.answeredOn]) {
                answeredByDate[a.answeredOn] = Object.create(null);
            }
            answeredByDate[a.answeredOn][a.questionId] = true;
        });

        var days = schedule.days.map(function (d) {
            var done = answeredByDate[d.date] || Object.create(null);
            return {
                date: d.date,
                type: d.type,
                subject: d.subject,
                total: d.questionIds.length,
                done: d.questionIds.filter(function (id) {
                    return done[id];
                }).length
            };
        });

        var todayDay = null;
        schedule.days.forEach(function (d) {
            if (d.date === today) {
                todayDay = d;
            }
        });
        var doneToday = answeredByDate[today] || Object.create(null);
        var todayTasks = !todayDay ? [] : todayDay.questionIds.map(function (id) {
            return byId[id];
        }).filter(Boolean).map(function (q) {
            return {
                id: q.id,
                subject: q.subject,
                topicSlug: q.topicSlug,
                question: q.question,
                answer: q.answer,
                keywords: q.keywords || [],
                done: !!doneToday[q.id]
            };
        });

        var left = Math.round(
            (Date.UTC(+spec.targetDate.slice(0, 4), +spec.targetDate.slice(5, 7) - 1, +spec.targetDate.slice(8, 10), 12)
                - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10), 12)) / 86400000);

        return {
            link: format(spec),
            role: spec.role,
            startDate: spec.startDate,
            targetDate: spec.targetDate,
            restWeekdays: toDayNames(spec.restDays),
            dailyMinutes: spec.dailyMinutes,
            variant: spec.variant || 0,
            status: 'ACTIVE',
            today: today,
            daysLeft: Math.max(0, left),
            todayType: todayDay ? todayDay.type : null,
            todayTasks: todayTasks,
            days: days,
            weakSubjects: schedule.weakSubjects,
            droppedCount: schedule.droppedCount
        };
    }

    global.CsFlow = global.CsFlow || {};
    global.CsFlow.PlanStore = {
        format: format,
        parse: parse,
        load: load,
        save: save,
        clear: clear,
        answers: answers,
        recordAnswer: recordAnswer,
        buildView: buildView,
        toIsoDays: toIsoDays,
        toDayNames: toDayNames,
        newVariant: newVariant
    };
}(typeof globalThis !== 'undefined' ? globalThis : this));
