define(['require', 'exports', 'module', 'helpers', 'microAjax'], function (require, exports, module, helpers, microAjax) {
  var register = {
    init : function(){
      this.events();
    },
    events : function(){
      app.help.addEventListenerByClass('register-trigger', 'click', function () {

          app.publish('/event/register/submit', true);

          app.ajax(window.location.origin + '/page/register', function (res) {
              app.publish('/view/register/loaded', true);
              var overlay = document.getElementById("overlay-content");
              overlay.innerHTML += res;
              helpers.removeClass(overlay.parentNode, 'overlay-loading');
          });

          ga('send', 'event', 'click', 'register trigger');

      });

      app.subscribe("/view/register/loaded", function (flag) {

          if (flag === true) {
              register.postSignup();
              app.help.addEventListenerByClass('help', 'click', function (event) {
                  app.help.showTooltip(event, 'help-message');
              });
          }
      });

      app.subscribe("/form/register/update", function (flag) {

          var button = document.getElementById('create-account-button');

          if (flag === 'success') {
              app.help.loading(button, 'success');

              setTimeout(function () {
                  app.publish('/view/order', true);
              }, 2000);
          }
          else {
              app.help.loading(button, 'remove');
          }
      });
    },
    postSignup: function () {

        var submitAccount = document.getElementById('signup');

        submitAccount.addEventListener('submit', function (event) {

            event.preventDefault();
            var button = document.getElementById('create-account-button');
            app.help.loading(button);

            var signupFormEl = document.getElementById("signup");
            var formData = new FormData(signupFormEl);

            app.help.postForm(signupFormEl, function (xhr) {
                app.help.removeElementsByClass('error');

                var res = JSON.parse(xhr.response);

                if (res.errors) {
                    app.publish('/form/register/update', 'fail');
                    app.publish('/message/error', res.errors);
                }
                else {
                    // window.location.href = '/order';
                    //history.pushState('order', 'order', '/order');
                    siteObj.orderConfig.user = res.customer_id;
                    siteObj.orderConfig.door = res.key;
                    app.help.setCookie('key', res.key, '1');
                    app.help.setCookie('user', res.customer_id, '1');
                    app.publish('/form/register/update', 'success');
                }
            });
        });
    }
  }

  module.exports = register;
});
