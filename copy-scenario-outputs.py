#!/usr/bin/env python3
"""Monitor executed scenario files and copy tmpdir outputs before cleanup.

Polls the executed/ directory for new result files. When one appears with
a 'result:' line, copies all files from its tmpdir into executed/<stem>/
so they survive tmpdir cleanup.

Usage: python3 copy-scenario-outputs.py
"""

import shutil
import sys
import time
from pathlib import Path

EXECUTED_DIR = Path(__file__).parent / "plans" / "scenarios" / "executed"
POLL_INTERVAL_S = 15
SEEN_FILE = Path(__file__).parent / ".copy-seen.txt"


def loadSeen():
    if SEEN_FILE.is_file():
        return set(SEEN_FILE.read_text().strip().splitlines())
    return set()


def saveSeen(seen):
    SEEN_FILE.write_text("\n".join(sorted(seen)) + "\n")


def copyTmpdirOutputs(executed_file):
    text = executed_file.read_text()
    lines = text.splitlines()

    tmpdir = ""
    for line in lines:
        if line.startswith("tmpdir: "):
            tmpdir = line[len("tmpdir: "):]
            break

    if not tmpdir:
        print(f"  No tmpdir found in {executed_file.name}")
        return False

    tmpdir_path = Path(tmpdir)
    if not tmpdir_path.is_dir():
        print(f"  tmpdir already gone: {tmpdir}")
        return False

    stem = executed_file.stem.rsplit("-run-", 1)[0]
    output_dir = EXECUTED_DIR / stem
    output_dir.mkdir(exist_ok=True)

    copied = 0
    for f in tmpdir_path.iterdir():
        if f.is_file():
            dest = output_dir / f.name
            shutil.copy2(str(f), str(dest))
            copied += 1

    tests_dir = tmpdir_path / "tests"
    if tests_dir.is_dir():
        dest_tests = output_dir / "tests"
        dest_tests.mkdir(exist_ok=True)
        for f in tests_dir.iterdir():
            if f.is_file():
                shutil.copy2(str(f), str(dest_tests / f.name))
                copied += 1

    print(f"  Copied {copied} files to {output_dir}")
    return True


def main():
    seen = loadSeen()
    print(f"Monitoring {EXECUTED_DIR}")
    print(f"Already seen: {len(seen)} files")
    print()

    while True:
        if not EXECUTED_DIR.is_dir():
            time.sleep(POLL_INTERVAL_S)
            continue

        for f in sorted(EXECUTED_DIR.glob("*-run-*.txt")):
            if f.name in seen:
                continue

            text = f.read_text()
            if "result:" not in text:
                continue

            print(f"New result: {f.name}")
            copyTmpdirOutputs(f)
            seen.add(f.name)
            saveSeen(seen)
            print()

        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
