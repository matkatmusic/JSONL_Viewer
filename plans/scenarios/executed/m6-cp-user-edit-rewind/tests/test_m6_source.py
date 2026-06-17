from m6_source import Base


def test_base_name_is_set_to_base():
    # Scenario: Verify that instantiating Base sets its name attribute to "base".
    # Steps:
    # Create a new Base instance.
    base = Base()
    # Verify that the name attribute is the string "base".
    assert base.name == "base"


def test_describe_returns_name():
    # Scenario: Verify that describe() returns the value of self.name.
    # Steps:
    # Create a new Base instance.
    base = Base()
    # Call describe() and verify it returns self.name.
    assert base.describe() == "base"
