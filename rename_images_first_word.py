#!/usr/bin/env python3
"""
Rename image files so each filename uses only its first word.
If the target name already exists, append a number to make it unique.

Examples:
- "Blue Sky 01.jpg" -> "Blue.jpg"
- "Blue night.png" -> "Blue_1.png" (if "Blue.png" already exists)
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".webp",
    ".svg",
    ".heic",
    ".avif",
}


def first_word(name: str) -> str:
    """Extract the first alphanumeric word from a filename stem."""
    parts = re.findall(r"[A-Za-z0-9]+", name)
    return parts[0] if parts else "image"


def unique_target(directory: Path, base: str, extension: str, reserved: set[str]) -> Path:
    """Build a unique target path, avoiding existing files and planned names."""
    candidate = f"{base}{extension}"
    if not (directory / candidate).exists() and candidate not in reserved:
        reserved.add(candidate)
        return directory / candidate

    counter = 1
    while True:
        candidate = f"{base}_{counter}{extension}"
        if not (directory / candidate).exists() and candidate not in reserved:
            reserved.add(candidate)
            return directory / candidate
        counter += 1


def rename_images(directory: Path, dry_run: bool = False, recursive: bool = False) -> None:
    if not directory.exists() or not directory.is_dir():
        raise ValueError(f"Directory not found: {directory}")

    files = directory.rglob("*") if recursive else directory.iterdir()
    images = [p for p in files if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]

    if not images:
        print("No image files found.")
        return

    reserved: set[str] = set()
    planned: list[tuple[Path, Path]] = []

    for src in images:
        base = first_word(src.stem)
        dst = unique_target(src.parent, base, src.suffix, reserved)

        # If destination resolves to the same path, no rename is needed.
        if src.name == dst.name:
            continue

        planned.append((src, dst))

    if not planned:
        print("No files needed renaming.")
        return

    for src, dst in planned:
        print(f"{src.name} -> {dst.name}")
        if not dry_run:
            src.rename(dst)

    print(f"\nRenamed {len(planned)} file(s)." if not dry_run else f"\nPlanned {len(planned)} rename(s).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rename image files to first-word names with collision numbering."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Directory containing images (default: current directory)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without renaming files",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Process subdirectories recursively",
    )
    args = parser.parse_args()

    target_dir = Path(args.directory).resolve()
    rename_images(target_dir, dry_run=args.dry_run, recursive=args.recursive)


if __name__ == "__main__":
    main()
