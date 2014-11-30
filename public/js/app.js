var cfg = {
  baseUrl: '/js/',
  paths: {
    require: './require',
    helpers: 'helpers',
    microAjax: 'microajax',
    pubsub: 'pubsub',
    slide: 'slide'
  }
},
app;

curl(cfg, ['require', 'helpers','microAjax','pubsub','slide']).then(function (require, helpers, microAjax, pubsub, slide) {
        var configOrder = {};

        var site = {
            init: function () {

                app = {
                    help: helpers,
                    ajax: microAjax,
                    publish: pubsub.publish,
                    subscribe: pubsub.subscribe,
                    unsubscribe: pubsub.unsubscribe,
                    slide: slide
                };

                var dom = {
                    overlayClose: document.getElementById('overlay-close'),
                    overlayContent: document.getElementById('overlay-content'),
                    body: document.getElementsByTagName('body')
                };


                if (siteObj.pagetype === 'order') {
                  curl('order', function(order){
                      order.init();
                  });

                  curl('register', function(register){
                      register.init();
                  });
                }

                if (siteObj.pagetype === 'landing') {
                  curl('landing', function(landing){
                      landing.init();
                  });

                }

                if (siteObj.section === 'account') {
                  curl('account', function(account){
                      account.init();
                  });

                }

                site.events(app, dom);
            },
            events: function (app, dom) {

                var invoiceID = "";
                var stripe = null;
                var animateStatus = [{}];

                if (dom.overlayClose) {

                    dom.overlayClose.addEventListener('click', function () {
                        app.help.removeBodyClass('overlay-visible');
                        app.publish('/view/overlay/closed', true);
                    });
                }


                app.help.addEventListenerByClass('signin-btn', 'click', function (event) {

                    event.preventDefault();

                    app.help.addBodyClass('overlay-visible');

                    app.ajax(window.location.origin + '/page/signin', function (res) {
                        app.publish('/view/signin/loaded', true);
                        dom.overlayContent.innerHTML = res;
                    });
                });

                app.subscribe("/view/signin/loaded", function(flag) {
                  if (flag === true) {
                    var signin = document.getElementById('signin');
                    signin.addEventListener('submit', function(e){
                      e.preventDefault();
                      var signin = document.getElementById('signin'); // Cache buster
                      app.help.postJSON({ "ajax" : true, "email" : signin.elements.namedItem("email").value, "password" : signin.elements.namedItem("password").value }, window.location.origin + '/login', function (xhr) {
                        console.log(xhr.response);
                        var body = JSON.parse(xhr.response);
                        if (body.errors){
                          app.publish('/message/error', body.errors);
                        }

                        if (body.status === 'success'){
                          window.location.href = window.location.origin + '/manage';
                        }
                      });
                    });

                    var forgotpass = document.getElementById('forgotpass');
                    forgotpass.addEventListener('submit', function(e){
                      e.preventDefault();
                      var forgotpass = document.getElementById('forgotpass');
                      app.help.postJSON({ "ajax" : true, "email" : forgotpass.elements.namedItem("email").value }, window.location.origin + '/forgot', function (xhr) {
                        var body = JSON.parse(xhr.response);
                        console.log(body);
                        if (body.errors){
                          app.publish('/message/error', body.errors);
                        } else {
                          var success = document.getElementById('reset-success'),
                              forgotView = document.getElementById('forgotpass-form');
                          success.className += ' visible';
                          app.help.removeClass(forgotView, 'visible');
                        }
                      });
                    });

                    var forgotpassLink = document.getElementById('forgotpass-link');

                    forgotpassLink.addEventListener('click', function(e){
                      e.preventDefault();
                      var forgotView = document.getElementById('forgotpass-form'),
                          signupView = document.getElementById('signin-form');

                      forgotView.className += ' visible';
                      app.help.removeClass(signupView, 'visible');
                    });

                    var signupLink = document.getElementsByClassName('signin-link');
                    for (var i = 0; i < signupLink.length; i++) {
                      signupLink[i].addEventListener('click', function(e){
                        e.preventDefault();
                        var forgotView = document.getElementById('forgotpass-form'),
                            successView = document.getElementById('reset-success'),
                            signupView = document.getElementById('signin-form');

                        signupView.className += ' visible';
                        app.help.removeClass(successView, 'visible');
                        app.help.removeClass(forgotView, 'visible');
                      });
                    }

                  }
                });

                app.subscribe("/event/register/submit", function () {
                    app.help.addBodyClass('overlay-visible');
                });

                app.subscribe("/message/error", function (data) {

                    if (typeof data != 'array') {
                      var arr = [];
                      arr.push(data);
                      data = arr;
                    }

                    app.help.postJSON({'errors': data }, window.location.origin + '/error/message', function (xhr) {
                        var errorWrap = document.getElementById("error-wrap");
                        errorWrap.innerHTML += xhr.response;
                        errorWrap.className += ' active-error';
                        setTimeout(function () {
                          app.help.removeClass(errorWrap, 'active-error');
                        }, 5000);
                    });
                });
            }
        }

        site.init();

    }, function (ex) {
        var msg = ex.message;
    });
