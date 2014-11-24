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

    function customerValues (req, res) {
      var cookies = parseCookies(req),
          customer = {
            'door' : cookies.key,
            'user' : cookies.user,
          }
      if (cookies.key && cookies.user) {
        return customer;
      } else {
        if (req.url != '/home'){
          res.redirect('/home');
        }
        return false;
      }
    }

    function validCustomer (req, successCallback, errorCallback) {
      var cookies = parseCookies(req);
      var validity = request('https://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, customer) {
        if (!error && response.statusCode == 200) {

            var customer = JSON.parse(customer);
            customer.door = cookies.key;
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
          var customer = customerValues(req, res);
          if (customer){
            var out = extend({'logged_in' : true}, data);
          } else {
            var out = data;
          }
          console.log(out);
          res.render('home', out);
        },
        page: function(req, res){
          res.render('pages/' + req.params.page, data);
        },
        account : {
          login: function(req, res, next){
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/login', body: req.body}, function (error, response, body) {
                if (body.status !== 'fail'){
                  res.cookie('key', body.door);
                  res.cookie('user', body.user);
                  res.redirect('/manage');
                } else {
                  res.redirect('/home');
                }
            });
          },
          logout: function(req, res, next){
            res.clearCookie('key');
            res.clearCookie('user');
            res.redirect('/home');
          },
          account: {
            read: function(req, res, next) {
              var customer = customerValues(req, res);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/read', body: customer}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    console.log(out);
                    res.render('account/account', out);
                  } else {
                    res.redirect('/home');
                  }
              });
            },
            update: function(req, res, next) {

              var out = req.body,
                  customer = customerValues(req, res);
              out.door = customer.door;
              out.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/update', body: out}, function (error, response, body) {
                if (body.status !== 'fail') {
                  res.redirect('/manage/account');
                } else {
                  next();
                }
              });
            }
          },
          methods: function(req, res, next) {
            var out = req.body,
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/getusercards', body: customer}, function (error, response, body) {
              if (body.status !== 'fail'){
                console.log(body);
                var out = extend(data, body);
                res.render('account/methods', out);
              } else {
                next();
              }
            });
          },
          newticket: {
            read: function(req, res, next) {
              var customer = customerValues(req, res);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/listservices', body: customer}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    res.render('account/newticket', out);
                  } else {
                    next();
                  }
              });
            },
            add: function(req, res, next) {
              var out = req.body,
                  customer = customerValues(req, res);
              out.door = customer.door;
              out.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/create', body: out}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    res.redirect('/manage/ticket/'+ body.ticket_id);
                  } else {
                    next();
                  }
              });
            }
          },
          password: {
            read: function(req, res, next) {
              res.render('account/password', data);
            },
            add: function(req, res, next) {
              var out = req.body,
                  customer = customerValues(req, res);
              out.door = customer.door;
              out.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/update', body: out}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    res.render('account/password', out);
                  } else {
                    next();
                  }
              });
            }
          },
          payment: function(req, res, next) {
            var customer = customerValues(req, res);
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/payment/listpayments', body: customer}, function (error, response, body) {
                if (body.status !== 'fail'){
                  console.log(body);
                  var out = extend(data, { payments: body });
                  res.render('account/payment', out);
                } else {
                  res.redirect('/home');
                }
            });
          },
          invoices: function(req, res, next) {
            var customer = customerValues(req, res);
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/invoice/listinvoices', body: customer}, function (error, response, body) {
                if (body.status !== 'fail'){
                  var out = extend(data, body);
                  res.render('account/invoices', out);
                } else {
                  res.redirect('/home');
                }
            });
          },
          invoice : {
            read: function(req, res, next) {
                var invoiceid =  parseInt(req.params.invoiceid),
                    out = { 'invoice_id' : invoiceid },
                    customer = customerValues(req, res);
                out.door = customer.door;
                out.user = customer.user;

                request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/invoice/showinvoice', body: out}, function (error, response, body) {
                    console.log(body);
                    if (body.status !== 'fail'){
                      body['invoice_id'] = invoiceid;
                      var out = extend(data, body);
                      res.render('account/invoice', data);
                    } else {
                      res.redirect('/home');
                    }
                });
            }
          },
          product: function(req, res, next) {
            var out = { 'service_id' : parseInt(req.params.serviceid) },
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            console.log(out);
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/getdetails', body: out}, function (error, response, body) {
                if (body.status !== 'fail'){
                  body['service_id'] = parseInt(req.params.serviceid);
                  var out = extend(data, body);
                  res.render('account/product', out);
                } else {
                  res.redirect('/home');
                }
            });
          },
          subscriptions: function(req, res, next) {
            res.render('account/subscriptions', data);
          },
          home: function(req, res, next){
              var customer = customerValues(req, res);
              console.log('customer: %s', customer);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/user/read', body: customer}, function (error, response, body) {
                  console.log(body);
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/listservices', body: customer}, function(error, response, body){
                      console.log(body);
                      if (body.status !== 'fail'){
                        out.services = body.services;
                        res.render('account/home', out);
                      }
                    });
                  } else {
                    res.redirect('/home');
                  }
              });
          },
          support: function(req, res, next){
              var customer = customerValues(req, res);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/showlist', body: customer}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    res.render('account/support', out);
                  } else {
                    next();
                  }
              });
          },
          ticket: function(req, res, next){
              var out = { 'ticket_id' : parseInt(req.params.ticketid) },
                  customer = customerValues(req, res);
              out.door = customer.door;
              out.user = customer.user;
              console.log(out);
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/getticket', body: out}, function (error, response, body) {
                  console.log(body);
                  if (body.status !== 'fail'){
                    body['ticket_id'] = parseInt(req.params.ticketid);
                    var out = extend(data, body);
                    res.render('account/ticket', out);
                  } else {
                    res.redirect('/home');
                  }
              });
          },
          ticketreply: function(req, res, next){
              var out = req.body,
                  customer = customerValues(req, res),
                  ticketid = out['ticket_id'];
              out.door = customer.door;
              out.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/reply', body: out}, function (error, response, body) {
                  console.log(customer);
                  if (body.status !== 'fail'){
                    var out = extend(data, body);
                    res.redirect('/manage/ticket/' + ticketid);
                  } else {
                    res.redirect('/home');
                  }
              });
          },
          ticketclose: function(req, res, next){
              var out = { 'ticket_id' : parseInt(req.params.ticketid) },
                  customer = customerValues(req, res),
                  ticketid = out['ticket_id'];
              out.door = customer.door;
              out.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/ticket/closeticket', body: out}, function (error, response, body) {
                  console.log(body);
                  if (body.status !== 'fail'){
                    body['ticket_id'] = parseInt(req.params.ticketid);
                    var out = extend(data, body);
                    res.redirect('/manage/ticket/' + ticketid);
                  } else {
                    res.redirect('/home');
                  }
              });
          },
          upgrade: function(req, res, next) {
            res.render('account/upgrade', data);
          }
        },
        service : {
          vnc : function(req, res, next) {
            var out = { 'service_id' : parseInt(req.params.serviceid) },
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/getdetails', body: out}, function (error, response, body) {
                console.log(body);
                if (body.status !== 'fail'){
                  body['service_id'] = parseInt(req.params.serviceid);
                  var out = extend(data, body);
                  res.render('account/vnc', out);
                } else {
                  res.redirect('/home');
                }
            });
          },
          stop: function(req, res, next) {
            var out = req.body,
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/perform/shutdown ', body: out}, function (error, response, body) {
              if (body.status !== 'fail'){
                res.send(body);
              } else {
                next();
              }
            });
          },
          start: function(req, res, next){
            var out = req.body,
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/perform/boot ', body: out}, function (error, response, body) {
              if (body.status !== 'fail'){
                res.send(body);
              } else {
                next();
              }
            });
          },
          restart: function(req, res, next){
            var out = req.body,
                customer = customerValues(req, res);
            out.door = customer.door;
            out.user = customer.user;
            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/service/perform/reboot ', body: out}, function (error, response, body) {
              if (body.status !== 'fail'){
                res.send(body);
              } else {
                next();
              }
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
              var order = req.body,
                  customer = customerValues(req, res);
              order.door = customer.door;
              order.user = customer.user;
              request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/order/create', body: order}, function (error, response, body) {
                  if (body.status !== 'fail'){
                    if (body.token){
                      // If token exists then card exists so take payment from existing card.
                      body.redirect = true;
                      var out = extend(body, customer);
                      request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/order/process', body: body}, function (error, response, body) {
                        console.log(body);
                        if (body.status !== 'fail'){
                          console.log(out);
                          res.render('pages/card-details', out);
                        } else {
                          next();
                        }
                      });
                    } else {
                      res.render('pages/card-details', body);
                    }
                  } else {
                    next();
                  }
              });
            }
        },
        order: {
          setup: function(req, res, next){
            var customer = customerValues(req, res);
            request('https://api.mediapig.co.uk/index.php?/attributes/producttype/1', function (error, response, body) {
                if (!error && response.statusCode == 200 && body.status != 'fail') {
                  var body = JSON.parse(body);
                  body.site = siteData;
                  body.customer = customer;
                  res.render('order', body);
                } else {
                  res.redirect('/home');
                }
            });
          },
          process : function(req, res, next){
            var order = req.body,
                customer = customerValues(req, res);
            order.door = customer.door;
            order.user = customer.user;

            request.post({json: true, url:'https://api.mediapig.co.uk/index.php?/order/process', body: order}, function (error, response, body) {
              if (body.status !== 'fail') {
                res.send(body);
              } else {
                console.log(body);
                next();
              }
            });
          }
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
    this.app.get('/order', Requests.order.setup);

    this.app.get('/manage', Requests.account.home);
    this.app.get('/manage/account', Requests.account.account.read);
    this.app.get('/manage/methods', Requests.account.methods);
    this.app.get('/manage/newticket', Requests.account.newticket.read);
    this.app.get('/manage/password', Requests.account.password.read);
    this.app.get('/manage/payment', Requests.account.payment);
    this.app.get('/manage/invoices', Requests.account.invoices);
    this.app.get('/manage/invoice/:invoiceid', Requests.account.invoice.read);
    this.app.get('/manage/product/:serviceid', Requests.account.product);
    this.app.get('/manage/subscriptions', Requests.account.subscriptions);
    this.app.get('/manage/support', Requests.account.support);
    this.app.get('/manage/ticket/:ticketid', Requests.account.ticket);
    this.app.get('/manage/close/ticket/:ticketid', Requests.account.ticketclose);
    this.app.get('/manage/upgrade', Requests.account.upgrade);
    this.app.get('/service/vnc/:serviceid', Requests.service.vnc);
    this.app.get('/logout', Requests.account.logout);
    //this.app.get('/manage/:page', Requests.account.pages);

    this.app.post('/order/process', Requests.order.process);
    this.app.post('/error/message', Requests.error.message);
    this.app.post('/post/order', Requests.fragments.setupOrder);
    this.app.post('/manage/ticket/reply', Requests.account.ticketreply);
    this.app.post('/manage/account', Requests.account.account.update);
    this.app.post('/manage/newticket', Requests.account.newticket.add);
    this.app.post('/manage/password', Requests.account.password.add);
    this.app.post('/service/stop', Requests.service.stop);
    this.app.post('/service/start', Requests.service.start);
    this.app.post('/service/restart', Requests.service.restart);
    this.app.post('/login', Requests.account.login);

    this.app.get('/404', Requests.notFound);
    this.app.get('/404', Requests.serverError);
};
