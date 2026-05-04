local kuradb = exports.kuradb
local resourceName = GetCurrentResourceName()
local promise = promise
local Await = Citizen.Await
_ENV.kura = _ENV.kura or {}
_ENV.kura.db = _ENV.kura.db or {}
---@type kuradb
local db = _ENV.kura.db

-- ============================================================
-- Operators — kura.db.op.*
-- ============================================================

local op = {}

---@param column string
---@param value any
---@return table
function op.eq(column, value)
  return { type = 'comparison', column = column, operator = '=', value = value }
end

---@param column string
---@param value any
---@return table
function op.ne(column, value)
  return { type = 'comparison', column = column, operator = '<>', value = value }
end

---@param column string
---@param value any
---@return table
function op.lt(column, value)
  return { type = 'comparison', column = column, operator = '<', value = value }
end

---@param column string
---@param value any
---@return table
function op.lte(column, value)
  return { type = 'comparison', column = column, operator = '<=', value = value }
end

---@param column string
---@param value any
---@return table
function op.gt(column, value)
  return { type = 'comparison', column = column, operator = '>', value = value }
end

---@param column string
---@param value any
---@return table
function op.gte(column, value)
  return { type = 'comparison', column = column, operator = '>=', value = value }
end

---@param column string
---@param pattern string
---@return table
function op.like(column, pattern)
  return { type = 'like', column = column, value = pattern }
end

---@param column string
---@param pattern string
---@return table
function op.ilike(column, pattern)
  return { type = 'ilike', column = column, value = pattern }
end

---@param column string
---@param values any[]
---@return table
function op.inArray(column, values)
  return { type = 'in', column = column, value = values }
end

---@param column string
---@param values any[]
---@return table
function op.notInArray(column, values)
  return { type = 'notIn', column = column, value = values }
end

---@param column string
---@return table
function op.isNull(column)
  return { type = 'isNull', column = column }
end

---@param column string
---@return table
function op.isNotNull(column)
  return { type = 'isNotNull', column = column }
end

---@param ... table
---@return table
function op.and_(...)
  return { type = 'and', conditions = { ... } }
end

---@param ... table
---@return table
function op.or_(...)
  return { type = 'or', conditions = { ... } }
end

---@param condition table
---@return table
function op.not_(condition)
  return { type = 'not', condition = condition }
end

db.op = op
_ENV.op = op

-- ============================================================
-- Table resolver — accepts a string name or a table definition
-- ============================================================

---@param columnMap? table<string, string>
---@param columnName string
---@return string
local function resolveColumnName(columnMap, columnName)
  if not columnMap then
    return columnName
  end

  return columnMap[columnName] or columnName
end

---@param tbl KuraDBTable<any, any, any>|string
---@return KuraDBResolvedTable
local function resolveTable(tbl)
  if type(tbl) == 'string' then
    local resolved = db.tables and db.tables[tbl]
    if resolved then return resolved end
    return { schema = 'public', name = tbl, columns = nil, primaryKey = {} }
  end

  return tbl
end

-- ============================================================
-- SQL Compiler
-- ============================================================

local function newCompilerState()
  return { paramIndex = 0, parameters = {} }
end

local function addParam(state, value)
  state.paramIndex = state.paramIndex + 1
  state.parameters[state.paramIndex] = value
  return '$' .. state.paramIndex
end

local function quote(name)
  return '"' .. name .. '"'
end

local function formatTable(schema, name)
  return quote(schema) .. '.' .. quote(name)
end

---@param state table
---@param cond table
---@param columnMap? table<string, string>
---@return string
local function buildCondition(state, cond, columnMap)
  local t = cond.type

  if t == 'comparison' then
    return quote(resolveColumnName(columnMap, cond.column)) .. ' ' .. cond.operator .. ' ' .. addParam(state, cond.value)
  end

  if t == 'like' then
    return quote(resolveColumnName(columnMap, cond.column)) .. ' LIKE ' .. addParam(state, cond.value)
  end

  if t == 'ilike' then
    return quote(resolveColumnName(columnMap, cond.column)) .. ' ILIKE ' .. addParam(state, cond.value)
  end

  if t == 'in' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(resolveColumnName(columnMap, cond.column)) .. ' IN (' .. table.concat(placeholders, ', ') .. ')'
  end

  if t == 'notIn' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(resolveColumnName(columnMap, cond.column)) .. ' NOT IN (' .. table.concat(placeholders, ', ') .. ')'
  end

  if t == 'isNull' then
    return quote(resolveColumnName(columnMap, cond.column)) .. ' IS NULL'
  end

  if t == 'isNotNull' then
    return quote(resolveColumnName(columnMap, cond.column)) .. ' IS NOT NULL'
  end

  if t == 'and' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c, columnMap) .. ')'
    end
    return table.concat(parts, ' AND ')
  end

  if t == 'or' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c, columnMap) .. ')'
    end
    return table.concat(parts, ' OR ')
  end

  if t == 'not' then
    return 'NOT (' .. buildCondition(state, cond.condition, columnMap) .. ')'
  end

  error('Unknown condition type: ' .. tostring(t))
end

-- ============================================================
-- Execute helper
-- ============================================================

local function awaitQuery(method, sql, params)
  local p = promise.new()

  kuradb[method](nil, sql, params, function(result, error)
    if error then
      return p:reject(error)
    end
    p:resolve(result)
  end, resourceName, true)

  return Await(p)
end

-- ============================================================
-- SelectBuilder
-- ============================================================

local SelectBuilder = {}
SelectBuilder.__index = SelectBuilder

---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>|string
---@return KuraSelectBuilder<TRow>
function SelectBuilder:from(tbl)
  tbl = resolveTable(tbl)
  self._schema = tbl.schema
  self._table = tbl.name
  self._columnsMap = tbl.columns
  return self
end

function SelectBuilder:where(condition)
  self._where = condition
  return self
end

function SelectBuilder:orderBy(orders)
  self._orderBy = orders
  return self
end

function SelectBuilder:limit(n)
  self._limit = n
  return self
end

function SelectBuilder:offset(n)
  self._offset = n
  return self
end

function SelectBuilder:toSQL()
  local state = newCompilerState()
  local parts = {}

  if self._columns and #self._columns > 0 then
    local cols = {}
    for _, c in ipairs(self._columns) do
      cols[#cols + 1] = quote(resolveColumnName(self._columnsMap, c))
    end
    parts[#parts + 1] = 'SELECT ' .. table.concat(cols, ', ')
  else
    parts[#parts + 1] = 'SELECT *'
  end

  parts[#parts + 1] = 'FROM ' .. formatTable(self._schema, self._table)

  if self._where then
    parts[#parts + 1] = 'WHERE ' .. buildCondition(state, self._where, self._columnsMap)
  end

  if self._orderBy then
    local orders = {}
    for col, dir in pairs(self._orderBy) do
      orders[#orders + 1] = quote(resolveColumnName(self._columnsMap, col)) .. ' ' .. string.upper(dir)
    end
    if #orders > 0 then
      parts[#parts + 1] = 'ORDER BY ' .. table.concat(orders, ', ')
    end
  end

  if self._limit then
    parts[#parts + 1] = 'LIMIT ' .. addParam(state, self._limit)
  end

  if self._offset then
    parts[#parts + 1] = 'OFFSET ' .. addParam(state, self._offset)
  end

  return table.concat(parts, ' '), state.parameters
end

function SelectBuilder:await()
  local sql, params = self:toSQL()
  return awaitQuery('query', sql, params)
end

-- ============================================================
-- InsertBuilder
-- ============================================================

local InsertBuilder = {}
InsertBuilder.__index = InsertBuilder

---@generic TInsert
---@param values TInsert
---@return KuraInsertBuilder<TInsert>
function InsertBuilder:values(values)
  self._values = values
  return self
end

function InsertBuilder:returning(columns)
  self._returning = columns or { '*' }
  return self
end

function InsertBuilder:toSQL()
  local state = newCompilerState()

  local cols = {}
  local vals = {}
  for col, val in pairs(self._values) do
    cols[#cols + 1] = quote(resolveColumnName(self._columnsMap, col))
    vals[#vals + 1] = addParam(state, val)
  end

  local sql = 'INSERT INTO ' .. formatTable(self._schema, self._table) ..
    ' (' .. table.concat(cols, ', ') .. ')' ..
    ' VALUES (' .. table.concat(vals, ', ') .. ')'

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(resolveColumnName(self._columnsMap, c))
    end
    sql = sql .. ' RETURNING ' .. table.concat(ret, ', ')
  end

  return sql, state.parameters
end

function InsertBuilder:await()
  local sql, params = self:toSQL()
  return awaitQuery('insert', sql, params)
end

-- ============================================================
-- UpdateBuilder
-- ============================================================

local UpdateBuilder = {}
UpdateBuilder.__index = UpdateBuilder

---@generic TUpdate
---@param values TUpdate
---@return KuraUpdateBuilder<TUpdate>
function UpdateBuilder:set(values)
  self._set = values
  return self
end

function UpdateBuilder:where(condition)
  self._where = condition
  return self
end

function UpdateBuilder:returning(columns)
  self._returning = columns or { '*' }
  return self
end

function UpdateBuilder:toSQL()
  local state = newCompilerState()

  local sets = {}
  for col, val in pairs(self._set) do
    sets[#sets + 1] = quote(resolveColumnName(self._columnsMap, col)) .. ' = ' .. addParam(state, val)
  end

  local sql = 'UPDATE ' .. formatTable(self._schema, self._table) ..
    ' SET ' .. table.concat(sets, ', ')

  if self._where then
    sql = sql .. ' WHERE ' .. buildCondition(state, self._where, self._columnsMap)
  end

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(resolveColumnName(self._columnsMap, c))
    end
    sql = sql .. ' RETURNING ' .. table.concat(ret, ', ')
  end

  return sql, state.parameters
end

function UpdateBuilder:await()
  local sql, params = self:toSQL()
  return awaitQuery('update', sql, params)
end

-- ============================================================
-- DeleteBuilder
-- ============================================================

local DeleteBuilder = {}
DeleteBuilder.__index = DeleteBuilder

function DeleteBuilder:where(condition)
  self._where = condition
  return self
end

function DeleteBuilder:returning(columns)
  self._returning = columns or { '*' }
  return self
end

function DeleteBuilder:toSQL()
  local state = newCompilerState()

  local sql = 'DELETE FROM ' .. formatTable(self._schema, self._table)

  if self._where then
    sql = sql .. ' WHERE ' .. buildCondition(state, self._where, self._columnsMap)
  end

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(resolveColumnName(self._columnsMap, c))
    end
    sql = sql .. ' RETURNING ' .. table.concat(ret, ', ')
  end

  return sql, state.parameters
end

function DeleteBuilder:await()
  local sql, params = self:toSQL()
  return awaitQuery('update', sql, params)
end

-- ============================================================
-- Query builder entry point — kura.db.*
-- ============================================================

---@param columns? string[]
---@return KuraSelectBuilder<table>
local function dbSelect(columns)
  return setmetatable({
    _columns = columns,
    _schema = nil,
    _table = nil,
    _columnsMap = nil,
    _where = nil,
    _orderBy = nil,
    _limit = nil,
    _offset = nil,
  }, SelectBuilder)
end

---@overload fun(tbl: string): KuraInsertBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraInsertBuilder<TInsert>
local function dbInsert(tbl)
  tbl = resolveTable(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _columnsMap = tbl.columns,
    _values = nil,
    _returning = nil,
  }, InsertBuilder)
end

---@overload fun(tbl: string): KuraUpdateBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraUpdateBuilder<TUpdate>
local function dbUpdate(tbl)
  tbl = resolveTable(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _columnsMap = tbl.columns,
    _set = nil,
    _where = nil,
    _returning = nil,
  }, UpdateBuilder)
end

---@overload fun(tbl: string): KuraDeleteBuilder
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraDeleteBuilder
local function dbDelete(tbl)
  tbl = resolveTable(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _columnsMap = tbl.columns,
    _where = nil,
    _returning = nil,
  }, DeleteBuilder)
end

db.select = dbSelect
db.insert = dbInsert
db.update = dbUpdate
db.delete = dbDelete
