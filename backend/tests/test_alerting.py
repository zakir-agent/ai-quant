from app.services.alerting import build_digest


def test_build_digest_empty_items():
    assert build_digest([]) == ""


def test_build_digest_joins_items():
    text = build_digest(["BTC: +8.0%", "ETH: -6.0%"])
    assert text == "BTC: +8.0%\nETH: -6.0%"


def test_build_digest_with_header():
    text = build_digest(["line"], header="Surges:")
    assert text == "Surges:\nline"


def test_build_digest_truncates_by_item_count():
    items = [f"COIN{i}: +{i}.0%" for i in range(60)]
    text = build_digest(items, max_items=3)
    assert text.splitlines() == [
        "COIN0: +0.0%",
        "COIN1: +1.0%",
        "COIN2: +2.0%",
        "... and 57 more",
    ]


def test_build_digest_truncates_by_char_limit():
    items = ["A" * 100, "B" * 100, "C" * 100]
    text = build_digest(items, max_chars=220)
    lines = text.splitlines()
    assert lines[0] == "A" * 100
    assert lines[1] == "B" * 100
    assert lines[-1] == "... and 1 more"
