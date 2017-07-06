/**
 * WebSocket API wrapper with built in reconnection/ping-pong/connection sharing (experimental)
 * @param string url - WebSocket server url
 * @param object options - Configurable options for toggling reconnection/ping-ping/connection-sharing/debug messages
 *
 * Options
 * - id: Used to separate multiple different connections - default: 'Socket'
 * - autoconnect: Enable/Disable auto connection. If disabled, the connect() method must be called separately
 * - ping: Enable/Disable ping-pong - default: true
 * - reconnect: Enable/Disable reconnection (ignored in silentClose()) - default: true
 * - debug: Enable/Disable debug messages - default: true
 * - share_connection: Enable/Disable connection sharing - default: true, will be set to false if the browser doesn't support LocalStorage API
 * - preventables: Prevent some events to be executed on child connections - default: []
 *
 * Methods
 * - connect(): Connects to the WebSocket server if the connection doesn't already exist
 * - emit(action, payload): Sends an action to the WebSocket server
 * - on(event, callback): Adds a listener for a specific event
 * - off(event): Removes the event from the listener
 * - close(): Closes the connection
 * - silentClose(): Closes the connection, ignoring reconnection settings
 * - reloadListeners(): Updates the listeners, used internally
 *
 * @author Artūrs Lukjaņenoks.
 */

(function() {

    var localStorageSupported = function() {
        try {
            return "localStorage" in window && window["localStorage"] !== null;
        } catch (e) {
            return false;
        }
    };

    window.Socket = function(url, options){
        if(typeof options === 'undefined'){
            options = {};
        }

        wsUrl = url;

        this.ws_url = url;
        this.ws = null;
        this.closed_connections = 0;
        this.listeners = [];
        this.is_closed = false;
        this.was_opened = false;
        this.connection_exists = false;
        this.storage_event = null;
        this.connection_check = null;
        this.resourceID = Math.floor((Math.random() * 9999) + 1000)+'-'+new Date().valueOf()+'-'+Math.floor((Math.random() * 9999) + 1000);
        this.last_pong = Math.floor(Date.now() / 1000);

        this.id = typeof options.id !== 'undefined' ? options.id : 'Socket';
        this.autoconnect = typeof options.autoconnect !== 'undefined' ? options.autoconnect : true;
        this.ping = typeof options.ping !== 'undefined' ? options.ping : true;
        this.reconnect  = typeof options.reconnect !== 'undefined' ? options.reconnect : true;
        this.debug = typeof options.debug !== 'undefined' ? options.debug : true;
        this.share_connection = typeof options.share_connection !== 'undefined' ? options.share_connection : true;
        this.preventables = typeof options.preventables !== 'undefined' ? options.preventables : [];

        if(!localStorageSupported()){
            this.share_connection = false;
        }

        this.connection_key = this.id+'-websocket-connection';
        this.message_key = this.id+'-websocket-onmessage';
        this.emit_key = this.id+'-websocket-emit';
        this.close_key = this.id+'-websocket-onclose';

        if(this.autoconnect){
            this.connect();
        }
    };

    Socket.prototype = {
        connectToSocket: function(){
            var self = this;

            self.ws = new WebSocket(self.ws_url);
            self.ws.was_opened = false;
            self.ws.is_closed = false;
            self.ws.silent_close = false;
            self.ws.ping = null;
            self.ws.storage_pulse = null;

            var existingHandler = window.onbeforeunload;
            window.onbeforeunload = function(event) {
                if (existingHandler) existingHandler(event);

                if(self.share_connection){
                    localStorage.removeItem(self.connection_key);
                }
            };
        },
        connect: function(){
            var self = this;

            if(self.share_connection){
                if(typeof localStorage[self.connection_key] !== 'undefined'){
                    var existingConnection = JSON.parse(localStorage[self.connection_key]);

                    if(Math.floor(Date.now() / 1000) - existingConnection.pulse >= 15){
                        localStorage.removeItem(self.connection_key);
                        self.connection_exists = false;
                    } else {
                        self.connection_exists = true;
                        if(self.debug) console.log(self.id+': Connection already exists, no need to connect');

                        self.connection_check = setInterval(function(){
                            if(typeof localStorage[self.connection_key] === 'undefined'){
                                if(self.debug) console.log(self.id+': Connection missing, connecting...');
                                self.connect();
                            } else {
                                var connection = JSON.parse(localStorage[self.connection_key]);
                                if(Math.floor(Date.now() / 1000) - connection.pulse >= 15){
                                    if(self.debug) console.log(self.id+': Connection not active, removing and connecting...');
                                    localStorage.removeItem(self.connection_key);
                                    self.connection_exists = false;
                                    self.connect();
                                }
                            }
                        }, 10000);
                    }
                } else {
                    self.connection_exists = false;
                }
            } else {
                self.connection_exists = false;
            }

            if(!self.connection_exists){
                self.connectToSocket();
            }

            self.reloadListeners();
        },
        close: function(){
            var self = this;
            if(!self.connection_exists){
                self.ws.close();
            } else {
                if(self.storage_event){
                    window.removeEventListener('storage', self.storage_event);
                }

                if(self.connection_check){
                    clearInterval(self.connection_check);
                }
            }
        },
        silentClose: function(){
            var self = this;
            if(!self.connection_exists){
                self.ws.silent_close = true;
                self.ws.close();
            } else {
                if(self.storage_event){
                    window.removeEventListener('storage', self.storage_event);
                }

                if(self.connection_check){
                    clearInterval(self.connection_check);
                }

                if(self.debug) console.log(self.id+': Connection closed silently, removing storage listeners');
            }
        },
        sendJson: function(data){
            var self = this;
            console.warn('sendJson() is deprecated, please use emit() instead');

            if(typeof data.action === 'undefined') {
                console.error(self.id+': Couldn\'t send json to the server. Missing action property');
                return false;
            }

            self.emit(data.action, data);
        },
        emit: function(action, payload){
            var self = this;

            if(typeof action === 'undefined'){
                console.error(self.id+': Couldn\'t emit action to server. Missing action');
                return false;
            }

            if(typeof payload === 'undefined') payload = {};

            if(self.connection_exists){
                localStorage.setItem(self.emit_key, JSON.stringify({
                    action: action,
                    payload: payload
                }));
            } else {
                self.ws.send(JSON.stringify({
                    action: action,
                    payload: payload
                }));
            }
        },
        on: function(event, callback){
            var self = this;

            if(event === 'open' || event === 'close'){

                self.listeners.push({
                    type: 'inner',
                    event: event,
                    callback: callback
                });

            } else {
                event = event.split(':');

                self.listeners.push({
                    type: event[0],
                    event: event[1],
                    callback: callback
                });
            }

            self.reloadListeners();
        },
        off: function(event){
            var self = this;
            var removableKeys = [];

            if(event === 'open' || event === 'close'){
                self.listeners.forEach(function(listener, key){
                    if(listener.type === 'inner' && listener.event === event){
                        removableKeys.push(key);
                    }
                });
            } else {
                event = event.split(':');

                self.listeners.forEach(function(listener, key){
                    if(listener.type === event[0] && listener.event === event[1]){
                        removableKeys.push(key);
                    }
                });
            }

            removableKeys.sort(function(a,b){ return b - a; });

            removableKeys.forEach(function(value, index){
                self.listeners.splice(value,1);
            });

            self.reloadListeners();
        },
        reloadListeners: function(){
            var self = this;

            if(!self.connection_exists){
                self.ws.onopen = function(e) {
                    if(self.debug) console.log(self.id+": Connected.");

                    if(self.storage_event){
                        window.removeEventListener('storage', self.storage_event);
                    }

                    if(self.connection_check){
                        clearInterval(self.connection_check);
                    }

                    if(self.ping){
                        self.ws.ping = setInterval(function(){
                            self.ws.send(JSON.stringify({
                                action: 'ping'
                            }));

                            if(Math.floor(Date.now() / 1000) - self.last_pong >= 60){
                                console.warn(self.id+': Server hasn\'t responded in the last 60 seconds. ');
                            }

                        }, 30000);

                        self.listeners.push({
                            type: 'action',
                            event: 'pong',
                            callback: function(){
                                self.last_pong = Math.floor(Date.now() / 1000);
                            }
                        });
                    }

                    if(self.share_connection){
                        if(typeof localStorage[self.connection_key] === 'undefined'){
                            localStorage.setItem(self.connection_key, JSON.stringify({
                                created: Math.floor(Date.now() / 1000),
                                pulse: Math.floor(Date.now() / 1000)
                            }));
                        }

                        self.ws.storage_pulse = setInterval(function(){
                            if(typeof localStorage[self.connection_key] !== 'undefined'){
                                var previousPulse = JSON.parse(localStorage[self.connection_key]);

                                localStorage.setItem(self.connection_key, JSON.stringify({
                                    created: previousPulse.created,
                                    pulse: Math.floor(Date.now() / 1000)
                                }));
                            } else {
                                localStorage.setItem(self.connection_key, JSON.stringify({
                                    created: Math.floor(Date.now() / 1000),
                                    pulse: Math.floor(Date.now() / 1000)
                                }));
                            }

                        }, 5000);
                    }

                    self.listeners.forEach(function(listener){
                        if(listener.type === 'inner' && listener.event === 'open'){
                            listener.callback(e);
                        }
                    });

                    self.ws.was_opened = true;
                    self.ws.is_closed = false;

                    self.was_opened = true;
                    self.is_closed = false;

                    self.closed_connections = 0;

                    if(self.storage_event){
                        window.removeEventListener('storage', self.storage_event);
                    }

                    self.storage_event = function(event){
                        if(event.key === self.emit_key){
                            var data = JSON.parse(event.newValue);
                            var action = data.action;
                            var payload = data.payload;

                            self.emit(action, payload)
                        }
                    };

                    window.addEventListener('storage', self.storage_event);
                };

                self.ws.onclose = function(e){
                    if(self.ws.silent_close){
                        if(self.debug) console.log(self.id+': Connection closed silently');
                    } else {
                        if(self.reconnect){
                            if(self.ws.was_opened){
                                if(self.debug) console.log(self.id+': Disconnected. Trying to reconnect...');
                            } else {
                                if(self.debug) console.log(self.id+': Server not responding. Retrying...');
                            }

                            self.closed_connections++;

                            if(self.closed_connections > 10){
                                if(self.debug) console.log(self.id+': Failed to reconnect after 10 tries.');
                            } else {
                                setTimeout(function(){
                                    self.connect();
                                }, 5000);
                            }
                        } else {
                            if(self.debug) console.log(self.id+': Disconnected.');
                        }
                    }
                    clearInterval(self.ws.ping);
                    clearInterval(self.ws.storage_pulse);
                    self.ws.is_closed = true;
                    self.is_closed = true;

                    if(self.share_connection){
                        localStorage.removeItem(self.connection_key);
                    }

                    if(self.storage_event){
                        window.removeEventListener('storage', self.storage_event);
                    }

                    self.listeners.forEach(function(listener){
                        if(listener.type === 'inner' && listener.event === 'close'){
                            listener.callback(e);
                        }
                    });
                };

                self.ws.onmessage = function(e){
                    var payload = JSON.parse(e.data);


                    if(typeof self.resourceID !== 'undefined'){
                        if(typeof payload.excludable_ids !== 'undefined'){
                            if(payload.excludable_ids.indexOf(self.resourceID.toString()) !== -1){
                                return false;
                            }
                        }
                    }

                    self.listeners.forEach(function(listener){
                        if(listener.type === payload.type && listener.event === payload[payload.type]){
                            listener.callback(payload);
                        }
                    });

                    localStorage.setItem(self.message_key, e.data);
                };
            }

            if(self.share_connection){
                if(self.storage_event){
                    window.removeEventListener('storage', self.storage_event);
                }

                self.storage_event = function(event){
                    if(event.key === self.message_key){
                        var payload = JSON.parse(event.newValue);
                        var action = payload.type+':'+payload[payload.type];

                        if(self.preventables.indexOf(action) !== -1){
                            return false;
                        }

                        if(typeof self.resourceID !== 'undefined'){
                            if(typeof payload.excludable_ids !== 'undefined'){
                                if(payload.excludable_ids.indexOf(self.resourceID.toString()) !== -1){
                                    return false;
                                }
                            }
                        }

                        self.listeners.forEach(function(listener){
                            if(listener.type === payload.type && listener.event === payload[payload.type]){
                                listener.callback(payload);
                            }
                        });
                    }
                };

                window.addEventListener('storage', self.storage_event);
            }
        }
    };
})();