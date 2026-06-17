from s2_moved import hello


def test_hello(capsys):
    hello()
    captured = capsys.readouterr()
    assert captured.out == "hello\n"
