# Vercel Entry Point
import os
import sys

# Add the current directory to path so 'backend' can be found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app
