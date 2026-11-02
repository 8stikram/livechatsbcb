; Removing the app takes its start with Windows along. An update reinstalls over itself and keeps it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LiveChatSBCB"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "LiveChatSBCB"
    DeleteRegKey HKCU "Software\Classes\*\shell\LiveChatSBCB.Prepare"
    DeleteRegKey HKCU "Software\Classes\*\shell\LiveChatSBCB.Send"
  ${endIf}
!macroend
