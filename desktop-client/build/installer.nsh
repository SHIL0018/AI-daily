!macro customInstall
  CreateShortCut "$DESKTOP\Activity Daily Client.lnk" "$INSTDIR\start-client.cmd" "" "$INSTDIR\Activity Daily Client.exe" 0
  CreateDirectory "$SMPROGRAMS\Activity Daily Client"
  CreateShortCut "$SMPROGRAMS\Activity Daily Client\Activity Daily Client.lnk" "$INSTDIR\start-client.cmd" "" "$INSTDIR\Activity Daily Client.exe" 0
!macroend