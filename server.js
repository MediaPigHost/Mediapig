var express = require('express'),
    cons = require('consolidate'),
    data = require('./src/content/site.json'),
    request = require('request'),
    extend = require('extend'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    app = express();

app.use(express.static(__dirname + '/public'));
app.use(bodyParser());
app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/src/templates');
app.use(cookieParser())
app.use(session({ secret: 'bacon wave', cookie: { maxAge: 60000 }}))

app.get('/', function(req, res){
  res.render('index', data);
});

app.post('/error/message', function(req, res, next) {
  res.render('fragments/error', req.body);
});

app.post('/fragments/variant', function(req, res, next) {
  res.render('fragments/variant', {'attributes' : req.body.attributes.slice(1,2)});
});

app.get('/home', function(req, res){
  res.render('home', data);
});

app.get('/fragments/package-type', function(req, res){
  request('http://api.mediapig.co.uk/index.php?/servicetype/read/all', function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.render('fragments/package-type', JSON.parse(body));
    }
  })
});

app.get('/fragments/package-detail/:typeid', function(req, res){
  request('http://api.mediapig.co.uk/index.php?/attributes/producttype/' + req.params.typeid, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var json = JSON.parse(body);
      var attr = json.attributes;
      var out = extend(data, {'attributes' : attr.slice(0,2)});
      console.log(out);
      res.render('fragments/package-detail', out);
    }
  })
});

app.get('/fragments/package-detail/:typeid/os', function(req, res){
  request('http://api.mediapig.co.uk/index.php?/attributes/producttype/' + req.params.typeid, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var json = JSON.parse(body);
      var attr = json.attributes;
      var out = extend(data, {'attributes' : attr.slice(2,3)});
      res.render('fragments/package-os', out);
    }
  })
});

app.get('/fragments/:page', function(req, res){
  res.render('fragments/' + req.params.page, data);
});

app.get('/order*', function(req, res){
  var cookies = parseCookies(req);
  request('http://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var body = JSON.parse(body);
      if(body.customer_id === false) {
        res.redirect('/home');
      } else {
        var out = extend(data, body);
        res.render('order', out);
      }
    }
  })
});

app.listen(4333);

console.log('Listening on port 4333');

function parseCookies (request) {
  var list = {},
      rc = request.headers.cookie;

  rc && rc.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      list[parts.shift().trim()] = unescape(parts.join('='));
  });

  return list;
}
