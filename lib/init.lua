---@class kuradb
---@field select fun(columns?: string[]): table
---@field insert fun(tbl: table): table
---@field update fun(tbl: table): table
---@field delete fun(tbl: table): table
---@field transaction fun(cb: fun(query: function): boolean): boolean
---@field op table
---@field raw table
---@field store fun(query: string, cb?: function): integer
---@field ready table
local db <const> = kura and kura.db or nil

if not db then
    error('kuradb Lua bridge failed to initialize kura.db before lib/init.lua.', 0)
end

exports('getInterface', function()
    return db
end)
