(function() {

// var firstPaintRaf;
// requestAnimationFrame(function() {
//   firstPaintRaf = performance.now();
// });

if (window.PolymerMetrics) {
  var polyMetrics = new PolymerMetrics(template);
  window.addEventListener('load', polyMetrics.printPageMetrics);
}


var DEBUG = location.search.indexOf('debug') != -1;
var FROM_HEADER_REGEX = new RegExp(/"?(.*?)"?\s?<(.*)>/);

var Labels = {
  UNREAD: 'UNREAD',
  STARRED: 'STARRED'
};

var previouslySelected = [];


var GMail = window.GMail || {};

GMail.fetchMail = function(q, opt_callback) {
  var gmail = gapi.client.gmail.users;

  // Fetch only the emails in the user's inbox.
  gmail.threads.list({userId: 'me', q: q}).then(function(resp) {

    var threads = resp.result.threads; // template.threads = resp.result.threads;

    var batch = gapi.client.newBatch();

    threads.forEach(function(thread, i) {
      var req = gmail.threads.get({userId: 'me', 'id': thread.id});
      batch.add(req);
      req.then(function(resp) {
        thread.messages = fixUpMessages(resp).reverse();
        //thread.archived = false;

        // Set entire thread data at once, when it's all been processed.
        template.debounce('addthreads', function() {
          this.threads = threads;
          opt_callback && opt_callback(threads);
        }, 100);

      });
    });

    batch.then();

  });


};

function getValueForHeaderField(headers, field) {
  for (var i = 0, header; header = headers[i]; ++i) {
    if (header.name == field || header.name == field.toLowerCase()) {
      return header.value;
    }
  }
  return null;
}

function getAllUserProfileImages(users, nextPageToken, callback) {
  gapi.client.plus.people.list({
    userId: 'me', collection: 'visible', pageToken: nextPageToken
  }).then(function(resp) {

    users = resp.result.items.reduce(function(o, v, i) {
      o[v.displayName] = v.image.url;
      return o;
    }, users);

    if (resp.result.nextPageToken) {
      getAllUserProfileImages(users, resp.result.nextPageToken, callback);
    } else {
      callback(users);
    }

  });
}

function fixUpMessages(resp) {
  var messages = resp.result.messages;

  for (var j = 0, m; m = messages[j]; ++j) {
    var headers = m.payload.headers;

    // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> Sept 25.
    var date = new Date(getValueForHeaderField(headers, 'Date'));
    m.date = date.toDateString().split(' ').slice(1, 3).join(' ');
    m.to = getValueForHeaderField(headers, 'To');
    m.subject = getValueForHeaderField(headers, 'Subject');

    var fromHeaders = getValueForHeaderField(headers, 'From');
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

    m.unread = m.labelIds.indexOf(Labels.UNREAD) != -1;
    m.starred = m.labelIds.indexOf(Labels.STARRED) != -1;
  }

  return messages;
}

var template = document.querySelector('#t');

template._computeLoginScreenClass = function(isAuthenticated, staticClasses) {
  return (!isAuthenticated ? 'show ' : '') + staticClasses;
};

template._computeShowSpinner = function(threads, isAuthenticated) {
  return !threads.length && isAuthenticated;
};

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

template.toggleSearch = function() {
  this.$.search.toggle();
};

template.undoAll = function(e, detail, sender) {
  e.stopPropagation();

  for (var i = 0, threadEl; threadEl = previouslySelected[i]; ++i) {
    threadEl.archived = false;
  }

  previouslySelected = [];

  this.$.toast.hide();
  this.onToastOpenClose();
};

template.refreshInbox = function(opt_callback) {
  var q = 'in:inbox';

  if (opt_callback) {
    GMail.fetchMail(q, opt_callback.bind(this));
  } else {
    GMail.fetchMail(q);
  }
};

// paper-toast 1.0 doesnt have event: github.com/PolymerElements/paper-toast/issues/10
template.onToastOpenClose = function(e) {

  var opened = this.$.toast.visible;
  if (opened) {
    this.$.fab.classList.add('moveup');
    // for (var i = 0, threadEl; threadEl = previouslySelected[i]; ++i) {
    //   threadEl.undo = false; // hide in-place UNDO UI.
    // }
  } else {
    previouslySelected = [];
    this.$.fab.classList.remove('moveup');
  }
};

template.onRefreshStart = function(e, detail, sender) {
  if (this.syncing) {
    return;
  }

  var atTop = this.$.scrollheader.scroller.scrollTop == 0;

  if (atTop && e.yDirection > 0) {
    this.refreshStarted = true;

    this.$.refreshspinner.active = true;

  } else if (!this.refreshStarted)  {
    template.touchAction = 'pan-y';
  }
};

template.onMainAreaTrack = function(e, detail, sender) {
  if (this.syncing) {
    return;
  }

  var y =  Math.min(e.dy, this.MAX_REFRESH_Y);

  this.$.refreshspinner.style.opacity =
      Math.min(1, 1 - ((this.MAX_REFRESH_Y - e.dy) / this.MAX_REFRESH_Y));

  Polymer.Base.transform('translate3d(0, ' + y + 'px, 0)', this.$.refresh);

  if (!this.refreshStarted) {
    // TODO(ericbidelman): fake scrolling. We're already in a touch event, and
    // scrolling won't kick in until after the user releaes. Ask Dan about this.
    this.$.scrollheader.scroller.scrollTop = Math.abs(e.dy);
  }
};

template.onRefreshUp = function(e, detail, sender) {
  if (!this.refreshStarted || this.syncing) {
    return;
  }

  Polymer.Base.transform('', this.$.refresh);

  var threshhold = this.MAX_REFRESH_Y / 2;

  if (e.dy >= threshhold) {
    this.syncing = true;

    this.$.refreshspinner.style.opacity = 1;
    this.$.refresh.classList.add('snapback');
  } else {
    this.$.refresh.classList.add('snapback', 'tostart');
  }
};

template.onRefreshTransitionEnd = function(e, detail, sender) {
  if (!this.refreshStarted) {
    return;
  }

  this.refreshStarted = false;

  if (this.$.refresh.classList.contains('tostart')) {
    this.$.refresh.classList.remove('snapback', 'shrink', 'tostart');
    return;
  }

  this.refreshInbox(function(threads) {
    this.$.refreshspinner.active = false;
    this.$.refresh.classList.add('shrink');

    this.async(function() {
      this.$.refresh.classList.remove('snapback', 'shrink', 'tostart');
      this.$.refreshspinner.style.opacity = 0;

      this.syncing = false;
    }, null, 150);

  });
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

  this.toastMessage = this.selectedThreads.length + ' archived';

  var selectedItems = this.$.threadlist.selectedItems.slice(0);
  for (var i = 0, threadEl; threadEl = selectedItems[i]; ++i) {
    threadEl.archived = true;
    previouslySelected.push(threadEl);
  }

  this.async(function() {
    this.$.toast.show();
    this.onToastOpenClose();
  }, 1000); // delay showing the toast.
};

// TODO(ericbidelman): listenOnce is defined in core-transition
/**
 * Utility function to listen to an event on a node once.
 *
 * @method listenOnce
 * @param {Node} node The animated node
 * @param {string} event Name of an event
 * @param {Function} fn Event handler
 * @param {Array} args Additional arguments to pass to `fn`
 */
template.listenOnce = function(node, event, fn, args) {
  var self = this;
  var listener = function() {
    fn.apply(self, args);
    node.removeEventListener(event, listener, false);
  };
  node.addEventListener(event, listener, false);
};

template.onThreadArchive = function(e) {
  if (!e.detail.showUndo) {
    return;
  }

  if (!this._scrollArchiveSetup) {
    // When user scrolls page, remove visibly archived threads.
    this.listenOnce(this.$.scrollheader, 'content-scroll', function(e) {
console.log(this.selectedThreads)
      for (var i = 0, threadEl; threadEl = this.$.threadlist.items[i]; ++i) {
        if (threadEl.archived) {
          threadEl.classList.add('shrink');
          threadEl.undo = false; // hide in-place UNDO UI.
        }
      }
      this._scrollArchiveSetup = false;
    });
  }

  this._scrollArchiveSetup = true;
};

template.onSigninSuccess = function(e) {
  this.isAuthenticated = true;

  // Cached data? We're already using it. Bomb out before making unnecessary requests.
  if (DEBUG || (template.threads && template.users)) {
    return;
  }

  // var currentUser = gapi.auth2.currentUser.get();
  var currentUser = gapi.auth2.getAuthInstance().currentUser.get();
  if (e.target.signedIn) {
    var profile = currentUser.getBasicProfile();
    template.user = {
      id: profile.getId(),
      name: profile.getName(),
      profile: profile.getImageUrl(),
      email: profile.getEmail(),
    };
  }

  gapi.load('client', function() {

    gapi.client.load('gmail', 'v1').then(function() {
      var gmail = gapi.client.gmail.users;

      template.refreshInbox();

      gmail.labels.list({userId: 'me'}).then(function(resp) {
        // Don't include system labels.
        var labels = resp.result.labels.filter(function(label, i) {
          label.color = template.LABEL_COLORS[
              Math.round(Math.random() * template.LABEL_COLORS.length)];
          return label.type != 'system';
        });

        template.labels = labels;
        template.labelMap = labels.reduce(function(o, v, i) {
          o[v.id] = v;
          return o;
        }, {});

      });
    });

    gapi.client.load('plus', 'v1').then(function() {

      var users = {};

      getAllUserProfileImages(users, null, function(users) {
        template.users = users;
        template.users[template.user.name] = template.user.profile; // signed in user.
      });

      // Get user's profile pic, cover image, email, and name.
      gapi.client.plus.people.get({userId: 'me'}).then(function(resp) {
        // var PROFILE_IMAGE_SIZE = 75;
        var COVER_IMAGE_SIZE = 315;

        // var img = resp.result.image && resp.result.image.url.replace(/(.+)\?sz=\d\d/, "$1?sz=" + PROFILE_IMAGE_SIZE);
        var coverImg = resp.result.cover && resp.result.cover.coverPhoto.url.replace(/\/s\d{3}-/, "/s" + COVER_IMAGE_SIZE + "-");

        template.set('user.cover',  coverImg || null);
      });

    });

  });

};

template.onSignOutAttempt = function(e) {
  console.log('onSignOutAttempt')
};

template.onSigninFailure = function(e) {
  this.isAuthenticated = false;
};


template.onSignInAwareSignout = function(e) {
  // this.isAuthenticated = false;
};

template.onSignOut = function(e) {
// console.log('here', window.gapi)
// console.log(_onSignOutAttempt, e.target.signedIn)
  if (DEBUG) {
    return;
  }

  this.isAuthenticated = false;
};

template.DEBUG = DEBUG;
template.LABEL_COLORS = ['pink', 'orange', 'green', 'yellow', 'teal', 'purple'];
template.isAuthenticated = true; // Presume user is logged in when app loads (better UX).
template.threads = [];
template.selectedThreads = [];
template.headerTitle = 'Inbox';
template.headerClass = template._computeMainHeaderClass(template.narrow, 0);
template._scrollArchiveSetup = false; // True if the user has attempted to archive a thread.
// template.touchAction = 'none'; // Allow track events from x/y directions.

template.MAX_REFRESH_Y = 150;
template.syncing = false; // True, if the mail is syncing.
template.refreshStarted = false; // True if the pull to refresh has been enabled.

// TODO: save this from users past searches using iron-localstorage.
template.previousSearches = [
  "something fun",
  "tax forms",
  'to: me',
  'airline tickets',
  'party on saturday'
];

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

// // Prevent context menu.
// window.oncontextmenu = function() {
//   return false;
// };

if (!navigator.onLine || DEBUG) {

  document.addEventListener('WebComponentsReady', function(e) {
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
      var threads = e.detail.response;
      // for (var i = 0, thread; thread = threads[i]; ++i) {
      //   thread.archived = false;
      // }
      template.threads = threads;
    });
  });
}

// window.Polymer.dom = 'shadow';

})();

