class Stack:
    def __init__(self):
        self.items = []
    def size(self): return len(self.items)
    def push(self, item): self.items.append(item)

    def is_empty(self):
        return len(self.items) == 0
