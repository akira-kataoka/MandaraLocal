' MandaraLocal — silent launcher (no console window)
' Used by the Startup shortcut so the server runs in the background.
Set objShell = CreateObject("WScript.Shell")
projDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = projDir
' 0 = hidden window. --no-browser to avoid spawning a tab every time you log in.
objShell.Run "cmd /c start.bat --no-browser", 0, False
