from pathlib import Path

import pytest

from app.errors import AppError
from app.services import safe_report_path


def test_report_path_discards_parent_directory(tmp_path: Path):
    path = safe_report_path(tmp_path, "../report.md")
    assert path == (tmp_path / "report.md").resolve()


def test_report_path_rejects_empty_filename(tmp_path: Path):
    with pytest.raises(AppError):
        safe_report_path(tmp_path, "..")
