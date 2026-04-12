local promise = promise
local Await = Citizen.Await
local resourceName = GetCurrentResourceName()
local GetResourceState = GetResourceState

local options = {
  return_callback_errors = false
}

local function await(fn, query, parameters)
  local p = promise.new()

  fn(query, parameters, function(result, error)
    if error then
      return p:reject(error)
    end

    p:resolve(result)
  end, resourceName, true)

  return Await(p)
end

local type = type
local queryStore = {}

local function safeArgs(query, parameters, cb, transaction)
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

local kuradb = exports.kuradb

local methodMeta = {
  __call = function(self, query, parameters, cb)
    query, parameters, cb = safeArgs(query, parameters, cb, self.method == 'transaction')
    return kuradb[self.method](query, parameters, cb, resourceName, options.return_callback_errors)
  end
}

local KuraDB = setmetatable(KuraDB or {}, {
  __index = function(_, index)
    return function(...)
      return kuradb[index](...)
    end
  end
})

for _, method in pairs({
  'query', 'single', 'scalar', 'insert', 'update', 'prepare', 'transaction', 'rawExecute'
}) do
  KuraDB[method] = setmetatable({
    method = method,
    await = function(query, parameters)
      query, parameters = safeArgs(query, parameters, nil, method == 'transaction')
      return await(kuradb[method], query, parameters)
    end
  }, methodMeta)
end

function KuraDB.store(query, cb)
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

KuraDB.ready = setmetatable({
  await = onReady
}, {
  __call = function(_, cb)
    Citizen.CreateThreadNow(function()
      onReady(cb)
    end)
  end,
})

function KuraDB.startTransaction(cb)
  return kuradb:startTransaction(cb, resourceName)
end

_ENV.KuraDB = KuraDB
