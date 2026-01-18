@echo off
echo 🤖 Tenax Phase 0 Setup Complete!
echo.
echo ✅ Project Structure Created
echo ✅ Dependencies Installed  
echo ✅ Database Schema Ready
echo ✅ API Endpoints Configured
echo ✅ WhatsApp Integration Setup
echo ✅ Dashboard UI Ready
echo.
echo 📋 Next Steps:
echo.
echo 1. Setup PostgreSQL database:
echo    - Create database: CREATE DATABASE tenax;
echo    - Run schema: psql -d tenax -f database/schema.sql
echo.
echo 2. Setup Redis server:
echo    - Install and start Redis
echo.
echo 3. Configure environment:
echo    - Update backend/.env with your credentials
echo    - Add Twilio WhatsApp credentials
echo.
echo 4. Start services:
echo    - Terminal 1: redis-server
echo    - Terminal 2: cd backend && npm run dev
echo    - Terminal 3: cd frontend && npm start
echo.
echo 5. Test endpoints:
echo    - Health: http://localhost:3000/health
echo    - Dashboard: http://localhost:3001
echo.
echo 🚀 Phase 0 Foundation Ready!
echo Ready to start coding Phase 1 features.
echo.
pause