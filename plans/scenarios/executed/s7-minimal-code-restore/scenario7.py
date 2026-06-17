"""Temperature conversion functions between Celsius and Fahrenheit."""


def celsius_to_fahrenheit(c):
    """Convert a temperature from Celsius to Fahrenheit."""
    return c * 9 / 5 + 32


def fahrenheit_to_celsius(f):
    """Convert a temperature from Fahrenheit to Celsius."""
    return (f - 32) * 5 / 9
