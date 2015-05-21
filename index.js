var app = require('express')();
var bodyParser = require('body-parser');
var multer = require('multer'); 
var http = require('http').Server(app);
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

var io = require('socket.io')(http);
// share a reference
app.socketio = io;

var url = require('url')
var jf = require('jsonfile');
var fs = require('fs')
var extend = require('util')._extend;
var apis = require('./apis.js')
var shortcuts = require('./shortcuts.js')
var admin = require('./admin.js')
var channel_fetcher = require('./channel_fetcher')

var PORT = 9998;
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig
var MAX_CONNECTIONS = 5
var API_CACHE_AGE = 60000

function isGood(s){
  if(typeof(s) !== typeof('string')){
    console.log('not a string')
    return false
  }
  if(s.length === 0){
    console.log('empty string')
    return false
  }

  if(/(twitch|hitbox|mlg)/gi.test(s)){
    // console.log('forcing lowercase on case insensitive platforms')
    s = s.toLowerCase()
  }

  var surl = url.parse(s, true)

  if(surl.path.length <= 1){
    console.log('not a string')
    return false
  }
  if(REGEX.test(surl.path)){
    console.log('path with illegal characters')
    return false
  }
  if(surl.path.toLowerCase().indexOf("/destinychat") === -1){
    // http://derp.com/destinychat?s=twitch&stream=derperz
    var parts = surl.path.split('/')
    if(parts.length > 4 && parts[1].toLowerCase() !== 'advanced'){
      console.log('too many slashes for a non-advanced legacy stream')
      return false
    }
  }
  return surl.path
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
  var sections = {
    idlers: {},
    strims: {}
  }

  // break into sections
  for(var room_name in io.adapter.rooms){
    var room = io.adapter.rooms[room_name]
    sections[room.section][room_name] = Object.keys(room).length
  }
  var strims = sections.strims
  var idlers = sections.idlers
  // this is probably not a good place to do this
  for(var skey in io.metadata){
    io.metadata[skey].rustlers = countInRoom(io.metadata[skey]['url'])
  }

  // clump streams into live first, then offline
  var sorted_streams = {}
  // add live streams
  for(var strim in strims){
    if (io.metaindex.hasOwnProperty(strim)) {
      var mk = io.metaindex[strim]
      if (io.metadata.hasOwnProperty(mk)) {
        var md = io.metadata[mk]
        if(md.live){
          sorted_streams[strim] = countInRoom(strim)
        }
      }
    }
  }
  // add offline streams
  for(var strim in strims){
    if (io.metaindex.hasOwnProperty(strim)) {
      var mk = io.metaindex[strim]
      if (io.metadata.hasOwnProperty(mk)) {
        var md = io.metadata[mk]
        if(!md.live){
          sorted_streams[strim] = countInRoom(strim)
        }
      }
    }
  }


  return {
    'viewercount' : Object.keys(strims).reduce(function (previous, key) {
      return previous + strims[key];
    }, 0),
    'idlecount' : Object.keys(idlers).reduce(function (previous, key) {
      return previous + idlers[key];
    }, 0),
    'connections' : Object.keys(io.ips).reduce(function (previous, key) {
      return previous + io.ips[key];
    }, 0),
    'streams' : sorted_streams,
    'idlers' : idlers,
    'metadata' : io.metadata,
    'metaindex': io.metaindex
  }
}

var metadata_path = './cache/metadata.json'
var metaindex_path = './cache/metaindex.json'

if(!fs.existsSync("./cache")){
  fs.mkdirSync("./cache")
}

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
    if(!io.metadata.hasOwnProperty(meta_key) || (io.metadata[meta_key].expire_at < (new Date).getTime())){
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
        browsers.emit('strims', getStrims());
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

io.ips = {} // address: number_of_connections

function validateIP(socket){
  // set the proper IP address if this request was forwarded 
  // this lets us properly track requests that pass through a cache
  if(socket.request.headers.hasOwnProperty('x-forwarded-for')){
    socket.request.connection._peername.address = socket.request.headers['x-forwarded-for'];
  }
  socket.ip = socket.request.connection._peername.address;

  if(io.ips.hasOwnProperty(socket.ip) && (io.ips[socket.ip]+1 > MAX_CONNECTIONS) ){
    console.log('BLOCKED a connection because too many connections:', socket.request.connection._peername);
    socket.disconnect()
    return false
  }
  return true
}

function validateStrim(socket, path){
  // socket.strim = isGood(socket.request.headers.referer);
  socket.strim = isGood(path);

  if(socket.strim === false){
    console.log('BLOCKED a connection because BAD STRIM:', socket.strim, socket.request.connection._peername);
    socket.disconnect()
    return false
  }
  return true
}

var watchers = io.of('/stream')
var browsers = io.of('/streams')
// cache a reference
app.watchers = watchers
app.browsers = browsers

function countInRoom(room_name){
  return Object.keys(io.adapter.rooms[room_name] || {}).length
}

function handleSocket (socket){
  // console.log('checking if socket is idle', socket.strim)
  socket.idle = isIdle(socket.strim);

  io.ips[socket.ip] = 1 + ((io.ips.hasOwnProperty(socket.ip)) ? io.ips[socket.ip] : 0);
  socket.join(socket.strim)

  io.adapter.rooms[socket.strim].section = socket.idle ? "idlers" : "strims";

  // TODO
  // just count how many people are in a room
  // var room = io.adapter.rooms['private_room:90210']; 
  // Object.keys(room).length
  // io[socket.section][socket.strim] = 1 + ((io[socket.section].hasOwnProperty(socket.strim)) ? io[socket.section][socket.strim] : 0)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim')){
      socket.leave(socket.strim)
      var viewers = countInRoom(socket.strim)
      if(viewers <= 0){
        var mi = io.metaindex[socket.strim]
        if(mi){
          // stop tracking metadata
          delete io.metadata[mi]
          // stop tracking the index
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
      }
      console.log('user disconnected from '+socket.strim);

      browsers.emit('strims', getStrims());

      if(viewers > 0){
        watchers.to(socket.strim).emit('viewers', viewers)
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
    var surl = url.parse(socket.strim, true)
    var parts = surl.query

    if(parts.hasOwnProperty('user') || parts.hasOwnProperty('s') || parts.hasOwnProperty('stream')){
      // LEGACY
      // no work to do here!
    }else{
      // excludes the querystring
      var uparts = surl.pathname.split('/')
      if (uparts.length > 2 && upart[2].length > 0) {
        parts['s'] = uparts[1]
        parts['stream'] = uparts[2]
      }else if(uparts.length > 1 && uparts[1].length > 0){
        parts['user'] = uparts[1]
      }
    }
    var viewers = countInRoom(socket.strim)
    if(parts.hasOwnProperty('user')){
      channel_fetcher({
        name: parts['user'],
        url: socket.strim,
        rustlers: viewers,      
      }, consider_metadata(socket.strim))
    }else{
      consider_metadata(socket.strim)({
        platform: parts['s'],
        channel: parts['stream'],
        url: socket.strim,
        rustlers: viewers
      })
    }

    console.log('a user joined '+socket.strim, socket.request.connection._peername);

    browsers.emit('strims', getStrims());
    watchers.to(socket.strim).emit('viewers', viewers)
  }

  socket.on('admin', function (data) {
    data['which'] = data['which'] ? data['which'] : 'administrate'
    admin.handle(data['which'], data)
  })
  socket.on('api', function(){
    socket.emit('strims', getStrims())
  })
}

watchers.on('connection', function (socket) {
  if(!validateIP(socket)){
    return
  }
  // console.log('connected a client!')
  socket.on('watch', function (data){
    // console.log('client wants to watch', data)
    if(validateStrim(socket, data['path'])){
      // ensureChannel(socket.strim)
      socket.emit('watch', {path: socket.strim})
      handleSocket(socket)
    }else{
      console.log('invalid stream', data['path'])
    }
  })
})

browsers.on('connection', function (socket) {
  if(!validateIP(socket)){
    return
  }
  console.log('connnected a browser')
  // strim or referrer is unimportant here
  // so it doesn't need to be very accurate
  socket.strim = socket.request.headers.referer
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

admin.init(app);

// for debug to serve different urls
// app.get('/*', function(req, res){
//   res.sendFile(__dirname + '/index.html');
// });

// Redirects that enable nice URLs
shortcuts.init(app);

http.listen(PORT, function(){
  console.log('listening on *:'+PORT);
});