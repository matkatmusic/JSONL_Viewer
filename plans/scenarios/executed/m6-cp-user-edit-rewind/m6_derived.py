class Base:
    """A base class that initializes with a default name."""

    def __init__(self):
# derived version
        self.name = "base"

    def describe(self):
        """Return the name of this instance."""
        return self.name

    def validate(self):
        """Return True."""
        return True
