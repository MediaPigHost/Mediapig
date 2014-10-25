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
var winston             = require('winston');
var domain             = require('domain').create();

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)(),
        new (winston.transports.File)({ filename: 'logs/node_log.log' })
    ]
});

domain.on('error', function (err) {
    console.log(err);
    logger.log('error', err, function (err, level, msg, meta) {
        process.exit(1);
    });
});

domain.run(function(){
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

    app.use(function(req, res, next){
        console.log('oopsie?');
        res.status(404);

        // respond with html page
        if (req.accepts('html')) {
            res.render('404', { url: req.url });
            return;
        }

        // respond with json
        if (req.accepts('json')) {
            res.send({ error: 'Not found' });
            return;
        }

        // default to plain-text. send()
        res.type('txt').send('Not found');
    });

    app.use(function(err, req, res, next){
        console.log('ooh lala');
        res.status(err.status || 500);
        res.render('500', { error: err });
    });

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
});