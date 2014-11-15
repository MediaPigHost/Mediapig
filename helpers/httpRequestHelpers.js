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
        account : function(req, res){
            res.render('account/' + req.params.page, data);
        },
        accounthome: function(req, res){
            res.render('account/home', data);
        },
        error: {
            message: function(req, res, next) {
                res.render('pages/error', req.body);
            }
        },
        fragments: {
            page: function(req, res){
                res.render('pages/' + req.params.page, data);
            }
        },
        order: function(req, res){

            var cookies = parseCookies(req);

            request('https://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, customer) {

                if (!error && response.statusCode == 200) {

                    var customer = JSON.parse(customer);
                    customer.session_key = cookies.key;

                    if (customer.customer_id === false) {
                        res.redirect('/home');
                    }
                    else {
                        request('https://api.mediapig.co.uk/index.php?/attributes/producttype/1', function (error, response, body) {

                            if (!error && response.statusCode == 200) {

                                var body = JSON.parse(body);
                                var json = extend(body, siteData);
                                var out = extend(json, customer);
                                res.render('order', out);
                            }
                        });
                    }
                }
            });
        },
        notFound: function (req, res, next) {
            console.log('404?');
            next();
        },
        serverError: function (req, res, next) {
            console.log('internal server error');
            next(new Error('Internal Server Error'));
        }
    }
}();

module.exports.SetRequests = function (app) {

    this.app = app;

    this.app.get('/', Requests.index);
    this.app.get('/home', Requests.home);
    this.app.get('/pages/:page', Requests.fragments.page);
    this.app.get('/page/:page', Requests.page);
    this.app.get('/manage', Requests.accounthome);
    this.app.get('/manage/:page', Requests.account);
    this.app.get('/order*', Requests.order);

    this.app.post('/error/message', Requests.error.message);

    this.app.get('/404', Requests.notFound);
    this.app.get('/404', Requests.serverError);
};
