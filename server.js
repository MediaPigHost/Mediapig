var express             = require('express');
var cons                = require('consolidate');
var httpRequestHelpers  = require('./helpers/httpRequestHelpers');
var cookieParser        = require('cookie-parser');
var session             = require('express-session');
var bodyParser          = require('body-parser');
var https               = require('https');
var http                = require('http');
var fs                  = require('fs');
var app                 = express();

app.use(express.static(__dirname + '/public'));
app.use(bodyParser());
app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/src/templates');
app.use(cookieParser());
app.use(session({
    secret: 'bacon wave',
    cookie: {
        maxAge: 60000
    }
}));

httpRequestHelpers.SetRequests(app);

if (process.env.DEVENV === 'false') {

    var options = {
        key: fs.readFileSync('/etc/ssl/server.key'),
        cert: fs.readFileSync('/etc/ssl/bundle.crt')
    };

    // Create an HTTPS service identical to the HTTP service.
    https.createServer(options, app).listen(4333);
}
else {
    // Create an HTTP service.
    http.createServer(app).listen(4333);
}

console.log('Listening on port 4333');
