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

const MAX_RETRIES = 3

// to defer the execution of promises in the constructor
const P = Promise.resolve()

const debug = Debug('prisma:client:serverlessEngine')

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
        console.log("initialized")
    }

    on(event: EngineEventType, listener: (args?: any) => any): void {

    }

    async start() {
        if (!this._isInitialized) {
            await init(wasm)
            await connector.start(this.inlineSchema)
            console.log("engine initialized")
            this._isInitialized = true
        }
    }

    async stop() { }

    version(forceRun?: boolean | undefined): string {
        return "1.0"
    }

    async request<T>(query: JsonQuery, options: RequestOptions<undefined>): Promise<QueryEngineResult<T>> {
        await this.start()
        console.log("SQL:")
        await connector.to_sql(JSON.stringify(query))
        console.log("--- not implemented ---")
        throw new Error("Method not implemented: request.")
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
