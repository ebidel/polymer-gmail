/**
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var fs = require('fs');
var del = require('del');
var glob = require('glob');

var browserify = require('browserify');
var source = require('vinyl-source-stream');
var babelify = require('babelify');

var runSequence = require('run-sequence');
var path = require('path');

var version = null;
var isProd = false;

/** Clean */
gulp.task('clean', function(done) {
  del(['dist', 'scripts/bundle.js'], done);
});

/** Styles */
gulp.task('styles', function() {
//   return gulp.src('./styles/*.scss')
//       .pipe($.sass())
//       // .pipe($.autoprefixer([
//       //   'ie >= 10',
//       //   'ie_mob >= 10',
//       //   'ff >= 33',
//       //   'chrome >= 38',
//       //   'safari >= 7',
//       //   'opera >= 26',
//       //   'ios >= 7'
//       // ]))
//       .pipe($.minifyCss())
//       .pipe($.license('Apache', {
//         organization: 'Google Inc. All rights reserved.'
//       }))
//       .pipe(gulp.dest('./dist/styles'));
  return gulp.src('./styles/*.css')
    .pipe($.autoprefixer({
      browsers: ['last 2 versions'],
      cascade: false
    }))
    .pipe($.minifyCss())
    .pipe($.license('Apache', {
      organization: 'Google Inc. All rights reserved.'
    }))
    .pipe(gulp.dest('./dist/styles'));
});

/** Scripts */
gulp.task('js', ['jshint', 'jscs']);

// Lint JavaScript
gulp.task('jshint', function() {
  return gulp.src(['./scripts/**/*.js'])
    .pipe($.jshint('.jshintrc'))
    .pipe($.jshint.reporter('jshint-stylish'))
});

// Check JS style
gulp.task('jscs', function() {
  return gulp.src(['./scripts/**/*.js'])
    .pipe($.jscs());
});

function buildBundle(file) {
  return browserify({
    entries: [file],
    debug: isProd
  })
  .transform(babelify) // es6 -> e5
  .bundle();
}

gulp.task('jsbundle', function() {
  console.log('==Building JS bundle==');

  var dest = isProd ? 'dist' : '';

  return buildBundle('./scripts/app.js')
    .pipe(source('bundle.js'))
    .pipe($.streamify($.uglify()))
    .pipe($.license('Apache', {
      organization: 'Google Inc. All rights reserved.'
    }))
    .pipe(gulp.dest('./' + dest + '/scripts'))
});

/** Root */
gulp.task('root', ['getversion'], function() {
  gulp.src([
      './*.*',
      '!{package,bower}.json',
      '!gulpfile.js',
      '!deploy.sh',
      '!*.md'
    ])
    .pipe($.replace(/@VERSION@/g, version))
    .pipe(gulp.dest('./dist/'));

  gulp.src(['./data/*.json']).pipe(gulp.dest('./dist/data'));

  return gulp.src('./favicon.ico')
    .pipe(gulp.dest('./dist/'));
});

gulp.task('copy_bower_components', function() {
  gulp.src([
      'bower_components/webcomponentsjs/webcomponents-lite.min.js',
      'bower_components/platinum-sw/*.js'
    ], {base: './'})
    .pipe(gulp.dest('./dist'));

  // Service worker elements want files in a specific location.
  gulp.src(['bower_components/sw-toolbox/*.js'])
    .pipe(gulp.dest('./dist/sw-toolbox'));
  gulp.src(['bower_components/platinum-sw/bootstrap/*.js'])
    .pipe(gulp.dest('./dist/elements/bootstrap'));
});

/** HTML */
// gulp.task('html', function() {
//   return gulp.src('./**/*.html')
//     .pipe($.replace(/@VERSION@/g, version))
//     .pipe(gulp.dest('./dist/'));
// });

/** Images */
gulp.task('images', function() {
  return gulp.src([
      './images/**/*.svg',
      './images/**/*.png',
      './images/**/*.jpg',
      '!./images/screenshot.jpg'
    ])
    .pipe(gulp.dest('./dist/images'));
});


// Generate a list of files to precached when serving from 'dist'.
// The list will be consumed by the <platinum-sw-cache> element.
gulp.task('precache', function(callback) {
  var dir = 'dist';

  glob('{elements,scripts,styles}/**/*.*', {cwd: dir}, function(error, files) {
    if (error) {
      callback(error);
    } else {
      files.push('index.html', './', 'bower_components/webcomponentsjs/webcomponents-lite.min.js');
      var filePath = path.join(dir, 'precache.json');
      fs.writeFile(filePath, JSON.stringify(files), callback);
    }
  });
});


/** Vulcanize */
gulp.task('vulcanize', function() {
  console.log('==Vulcanizing HTML Imports==');

  return gulp.src('./elements/elements.html')
    .pipe($.vulcanize({
      inlineScripts: true,
      inlineCss: true,
      stripComments: true,
      //excludes: [path.resolve('./dist/third_party/polymer.html')]
      //stripExcludes: false,
    }))
    // .pipe($.minifyInline()) // TODO: messes up SVG icons
    .pipe($.crisper()) // Separate JS into its own file for CSP compliance.
    .pipe(gulp.dest('./dist/elements'))
});

/** Watches */
gulp.task('watch', function() {
  gulp.watch('./styles/**/*.scss', ['styles']);
  gulp.watch('./*.html', ['root']);
  // gulp.watch('./sw-import.js', ['serviceworker']);
  gulp.watch('./elements/**/*.html', ['vulcanize']);
  gulp.watch('./images/**/*.*', ['images']);
  gulp.watch('./scripts/**/*.js', ['js']);
});

gulp.task('getversion', function() {
  version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
});

/** Main tasks */

var allTasks = ['root', 'styles', 'jsbundle', 'images'];//, 'serviceworker'];

gulp.task('bump', function() {
  return gulp.src([
      './{package,bower}.json'
    ])
    .pipe($.bump({type: 'patch'}))
    .pipe(gulp.dest('./'));
});

gulp.task('default', function() {
  isProd = true;
  return runSequence('clean', 'bump', 'getversion', 'js',
                     allTasks, 'vulcanize', 'precache', 'copy_bower_components');
})

gulp.task('dev', function() {
  return runSequence('clean', 'getversion', allTasks, 'watch');
});
