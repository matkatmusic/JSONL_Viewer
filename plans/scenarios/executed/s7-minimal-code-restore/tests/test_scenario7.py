"""Tests for Celsius/Fahrenheit temperature conversion functions."""

from scenario7 import celsius_to_fahrenheit, fahrenheit_to_celsius


# --- celsius_to_fahrenheit tests ---


def test_celsius_to_fahrenheit_freezing_point():
    # Verify that 0°C converts to 32°F (the freezing point of water).
    result = celsius_to_fahrenheit(0)
    assert result == 32.0


def test_celsius_to_fahrenheit_boiling_point():
    # Verify that 100°C converts to 212°F (the boiling point of water).
    result = celsius_to_fahrenheit(100)
    assert result == 212.0


def test_celsius_to_fahrenheit_negative_temperature():
    # Verify that -40°C converts to -40°F (the crossover point).
    result = celsius_to_fahrenheit(-40)
    assert result == -40.0


def test_celsius_to_fahrenheit_body_temperature():
    # Verify that 37°C converts to 98.6°F (human body temperature).
    result = celsius_to_fahrenheit(37)
    assert result == pytest.approx(98.6)


def test_celsius_to_fahrenheit_fractional_input():
    # Verify that fractional Celsius values convert correctly.
    # 25.5°C = 25.5 * 9/5 + 32 = 77.9°F
    result = celsius_to_fahrenheit(25.5)
    assert result == pytest.approx(77.9)


# --- fahrenheit_to_celsius tests ---


def test_fahrenheit_to_celsius_freezing_point():
    # Verify that 32°F converts to 0°C (the freezing point of water).
    result = fahrenheit_to_celsius(32)
    assert result == 0.0


def test_fahrenheit_to_celsius_boiling_point():
    # Verify that 212°F converts to 100°C (the boiling point of water).
    result = fahrenheit_to_celsius(212)
    assert result == 100.0


def test_fahrenheit_to_celsius_negative_temperature():
    # Verify that -40°F converts to -40°C (the crossover point).
    result = fahrenheit_to_celsius(-40)
    assert result == -40.0


def test_fahrenheit_to_celsius_body_temperature():
    # Verify that 98.6°F converts to 37°C (human body temperature).
    result = fahrenheit_to_celsius(98.6)
    assert result == pytest.approx(37.0)


def test_fahrenheit_to_celsius_fractional_input():
    # Verify that fractional Fahrenheit values convert correctly.
    # 77.9°F = (77.9 - 32) * 5/9 = 25.5°C
    result = fahrenheit_to_celsius(77.9)
    assert result == pytest.approx(25.5)


# --- round-trip tests ---


def test_round_trip_celsius_to_fahrenheit_and_back():
    # Verify that converting C→F→C returns the original value.
    original = 23.7
    result = fahrenheit_to_celsius(celsius_to_fahrenheit(original))
    assert result == pytest.approx(original)


def test_round_trip_fahrenheit_to_celsius_and_back():
    # Verify that converting F→C→F returns the original value.
    original = 72.5
    result = celsius_to_fahrenheit(fahrenheit_to_celsius(original))
    assert result == pytest.approx(original)


import pytest
