// TODO: make this more modular
var redis_host = '172.16.5.254'
var redis_db = 1
var client = require('redis').createClient(6379, redis_host, {})
// TODO: cache

module.exports = function (channel_name, callback) {
  console.log('getting from redis', channel_name)
  client.select(redis_db, function () {
    console.log('selected', redis_db)
    client.hgetall("channel:"+channel_name, function (e, obj) {
      console.log('did hgetall', 'error:', e, 'result:', obj)
      // return bad things
      // if no channel
      if(!obj || e)
        console.log('nothing in redis SoSad')
        return
      
      callback({
        platform: obj.service,
        channel: obj.stream
      })
    })
  })
}
