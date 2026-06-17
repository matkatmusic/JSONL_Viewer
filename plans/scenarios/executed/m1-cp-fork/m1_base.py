class Config:
    def __init__(self):
        self.debug = False
        self.verbose = False

    def enable_debug(self):
        self.debug = True

    def disable_all(self):
        self.debug = False
        self.verbose = False
