var request = require('request');
var extend = require('util')._extend;

var apis = {
  DEFAULT_PLACEHOLDER: "http://overrustle.com/img/jigglymonkey.gif",
  PLACEHOLDERS: {

  },
  STREAMING_APIS: {
    // todo: return a promise object, 
    // with a callback that returns an image_url
    twitch: function (api_data, callback) {
      return request.get({json:true, uri:"https://api.twitch.tv/kraken/streams/"+api_data.channel}, function (e, r, res) {
        var json = res
        api_data.live = json && json.hasOwnProperty('stream') && json.stream !== null // TODO
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.stream.preview.large;
          api_data.viewers = parseInt(json.stream.viewers, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('twitch')
        }
        callback(api_data)
      })
    },
    hitbox: function (api_data, callback) {
      return request.get({json:true, uri:"http://api.hitbox.tv/media/stream/"+api_data.channel}, function (e, r, res) {      
        var json = res
        var api_data = {}
        api_data.live = json.hasOwnProperty('livestream') && json.livestream[0].media_is_live === "1";
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // todo: maybe get their offline image?
          api_data.image_url = "http://edge.sf.hitbox.tv" + json.livestream[0].media_thumbnail_large;
          api_data.viewers = parseInt(json.livestream[0].media_views, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('hitbox')
        }
        callback(api_data);
      })
    },
    ustream: function (api_data, callback) {
      return request.get({json:true, uri:"http://api.ustream.tv/channels/"+api_data.channel+".json"}, function (e, r, res) {
        var json = res
        api_data.live = r.statusCode != 404 && json.channel.status === 'live' // todo: get live status from ustream
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // todo: maybe get their offline image?
          api_data.image_url = json.channel.thumbnail.live; 
          api_data.viewers = parseInt(json.channel.stats.viewer, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('ustream')
        }
        callback(api_data);
      })
    },
  },
  getAPI: function (metadata, callback) {
    if(apis.STREAMING_APIS.hasOwnProperty(metadata.platform)){
      apis.STREAMING_APIS[metadata.platform](metadata, callback).on('error', function(e) {
        console.log("ERR: GETing thumbnail for "+channel+" on "+metadata.platform+" - Got error: " + e.message);
        callback( extend(metadata, {viewers: 0, live: false, image_url: apis.getPlaceholder(metadata.platform)}) );
      });
    }else{
      callback( extend(metadata, {viewers: 0, live: true, image_url: apis.getPlaceholder(metadata.platform)}) );
    }
  },
  // todo: placeholders for each platform
  getPlaceholder: function (platform) {
    return apis.PLACEHOLDERS[platform] ? apis.PLACEHOLDERS[platform] : apis.DEFAULT_PLACEHOLDER;
  }  
}

module.exports = apis
