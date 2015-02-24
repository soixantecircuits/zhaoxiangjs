var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
mdns = require('mdns');

var ad = mdns.createAdvertisement(mdns.tcp('remote'), 3005);
ad.start();

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

http.listen(3005, function(){
    console.log('listening on *:3005');
});
