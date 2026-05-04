CreateThread(function()
    if GetResourceState('kura-lib') ~= 'started' then
        print('^3[kuradb] kura-lib not found; updater/version checks disabled for kuradb.^0')
        return
    end
    kura.lib.versionCheck('projectkura/kuradb')
end)