"""Safe local conversion of canonical Markdown reports."""

from __future__ import annotations

import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path


class ReportConversionError(RuntimeError):
    """Raised when one offline conversion stage cannot produce its artifact."""


Runner = Callable[..., subprocess.CompletedProcess[str]]


class ReportConverter:
    def __init__(
        self,
        reference_doc: Path,
        runner: Runner = subprocess.run,
        pandoc_timeout: int = 60,
        pdf_timeout: int = 120,
    ) -> None:
        self.reference_doc = reference_doc
        self.runner = runner
        self.pandoc_timeout = pandoc_timeout
        self.pdf_timeout = pdf_timeout

    @staticmethod
    def _run(runner: Runner, args: list[str], timeout: int, stage: str) -> None:
        try:
            result = runner(
                args,
                capture_output=True,
                text=True,
                timeout=timeout,
                shell=False,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ReportConversionError(f"{stage} conversion failed: {exc}") from exc
        if result.returncode:
            detail = (result.stderr or result.stdout or "converter returned no details").strip()
            raise ReportConversionError(f"{stage} conversion failed: {detail[:1000]}")

    def convert(self, markdown: Path, output_dir: Path, basename: str) -> dict[str, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="report-", dir=output_dir) as raw_temp:
            temp = Path(raw_temp)
            docx_temp = temp / f"{basename}.docx"
            self._run(
                self.runner,
                [
                    "pandoc",
                    str(markdown),
                    "--from",
                    "gfm",
                    "--to",
                    "docx",
                    "--reference-doc",
                    str(self.reference_doc),
                    "--resource-path",
                    str(markdown.parent),
                    "--output",
                    str(docx_temp),
                ],
                self.pandoc_timeout,
                "DOCX",
            )
            if not docx_temp.is_file():
                raise ReportConversionError("DOCX conversion failed: output file was not created")
            docx_output = output_dir / docx_temp.name
            docx_temp.replace(docx_output)

            profile = temp / "lo-profile"
            profile.mkdir()
            self._run(
                self.runner,
                [
                    "libreoffice",
                    f"-env:UserInstallation={profile.resolve().as_uri()}",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(temp),
                    str(docx_output),
                ],
                self.pdf_timeout,
                "PDF",
            )
            pdf_temp = temp / f"{basename}.pdf"
            if not pdf_temp.is_file():
                raise ReportConversionError("PDF conversion failed: output file was not created")

            outputs = {
                "docx": docx_output,
                "pdf": output_dir / pdf_temp.name,
            }
            pdf_temp.replace(outputs["pdf"])
            return outputs
