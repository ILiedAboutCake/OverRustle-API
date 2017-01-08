var app = require('express')();
var bodyParser = require('body-parser');
var multer = require('multer'); 
var http = require('http').Server(app);
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

var dotenv = require('dotenv')
dotenv.load()

var io = require('socket.io')(http);
// share a reference
app.socketio = io;

var Promise = require('bluebird')
var url = require('url')
var jf = require('jsonfile');
var fs = require('fs')
var extend = require('util')._extend;
var hasOwnProperty = require('has');
var apis = require('./apis.js')
var shortcuts = require('./shortcuts.js')
var feature = require('./feature.js')
var makeRedisClient = require('./make_redis_client')

var md_client = makeRedisClient(4)

var admin = require('./admin.js')
var channel_fetcher = require('./channel_fetcher')

var PORT = process.env.HTTP_PORT || '9998'
var REGEX = /[^A-z 0-9 \?\&\/=/:/-]/ig
var MAX_CONNECTIONS = process.env.HTTP_CONNECTIONS || '5'
var API_CACHE_AGE = process.env.HTTP_CACHE || '60000'

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
  var valid_strim = hasOwnProperty(parts, 's')
    && hasOwnProperty(parts, 'stream')
  if(valid_strim === false){
    // in case someone is on a channel page
    valid_strim = hasOwnProperty(parts, 'user')
  }
  return valid_strim === false
}

function getStrims() {
  var api_data = {}

  // cached for this call

  // var featured_list = [{
  //   featured: true,
  //   key: 'twitch/1337hephaestus',
  //   url: '/twitch/1337hephaestus',
  //   channel: '1337hephaestus',
  //   platform: 'twitch'
  // },
  // {
  //   featured: true,
  //   key: 'twitch/destiny',
  //   url: '/twitch/destiny',
  //   channel: "destiny",
  //   platform: "twitch",
  //   canonical_url: "http://destiny.gg/bigscreen"
  // }]

  var featured_list = []
  var featured_hash = {}

  // console.log('starting getStrims')
  return new Promise(function (resolve, reject){
    feature.all().then(function(featured_streams){
      // console.log('featured streams found', featured_streams)
      featured_list = featured_streams.map(function (stream){
        // console.log('getStrims stream', stream)
        var key = ""
        if(stream.hasOwnProperty('key')){
          key = stream['key']
        }else{
          key = stream.platform+'/'+stream.channel
        }
        featured_hash[key] = stream
        return key
      })
      resolve()
    })
  }).then(function (){
    // console.log('getStrims finished compiling featuredlist')
    return new Promise(function (resolve, reject){
      api_data.idlers = {}

      for(var room_name in browsers.adapter.rooms){
        // in order to exclude individual socket's rooms
        if(room_name.indexOf('/') !== -1){
          api_data.idlers[room_name] = countBrowsers(room_name)    
        }
      }

      // this is probably not a good place to do this
      var deletable_keys = []
      for(var skey in io.metadata){
        io.metadata[skey].rustlers = countWatchers(io.metadata[skey]['url'])
        // if nobody is watching this stream, and it's cache is expired
        // remove it from metadata
        // unless it's featured
        if (io.metadata[skey].rustlers <= 0 && !(io.metadata[skey]['featured'])){
          if(io.metadata[skey].expire_at+API_CACHE_AGE < ((new Date).getTime()) ) {
            deletable_keys.push({skey: skey, url: io.metadata[skey].url})
          }
        }
      }
      deletable_keys.forEach(function (pair) {
        delete io.metadata[pair.skey]
        delete io.metaindex[pair.url]
      })

      // TODO: 
      // Stop sending metadata metaindex once we drop legacy support

      api_data.idlecount = Object.keys(api_data.idlers).reduce(function (previous, key) {
          return previous + api_data.idlers[key];
        }, 0)
      api_data.connections = Object.keys(io.ips).reduce(function (previous, key) {
          return previous + io.ips[key];
        }, 0)

      api_data.stream_list = Object.keys(io.metadata).map(function (key) {
        var stream = io.metadata[key]
        stream.featured = featured_hash.hasOwnProperty(key)
        if(stream.featured === true || stream.featured === "true"){
          featured_list.splice(featured_list.indexOf(key), 1)
          if(featured_hash[key]['canonical_url']){
            stream.canonical_url = featured_hash[key]['canonical_url']
          }
        }
        return stream
      })

      resolve(featured_list)
    })
  }).then(function (keys){
    return Promise.all(keys.map(function (key) {
      return new Promise(function (resolve, reject) {
        if(!featured_hash[key].hasOwnProperty('expire_at') || featured_hash[key].expire_at < (new Date).getTime()){
          featured_hash[key].image_url = apis.getPlaceholder(featured_hash[key].platform);
          featured_hash[key].expire_at = (new Date).getTime()+API_CACHE_AGE;
          apis.getAPI(featured_hash[key], function (md){
            // back up to redis
            feature.upsert(key, md).then(function(saved_md){
              featured_hash[key] = saved_md
              io.metaindex[saved_md.url] = key
              io.metadata[key] = saved_md
              resolve()
            })
          })
        }else{
          resolve()
        }
      });
    }))
  }).then(function(){
    return new Promise(function (resolve, reject){
      // add in featured streams which are not being watched at the moment
      featured_list.forEach(function (key){
        api_data.stream_list.push(featured_hash[key])
      })

      // clump streams into live first, then offline
      var weightedSort = function (a,b) {
        // give LIVE streams more weight in sorting higher
        var amulti = a.hasOwnProperty('live') && a['live'] ? 1000 : 1 ;
        var bmulti = b.hasOwnProperty('live') && b['live'] ? 1000 : 1 ;

        // weigh featured streams
        amulti = a.hasOwnProperty('featured') && a['featured'] ? amulti * 100 : amulti ;
        bmulti = b.hasOwnProperty('featured') && b['featured'] ? bmulti * 100 : bmulti ;

        if (amulti*a.rustlers < bmulti*b.rustlers)
           return 1;
        if (amulti*a.rustlers > bmulti*b.rustlers)
          return -1;
        return 0;
      }
      api_data.stream_list.sort(weightedSort)

      // LEGACY url => view_count map
      api_data.metadata = io.metadata
      api_data.metaindex = io.metaindex

      api_data.streams = {}
      api_data.stream_list.forEach(function (stream){
        api_data.streams[stream['url']] = stream['rustlers']    
      })
      api_data.viewercount = Object.keys(api_data.streams).reduce(function (previous, key) {
          return previous + api_data.streams[key];
        }, 0)
      resolve(api_data)
    })
  })
}

var metadata_path = './cache/metadata.json'
var metaindex_path = './cache/metaindex.json'

if(!fs.existsSync("./cache")){
  fs.mkdirSync("./cache")
}


// lets check to make sure the files are valid JSON
[
  {
    path: metadata_path,
    key: 'metadata',
  },
  {
    path: metaindex_path,
    key: 'metaindex',
  }
].forEach(function (meta) {
  var path = meta.path;
  var key = meta.key;
  try {
    var data = jf.readFileSync(path);
    if (!data.length) {
      throw new Error(path + ' is empty. This is probably due to the API crashing.');
    }
    io[key] = data;
  }
  catch (err) {
    if (err.code === 'ENOENT') {
      console.log(path + ' not found. Creating new file...');
    }
    else {
      console.log(err, 'Creating new file...');
      fs.unlinkSync(path);
    }
    io[key] = {};
    jf.writeFileSync(path, {});
  }
});


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
        // idea: keep a global 'lastTime' and only emit if time > (lastTime + 1.5 seconds)
        // this will effectively rate limiting
        // getStrims().then(function(api_data){
        //   browsers.emit('strims', api_data);        
        // })
        
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
    console.log(socket.request.connection.remoteAddress +': BLOCKED a connection because too many connections');
    socket.disconnect()
    return false
  }
  return true
}

function validateStrim(socket, path){
  // socket.strim = isGood(socket.request.headers.referer);
  socket.strim = isGood(path);

  if(socket.strim === false){
    console.log(socket.request.connection.remoteAddress +': BLOCKED a connection because BAD STRIM');
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
          if(io.metadata[mi] && io.metadata[mi]['featured']){
            // keep metadata if the stream is featured
          }else{
            // stop tracking metadata
            delete io.metadata[mi]
            // stop tracking the index
            delete io.metaindex[socket.strim]            
          }

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
      console.log(socket.request.connection.remoteAddress + ': user disconnected from ' + socket.strim);

      // don't do this all the time, it blows up the server
      // when many people leave a stream all at once
      getStrims().then(function(api_data){
        browsers.emit('strims', api_data);        
      })

      // consider not doing this either to reduce requests per second
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
    getStrims().then(function(api_data){
      socket.emit('strims', api_data)
    })
  })
}

function handleBrowser(socket){
  socket.idle = true
  handleSocket(socket)
  console.log(socket.request.connection.remoteAddress + ': Idle on '+socket.strim);

  getStrims().then(function(api_data){
    socket.emit('strims', api_data);        
  })
}

function handleWatcher(socket){
  // get metadata
  socket.idle = false
  handleSocket(socket)

  var surl = url.parse(socket.strim, true)
  var parts = surl.query

  if(hasOwnProperty(parts, 'user')
    || hasOwnProperty(parts, 's')
    || hasOwnProperty(parts, 'stream')){
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
  if(hasOwnProperty(parts, 'user')){
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

  console.log(socket.request.connection.remoteAddress + ': Joined ' + socket.strim);

  getStrims().then(function(api_data){
    browsers.emit('strims', api_data);        
  })
  watchers.to(socket.strim).emit('rustlers', rustlers)
}

watchers.on('connection', function (socket) {
  if(!validateIP(socket)){
    return
  }
  // console.log('connected a client!')
  socket.on('watch', function (data){
    console.log(socket.request.connection.remoteAddress + ': Wants to watch', data.path)
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
  console.log(socket.request.connection.remoteAddress +': Connnected a browser from', socket.request.headers.host)
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

  getStrims().then(function(api_data){
    res.send(api_data);
    res.end()
  })
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
