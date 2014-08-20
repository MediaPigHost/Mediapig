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
        error: {
            message: function(req, res, next) {
                res.render('fragments/error', req.body);
            }
        },
        fragments: {
            variant: function(req, res, next) {
                res.render('fragments/variant', {
                    'attributes': req.body.attributes.slice(1,2)
                });
            },
            packageHostname: function(req, res){
                res.render('fragments/package-hostname', siteData);
            },
            packageType: function(req, res){
                request('https://api.mediapig.co.uk/index.php?/servicetype/read/all', function (error, response, body) {

                    if (!error && response.statusCode == 200) {
                        res.render('fragments/package-type', JSON.parse(body));
                    }
                })
            },
            packageDetail: function(req, res){
                request('https://api.mediapig.co.uk/index.php?/attributes/producttype/' + req.params.typeid, function (error, response, body) {

                    if (!error && response.statusCode == 200) {

                        var json = JSON.parse(body);
                        var attr = json.attributes;
                        var out = extend(data, {
                            'attributes': attr.slice(0,2)
                        });

                        res.render('fragments/package-detail', out);
                    }
                });
            },
            packageDetailOS: function(req, res){
                request('https://api.mediapig.co.uk/index.php?/attributes/producttype/' + req.params.typeid, function (error, response, body) {

                    if (!error && response.statusCode == 200) {

                        var json = JSON.parse(body);
                        var attr = json.attributes;
                        var out = extend(data, {
                            'attributes' : attr.slice(2,3)
                        });

                        res.render('fragments/package-os', out);
                    }
                });
            },
            page: function(req, res){
                res.render('fragments/' + req.params.page, data);
            }
        },
        order: function(req, res){

            var cookies = parseCookies(req);

            request('https://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, body) {

                if (!error && response.statusCode == 200) {

                    var body = JSON.parse(body);

                    console.log(body.customer_id);

                    if (body.customer_id === false) {
                        res.redirect('/home');
                    }
                    else {

                        var out = extend(data, body);
                        console.log(out);
                        res.render('order', out);
                    }
                }
            });
        }
    }
}();

module.exports.SetRequests = function (app) {

    this.app = app;

    this.app.get('/', Requests.index);
    this.app.get('/home', Requests.home);
    this.app.get('/fragments/package-hostname', Requests.fragments.packageHostname);
    this.app.get('/fragments/package-type', Requests.fragments.packageType);
    this.app.get('/fragments/package-detail/:typeid', Requests.fragments.packageDetail);
    this.app.get('/fragments/package-detail/:typeid/os', Requests.fragments.packageDetailOS);
    this.app.get('/fragments/:page', Requests.fragments.page);
    this.app.get('/order*', Requests.order);

    this.app.post('/error/message', Requests.error.message);
    this.app.post('/fragments/variant', Requests.fragments.variant);
};