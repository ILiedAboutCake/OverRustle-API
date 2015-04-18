var url = require('url')

var shortcuts = {
  list: {
    't':'twitch',
    // 'v':'twitch-vod',
    'tv':'twitch-vod',
    'c':'castamp',
    'h':'hitbox',
    'y':'youtube',
    // 'l':'youtube-playlist',
    'yl':'youtube-playlist',
    'm':'mlg',
    // 'n':'nsfw-chaturbate',
    'nsfw-c':'nsfw-chaturbate',
    'u':'ustream',
    'l':'livestream',
    'd':'dailymotion',
    'a':'azubu',
    'p':'picarto'
  },
  expand: function (raw_path) {
    var parts = raw_path.split('/')
    if (parts.length > 1) {
      return "/destinychat?s="+
        shortcuts.list[parts[0]]+"&stream="+parts[2]
    }else{
      return "/channel?user="+raw_path
    }
  },
  init:function (app) {
    app.get('/shortcuts.json', function(req, res){
      res.json(shortcuts.list)
    })
    app.get('/', function (req, res) {
      var redirect_to = 'http://overrustle.com/strims'
      console.log('redirecting to: '+redirect_to);
      res.redirect(redirect_to);
    })
    app.get('/:platform/:channel', function (req, res) {
      if (shortcuts.list.hasOwnProperty(req.params.platform)) {
        req.params.platform = shortcuts.list[req.params.platform];
      };
      var redirect_to = 'http://overrustle.com/destinychat?s='+
        req.params.platform+
        '&stream='+
        req.params.channel;
      console.log('redirecting to: '+redirect_to);
      res.redirect(url.format(redirect_to));
    })
    // handle custom user channels
    app.get('/:channel', function (req, res) {
      var redirect_to = 'http://overrustle.com/channel?user='+
        req.params.channel;
      console.log('redirecting to: '+redirect_to);
      res.redirect(url.format(redirect_to));
    })
  }
}

module.exports = shortcuts;