(function() {

var DEBUG = location.search.indexOf('debug') != -1;
var FROM_HEADER_REGEX = new RegExp(/"?(.*?)"?\s?<(.*)>/);
var REFRESH_INTERVAL = 60000 // every 30 sec.

var inboxRefreshId;
var pendingArchivedThreads = [];

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
// template.touchAction = 'none'; // Allow track events from x/y directions.

// TODO: save this from users past searches using iron-localstorage.
template.previousSearches = [
  "fake search",
  "tax forms",
  'to: me',
  'airline tickets',
  'party on saturday'
];


// var firstPaintRaf;
// requestAnimationFrame(function() {
//   firstPaintRaf = performance.now();
// });

// if (window.PolymerMetrics) {
//   var polyMetrics = new PolymerMetrics(template);
//   window.addEventListener('load', polyMetrics.printPageMetrics);
// }

// Conditionally load webcomponents polyfill (if needed).
var webComponentsSupported = ('registerElement' in document
    && 'import' in document.createElement('link')
    && 'content' in document.createElement('template'));

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
    // Auto binding template doesn't stamp with async import
    // Remove when github.com/Polymer/polymer/issues/1968 is fixed.
    template._readySelf();

    var loadContainer = document.getElementById('loading');
    loadContainer.addEventListener('transitionend', function() {
      loadContainer.parentNode.removeChild(loadContainer); // IE 10 doesn't support el.remove()

      loadData();
    });

    document.body.classList.remove('loading');
  };

  // crbug.com/504944 - readyState never goes to complete in Chrome
  // crbug.com/505279 - Resource Timing API is also not viable atm.
  var link = document.querySelector('#bundle');
  if (link.import && link.import.readyState === 'complete') {
    onImportLoaded();
  } else {
    link.addEventListener('load', onImportLoaded);
  }
}

/**
 * Loads sample data if in debug mode.
 *
 * @method loadData
 */
function loadData() {
  if (DEBUG) {
    var ajax = document.createElement('iron-ajax');
    ajax.auto = true;
    ajax.url = '/data/users.json';
    ajax.addEventListener('response', function(e) {
      template.users = e.detail.response;
    });

    var ajax2 = document.createElement('iron-ajax');
    ajax2.auto = true;
    ajax2.url = '/data/threads.json';
    ajax2.addEventListener('response', function(e) {
      template.threads = e.detail.response;
    });

    return;
  }

  if (!navigator.onLine) {
    template.async(function() {
      this.toggleToast('Connection is flaky. Content may be stale.');
    }, 1000);
  }
}

/**
 * Utility function to listen to an event on a node once.
 *
 * @method listenOnce
 * @param {Node} node The animated node
 * @param {string} event Name of an event
 * @param {Function} fn Event handler
 * @param {Array} args Additional arguments to pass to `fn`
 */
function listenOnce(node, event, fn, args) {
  var self = this;
  var listener = function() {
    fn.apply(self, args);
    node.removeEventListener(event, listener, false);
  };
  node.addEventListener(event, listener, false);
}

function GMailErrorCallback(e) {
  if (e.status === 401) {
    template.isAuthenticated = false;
  } else {
    console.error(e);
  }
}

var GMail = window.GMail || {
  _loadedPromise: null,

  // True if the GMail API lib is loaded.
  get loaded() {
    return !!(window.gapi && gapi.client && gapi.client.gmail);
  },

  Labels: {
    Colors: ['pink', 'orange', 'green', 'yellow', 'teal', 'purple'],
    UNREAD: 'UNREAD',
    STARRED: 'STARRED'
  }
};

GMail._getValueForHeaderField = function(headers, field) {
  for (var i = 0, header; header = headers[i]; ++i) {
    if (header.name == field || header.name == field.toLowerCase()) {
      return header.value;
    }
  }
  return null;
};

// Returns true if date1 is the same day as date2.
GMail._isToday = function(date1, date2) {
 return date1.getDate() === date2.getDate() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getFullYear() === date2.getFullYear();
};

GMail._fixUpMessages = function(resp) {
  var messages = resp.result.messages;

  for (var j = 0, m; m = messages[j]; ++j) {
    var headers = m.payload.headers;

    var date = new Date(GMail._getValueForHeaderField(headers, 'Date'));

    var isToday = GMail._isToday(new Date(), date);
    if (isToday) {
      // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> 14:43:18.
      m.date = date.toLocaleTimeString().replace(/(\d{1,2}:\d{1,2}):\d{1,2}\s(AM|PM)/, '$1 $2');
    } else {
      // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> Sept 25.
      m.date = date.toDateString().split(' ').slice(1, 3).join(' ');
    }

    m.to = GMail._getValueForHeaderField(headers, 'To');
    m.subject = GMail._getValueForHeaderField(headers, 'Subject');

    var fromHeaders = GMail._getValueForHeaderField(headers, 'From');
    var fromHeaderMatches = fromHeaders.match(FROM_HEADER_REGEX);

    m.from = {};

    // Use name if one was found. Otherwise, use email address.
    if (fromHeaderMatches) {
      // If no a name, use email address for displayName.
      m.from.name = fromHeaderMatches[1].length ? fromHeaderMatches[1] :
                                                  fromHeaderMatches[2];
      m.from.email = fromHeaderMatches[2];
    } else {
      m.from.name = fromHeaders.split('@')[0];
      m.from.email = fromHeaders;
    }
    m.from.name = m.from.name.split('@')[0]; // Ensure email is split.

    m.unread = m.labelIds ? m.labelIds.indexOf(this.Labels.UNREAD) != -1 : false;
    m.starred = m.labelIds ? m.labelIds.indexOf(this.Labels.STARRED) != -1 : false;
  }

  return messages;
};

// Loads the gapi client and gmail API. Ensures they'res loaded from network only once.
GMail.init = function() {
  // Return the API if it's already loaded.
  if (this.loaded) {
    return Promise.resolve(gapi.client.gmail);
  }

  // Ensure we only load the client lib once. Subscribers will race for it.
  if (!this._loadedPromise) {
    this._loadedPromise = new Promise(function(resolve, reject) {
      gapi.load('client', function() {
        gapi.client.load('gmail', 'v1').then(function() {
          resolve(gapi.client.gmail);
        });
      });
    });
  }

  return this._loadedPromise;
};

GMail.fetchLabels = function() {
  return this.init().then(function(gmail) {
    var fetchLabels = gapi.client.gmail.users.labels.list({userId: 'me'});
    return fetchLabels.then(function(resp) {
      var labels = resp.result.labels.filter(function(label, i) {
        // Add color to label.
        label.color = GMail.Labels.Colors[i % GMail.Labels.Colors.length];
        return label.type !== 'system'; // Don't include system labels.
      });

      var labelMap = labels.reduce(function(o, v, i) {
        o[v.id] = v;
        return o;
      }, {});

      return {labels: labels, labelMap: labelMap};
    });
  });

};

GMail.fetchMail = function(q) {
  return this.init().then(function(gmail) {
     // Fetch only the emails in the user's inbox.
    var fetchThreads = gmail.users.threads.list({userId: 'me', q: q});
    return fetchThreads.then(function(resp) {

      var batch = gapi.client.newBatch();
      var threads = resp.result.threads;

      if (!threads) {
        return [];
      }

      // Setup a batch operation to fetch all messages for each thread.
      for (var i = 0, thread; thread = threads[i]; ++i) {
        var req = gmail.users.threads.get({userId: 'me', 'id': thread.id});
        batch.add(req, {id: thread.id}); // Give each request a unique id for lookup later.
      }

      // Like Promise.all, but resp is an object instead of promise results.
      return batch.then(function(resp) {
        for (var i = 0, thread; thread = threads[i]; ++i) {
          thread.messages = GMail._fixUpMessages(resp.result[thread.id]).reverse();
          //thread.archived = false; // initialize archived.
        }
        return threads;
      });

    });
  });
};

// GMail.fetchHistoryUpdates = function(threads) {
//   if (!threads.length) {
//     return;
//   }

//   gapi.client.gmail.users.history.list({
//     userId: 'me',
//     startHistoryId: threads[0].historyId
//     //pageToken: nextPageToken
//   }).then(function(resp) {
//     // if (resp.result.nextPageToken) {
//     //   GMail.fetchHistoryUpdates(threads, resp.result.nextPageToken, callback);
//     // }
// console.log(resp)
//     // if (resp.result.history) {
//     //   console.log(resp.result.history)
//     // }
//   }, function(e) {
//     if (e.status === 404) {
//       // TODO: historyId has expired, do full refresh.
//     }
//   });
// };

var GPlus = window.GPlus || {
  _loadedPromise: null,

  // True if the GPlus API lib is loaded.
  get loaded() {
    return !!(window.gapi && gapi.client && gapi.client.plus);
  },

  COVER_IMAGE_SIZE: 315
};


// Loads the gplus API. Ensures they'res loaded from network only once.
GPlus.init = function() {
  // Return the API if it's already loaded.
  if (this.loaded) {
    return Promise.resolve(gapi.client.plus);
  }

  // Ensure we only load the client lib once. Subscribers will race for it.
  if (!this._loadedPromise) {
    this._loadedPromise = new Promise(function(resolve, reject) {
      gapi.load('client', function() {
        gapi.client.load('plus', 'v1').then(function() {
          resolve(gapi.client.plus);
        });
      });
    });
  }

  return this._loadedPromise;
};

GPlus._getAllUserProfileImages = function(users, nextPageToken, callback) {
  gapi.client.plus.people.list({
    userId: 'me', collection: 'visible', pageToken: nextPageToken
  }).then(function(resp) {

    // Map name to profile image.
    users = resp.result.items.reduce(function(o, v, i) {
      o[v.displayName] = v.image.url;
      return o;
    }, users);

    if (resp.result.nextPageToken) {
      GPlus._getAllUserProfileImages(users, resp.result.nextPageToken, callback);
    } else {
      callback(users);
    }

  });
};

GPlus.fetchFriendProfilePics = function() {
  var users = {};
  return this.init().then(function(plus) {
    return new Promise(function(resolve, reject) {
      this._getAllUserProfileImages(users, null, resolve);
    }.bind(this));
  }.bind(this));
}

GPlus.fetchUsersCoverImage = function() {
  return this.init().then(function(plus) {
    // Get user's profile pic, cover image, email, and name.
    return gapi.client.plus.people.get({userId: 'me'}).then(function(resp) {
      // var PROFILE_IMAGE_SIZE = 75;
      // var img = resp.result.image && resp.result.image.url.replace(/(.+)\?sz=\d\d/, "$1?sz=" + PROFILE_IMAGE_SIZE);

      var coverImg = resp.result.cover && resp.result.cover.coverPhoto.url.replace(/\/s\d{3}-/, "/s" + this.COVER_IMAGE_SIZE + "-");

      return coverImg || null;
    }.bind(this));
  }.bind(this));
};

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
  this.headerClass = this._computeMainHeaderClass(this.narrow, this.selectedThreads.length);
}

template._onThreadTap = function(e) {
  e.stopPropagation();
  var idx = this.$.threadlist.items.indexOf(e.detail.thread);
  this.$.threadlist.select(idx);
};

template.onArchivedToastOpenClose = function() {
  if (this.$.arhivedtoast.visible) {
    this.$.fab.classList.add('moveup');
    // for (var i = 0, threadEl; threadEl = pendingArchivedThreads[i]; ++i) {
    //   threadEl.undo = false; // hide in-place UNDO UI.
    // }
  } else {
    // When the archived message toast closes, the user can no longer undo.
    // Remove the threads.
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
};

template.toggleSearch = function() {
  this.$.search.toggle();
};

template.toggleToast = function(opt_messsage) {
  var toast = opt_messsage ? this.$.toast : this.$.arhivedtoast;
  if (opt_messsage) {
    toast.text = opt_messsage;
  }
  toast.toggle();
  this.onArchivedToastOpenClose(); // Move FAB at same time as
}


template.undoAll = function(e, detail, sender) {
  e.stopPropagation();

  for (var i = 0, threadEl; threadEl = pendingArchivedThreads[i]; ++i) {
    threadEl.archived = false;
    threadEl.removed = false;
  }

  pendingArchivedThreads = [];

  this.toggleToast();
};

template.refreshLabels = function() {
  return GMail.fetchLabels().then(function(labels) {
    template.labels = labels.labels;
    template.labelMap = labels.labelMap;
  }, GMailErrorCallback);
};

template.refreshInbox = function(opt_query) {
  clearInterval(inboxRefreshId);

  var query = opt_query || 'in:inbox';

  return GMail.fetchMail(query).then(function(threads) {
    template.hideLoadingSpinner();
    template.threads = threads;

    // TODO: use gmail's push api: http://googleappsdeveloper.blogspot.com/2015/05/gmail-api-push-notifications-dont-call.html
    // Setup auto-fresh if we're querying the inbox.
    if (!opt_query) {
      inboxRefreshId = setInterval(template.refreshInbox.bind(template), REFRESH_INTERVAL);
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
  for (var i = 0, threadEl; threadEl = selectedItems[i]; ++i) {
    threadEl.archived = true;
    pendingArchivedThreads.push(threadEl);
  }

  this.async(function() {
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
    listenOnce(this.$.scrollheader, 'content-scroll', function(e) {

      var archivedThreads = this.$.threadlist.items.filter(function(threadEl) {
        return threadEl.archived;
      });

console.log(archivedThreads.length);

      var shrinkThreads = function() {
        return new Promise(function(resolve, reject) {
          for (var i = 0, threadEl; threadEl = archivedThreads[i]; ++i) {
            threadEl.classList.add('shrink');
            threadEl.undo = false; // hide in-place UNDO UI.
          }
          template.async(function() {
            resolve();
          }, 300); // Wait for shrink animations to finish.
        });
      };

//TODO: this changes the indices of the array and removeThread expects
// threadEl.dataset.threadIndex ordering.
// It leaves some threads in an archived state.
      shrinkThreads().then(function() {
        archivedThreads.map(template.removeThread, template);
      });

      this._scrollArchiveSetup = false;
    }.bind(this));
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
  this.async(function() {
    var el = document.querySelector('#refresh-spinner-container');
    el.classList.remove('shrink');
  }, 50);
};

template.hideLoadingSpinner = function() {
  var el = document.querySelector('#refresh-spinner-container');
  if (el) {
    el.classList.add('shrink');
    this.async(function() {
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

  GPlus.fetchFriendProfilePics().then(function(users) {
    // Add signed in user to list or profile pics.
    users[template.user.name] = template.user.profile;
    template.users = users;
  });
  GPlus.fetchUsersCoverImage().then(function(coverImg) {
    template.set('user.cover',  coverImg);
  });
};

template.onCachedThreadsEmpty = function(e) {
  this.isAuthenticated = false;
};

template.signIn = function(e) {
  document.querySelector('google-signin').signIn();
};

template.signOut = function(e) {
  document.querySelector('google-signin').signOut();
  localStorage.clear();
};

template.headerClass = template._computeMainHeaderClass(template.narrow, 0);

template.addEventListener('dom-change', function(e) {
  // Force binding updated when narrow has been calculated via binding.
  this.headerClass = this._computeMainHeaderClass(this.narrow, this.selectedThreads.length);

  var headerEl = document.querySelector('#mainheader');
  var title = document.querySelector('.title');

  this.$.drawerPanel.addEventListener('paper-header-transform', function(e) {

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
sw.addEventListener('service-worker-installed', function(e) {
  var toast = document.querySelector('#swtoast');
  toast.show();
});

// // Prevent context menu.
// window.oncontextmenu = function() {
//   return false;
// };

})();
