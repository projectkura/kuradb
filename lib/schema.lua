_ENV.kura = _ENV.kura or {}
_ENV.kura.db = _ENV.kura.db or {}

local generatedPath = 'lib/schema.generated.lua'
local generatedSource = LoadResourceFile(GetCurrentResourceName(), generatedPath)

if not generatedSource or generatedSource == '' then
  kura.db.tables = kura.db.tables or {}
  print('^3[kuradb] Missing lib/schema.generated.lua. Run "kuradb generate" before using ORM schema metadata.^0')
  return kura.db.tables
end

local chunk, loadErr = load(generatedSource, ('@@%s/%s'):format(GetCurrentResourceName(), generatedPath))

if not chunk then
  kura.db.tables = kura.db.tables or {}
  print(('^1[kuradb] Failed to load %s: %s^0'):format(generatedPath, loadErr))
  return kura.db.tables
end

local ok, schema = pcall(chunk)

if not ok then
  kura.db.tables = kura.db.tables or {}
  print(('^1[kuradb] Failed to execute %s: %s^0'):format(generatedPath, schema))
  return kura.db.tables
end

if type(schema) == 'table' then
  kura.db.tables = schema
end

return kura.db.tables
