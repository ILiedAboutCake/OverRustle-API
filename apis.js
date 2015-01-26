var request = require('request');
var extend = require('util')._extend;

var apis = {
  DEFAULT_PLACEHOLDER: "http://overrustle.com/img/jigglymonkey.gif",
  // TODO add placeholders for each individual platform
  PLACEHOLDERS: {
    "picarto": "https://www.picarto.tv/img/thumbnail_stream_default.png",
    "mlg": "http://s3.amazonaws.com/s3.majorleaguegaming.com/tv-category-icons/image_16_9s/95/medium/comingsoon.jpg?1390332269"
  },
  STREAMING_APIS: {
    // TODO: get stream TITLE
    // TODO: return a promise object, instead of nasty callbacks
    // vods ARE case sensitive
    "twitch-vod": function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://api.twitch.tv/kraken/videos/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.preview;
          api_data.viewers = parseInt(json.views, 10);
          api_data.title = json.title;
        }else{
          api_data.image_url = apis.getPlaceholder('twitch-vod')
        }
        callback(api_data)
      })
    },
    twitch: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://api.twitch.tv/kraken/streams/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json && json.hasOwnProperty('stream') && json.stream !== null // TODO
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.stream.preview.large;
          api_data.viewers = parseInt(json.stream.viewers, 10);
          api_data.title = json.stream.status;
        }else{
          api_data.image_url = apis.getPlaceholder('twitch')
        }
        callback(api_data)
      })
    },
    hitbox: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.hitbox.tv/media/stream/"+api_data.channel}, function (e, r, res) {      
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json.hasOwnProperty('livestream') && json.livestream[0].media_is_live === "1";
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          var _stream = json.livestream[0]
          api_data.image_url = "http://edge.sf.hitbox.tv" + _stream.media_thumbnail_large;
          api_data.viewers = parseInt(_stream.media_views, 10);
          api_data.title = _stream.media_status;
        }else{
          api_data.image_url = apis.getPlaceholder('hitbox')
        }
        callback(api_data);
      })
    },
    ustream: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.ustream.tv/channels/"+api_data.channel+".json"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode != 404 && typeof json.channel !== 'undefined' && json.channel.status === 'live' // todo: get live status from ustream
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          api_data.image_url = json.channel.thumbnail.live; 
          api_data.viewers = parseInt(json.channel.stats.viewer, 10);
          api_data.title = json.channel.title;
        }else{
          api_data.image_url = apis.getPlaceholder('ustream')
        }
        callback(api_data);
      })
    },
    azubu: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      return request.get({json:true, uri:"http://www.azubu.tv/api/video/active-stream/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && json.total > 0 && json.data[0].user.channel.is_live
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          var _stream = json.data[0].user.channel
          // TODO: maybe get their offline image?
          api_data.image_url = _stream.url_thumbnail;
          api_data.viewers = parseInt(_stream.view_count, 10);
          api_data.title = _stream.title;
        }else{
          api_data.image_url = apis.getPlaceholder('azubu')
        }
        callback(api_data);
      })
    },
    picarto: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      return request.get({uri:"https://www.picarto.tv/channel_img/"+api_data.channel.toLowerCase()+"/thumbnail_stream.png"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        // picarto has no real API. RIP
        // var json = res
        api_data.live = r.statusCode < 400 && r.headers['content-type'].indexOf("image")
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          var _stream = json.data[0].user.channel
          api_data.image_url = "https://www.picarto.tv/channel_img/"+api_data.channel.toLowerCase()+"/thumbnail_stream.png"          
          // TODO: scrape the page directly if we really want to 
          // implement full support for them
          // "https://www.picarto.tv/live/channel.php?watch="+api_data.channel
          api_data.viewers = 0
          api_data.title = api_data.channel
        }else{
          api_data.image_url = "https://www.picarto.tv/img/offlinestreamer.png"
        }
        callback(api_data);
      })
    },
    mlg: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      // no way to request data for a specific stream
      return request.get({json:true, uri:"http://www.majorleaguegaming.com/api/channels/all.js?fields=id,name,slug,subtitle,stream_name,image_16_9_medium,description"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && json.data.items.length > 0
        // console.log("Got response: " + res.statusCode);
        api_data.image_url = apis.getPlaceholder('mlg')
        if (!api_data.live) {
          callback(api_data);
          return
        }
        var _stream = null;
        for (var i = json.data.items.length - 1; i >= 0; i--) {
          if(api_data.channel.toLowerCase() == json.data.items[i]["slug"].toLowerCase()){
            _stream = json.data.items[i]
            break
          }
        }
        if (!_stream) {
          callback(api_data);
          return
        }
        api_data.image_url = _stream.image_16_9_medium
        api_data.title = _stream.subtitle
        request.get({json:true, uri: "http://streamapi.majorleaguegaming.com/service/streams/status/"+_stream.stream_name}, function (e, r, res) {
          if(e)
            return error_callback(e)
          var json = res
          if (r.statusCode >= 400 || !json.data.hasOwnProperty('viewers')) {
            callback(api_data)
            return
          }
          api_data.viewers = parseInt(json.data.viewers, 10)
          // -1 is offline, 1 is live, 2 is replay
          api_data.live = json.data.status == 1
          callback(api_data);
        })
      })
    },
    // https://gdata.youtube.com/feeds/api/videos/z18NGK1H8n8?v=2&alt=json
    youtube: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://gdata.youtube.com/feeds/api/videos/"+api_data.channel+"?v=2&alt=json"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && typeof json.entry !== 'undefined'
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          api_data.image_url = "http://img.youtube.com/vi/"+api_data.channel+"/maxresdefault.jpg"
          // for some reason the default is ugly, so don't use it
          // api_data.image_url = json.entry['media$group']['media$thumbnail'][0]['url'];
          api_data.viewers = 0
          // because sometimes youtube gives us bad data...
          if (json.entry.hasOwnProperty('yt$statistics') && json.entry['yt$statistics'].hasOwnProperty('viewCount')) {
            api_data.viewers = parseInt(json.entry['yt$statistics']['viewCount'], 10)
          }
          api_data.title = json.entry.title['$t'];
        }else{
          api_data.image_url = apis.getPlaceholder('youtube')
        }
        callback(api_data);
      })
    }
  },
  getAPI: function (metadata, callback) {
    if(apis.STREAMING_APIS.hasOwnProperty(metadata.platform)){
      apis.STREAMING_APIS[metadata.platform](metadata, function(e) {
        console.log("ERR: GETing thumbnail for "+metadata.channel+" on "+metadata.platform+" - Got error: " + e.message);
        // reverse merge
        // b is written into a, and b is returned
        // if we did it the other way, defaults would override real values
        metadata = extend({viewers: 0, live: false, image_url: apis.getPlaceholder(metadata.platform)}, metadata)
        callback(metadata);
      }, callback);
    }else{
      // reverse merge
      // b is written into a, and b is returned
      // if we did it the other way, defaults would override real values 
      metadata = extend({viewers: 0, live: true, image_url: apis.getPlaceholder(metadata.platform)}, metadata)
      callback(metadata);
    }
  },
  // todo: placeholders for each platform
  getPlaceholder: function (platform) {
    return apis.PLACEHOLDERS[platform] ? apis.PLACEHOLDERS[platform] : apis.DEFAULT_PLACEHOLDER;
  }  
}

module.exports = apis
