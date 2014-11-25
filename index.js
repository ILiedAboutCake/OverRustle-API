var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');

var PORT = 9998;
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig
var MAX_CONNECTIONS = 5
var DEFAULT_PLACEHOLDER = "http://overrustle.com/img/jigglymonkey.gif"

var PLACEHOLDERS = {

}

var IMAGE_APIS = {
  // todo: return a promise object, 
  // with a callback that returns an image_url
  twitch: function (channel, callback) {
    return http.get({json:true, 
      uri:"http://api.twitch.tv/kraken/streams/"+channel})
    .on('response', function(res) {
      var json = res
      var live = json.stream === null // TODO
      // console.log("Got response: " + res.statusCode);
      if(live){
        // raise an error?
        callback(json.stream.preview.large);
      }else{
        callback(getPlaceholder('twitch'))
      }
    })
  },
  hitbox: function (channel, callback) {
    return http.get({json:true, 
      uri:"http://api.hitbox.tv/media/stream/"+channel})
    .on('response', function(res) {
      var json = res
      var live = true // todo: get live status from hitbox
      // console.log("Got response: " + res.statusCode);
      if(live){
        // todo: maybe get their offline image?
        callback("edge.sf.hitbox.tv" + json.livestream[0].media_thumbnail_large);
      }else{
        callback(getPlaceholder('hitbox'))
      }
    })
  },
  ustream: function (channel, callback) {
    return http.get({json:true, 
      uri:"http://api.ustream.tv/channels/"+channel+".json"})
    .on('response', function(res) {
      var json = res
      var live = true // todo: get live status from ustream
      // console.log("Got response: " + res.statusCode);
      if(live){
        // todo: maybe get their offline image?
        callback(json.channel.thumbnail.live);
      }else{
        callback(getPlaceholder('ustream'))
      }
    })
  },
}

function getImage (platform, channel, callback) {
  if(platform in IMAGE_APIS){
    IMAGE_APIS[platform](channel, callback).on('error', function(e) {
      console.log("ERR: GETing thumbnail for "+channel+" on "+platform+" - Got error: " + e.message);
      callback(getPlaceholder(platform))
    });
  }else{
    callback(getPlaceholder(platform));
  }
}
// todo: placeholders for each platform

function getPlaceholder (platform) {
  var placeholder = DEFAULT_PLACEHOLDER
  if(plaform in placeholders){
    return placeholders[platform]
  }
  return placeholder
}

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
  var parts = url.parse(s, true).query
  var valid_strim = parts.hasOwnProperty('s') && parts.hasOwnProperty('stream')
  return valid_strim === false
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
    'connections' : Object.keys(io.ips).reduce(function (previous, key) {
      return previous + io.ips[key];
    }, 0),
    'streams' : io.strims,
    'idlers' : io.idlers,
    'metadata' : io.metadata
  }
}
io.strims = {}
io.metadata = {}
io.metaindex = {}
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
  socket.strim = strim
  io[socket.section][strim] = 1 + ((strim in io[socket.section]) ? io[socket.section][strim] : 0)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim') && socket.hasOwnProperty('section') && (socket.strim in io[socket.section]) ){
      io[socket.section][socket.strim] += -1
      if(io[socket.section][socket.strim] <= 0){
        delete io[socket.section][socket.strim]
      }
      console.log('user disconnected from '+socket.strim);
      if(!socket.hasOwnProperty('idle') || !socket.idle){
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

  if (socket.idle) {
    console.log('a user is idle on '+strim, socket.request.connection._peername);
    socket.emit('strims', getStrims())
  else{
    // get metadata
    var parts = url.parse(strim, true).query
    var meta_key = parts['s']+'/'+parts['stream']
    var metadata = {}

    if(io.metadata.hasOwnProperty(meta_key) === false){
      var md = {};
      md.platform = parts.s;
      md.channel = parts.stream;
      md.image_url = getPlaceholder(md.platform);

      metadata = md;
      io.metadata[meta_key] = md;
      io.metaindex[strim] = meta_key;
    }

    console.log('a user joined '+strim, socket.request.connection._peername);
    io.emit('strims', getStrims());
    getImage(metadata.platform, metadata.channel, function(image_url){
      io.metadata[meta_key].image_url = image_url
      io.emit('strims', getStrims());
    })
  }
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