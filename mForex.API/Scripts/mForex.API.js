///<reference path="typings/jquery/jquery.d.ts" />
var mForex;
(function (mForex) {
    var Connection = (function () {
        function Connection(server) {
            if (!("WebSocket" in window)) {
                throw "No Web Socket support";
            }

            this.lastReqId = 0;
            this.isReal = server === 1 /* Real */;
            this.futures = new Array();

            this.endpoint = this.isReal ? "wss://real.api.mforex.pl/" : "wss://demo.api.mforex.pl/";
        }
        Connection.prototype.open = function () {
            var _this = this;
            this.socket = new WebSocket(this.endpoint);

            this.socket.onopen = function () {
                _this.hbIntervalHandle = setInterval(function () {
                    _this.sendHeartBeat();
                }, 30000);
                _this.onOpen();
            };

            this.socket.onclose = function (ev) {
                clearInterval(_this.hbIntervalHandle);
                _this.onClose(ev);
            };

            this.socket.onmessage = function (msg) {
                var packet = JSON.parse(msg.data);

                if (packet.type === "ticks") {
                    if (_this.onTicks !== undefined) {
                        _this.onTicks(packet.ticks);
                    }
                } else if (packet.type === "marginLevelNotify") {
                    if (_this.onMarginLevel !== undefined) {
                        _this.onMarginLevel(packet.marginLevel);
                    }
                } else if (packet.type === "tradeUpdate") {
                    if (_this.onTradeUpdate !== undefined) {
                        _this.onTradeUpdate(packet.trade, packet.action);
                    }
                } else {
                    var fut = _this.futures[packet.requestId];
                    if (fut !== undefined) {
                        _this.futures[packet.requestId] = null;

                        if (packet.type === "login") {
                            fut.resolve(new LoginResponse(packet.login, packet.loggedIn));
                        } else if (packet.type === "candles") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return p;
                            });
                        } else if (packet.type === "instrSettings") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return p.settings;
                            });
                        } else if (packet.type === "marginLevel") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return p.marginLevel;
                            });
                        } else if (packet.type === "closedTrades") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return p.trades;
                            });
                        } else if (packet.type === "tradesInfo") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return p.trades;
                            });
                        } else if (packet.type === "tradeTransaction") {
                            _this.resolvePacketAndError(fut, packet, function (p) {
                                return new TradeResponse(p.order);
                            }, function (p) {
                                return new TradeError(p.order, p.ec, p.tradeEc);
                            });
                        } else if (packet.type === "heartbeat") {
                        } else if (packet.type === "sessionSchedule") {
                            _this.resolvePacket(fut, packet, function (p) {
                                return new SessionSchedule(p.sessions);
                            });
                        }
                    }

                    return;
                }
            };
        };

        Connection.prototype.sendHeartBeat = function () {
            this.sendAndCacheFuture({ type: "heartbeat", requestId: 0 });
        };

        Connection.prototype.login = function (login, password) {
            return this.sendAndCacheFuture({ type: "login", requestId: 0, login: login, password: password });
        };

        Connection.prototype.requestChart = function (symbol, period, from, to) {
            return this.sendAndCacheFuture({ type: "candles", requestId: 0, fromTime: from, toTime: to, symbol: symbol, period: period });
        };

        Connection.prototype.requestInstrumentSettings = function () {
            return this.sendAndCacheFuture({ type: "instrSettings", requestId: 0 });
        };

        Connection.prototype.requestMarginLevel = function () {
            return this.sendAndCacheFuture({ type: "marginLevel", requestId: 0 });
        };

        Connection.prototype.requestTradesHistory = function (from, to) {
            return this.sendAndCacheFuture({ type: "closedTrades", requestId: 0, dateFrom: from, dateTo: to });
        };

        Connection.prototype.requestOpenTrades = function () {
            return this.sendAndCacheFuture({ type: "tradesInfo", requestId: 0 });
        };

        Connection.prototype.requestSessionSchedule = function (symbol) {
            return this.sendAndCacheFuture({ type: "sessionSchedule", requestId: 0, symbol: symbol });
        };

        Connection.prototype.requestOpenOrder = function (symbol, tradeCommand, stopLoss, takeProfit, volume, comment) {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: tradeCommand,
                transactionType: 0 /* Open */,
                price: 0.0,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                symbol: symbol,
                volume: volume,
                order: 0,
                comment: comment,
                expiration: new Date("1970-01-01")
            });
        };

        Connection.prototype.requestCloseOrder = function (order, volume) {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: 2 /* Close */,
                price: 0.0,
                stopLoss: 0.0,
                takeProfit: 0.0,
                symbol: "",
                volume: volume,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        };

        Connection.prototype.requestModifyOrder = function (order, price, stopLoss, takeProfit) {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: 3 /* Modify */,
                price: price,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                symbol: "",
                volume: 0.0,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        };

        Connection.prototype.requestDeleteOrder = function (order) {
            return this.sendAndCacheFuture({
                type: "tradeTransaction",
                requestId: 0,
                tradeCommand: 0,
                transactionType: 4 /* Delete */,
                price: 0.0,
                stopLoss: 0.0,
                takeProfit: 0.0,
                symbol: "",
                volume: 0.0,
                order: order,
                comment: "",
                expiration: new Date("1970-01-01")
            });
        };

        Connection.prototype.resolvePacket = function (fut, packet, sel) {
            if (packet.status) {
                fut.resolve(sel(packet));
            } else {
                fut.reject(new Error(packet.ec));
            }
        };

        Connection.prototype.resolvePacketAndError = function (fut, packet, sel, errSel) {
            if (packet.status) {
                fut.resolve(sel(packet));
            } else {
                fut.reject(errSel(packet));
            }
        };

        Connection.prototype.sendAndCacheFuture = function (packet) {
            var req = ++this.lastReqId;
            var def = $.Deferred();

            packet.requestId = req;
            this.socket.send(JSON.stringify(packet));

            this.futures[req] = def;

            return def.promise();
        };
        return Connection;
    })();
    mForex.Connection = Connection;

    (function (ServerType) {
        ServerType[ServerType["Demo"] = 0] = "Demo";
        ServerType[ServerType["Real"] = 1] = "Real";
    })(mForex.ServerType || (mForex.ServerType = {}));
    var ServerType = mForex.ServerType;

    /** Errors **/
    var TradeError = (function () {
        function TradeError(order, errorCode, mt4ErrorCode) {
            this.order = order;
            this.errorCode = errorCode;
            this.mt4ErrorCode = mt4ErrorCode;
        }
        return TradeError;
    })();
    mForex.TradeError = TradeError;

    var Error = (function () {
        function Error(errorCode) {
            this.errorCode = errorCode;
        }
        return Error;
    })();
    mForex.Error = Error;

    (function (ErrorCode) {
        ErrorCode[ErrorCode["OK"] = 0] = "OK";
        ErrorCode[ErrorCode["ServerError"] = 1] = "ServerError";
        ErrorCode[ErrorCode["UndefinedError"] = 2] = "UndefinedError";
    })(mForex.ErrorCode || (mForex.ErrorCode = {}));
    var ErrorCode = mForex.ErrorCode;

    (function (MT4ErrorCode) {
        MT4ErrorCode[MT4ErrorCode["OK"] = 0] = "OK";
        MT4ErrorCode[MT4ErrorCode["OKNone"] = 1] = "OKNone";
        MT4ErrorCode[MT4ErrorCode["Error"] = 2] = "Error";
        MT4ErrorCode[MT4ErrorCode["InvalidData"] = 3] = "InvalidData";
        MT4ErrorCode[MT4ErrorCode["TechnicalProblem"] = 4] = "TechnicalProblem";
        MT4ErrorCode[MT4ErrorCode["OldVersion"] = 5] = "OldVersion";
        MT4ErrorCode[MT4ErrorCode["NoConnection"] = 6] = "NoConnection";
        MT4ErrorCode[MT4ErrorCode["NotEnoughRights"] = 7] = "NotEnoughRights";
        MT4ErrorCode[MT4ErrorCode["TooFrequent"] = 8] = "TooFrequent";
        MT4ErrorCode[MT4ErrorCode["Malfunction"] = 9] = "Malfunction";
        MT4ErrorCode[MT4ErrorCode["SecuritySession"] = 10] = "SecuritySession";
        MT4ErrorCode[MT4ErrorCode["AccountDisabled"] = 64] = "AccountDisabled";
        MT4ErrorCode[MT4ErrorCode["BadAccountInfo"] = 65] = "BadAccountInfo";
        MT4ErrorCode[MT4ErrorCode["TradeTimeout"] = 128] = "TradeTimeout";
        MT4ErrorCode[MT4ErrorCode["TradeBadPrices"] = 129] = "TradeBadPrices";
        MT4ErrorCode[MT4ErrorCode["TradeBadStops"] = 130] = "TradeBadStops";
        MT4ErrorCode[MT4ErrorCode["TradeBadVolume"] = 131] = "TradeBadVolume";
        MT4ErrorCode[MT4ErrorCode["TradeMarketClose"] = 132] = "TradeMarketClose";
        MT4ErrorCode[MT4ErrorCode["TradeDisable"] = 133] = "TradeDisable";
        MT4ErrorCode[MT4ErrorCode["TradeNoMoney"] = 134] = "TradeNoMoney";
        MT4ErrorCode[MT4ErrorCode["TradePriceChanged"] = 135] = "TradePriceChanged";
        MT4ErrorCode[MT4ErrorCode["TradeOffquotes"] = 136] = "TradeOffquotes";
        MT4ErrorCode[MT4ErrorCode["TradeBrokerBusy"] = 137] = "TradeBrokerBusy";
        MT4ErrorCode[MT4ErrorCode["TradeLongOnly"] = 138] = "TradeLongOnly";
        MT4ErrorCode[MT4ErrorCode["TradeTooManyReq"] = 139] = "TradeTooManyReq";
        MT4ErrorCode[MT4ErrorCode["TradeAccepted"] = 140] = "TradeAccepted";
        MT4ErrorCode[MT4ErrorCode["TradeUserCancel"] = 141] = "TradeUserCancel";
        MT4ErrorCode[MT4ErrorCode["TradeModifyDenied"] = 142] = "TradeModifyDenied";
        MT4ErrorCode[MT4ErrorCode["TradeExpirationDenied"] = 143] = "TradeExpirationDenied";
        MT4ErrorCode[MT4ErrorCode["TradeTooManyOrders"] = 144] = "TradeTooManyOrders";
        MT4ErrorCode[MT4ErrorCode["TradeHedgeProhibited"] = 145] = "TradeHedgeProhibited";
    })(mForex.MT4ErrorCode || (mForex.MT4ErrorCode = {}));
    var MT4ErrorCode = mForex.MT4ErrorCode;

    /** Trading **/
    var TradeResponse = (function () {
        function TradeResponse(order) {
            this.order = order;
        }
        return TradeResponse;
    })();
    mForex.TradeResponse = TradeResponse;

    var TradeRecord = (function () {
        function TradeRecord() {
        }
        return TradeRecord;
    })();
    mForex.TradeRecord = TradeRecord;

    (function (TradeAction) {
        TradeAction[TradeAction["Opened"] = 0] = "Opened";
        TradeAction[TradeAction["Modified"] = 1] = "Modified";
        TradeAction[TradeAction["Closed"] = 2] = "Closed";
    })(mForex.TradeAction || (mForex.TradeAction = {}));
    var TradeAction = mForex.TradeAction;

    (function (TradeCommand) {
        TradeCommand[TradeCommand["Buy"] = 0] = "Buy";
        TradeCommand[TradeCommand["Sell"] = 1] = "Sell";
        TradeCommand[TradeCommand["BuyLimit"] = 2] = "BuyLimit";
        TradeCommand[TradeCommand["SellLimit"] = 3] = "SellLimit";
        TradeCommand[TradeCommand["BuyStop"] = 4] = "BuyStop";
        TradeCommand[TradeCommand["SellStop"] = 5] = "SellStop";
        TradeCommand[TradeCommand["Balance"] = 6] = "Balance";
        TradeCommand[TradeCommand["Credit"] = 7] = "Credit";
    })(mForex.TradeCommand || (mForex.TradeCommand = {}));
    var TradeCommand = mForex.TradeCommand;

    (function (TransactionType) {
        TransactionType[TransactionType["Open"] = 0] = "Open";
        TransactionType[TransactionType["Close"] = 2] = "Close";
        TransactionType[TransactionType["Modify"] = 3] = "Modify";
        TransactionType[TransactionType["Delete"] = 4] = "Delete";
    })(mForex.TransactionType || (mForex.TransactionType = {}));
    var TransactionType = mForex.TransactionType;

    /** Candles **/
    var ChartResponse = (function () {
        function ChartResponse() {
        }
        return ChartResponse;
    })();
    mForex.ChartResponse = ChartResponse;

    var Candle = (function () {
        function Candle() {
        }
        return Candle;
    })();
    mForex.Candle = Candle;

    (function (CandlePeriod) {
        CandlePeriod[CandlePeriod["M1"] = 1] = "M1";
        CandlePeriod[CandlePeriod["M5"] = 5] = "M5";
        CandlePeriod[CandlePeriod["M15"] = 15] = "M15";
        CandlePeriod[CandlePeriod["M30"] = 30] = "M30";
        CandlePeriod[CandlePeriod["H1"] = 60] = "H1";
        CandlePeriod[CandlePeriod["H4"] = 240] = "H4";
        CandlePeriod[CandlePeriod["D1"] = 1440] = "D1";
        CandlePeriod[CandlePeriod["W1"] = 10080] = "W1";
        CandlePeriod[CandlePeriod["MN1"] = 43200] = "MN1";
    })(mForex.CandlePeriod || (mForex.CandlePeriod = {}));
    var CandlePeriod = mForex.CandlePeriod;

    /** Ticks **/
    var Tick = (function () {
        function Tick(symbol, bid, ask, time, convRate) {
            this.symbol = symbol;
            this.bid = bid;
            this.ask = ask;
            this.time = time;
            this.rate = convRate;
        }
        return Tick;
    })();
    mForex.Tick = Tick;

    var ConvRate = (function () {
        function ConvRate(symbol, depositCcy, bid, ask) {
            this.symbol = symbol;
            this.depositccy = depositCcy;
            this.bid = bid;
            this.ask = ask;
        }
        return ConvRate;
    })();
    mForex.ConvRate = ConvRate;

    /** Instrument data **/
    var InstrumentSettings = (function () {
        function InstrumentSettings() {
        }
        return InstrumentSettings;
    })();
    mForex.InstrumentSettings = InstrumentSettings;

    (function (ProfitCalcMode) {
        ProfitCalcMode[ProfitCalcMode["Forex"] = 0] = "Forex";
        ProfitCalcMode[ProfitCalcMode["Cfd"] = 1] = "Cfd";
        ProfitCalcMode[ProfitCalcMode["Futures"] = 2] = "Futures";
    })(mForex.ProfitCalcMode || (mForex.ProfitCalcMode = {}));
    var ProfitCalcMode = mForex.ProfitCalcMode;

    (function (MarginCalcMode) {
        MarginCalcMode[MarginCalcMode["Forex"] = 0] = "Forex";
        MarginCalcMode[MarginCalcMode["Cfd"] = 1] = "Cfd";
        MarginCalcMode[MarginCalcMode["Futures"] = 2] = "Futures";
        MarginCalcMode[MarginCalcMode["CfdIndex"] = 3] = "CfdIndex";
        MarginCalcMode[MarginCalcMode["CfdLeverage"] = 4] = "CfdLeverage";
    })(mForex.MarginCalcMode || (mForex.MarginCalcMode = {}));
    var MarginCalcMode = mForex.MarginCalcMode;

    (function (SwapType) {
        SwapType[SwapType["Points"] = 0] = "Points";
        SwapType[SwapType["Dollars"] = 1] = "Dollars";
        SwapType[SwapType["Interest"] = 2] = "Interest";
        SwapType[SwapType["MarginCurrency"] = 3] = "MarginCurrency";
    })(mForex.SwapType || (mForex.SwapType = {}));
    var SwapType = mForex.SwapType;

    (function (TradeMode) {
        TradeMode[TradeMode["No"] = 0] = "No";
        TradeMode[TradeMode["Close"] = 1] = "Close";
        TradeMode[TradeMode["Full"] = 2] = "Full";
    })(mForex.TradeMode || (mForex.TradeMode = {}));
    var TradeMode = mForex.TradeMode;

    /** Other data **/
    var LoginResponse = (function () {
        function LoginResponse(login, success) {
            this.login = login;
            this.success = success;
        }
        return LoginResponse;
    })();
    mForex.LoginResponse = LoginResponse;

    var MarginLevel = (function () {
        function MarginLevel() {
        }
        return MarginLevel;
    })();
    mForex.MarginLevel = MarginLevel;

    var HeartbeatResponse = (function () {
        function HeartbeatResponse() {
        }
        return HeartbeatResponse;
    })();
    mForex.HeartbeatResponse = HeartbeatResponse;

    (function (DayOfWeek) {
        DayOfWeek[DayOfWeek["Sunday"] = 0] = "Sunday";
        DayOfWeek[DayOfWeek["Monday"] = 1] = "Monday";
        DayOfWeek[DayOfWeek["Tuesday"] = 2] = "Tuesday";
        DayOfWeek[DayOfWeek["Wednesday"] = 3] = "Wednesday";
        DayOfWeek[DayOfWeek["Thursday"] = 4] = "Thursday";
        DayOfWeek[DayOfWeek["Friday"] = 5] = "Friday";
        DayOfWeek[DayOfWeek["Saturday"] = 6] = "Saturday";
    })(mForex.DayOfWeek || (mForex.DayOfWeek = {}));
    var DayOfWeek = mForex.DayOfWeek;

    var TradingSession = (function () {
        function TradingSession() {
        }
        return TradingSession;
    })();
    mForex.TradingSession = TradingSession;

    var DailySession = (function () {
        function DailySession() {
        }
        return DailySession;
    })();
    mForex.DailySession = DailySession;

    var SessionSchedule = (function () {
        function SessionSchedule(dailySessions) {
            this.dailySessions = dailySessions;
        }
        return SessionSchedule;
    })();
    mForex.SessionSchedule = SessionSchedule;
})(mForex || (mForex = {}));
