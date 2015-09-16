var Main = (function(my, GPhoto){
  my.gif = {};
  my.showGui = false;
  my.nbImgCountdownAnim = 7;
  my.imgDuration = 500;
  my.totalAnimDuration = my.imgDuration*7 + 2*my.imgDuration;

  my.initSocket = function(){
    var socket = io.connect('http://localhost:1789');
    socket.on('countdown', function(duration){
      my.showGifCount(duration);
    });
  };

  my.showGifCount = function(duration){
    $('#imageWrap').fadeOut(400);
    $('#counter').fadeIn(400, function() {
      my.countdownAnimation.play(function(){
        my.showStream();
      });
    });
  };

  my.showStream = function(){
    $('#counter').fadeOut(400);
    $('#imageWrap').fadeIn(400);
  }

  my.countdownAnimation = {
    images: [],
    target: document.getElementById('countdownAnimImg'),
    // Preload images
    init: function(){
      for(var i=0; i<my.nbImgCountdownAnim; i++){
        var actualIndex = i+1;
        var path = window.location.origin+'/img/countdown_';
        path += (actualIndex <10) ? '0'+actualIndex+'.png' : actualIndex+'.png';
        this.images[i] = new Image();
        this.images[i].src = path;
      }
    },
    changeAnimImg: function(index, options, callback){
      var _self = this;
      // Make first image stay longer
      var delay = (index != 0) ? index*my.imgDuration + my.imgDuration : index*my.imgDuration;
      setTimeout(function(){ 
        _self.target.src = _self.images[index].src;
        if(typeof callback == 'function'){
          setTimeout(function(){ _self.target.src = ''; callback(); }, my.imgDuration*2);
        } 
      }, delay);
    },
    // Play animation
    play: function(callback){
      var _self = this;
      for(var i=0; i<_self.images.length; i++){
        var extendendDuration = false;
        if(i==0){extendedDuration = true;} else {extendedDuration = false;}
        if(i+1 == _self.images.length){
          this.changeAnimImg(i,{extendedDuration: extendedDuration} ,callback);
        } else {
          this.changeAnimImg(i, {extendedDuration: extendedDuration});
        }
      }
    },
  }

  my.initStream = function(){
    window.gphoto.startPreview(8088);
  };

  my.initGphoto = function(){
    window.gphoto = new GPhoto();
    if(my.showGui){
      window.gphoto.displaySettings();
    }
  };

  my.init = function(){
    my.initGphoto();
    my.initSocket();
    my.initStream();
    my.countdownAnimation.init();
  };

  return my;
}(Main || {}, GPhoto || {}));

Main.init();