from s6_git import hello


def test_hello(capsys):
    hello()
    assert capsys.readouterr().out == "hello\n"
