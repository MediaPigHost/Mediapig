var data    = require('../src/content/site.json');
var request = require('request');
var extend  = require('extend');

var Requests = function () {

    var siteData = data;

    function parseCookies (request) {

        var list = {};
        var requestCookie = request.headers.cookie;

        requestCookie && requestCookie.split(';').forEach(function( cookie ) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = unescape(parts.join('='));
        });

        return list;
    }

    function validCustomer (req, successCallback, errorCallback) {
      var cookies = parseCookies(req);
      var validity = request('https://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, customer) {
        if (!error && response.statusCode == 200) {

            var customer = JSON.parse(customer);
            customer.key = cookies.key;
            if (customer.user === false) {
              if (typeof errorCallback === 'undefined'){
                return false;
              } else {
                errorCallback();
              }
            } else {
              if (typeof successCallback === 'undefined'){
                return true;
              } else {
                successCallback(customer);
              }
            }
        }
      });

      return validity;
    }

    return {
        index: function(req, res){
            res.render('index', data);
        },
        home: function(req, res){
            res.render('home', data);
        },
        page: function(req, res){
            res.render('pages/' + req.params.page, data);
        },
        account : {
          account: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/account', data);
            }, function() {
              res.redirect('/home');
            });
          },
          methods: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/methods', data);
            }, function() {
              res.redirect('/home');
            });
          },
          newticket: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/newticket', data);
            }, function() {
              res.redirect('/home');
            });
          },
          password: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/password', data);
            }, function() {
              res.redirect('/home');
            });
          },
          payment: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/payment', data);
            }, function() {
              res.redirect('/home');
            });
          },
          product: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/product', data);
            }, function() {
              res.redirect('/home');
            });
          },
          subscriptions: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/subscriptions', data);
            }, function() {
              res.redirect('/home');
            });
          },
          home: function(req, res, next){
            validCustomer(req, function(customer){
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/read', body: customer}, function (error, response, body) {
                  if (body.status === 'success'){
                    var out = extend(data, body);
                    res.render('account/home', out);
                  } else {
                    next();
                  }
              });
            }, function() {
              res.redirect('/home');
            });
          },
          support: function(req, res, next){
            validCustomer(req, function(customer){
              console.log(customer);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/showlist', body: customer}, function (error, response, body) {
                  console.log(body);
                  if (body.status === 'success'){
                    var out = extend(data, body);
                    res.render('account/support', out);
                  } else {
                    next();
                  }
              });
            }, function() {
              res.redirect('/home');
            });
          },
          ticket: function(req, res, next){
            validCustomer(req, function(customer){
              var ticket = extend(customer, { 'ticket_id' : parseInt(req.params.ticketid) });
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/getticket', body: ticket}, function (error, response, body) {
                  if (body.status === 'success'){
                    var out = extend(data, body);
                    res.render('account/ticket', out);
                  } else {
                    next();
                  }
              });
            }, function() {
              res.redirect('/home');
            });
          },
          upgrade: function(req, res, next) {
            validCustomer(req, function(customer){
              res.render('account/upgrade', data);
            }, function() {
              res.redirect('/home');
            });
          }
        },
        error: {
            message: function(req, res, next) {
                res.render('pages/error', req.body);
            }
        },
        fragments: {
            setupOrder: function(req, res, next){
              validCustomer(req, function(customer){
                var order = extend(customer, req.body);
                request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/order/create', body: order}, function (error, response, body) {
                    if (body.status === 'success'){
                      res.render('pages/card-details', body);
                    } else {
                      next();
                    }
                });

              }, function(){
                console.log('Session timed out / Invalid Customer');
              });
            }
        },
        order: function(req, res){
            validCustomer(req, function(customer){
              request('https://api.mediapig.co.uk/index.php?/attributes/producttype/1', function (error, response, body) {

                  if (!error && response.statusCode == 200) {

                      var body = JSON.parse(body);
                      var json = extend(body, siteData);
                      var out = extend(json, customer);
                      res.render('order', out);
                  }
              });
            }, function(){
              res.redirect('/home');
            });
        },
        notFound: function (req, res, next) {
            console.log('404');
            next();
        },
        serverError: function (req, res, next) {
            console.log('Internal server error');
            next(new Error('Internal Server Error'));
        }
    }
}();

module.exports.SetRequests = function (app) {

    this.app = app;

    this.app.get('/', Requests.index);
    this.app.get('/home', Requests.home);
    this.app.get('/page/:page', Requests.page);

    this.app.get('/manage', Requests.account.home);
    this.app.get('/manage/account', Requests.account.account);
    this.app.get('/manage/methods', Requests.account.methods);
    this.app.get('/manage/newticket', Requests.account.newticket);
    this.app.get('/manage/password', Requests.account.password);
    this.app.get('/manage/payment', Requests.account.payment);
    this.app.get('/manage/product', Requests.account.product);
    this.app.get('/manage/subscriptions', Requests.account.subscriptions);
    this.app.get('/manage/support', Requests.account.support);
    this.app.get('/manage/ticket/:ticketid', Requests.account.ticket);
    this.app.get('/manage/upgrade', Requests.account.upgrade);

    //this.app.get('/manage/:page', Requests.account.pages);
    this.app.get('/order', Requests.order);

    this.app.post('/error/message', Requests.error.message);
    this.app.post('/post/order', Requests.fragments.setupOrder);

    this.app.get('/404', Requests.notFound);
    this.app.get('/404', Requests.serverError);
};
