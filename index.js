var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
var url = require('url')

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
    return request.get({json:true, uri:"https://api.twitch.tv/kraken/streams/"+channel}, function (e, r, res) {
      var json = res
      var api_data = {}
      api_data.live = json.stream !== null // TODO
      // console.log("Got response: " + res.statusCode);
      if(api_data.live){
        // raise an error?
        api_data.image_url = json.stream.preview.large;
      }else{
        api_data.image_url = getPlaceholder('twitch')
      }
      callback(api_data)
    })
  },
  hitbox: function (channel, callback) {
    return request.get({json:true, uri:"http://api.hitbox.tv/media/stream/"+channel}, function (e, r, res) {      
      var json = res
      var api_data = {}
      api_data.live = json.hasOwnProperty('livestream') && json.livestream[0].media_is_live === "1";
      // console.log("Got response: " + res.statusCode);
      if(api_data.live){
        // todo: maybe get their offline image?
        api_data.image_url = "http://edge.sf.hitbox.tv" + json.livestream[0].media_thumbnail_large;
      }else{
        api_data.image_url = getPlaceholder('hitbox')
      }
      callback(api_data);
    })
  },
  ustream: function (channel, callback) {
    return request.get({json:true, uri:"http://api.ustream.tv/channels/"+channel+".json"}, function (e, r, res) {
      var json = res
      var api_data = {}
      api_data.live = r.statusCode != 404 && json.channel.status === 'live' // todo: get live status from ustream
      // console.log("Got response: " + res.statusCode);
      if(api_data.live){
        // todo: maybe get their offline image?
        api_data.image_url = json.channel.thumbnail.live; 
      }else{
        console.log('getting ustream placeholder for '+channel)
        api_data.image_url = getPlaceholder('ustream')
      }
      callback(api_data);
    })
  },
}

function getImage (platform, channel, callback) {
  if(IMAGE_APIS.hasOwnProperty(platform)){
    IMAGE_APIS[platform](channel, callback).on('error', function(e) {
      console.log("ERR: GETing thumbnail for "+channel+" on "+platform+" - Got error: " + e.message);
      callback({live: false, image_url: getPlaceholder(platform)});
    });
  }else{
    callback({live: true, image_url: getPlaceholder(platform)});
  }
}
// todo: placeholders for each platform

function getPlaceholder (platform) {
  return PLACEHOLDERS[platform] ? PLACEHOLDERS[platform] : DEFAULT_PLACEHOLDER;
}

var shortcuts = {
  't':'twitch',
  'v':'twitch-vod',
  'c':'castamp',
  'h':'hitbox',
  'y':'youtube',
  'm':'mlg',
  'u':'ustream',
  'd':'dailymotion',
  'a':'azubu',
  'p':'picarto'
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
  if(valid_strim === false){
    // in case someone is on a channel page
    valid_strim = parts.hasOwnProperty('user')
  }
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
  // set the proper IP address if this request was forwarded 
  // this lets us properly track requests that pass through a cache
  if(socket.request.headers.hasOwnProperty('x-forwarded-for')){
    socket.request.connection._peername.address = socket.request.headers['x-forwarded-for'];
  }
  socket.ip = socket.request.connection._peername.address;
  var strim = isGood(socket.request.headers.referer);
  if(strim === false || ((io.ips.hasOwnProperty(socket.ip)) && (io.ips[socket.ip]+1 > MAX_CONNECTIONS))){
    var reason = strim === false ? "bad strim" : "too many connections"
    console.log('BLOCKED a connection because '+reason+':', socket.request.connection._peername);
    socket.disconnect()
    return
  }
  socket.idle = isIdle(strim);
  io.ips[socket.ip] = 1 + ((io.ips.hasOwnProperty(socket.ip)) ? io.ips[socket.ip] : 0);
  socket.section = socket.idle ? "idlers" : "strims";
  socket.strim = strim
  io[socket.section][strim] = 1 + ((io[socket.section].hasOwnProperty(strim)) ? io[socket.section][strim] : 0)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim') && socket.hasOwnProperty('section') && (io[socket.section].hasOwnProperty(socket.strim)) ){
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
    if(socket.hasOwnProperty('ip') && (io.ips.hasOwnProperty(socket.ip))){
      io.ips[socket.ip] += -1
      if(io.ips[socket.ip] <= 0){
        delete io.ips[socket.ip]
      }
    }
  });

  if (socket.idle) {
    console.log('a user is idle on '+strim, socket.request.connection._peername);
    socket.emit('strims', getStrims())
  }else{
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
    }else{
      metadata = io.metadata[meta_key]
    }

    console.log('a user joined '+strim, socket.request.connection._peername);
    io.emit('strims', getStrims());
    getImage(metadata.platform, metadata.channel, function(api_data){
      // todo: use extendify if this gets too gnarly
      io.metadata[meta_key].live = api_data.live
      io.metadata[meta_key].image_url = api_data.image_url
      io.emit('strims', getStrims());
    })
  }
});


app.get('/api', function (req, res){
  res.set("Connection", "close");
  res.send(getStrims());
  res.end()
});

app.get('/strims.js', function (req, res){
  res.sendFile(__dirname + '/strims.js');
});

// for debug to serve different urls
// app.get('/*', function(req, res){
//   res.sendFile(__dirname + '/index.html');
// });

// Redirects that enable nice URLs
app.get('/', function (req, res) {
  var redirect_to = 'http://overrustle.com/strims'
  console.log('redirecting to: '+redirect_to);
  res.redirect(redirect_to);
})
app.get('/:platform/:channel', function (req, res) {
  if (shortcuts.hasOwnProperty(req.params.platform)) {
    req.params.platform = shortcuts[req.params.platform];
  };
  var redirect_to = 'http://overrustle.com/destinychat?s='
  + req.params.platform
  + '&stream='
  + req.params.channel;
  console.log('redirecting to: '+redirect_to);
  res.redirect(url.format(redirect_to));
})
// handle custom user channels
app.get('/:channel', function (req, res) {
  var redirect_to = 'http://overrustle.com/channel?user='
  + req.params.channel;
  console.log('redirecting to: '+redirect_to);
  res.redirect(url.format(redirect_to));
})

http.listen(PORT, function(){
  console.log('listening on *:'+PORT);
});