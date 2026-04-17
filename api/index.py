import os
import sys

# Inject the backend directory into the Python path
# This allows imports like 'from database' to work as if they were in the backend folder
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.append(backend_path)

try:
    from main import app
    handler = app
except Exception as e:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    import traceback
    
    app = FastAPI()
    @app.get("/{full_path:path}")
    @app.post("/{full_path:path}")
    async def catch_all(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "traceback": traceback.format_exc(),
                "path": full_path
            }
        )
    handler = app
