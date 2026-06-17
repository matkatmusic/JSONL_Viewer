from scenario17 import greet


def test_greet_world():
    assert greet("world") == "Hello, world"
