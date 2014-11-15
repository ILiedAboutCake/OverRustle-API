var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var PORT = 9998;
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig
var MAX_CONNECTIONS = 5

function isGood(s){
  if(typeof(s) !== typeof('string')){
    return false
  }
  if(s.length === 0){
    return false
  }
  var parts = s.split('/')
  if(parts.length < 3){
    return false
  }
  parts.shift(0)
  parts.shift(0)
  parts.shift(0)
  var path = parts.join('/')
  if(path.search(REGEX) > -1){
    return false
  }
  return "/"+path.toLowerCase()
}

var strims = {}

function getStrims () {
  return {
    'viewercount' : Object.keys(io.strims).reduce(function (previous, key) {
      return previous + io.strims[key];
    }, 0),
    'streams' : io.strims
  }
}
io.strims = {}
io.ips = {} // address: number_of_connections
io.on('connection', function(socket){
  // console.log(socket.request.headers)
  socket.ip = socket.request.connection._peername.address;
  var strim = isGood(socket.request.headers.referer);
  if(strim === false || ((socket.ip in io.ips) && (io.ips[socket.ip]+1 > MAX_CONNECTIONS))){
    var reason = strim === false ? "bad strim" : "too many connections"
    console.log('BLOCKED a connection because '+reason+':', socket.request.connection._peername);
    socket.disconnect()
    return
  }
  console.log('a user joined '+strim, socket.request.connection._peername);
  socket.strim = strim
  io.strims[strim] = 1 + ((strim in io.strims) ? io.strims[strim] : 0)
  io.ips[socket.ip] = 1 + ((socket.ip in io.ips) ? io.ips[socket.ip] : 0)
  io.emit('strims', io.strims)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim') && socket.strim in io.strims){
      io.strims[socket.strim] += -1
      if(io.strims[socket.strim] <= 0){
        delete io.strims[socket.strim]
      }
      console.log('user disconnected from '+socket.strim);
      io.emit('strims', io.strims)
    }
    // remove IP
    if(socket.hasOwnProperty('ip') && (socket.ip in io.ips)){
      io.ips[socket.ip] += -1
      if(io.ips[socket.ip] <= 0){
        delete io.ips[socket.ip]
      }
    }
  });
});


app.get('/api', function(req, res){
  res.set("Connection", "close");
  res.send(getStrims());
  res.end()
});

app.get('/strims.js', function(req, res){
  res.sendFile(__dirname + '/strims.js');
});

// for debug to serve different urls
app.get('/*', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

http.listen(PORT, function(){
  console.log('listening on *:'+PORT);
});