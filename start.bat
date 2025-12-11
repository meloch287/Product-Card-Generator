@echo off
chcp 65001 >nul
title Product Card Generator - Launcher
color 0A

echo.
echo  ========================================
echo   Product Card Generator v1.0
echo  ========================================
echo.
echo  Запуск системы создания карточек товаров
echo  для Wildberries и Ozon...
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] Python не найден! Установите Python 3.10+
    echo     Скачать: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [X] Node.js не найден! Установите Node.js 18+
    echo     Скачать: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Python найден
echo [OK] Node.js найден
echo.

:: Install backend dependencies if needed
echo [*] Проверка зависимостей бэкенда...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo [*] Установка зависимостей бэкенда...
    pip install -r backend/requirements.txt
)

:: Install frontend dependencies if needed
if not exist "FRONTEND\node_modules" (
    echo [*] Установка зависимостей фронтенда...
    pushd FRONTEND
    call npm install
    popd
)

echo.
echo [*] Запуск сервисов...
echo.

:: Start backend in new window
echo [*] Запуск бэкенда (FastAPI)...
start "Backend - FastAPI" cmd /k "cd /d %~dp0backend && python run.py"

:: Wait for backend to start
echo [*] Ожидание запуска бэкенда...
timeout /t 4 /nobreak > nul

:: Start frontend in new window  
echo [*] Запуск фронтенда (React + Vite)...
start "Frontend - React" cmd /k "cd /d %~dp0FRONTEND && npm run dev"

:: Wait a bit more
timeout /t 3 /nobreak > nul

echo.
echo  ========================================
echo   [OK] Система успешно запущена!
echo  ========================================
echo.
echo  Откройте браузер и перейдите по адресу:
echo     http://localhost:5173
echo.
echo  API документация:
echo     http://localhost:8000/docs
echo.
echo  Для остановки закройте окна Backend и Frontend
echo.

:: Open browser automatically
timeout /t 2 /nobreak > nul
start http://localhost:5173

echo  Браузер открыт автоматически
echo.
pause
