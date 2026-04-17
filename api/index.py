import os
import sys

# Inject the backend directory into the Python path
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.append(backend_path)

# Direct import to satisfy Vercel's static analyzer
from main import app as handler
