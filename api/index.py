import os
import sys

# Inject the backend directory into the Python path
# This allows imports like 'from database' to work as if they were in the backend folder
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.append(backend_path)

from main import app

# Vercel needs the app alias for processing
handler = app
