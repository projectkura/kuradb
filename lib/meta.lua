---@meta

---@alias KuraDBOrderDirection 'asc'|'desc'
---@alias KuraDBColumnInput string|KuraDBColumnRef<any>

---@class KuraDBCondition

---@generic TValue
---@class KuraDBColumnRef<TValue>
---@field schema string
---@field table string
---@field luaName string
---@field sqlName string
---@field kind string
---@field nullable boolean

---@class KuraDBResolvedTable
---@field schema string
---@field name string
---@field columns table<string, string>?
---@field columnOrder string[]?
---@field columnRefs table<string, KuraDBColumnRef<any>>?
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
---@field eq fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field ne fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field lt fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field lte fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field gt fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field gte fun(column: KuraDBColumnInput, value: any): KuraDBCondition
---@field like fun(column: KuraDBColumnInput, pattern: string): KuraDBCondition
---@field ilike fun(column: KuraDBColumnInput, pattern: string): KuraDBCondition
---@field inArray fun(column: KuraDBColumnInput, values: any[]): KuraDBCondition
---@field notInArray fun(column: KuraDBColumnInput, values: any[]): KuraDBCondition
---@field isNull fun(column: KuraDBColumnInput): KuraDBCondition
---@field isNotNull fun(column: KuraDBColumnInput): KuraDBCondition
---@field and_ fun(...: KuraDBCondition): KuraDBCondition
---@field or_ fun(...: KuraDBCondition): KuraDBCondition
---@field not_ fun(condition: KuraDBCondition): KuraDBCondition

---@class KuraDBTransactionContext
---@field select fun(columns?: KuraDBColumnInput[]): KuraSelectBuilder<table>
---@field insert fun(tbl: KuraDBTable<any, any, any>|string): KuraInsertBuilder<table>
---@field update fun(tbl: KuraDBTable<any, any, any>|string): KuraUpdateBuilder<table>
---@field delete fun(tbl: KuraDBTable<any, any, any>|string): KuraDeleteBuilder

---@class KuraDBTransactionCallable
---@field await fun(cb: fun(query: function, tx: KuraDBTransactionContext): any, transactionOptions?: table): any|false
---@operator call: fun(cb: fun(query: function, tx: KuraDBTransactionContext): any, transactionOptions?: table): any|false

---@class KuraSelectBuilder<TRow>
local KuraSelectBuilder = {}

---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>|string
---@return KuraSelectBuilder<TRow>
function KuraSelectBuilder:from(tbl) end

---@param condition KuraDBCondition
---@return self
function KuraSelectBuilder:where(condition) end

---@param orders table<any, KuraDBOrderDirection>
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

---@return self
function KuraSelectBuilder:first() end

---@return self
function KuraSelectBuilder:maybeSingle() end

---@return self
function KuraSelectBuilder:single() end

---@return self
function KuraSelectBuilder:exists() end

---@return self
function KuraSelectBuilder:forUpdate() end

---@return TRow[]
function KuraSelectBuilder:await() end

---@class KuraInsertBuilder<TInsert>
local KuraInsertBuilder = {}

---@param values TInsert
---@return self
function KuraInsertBuilder:values(values) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraInsertBuilder:returning(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraInsertBuilder:returningRows(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraInsertBuilder:returningOne(columns) end

---@param column KuraDBColumnInput
---@return self
function KuraInsertBuilder:returningValue(column) end

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

---@param columns? KuraDBColumnInput[]
---@return self
function KuraUpdateBuilder:returning(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraUpdateBuilder:returningRows(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraUpdateBuilder:returningOne(columns) end

---@param column KuraDBColumnInput
---@return self
function KuraUpdateBuilder:returningValue(column) end

---@return { sql: string, parameters: unknown[] }
function KuraUpdateBuilder:toSQL() end

---@return number
function KuraUpdateBuilder:await() end

---@class KuraDeleteBuilder
local KuraDeleteBuilder = {}

---@param condition KuraDBCondition
---@return self
function KuraDeleteBuilder:where(condition) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraDeleteBuilder:returning(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraDeleteBuilder:returningRows(columns) end

---@param columns? KuraDBColumnInput[]
---@return self
function KuraDeleteBuilder:returningOne(columns) end

---@param column KuraDBColumnInput
---@return self
function KuraDeleteBuilder:returningValue(column) end

---@return { sql: string, parameters: unknown[] }
function KuraDeleteBuilder:toSQL() end

---@return number
function KuraDeleteBuilder:await() end

---@class kuradb
---@field raw KuraDBRawNamespace
---@field op KuraDBOperators
---@field tables kuradb_schema
---@field transaction KuraDBTransactionCallable
---@field store fun(query: string, cb?: function): integer
---@field ready KuraDBReady

local kuradb = {}

---@param columns? KuraDBColumnInput[]
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

---@overload fun(tbl: string): KuraDeleteBuilder
---@generic TRow, TInsert, TUpdate
---@param tbl KuraDBTable<TRow, TInsert, TUpdate>
---@return KuraDeleteBuilder
function kuradb.delete(tbl) end
