// TODO: make this more modular
var redis_host = '127.0.0.1'
var redis_db = 1
var redis = require('redis')

function makeRedisClient (redis_db) {
  var rv = null
  if(process.env.REDISTOGO_URL){
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    rv = redis.createClient(rtg.port, rtg.hostname);
    rv.auth(rtg.auth.split(":")[1]);
  }else{
    rv = redis.createClient('6379', redis_host);
  }
  rv.select(redis_db); 

  rv.on('connect', function() {
    console.log('Connected to redis#'+redis_db.toString());
  });
  rv.on('error', function (er) {
    console.trace('Channel_fetcher') // [1]
    console.error(er.stack) // [2]
  })

  return rv
}

var client = makeRedisClient(0);
var legacy_client = makeRedisClient(1);

var extend = require('util')._extend;

module.exports = function (metadata, callback) {
  var channel_name = metadata['name']
  console.log('starting redis for', channel_name)
  client.hgetall("user:"+channel_name, function (e, obj) {
    console.log('did hgetall for', channel_name, 'error:', e, 'result:', obj)
    // return bad things
    // if no channel
    if(!obj || e){
      console.log('nothing in modern redis, lets check legacy DB ...')
      legacy_client.hgetall("channel:"+channel_name, function (le, lobj){
        if(!lobj || le){
          console.log('nothing in legacy either SoSad')
          return
        }    
        // this merge will override metadata values
        extend(metadata, {
          platform: lobj.service,
          channel: lobj.stream
        })
        callback(metadata)
      })
    }else{
      // this merge will override metadata values
      extend(metadata, {
        platform: obj.service,
        channel: obj.stream
      })
      callback(metadata)
    }
  })
}
