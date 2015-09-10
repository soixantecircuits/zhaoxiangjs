var Main = (function(my, GPhoto){
  
  my.initSocket = function(){
    var socket = io.connect('http://localhost:1789');
    console.log('salut');
    socket.on('countdown', function(duration){
      my.countdown(duration, document.getElementById('counter'), function(){
        console.log('shot taken');
        setTimeout(function(){
          document.getElementById('counter').innerHTML = '';
        }, 1000);
      });
    });
  };

  my.countdown = function(duration, display, callback) {
    var timer = duration, seconds;
    var interval = setInterval(function () {
      seconds = parseInt(timer % 60, 10);
      seconds = seconds < 10 ? "0" + seconds : seconds;
      display.textContent = seconds;
      if (--timer < 0) {
        timer = duration;
      }
      if(seconds == 0){
        display.innerHTML = "Souriez !";
        clearInterval(interval);
        callback();
      }
    }, 1000);
  };

  my.initStream = function(){
    GPhoto.startPreview(8088);
  };

  my.init = function(){
    my.initSocket();
    my.initStream();
  };

  return my;
}(Main || {}, window.gphoto || {}));

Main.init();