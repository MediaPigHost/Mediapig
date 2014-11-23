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


                app.help.addEventListenerByClass('overlay-trigger', 'click', function () {

                    app.publish('/event/register/submit', true);

                    app.ajax(window.location.origin + '/page/register', function (res) {
                        app.publish('/view/register/loaded', true);
                        dom.overlayContent.innerHTML = res;
                    });
                });

                app.help.addEventListenerByClass('signin-btn', 'click', function (event) {

                    event.preventDefault();

                    app.help.addBodyClass('overlay-visible');

                    app.ajax(window.location.origin + '/page/signin', function (res) {
                        app.publish('/view/signin/loaded', true);
                        dom.overlayContent.innerHTML = res;
                    });
                });

                app.subscribe("/view/register/loaded", function (flag) {

                    if (flag === true) {
                        site.postSignup(app);
                        app.help.addEventListenerByClass('help', 'click', function (event) {
                            app.help.showTooltip(event, 'help-message');
                        });
                    }
                });

                app.subscribe("/form/register/update", function (flag) {

                    var button = document.getElementById('create-account-button');

                    if (flag === 'success') {

                        app.help.addBodyClass('register-success-transition');
                        app.help.loading(button, 'success');

                        setTimeout(function () {
                            app.publish('/view/order', true);
                        }, 2000);
                    }
                    else {
                        app.help.loading(button, 'remove');
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
                        errorWrap.className = errorWrap.className + ' active-error';
                        setTimeout(function () {
                          app.help.removeClass(errorWrap, 'active-error');
                        }, 5000);
                    });
                });
            },
            postSignup: function (app) {

                var submitAccount = document.getElementById('create-account-button');

                submitAccount.addEventListener('click', function (event) {

                    event.preventDefault();

                    app.help.loading(submitAccount);

                    var signupFormEl = document.getElementById("signup");
                    var formData = new FormData(signupFormEl);

                    app.help.postForm(signupFormEl, function (xhr) {
                        app.help.removeElementsByClass('error');

                        var res = JSON.parse(xhr.response);

                        if (res.errors) {
                            app.publish('/form/register/update', 'fail');
                            app.publish('/message/error', res.errors)
                        }
                        else {
                            window.location.href = '/order';
                            history.pushState('order', 'order', '/order');
                            app.help.setCookie('key', res.key, '1');
                            app.help.setCookie('user', res.customer_id, '1');
                            app.publish('/form/register/update', 'success');
                        }
                    });
                });
            }
        }

        site.init();

    }, function (ex) {
        var msg = ex.message;
    });
