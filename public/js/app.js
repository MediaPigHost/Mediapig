curl([
  'js/helpers',
  'js/microajax',
  'js/pubsub',
  'js/slide'
]).then(function (helpers, microAjax, pubsub, slide) {
    var site = {
      init : function () {

        var app = {
          'help' : helpers,
          'ajax' : microAjax,
          'publish' : pubsub.publish,
          'subscribe' : pubsub.subscribe,
          'unsubscribe' : pubsub.unsubscribe,
          'slide' : slide
        },
        dom = {
          'overlayClose' : document.getElementById('overlay-close'),
          'overlayContent' : document.getElementById('overlay-content')
        };
        site.defered(app, dom);
        site.events(app, dom);
      },
      events : function (app, dom) {

        if(dom.overlayClose){
          dom.overlayClose.addEventListener('click', function(){
            app.help.removeBodyClass('overlay-visible');
            app.publish('/view/overlay/closed', true);
          });
        }

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

        app.subscribe("/view/details/2/loaded", function(flag){

          app.help.addEventListenerByClass('os-variations-close', 'click', function(e){
            console.log('Clicked');
            e.preventDefault();
            app.help.removeBodyClass('os-variations-choice');
            app.help.addBodyClass('os-variations-chosen');
          });

          app.help.addEventListenerByClass('os', 'click', function(e){
            e.preventDefault();
            var target = e.currentTarget;
            var siblings = target.parentNode.getElementsByClassName('os');
            var osLists = document.getElementsByClassName('os-variations');
            var targetOS = target.getAttribute('data-os');

            for (var i = 0; i < siblings.length; i++) {
              app.help.removeClass(siblings[i], 'active');
              app.help.removeBodyClass('os-variations-chosen');
              app.help.addBodyClass('os-variations-choice');
            }

            for (var i = 0; i < osLists.length; i++) {
              app.help.removeClass(osLists[i], 'active');
              if (osLists[i].getAttribute('data-os') === targetOS){
                osLists[i].className += ' active';
              }
            }

            target.className += ' active';
          });
        });

        app.subscribe("/event/details/1/submit", function(flag){
          var path = window.location.pathname;
          app.ajax(window.location.origin + '/fragments/package-detail/' + path.substr(path.length -1) + '/os', function (res) {
            app.publish('/view/details/2/loaded', true);
            dom.overlayContent.innerHTML = res;
          });
        });

        app.subscribe("/view/order/details/loaded", function(flag){
          app.help.addEventListenerByClass('attribute', 'click', function(e){
            var target = e.currentTarget;
            site.variations(target, 'attribute', 'attribute-selector', 'package-detail-btn', 'http://api.mediapig.co.uk/index.php?', '/product/read/', app);
            e.preventDefault();
          });

          app.help.addEventListenerByClass('disabled', 'click', function(e){
            if( e.currentTarget.className.indexOf("disabled") > -1){
              e.preventDefault();
            } else {
              // Next page! (packages)
              app.publish('/event/details/1/submit', true);
              e.preventDefault();
            }
          });
        });

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
          app.ajax(window.location.origin + '/fragments/package-type', function (res) {
            app.publish('/view/order/loaded', true);
            dom.overlayContent.innerHTML = res;
          });
        });

        app.subscribe("/view/order/loaded", function(flag){
          setTimeout(function () {
            app.help.removeBodyClass('home');
            app.help.addBodyClass('order');
          }, 1000);
          app.help.addEventListenerByClass('package-type', 'click', function(e){
            e.preventDefault();
            var target = e.currentTarget;
            var siblings = target.parentNode.getElementsByClassName('package-type');
            var formbtn = target.parentNode.parentNode.parentNode.getElementsByClassName('package-type-btn')[0];
            for (var i = 0; i < siblings.length; i++) {
              app.help.removeClass(siblings[i],'active');
            }
            target.className += ' active';
            app.help.removeClass(formbtn, 'disabled');
          });

          app.help.addEventListenerByClass('disabled', 'click', function(e){
            if( e.currentTarget.className.indexOf("disabled") > -1){
              e.preventDefault();
            } else {
              app.help.addBodyClass('package-type-chosen');
              var selected = document.getElementsByClassName('package-type-list')[0].getElementsByClassName('active')[0];
              history.pushState('order-details', 'order-details', '/order/details/' + selected.getAttribute('data-id'));
              site.defered(app, dom);
              e.preventDefault();
            }
          });
        });

        app.subscribe("/form/register/update", function(flag){
            var button = document.getElementById('create-account-button');
            if(flag == 'success'){
              app.help.addBodyClass('register-success');
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
          app.help.postJSON({'errors' : data }, window.location.origin + '/error/message', function(xhr){
            document.getElementById("error-wrap").innerHTML += xhr.response;
          })
        })
      },
      defered : function(app, dom){
        if(document.getElementsByTagName('body')[0].className.indexOf('package-type-chosen') > -1){
          var path = window.location.pathname;
          app.ajax(window.location.origin + '/fragments/package-detail/' + path.substr(path.length -1), function (res) {
            app.publish('/view/order/details/loaded', true);
            dom.overlayContent.innerHTML = res;
            var sliders = document.getElementsByClassName('slider');
            for (var i = 0; i < sliders.length; i++) {
              app.slide.init(sliders[i], {
                'parentClass' : 'slider',
                'childClass' : 'slides'
              });
            }
          });

          return
        }

        if(document.getElementsByTagName('body')[0].className.indexOf('order') > -1){
          app.ajax(window.location.origin + '/fragments/package-type', function (res) {
            app.publish('/view/order/loaded', true);
            dom.overlayContent.innerHTML = res;
          });

          return
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
              app.publish('/form/register/update', 'fail');
              app.publish('/message/error', res.errors)
            } else {
              history.pushState('order', 'order', '/order');
              app.help.setCookie('key', res.key, '1');
              app.publish('/form/register/update', 'success');
            }
          });
        });
      },
      variations : function(target, childClass, parentClass, buttonClass, api, endpoint, app){
        app.help.variations({ target: target, childClass: childClass, parentClass: parentClass, buttonClass: buttonClass, api: api, endpoint: endpoint }, app, function(res){
          var nextId = parseInt(target.parentNode.parentNode.getAttribute('data-id')) + 1;
          var nextEl = document.getElementsByClassName('attribute-selector')[nextId];
          app.help.postJSON(res, window.location.origin + '/fragments/variant', function(xhr){

            // Cleanup work
            var arrowr = document.getElementsByClassName('slide-arrow-right')[nextId];
            var arrowl = document.getElementsByClassName('slide-arrow-left')[nextId];
            arrowr.parentNode.removeChild(arrowr);
            arrowl.parentNode.removeChild(arrowl);
            // Replace old with new
            nextEl.outerHTML = xhr.response;

            // Execute slider again for new bindings
            var newEl = document.getElementsByClassName('attribute-selector')[nextId];
            app.slide.init(newEl, {
              'parentClass' : 'slider',
              'childClass' : 'slides'
            });

            // Remove disabled added from markup
            app.help.removeClass(nextEl, 'disabled');

            for (var i = 0; i < newEl.getElementsByClassName('attribute').length; i++) {
              newEl.getElementsByClassName('attribute')[i].addEventListener('click', function(e){
                var target = e.currentTarget;
                site.variations(target, childClass, parentClass, buttonClass, api, endpoint, app);
                e.preventDefault();
              });
            }

          })
        });
      }
    }

    site.init();

}, function (ex) {
  var msg = 'OH SNAP: ' + ex.message;
  alert(msg);
});
