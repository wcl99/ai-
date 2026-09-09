import json

from app.result_aggregation import extract_vulnerabilities


def test_extracted_vulnerability_data_is_redacted_and_bounded():
    payload = {
        "detail": {
            "vuln_info": {
                "vuln_name": "Bounded evidence",
                "vuln_level": "high",
                "http_url": "https://example.test/evidence",
                "http_response": "A" * 20000,
                "password": "private-value",
            }
        }
    }

    findings = extract_vulnerabilities(
        [
            {
                "toolName": "validator",
                "success": True,
                "result": json.dumps([{"type": "text", "text": json.dumps(payload)}]),
            }
        ]
    )

    assert len(findings) == 1
    assert findings[0]["data_json"]["password"] == "***"
    assert len(findings[0]["data_json"]["http_response"]) <= 4000
