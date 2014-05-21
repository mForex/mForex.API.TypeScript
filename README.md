# mForex API for TypeScript
The goal of mForex API is to provide tools with which you could easily build web applications able to communicate with our trade server over WebSocket protocol. 

We are currently conducting beta tests, so our API is only available on demand for demo accounts only. If you would like to participate, please contact us on <api@mforex.pl>. 

## Quick start
mForex API for TypeScript is available on NuGet:
```
Install-Package mForex.API.TypeScript
```
Also, latest TypeScript as well as JavaScript files are available on this repository.

### Logging in 
Once you have your account ready, you can log in to our server using following code:

```javascript
//Create Connection object specifying which server it should connect to
var api = new mForex.Connection(mForex.ServerType.Demo);

//Register callbacks for onOpen event, which will be called when connection is established.
api.onOpen = function() { 

    //Once we are connected, we can log in. Every function from now on will 
    //return JQueryPromise<T>, similarly to C#'s Task<T>.
    var loggedIn = api.login(login, password);
    
    l.done(function(res: mForex.LoginResponse) {
        [...]
    });
}

//And onClose event, which will be called when connection couldn't have been established
//or existing connection is broken.
api.onClose = function(ev: CloseEvent) {
    [...]
}

api.open();
```

### Requesting for quotes
Once connection has been established, all relevant data, but ticks, have been setup and is ready to be registered for. ```mForex.Connection``` provides events which can be subscribed to. However, tick data has to be registered using ```.requestTickRegistration()``` with ```RegistrationAction.Register``` parameter. For example, to receive and process every EURUSD tick one could:

```javascript
api.requestTickRegistration("EURUSD", RegistrationAction.Register).done( [...] );
api.onTicks = function (ticks: mForex.Tick[]) {
    [...]
}
```

### Trade requests
```APIClient``` offers an easy way to manage your orders. For example, sample code which closes all opened positions on EURUSD instrument could look like this:

```javascript
api.requestOpenTrades()
   .done((trades: mForex.TradeRecord[]) => {
        var tradeResponses: JQueryPromise<mForex.TradeResponse>[] = []

        for (var i = 0; i < trades.length; ++i) {
            var t = trades[i];
            tradeResponses.push(api.requestCloseOrder(t.order, t.volume));
        }

        $.when(tradeResponses)
         .done((ts: JQueryPromise<mForex.TradeResponse>[])  => {
                [...]
        });
});
```
Note, that you can schedule closing all orders without waiting for first response, which could significantly boost performance in your scenario.

## Asynchronous model
The protocol used to communicate with mForex Trade Server is fundamentally asynchronous. It is implemented using JQuery's ```JQueryPromise<T>``` which allows to build solutions similar to those known in ```C#``` or ```F#```.

## Problems?
If you encounter any bugs or would like to propose any new features or enhancements, please visit the [issue tracker](https://github.com/mForex/mForex.API.TypeScript/issues) and report the issue. 

## Copyright and License
Copyright 2013 Dom Maklerski mBanku S.A.
Licensed under the [MIT License](https://raw.github.com/mForex/mForex.API.TypeScript/master/LICENSE).

----------
> **NOTE:** You can find more information:
>
> - about **mForex** services and products [here][1],
> - about **mForex API** [here][2],
> - about **mForex API for F#** [here][3],
> - about **mForex API for Matlab** [here][4],

[1]: http://www.mforex.pl/
[2]: https://github.com/mForex/mForex.API
[3]: https://github.com/mForex/mForex.API.FSharp
[4]: https://github.com/mForex/mForex.API.Matlab
