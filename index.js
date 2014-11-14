var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var PORT = 9998;
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig

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
  return "/"+path
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
io.on('connection', function(socket){
  // console.log(socket.request.headers)
  var strim = isGood(socket.request.headers.referer)
  if(strim === false){
    console.log('BLOCKED a connection:', socket.request.connection._peername);
    socket.disconnect()
    return
  }
  console.log('a user joined '+strim);
  socket.strim = strim
  if(strim in io.strims){
    io.strims[strim] = io.strims[strim] + 1
  }else{
    io.strims[strim] = 1
  }
  io.emit('strims', io.strims)
  socket.on('disconnect', function(){
    if(socket.hasOwnProperty('strim') && socket.strim in io.strims){
      io.strims[socket.strim] += -1
      if(io.strims[socket.strim] <= 0){
        delete io.strims[socket.strim]
      }
      console.log('user disconnected from '+socket.strim);
      io.emit('strims', io.strims)
    }
  });
});


app.get('/api', function(req, res){
  res.send(getStrims());
  res.end()
});

// for debug to serve different urls
app.get('/*', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

http.listen(PORT, function(){
  console.log('listening on *:'+PORT);
});