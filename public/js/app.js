curl([
    'js/helpers',
    'js/microajax',
    'js/pubsub',
    'js/slide'
]).then(function (helpers, microAjax, pubsub, slide) {
        var configOrder = {};
        var site = {
            init: function () {

                var app = {
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

                site.defered(app, dom);
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

                window.onscroll = function (event) {
                  if (window.pageYOffset > 1000 && (animateStatus[0].active != 'true' || typeof animateStatus[0].active === 'undefined')) {
                    var el = document.getElementsByClassName('oneclick-window');
                    if (el) {
                      el[0].className += ' animate';
                    }
                    animateStatus[0].active = 'true';
                    setTimeout(function () {

                      app.help.addEventListenerByClass('oneclick-window', 'mouseover', function(e){
                        e.target.parentNode.className += ' animate-hover'
                      });

                      app.help.addEventListenerByClass('oneclick-window', 'mouseout', function(e){
                        app.help.removeClass(el[0], 'animate-hover');
                      });
                    }, 900);
                  }
                }

                app.help.addEventListenerByClass('overlay-trigger', 'click', function () {

                    app.publish('/event/register/submit', true);

                    app.ajax(window.location.origin + '/pages/register', function (res) {
                        app.publish('/view/register/loaded', true);
                        dom.overlayContent.innerHTML = res;
                    });
                });

                app.help.addEventListenerByClass('signin-btn', 'click', function (event) {

                    event.preventDefault();

                    app.help.addBodyClass('overlay-visible');

                    app.ajax(window.location.origin + '/pages/signin', function (res) {
                        app.publish('/view/signin/loaded', true);
                        dom.overlayContent.innerHTML = res;
                    });
                });
                //
                // app.subscribe("/view/details/2/loaded", function (flag) {
                //
                //     app.help.addEventListenerByClass('os-variations-close', 'click', function (event) {
                //
                //         event.preventDefault();
                //
                //         app.help.removeBodyClass('os-variations-choice');
                //         app.help.addBodyClass('os-variations-chosen');
                //     });
                //
                //     app.help.addEventListenerByClass('os', 'click', function (event) {
                //
                //         event.preventDefault();
                //
                //         var target      = event.currentTarget;
                //         var siblings    = target.parentNode.getElementsByClassName('os');
                //         var osLists     = document.getElementsByClassName('os-variations');
                //         var targetOS    = target.getAttribute('data-os');
                //
                //         for (var i = 0, length = siblings.length; i < length; i++) {
                //
                //             app.help.removeClass(siblings[i], 'active');
                //             app.help.removeBodyClass('os-variations-chosen');
                //             app.help.addBodyClass('os-variations-choice');
                //         }
                //
                //         for (var i = 0, length = osLists.length; i < length; i++) {
                //
                //             app.help.removeClass(osLists[i], 'active');
                //
                //             if (osLists[i].getAttribute('data-os') === targetOS) {
                //                 osLists[i].className += ' active';
                //             }
                //         }
                //
                //         target.className += ' active';
                //     });
                //
                //     app.help.addEventListenerByClass('os-variation', 'click', function (event) {
                //
                //         event.preventDefault();
                //
                //         var target      = event.currentTarget;
                //         var variation   = document.getElementsByClassName('os-variation');
                //
                //         for (var i = 0, length = variation.length; i < length; i++) {
                //             app.help.removeClass(variation[i], 'active');
                //         }
                //
                //         if (target.getAttribute('data-id')) {
                //             configOrder['os'] = target.getAttribute('data-id');
                //             console.log(configOrder);
                //         }
                //
                //         target.className += ' active';
                //
                //         app.help.removeClass(target.parentNode.parentNode.getElementsByClassName('place-order-btn')[0], 'disabled');
                //     });
                //
                //     app.help.addEventListenerByClass('place-order-btn', 'click', function (event) {
                //
                //         if (event.currentTarget.className.indexOf("disabled") > -1) {
                //             event.preventDefault();
                //         }
                //         else {
                //             app.publish('/place/order', true);
                //             event.preventDefault();
                //         }
                //     });
                // });

                // app.subscribe("/place/order", function (flag) {
                //
                //     app.help.postJSON(configOrder, 'https://api.mediapig.co.uk/index.php?/order/create', function (res) {
                //
                //         stripe = new app.help.stripe();
                //
                //         stripe.setInvoiceID(JSON.parse(res.response).invoice_id);
                //
                //         app.publish('order/card-details', true);
                //     });
                // });
                //
                // app.subscribe("order/card-details", function (flag) {
                //
                //     app.ajax(window.location.origin + "/fragments/card-details.html", function (res) {
                //
                //         dom.overlayContent.innerHTML = res;
                //
                //         app.help.addEventListenerByClass('submit-card-details', 'click', function (event) {
                //             event.preventDefault();
                //
                //             if (event.currentTarget.className.indexOf('disabled') > -1) {
                //                 return;
                //             }
                //
                //             event.currentTarget.className += ' disabled';
                //
                //             var formElements = document.getElementById("cardDetails").elements;
                //             var cardDetails = {};
                //
                //             for (var i = 0, length = formElements.length; i < length; i++) {
                //
                //                 if (formElements[i].type !== "submit") {
                //                     cardDetails[formElements[i].name] = formElements[i].value;
                //                 }
                //             }
                //
                //             stripe.setKey('pk_test_bszr3bswqa8VHE9zcaah6dhN');
                //
                //             stripe.createToken(app, cardDetails, function (status, response) {
                //                 console.log(response);
                //                 if (status === 200) {
                //                     var token = response.id;
                //
                //                     var orderDetails = {
                //                         invoice_id: +stripe.getInvoiceID(),
                //                         token: token
                //                     };
                //
                //                     app.help.postJSON(orderDetails, 'https://api.mediapig.co.uk/index.php?/order/process', function (res) {
                //                         var response = JSON.parse(res.response);
                //
                //                         if (response.status === 'success') {
                //                             alert('Success');
                //                         }
                //                         else {
                //                             event.target.className = event.target.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                //                             app.publish('/message/error', response.status);
                //                         }
                //                     });
                //                 }
                //                 else {
                //                     event.target.className = event.target.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                //                     app.publish('/message/error', response.error.message);
                //                 }
                //             });
                //         });
                //     });
                // });

                // app.subscribe("/event/details/1/submit", function (flag) {
                //
                //     var path = window.location.pathname;
                //
                //     app.ajax(window.location.origin + '/fragments/package-detail/' + path.substr(path.length - 1) + '/os', function (res) {
                //         app.publish('/view/details/2/loaded', true);
                //         dom.overlayContent.innerHTML = res;
                //     });
                // });

                // app.subscribe("/view/order/details/loaded", function (flag) {
                //
                //     app.help.addEventListenerByClass('attribute', 'click', function (event) {
                //
                //         var target = event.currentTarget;
                //
                //         if (target.getAttribute('data-product-id')) {
                //             configOrder['key']          = app.help.getCookie('key');
                //             configOrder['product_id']   = target.getAttribute('data-product-id');
                //         }
                //         if (target.getAttribute('data-value')) {
                //             configOrder[target.getAttribute('data-name')] = target.getAttribute('data-value');
                //         }
                //
                //         site.variations(target, 'attribute', 'attribute-selector', 'package-detail-btn', 'https://api.mediapig.co.uk/index.php?', '/product/read/', app);
                //         event.preventDefault();
                //     });
                //
                //     app.help.addEventListenerByClass('disabled', 'click', function (event) {
                //
                //         if (event.currentTarget.className.indexOf("disabled") > -1) {
                //             event.preventDefault();
                //         }
                //         else {
                //             // Next page! (packages)
                //             app.publish('/event/details/1/submit', true);
                //             event.preventDefault();
                //         }
                //     });
                // });

                app.subscribe("/view/register/loaded", function (flag) {

                    if (flag === true) {
                        site.postSignup(app);
                        app.help.addEventListenerByClass('help', 'click', function (event) {
                            app.help.showTooltip(event, 'help-message');
                        });
                    }
                });

                // app.subscribe("/view/order/loaded", function () {
                //
                //     var hostname = document.getElementById('package-hostname');
                //
                //     configOrder['customer_id'] = document.getElementById('customerid').value;
                //
                //     hostname.addEventListener('keyup', function (event) {
                //
                //         var button = event.currentTarget.parentNode.getElementsByClassName('package-hostname-btn')[0];
                //
                //         var re = /^[a-zA-Z0-9.]{3,}$/;
                //         if (!re.test(hostname.value)) {
                //             app.help.removeClass(button, 'disabled');
                //             button.className += ' disabled';
                //         }
                //         else {
                //
                //             configOrder['hostname'] = event.currentTarget.value;
                //             app.help.removeClass(button, 'disabled');
                //
                //             if (event && event.keyCode == 13) {
                //                 submit(event);
                //             }
                //         }
                //     });
                //
                //     var submit = function (event) {
                //
                //         app.help.addBodyClass('hostname-chosen');
                //         app.help.addBodyClass('package-type-chosen');
                //
                //         history.pushState('order-details', 'order-details', '/order/details/1');
                //
                //         site.defered(app, dom);
                //
                //         event.preventDefault();
                //     }
                //
                //     app.help.addEventListenerByClass('disabled', 'click', function (event) {
                //
                //         if (event.currentTarget.className.indexOf("disabled") > -1) {
                //             event.preventDefault();
                //         }
                //         else {
                //             submit(event);
                //         }
                //     });
                // });

                // app.subscribe("/view/order", function (flag) {
                //
                //     document.getElementsByClassName('wrap')[0].innerHTML = "";
                //
                //     app.ajax(window.location.origin + '/fragments/package-hostname', function (res) {
                //         app.publish('/view/order/loaded', true);
                //         app.help.removeBodyClass('register-success-transition');
                //         app.help.addBodyClass('register-success');
                //         dom.overlayContent.innerHTML = res;
                //     });
                // });

                // app.subscribe("/view/order/type", function (flag) {
                //
                //     app.ajax(window.location.origin + '/fragments/package-type', function (res) {
                //         app.publish('/view/order/type/loaded', true);
                //         dom.overlayContent.innerHTML = res;
                //     });
                // });

                // app.subscribe("/view/order/type/loaded", function (flag) {
                //
                //     setTimeout(function () {
                //         app.help.removeBodyClass('home');
                //         app.help.addBodyClass('order');
                //     }, 1000);
                //
                //     app.help.addEventListenerByClass('package-type', 'click', function (event) {
                //
                //         event.preventDefault();
                //
                //         var target      = event.currentTarget;
                //         var siblings    = target.parentNode.getElementsByClassName('package-type');
                //         var formbtn     = target.parentNode.parentNode.parentNode.getElementsByClassName('package-type-btn')[0];
                //
                //         for (var i = 0, length = siblings.length; i < length; i++) {
                //             app.help.removeClass(siblings[i], 'active');
                //         }
                //
                //         target.className += ' active';
                //
                //         app.help.removeClass(formbtn, 'disabled');
                //     });
                //
                //     app.help.addEventListenerByClass('disabled', 'click', function (event) {
                //
                //         if (event.currentTarget.className.indexOf("disabled") > -1) {
                //             event.preventDefault();
                //         }
                //         else {
                //             app.help.addBodyClass('package-type-chosen');
                //
                //             var selected = document.getElementsByClassName('package-type-list')[0].getElementsByClassName('active')[0];
                //
                //             history.pushState('order-details', 'order-details', '/order/details/' + selected.getAttribute('data-id'));
                //
                //             site.defered(app, dom);
                //
                //             event.preventDefault();
                //         }
                //     });
                // });

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
                //
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
            defered: function (app, dom) {
                //
                // if (document.getElementsByTagName('body')[0].className.indexOf('package-type-chosen') > -1) {
                //
                //     var path = window.location.pathname;
                //
                //     app.ajax(window.location.origin + '/fragments/package-detail/' + path.substr(path.length - 1), function (res) {
                //
                //         app.publish('/view/order/details/loaded', true);
                //         dom.overlayContent.innerHTML = res;
                //
                //         var sliders = document.getElementsByClassName('slider');
                //
                //         for (var i = 0, length = sliders.length; i < length; i++) {
                //             app.slide.init(sliders[i], {
                //                 'parentClass': 'slider',
                //                 'childClass': 'slides'
                //             });
                //         }
                //     });
                //
                //     return;
                // }
                //
                // if (document.getElementsByTagName('body')[0].className.indexOf('order') > -1) {
                //
                //     app.ajax(window.location.origin + '/fragments/package-hostname', function (res) {
                //         app.publish('/view/order/loaded', true);
                //         dom.overlayContent.innerHTML = res;
                //     });
                //
                //     return;
                // }
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
                            app.publish('/form/register/update', 'success');
                        }
                    });
                });
            },
            variations: function (target, childClass, parentClass, buttonClass, api, endpoint, app) {

                // app.help.variations({ target: target, childClass: childClass, parentClass: parentClass, buttonClass: buttonClass, api: api, endpoint: endpoint }, app, function (res) {
                //
                //     var nextId = parseInt(target.parentNode.parentNode.getAttribute('data-id')) + 1;
                //     var nextEl = document.getElementsByClassName('attribute-selector')[nextId];
                //
                //     app.help.postJSON(res, window.location.origin + '/fragments/variant', function (xhr) {
                //
                //         // Cleanup work
                //         var arrorRight = document.getElementsByClassName('slide-arrow-right')[nextId];
                //         var arrowLeft = document.getElementsByClassName('slide-arrow-left')[nextId];
                //
                //         arrorRight.parentNode.removeChild(arrorRight);
                //         arrowLeft.parentNode.removeChild(arrowLeft);
                //
                //         // Replace old with new
                //         nextEl.outerHTML = xhr.response;
                //
                //         // Execute slider again for new bindings
                //         var newEl = document.getElementsByClassName('attribute-selector')[nextId];
                //
                //         app.slide.init(newEl, {
                //             'parentClass': 'slider',
                //             'childClass': 'slides'
                //         });
                //
                //         // Remove disabled added from markup
                //         app.help.removeClass(nextEl, 'disabled');
                //
                //         var newElAttribute = newEl.getElementsByClassName('attribute');
                //
                //         for (var i = 0, length = newElAttribute.length; i < length; i++) {
                //             newElAttribute[i].addEventListener('click', function (event) {
                //
                //                 var target = event.currentTarget;
                //
                //                 if (target.getAttribute('data-value')) {
                //                     configOrder[target.getAttribute('data-name')] = target.getAttribute('data-value');
                //                 }
                //
                //                 site.variations(target, childClass, parentClass, buttonClass, api, endpoint, app);
                //
                //                 event.preventDefault();
                //             });
                //         }
                //
                //     })
                // });
            }
        }

        site.init();

    }, function (ex) {
        var msg = ex.message;
    });
