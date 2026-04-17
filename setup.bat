@echo off
if not exist "learner-modeling-engine" mkdir learner-modeling-engine
cd learner-modeling-engine

echo =========================================
echo 1. Initialize React app inside /frontend using Create React App
echo =========================================
call npx --yes create-react-app frontend

echo =========================================
echo 2. Install frontend dependencies: react-router-dom, axios, recharts
echo =========================================
cd frontend
call npm install react-router-dom axios recharts
cd ..

echo =========================================
echo 3. Initialize a Python virtual environment inside /backend called "venv"
echo =========================================
if not exist "backend" mkdir backend
cd backend
python -m venv venv
call venv\Scripts\activate.bat

echo =========================================
echo 4. Install backend dependencies
echo =========================================
python -m pip install --upgrade pip
pip install fastapi uvicorn websockets scikit-learn pandas numpy python-jose passlib sqlalchemy shap python-dotenv

echo =========================================
echo 5. Create requirements.txt
echo =========================================
pip freeze > requirements.txt
cd ..

echo Done!
