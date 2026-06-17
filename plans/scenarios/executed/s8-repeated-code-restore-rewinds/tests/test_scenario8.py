from scenario8 import celsius_to_fahrenheit


def test_celsius_to_fahrenheit_zero():
    assert celsius_to_fahrenheit(0) == 32
