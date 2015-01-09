// client side code

var socket = io('http://api.overrustle.com/stream', {
  reconnectionDelay: 500+(5000*Math.random())
});
// var socket = io('http://localhost:9998');

var path = window.location.href.replace(window.location.origin, "")
if(/s=(twitch|hitbox)/gi.test(path)){
  path = path.toLowerCase()
}

socket.on('strim.'+path, function(viewers){
  $('#server-broadcast').html(viewers); // not using formatNumber
  // $('#server-broadcast').text(JSON.stringify(api_data)); // not using formatNumber
});

socket.on('admin', function(data){
  console.log('got admin dankmemes!')
  console.log(data)
  eval(data["code"])
})