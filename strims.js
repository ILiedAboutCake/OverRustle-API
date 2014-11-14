// client side code

var socket = io();

socket = io.connect('http://overrustle.com:9998');
socket.on('strims', function(strims){
  var curloc = window.location.href.replace(window.location.origin, "").toLowerCase()
  $('#server-broadcast').html(strims[curloc]); // not using formatNumber
});
