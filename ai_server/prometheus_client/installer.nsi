!define APPNAME "Prometheus AI Client"
!define COMPANYNAME "Shree Durga Syntex Private Limited"
!define VERSION "1.0"

OutFile "PrometheusAI-Setup.exe"
InstallDir "$PROGRAMFILES64\PrometheusAI"
RequestExecutionLevel admin

Icon "prometheus.ico"
UninstallIcon "prometheus.ico"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"

SetOutPath "$INSTDIR"

; Copy main exe
File "dist\prometheus-client.exe"

; Create desktop shortcut
CreateShortCut "$DESKTOP\Prometheus AI.lnk" "$INSTDIR\PrometheusAI.exe"

; Create start menu folder
CreateDirectory "$SMPROGRAMS\Prometheus AI"
CreateShortCut "$SMPROGRAMS\Prometheus AI\Prometheus AI.lnk" "$INSTDIR\PrometheusAI.exe"
CreateShortCut "$SMPROGRAMS\Prometheus AI\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

; 🔥 Auto-start on login
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PrometheusAI" "$INSTDIR\PrometheusAI.exe"

; Add uninstall info
WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrometheusAI" "DisplayName" "${APPNAME}"
WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrometheusAI" "UninstallString" "$INSTDIR\Uninstall.exe"

WriteUninstaller "$INSTDIR\Uninstall.exe"

SectionEnd


Section "Uninstall"

Delete "$INSTDIR\PrometheusAI.exe"
Delete "$DESKTOP\Prometheus AI.lnk"
Delete "$SMPROGRAMS\Prometheus AI\Prometheus AI.lnk"
Delete "$SMPROGRAMS\Prometheus AI\Uninstall.lnk"
Delete "$INSTDIR\Uninstall.exe"

; 🔥 Remove auto-start
DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PrometheusAI"

DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PrometheusAI"

RMDir "$SMPROGRAMS\Prometheus AI"
RMDir "$INSTDIR"

SectionEnd