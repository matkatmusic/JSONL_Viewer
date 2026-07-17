#!/usr/bin/env python3
"""
RevEng function-rename engine.
Reads plans/naming/function-names-enriched.csv and applies whole-token renames.

Safety: asserts actual replacement count == numReferences per row.
Aborts the row (no partial writes) if counts disagree.
"""
import csv
import re
import os
import sys

ENRICHED_CSV = os.path.join(os.path.dirname(__file__), 'function-names-enriched.csv')
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def load_rows():
    rows = []
    with open(ENRICHED_CSV, newline='') as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r['oldName'] == r['newName']:
                continue
            rows.append(r)
    return rows


def find_in_scope_files(extensions):
    result = []
    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in ('archive', 'node_modules', 'common', '.git')]
        for fname in files:
            if any(fname.endswith(ext) for ext in extensions):
                result.append(os.path.join(root, fname))
    return result


def replace_whole_token(content, old_name, new_name):
    pattern = re.compile(r'\b' + re.escape(old_name) + r'\b')
    new_content, count = pattern.subn(new_name, content)
    return new_content, count


def apply_rename_local(row):
    filepath = os.path.join(REPO_ROOT, row['file'].lstrip('./'))
    if not os.path.exists(filepath):
        return 'SKIP', 0, int(row['numReferences']), 'file not found: ' + filepath

    with open(filepath, 'r') as f:
        content = f.read()

    new_content, count = replace_whole_token(content, row['oldName'], row['newName'])
    expected = int(row['numReferences'])

    if count != expected:
        return 'MISMATCH', count, expected, filepath

    with open(filepath, 'w') as f:
        f.write(new_content)

    return 'OK', count, expected, filepath


def apply_rename_global(row, js_files, html_files):
    old_name = row['oldName']
    new_name = row['newName']
    expected = int(row['numReferences'])
    total_count = 0
    modified_files = []

    all_files = js_files + html_files
    pending_writes = []

    for filepath in all_files:
        with open(filepath, 'r') as f:
            content = f.read()

        new_content, count = replace_whole_token(content, old_name, new_name)
        if count > 0:
            total_count += count
            pending_writes.append((filepath, new_content))
            modified_files.append(filepath)

    if total_count != expected:
        return 'MISMATCH', total_count, expected, modified_files

    for filepath, new_content in pending_writes:
        with open(filepath, 'w') as f:
            f.write(new_content)

    return 'OK', total_count, expected, modified_files


def main():
    rows = load_rows()
    js_files = find_in_scope_files(['.js'])
    html_files = find_in_scope_files(['.html'])

    ok_count = 0
    mismatch_count = 0
    skip_count = 0

    print(f"Rename engine: {len(rows)} rows to process")
    print(f"Scope: {len(js_files)} .js files, {len(html_files)} .html files")
    print()

    for row in rows:
        old = row['oldName']
        new = row['newName']
        is_exported = row['isExported'] == 'Y'

        if is_exported:
            status, actual, expected, info = apply_rename_global(row, js_files, html_files)
        else:
            status, actual, expected, info = apply_rename_local(row)

        if status == 'OK':
            ok_count += 1
            scope = 'GLOBAL' if is_exported else 'LOCAL'
            print(f"  OK  {old} -> {new} ({actual}/{expected}) [{scope}]")
        elif status == 'MISMATCH':
            mismatch_count += 1
            print(f"  MISMATCH  {old} -> {new} (actual={actual}, expected={expected})")
            if isinstance(info, list):
                for f in info:
                    print(f"            would touch: {f}")
            else:
                print(f"            file: {info}")
        else:
            skip_count += 1
            print(f"  SKIP  {old} -> {new}: {info}")

    print()
    print(f"Done: {ok_count} OK, {mismatch_count} MISMATCH, {skip_count} SKIP")

    if mismatch_count > 0:
        print(f"\n{mismatch_count} rows had count mismatches — NOT applied. Fix manually with Edit.")
        sys.exit(1)


if __name__ == '__main__':
    main()
