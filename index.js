var dotenv = require('dotenv')
dotenv.load()
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var url = require('url');
var jf = require('jsonfile');
var fs = require('fs')
var apis = require('./apis.js')
var shortcuts = require('./shortcuts.js')
var channel_fetcher = require('./channel_fetcher')

var PORT = 9998;
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig
var MAX_CONNECTIONS = 5
var API_CACHE_AGE = 60000
var API_SECRET = process.env.API_SECRET || Math.random().toString()
console.log(API_SECRET.length, "character long secret")

function isGood(s){
  if(typeof(s) !== typeof('string')){
    return false
  }
  if(s.length === 0){
    return false
  }
  if(/s=(twitch|hitbox)/gi.test(s)){
    s = s.toLowerCase()
  }
  var parts = s.split('/')
  if(parts.length < 3){
    return false
  }
  parts.shift(0)
  parts.shift(0)
  parts.shift(0)
  var path = parts.join('/')
  if(REGEX.test(path)){
    return false
  }
  return "/"+path
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
    'metadata' : io.metadata,
    'metaindex': io.metaindex
  }
}
io.strims = {}

var metadata_path = './cache/metadata.json'
var metaindex_path = './cache/metaindex.json'

if (fs.existsSync(metadata_path)) {
  io.metadata = jf.readFileSync(metadata_path)
}else{
  io.metadata = {}
  jf.writeFileSync(metadata_path, {})  
}

if (fs.existsSync(metaindex_path)) {
  io.metaindex = jf.readFileSync(metaindex_path)
}else{
  io.metaindex = {}
  jf.writeFileSync(metaindex_path, {})  
}
var consider_metadata = function (strim_url) {
  return function (md) {
    var meta_key = md['platform']+'/'+md['channel']
    console.log('considering metadata', meta_key)
    if(!io.metadata.hasOwnProperty(meta_key) || io.metadata[meta_key].expire_at < (new Date).getTime()){
      md.image_url = apis.getPlaceholder(md.platform);
      md.expire_at = (new Date).getTime()+API_CACHE_AGE;
      // todo: decide whether we should set
      // a 'live status' before hearing from the API

      io.metadata[meta_key] = md;
      io.metaindex[strim_url] = meta_key;
      console.log('getting api for: ', md)
      apis.getAPI(md, function(api_data){
        // todo: use extendify if this gets too gnarly
        // if we got the default placeholder, check every 15 seconds
        // if we got a real one, check only as often as it updates
        // twitch updates thumbs every ~15-20 minutes
        console.log('recieved api data for '+meta_key)
        api_data.expire_at = (new Date).getTime()+API_CACHE_AGE
        io.metadata[meta_key] = api_data

        // people on specific pages won't usually 
        // be listening for this event, so it's fine
        idlers.emit('strims', getStrims());
        // cache meta data
        jf.writeFile(metadata_path, io.metadata, function(err) {
          if(err)
            console.log(err)
        });
        jf.writeFile(metaindex_path, io.metaindex, function(err) {
          if(err)
            console.log(err)
        });
      })
    }
  }
  // body...
}

io.idlers = {}
io.ips = {} // address: number_of_connections

function validate(socket){
  // console.log(socket.request.headers)
  // set the proper IP address if this request was forwarded 
  // this lets us properly track requests that pass through a cache
  if(socket.request.headers.hasOwnProperty('x-forwarded-for')){
    socket.request.connection._peername.address = socket.request.headers['x-forwarded-for'];
  }
  socket.ip = socket.request.connection._peername.address;
  socket.strim = isGood(socket.request.headers.referer);
  if(socket.strim === false || ((io.ips.hasOwnProperty(socket.ip)) && (io.ips[socket.ip]+1 > MAX_CONNECTIONS))){
    var reason = socket.strim === false ? "bad strim" : "too many connections"
    console.log('BLOCKED a connection because '+reason+':', socket.request.connection._peername);
    socket.disconnect()
    return false
  }
  return true
}

var watchers = io.of('/stream')
var idlers = io.of('/streams')

function handleSocket (socket){
  if (!validate(socket)) {
    return
  }
  socket.idle = isIdle(socket.strim);

  io.ips[socket.ip] = 1 + ((io.ips.hasOwnProperty(socket.ip)) ? io.ips[socket.ip] : 0);
  socket.section = socket.idle ? "idlers" : "strims";

  io[socket.section][socket.strim] = 1 + ((io[socket.section].hasOwnProperty(socket.strim)) ? io[socket.section][socket.strim] : 0)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim') && socket.hasOwnProperty('section') && (io[socket.section].hasOwnProperty(socket.strim)) ){
      io[socket.section][socket.strim] += -1
      if(io[socket.section][socket.strim] <= 0){
        var mi = io.metaindex[socket.strim]
        if(mi){
          delete io.metadata[mi]
          delete io.metaindex[socket.strim]
          jf.writeFile(metadata_path, io.metadata, function(err) {
            if(err)
              console.log(err)
          });
          jf.writeFile(metaindex_path, io.metaindex, function(err) {
            if(err)
              console.log(err)
          });
        }
        delete io[socket.section][socket.strim]
      }
      console.log('user disconnected from '+socket.strim);
      // tell everyone interested (idlers)
      idlers.emit('strims', getStrims());
      if(!socket.hasOwnProperty('idle') || !socket.idle){
        // tell people on the specific strim
        watchers.emit('strim.'+socket.strim, io.strims[socket.strim]);
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
    console.log('a user is idle on '+socket.strim, socket.request.connection._peername);
    socket.emit('strims', getStrims())
  }else{
    // get metadata
    var parts = url.parse(socket.strim, true).query
    // TODO: handle channels
    if(parts.hasOwnProperty('user')){
      channel_fetcher({
        name: parts['user'],
        url: socket.strim,
        rustlers: io.strims[socket.strim]        
      }, consider_metadata(socket.strim))
    }else{
      consider_metadata(socket.strim)({
        platform: parts['s'],
        channel: parts['stream'],
        url: socket.strim,
        rustlers: io.strims[socket.strim]
      })
    }

    console.log('a user joined '+socket.strim, socket.request.connection._peername);
    // tell idlers
    idlers.emit('strims', getStrims());
    // tell people on the specific strim
    watchers.emit('strim.'+socket.strim, io.strims[socket.strim]);
  }
  socket.on('admin', function (data) {
    // data should have: {key: api_secret, code: js_string_to_eval}
    console.log('got admin dankmemes')
    if(data.hasOwnProperty('key') && data['key'] === API_SECRET){
      data['key'] = "";
      idlers.emit('admin', data)
      watchers.emit('admin', data)
    }
  })
}

watchers.on('connection', function (socket) {
  handleSocket(socket)
})

idlers.on('connection', function (socket) {
  handleSocket(socket)
})

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
shortcuts.init(app);

http.listen(PORT, function(){
  console.log('listening on *:'+PORT);
});