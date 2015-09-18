var Main = (function(my, GPhoto){
  my.gif = {};
  my.showGui = false;
  my.nbImgCountdownAnim = 7;
  my.animDurationArray = [1600,700,700,700,700,1400,1400];
  my.showLastPicTimeout = {};

  my.$cdHolder = $('#counter');
  my.$imgHolder = $('#imageWrap');
  my.$mainImg = $('#mainImage');

  my.getTotalAnimationDuration = function(){
    var totalDuration = 0;
    my.animDurationArray.forEach(function(element){
      totalDuration += element;
    });
    return totalDuration;
  };

  my.initSocket = function(){
    var socket = io.connect('http://localhost:1789');
    socket.on('countdown', function(duration){
      my.showGifCount(duration);
    });
    socket.on('lastPicture', function(imgData){
      my.$mainImg.attr('src','data:image/jpeg;base64,'+imgData);
      my.showStream(function(){
        my.showLastPicTimeout = setTimeout(function(){my.clearLastPicture();}, 5000);
      });
    });
  };

  my.clearLastPicture = function(){
    clearTimeout(my.showLastPicTimeout);
    my.$imgHolder.fadeOut(400, function(){
      my.$mainImg.attr('src','');
    });
  };

  my.showGifCount = function(duration){
    my.clearLastPicture();
    my.$imgHolder.fadeOut(400);
    my.$cdHolder.fadeIn(400, function() {
      my.countdownAnimation.play(function(){
        my.$cdHolder.fadeOut(400);
      });
    });
  };

  my.showStream = function(callback){
    my.$cdHolder.fadeOut(400);
    my.$imgHolder.fadeIn(400, callback);
  };

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
    changeAnimImg: function(index, callback){
      var _self = this;
      // Make first image stay longer
      var delay = 0;
      for(var i = 0; i < index; i++){
        delay +=   my.animDurationArray[i];
      }
      setTimeout(function(){ 
        _self.target.src = _self.images[index].src;
        if(typeof callback == 'function'){
          setTimeout(function(){ _self.target.src = ''; callback(); },  my.animDurationArray[index]);
        } 
      }, delay);
    },
    // Play animation
    play: function(callback){
      var _self = this;
      for(var i=0; i<_self.images.length; i++){
        var extendendDuration = false;

        if(i+1 == _self.images.length){
          this.changeAnimImg(i, callback);
        } else {
          this.changeAnimImg(i);
        }
      }
    },
  }

  my.initStream = function(){
    window.gphoto.startPreview(8088);
  };

  my.initGphoto = function(){
    window.gphoto = new GPhoto({
      $mainImg: my.$mainImg
    });
    if(my.showGui){
      window.gphoto.displaySettings();
    }
  };

  my.init = function(){
    my.initGphoto();
    my.initSocket();
    // my.initStream();
    my.countdownAnimation.init();
  };

  return my;
}(Main || {}, GPhoto || {}));

Main.init();
