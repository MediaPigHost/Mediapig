window.onload = function(){
  var site = {
    init : function () {
      var helpers = require('./helpers');
      var microAjax = require('./microajax');
      var pubsub = require('./pubsub');
      var swig  = require('swig');
      var app = {
        'help' : helpers,
        'ajax' : microAjax,
        'publish' : pubsub.publish,
        'subscribe' : pubsub.subscribe,
        'unsubscribe' : pubsub.unsubscribe,
        'render' : swig.run,
        'precompile' : swig.precompile
      },
      dom = {
        'overlayClose' : document.getElementById('overlay-close'),
        'overlayContent' : document.getElementById('overlay-content')
      }
      site.events(app, dom);
    },
    events : function (app, dom) {

      app.help.addEventListenerByClass('overlay-trigger', 'click', function(){
        app.publish('/event/register/submit', true);
        app.ajax(window.location.origin + '/fragments/register', function (res) {
          app.publish('/view/register/success', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.help.addEventListenerByClass('signin-btn', 'click', function(e){
        e.preventDefault();
        app.help.addBodyClass('overlay-visible');
        app.ajax(window.location.origin + '/fragments/signin', function (res) {
          app.publish('/view/signin/success', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      dom.overlayClose.addEventListener('click', function(){
        app.help.removeBodyClass('overlay-visible');
        app.publish('/view/overlay/closed', true);
      });

      app.subscribe("/view/register/success", function(flag){
          if(flag === true){
            site.postSignup(app);
            app.help.addEventListenerByClass('help', 'click', function(e){
              app.help.showTooltip(e, 'help-message');
            });
          }
      });

      app.subscribe("/form/register/update", function(flag){
          var button = document.getElementById('create-account-button');
          app.help.loading(button, 'remove');
      });

      app.subscribe("/event/register/submit", function(){
        app.help.addBodyClass('overlay-visible');
      });

      app.subscribe("/message/error", function(data){
        document.getElementById("error-wrap").innerHTML += data.html;
      })
    },
    postSignup : function(app){
      var submitacct = document.getElementById('create-account-button');
      submitacct.addEventListener('click', function(e){
        e.preventDefault();
        app.help.loading(submitacct);
        var signupFormEl = document.getElementById("signup");
        var formData = new FormData(signupFormEl);
        app.help.postForm(signupFormEl, function(xhr){
          app.help.removeElementsByClass('error');

          var res = JSON.parse(xhr.response);
          if(res.errors){
            app.publish('/form/register/update', 'fail');
            var tpl = app.precompile('{% for error in errors |reverse %}<div class="error">{{ error }}</div>{% endfor %}').tpl
            var template = app.render(tpl, { 'errors' : res.errors });
            app.publish('/message/error', { html : template })
          } else {
            app.publish('/form/register/update', 'success');
          }
        });
      });
    }
  }

  site.init();
};
