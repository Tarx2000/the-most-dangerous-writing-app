@echo off
subst Z: /D >nul 2>&1
subst Z: "%~dp0"
Z:
cd android
set JAVA_HOME=C:\Program Files\ojdkbuild\java-17-openjdk-17.0.3.0.6-1
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
call gradlew assembleRelease --stacktrace --info --no-build-cache --max-workers=1 > "%~dp0build_subst.log" 2>&1
subst Z: /D >nul 2>&1
