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

import {GMail as Gmail, GPlus as Gplus} from './googleapis';

(() => {

  'use strict';

  var DEBUG = location.search.indexOf('debug') !== -1;
  var REFRESH_INTERVAL = 60000; // every 60 sec.
  var inboxRefreshId;
  var pendingArchivedThreads = [];

  var GMail = new Gmail();
  var GPlus = new Gplus();

  var template = document.querySelector('#t');
  template.DEBUG = DEBUG;
  template.isAuthenticated = true; // Presume user is logged in when app loads (better UX).
  template.threads = [];
  template.selectedThreads = [];
  template.headerTitle = 'Inbox';
  template.user = {};
  template.MAX_REFRESH_Y = 150;
  template.syncing = false; // True, if the mail is syncing.
  template.refreshStarted = false; // True if the pull to refresh has been enabled.
  template._scrollArchiveSetup = false; // True if the user has attempted to archive a thread.

  // TODO: save past searches for offline.
  template.previousSearches = [
    'is: chat',
    'to: me',
    'airline tickets'
  ];

  // Conditionally load webcomponents polyfill (if needed).
  var webComponentsSupported = (
      'registerElement' in document &&
      'import' in document.createElement('link') &&
      'content' in document.createElement('template'));

  if (!webComponentsSupported) {
    var script = document.createElement('script');
    script.async = true;
    script.src = '/bower_components/webcomponentsjs/webcomponents-lite.min.js';
    script.onload = finishLazyLoadingImports;
    document.head.appendChild(script);
  } else {
    finishLazyLoadingImports();
  }

  function finishLazyLoadingImports() {
    // Use native Shadow DOM if it's available in the browser.
    window.Polymer = window.Polymer || {dom: 'shadow'};

    var onImportLoaded = function() {
      var loadContainer = document.getElementById('splash');
      loadContainer.addEventListener('transitionend', e => {
        loadContainer.parentNode.removeChild(loadContainer); // IE 10 doesn't support el.remove()
      });

      if (DEBUG) {
        loadTestData();
      }

      document.body.classList.remove('loading');
    };

    // crbug.com/504944 - readyState never goes to complete until Chrome 46.
    // crbug.com/505279 - Resource Timing API is not available until Chrome 46.
    var link = document.querySelector('#bundle');
    if (link.import && link.import.readyState === 'complete') {
      onImportLoaded();
    } else {
      link.addEventListener('load', onImportLoaded);
    }
  }

  /**
   * Loads sample data.
   */
  function loadTestData() {
    var ajax = document.createElement('iron-ajax');
    ajax.auto = true;
    ajax.url = '/data/users.json';
    ajax.addEventListener('response', e => {
      template.users = e.detail.response;
    });

    var ajax2 = document.createElement('iron-ajax');
    ajax2.auto = true;
    ajax2.url = '/data/threads.json';
    ajax2.addEventListener('response', e => {
      template.threads = e.detail.response;
    });
  }

  /**
   * Utility function to listen to an event on a node once.
   *
   * @param {Node} node The animated node
   * @param {String} event Name of an event
   * @param {Function} fn Event handler
   * @param {Array} args Additional arguments to pass to `fn`
   */
  function listenOnce(node, event, fn, args) {
    // jshint validthis:true
    var self = this;
    var listener = function() {
      fn.apply(self, args);
      node.removeEventListener(event, listener, false);
    };
    node.addEventListener(event, listener, false);
  }

  /**
   * Error callback handler for GMail API calls.
   */
  function GMailErrorCallback(e) {
    if (e.status === 401) {
      template.isAuthenticated = false;
    } else {
      console.error(e);
    }
  }

  template._computeShowNoResults = function(threads, syncing) {
    return !syncing && threads && !threads.length;
  };

  template._computeHideLogin = function(isAuthenticated) {
    return isAuthenticated || DEBUG;
  };

  // template._computeThreadTabIndex = function(archived) {
  //   return archived ? -1 : 0;
  // };

  template._computeMainHeaderClass = function(narrow, numSelectedThreads) {
    return (narrow ? 'core-narrow' : 'tall') + ' ' +
           (numSelectedThreads ? 'selected-threads' : '');
  };

  template._computeHeaderTitle = function(numSelectedThreads) {
    return numSelectedThreads ? numSelectedThreads : 'Inbox';
  };

  // TODO: iron-selector bug where subscribers are not notified of changes
  // after the first selection. For now, use events instead to update title.
  // See github.com/PolymerElements/iron-selector/issues/33
  template._onThreadSelectChange = function(e) {
    this.headerTitle = this._computeHeaderTitle(this.selectedThreads.length);
    this.headerClass = this._computeMainHeaderClass(
        this.narrow, this.selectedThreads.length);
  };

  template._onThreadTap = function(e) {
    e.stopPropagation();
    var idx = this.$.threadlist.items.indexOf(e.detail.thread);
    this.$.threadlist.select(idx);
  };

  template._onArchivedToastOpenClose = function() {
    if (this.$.arhivedtoast.visible) {
      this.$.fab.classList.add('moveup');
      // jshint boss:true
      // for (var i = 0, threadEl; threadEl = pendingArchivedThreads[i]; ++i) {
      //   threadEl.undo = false; // hide in-place UNDO UI.
      // }
    } else {
      // When the archived message toast closes, the user can no longer undo.
      // Remove the threads.
      // jshint boss:true
      for (var i = 0, threadEl; threadEl = pendingArchivedThreads[i]; ++i) {
        this.removeThread(threadEl);
      }

      pendingArchivedThreads = []; // clear previous selections.
      this.$.fab.classList.remove('moveup');
    }
  };

  template._onSearch = function(e) {
    this.toggleSearch();
    this.showLoadingSpinner();
    this.refreshInbox(e.detail.value);
    this.unshift('previousSearches', e.detail.value);
  };

  template.toggleSearch = function() {
    this.$.search.toggle();
  };

  template.toggleToast = function(optMesssage) {
    var toast = optMesssage ? this.$.toast : this.$.arhivedtoast;
    if (optMesssage) {
      toast.text = optMesssage;
    }
    toast.toggle();
    this._onArchivedToastOpenClose(); // Move FAB at same time as
  };

  template.undoAll = function(e, detail, sender) {
    e.stopPropagation();

    // jshint boss:true
    for (var i = 0, threadEl; threadEl = pendingArchivedThreads[i]; ++i) {
      threadEl.archived = false;
      threadEl.removed = false;
    }

    pendingArchivedThreads = [];

    this.toggleToast();
  };

  template.refreshLabels = function() {
    return GMail.fetchLabels().then(labels => {
      template.labels = labels.labels;
      template.labelMap = labels.labelMap;
    }, GMailErrorCallback);
  };

  template.refreshInbox = function(optQuery) {
    clearInterval(inboxRefreshId);

    var query = optQuery || 'in:inbox';

    return GMail.fetchMail(query).then(threads => {
      template.hideLoadingSpinner();
      template.threads = threads;

      // TODO: use gmail's push api: http://googleappsdeveloper.blogspot.com/2015/05/gmail-api-push-notifications-dont-call.html
      // Setup auto-fresh if we're querying the inbox.
      if (!optQuery) {
        inboxRefreshId = setInterval(
            template.refreshInbox.bind(template), REFRESH_INTERVAL);
      }
    }, GMailErrorCallback);
  };

  template.onRefreshInboxButton = function(e) {
    this.showLoadingSpinner();
    this.refreshInbox();
  };

  template.newMail = function(e) {
    console.warn('Not implemented: Create new mail');
  };

  template.menuSelect = function(e) {
    this.$.drawerPanel.togglePanel();
  };

  template.deselectAll = function(e) {
    this.$.threadlist.selectedValues = [];
  };

  // Archives currently selected messages.
  template.archiveAll = function(e) {
    e.stopPropagation();

    this.inboxToastMessage = this.selectedThreads.length + ' archived';

    var selectedItems = this.$.threadlist.selectedItems.slice(0);
    // jshint boss:true
    for (var i = 0, threadEl; threadEl = selectedItems[i]; ++i) {
      threadEl.archived = true;
      pendingArchivedThreads.push(threadEl);
    }

    this.async(() => {
      this.toggleToast();
    }, 1000); // delay showing the toast.
  };

  template.onThreadArchive = function(e) {
    // Ignore thread unarchive.
    if (!e.detail.showUndo) {
      return;
    }

    if (!this._scrollArchiveSetup) {
      // When user scrolls page, remove visibly archived threads.
      listenOnce(this.$.scrollheader, 'content-scroll', e => {

        var archivedThreads = this.$.threadlist.items.filter(el => el.archived);

        console.log(archivedThreads.length);

        var shrinkThreads = function() {
          return new Promise(function(resolve, reject) {
            // jshint boss:true
            for (var i = 0, threadEl; threadEl = archivedThreads[i]; ++i) {
              threadEl.classList.add('shrink');
              threadEl.undo = false; // hide in-place UNDO UI.
            }
            template.async(() => {
              resolve();
            }, 300); // Wait for shrink animations to finish.
          });
        };

        // TODO: this changes the indices of the array and removeThread expects
        // threadEl.dataset.threadIndex ordering.
        // It leaves some threads in an archived state.
        shrinkThreads().then(() => {
          archivedThreads.map(template.removeThread, template);
        });

        this._scrollArchiveSetup = false;
      });
    }

    this._scrollArchiveSetup = true;
  };

  template.removeThread = function(threadEl) {
    threadEl.removed = true;
    this.splice('threads', parseInt(threadEl.dataset.threadIndex), 1);
  };

  template.showLoadingSpinner = function() {
    this.syncing = true; // Visually indicate loading.

    // Wait for dom-if to stamp.
    this.async(() => {
      var el = document.querySelector('#refresh-spinner-container');
      el.classList.remove('shrink');
    }, 50);
  };

  template.hideLoadingSpinner = function() {
    var el = document.querySelector('#refresh-spinner-container');
    if (el) {
      el.classList.add('shrink');
      this.async(() => {
        this.syncing = false;
      }, 300); // wait for shrink animation to finish.
    }
  };

  template.onSigninSuccess = function(e) {
    this.isAuthenticated = true;

    // Cached data? We're already using it. Bomb out before making unnecessary requests.
    if (DEBUG || !e.target.signedIn || !navigator.onLine) {
      return;
    }

    // Show visual loading indicator on first load.
    if (!this.threads || !this.threads.length) {
      this.showLoadingSpinner();
    }

    var currentUser = gapi.auth2.getAuthInstance().currentUser.get();
    var profile = currentUser.getBasicProfile();
    var coverImage = this.user && this.user.cover ? this.user.cover : null;

    template.user = {
      id: profile.getId(),
      name: profile.getName(),
      profile: profile.getImageUrl(),
      email: profile.getEmail(),
      cover: coverImage
    };

    // Note: these GMail API calls are wrapped by a promise that loads the
    // client library, once. No need to init gapi.client.
    this.refreshLabels();
    this.refreshInbox();

    GPlus.fetchFriendProfilePics().then(users => {
      // Add signed in user to list or profile pics.
      users[template.user.name] = template.user.profile;
      template.users = users;
    });
    GPlus.fetchUsersCoverImage().then(coverImg => {
      template.set('user.cover',  coverImg);
    });
  };

  template._onCachedThreadsEmpty = function(e) {
    this.isAuthenticated = false;
  };

  template.signIn = function(e) {
    document.querySelector('google-signin').signIn();
  };

  template.signOut = function(e) {
    document.querySelector('google-signin').signOut();
    localStorage.clear();
  };

  template.refreshApp = function() {
    location.reload();
  };

  template.headerClass = template._computeMainHeaderClass(template.narrow, 0);

  template.addEventListener('dom-change', e => {
    // Force binding updated when narrow has been calculated via binding.
    template.headerClass = template._computeMainHeaderClass(
        template.narrow, template.selectedThreads.length);

    var headerEl = document.querySelector('#mainheader');
    var title = document.querySelector('.title');

    template.$.drawerPanel.addEventListener('paper-header-transform', e => {

      if (!headerEl.classList.contains('tall')) {
        return;
      }

      var d = e.detail;

      // If at the top, allow swiping and pull down refresh. When scrolled, set
      // pan-y so track events don't fire in the y direction.
      //template.touchAction = d.y == 0 ? 'none' : 'pan-y';

      // d.y: the amount that the header moves up
      // d.height: the height of the header when it is at its full size
      // d.condensedHeight: the height of the header when it is condensed
      //scale header's title
      var m = d.height - d.condensedHeight;
      var scale = Math.max(0.5, (m - d.y) / (m / 0.25)  + 0.5);
      // var scale = Math.max(0.5, (m - d.y) / (m / 0.4)  + 0.5);
      Polymer.Base.transform('scale(' + scale + ') translateZ(0)', title);

      // Adjust header's color
      //document.querySelector('#mainheader').style.color = (d.y >= d.height - d.condensedHeight) ? '#fff' : '';
    });
  });

  var sw = document.querySelector('platinum-sw-register');
  sw.addEventListener('service-worker-installed', e => {
    var toast = document.querySelector('#swtoast');
    toast.show();
  });

  sw.addEventListener('service-worker-updated', e => {
    var toast = document.querySelector('#swtoast');
    toast.text = 'A new version is available. Tap to refresh';
    toast.show();
  });

  window.addEventListener('offline', () => {
    template.toggleToast('Connection is flaky. Content may be stale.');
  });

  // Log first paint.
  if (window.chrome.loadTimes) {
    var getFP = function() {
      let load = window.chrome.loadTimes();
      let fp = (load.firstPaintTime - load.startLoadTime) * 1000;
      return Math.round(fp);
    };
    window.onload = (e) => {
      let render = () => {
        let fp = getFP();
        console.info(`First paint: ${fp} ms`);
      };
      setTimeout(render, 100); // Wait a tick so we're guaranteed a fp time.
    };
  }

  // // Prevent context menu.
  // window.oncontextmenu = function() {
  //   return false;
  // };

})();
