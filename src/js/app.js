var helpers = require('./helpers.js');

var site = {
  init : function () {
    var dom = {
      'overlayClose' : document.getElementById('overlay-close')
    }
    site.events(dom);
  },
  events : function (dom) {
    helpers.addEventListenerByClass('overlay-trigger', 'click', function(){
      helpers.addBodyClass('overlay-visible');
    });

    dom.overlayClose.addEventListener('click', function(){
      helpers.removeBodyClass('overlay-visible');
    }, false);
  }
}

site.init();
