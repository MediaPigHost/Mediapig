var express = require('express'),
    cons = require('consolidate'),
    data = require('./src/content/site.json'),
    request = require('request'),
    extend = require('extend'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    app = express();

function parseCookies (request) {
  var list = {},
      rc = request.headers.cookie;

  rc && rc.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      list[parts.shift().trim()] = unescape(parts.join('='));
  });

  return list;
}

app.use(express.static(__dirname + '/public'));

app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/src/templates');
app.use(cookieParser())
app.use(session({ secret: 'bacon wave', cookie: { maxAge: 60000 }}))

app.get('/', function(req, res){
  res.render('index', data);
});

app.get('/home', function(req, res){
  res.render('home', data);
});

app.get('/fragments/order', function(req, res){
  request('http://api.mediapig.co.uk/index.php?/servicetype/read/all', function (error, response, body) {
    if (!error && response.statusCode == 200) {
      res.render('fragments/order', JSON.parse(body));
    }
  })
});

app.get('/fragments/:page', function(req, res){
  res.render('fragments/' + req.params.page, data);
});

app.get('/order', function(req, res){
  var cookies = parseCookies(req);
  request('http://api.mediapig.co.uk/index.php?/user/checksessionkey/' + cookies.key, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      if(body.customer_id === false) {
        res.render('home', data);
      }
      var out = extend(data, JSON.parse(body));
      res.render('order', out);
    }
  })
});

app.listen(4333);

console.log('Listening on port 4333');
