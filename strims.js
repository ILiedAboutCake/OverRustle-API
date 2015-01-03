// client side code

var socket = io('http://api.overrustle.com');
// var socket = io('http://localhost:9998');

socket.on('strims', function(api_data){
  var strims = api_data["streams"]
  var path = window.location.href.replace(window.location.origin, "")
  if(/s=(twitch|hitbox)/gi.test(path)){
    path = path.toLowerCase()
  }
  $('#server-broadcast').html(strims[path]); // not using formatNumber
  // $('#server-broadcast').text(JSON.stringify(api_data)); // not using formatNumber
});
