#!/usr/bin/env python3
"""Run all scenario.txt files through /run-scenario in a Claude tmux session.

Usage:
    python3 run-all-scenarios.py <pane_target>

Fires all scenarios concurrently with 30s spacing, then polls until
all have completed.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path.home() / "Programming" / "jot"))

from common.scripts.tmux_lib import tmux_sendAndSubmit

SCENARIOS_DIR = Path(__file__).parent / "plans" / "scenarios"
EXECUTED_DIR = SCENARIOS_DIR / "executed"
LAUNCH_SPACING_S = 30
POLL_INTERVAL_S = 15
POLL_TIMEOUT_S = 1800


def findScenarioFiles():
    """Return sorted list of scenario .txt files in the scenarios directory."""
    return sorted(SCENARIOS_DIR.glob("*.txt"))


def findLatestExecutedFile(stem):
    """Find the most recent executed file for a scenario stem."""
    if not EXECUTED_DIR.is_dir():
        return None
    matches = sorted(EXECUTED_DIR.glob(f"{stem}-run-*.txt"))
    if matches:
        return matches[-1]
    return None


def executedFileHasResult(executed_file):
    """Check if an executed file contains a 'result:' line."""
    if not executed_file:
        return False
    if not executed_file.is_file():
        return False
    text = executed_file.read_text()
    return "result:" in text


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 run-all-scenarios.py <pane_target>")
        print("  pane_target: tmux pane where Claude is running")
        sys.exit(1)

    pane_target = sys.argv[1]
    scenario_files = findScenarioFiles()

    print(f"Found {len(scenario_files)} scenario files")
    print(f"Target pane: {pane_target}")
    print(f"Launch spacing: {LAUNCH_SPACING_S}s")
    print()

    # Phase 1: Fire all scenarios with spacing.
    stems = []
    for i, scenario_file in enumerate(scenario_files):
        stem = scenario_file.stem
        stems.append(stem)
        abs_path = str(scenario_file.resolve())

        # Clean stale executed files so poll starts clean.
        if EXECUTED_DIR.is_dir():
            for old in EXECUTED_DIR.glob(f"{stem}-run-*.txt"):
                old.unlink()

        print(f"[{i + 1}/{len(scenario_files)}] Sending: {stem}")
        tmux_sendAndSubmit(pane_target, f"/run-scenario {abs_path}")

        if i < len(scenario_files) - 1:
            time.sleep(LAUNCH_SPACING_S)

    print()
    print(f"All {len(scenario_files)} scenarios launched. Waiting for results...")
    print()

    # Phase 2: Poll until all complete or timeout.
    pending = set(stems)
    completed = []
    failed = []
    deadline = time.time() + POLL_TIMEOUT_S

    while pending and time.time() < deadline:
        for stem in list(pending):
            executed_file = findLatestExecutedFile(stem)
            if executedFileHasResult(executed_file):
                text = executed_file.read_text()
                if '"completed": true' in text:
                    completed.append(stem)
                    print(f"  COMPLETED: {stem}")
                else:
                    failed.append(stem)
                    print(f"  FAILED: {stem}")
                pending.discard(stem)
        if pending:
            time.sleep(POLL_INTERVAL_S)

    for stem in pending:
        failed.append(stem)
        print(f"  TIMEOUT: {stem}")

    print()
    print(f"Done: {len(completed)} completed, {len(failed)} failed out of {len(scenario_files)}")
    if failed:
        print(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
