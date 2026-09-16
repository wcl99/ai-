import hashlib
from types import SimpleNamespace
from pathlib import Path

import pytest

from app.reporting.convert import ReportConversionError, ReportConverter
from app.reporting.render import render_report


FIXED_SERVICE_OVERVIEW_SHA256 = "0953fdb9f1c949188e6a5ff858083b0c4533c3dba99cbd1d7c7137263d23adcd"


def test_render_report_uses_fixed_reference_service_overview():
    task = SimpleNamespace(
        id="task-fixed-overview",
        name="Fixed overview",
        external_task_id="xiaoyi-fixed-overview",
        status="SUCCEEDED",
        progress=100,
        error_message=None,
    )
    child = SimpleNamespace(name="DYNAMIC_CHILD_MUST_NOT_APPEAR", status="SUCCEEDED", progress=100)

    report = render_report(
        task,
        [child],
        [],
        [{"toolName": "DYNAMIC_TOOL_MUST_NOT_APPEAR", "success": True}],
    )
    service_overview = report.split("# 服务概述", 1)[1].split("# 漏洞描述", 1)[0]
    service_overview = f"# 服务概述{service_overview}".strip()

    assert hashlib.sha256(service_overview.encode()).hexdigest() == FIXED_SERVICE_OVERVIEW_SHA256
    assert "DYNAMIC_CHILD_MUST_NOT_APPEAR" not in service_overview
    assert "DYNAMIC_TOOL_MUST_NOT_APPEAR" not in service_overview


def test_render_report_uses_reference_structure_and_redacts_secrets():
    task = SimpleNamespace(
        id="task-1",
        name="Example engagement",
        external_task_id="xiaoyi-1",
        status="SUCCEEDED",
        progress=100,
        error_message=None,
        created_at=None,
        updated_at=None,
    )
    child = SimpleNamespace(name="Web penetration", status="SUCCEEDED", progress=100)
    finding = SimpleNamespace(
        title="Source map exposure",
        severity="low",
        asset_key="https://example.test/app.js.map",
        description="token=plain-secret was exposed",
        data_json={
            "vuln_suggestions": "Remove source maps before release.",
            "authorization": "Bearer top-secret",
            "evidence": "Authorization: Bearer abc.def",
        },
    )

    report = render_report(task, [child], [finding], [{"toolName": "WebRE", "success": True}])

    for heading in (
        "# 服务结果",
        "## 渗透范围",
        "## 渗透结果",
        "## 安全建议",
        "# 服务概述",
        "## 测试流程",
        "## 测试工具",
        "# 漏洞描述",
        "# 风险评级",
        "# 漏洞评级",
    ):
        assert heading in report
    assert "Example engagement" in report
    assert "Source map exposure" in report
    assert "https://example.test/app.js.map" in report
    assert "Remove source maps before release." in report
    assert "plain-secret" not in report
    assert "top-secret" not in report
    assert "abc.def" not in report
    assert "***" in report
    assert "\\newpage" not in report
    assert '<w:br w:type="page"/>' in report


def test_render_report_marks_missing_finding_fields_without_inference():
    task = SimpleNamespace(
        id="task-2",
        name="Empty fields",
        external_task_id=None,
        status="PARTIAL_SUCCEEDED",
        progress=75,
        error_message="upstream stopped",
        created_at=None,
        updated_at=None,
    )
    finding = SimpleNamespace(
        title="Confirmed finding",
        severity="medium",
        asset_key=None,
        description=None,
        data_json={},
    )

    report = render_report(task, [], [finding], [])

    assert "未提供" in report
    assert "upstream stopped" in report
    assert "未确认漏洞" not in report


def test_converter_uses_safe_argument_arrays_and_isolated_profile(tmp_path):
    markdown = tmp_path / "source.md"
    markdown.write_text("# 测试", encoding="utf-8")
    reference = tmp_path / "reference.docx"
    reference.write_bytes(b"reference")
    calls = []

    def runner(args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == "pandoc":
            Path(args[args.index("--output") + 1]).write_bytes(b"docx")
        else:
            output_dir = Path(args[args.index("--outdir") + 1])
            output_dir.joinpath("report.pdf").write_bytes(b"pdf")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    converter = ReportConverter(reference_doc=reference, runner=runner)
    outputs = converter.convert(markdown, tmp_path / "output", "report")

    assert outputs["docx"].read_bytes() == b"docx"
    assert outputs["pdf"].read_bytes() == b"pdf"
    assert calls[0][0][0] == "pandoc"
    assert "--reference-doc" in calls[0][0]
    assert calls[1][0][0] == "libreoffice"
    assert any(str(item).startswith("-env:UserInstallation=file://") for item in calls[1][0])
    for _, kwargs in calls:
        assert kwargs["shell"] is False
        assert kwargs["timeout"] > 0


def test_converter_reports_actionable_failure_and_keeps_markdown(tmp_path):
    markdown = tmp_path / "source.md"
    markdown.write_text("# 测试", encoding="utf-8")
    reference = tmp_path / "reference.docx"
    reference.write_bytes(b"reference")

    def runner(args, **kwargs):
        return SimpleNamespace(returncode=12, stdout="", stderr="conversion failed")

    converter = ReportConverter(reference_doc=reference, runner=runner)

    with pytest.raises(ReportConversionError, match="DOCX.*conversion failed"):
        converter.convert(markdown, tmp_path / "output", "report")
    assert markdown.read_text(encoding="utf-8") == "# 测试"


def test_converter_preserves_docx_when_pdf_conversion_fails(tmp_path):
    markdown = tmp_path / "source.md"
    markdown.write_text("# 测试", encoding="utf-8")
    reference = tmp_path / "reference.docx"
    reference.write_bytes(b"reference")

    def runner(args, **kwargs):
        if args[0] == "pandoc":
            Path(args[args.index("--output") + 1]).write_bytes(b"docx")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        return SimpleNamespace(returncode=3, stdout="", stderr="pdf failed")

    converter = ReportConverter(reference_doc=reference, runner=runner)

    with pytest.raises(ReportConversionError, match="PDF.*pdf failed"):
        converter.convert(markdown, tmp_path / "output", "report")
    assert (tmp_path / "output" / "report.docx").read_bytes() == b"docx"
