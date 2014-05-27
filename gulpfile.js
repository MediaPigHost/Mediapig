var gulp = require('gulp');
var browserify = require('gulp-browserify');
var uglify = require('gulp-uglify');

gulp.task('compress', function() {
  gulp.src('./public/js/*.js')
    .pipe(uglify())
    .pipe(gulp.dest('./public/js'))
});

// Basic usage
gulp.task('buildjs', function() {
    // Single entry point to browserify
    gulp.src('src/js/app.js')
        .pipe(browserify({
          insertGlobals : true,
          debug : !gulp.env.production
        }))
        .pipe(gulp.dest('./public/js'))
});


gulp.task('default', ['buildjs', 'compress'])
