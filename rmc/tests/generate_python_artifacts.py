#!/usr/bin/env python3
"""
Generate Python SVG artifacts from all .rm test files.

Run with: python rmc/tests/generate_python_artifacts.py
"""

import os
import sys
from pathlib import Path

# Add parent paths to allow imports
# Script is at: /project/rmc/tests/
# project_root is 2 levels up
script_dir = Path(__file__).parent
project_root = script_dir.parent.parent
sys.path.insert(0, str(project_root / "rmscene" / "src"))
sys.path.insert(0, str(project_root / "rmc" / "src"))

from rmscene import read_tree
from rmc.exporters.svg import tree_to_svg


def main():
    rm_dir = script_dir / "rm"
    artifacts_dir = script_dir / "artifacts"
    python_svg_dir = artifacts_dir / "python_svg"

    # Create directory
    python_svg_dir.mkdir(parents=True, exist_ok=True)

    # Get all .rm files
    rm_files = list(rm_dir.glob("*.rm"))

    print(f"Converting {len(rm_files)} .rm files to SVG using Python...")

    success_count = 0
    error_count = 0

    for rm_path in rm_files:
        base_name = rm_path.stem
        svg_path = python_svg_dir / f"{base_name}.svg"

        try:
            with open(rm_path, "rb") as f:
                tree = read_tree(f)

            with open(svg_path, "w") as f:
                tree_to_svg(tree, f)

            print(f"  ✓ {base_name}.svg")
            success_count += 1
        except Exception as e:
            print(f"  ✗ {base_name}.svg: {e}")
            error_count += 1

    print(f"\nDone! {success_count} files converted, {error_count} errors")
    print(f"Python SVG artifacts saved to: {python_svg_dir}")


if __name__ == "__main__":
    main()
