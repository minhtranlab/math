#!/usr/bin/env python3
"""Made-up fixture batch FX1 for the tests (public repo: every qid starts with FX, nothing from any book or real bank).
python3 tests/make_fixtures.py → tests/fixtures/library/questions/FX1.json"""
import json, os

def item(qid, typ, sub, diff, stem, key, rnd='', unit='', choices=None, wrong=None, hint='<p>Made-up hint.</p>', hint_status='reviewed'):
    skill = '.'.join(sub.split('.')[:2])
    return {"qid": qid, "batch": "FX1", "source": {"set": "FX1", "note": "made-up fixture"}, "type": typ, "stem_html": stem, "figures": [],
            "choices": choices or [], "key": key, "accepted": [], "answer": {"round": rnd, "unit": unit}, "wrong_answers": wrong or [],
            "tags": {"topic": sub.split('.')[0], "skill": skill, "subskill": sub, "difficulty": diff, "level": 1},
            "params": None, "seed": None, "hint_html": hint, "hint_status": hint_status, "solution_html": "", "status": "keep",
            "version": "A", "version_of": None, "code": qid.replace('-', '')}

qs = [
    item("FX-001", "mcq", "TRIG.RT.LABEL", "E", "<p>Made-up: right angle at \\(Z\\). Which side is opposite angle \\(X\\)?</p>", "B",
         choices=[{"label": "A", "html": "\\(XZ\\)", "mistake_type": "opp_adj_swapped"}, {"label": "B", "html": "\\(YZ\\)", "mistake_type": ""},
                  {"label": "C", "html": "\\(XY\\)", "mistake_type": "hyp_misidentified"}]),
    item("FX-002", "num", "TRIG.RT.SIDE_NUM", "E", "<p>Made-up: hypotenuse 10 cm, angle 30°. Find the opposite side to 3 s.f.</p>", "5.00", "3sf", "cm",
         wrong=[{"value": "8.66", "mistake_type": "wrong_ratio"}]),
    item("FX-003", "num", "TRIG.RT.ANGLE", "M", "<p>Made-up: opposite 3 cm, adjacent 4 cm. Find the angle to 1 d.p.</p>", "36.9", "1dp", "°",
         wrong=[{"value": "53.1", "mistake_type": "ratio_upside_down"}]),
    item("FX-004", "num", "TRIG.RT.SIDE_DEN", "E", "<p>Made-up draft item (hint not reviewed).</p>", "7", "exact", "cm", hint_status="draft"),
]
out = os.path.join(os.path.dirname(__file__), 'fixtures', 'library', 'questions', 'FX1.json')
json.dump({"batch": "FX1", "title": "Made-up fixtures", "source_type": "fixture", "schema": "msb.q/0.1", "live_default": "Yes", "questions": qs},
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('FX1.json:', len(qs), 'items')
