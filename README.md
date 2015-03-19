(WIP) Polymer version of [New Gmail app](http://gmailblog.blogspot.com/2014/11/a-more-modern-gmail-app-for-android.html)

**Note**: the app is *read only* despite what the permissions popup says. Also, most of the buttons don't do anything. There's a lot of missing functionality.

#### Building

Install [Vulcanize](https://github.com/polymer/vulcanize) (`npm install -g vulcanize`) and run:

    vulcanize -o vulcanized.html elements.html

This will create vulcanized.html, which is used in index.html.

#### Testing

Hitting http://localhost:8080?debug will bypass Google Sign-in and use mock data for threads. Under this
testig mode, you will no see custom labels in the left nav or user profile images show up on threads.

#### Future improvements

- Caching API requests
- full offline support (Service Worker)
- notifications (SW/GCM)
- Reading emails in a thread
- Creating emails
- Searching emails
- Label filtering
- Pagnination (currently only the first few emails are read)
- a11y (keyboard access, tab support)
- i18n
- better perf on mobile (gesture UX needs work)
- use new drawer-panel for touch support
