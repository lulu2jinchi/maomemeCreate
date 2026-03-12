#!/usr/bin/env python3

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


EXTRA_DIRS = [
    Path("public/lib"),
    Path("public/img"),
    Path("out"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the maomeme video pipeline template into a target workspace."
    )
    parser.add_argument(
        "--target",
        default=".",
        help="Target workspace directory. Defaults to the current directory.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite colliding files in the target workspace.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be copied without writing files.",
    )
    return parser.parse_args()


def collect_source_files(source_root: Path) -> list[Path]:
    return sorted(path for path in source_root.rglob("*") if path.is_file())


def ensure_no_collisions(source_root: Path, target_root: Path, files: list[Path]) -> list[Path]:
    collisions = []
    for source_path in files:
        relative_path = source_path.relative_to(source_root)
        destination_path = target_root / relative_path
        if destination_path.exists():
            collisions.append(relative_path)
    return collisions


def copy_files(source_root: Path, target_root: Path, files: list[Path], dry_run: bool) -> None:
    for source_path in files:
        relative_path = source_path.relative_to(source_root)
        destination_path = target_root / relative_path
        if dry_run:
            print(f"would copy {relative_path}")
            continue

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)
        print(f"copied {relative_path}")


def ensure_extra_dirs(target_root: Path, dry_run: bool) -> None:
    for relative_path in EXTRA_DIRS:
        destination = target_root / relative_path
        if dry_run:
            print(f"would mkdir {relative_path}")
            continue

        destination.mkdir(parents=True, exist_ok=True)
        print(f"ensured {relative_path}")


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    source_root = script_dir.parent / "assets" / "project-template"
    target_root = Path(args.target).resolve()

    if not source_root.is_dir():
        print(f"template directory is missing: {source_root}", file=sys.stderr)
        return 1

    files = collect_source_files(source_root)
    if not files:
        print(f"template directory is empty: {source_root}", file=sys.stderr)
        return 1

    if not args.force:
        collisions = ensure_no_collisions(source_root, target_root, files)
        if collisions:
            print("refusing to overwrite existing files:", file=sys.stderr)
            for relative_path in collisions:
                print(f"  {relative_path}", file=sys.stderr)
            print("rerun with --force after reviewing the collisions.", file=sys.stderr)
            return 2

    if not args.dry_run:
        target_root.mkdir(parents=True, exist_ok=True)

    copy_files(source_root, target_root, files, args.dry_run)
    ensure_extra_dirs(target_root, args.dry_run)

    if args.dry_run:
        print("dry run complete")
    else:
        print(f"template installed at {target_root}")
        print("next steps:")
        print("  1. npm install")
        print("  2. add media into public/lib and public/img")
        print("  3. maintain describe.json and img-describe.json")
        print("  4. generate or edit track.json, then run npm run track:fit-dialogue")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
