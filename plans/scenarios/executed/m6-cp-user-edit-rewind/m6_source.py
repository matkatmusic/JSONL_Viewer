class Base:
    """A base class that initializes with a default name."""

    def __init__(self):
        self.name = "base"

    def describe(self):
        """Return the name of this instance."""
        return self.name
