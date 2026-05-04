---@type kuradb
local db <const> = kura and kura.db or nil

if not db then
    error('kuradb Lua bridge failed to initialize kura.db before lib/init.lua.', 0)
end

exports('getInterface', function()
    return db
end)
