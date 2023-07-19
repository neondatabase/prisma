import Debug from '@prisma/debug'
import { EngineSpan, TracingHelper } from '@prisma/internals'

import { PrismaClientUnknownRequestError } from '../../errors/PrismaClientUnknownRequestError'
import { prismaGraphQLToJSError } from '../../errors/utils/prismaGraphQLToJSError'
import type {
    BatchQueryEngineResult,
    EngineConfig,
    EngineEventType,
    InlineDatasource,
    InteractiveTransactionOptions,
    RequestBatchOptions,
    RequestOptions,
} from '../common/Engine'
import { Engine } from '../common/Engine'
import { EventEmitter } from '../common/types/Events'
import { JsonQuery } from '../common/types/JsonProtocol'
import { Metrics, MetricsOptionsJson, MetricsOptionsPrometheus } from '../common/types/Metrics'
import { QueryEngineResult, QueryEngineResultBatchQueryResult } from '../common/types/QueryEngine'
import type * as Tx from '../common/types/Transaction'
import { getBatchRequestPayload } from '../common/utils/getBatchRequestPayload'
import { LogLevel } from '../common/utils/log'

import init from './connector-wasm'
import * as connector from './connector-wasm'
import wasm from './connector-wasm/connector_wasm_bg.wasm'

import { Closeable, ColumnType, Library, Query, Queryable, ResultSet } from './engines/types/Library'
import { Driver } from './connector-wasm/connector_wasm'

import ws from 'ws';
import { Client, neonConfig } from '@neondatabase/serverless'
neonConfig.webSocketConstructor = ws

const MAX_RETRIES = 3

// to defer the execution of promises in the constructor
const P = Promise.resolve()

const debug = Debug('prisma:client:serverlessEngine')

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class ServerlessEngine extends Engine<undefined> {
    private inlineSchema: string
    readonly inlineSchemaHash: string
    private inlineDatasources: Record<string, InlineDatasource>
    private config: EngineConfig
    private logEmitter: EventEmitter
    private env: { [k in string]?: string }

    private clientVersion: string
    private tracingHelper: TracingHelper
    private _isInitialized: boolean
    private _client: Client

    constructor(config: EngineConfig) {
        super()

        this.config = config
        this.env = { ...this.config.env, ...process.env }
        this.inlineSchema = config.inlineSchema ?? ''
        this.inlineDatasources = config.inlineDatasources ?? {}
        this.inlineSchemaHash = config.inlineSchemaHash ?? ''
        this.clientVersion = config.clientVersion ?? 'unknown'
        this.logEmitter = config.logEmitter
        this.tracingHelper = this.config.tracingHelper
        this._isInitialized = false

        this._client = new Client({ connectionString: this.env.DATABASE_URL! })
        console.log("initialized")
    }

    on(event: EngineEventType, listener: (args?: any) => any): void {

    }

    async start() {
        if (!this._isInitialized) {
            await init(wasm)
            await this._client.connect()
            const driver = new Driver(
                async (params: Query): Promise<ResultSet> => {
                    console.log('[nodejs] calling queryRaw + 0', params)
                    const { rows, fields } = await this._client.query(params.sql, params.args)
                    const columns = fields.map(field => field.name)
                    const resultSet: ResultSet = {
                        columnNames: columns,
                        columnTypes: fields.map(field => {
                            switch (field.dataTypeID) {
                                case 25:
                                    return ColumnType.Text;
                                case 1114:
                                    return ColumnType.DateTime;
                                case 1700:
                                    return ColumnType.Numeric;
                                case 23:
                                    return ColumnType.Int64;
                                default:
                                    throw Error("unsupported column type")
                            }
                        }),
                        rows: rows.map(row => columns.map(column => row[column]))
                    };
                    console.log('[nodejs] resultSet', resultSet)

                    return resultSet
                },

                async (params: Query): Promise<number> => {
                    console.log('[nodejs] calling executeRaw', params)
                    await delay(100)

                    const affectedRows = 32
                    return affectedRows
                })
            await connector.start(this.inlineSchema, driver)
            console.log("using neondatabase/serverless engine")
            this._isInitialized = true
        }
    }

    async stop() { }

    version(forceRun?: boolean | undefined): string {
        return "1.0"
    }

    async request<T>(query: JsonQuery, options: RequestOptions<undefined>): Promise<QueryEngineResult<T>> {
        await this.start()
        console.log("new request")
        const data = JSON.parse(await connector.execute(JSON.stringify(query)))
        return { data, elapsed: 0 }
    }

    async requestBatch<T>(queries: JsonQuery[], options: RequestBatchOptions<undefined>): Promise<BatchQueryEngineResult<T>[]> {
        throw new Error("Method not implemented: requestBatch.")
    }

    transaction(action: 'start', headers: Tx.TransactionHeaders, options?: Tx.Options | undefined): Promise<Tx.InteractiveTransactionInfo<unknown>>
    transaction(action: 'commit', headers: Tx.TransactionHeaders, info: Tx.InteractiveTransactionInfo<unknown>): Promise<void>
    transaction(action: 'rollback', headers: Tx.TransactionHeaders, info: Tx.InteractiveTransactionInfo<unknown>): Promise<void>
    transaction(action: unknown, headers: unknown, info?: unknown): Promise<Tx.InteractiveTransactionInfo<unknown>> | Promise<void> {
        throw new Error("Method not implemented: txn.")
    }

    metrics(options: MetricsOptionsJson): Promise<Metrics>
    metrics(options: MetricsOptionsPrometheus): Promise<string>
    metrics(options: unknown): Promise<Metrics> | Promise<string> {
        throw new Error("Method not implemented: metrics.")
    }
}
