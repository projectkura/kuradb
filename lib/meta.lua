---@meta

---@alias KuraDBOrderDirection 'asc'|'desc'

---@class KuraDBCondition

---@class KuraDBResolvedTable
---@field schema string
---@field name string
---@field columns table<string, string>?
---@field primaryKey string[]

---@class KuraDBTable<TRow, TInsert, TUpdate> : KuraDBResolvedTable

---@class KuraDBRawCallable<TResult>
---@field await fun(query: string|number, parameters?: table): TResult

---@class KuraDBRawWriteCallable<TResult>
---@field await fun(query: string|number, parameters?: table): TResult

---@class KuraDBReady
---@field await fun(cb?: function): boolean
---@operator call: fun(cb?: function): nil

---@class KuraDBRawNamespace
---@field query KuraDBRawCallable<table[]>
---@field single KuraDBRawCallable<table|nil>
---@field scalar KuraDBRawCallable<any>
---@field insert KuraDBRawWriteCallable<any>
---@field update KuraDBRawWriteCallable<number>
---@field prepare KuraDBRawCallable<any>
---@field execute { await: fun(query: string|number, parameters?: table): any }
---@field transaction { await: fun(query: table, parameters?: table, transactionOptions?: table): boolean }
---@field batch { await: fun(query: string, parameterSets: table[], batchOptions?: table): any[] }
---@field insertMany { await: fun(target: string, rows: table[], insertOptions?: table): any }
---@field notify { await: fun(channel: string, payload?: string): boolean }
---@field listen { await: fun(channel: string, onNotify: function, listenOptions?: table): table }
---@field unlisten { await: fun(subscriptionId: number): boolean }
---@field copyFrom { await: fun(query: string, input: any, copyOptions?: table): table }
---@field copyTo { await: fun(query: string, copyOptions?: table): string }

---@class KuraDBOperators
---@field eq fun(column: string, value: any): KuraDBCondition
---@field ne fun(column: string, value: any): KuraDBCondition
---@field lt fun(column: string, value: any): KuraDBCondition
---@field lte fun(column: string, value: any): KuraDBCondition
---@field gt fun(column: string, value: any): KuraDBCondition
---@field gte fun(column: string, value: any): KuraDBCondition
---@field like fun(column: string, pattern: string): KuraDBCondition
---@field ilike fun(column: string, pattern: string): KuraDBCondition
---@field inArray fun(column: string, values: any[]): KuraDBCondition
---@field notInArray fun(column: string, values: any[]): KuraDBCondition
---@field isNull fun(column: string): KuraDBCondition
---@field isNotNull fun(column: string): KuraDBCondition
---@field and_ fun(...: KuraDBCondition): KuraDBCondition
---@field or_ fun(...: KuraDBCondition): KuraDBCondition
---@field not_ fun(condition: KuraDBCondition): KuraDBCondition

---@class KuraSelectBuilder<TRow>
local KuraSelectBuilder = {}

---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>|string
---@return KuraSelectBuilder<TRow>
function KuraSelectBuilder:from(tbl) end

---@param condition KuraDBCondition
---@return self
function KuraSelectBuilder:where(condition) end

---@param orders table<string, KuraDBOrderDirection>
---@return self
function KuraSelectBuilder:orderBy(orders) end

---@param n number
---@return self
function KuraSelectBuilder:limit(n) end

---@param n number
---@return self
function KuraSelectBuilder:offset(n) end

---@return { sql: string, parameters: unknown[] }
function KuraSelectBuilder:toSQL() end

---@return TRow[]
function KuraSelectBuilder:await() end

---@class KuraInsertBuilder<TInsert>
local KuraInsertBuilder = {}

---@param values TInsert
---@return self
function KuraInsertBuilder:values(values) end

---@param columns? string[]
---@return self
function KuraInsertBuilder:returning(columns) end

---@return { sql: string, parameters: unknown[] }
function KuraInsertBuilder:toSQL() end

---@return any
function KuraInsertBuilder:await() end

---@class KuraUpdateBuilder<TUpdate>
local KuraUpdateBuilder = {}

---@param values TUpdate
---@return self
function KuraUpdateBuilder:set(values) end

---@param condition KuraDBCondition
---@return self
function KuraUpdateBuilder:where(condition) end

---@param columns? string[]
---@return self
function KuraUpdateBuilder:returning(columns) end

---@return { sql: string, parameters: unknown[] }
function KuraUpdateBuilder:toSQL() end

---@return number
function KuraUpdateBuilder:await() end

---@class KuraDeleteBuilder
local KuraDeleteBuilder = {}

---@param condition KuraDBCondition
---@return self
function KuraDeleteBuilder:where(condition) end

---@param columns? string[]
---@return self
function KuraDeleteBuilder:returning(columns) end

---@return { sql: string, parameters: unknown[] }
function KuraDeleteBuilder:toSQL() end

---@return number
function KuraDeleteBuilder:await() end

---@class kuradb
---@field raw KuraDBRawNamespace
---@field op KuraDBOperators
---@field tables kuradb_schema
---@field store fun(query: string, cb?: function): integer
---@field ready KuraDBReady

local kuradb = {}

---@param columns? string[]
---@return KuraSelectBuilder<table>
function kuradb.select(columns) end

---@overload fun(tbl: string): KuraInsertBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>
---@return KuraInsertBuilder<TInsert>
function kuradb.insert(tbl) end

---@overload fun(tbl: string): KuraUpdateBuilder<table>
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>
---@return KuraUpdateBuilder<TUpdate>
function kuradb.update(tbl) end

---@param cb fun(query: function): boolean
---@param transactionOptions? table
---@return boolean
function kuradb.transaction(cb, transactionOptions) end

---@overload fun(tbl: string): KuraDeleteBuilder
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>
---@return KuraDeleteBuilder
function kuradb.delete(tbl) end
