from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
import os

from backend.database import get_db
from backend.models.learner_state import User, UserCreate, UserLogin, Token, UserResponse
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")
ALGORITHM = "HS256"

def get_password_hash(password: str) -> str:
    # bcrypt.hashpw expects bytes, so we encode the password
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: timedelta = timedelta(days=7)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_pwd, role=user.role, name=user.name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    # --- DEMO MODE BYPASS ---
    # master credentials that work even without a database
    DEMO_ACCOUNTS = {
        "instructor@lme.com": {"password": "admin123", "role": "instructor", "name": "Master Instructor"},
        "student@lme.com": {"password": "student123", "role": "student", "name": "Demo Student"}
    }
    
    email = user_credentials.email.lower()
    if email in DEMO_ACCOUNTS and user_credentials.password == DEMO_ACCOUNTS[email]["password"]:
        acc = DEMO_ACCOUNTS[email]
        access_token = create_access_token(data={
            "sub": email, 
            "name": acc["name"], 
            "role": acc["role"], 
            "id": 0 # Special ID for demo
        })
        return {"access_token": access_token, "token_type": "bearer"}

    # Standard DB logic
    try:
        user = db.query(User).filter(User.email == email).first()
    except Exception:
        user = None

    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # INCLUDE NAME IN TOKEN: This is why the admin couldn't see the name before!
    access_token = create_access_token(data={
        "sub": user.email, 
        "name": user.name, 
        "role": user.role, 
        "id": user.id
    })
    return {"access_token": access_token, "token_type": "bearer"}

from fastapi.security import OAuth2PasswordRequestForm

@router.post("/token", response_model=Token)
def login_swagger(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Dedicated endpoint specifically so the Swagger UI 'Authorize' button works seamlessly."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    access_token = create_access_token(data={
        "sub": user.email, 
        "name": user.name, 
        "role": user.role, 
        "id": user.id
    })
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_current_user_db(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        from jose import JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
            
        try:
            user = db.query(User).filter(User.email == email).first()
        except Exception:
            user = None

        if user is None:
            # --- DEMO MODE MOCK PROFILE ---
            if email in ["instructor@lme.com", "student@lme.com"]:
                role = payload.get("role", "student")
                name = payload.get("name", "Demo User")
                # Return a mock User object that matches the schema
                return {"id": 0, "email": email, "role": role, "name": name}
            
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists in database")
            
        return user
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
