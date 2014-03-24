///<reference path="typings/jquery/jquery.d.ts" />

module mForex {
    export class Connection {

        private isReal: boolean;
        private endpoint: string;
        private socket: WebSocket;

        private hbIntervalHandle: number;

        private protocolVersion: number = 2;

        public onOpen: () => void;
        public onClose: (ev: CloseEvent) => void;

        public onTicks: (ticks: Tick[]) => void;
        public onMarginLevel: (marginLevel: MarginLevel) => void;
        public onTradeUpdate: (trade: TradeRecord, action: TradeAction) => void;

        private lastReqId: number;
        private futures: JQueryDeferred<any>[];

        constructor(server: ServerType) {
            if (!("WebSocket" in window)) {
                throw "No Web Socket support";
            }

            this.lastReqId = 0;
            this.isReal = server === ServerType.Real;
            this.futures = new Array();

            this.endpoint = this.isReal
            ? "wss://real.api.mforex.pl/"
            : "wss://demo.api.mforex.pl/";
        }

        open() {
            this.socket = new WebSocket(this.endpoint);

            this.socket.onopen = () =>
            {
                this.hbIntervalHandle = setInterval(() => { this.sendHeartBeat(); }, 30000);
                this.onOpen();
            }

            this.socket.onclose = (ev: CloseEvent) =>
            {
                clearInterval(this.hbIntervalHandle);
                this.onClose(ev);
            }

            this.socket.onmessage = (msg: any) => {
                var packet = JSON.parse(msg.data);

                if (packet.type === "ticks") {
                    if (this.onTicks !== undefined) {
                        this.onTicks(packet.ticks);
                    }
                } else if (packet.type === "marginLevelNotify") {
                    if (this.onMarginLevel !== undefined) {
                        this.onMarginLevel(packet.marginLevel);
                    }
                } else if (packet.type === "tradeUpdate") {
                    if (this.onTradeUpdate !== undefined) {
                        this.onTradeUpdate(packet.trade, packet.action);
                    }
                } else {
                    var fut = this.futures[packet.requestId];
                    if (fut !== undefined) {
                        this.futures[packet.requestId] = null;

                        if (packet.type === "login") {
                            fut.resolve(new LoginResponse(packet.login, packet.loggedIn));
                        } else if (packet.type === "candles") {
                            this.resolvePacket(fut, packet, p => p);
                        } else if (packet.type === "instrSettings") {
                            this.resolvePacket(fut, packet, p => p.settings);
                        } else if (packet.type === "marginLevel") {
                            this.resolvePacket(fut, packet, p => p.marginLevel);
                        } else if (packet.type === "closedTrades") {
                            this.resolvePacket(fut, packet, p => p.trades);
                        } else if (packet.type === "tradesInfo") {
                            this.resolvePacket(fut, packet, p => p.trades);
                        } else if (packet.type === "tradeTransaction") {
                            this.resolvePacketAndError(fut, packet,
                                p => new TradeResponse(p.order),
                                p => new TradeError(p.order, p.ec, p.tradeEc));
                        } else if (packet.type === "heartbeat") {

                        } else if (packet.type === "sessionSchedule") {
                            this.resolvePacket(fut, packet,
                                p => new SessionSchedule(p.sessions));
                        } else if (packet.type === "accountSettings") {
                            this.resolvePacket(fut, packet,
                                p => p.settings);
                        }
                    }

                    return;
                }
            }
        }

        private sendHeartBeat(): void {
            this.sendAndCacheFuture({ type: "heartbeat", requestId: 0 });
        }

        public login(login: number, password: string): JQueryPromise<LoginResponse> {
            return this.sendAndCacheFuture({ type: "login", requestId: 0, login: login, password: password, protocolVersion: this.protocolVersion });
        }

        public requestChart(symbol: string, period: CandlePeriod, from: Date, to: Date)
            : JQueryPromise<ChartResponse> {
            return this.sendAndCacheFuture({ type: "candles", requestId: 0, fromTime: from, toTime: to, symbol: symbol, period: period });
        }

        public requestInstrumentSettings()
            : JQueryPromise<InstrumentSettings[]> {
            return this.sendAndCacheFuture({ type: "instrSettings", requestId: 0 });
        }

        public requestMarginLevel()
            : JQueryPromise<MarginLevel> {
            return this.sendAndCacheFuture({ type: "marginLevel", requestId: 0 });
        }

        public requestTradesHistory(from: Date, to: Date)
            : JQueryPromise<TradeRecord[]> {
            return this.sendAndCacheFuture({ type: "closedTrades", requestId: 0, dateFrom: from, dateTo: to });
        }

        public requestOpenTrades()
            : JQueryPromise<TradeRecord[]> {
            return this.sendAndCacheFuture({ type: "tradesInfo", requestId: 0 });
        }

        public requestSessionSchedule(symbol: string)
            : JQueryPromise<SessionSchedule> {
            return this.sendAndCacheFuture({ type: "sessionSchedule", requestId: 0, symbol: symbol });
        }

        public requestOpenOrder(symbol: string, tradeCommand: TradeCommand,
            stopLoss: number, takeProfit: number,
            volume: number, comment: string)
            : JQueryPromise<TradeResponse> {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: tradeCommand,
                transactionType: TransactionType.Open,
                price: 0.0,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                symbol: symbol,
                volume: volume,
                order: 0,
                comment: comment,
                expiration: new Date("1970-01-01")
            });
        }

        public requestCloseOrder(order: number, volume: number)
            : JQueryPromise<TradeResponse> {

            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: TransactionType.Close,
                price: 0.0,
                stopLoss: 0.0,
                takeProfit: 0.0,
                symbol: "",
                volume: volume,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        }

        public requestModifyOrder(order: number, price: number, stopLoss: number, takeProfit: number)
            : JQueryPromise<TradeResponse> {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: TransactionType.Modify,
                price: price,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                symbol: "",
                volume: 0.0,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        }

        public requestDeleteOrder(order: number)
            : JQueryPromise<TradeResponse> {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: TransactionType.Delete,
                price: 0.0,
                stopLoss: 0.0,
                takeProfit: 0.0,
                symbol: "",
                volume: 0.0,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        }

        public requestAccountSettings()
            : JQueryPromise<AccountSettings> {
                return this.sendAndCacheFuture({
                    type: "accountSettings",
                    requestId: 0,
            });
        }

        private resolvePacket(fut: JQueryDeferred<any>, packet: any, sel: (p: any) => any)
            : void {
            if (packet.status) {
                fut.resolve(sel(packet));
            } else {
                fut.reject(new Error(packet.ec));
            }
        }

        private resolvePacketAndError(fut: JQueryDeferred<any>, packet: any, sel: (p: any) => any,
            errSel: (p: any) => any)
            : void {
            if (packet.status) {
                fut.resolve(sel(packet));
            } else {
                fut.reject(errSel(packet));
            }
        }

        private sendAndCacheFuture(packet: any): JQueryPromise<any> {
            var req = ++this.lastReqId;
            var def = $.Deferred();

            packet.requestId = req;
            this.socket.send(JSON.stringify(packet));

            this.futures[req] = def;

            return def.promise();
        }
    }

    export enum ServerType {
        Demo = 0,
        Real = 1
    }

    /** Errors **/
    export class TradeError {
        public errorCode: ErrorCode;
        public mt4ErrorCode: MT4ErrorCode;
        public order: number;

        constructor(order: number, errorCode: number, mt4ErrorCode: MT4ErrorCode) {
            this.order = order;
            this.errorCode = errorCode;
            this.mt4ErrorCode = mt4ErrorCode;
        }
    }

    export class Error {
        public errorCode: ErrorCode;

        constructor(errorCode: number) {
            this.errorCode = <ErrorCode>errorCode;
        }
    }

    export enum ErrorCode {
        OK = 0,
        ServerError = 1,
        UndefinedError = 2,
    }

    export enum MT4ErrorCode {
        OK = 0,
        OKNone = 1,
        Error = 2,
        InvalidData = 3,
        TechnicalProblem = 4,
        OldVersion = 5,
        NoConnection = 6,
        NotEnoughRights = 7,
        TooFrequent = 8,
        Malfunction = 9,
        SecuritySession = 10,
        AccountDisabled = 64,
        BadAccountInfo = 65,
        TradeTimeout = 128,
        TradeBadPrices = 129,
        TradeBadStops = 130,
        TradeBadVolume = 131,
        TradeMarketClose = 132,
        TradeDisable = 133,
        TradeNoMoney = 134,
        TradePriceChanged = 135,
        TradeOffquotes = 136,
        TradeBrokerBusy = 137,
        TradeLongOnly = 138,
        TradeTooManyReq = 139,
        TradeAccepted = 140,
        TradeUserCancel = 141,
        TradeModifyDenied = 142,
        TradeExpirationDenied = 143,
        TradeTooManyOrders = 144,
        TradeHedgeProhibited = 145,
    }


    /** Trading **/
    export class TradeResponse {
        public order: number;

        constructor(order: number) {
            this.order = order;
        }
    }

    export class TradeRecord {
        public login: number;
        public order: number;
        public tradeCommand: TradeCommand;
        public symbol: string;
        public volume: number;

        public profit: number;
        public swaps: number;
        public commission: number;

        public stopLoss: number;
        public takeProfit: number;

        public openPrice: number;
        public openTime: Date;

        public closePrice: number;
        public closeTime: Date;

        public closed: boolean;

        public digits: number;

        public comment: string;
        public expiration: Date;
    }

    export enum TradeAction {
        Opened = 0,
        Modified = 1,
        Closed = 2,
    }

    export enum TradeCommand {
        Buy = 0,
        Sell = 1,
        BuyLimit = 2,
        SellLimit = 3,
        BuyStop = 4,
        SellStop = 5,
        Balance = 6,
        Credit = 7,
    }

    export enum TransactionType {
        Open = 0,
        Close = 2,
        Modify = 3,
        Delete = 4,
    }


    /** Candles **/
    export class ChartResponse {
        public symbol: string;
        public period: CandlePeriod;
        public fromTime: Date;
        public toTime: Date;
        public candles: Candle[];
    }

    export class Candle {
        public o: number;
        public c: number;
        public l: number;
        public h: number;
        public vol: number;
        public time: Date;
    }

    export enum CandlePeriod {
        M1 = 1,
        M5 = 5,
        M15 = 15,
        M30 = 30,
        H1 = 60,
        H4 = 240,
        D1 = 1440,
        W1 = 10080,
        MN1 = 43200,
    }


    /** Ticks **/
    export class Tick {
        public symbol: string;
        public bid: number;
        public ask: number;
        public time: Date;
        public rate: ConvRate;

        constructor(symbol: string, bid: number, ask: number, time: Date,
            convRate: ConvRate) {
            this.symbol = symbol;
            this.bid = bid;
            this.ask = ask;
            this.time = time;
            this.rate = convRate;
        }
    }

    export class ConvRate {
        public symbol: string;
        public depositccy: string;
        public bid: number;
        public ask: number;

        constructor(symbol: string, depositCcy: string, bid: number, ask: number) {
            this.symbol = symbol;
            this.depositccy = depositCcy;
            this.bid = bid;
            this.ask = ask;
        }
    }


    /** Instrument data **/
    export class InstrumentSettings {
        public name: string;
        public digits: number;
        public cSize: number;
        public profitCalcMode: ProfitCalcMode;
        public marginCalcMode: MarginCalcMode;
        public marginHedged: number;
        public marginDivider: number;
        public swapType: SwapType;
        public swapLong: number;
        public swapShort: number;
        public tradeMode: TradeMode;
        public currency: string;
        public bid: number;
        public ask: number;
        public low: number;
        public high: number;
        public time: Date;

        public trade: boolean;
        public lotMin: number;
        public lotMax: number;
        public lotStep: number;
        public commission: number;
        public commissionType: CommissionType;
        public commissionLots: CommissionLots;
    }

    export enum ProfitCalcMode {
        Forex = 0,
        Cfd = 1,
        Futures = 2,
    }

    export enum MarginCalcMode {
        Forex = 0,
        Cfd = 1,
        Futures = 2,
        CfdIndex = 3,
        CfdLeverage = 4
    }

    export enum SwapType {
        Points = 0,
        Dollars = 1,
        Interest = 2,
        MarginCurrency = 3
    }

    export enum TradeMode {
        No = 0,
        Close = 1,
        Full = 2
    }

    export enum CommissionType {
        Money = 0,
        Pips = 1,
        Percent = 2
    }

    export enum CommissionLots {
        PerLot = 0,
        PerDeal = 1
    }

    /** Other data **/
    export class LoginResponse {
        public login: number;
        public success: boolean;

        constructor(login: number, success: boolean) {
            this.login = login;
            this.success = success;
        }
    }

    export class MarginLevel {
        public login: number;
        public balance: number;
        public equity: number;
        public freeMargin: number;
        public levelType: number;
        public margin: number;
        public level: number;
    }

    export class HeartbeatResponse {
    }

    /** Session data **/
    export enum DayOfWeek {
        Sunday = 0,
        Monday = 1,
        Tuesday = 2,
        Wednesday = 3,
        Thursday = 4,
        Friday = 5,
        Saturday = 6
    }

    export class TradingSession {
        public openTime: Date;
        public closeTime: Date;
    }

    export class DailySession {
        public dayOfWeek: DayOfWeek;
        public tradingSessions: TradingSession[]
    }

    export class SessionSchedule {
        public dailySessions: DailySession[]

        constructor(dailySessions: DailySession[]) {
            this.dailySessions = dailySessions;
        }
    }

    /** User Settings **/

    export class AccountSettings {
        public name: string;
        public leverage: number;
        public interestRate: number;
        public marginCall: number;
        public marginStopOut: number;
        public marginMode: MarginMode;
        public marginType: MarginType;
        public accountType: AccountType;
    }

    export enum MarginMode
    {
        DontUse = 0,
        UseAll = 1,
        UseProfit = 2,
        UseLoss = 3,
    }

    export enum MarginType {
        Percent = 0,
        Currency = 1,
    }

    export enum  AccountType {
        Mini = 0,
        Standard = 1,
        Vip = 2,
    }
}
