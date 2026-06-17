from s3_source import hello


def test_hello(capsys):
    hello()
    assert capsys.readouterr().out == "hello\n"
