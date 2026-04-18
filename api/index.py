import os
import sys

# Standard Vercel bridge: 
# 1. Add the current directory (root) to sys.path so 'backend' is findable
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# 2. Import the app from the package
from backend.main import app as handler
