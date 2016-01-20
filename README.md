## PolyMail

PolyMail is an offline, mobile-first, web version of the [new Gmail native app UI](http://gmailblog.blogspot.com/2014/11/a-more-modern-gmail-app-for-android.html). It's built using [Polymer 1.0](https://www.polymer-project.org/1.0/) and [Service Worker](http://www.html5rocks.com/en/tutorials/service-worker/introduction/) and...is a WIP.

Demo: [https://poly-mail.appspot.com/](https://poly-mail.appspot.com/) &nbsp; (mock data:  [https://poly-mail.appspot.com/?debug](https://poly-mail.appspot.com/?debug))

![PolyMail](https://raw.githubusercontent.com/ebidel/polymer-gmail/master/images/screenshot.jpg)

**Note**: the app is *read only* despite what the permissions popup says. Also, most of the buttons don't do anything. There's a lot of missing functionality.

#### Performance

*TLDR: paint is ~393ms and the app loads ~1s on Chrome desktop. Motorola G - Chrome - 3G Fast connection first paint is 1.66s*  The full performance improvements over the Polymer 0.5 version are documented [here](https://github.com/ebidel/polymer-gmail/issues/6#issuecomment-123875813).

[Full results](https://github.com/ebidel/polymer-gmail/issues/6#issuecomment-123875813)

===

### Setup

In your local checkout, install the deps and Polymer elements

    npm install

This will also run `bower install` for you.

### Development & Building

##### Compile the ES6

While ES6 Classes run natively in Chrome, FF Nightly, Safari 9, and Edge, some of JS
in PolyMail still requires compilation using Babel. In particular, `scripts/googleapis.js` uses ES6 `=>` functions and modules (`import` statement) in addition to classes.

Compile the JS/CSS:

    gulp

This produces a single built and concatenated `dist/scripts/bundle.js` and compiles the rest of the app into `dist/`. You're ready to run the app!

### Run the app

Use any webserver you'd like. I use [npm serve](https://www.npmjs.com/package/serve):

    serve -p 8080

**You must run from /dist**

`serve -p 8080` serves the root folder, but the app runs the production version from `dist/`.
So be sure to first run `gulp`, then hit [http://localhost:8080/dist/](http://localhost:8080/dist/).

##### Watching files

For easier development, there's a task for rebuilding the [vulcanized](https://github.com/polymer/vulcanize) elements.html bundle and compiling the ES6 as you make changes:

    gulp watch

### Using test data

Hitting [http://localhost:8080?debug](http://localhost:8080/dist/?debug) will bypass Google Sign-in and use mock data for threads. Under this
testing mode, you will no see custom labels in the left nav or user profile images show up on threads.

### Deploying

    npm run deploy

### Future improvements

- Push notifications
- Reading emails in a thread
- Creating emails
- Clicking Label actually does filtering
- Pagination (currently only the first few emails are visible)
- a11y (keyboard access, tab support)
- i18n
- [x] http2 push
- [x] Service Worker offline support & caching
- [x] Caching API requests
- [x] Auto-refresh inbox
- [x] Use Google Sign-in 2.0
- [x] Use GMail API push notifications ([docs](https://developers.google.com/gmail/api/guides/push))
- [x] Use GMail API history feature ([docs](https://developers.google.com/gmail/api/v1/reference/users/history/list))
- [x] Searching emails. Full gmail search (e.g. `to:me from:someone@gmail.com` is supported`).
