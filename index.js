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
  var idlers = {}

  for(var room_name in browsers.adapter.rooms){
    // in order to exclude individual socket's rooms
    if(room_name.indexOf('/') !== -1){
      idlers[room_name] = countBrowsers(room_name)    
    }
  }

  // this is probably not a good place to do this
  var deletable_keys = []
  for(var skey in io.metadata){
    io.metadata[skey].rustlers = countWatchers(io.metadata[skey]['url'])
    // if nobody is watching this stream, and it's cache is expired
    // remove it from metadata
    if (io.metadata[skey].rustlers <= 0){
      if(io.metadata[skey].expire_at+API_CACHE_AGE < ((new Date).getTime()) ) {
        deletable_keys.push({skey: skey, url: io.metadata[skey].url})
      }
    }
  }
  deletable_keys.forEach(function (pair) {
    delete io.metadata[pair.skey]
    delete io.metaindex[pair.url]
  })

  var stream_list = Object.keys(io.metadata).map(function (key) {
    return io.metadata[key]
  })

  // clump streams into live first, then offline
  stream_list.sort(function (a,b) {
    // give LIVE streams more weight in sorting higher
    var amulti = a.hasOwnProperty('live') && a['live'] ? 1000 : 1 ;
    var bmulti = b.hasOwnProperty('live') && b['live'] ? 1000 : 1 ;
    if (amulti*a.rustlers < bmulti*b.rustlers)
       return 1;
    if (amulti*a.rustlers > bmulti*b.rustlers)
      return -1;
    return 0;
  })

  var strims = {}
  stream_list.forEach(function (stream){
    strims[stream['url']] = stream['rustlers']    
  })

  // TODO: send a simple stream_list array
  // with metadata objects sorted by view count
  // WAIT UNTIL LEGACY SUPPORT ENDS

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
    'streams' : strims,
    'idlers' : idlers,
    'metadata' : io.metadata,
    'metaindex': io.metaindex,
    'stream_list' : stream_list
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

function countInRoom (socket) {
  return socket.idle ? countBrowsers(socket.strim) : countWatchers(socket.strim)
}

function countWatchers(room_name){
  var wc = Object.keys(watchers.adapter.rooms[room_name] || {})
  // console.log('counted watchers in', room_name, wc.length, wc)
  return wc.length
}

function countBrowsers(room_name){
  return Object.keys(browsers.adapter.rooms[room_name] || {}).length  
}

function handleSocket (socket){
  // console.log('checking if socket is idle', socket.strim)
  io.ips[socket.ip] = 1 + ((io.ips.hasOwnProperty(socket.ip)) ? io.ips[socket.ip] : 0);
  socket.join(socket.strim)

  socket.on('disconnect', function(){
    // remove stream
    if(socket.hasOwnProperty('strim')){
      socket.leave(socket.strim)
      var rustlers = countInRoom(socket)
      if(rustlers <= 0){
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

      if(rustlers > 0){
        watchers.to(socket.strim).emit('rustlers', rustlers)
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

  socket.on('admin', function (data) {
    data['which'] = data['which'] ? data['which'] : 'administrate'
    admin.handle(data['which'], data)
  })
  socket.on('api', function(){
    socket.emit('strims', getStrims())
  })
}

function handleBrowser(socket){
  socket.idle = true
  handleSocket(socket)
  console.log('a user is idle on '+socket.strim, socket.request.connection._peername);
  socket.emit('strims', getStrims())
}

function handleWatcher(socket){
  // get metadata
  socket.idle = false
  handleSocket(socket)

  var surl = url.parse(socket.strim, true)
  var parts = surl.query

  if(parts.hasOwnProperty('user') || parts.hasOwnProperty('s') || parts.hasOwnProperty('stream')){
    // LEGACY
    // no work to do here!
  }else{
    // excludes the querystring
    var uparts = surl.pathname.split('/')
    if (uparts.length > 2 && uparts[2].length > 0) {
      parts['s'] = uparts[1]
      parts['stream'] = uparts[2]
    }else if(uparts.length > 1 && uparts[1].length > 0){
      parts['user'] = uparts[1]
    }
  }
  // only called for watchers
  var rustlers = countWatchers(socket.strim)
  if(parts.hasOwnProperty('user')){
    channel_fetcher({
      name: parts['user'],
      url: socket.strim,
      rustlers: rustlers,      
    }, consider_metadata(socket.strim))
  }else{
    consider_metadata(socket.strim)({
      platform: parts['s'],
      channel: parts['stream'],
      url: socket.strim,
      rustlers: rustlers
    })
  }

  console.log('a user joined '+socket.strim, socket.request.connection._peername);

  browsers.emit('strims', getStrims());
  watchers.to(socket.strim).emit('rustlers', rustlers)
}

watchers.on('connection', function (socket) {
  if(!validateIP(socket)){
    return
  }
  // console.log('connected a client!')
  socket.on('watch', function (data){
    console.log('client', socket.request.headers['user-agent'], 'wants to watch', data)
    if(validateStrim(socket, data['path'])){
      // BUG
      // firefox has some kind of issue with emitted events
      // and event listeners sharing the same name
      // between the server and client
      socket.emit('approve', {path: socket.strim})
      handleWatcher(socket)
    }else{
      console.log('invalid stream', data['path'])
    }
  })
})

browsers.on('connection', function (socket) {
  if(!validateIP(socket)){
    return
  }
  console.log('connnected a browser from', socket.request.headers.host)
  // strim or referrer is unimportant here
  // so it doesn't need to be very accurate
  socket.strim = socket.request.headers.referer
  handleBrowser(socket)

  // socket.on('browse', function (data){
  //   // console.log('client wants to browse', data)
  //   if(validateStrim(socket, data['path'])){
  //     socket.emit('browse', {path: socket.strim})
  //     handleBrowser(socket)
  //   }else{
  //     console.log('invalid browse page', data['path'])
  //   }
  // })
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