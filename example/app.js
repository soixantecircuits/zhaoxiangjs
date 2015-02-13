var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
    console.log('a user connected');
    io.emit('log message', "$$$ user connected $$$");
    socket.on('disconnect', function(){
      console.log('user disconnected');
      io.emit('log message', "*** user disconnected ***");
    });
    socket.on('shoot', function(msg){
      console.log('shoot');
      io.emit('shoot');
    });
});

http.listen(3001, function(){
    console.log('listening on *:3001');
});
