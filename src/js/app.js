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
      };
      site.defered(app, dom);
      site.events(app, dom);
    },
    events : function (app, dom) {

      app.help.addEventListenerByClass('overlay-trigger', 'click', function(){
        app.publish('/event/register/submit', true);
        app.ajax(window.location.origin + '/fragments/register', function (res) {
          app.publish('/view/register/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.help.addEventListenerByClass('signin-btn', 'click', function(e){
        e.preventDefault();
        app.help.addBodyClass('overlay-visible');
        app.ajax(window.location.origin + '/fragments/signin', function (res) {
          app.publish('/view/signin/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      if(dom.overlayClose){
        dom.overlayClose.addEventListener('click', function(){
          app.help.removeBodyClass('overlay-visible');
          app.publish('/view/overlay/closed', true);
        });
      }

      app.subscribe("/view/register/loaded", function(flag){
          if(flag === true){
            site.postSignup(app);
            app.help.addEventListenerByClass('help', 'click', function(e){
              app.help.showTooltip(e, 'help-message');
            });
          }
      });

      app.subscribe("/view/order", function(flag){
        document.getElementsByClassName('wrap')[0].innerHTML = "";
        app.ajax(window.location.origin + '/fragments/order', function (res) {
          app.publish('/view/order/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      });

      app.subscribe("/view/order/loaded", function(flag){
        console.log('view/order/loaded');
        setTimeout(function () {
          app.help.removeBodyClass('home');
          app.help.addBodyClass('order');
        }, 1000);
        app.help.addEventListenerByClass('package-type', 'click', function(e){
          console.log('clicked');
          var target = e.currentTarget;
          var siblings = target.parentNode.getElementsByClassName('package-type');
          for (var i = 0; i < siblings.length; i++) {
            app.help.removeClass(siblings[i],'active');
          }
          target.className += ' active';
        });
      });

      app.subscribe("/form/register/update", function(flag){
          var button = document.getElementById('create-account-button');
          if(flag == 'success'){
            app.help.addBodyClass('loading-success');
            app.help.loading(button, 'success');
            setTimeout(function () {
              app.publish('/view/order', true);
            }, 2000);
          } else {
            app.help.loading(button, 'remove');
          }
      });

      app.subscribe("/event/register/submit", function(){
        app.help.addBodyClass('overlay-visible');
      });

      app.subscribe("/message/error", function(data){
        document.getElementById("error-wrap").innerHTML += data.html;
      })
    },
    defered : function(app, dom){
      if(document.getElementsByTagName('body')[0].className.indexOf('order') > -1){
        app.ajax(window.location.origin + '/fragments/order', function (res) {
          app.publish('/view/order/loaded', true);
          dom.overlayContent.innerHTML = res;
        });
      }
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
            var tpl = app.precompile('{% for error in errors |reverse %}<div class="error">{{ error }}</div>{% endfor %}').tpl
            var template = app.render(tpl, { 'errors' : res.errors });
            app.publish('/form/register/update', 'fail');
            app.publish('/message/error', { html : template })
          } else {
            history.pushState('order', 'order', '/order');
            app.help.setCookie('key', res.key, '1');
            app.publish('/form/register/update', 'success');
          }
        });
      });
    }
  }

  site.init();
};
