local kuradb = exports.kuradb
local resourceName = GetCurrentResourceName()
local promise = promise
local Await = Citizen.Await

-- ============================================================
-- Operators — KuraDB.op.*
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

kuraDb.op = op

-- Convenience globals for non-keyword operators
eq = op.eq
ne = op.ne
lt = op.lt
lte = op.lte
gt = op.gt
gte = op.gte
like = op.like
ilike = op.ilike
inArray = op.inArray
notInArray = op.notInArray
isNull = op.isNull
isNotNull = op.isNotNull

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

local function buildCondition(state, cond)
  local t = cond.type

  if t == 'comparison' then
    return quote(cond.column) .. ' ' .. cond.operator .. ' ' .. addParam(state, cond.value)
  end

  if t == 'like' then
    return quote(cond.column) .. ' LIKE ' .. addParam(state, cond.value)
  end

  if t == 'ilike' then
    return quote(cond.column) .. ' ILIKE ' .. addParam(state, cond.value)
  end

  if t == 'in' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(cond.column) .. ' IN (' .. table.concat(placeholders, ', ') .. ')'
  end

  if t == 'notIn' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(cond.column) .. ' NOT IN (' .. table.concat(placeholders, ', ') .. ')'
  end

  if t == 'isNull' then
    return quote(cond.column) .. ' IS NULL'
  end

  if t == 'isNotNull' then
    return quote(cond.column) .. ' IS NOT NULL'
  end

  if t == 'and' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c) .. ')'
    end
    return table.concat(parts, ' AND ')
  end

  if t == 'or' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c) .. ')'
    end
    return table.concat(parts, ' OR ')
  end

  if t == 'not' then
    return 'NOT (' .. buildCondition(state, cond.condition) .. ')'
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

function SelectBuilder:from(tbl)
  self._schema = tbl.schema
  self._table = tbl.name
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
      cols[#cols + 1] = quote(c)
    end
    parts[#parts + 1] = 'SELECT ' .. table.concat(cols, ', ')
  else
    parts[#parts + 1] = 'SELECT *'
  end

  parts[#parts + 1] = 'FROM ' .. formatTable(self._schema, self._table)

  if self._where then
    parts[#parts + 1] = 'WHERE ' .. buildCondition(state, self._where)
  end

  if self._orderBy then
    local orders = {}
    for col, dir in pairs(self._orderBy) do
      orders[#orders + 1] = quote(col) .. ' ' .. string.upper(dir)
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
    cols[#cols + 1] = quote(col)
    vals[#vals + 1] = addParam(state, val)
  end

  local sql = 'INSERT INTO ' .. formatTable(self._schema, self._table) ..
    ' (' .. table.concat(cols, ', ') .. ')' ..
    ' VALUES (' .. table.concat(vals, ', ') .. ')'

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(c)
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
    sets[#sets + 1] = quote(col) .. ' = ' .. addParam(state, val)
  end

  local sql = 'UPDATE ' .. formatTable(self._schema, self._table) ..
    ' SET ' .. table.concat(sets, ', ')

  if self._where then
    sql = sql .. ' WHERE ' .. buildCondition(state, self._where)
  end

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(c)
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
    sql = sql .. ' WHERE ' .. buildCondition(state, self._where)
  end

  if self._returning then
    local ret = {}
    for _, c in ipairs(self._returning) do
      ret[#ret + 1] = c == '*' and '*' or quote(c)
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
-- db entry point — KuraDB.db.*
-- ============================================================

---@param columns? string[]
---@return table SelectBuilder
local function dbSelect(columns)
  return setmetatable({
    _columns = columns,
    _schema = nil,
    _table = nil,
    _where = nil,
    _orderBy = nil,
    _limit = nil,
    _offset = nil,
  }, SelectBuilder)
end

---@param tbl table Table definition from schema
---@return table InsertBuilder
local function dbInsert(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _values = nil,
    _returning = nil,
  }, InsertBuilder)
end

---@param tbl table Table definition from schema
---@return table UpdateBuilder
local function dbUpdate(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _set = nil,
    _where = nil,
    _returning = nil,
  }, UpdateBuilder)
end

---@param tbl table Table definition from schema
---@return table DeleteBuilder
local function dbDelete(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _where = nil,
    _returning = nil,
  }, DeleteBuilder)
end

kuraDb.db = {
  select = dbSelect,
  insert = dbInsert,
  update = dbUpdate,
  delete = dbDelete,
}
