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
    // not the first letter -- so be careful
    'f':'afreeca'
    'p':'picarto',
    'v':'vaughn'
  },
  expand: function (raw_path) {
    var parts = raw_path.split('/')

    if(parts.length > 1){
      return shortcuts.list[parts[0]] + "/" + parts[1]
    }
    return "/"+parts[0]

  },
  init:function (app) {
    app.get('/shortcuts.json', function(req, res){
      res.json(shortcuts.list)
    })
    app.get('/', function (req, res) {
      var redirect_to = 'http://overrustle.com'
      console.log('redirecting to: '+redirect_to);
      res.redirect(redirect_to);
    })
    app.get('/:platform/:channel', function (req, res) {
      if (shortcuts.list.hasOwnProperty(req.params.platform.toLowerCase())) {
        req.params.platform = shortcuts.list[req.params.platform.toLowerCase()];
      };
      var redirect_to = 'http://overrustle.com/'+
        req.params.platform+'/'+req.params.channel;
      console.log('redirecting to: '+redirect_to);
      res.redirect(url.format(redirect_to));
    })
    // handle custom user channels
    app.get('/:channel', function (req, res) {
      return res.redirect("http://overrustle.com/"+req.params.channel)
    })
  }
}

module.exports = shortcuts;
