' 사복(sabok) 프로덕션 기동 — CMD 창 없이 백그라운드(로그는 PM2 또는 run-prod 부모에 따라 다름)
' 사용: 탐색기에서 이 파일 더블클릭 (또는 바로가기). Node 가 PATH 에 있어야 합니다.
Option Explicit
Dim sh, fso, root
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(root)
root = fso.GetParentFolderName(root)
sh.CurrentDirectory = root
' 0 = 창 숨김, False = 비동기(스크립트가 즉시 종료됨)
sh.Run "node """ & root & "\run-prod.mjs""", 0, False
