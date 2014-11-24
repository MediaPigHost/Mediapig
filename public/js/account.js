define(['require', 'exports', 'module', 'helpers', 'microAjax'], function (require, exports, module, helpers, microAjax) {
  var account = {
    init : function(){
      this.events();
    },
    events : function(){
      var stopService = document.getElementById('service-stop'),
          startService = document.getElementById('service-start'),
          restartService = document.getElementById('service-restart');

      if(stopService){
        stopService.addEventListener('click', function (e) {
          e.preventDefault();
          var target = e.currentTarget;
          if (!target.classList.contains('loading')){
            target.className += " loading";

            helpers.postJSON({'service_id' : siteObj['service_id']}, window.location.origin + '/service/stop', function (res) {
              if(res.status == 'success'){
                helpers.removeClass(target, 'loading');
                target.className += 'hide';
                helpers.removeClass(startService, 'hide');
              } else {
                helpers.removeClass(target, 'loading');
              }
            });
          }
        });
      }

      helpers.addEventListenerByClass('invoice-line', 'click', function(e){
        e.preventDefault();
        var target = e.currentTarget;
        window.location.href = target.getAttribute('data-href');
      });

      if(startService){
        startService.addEventListener('click', function (e) {
          e.preventDefault();
          var target = e.currentTarget;
          if (!target.classList.contains('loading')){
            target.className += " loading";

            helpers.postJSON({'service_id' : siteObj['service_id']}, window.location.origin + '/service/start', function (res) {
              if(res.status == 'success'){
                helpers.removeClass(target, 'loading');
                target.className += 'hide';
                helpers.removeClass(stopService, 'hide');
              } else {
                helpers.removeClass(target, 'loading');
              }
            });
          }
        });
      }

      if(restartService){
        restartService.addEventListener('click', function (e) {
          e.preventDefault();
          var target = e.currentTarget;
          if (!target.classList.contains('loading')){
            target.className += " loading";

            helpers.postJSON({'service_id' : siteObj['service_id']}, window.location.origin + '/service/restart', function (res) {
              if(res.status == 'success'){
                helpers.removeClass(target, 'loading');
              } else {
                helpers.removeClass(target, 'loading');
              }
            });
          }
        });
      }
    }
  }
  module.exports = account;
});
