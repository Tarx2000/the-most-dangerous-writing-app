import os
import shutil
import winreg

src_dir = r"C:\Users\Tarik\.gemini\antigravity\scratch\the-most-dangerous-writing-app\cockpit-tools-extracted"
dest_dir = r"C:\Users\Tarik\AppData\Local\Programs\CockpitTools"

if not os.path.exists(dest_dir):
    shutil.copytree(src_dir, dest_dir)

# Create batch files
bat_content = f'@echo off\n"{dest_dir}\\cockpit-tools.exe" %*\n'
with open(os.path.join(dest_dir, "cockpit.bat"), "w") as f:
    f.write(bat_content)
with open(os.path.join(dest_dir, "cockpit tools.bat"), "w") as f:
    f.write(bat_content)

# Update PATH
key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_ALL_ACCESS)
path_val, _ = winreg.QueryValueEx(key, "PATH")

if dest_dir not in path_val:
    new_path = path_val.strip(";") + ";" + dest_dir
    winreg.SetValueEx(key, "PATH", 0, winreg.REG_EXPAND_SZ, new_path)

# Add App Paths
try:
    app_paths_key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\App Paths\cockpit tools.exe")
    winreg.SetValueEx(app_paths_key, "", 0, winreg.REG_SZ, os.path.join(dest_dir, "cockpit-tools.exe"))
    winreg.SetValueEx(app_paths_key, "Path", 0, winreg.REG_SZ, dest_dir)
except Exception as e:
    print(e)
