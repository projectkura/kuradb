local promise = promise
local Await = Citizen.Await
local resourceName = GetCurrentResourceName()
local GetResourceState = GetResourceState

local options = {
  return_callback_errors = false
}

local type = type
local queryStore = {}
local kuradb = exports.kuradb

local function awaitExport(fn, ...)
  local p = promise.new()
  local args = { ... }
  local n = select('#', ...)

  args[n + 1] = function(result, error)
    if error then
      return p:reject(error)
    end

    p:resolve(result)
  end
  args[n + 2] = resourceName
  args[n + 3] = true

  fn(nil, table.unpack(args, 1, n + 3))

  return Await(p)
end

local function safeQueryArgs(query, parameters, cb, transaction)
  local queryType = type(query)

  if queryType == 'number' then
    query = queryStore[query]
    assert(query, 'First argument received invalid query store reference')
  elseif transaction then
    if queryType ~= 'table' then
      error(("First argument expected table, received '%s'"):format(queryType))
    end
  elseif queryType ~= 'string' then
    error(("First argument expected string, received '%s'"):format(queryType))
  end

  if parameters then
    local paramType = type(parameters)

    if paramType ~= 'table' and paramType ~= 'function' then
      error(("Second argument expected table or function, received '%s'"):format(paramType))
    end

    if paramType == 'function' or parameters.__cfx_functionReference then
      cb = parameters
      parameters = nil
    end
  end

  if cb and parameters then
    local cbType = type(cb)

    if cbType ~= 'function' and (cbType == 'table' and not cb.__cfx_functionReference) then
      error(("Third argument expected function, received '%s'"):format(cbType))
    end
  end

  return query, parameters, cb
end

local function createQueryMethod(method, transaction)
  return setmetatable({
    method = method,
    await = function(query, parameters)
      query, parameters = safeQueryArgs(query, parameters, nil, transaction)
      return awaitExport(kuradb[method], query, parameters)
    end
  }, {
    __call = function(self, query, parameters, cb)
      query, parameters, cb = safeQueryArgs(query, parameters, cb, transaction)
      return kuradb[self.method](nil, query, parameters, cb, resourceName, options.return_callback_errors)
    end
  })
end

-- ============================================================
-- KuraDB root
-- ============================================================

local kuraDb = kuraDb or {}

-- ============================================================
-- KuraDB.raw — all raw SQL methods live here
-- ============================================================

kuraDb.raw = setmetatable({}, {
  __index = function(_, index)
    return function(...)
      return kuradb[index](nil, ...)
    end
  end
})

for _, method in pairs({
  'query', 'single', 'scalar', 'insert', 'update', 'prepare'
}) do
  kuraDb.raw[method] = createQueryMethod(method, false)
end

kuraDb.raw.execute = setmetatable({
  method = 'rawExecute',
  await = function(query, parameters)
    query, parameters = safeQueryArgs(query, parameters, nil, false)
    return awaitExport(kuradb.rawExecute, query, parameters)
  end
}, {
  __call = function(self, query, parameters, cb)
    query, parameters, cb = safeQueryArgs(query, parameters, cb, false)
    return kuradb[self.method](nil, query, parameters, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.transaction = setmetatable({
  await = function(query, parameters, transactionOptions)
    query, parameters = safeQueryArgs(query, parameters, nil, true)
    return awaitExport(kuradb.transaction, query, parameters, transactionOptions)
  end
}, {
  __call = function(_, query, parameters, transactionOptions, cb)
    query, parameters, cb = safeQueryArgs(query, parameters, cb, true)
    return kuradb.transaction(nil, query, parameters, transactionOptions, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.batch = setmetatable({
  await = function(query, parameterSets, batchOptions)
    assert(type(query) == 'string', "First argument expected string")
    assert(type(parameterSets) == 'table', "Second argument expected table")
    return awaitExport(kuradb.batch, query, parameterSets, batchOptions)
  end
}, {
  __call = function(_, query, parameterSets, batchOptions, cb)
    assert(type(query) == 'string', "First argument expected string")
    assert(type(parameterSets) == 'table', "Second argument expected table")
    return kuradb.batch(nil, query, parameterSets, batchOptions, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.insertMany = setmetatable({
  await = function(target, rows, insertOptions)
    assert(type(target) == 'string', "First argument expected string")
    assert(type(rows) == 'table', "Second argument expected table")
    return awaitExport(kuradb.insertMany, target, rows, insertOptions)
  end
}, {
  __call = function(_, target, rows, insertOptions, cb)
    assert(type(target) == 'string', "First argument expected string")
    assert(type(rows) == 'table', "Second argument expected table")
    return kuradb.insertMany(nil, target, rows, insertOptions, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.notify = setmetatable({
  await = function(channel, payload)
    assert(type(channel) == 'string', "First argument expected string")
    return awaitExport(kuradb.notify, channel, payload)
  end
}, {
  __call = function(_, channel, payload, cb)
    assert(type(channel) == 'string', "First argument expected string")
    return kuradb.notify(nil, channel, payload, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.listen = setmetatable({
  await = function(channel, onNotify, listenOptions)
    assert(type(channel) == 'string', "First argument expected string")
    assert(type(onNotify) == 'function' or (type(onNotify) == 'table' and onNotify.__cfx_functionReference), "Second argument expected function")
    return awaitExport(kuradb.listen, channel, onNotify, listenOptions)
  end
}, {
  __call = function(_, channel, onNotify, listenOptions, cb)
    assert(type(channel) == 'string', "First argument expected string")
    assert(type(onNotify) == 'function' or (type(onNotify) == 'table' and onNotify.__cfx_functionReference), "Second argument expected function")
    return kuradb.listen(nil, channel, onNotify, listenOptions, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.unlisten = setmetatable({
  await = function(subscriptionId)
    assert(type(subscriptionId) == 'number', "First argument expected number")
    return awaitExport(kuradb.unlisten, subscriptionId)
  end
}, {
  __call = function(_, subscriptionId, cb)
    assert(type(subscriptionId) == 'number', "First argument expected number")
    return kuradb.unlisten(nil, subscriptionId, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.copyFrom = setmetatable({
  await = function(query, input, copyOptions)
    assert(type(query) == 'string', "First argument expected string")
    return awaitExport(kuradb.copyFrom, query, input, copyOptions)
  end
}, {
  __call = function(_, query, input, copyOptions, cb)
    assert(type(query) == 'string', "First argument expected string")
    return kuradb.copyFrom(nil, query, input, copyOptions, cb, resourceName, options.return_callback_errors)
  end
})

kuraDb.raw.copyTo = setmetatable({
  await = function(query, copyOptions)
    assert(type(query) == 'string', "First argument expected string")
    return awaitExport(kuradb.copyTo, query, copyOptions)
  end
}, {
  __call = function(_, query, copyOptions, cb)
    assert(type(query) == 'string', "First argument expected string")
    return kuradb.copyTo(nil, query, copyOptions, cb, resourceName, options.return_callback_errors)
  end
})

-- ============================================================
-- Top-level utilities (not raw SQL, stay on KuraDB directly)
-- ============================================================

function kuraDb.store(query, cb)
  assert(type(query) == 'string', 'The SQL query must be a string')

  local storeId = #queryStore + 1
  queryStore[storeId] = query

  return cb and cb(storeId) or storeId
end

local function onReady(cb)
  while GetResourceState('kuradb') ~= 'started' do
    Wait(50)
  end

  kuradb.awaitConnection()

  return cb and cb() or true
end

kuraDb.ready = setmetatable({
  await = onReady
}, {
  __call = function(_, cb)
    Citizen.CreateThreadNow(function()
      onReady(cb)
    end)
  end,
})

function kuraDb.transaction(cb, transactionOptions)
  return kuradb.startTransaction(nil, cb, transactionOptions, nil, resourceName, true)
end

_ENV.kuraDb = kuraDb
