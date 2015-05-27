// TODO: make this more modular
var makeRedisClient = require('./make_redis_client')

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
