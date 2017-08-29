 #WebSocket API wrapper
 ##With built in reconnection/ping-pong/connection sharing (experimental)
 
 ###Options
 - **id**: Used to separate multiple different connections - default: 'Socket'
 - **autoconnect**: Enable/Disable auto connection. If disabled, the connect() method must be called separately
 - **ping**: Enable/Disable ping-pong - default: true
 - **reconnect**: Enable/Disable reconnection (ignored in silentClose()) - default: true
 - **debug**: Enable/Disable debug messages - default: true
 - **share_connection**: Enable/Disable connection sharing - default: false, will be set to false if the browser doesn't support LocalStorage API.
 _This feature is experimental and should not be used in production_
 - **preventables**: Prevent some events to be executed on child connections - default: []
 
 ###Methods
 - **connect()**: Connects to the WebSocket server if the connection doesn't already exist
 - **emit(action, payload)**: Sends an action to the WebSocket server
 - **on(event, callback)**: Adds a listener for a specific event
 - **off(event)**: Removes the event from the listener
 - **close()**: Closes the connection
 - **silentClose()**: Closes the connection, ignoring reconnection settings
 - **reloadListeners()**: Updates the listeners, used internally