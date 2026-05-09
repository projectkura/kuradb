local kuradb = exports.kuradb
local resourceName = GetCurrentResourceName()
local promise = promise
local Await = Citizen.Await
local unpack = table.unpack

_ENV.kura = _ENV.kura or {}
_ENV.kura.db = _ENV.kura.db or {}
---@type kuradb
local db = _ENV.kura.db

-- ============================================================
-- Operators — kura.db.op.*
-- ============================================================

local op = {}

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.eq(column, value)
  return { type = 'comparison', column = column, operator = '=', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.ne(column, value)
  return { type = 'comparison', column = column, operator = '<>', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.lt(column, value)
  return { type = 'comparison', column = column, operator = '<', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.lte(column, value)
  return { type = 'comparison', column = column, operator = '<=', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.gt(column, value)
  return { type = 'comparison', column = column, operator = '>', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param value any
---@return table
function op.gte(column, value)
  return { type = 'comparison', column = column, operator = '>=', value = value }
end

---@param column string|KuraDBColumnRef<any>
---@param pattern string
---@return table
function op.like(column, pattern)
  return { type = 'like', column = column, value = pattern }
end

---@param column string|KuraDBColumnRef<any>
---@param pattern string
---@return table
function op.ilike(column, pattern)
  return { type = 'ilike', column = column, value = pattern }
end

---@param column string|KuraDBColumnRef<any>
---@param values any[]
---@return table
function op.inArray(column, values)
  return { type = 'in', column = column, value = values }
end

---@param column string|KuraDBColumnRef<any>
---@param values any[]
---@return table
function op.notInArray(column, values)
  return { type = 'notIn', column = column, value = values }
end

---@param column string|KuraDBColumnRef<any>
---@return table
function op.isNull(column)
  return { type = 'isNull', column = column }
end

---@param column string|KuraDBColumnRef<any>
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
-- Table / column resolution
-- ============================================================

---@param column unknown
---@return boolean
local function isColumnRef(column)
  return type(column) == 'table'
    and type(column.sqlName) == 'string'
    and type(column.luaName) == 'string'
end

---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@return table<string, string>|nil
local function buildSqlToLuaLookup(columnRefs)
  if not columnRefs then
    return nil
  end

  local lookup = {}
  for luaName, ref in pairs(columnRefs) do
    lookup[ref.sqlName] = luaName
  end
  return lookup
end

local quote

---@param columnMap? table<string, string>
---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@param sqlToLua? table<string, string>
---@param column string|KuraDBColumnRef<any>
---@return string, string?
local function normalizeColumn(columnMap, columnRefs, sqlToLua, column)
  if isColumnRef(column) then
    return column.sqlName, column.luaName
  end

  if type(column) ~= 'string' then
    error(("Expected column to be a string or generated column reference, received '%s'"):format(type(column)))
  end

  if columnMap and columnMap[column] then
    return columnMap[column], column
  end

  if sqlToLua and sqlToLua[column] then
    return column, sqlToLua[column]
  end

  if columnRefs then
    for luaName, ref in pairs(columnRefs) do
      if ref.sqlName == column then
        return ref.sqlName, luaName
      end
    end
  end

  return column, nil
end

---@param columnMap? table<string, string>
---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@param sqlToLua? table<string, string>
---@param column string|KuraDBColumnRef<any>
---@return string
local function resolveColumnName(columnMap, columnRefs, sqlToLua, column)
  local sqlName = normalizeColumn(columnMap, columnRefs, sqlToLua, column)
  return sqlName
end

---@param columnMap? table<string, string>
---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@param sqlToLua? table<string, string>
---@param column string|KuraDBColumnRef<any>
---@return string
local function formatSelectableColumn(columnMap, columnRefs, sqlToLua, column)
  local sqlName, luaName = normalizeColumn(columnMap, columnRefs, sqlToLua, column)
  local expression = quote(sqlName)

  if luaName then
    return expression .. ' AS ' .. quote(luaName)
  end

  return expression
end

---@param columnMap? table<string, string>
---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@param sqlToLua? table<string, string>
---@param columns table|nil
---@return string[]
local function buildSelectableColumns(columnMap, columnRefs, sqlToLua, columns)
  local resolved = {}

  if columns and #columns > 0 then
    for _, column in ipairs(columns) do
      resolved[#resolved + 1] = formatSelectableColumn(columnMap, columnRefs, sqlToLua, column)
    end
    return resolved
  end

  if columnRefs then
    if columns == nil then
      local columnOrder = {}
      for luaName in pairs(columnRefs) do
        columnOrder[#columnOrder + 1] = luaName
      end
      table.sort(columnOrder)

      for _, luaName in ipairs(columnOrder) do
        resolved[#resolved + 1] = formatSelectableColumn(
          columnMap,
          columnRefs,
          sqlToLua,
          columnRefs[luaName]
        )
      end
    end
  end

  return resolved
end

---@param tbl KuraDBTable<any, any, any>|string
---@return KuraDBResolvedTable
local function resolveTable(tbl)
  if type(tbl) == 'string' then
    local resolved = db.tables and db.tables[tbl]
    if resolved then
      return resolved
    end

    return {
      schema = 'public',
      name = tbl,
      columns = nil,
      columnOrder = nil,
      columnRefs = nil,
      primaryKey = {},
    }
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

quote = function(name)
  return '"' .. tostring(name):gsub('"', '""') .. '"'
end

local function formatTable(schema, name)
  return quote(schema) .. '.' .. quote(name)
end

---@param state table
---@param cond table
---@param columnMap? table<string, string>
---@param columnRefs? table<string, KuraDBColumnRef<any>>
---@param sqlToLua? table<string, string>
---@return string
local function buildCondition(state, cond, columnMap, columnRefs, sqlToLua)
  local t = cond.type

  if t == 'comparison' then
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column))
      .. ' '
      .. cond.operator
      .. ' '
      .. addParam(state, cond.value)
  end

  if t == 'like' then
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column))
      .. ' LIKE '
      .. addParam(state, cond.value)
  end

  if t == 'ilike' then
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column))
      .. ' ILIKE '
      .. addParam(state, cond.value)
  end

  if t == 'in' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column))
      .. ' IN ('
      .. table.concat(placeholders, ', ')
      .. ')'
  end

  if t == 'notIn' then
    local placeholders = {}
    for _, v in ipairs(cond.value) do
      placeholders[#placeholders + 1] = addParam(state, v)
    end
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column))
      .. ' NOT IN ('
      .. table.concat(placeholders, ', ')
      .. ')'
  end

  if t == 'isNull' then
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column)) .. ' IS NULL'
  end

  if t == 'isNotNull' then
    return quote(resolveColumnName(columnMap, columnRefs, sqlToLua, cond.column)) .. ' IS NOT NULL'
  end

  if t == 'and' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c, columnMap, columnRefs, sqlToLua) .. ')'
    end
    return table.concat(parts, ' AND ')
  end

  if t == 'or' then
    local parts = {}
    for _, c in ipairs(cond.conditions) do
      parts[#parts + 1] = '(' .. buildCondition(state, c, columnMap, columnRefs, sqlToLua) .. ')'
    end
    return table.concat(parts, ' OR ')
  end

  if t == 'not' then
    return 'NOT (' .. buildCondition(state, cond.condition, columnMap, columnRefs, sqlToLua) .. ')'
  end

  error('Unknown condition type: ' .. tostring(t))
end

-- ============================================================
-- Execute helpers
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

---@param result table
---@return any
local function extractFirstScalar(result)
  if not result then
    return nil
  end

  local values = {}
  for _, value in pairs(result) do
    values[#values + 1] = value
  end

  return values[1]
end

---@param builder table
---@param method string
---@param sql string
---@param params table
---@return any
local function executeBuilderQuery(builder, method, sql, params)
  local executor = builder._executor or awaitQuery
  return executor(method, sql, params)
end

local function assertForUpdateContext(builder)
  if builder._forUpdate and not builder._transactionBound then
    error(
      'forUpdate() requires a transaction context. Use kura.db.transaction(function(query, tx) ... tx.select():forUpdate() ... end)'
    )
  end
end

local function buildOrderByClause(columnMap, columnRefs, sqlToLua, orderBy)
  if not orderBy then
    return nil
  end

  local orders = {}
  for col, dir in pairs(orderBy) do
    orders[#orders + 1] = quote(resolveColumnName(
      columnMap,
      columnRefs,
      sqlToLua,
      col
    )) .. ' ' .. string.upper(dir)
  end

  if #orders == 0 then
    return nil
  end

  return 'ORDER BY ' .. table.concat(orders, ', ')
end

local function buildSelectSourceParts(builder, state)
  local parts = {
    'FROM ' .. formatTable(builder._schema, builder._table),
  }

  if builder._where then
    parts[#parts + 1] = 'WHERE ' .. buildCondition(
      state,
      builder._where,
      builder._columnsMap,
      builder._columnRefs,
      builder._columnSqlToLua
    )
  end

  local orderByClause = buildOrderByClause(
    builder._columnsMap,
    builder._columnRefs,
    builder._columnSqlToLua,
    builder._orderBy
  )
  if orderByClause then
    parts[#parts + 1] = orderByClause
  end

  return parts
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
  self._columnOrder = tbl.columnOrder
  self._columnRefs = tbl.columnRefs
  self._columnSqlToLua = buildSqlToLuaLookup(tbl.columnRefs)
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

function SelectBuilder:first()
  self._resultMode = 'first'
  if not self._limit or self._limit > 1 then
    self._limit = 1
  end
  return self
end

function SelectBuilder:maybeSingle()
  self._resultMode = 'maybeSingle'
  if not self._limit or self._limit > 2 then
    self._limit = 2
  end
  return self
end

function SelectBuilder:single()
  self._resultMode = 'single'
  if not self._limit or self._limit > 2 then
    self._limit = 2
  end
  return self
end

function SelectBuilder:exists()
  self._resultMode = 'exists'
  return self
end

function SelectBuilder:forUpdate()
  self._forUpdate = true
  return self
end

function SelectBuilder:toSQL()
  assertForUpdateContext(self)

  local state = newCompilerState()
  local parts = {}

  if self._resultMode == 'exists' then
    local innerParts = { 'SELECT 1' }
    local sourceParts = buildSelectSourceParts(self, state)
    for _, part in ipairs(sourceParts) do
      innerParts[#innerParts + 1] = part
    end

    if self._limit ~= nil then
      innerParts[#innerParts + 1] = 'LIMIT ' .. addParam(state, self._limit)
    else
      innerParts[#innerParts + 1] = 'LIMIT 1'
    end

    if self._offset ~= nil then
      innerParts[#innerParts + 1] = 'OFFSET ' .. addParam(state, self._offset)
    end

    if self._forUpdate then
      innerParts[#innerParts + 1] = 'FOR UPDATE'
    end

    return 'SELECT EXISTS(' .. table.concat(innerParts, ' ') .. ') AS ' .. quote('exists'), state.parameters
  end

  local cols = {}
  if self._columns and #self._columns > 0 then
    for _, column in ipairs(self._columns) do
      cols[#cols + 1] = formatSelectableColumn(
        self._columnsMap,
        self._columnRefs,
        self._columnSqlToLua,
        column
      )
    end
  elseif self._columnRefs then
    local orderedColumns = self._columnOrder
    if orderedColumns and #orderedColumns > 0 then
      for _, luaName in ipairs(orderedColumns) do
        local columnRef = self._columnRefs[luaName]
        if columnRef then
          cols[#cols + 1] = formatSelectableColumn(
            self._columnsMap,
            self._columnRefs,
            self._columnSqlToLua,
            columnRef
          )
        end
      end
    else
      local fallbackColumns = buildSelectableColumns(
        self._columnsMap,
        self._columnRefs,
        self._columnSqlToLua,
        nil
      )
      for _, column in ipairs(fallbackColumns) do
        cols[#cols + 1] = column
      end
    end
  end

  if #cols > 0 then
    parts[#parts + 1] = 'SELECT ' .. table.concat(cols, ', ')
  else
    parts[#parts + 1] = 'SELECT *'
  end

  local sourceParts = buildSelectSourceParts(self, state)
  for _, part in ipairs(sourceParts) do
    parts[#parts + 1] = part
  end

  if self._limit ~= nil then
    parts[#parts + 1] = 'LIMIT ' .. addParam(state, self._limit)
  end

  if self._offset ~= nil then
    parts[#parts + 1] = 'OFFSET ' .. addParam(state, self._offset)
  end

  if self._forUpdate then
    parts[#parts + 1] = 'FOR UPDATE'
  end

  return table.concat(parts, ' '), state.parameters
end

function SelectBuilder:await()
  local sql, params = self:toSQL()
  local rows = executeBuilderQuery(self, 'query', sql, params)
  local mode = self._resultMode

  if mode == 'first' then
    return rows[1]
  end

  if mode == 'exists' then
    return not not (rows[1] and rows[1].exists)
  end

  if mode == 'maybeSingle' then
    if rows[2] ~= nil then
      error('Query returned more than one row for maybeSingle().')
    end
    return rows[1]
  end

  if mode == 'single' then
    if rows[1] == nil then
      error('Query returned no rows for single().')
    end
    if rows[2] ~= nil then
      error('Query returned more than one row for single().')
    end
    return rows[1]
  end

  return rows
end

-- ============================================================
-- Write builder helpers
-- ============================================================

---@param builder table
---@param columns table|nil
---@param resultMode string
---@return table
local function setReturning(builder, columns, resultMode)
  builder._returning = columns or { '*' }
  builder._writeResultMode = resultMode
  return builder
end

---@param builder table
---@return string[]
local function buildReturningExpressions(builder)
  local ret = {}
  for _, column in ipairs(builder._returning) do
    if column == '*' then
      ret[#ret + 1] = '*'
    else
      ret[#ret + 1] = formatSelectableColumn(
        builder._columnsMap,
        builder._columnRefs,
        builder._columnSqlToLua,
        column
      )
    end
  end
  return ret
end

---@param builder table
---@return any
local function awaitWrite(builder)
  local sql, params = builder:toSQL()
  local resultMode = builder._writeResultMode or 'compat'

  if resultMode == 'compat' then
    return executeBuilderQuery(builder, builder._defaultMethod, sql, params)
  end

  local rows = executeBuilderQuery(builder, 'query', sql, params)

  if resultMode == 'rows' then
    return rows
  end

  if resultMode == 'one' then
    return rows[1]
  end

  if resultMode == 'value' then
    return extractFirstScalar(rows[1])
  end

  return rows
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
  return setReturning(self, columns, 'compat')
end

function InsertBuilder:returningRows(columns)
  return setReturning(self, columns, 'rows')
end

function InsertBuilder:returningOne(columns)
  return setReturning(self, columns, 'one')
end

function InsertBuilder:returningValue(column)
  return setReturning(self, { column }, 'value')
end

function InsertBuilder:toSQL()
  local state = newCompilerState()

  local cols = {}
  local vals = {}
  for col, val in pairs(self._values) do
    cols[#cols + 1] = quote(resolveColumnName(
      self._columnsMap,
      self._columnRefs,
      self._columnSqlToLua,
      col
    ))
    vals[#vals + 1] = addParam(state, val)
  end

  local sql = 'INSERT INTO '
    .. formatTable(self._schema, self._table)
    .. ' ('
    .. table.concat(cols, ', ')
    .. ')'
    .. ' VALUES ('
    .. table.concat(vals, ', ')
    .. ')'

  if self._returning then
    sql = sql .. ' RETURNING ' .. table.concat(buildReturningExpressions(self), ', ')
  end

  return sql, state.parameters
end

function InsertBuilder:await()
  return awaitWrite(self)
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
  return setReturning(self, columns, 'compat')
end

function UpdateBuilder:returningRows(columns)
  return setReturning(self, columns, 'rows')
end

function UpdateBuilder:returningOne(columns)
  return setReturning(self, columns, 'one')
end

function UpdateBuilder:returningValue(column)
  return setReturning(self, { column }, 'value')
end

function UpdateBuilder:toSQL()
  local state = newCompilerState()

  local sets = {}
  for col, val in pairs(self._set) do
    sets[#sets + 1] = quote(resolveColumnName(
      self._columnsMap,
      self._columnRefs,
      self._columnSqlToLua,
      col
    )) .. ' = ' .. addParam(state, val)
  end

  local sql = 'UPDATE ' .. formatTable(self._schema, self._table) .. ' SET ' .. table.concat(sets, ', ')

  if self._where then
    sql = sql .. ' WHERE ' .. buildCondition(
      state,
      self._where,
      self._columnsMap,
      self._columnRefs,
      self._columnSqlToLua
    )
  end

  if self._returning then
    sql = sql .. ' RETURNING ' .. table.concat(buildReturningExpressions(self), ', ')
  end

  return sql, state.parameters
end

function UpdateBuilder:await()
  return awaitWrite(self)
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
  return setReturning(self, columns, 'compat')
end

function DeleteBuilder:returningRows(columns)
  return setReturning(self, columns, 'rows')
end

function DeleteBuilder:returningOne(columns)
  return setReturning(self, columns, 'one')
end

function DeleteBuilder:returningValue(column)
  return setReturning(self, { column }, 'value')
end

function DeleteBuilder:toSQL()
  local state = newCompilerState()

  local sql = 'DELETE FROM ' .. formatTable(self._schema, self._table)

  if self._where then
    sql = sql .. ' WHERE ' .. buildCondition(
      state,
      self._where,
      self._columnsMap,
      self._columnRefs,
      self._columnSqlToLua
    )
  end

  if self._returning then
    sql = sql .. ' RETURNING ' .. table.concat(buildReturningExpressions(self), ', ')
  end

  return sql, state.parameters
end

function DeleteBuilder:await()
  return awaitWrite(self)
end

-- ============================================================
-- Query builder entry point — kura.db.*
-- ============================================================

---@param columns? (string|KuraDBColumnRef<any>)[]
---@param executor? fun(method: string, sql: string, params: table): any
---@return KuraSelectBuilder<table>
local function newSelectBuilder(columns, executor)
  return setmetatable({
    _columns = columns,
    _schema = nil,
    _table = nil,
    _columnsMap = nil,
    _columnOrder = nil,
    _columnRefs = nil,
    _columnSqlToLua = nil,
    _where = nil,
    _orderBy = nil,
    _limit = nil,
    _offset = nil,
    _forUpdate = false,
    _resultMode = nil,
    _executor = executor,
    _transactionBound = false,
  }, SelectBuilder)
end

---@param columns? (string|KuraDBColumnRef<any>)[]
---@return KuraSelectBuilder<table>
local function dbSelect(columns)
  return newSelectBuilder(columns, nil)
end

---@param tbl KuraDBTable<any, any, any>|string
---@param executor? fun(method: string, sql: string, params: table): any
---@return table
local function newWriteBuilder(tbl, executor, metatableValue, defaultMethod)
  tbl = resolveTable(tbl)
  return setmetatable({
    _schema = tbl.schema,
    _table = tbl.name,
    _columnsMap = tbl.columns,
    _columnOrder = tbl.columnOrder,
    _columnRefs = tbl.columnRefs,
    _columnSqlToLua = buildSqlToLuaLookup(tbl.columnRefs),
    _returning = nil,
    _writeResultMode = 'compat',
    _executor = executor,
    _defaultMethod = defaultMethod,
    _transactionBound = false,
  }, metatableValue)
end

---@overload fun(tbl: string): KuraInsertBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraInsertBuilder<TInsert>
local function dbInsert(tbl)
  local builder = newWriteBuilder(tbl, nil, InsertBuilder, 'insert')
  builder._values = nil
  return builder
end

---@overload fun(tbl: string): KuraUpdateBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraUpdateBuilder<TUpdate>
local function dbUpdate(tbl)
  local builder = newWriteBuilder(tbl, nil, UpdateBuilder, 'update')
  builder._set = nil
  builder._where = nil
  return builder
end

---@overload fun(tbl: string): KuraDeleteBuilder
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate> Table definition or table name
---@return KuraDeleteBuilder
local function dbDelete(tbl)
  local builder = newWriteBuilder(tbl, nil, DeleteBuilder, 'update')
  builder._where = nil
  return builder
end

local function createTransactionContext(executor)
  return {
    select = function(columns)
      local builder = newSelectBuilder(columns, executor)
      builder._transactionBound = true
      return builder
    end,
    insert = function(tbl)
      local builder = newWriteBuilder(tbl, executor, InsertBuilder, 'insert')
      builder._values = nil
      builder._transactionBound = true
      return builder
    end,
    update = function(tbl)
      local builder = newWriteBuilder(tbl, executor, UpdateBuilder, 'update')
      builder._set = nil
      builder._where = nil
      builder._transactionBound = true
      return builder
    end,
    delete = function(tbl)
      local builder = newWriteBuilder(tbl, executor, DeleteBuilder, 'update')
      builder._where = nil
      builder._transactionBound = true
      return builder
    end,
  }
end

db.select = dbSelect
db.insert = dbInsert
db.update = dbUpdate
db.delete = dbDelete
db._createTransactionContext = createTransactionContext
