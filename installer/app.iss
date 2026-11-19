#define AppVersion "1.9.7"
[Setup]
AppId={{4C7197E2-719B-40BD-B22F-D378C5E37791}
AppName=拾题 AI 错题本
AppVersion={#AppVersion}
AppPublisher=拾题
DefaultDirName={localappdata}\Programs\AiNotebook
DefaultGroupName=拾题 AI 错题本
OutputDir=..\build\windows-installer
OutputBaseFilename=AiNotebook-Setup-{#AppVersion}-x64
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
WizardStyle=modern
UninstallDisplayIcon={app}\runtime\node.exe
SetupIconFile=..\src\app\favicon.ico

[Files]
Source: "..\build\windows-stage\*"; DestDir: "{app}"; Excludes: "prisma\app.db"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\build\windows-flat\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\build\windows-stage\prisma\app.db"; DestDir: "{app}\prisma"; Flags: onlyifdoesntexist uninsneveruninstall

[InstallDelete]
Type: files; Name: "{app}\next.config.ts"

[Icons]
Name: "{autoprograms}\拾题 AI 错题本"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{autodesktop}\拾题 AI 错题本"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; Description: "启动拾题 AI 错题本"; Flags: postinstall nowait skipifsilent
