import os
import sys

def create_shortcut():
    try:
        import win32com.client
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pywin32"])
        import win32com.client

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    shortcut_path = os.path.join(desktop, "DeepSeek余额小鲸鱼.lnk")
    icon_path = os.path.join(project_root, "assets", "icon.ico")
    
    portable_exe = os.path.join(project_root, "dist", "DeepSeek余额小鲸鱼 1.0.0.exe")
    unpacked_exe = os.path.join(project_root, "dist", "win-unpacked", "DeepSeek余额小鲸鱼.exe")
    
    if os.path.exists(portable_exe):
        target_exe = portable_exe
        working_dir = project_root
    elif os.path.exists(unpacked_exe):
        target_exe = unpacked_exe
        working_dir = os.path.dirname(unpacked_exe)
    else:
        print("[Error] Executable not found in dist/")
        return False

    shell = win32com.client.Dispatch("WScript.Shell")
    shortcut = shell.CreateShortCut(shortcut_path)
    shortcut.TargetPath = target_exe
    shortcut.WorkingDirectory = working_dir
    shortcut.IconLocation = f"{icon_path},0"
    shortcut.Description = "DeepSeek Balance Whale Desk Pet"
    shortcut.Save()

    print("[Success] Desktop shortcut created successfully!")
    print(f"  Shortcut: {shortcut_path}")
    print(f"  Target:   {target_exe}")
    print(f"  Icon:     {icon_path}")
    return True

if __name__ == "__main__":
    create_shortcut()
