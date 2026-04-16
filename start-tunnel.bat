@echo off
echo Starting Ngrok Tunnel in the background...
start "Ngrok Tunnel" cmd /k "C:\Users\Tarik\Documents\MDWA App Antigravity Project\the-most-dangerous-writing-app\node_modules\@expo\ngrok-bin-win32-x64\ngrok.exe" http 8081

echo.
echo ========================================================
echo IMPORTANT: A new window will pop up with your Ngrok URL.
echo Copy the URL (e.g. https://xxx.ngrok.app) and paste it 
echo into the "Enter URL manually" box in the Expo Go app. 
echo Make sure to change 'https://' to 'exp://'
echo ========================================================
echo.

echo Starting Expo Development Server...
npx expo start --localhost
