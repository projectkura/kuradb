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
local db <const> = {}

db.select      = kuraDb.db.select
db.insert      = kuraDb.db.insert
db.update      = kuraDb.db.update
db.delete      = kuraDb.db.delete
db.transaction = kuraDb.transaction
db.op          = kuraDb.op
db.raw         = kuraDb.raw
db.store       = kuraDb.store
db.ready       = kuraDb.ready

exports('getInterface', function()
    return db
end)
