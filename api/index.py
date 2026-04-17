import os
import sys

# Inject the backend directory into the Python path
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.append(backend_path)

# Initialize handler at top level to satisfy Vercel's static analyzer
handler = None

try:
    from main import app as real_app
    handler = real_app
except Exception as e:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    import traceback
    
    debug_app = FastAPI()
    
    @debug_app.get("/{full_path:path}")
    @debug_app.post("/{full_path:path}")
    async def catch_all(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "traceback": traceback.format_exc(),
                "path": full_path,
                "sys_path": sys.path,
                "cwd": os.getcwd()
            }
        )
    handler = debug_app
