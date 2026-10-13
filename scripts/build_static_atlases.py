"""Compatibility entry point: regenerate organ-based atlases, never legacy PNGs.

Accepts the same arguments as build_organ_static_360.py (including --source
and --studies). Requires the sibling organ-seeded phantom source project.
"""
from build_organ_static_360 import main

if __name__ == '__main__':
    main()
