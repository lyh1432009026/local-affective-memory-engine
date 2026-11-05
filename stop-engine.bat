@echo off
echo Stopping Local Affective Memory Engine on port 4100...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4100') do (
    taskkill /F /PID %%a 2>nul
)
echo Done.
pause
