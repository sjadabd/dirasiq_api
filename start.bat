@echo off
echo ========================================
echo    Dirasiq API - Development Setup
echo ========================================

echo.
echo 1. Installing dependencies...
npm install

echo.
echo 2. Creating .env file from template...
if not exist .env (
    copy env.example .env
    echo Please edit .env file with your configuration
) else (
    echo .env file already exists
)

echo.
echo 3. Database setup instructions:
echo    - Make sure PostgreSQL is running
echo    - Create database: CREATE DATABASE dirasiq_db;
echo    - Run: npm run db:init

echo.
echo 4. Starting development server...
echo    Server will be available at: http://localhost:3000
echo    Health check: http://localhost:3000/health
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev
