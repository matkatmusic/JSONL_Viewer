from scenario15 import hello


def test_hello(capsys):
    hello()
    assert capsys.readouterr().out == "hello\n"
