## PolyMail

PolyMail is an offline mobile-first web app built using [Polymer 1.0](https://www.polymer-project.org/1.0/) and [Service Worker](http://www.html5rocks.com/en/tutorials/service-worker/introduction/).
It's a WIP web version of the [new Gmail native app UI](http://gmailblog.blogspot.com/2014/11/a-more-modern-gmail-app-for-android.html).

- Demo: [https://poly-mail.appspot.com/](https://poly-mail.appspot.com/)
- Demo (mock data): [https://poly-mail.appspot.com/?debug](https://poly-mail.appspot.com/?debug)

**Note**: the app is *read only* despite what the permissions popup says. Also, most of the buttons don't do anything. There's a lot of missing functionality.

![PolyMail](https://raw.githubusercontent.com/ebidel/polymer-gmail/master/images/screenshot.jpg)

### Setup

In your local checkout, install the deps and Polymer elements

    npm install; bower install

### Development & Building

##### Compile the ES6

While ES6 Classes run natively in Chrome, FF Nightly, Safari 9, and Edge, some of JS
in PolyMail still requires compilation using Babel. In particular, `scripts/googleapis.js` uses ES6 `=>` functions and modules (`import` statement) in addition to classes.

Compile the JS:

    gulp jsbundle

This produces a single built and concatenated `scripts/bundle.js`. You're ready to run the app!

### Run the app

Use any webserver you'd like. I use [npm serve](https://www.npmjs.com/package/serve):

    serve -p 8080

**Run from /dist**

This serves the app from the root folder. To run the production version, first run
`gulp` then hit [http://localhost:8080/dist/](http://localhost:8080/dist/).

##### Watching files

For easier development, there's a task for rebuilding the [vulcanized](https://github.com/polymer/vulcanize) elements.html bundle and compiling the ES6 as you make changes:

    gulp watch

### Using test data

Hitting [http://localhost:8080?debug](http://localhost:8080?debug) will bypass Google Sign-in and use mock data for threads. Under this
testig mode, you will no see custom labels in the left nav or user profile images show up on threads.

### Future improvements

- Push notifications
- Reading emails in a thread
- Creating emails
- Clicking Label actually does filtering
- Pagination (currently only the first few emails are visible)
- a11y (keyboard access, tab support)
- i18n
- [x] Service Worker offline support & caching
- [x] Caching API requests
- [x] Auto-refresh inbox
- [x] Use Google Sign-in 2.0
- [x] Use GMail API push notifications ([docs](https://developers.google.com/gmail/api/guides/push))
- [x] Use GMail API history feature ([docs](https://developers.google.com/gmail/api/v1/reference/users/history/list))
- [x] Searching emails. Full gmail search (e.g. `to:me from:someone@gmail.com` is supported`).
