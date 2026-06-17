from m1_base import Config


def test_config_debug_is_false():
    assert Config().debug is False
