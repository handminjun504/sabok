' 사복(sabok) PM2 기동 — CMD 창 없이 백그라운드로 PM2 를 올린다.
'
' 사용법(시작 폴더 교체 순서는 docs/windows-autostart.md 참고):
'   1) 이 파일의 바로가기를 만들어 `shell:startup` (시작 프로그램) 폴더에 둔다.
'      또는 이 파일을 Task Scheduler 의 "At log on" 트리거로 실행한다.
'   2) Node.js · npm · pm2 (npm i -g pm2) 가 PATH 에 있어야 한다.
'   3) PATH 파악을 위해 로그인 사용자의 `%APPDATA%\npm` 이 PATH 에 포함되어 있는지 확인.
'
' 내부 동작:
'   - %APPDATA%\npm\pm2.cmd 가 있으면 `pm2 start ecosystem.config.cjs --update-env` 실행
'   - 없으면 `node run-prod.mjs` 로 직접 기동 (PM2 없이, 자동재시작 없음)
'   - WScript.Run(cmd, 0, False): 0 = 창 숨김, False = 비동기
'
' 로그는 logs/pm2-sabok-out.log, logs/pm2-sabok-error.log 로 남는다 (ecosystem.config.cjs 참고).

Option Explicit
Dim sh, fso, root, appdata, pm2Cmd, nodeCmd, cmdLine
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' 이 스크립트는 `<repo>/scripts/windows/start-sabok-pm2-hidden.vbs` 경로에 있다고 가정.
' 두 단계 상위 = 저장소 루트.
root = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(root)
root = fso.GetParentFolderName(root)
sh.CurrentDirectory = root

appdata = sh.ExpandEnvironmentStrings("%APPDATA%")
pm2Cmd = appdata & "\npm\pm2.cmd"

If fso.FileExists(pm2Cmd) Then
  ' PM2 기반 기동 — ecosystem.config.cjs 를 업데이트 반영으로 시작.
  ' cmd /c 로 감싸되, 창을 숨기고(0) 즉시 반환(False) 한다.
  cmdLine = "cmd /c """"" & pm2Cmd & """ start """ & root & "\ecosystem.config.cjs"" --update-env"""
  sh.Run cmdLine, 0, False
Else
  ' PM2 가 없으면 run-prod.mjs 로 직접 기동. 자동재시작은 제공되지 않으므로 가급적 PM2 권장.
  nodeCmd = "node"
  sh.Run """" & nodeCmd & """ """ & root & "\run-prod.mjs""", 0, False
End If
