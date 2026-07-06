"""Test bootstrap.

The package `src/__init__.py` eagerly imports the heavy RAG stack
(chromadb / sentence-transformers / torch), so we import the light, isolated
modules under test as top-level modules by putting `backend/src` on sys.path.
This keeps the unit tests runnable without the full runtime stack installed.
"""

import os
import sys

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)
