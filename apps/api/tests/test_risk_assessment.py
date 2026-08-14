import pytest

from app.risk_assessment import fallback_assessment, parse_assessment


def test_parse_assessment_accepts_cvss_json_wrapped_in_markdown():
    result = parse_assessment(
        '```json\n{"score":8.6,"level":"高危","rationale":"高影响且无需认证"}\n```'
    )

    assert result.score == 8.6
    assert result.level == "高危"
    assert result.rationale == "高影响且无需认证"


def test_parse_assessment_rejects_out_of_range_score():
    with pytest.raises(ValueError):
        parse_assessment('{"score":10.1,"level":"严重","rationale":"超出范围"}')


def test_parse_assessment_normalizes_level_from_cvss_score():
    result = parse_assessment(
        '{"score":9.4,"level":"高危","rationale":"模型等级与分数不一致"}'
    )

    assert result.level == "严重"


def test_fallback_assessment_does_not_invent_cvss_score():
    result = fallback_assessment()

    assert result.score is None
    assert result.level == "暂无评分"
    assert result.source == "unavailable"
    assert "DeepSeek" not in result.rationale
