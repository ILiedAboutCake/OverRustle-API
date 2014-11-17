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

function isIdle (s) {
  return (s === "/destinychat" || s === "/strims")
}

var strims = {}

function getStrims () {
  return {
    'viewercount' : Object.keys(io.strims).reduce(function (previous, key) {
      return previous + io.strims[key];
    }, 0),
    'idlecount' : Object.keys(io.idlers).reduce(function (previous, key) {
      return previous + io.idlers[key];
    }, 0),
    'streams' : io.strims,
    'idlers' : io.idlers
  }
}
io.strims = {}
io.idlers = {}
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
  socket.idle = isIdle(strim);
  io.ips[socket.ip] = 1 + ((socket.ip in io.ips) ? io.ips[socket.ip] : 0);
  socket.section = socket.idle ? "idlers" : "strims";
  if (socket.idle) {
    console.log('a user is idle on '+strim, socket.request.connection._peername);
    socket.emit('strims', getStrims())
  }
  console.log('a user joined '+strim, socket.request.connection._peername);
  socket.strim = strim
  io[socket.section][strim] = 1 + ((strim in io[socket.section]) ? io[socket.section][strim] : 0)
  if(!socket.idle){
    io.emit('strims', getStrims())
  }

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim') && socket.strim in io.strims){
      io[socket.section][socket.strim] += -1
      if(io[socket.section][socket.strim] <= 0){
        delete io[socket.section][socket.strim]
      }
      console.log('user disconnected from '+socket.strim);
      if((!socket.hasOwnProperty('idle') || !socket.idle)){
        io.emit('strims', getStrims())
      }
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